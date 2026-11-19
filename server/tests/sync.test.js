import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import { decryptCredentials, encryptCredentials, isEncryptionConfigured, maskKey } from '../src/utils/secrets.js'
import { classifyBinanceError, createBinanceClient, fetchFills, fetchIncome } from '../src/services/sync/binance.client.js'
import {
    applyActivity, currentAmounts, dehydrateTracks, fundingFrom, hydrateTracks, mapPositions,
    rebuildDailyBalances, tradedSymbols, transfersFrom, walletFigures,
} from '../src/services/sync/binance.mapper.js'
import { binanceAdapter, KeyRejectedError } from '../src/services/sync/binance.adapter.js'
import { BinanceError } from '../src/services/sync/binance.client.js'
import { backoffDelay, describeFailure } from '../src/services/sync/sync.service.js'
import { accountFigures, snapshotSeries, toAccountDTO } from '../src/services/account.service.js'

const D = v => new Prisma.Decimal(v)
const num = d => Number(d)

// --- Encryption (D-67) ---

describe('broker key encryption', () => {
    const original = process.env.ENCRYPTION_KEY
    beforeEach(() => { process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64') })
    afterEach(() => { process.env.ENCRYPTION_KEY = original })

    it('round-trips and never stores the plaintext', () => {
        const secret = { apiKey: 'K'.repeat(64), apiSecret: 'S'.repeat(64) }
        const stored = encryptCredentials(secret, 'account-1')
        expect(stored.startsWith('v1:')).toBe(true)
        expect(stored).not.toContain('KKKK')
        expect(decryptCredentials(stored, 'account-1')).toEqual(secret)
    })

    it('uses a fresh IV each time', () => {
        expect(encryptCredentials({ a: 1 }, 'x')).not.toBe(encryptCredentials({ a: 1 }, 'x'))
    })

    it("won't decrypt on another account's row, after tampering, or with another key", () => {
        const stored = encryptCredentials({ apiKey: 'k' }, 'account-1')
        expect(() => decryptCredentials(stored, 'account-2')).toThrow()
        const parts = stored.split(':')
        parts[3] = Buffer.from('tampered').toString('base64')
        expect(() => decryptCredentials(parts.join(':'), 'account-1')).toThrow()
        process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64')
        expect(() => decryptCredentials(stored, 'account-1')).toThrow()
    })

    it('needs a 32-byte key', () => {
        process.env.ENCRYPTION_KEY = Buffer.from('short').toString('base64')
        expect(isEncryptionConfigured()).toBe(false)
        delete process.env.ENCRYPTION_KEY
        expect(isEncryptionConfigured()).toBe(false)
        expect(() => encryptCredentials({}, 'x')).toThrow(/ENCRYPTION_KEY/)
    })

    it('masks keys to the last 4 characters', () => {
        expect(maskKey('abcdefgh1234')).toBe('••••1234')
    })
})

// --- Binance client ---

function fakeResponse(body, { status = 200, weight = 10 } = {}){
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: name => (name.toLowerCase() === 'x-mbx-used-weight-1m' ? String(weight) : null) },
        text: async () => JSON.stringify(body),
    }
}

describe('Binance client', () => {
    it('signs requests with HMAC-SHA256 using the server clock', async () => {
        const calls = []
        const fetchImpl = async (url, init) => {
            calls.push({ url: new URL(url), init })
            if(url.includes('/fapi/v1/time')) return fakeResponse({ serverTime: 1_000_500 })
            return fakeResponse({ assets: [] })
        }
        const client = createBinanceClient({ apiKey: 'KEY', apiSecret: 'SECRET' }, { fetchImpl, now: () => 1_000_000 })
        await client.account()

        const signed = calls[1]
        expect(signed.url.pathname).toBe('/fapi/v3/account')
        expect(signed.init.headers['X-MBX-APIKEY']).toBe('KEY')
        const params = signed.url.searchParams
        expect(params.get('timestamp')).toBe('1000500') // our clock + Binance's 500 ms lead
        const signature = params.get('signature')
        params.delete('signature')
        expect(signature).toBe(crypto.createHmac('sha256', 'SECRET').update(params.toString()).digest('hex'))
    })

    it('pauses when the minute weight is nearly used up', async () => {
        const sleep = vi.fn(async () => {})
        const fetchImpl = async url => url.includes('/time') ? fakeResponse({ serverTime: 0 }) : fakeResponse({}, { weight: 1900 })
        const client = createBinanceClient({ apiKey: 'k', apiSecret: 's' }, { fetchImpl, now: () => 30_000, sleep })
        await client.positions()
        expect(sleep).toHaveBeenCalledWith(31_000)
    })

    it('classifies errors by what the sync should do', () => {
        expect(classifyBinanceError(401, { code: -2015, msg: 'Invalid API-key, IP, or permissions for action.' }).kind).toBe('AUTH')
        expect(classifyBinanceError(400, { code: -1022, msg: 'Signature for this request is not valid.' }).kind).toBe('AUTH')
        expect(classifyBinanceError(451, { msg: 'Service unavailable from a restricted location' }).kind).toBe('LOCATION')
        expect(classifyBinanceError(429, { code: -1003 }).kind).toBe('RATE_LIMIT')
        expect(classifyBinanceError(418, {}).kind).toBe('RATE_LIMIT')
        expect(classifyBinanceError(400, { code: -1121, msg: 'Invalid symbol.' })).toMatchObject({ kind: 'OTHER', message: 'Invalid symbol.' })
    })

    it('turns network failures into NETWORK errors', async () => {
        const client = createBinanceClient({ apiKey: 'k', apiSecret: 's' }, { fetchImpl: async () => { throw new Error('ECONNRESET') } })
        await expect(client.account()).rejects.toMatchObject({ kind: 'NETWORK' })
    })

    it('reads history in 7-day windows and pages through full windows', async () => {
        const WEEK = 7 * 24 * 3600e3
        const requested = []
        // 1000 rows in the first week (a full page), then 1 more on the second page.
        const rows = [...Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, time: 100 + i })), { id: 1001, time: 2000 }]
        const client = {
            userTrades: async (symbol, start, end) => {
                requested.push([start, end])
                return rows.filter(r => r.time >= start && r.time <= end).slice(0, 1000)
            },
        }
        const result = await fetchFills(client, 'BTCUSDT', 0, WEEK + 10)
        expect(result).toHaveLength(1001)
        expect(new Set(result.map(r => r.id)).size).toBe(1001) // the overlap row isn't doubled
        expect(requested[0]).toEqual([0, WEEK - 1])
        expect(requested[1][0]).toBe(1099) // second page starts at the last row's time
        expect(requested.at(-1)).toEqual([WEEK, WEEK + 10])
    })

    it('keys income by type and transaction id', async () => {
        const client = { income: async () => [{ incomeType: 'COMMISSION', tranId: 1, time: 1 }, { incomeType: 'REALIZED_PNL', tranId: 1, time: 1 }] }
        expect(await fetchIncome(client, 0, 10)).toHaveLength(2)
    })
})

// --- Mapping ---

let nextId = 1
const fill = (symbol, side, qty, price, time, extra = {}) => ({
    id: nextId++, symbol, side, qty: String(qty), price: String(price), time,
    realizedPnl: '0', commission: '0', commissionAsset: 'USDT', positionSide: 'BOTH', ...extra,
})

describe('wallet and positions', () => {
    it('counts USDT and USDC as USD and ignores other margin assets', () => {
        const figures = walletFigures({ assets: [
            { asset: 'USDT', walletBalance: '1000.5', unrealizedProfit: '-20.25' },
            { asset: 'USDC', walletBalance: '200', unrealizedProfit: '5' },
            { asset: 'BNB', walletBalance: '3', unrealizedProfit: '0' },
        ] })
        expect(num(figures.balance)).toBe(1200.5)
        expect(num(figures.floating)).toBe(-15.25)
    })

    it('maps open positions with direction, size and the trip start', () => {
        const rows = [
            { symbol: 'BTCUSDT', positionSide: 'BOTH', positionAmt: '-0.5', entryPrice: '60000', markPrice: '59000', unRealizedProfit: '500' },
            { symbol: 'ETHUSDT', positionSide: 'BOTH', positionAmt: '0', entryPrice: '0', markPrice: '3000', unRealizedProfit: '0' },
        ]
        const tracks = { 'BTCUSDT|BOTH': { pos: D(-0.5), trip: { openedAt: 1700000000000 } } }
        const [btc, ...rest] = mapPositions(rows, tracks)
        expect(rest).toHaveLength(0)
        expect(btc).toMatchObject({ symbol: 'BTCUSDT', direction: 'SHORT', currency: 'USD', openedAt: new Date(1700000000000) })
        expect(num(btc.quantity)).toBe(0.5)
        expect(num(btc.unrealizedPnlUsd)).toBe(500)
        expect(currentAmounts(rows).get('BTCUSDT|BOTH').toString()).toBe('-0.5')
    })
})

describe('round trips (D-60, D-61)', () => {
    const run = (fills, { funding = [], current = new Map(), tracks = {} } = {}) => {
        const result = applyActivity(tracks, { fills, funding, current })
        return { ...result, tracks }
    }

    it('builds one trade from scaling in and out, net of commission', () => {
        const { trades, tracks } = run([
            fill('BTCUSDT', 'BUY', 1, 100, 1000, { commission: '0.1' }),
            fill('BTCUSDT', 'BUY', 1, 110, 2000, { commission: '0.1' }),
            fill('BTCUSDT', 'SELL', 0.5, 120, 3000, { commission: '0.05', realizedPnl: '7.5' }),
            fill('BTCUSDT', 'SELL', 1.5, 130, 4000, { commission: '0.15', realizedPnl: '37.5' }),
        ])
        expect(trades).toHaveLength(1)
        const [t] = trades
        expect(t).toMatchObject({ symbol: 'BTCUSDT', direction: 'LONG', openedAt: new Date(1000), closedAt: new Date(4000) })
        expect(t.externalId).toMatch(/^BTCUSDT:BOTH:\d+$/)
        expect(num(t.lotSize)).toBe(2)
        expect(num(t.entryPrice)).toBe(105)
        expect(num(t.exitPrice)).toBe(127.5)
        expect(num(t.fees)).toBe(0.4)
        expect(num(t.pnl)).toBe(44.6) // 45 realised - 0.4 commission
        expect(dehydrateTracks(tracks)).toEqual({}) // flat: nothing to remember
    })

    it('splits a fill that flips the position', () => {
        const { trades, tracks } = run([
            fill('ETHUSDT', 'BUY', 1, 100, 1000, { commission: '0.1' }),
            fill('ETHUSDT', 'SELL', 3, 110, 2000, { commission: '0.3', realizedPnl: '10' }),
        ], { current: new Map([['ETHUSDT|BOTH', D(-2)]]) })
        expect(trades).toHaveLength(1)
        expect(trades[0]).toMatchObject({ direction: 'LONG' })
        expect(num(trades[0].pnl)).toBe(9.8) // 10 - 0.1 open - 0.1 (a third of the flip's commission)
        const open = tracks['ETHUSDT|BOTH']
        expect(open.pos.toString()).toBe('-2')
        expect(open.trip).toMatchObject({ direction: 'SHORT', openedAt: 2000 })
        expect(num(open.trip.commission)).toBe(0.2)
        expect(num(open.trip.openNotional)).toBe(220)
    })

    it('adds funding to the open trip, signed as Binance gives it', () => {
        const { trades } = run([
            fill('SOLUSDT', 'SELL', 10, 50, 1000),
            fill('SOLUSDT', 'BUY', 10, 45, 9000, { realizedPnl: '50' }),
        ], { funding: fundingFrom([
            { incomeType: 'FUNDING_FEE', symbol: 'SOLUSDT', asset: 'USDT', income: '-1.5', time: 5000 },
            { incomeType: 'FUNDING_FEE', symbol: 'SOLUSDT', asset: 'USDT', income: '0.5', time: 6000 },
            { incomeType: 'FUNDING_FEE', symbol: 'SOLUSDT', asset: 'USDT', income: '-9', time: 99999 }, // after close: no trip
        ]) })
        expect(trades[0].direction).toBe('SHORT')
        expect(num(trades[0].pnl)).toBe(49)
        expect(num(trades[0].fees)).toBe(1)
    })

    it('skips a position that opened before the import window', () => {
        // Binance shows 0 now; the fills only close 2 of a 2-lot long opened earlier,
        // then a full trip follows.
        const { trades } = run([
            fill('BTCUSDT', 'SELL', 2, 100, 1000, { realizedPnl: '30' }),
            fill('BTCUSDT', 'BUY', 1, 90, 2000),
            fill('BTCUSDT', 'SELL', 1, 95, 3000, { realizedPnl: '5' }),
        ])
        expect(trades).toHaveLength(1)
        expect(num(trades[0].entryPrice)).toBe(90)
    })

    it('ignores commission paid in assets other than USDT and USDC', () => {
        const { trades } = run([
            fill('XRPUSDT', 'BUY', 100, 1, 1000, { commission: '0.01', commissionAsset: 'BNB' }),
            fill('XRPUSDT', 'SELL', 100, 1.1, 2000, { commission: '0.01', commissionAsset: 'BNB', realizedPnl: '10' }),
        ])
        expect(num(trades[0].fees)).toBe(0)
        expect(num(trades[0].pnl)).toBe(10)
    })

    it('tracks hedge-mode sides separately', () => {
        const { trades, tracks } = run([
            fill('BTCUSDT', 'BUY', 1, 100, 1000, { positionSide: 'LONG' }),
            fill('BTCUSDT', 'SELL', 1, 101, 1500, { positionSide: 'SHORT' }),
            fill('BTCUSDT', 'SELL', 1, 110, 2000, { positionSide: 'LONG', realizedPnl: '10' }),
        ], { current: new Map([['BTCUSDT|SHORT', D(-1)]]) })
        expect(trades).toHaveLength(1)
        expect(trades[0].externalId).toMatch(/^BTCUSDT:LONG:/)
        expect(tracks['BTCUSDT|SHORT'].trip.direction).toBe('SHORT')
    })

    it('carries an open trip across syncs through the saved cursor', () => {
        const first = run([fill('BTCUSDT', 'BUY', 1, 100, 1000, { commission: '0.1' })], { current: new Map([['BTCUSDT|BOTH', D(1)]]) })
        const saved = JSON.parse(JSON.stringify(dehydrateTracks(first.tracks)))
        const second = run([fill('BTCUSDT', 'SELL', 1, 120, 5000, { commission: '0.1', realizedPnl: '20' })], { tracks: hydrateTracks(saved) })
        expect(second.trades).toHaveLength(1)
        expect(num(second.trades[0].pnl)).toBe(19.8)
        expect(num(second.trades[0].entryPrice)).toBe(100)
    })

    it('resets a track that disagrees with Binance instead of saving a wrong trade', () => {
        const tracks = hydrateTracks({ 'BTCUSDT|BOTH': { pos: '1', trip: null } })
        const { mismatches } = run([], { tracks, current: new Map([['BTCUSDT|BOTH', D(3)]]) })
        expect(mismatches).toEqual(['BTCUSDT|BOTH'])
        expect(tracks['BTCUSDT|BOTH'].pos.toString()).toBe('3')
    })
})

describe('income', () => {
    const income = [
        { incomeType: 'TRANSFER', asset: 'USDT', income: '500', time: 1000, tranId: 11, symbol: '' },
        { incomeType: 'TRANSFER', asset: 'USDT', income: '-200', time: 2000, tranId: 12, symbol: '' },
        { incomeType: 'TRANSFER', asset: 'BNB', income: '1', time: 2500, tranId: 13, symbol: '' },
        { incomeType: 'COMMISSION', asset: 'USDT', income: '-1', time: 3000, tranId: 14, symbol: 'BTCUSDT' },
        { incomeType: 'REALIZED_PNL', asset: 'USDT', income: '20', time: 3500, tranId: 15, symbol: 'ETHUSDT' },
        { incomeType: 'COMMISSION', asset: 'USDT', income: '-1', time: 1500, tranId: 16, symbol: 'BTCUSDT' },
    ]

    it('turns transfers into deposits and withdrawals', () => {
        const cash = transfersFrom(income)
        expect(cash.map(c => [c.externalId, c.type, num(c.amount)])).toEqual([
            ['TRANSFER:11', 'DEPOSIT', 500],
            ['TRANSFER:12', 'WITHDRAWAL', -200],
        ])
    })

    it('lists traded symbols with their earliest time', () => {
        expect(Object.fromEntries(tradedSymbols(income))).toEqual({ BTCUSDT: 1500, ETHUSDT: 3500 })
    })

    it('rebuilds daily balances backwards from today', () => {
        const DAY = 24 * 3600e3
        const rows = [
            { asset: 'USDT', income: '100', time: 0.5 * DAY },   // day 0
            { asset: 'USDT', income: '-30', time: 1.5 * DAY },   // day 1
            { asset: 'USDT', income: '10', time: 2.2 * DAY },    // today
            { asset: 'BNB', income: '999', time: 1.6 * DAY },    // not valued
        ]
        const { days, opening } = rebuildDailyBalances(D(1080), rows, 0.25 * DAY, 2.5 * DAY)
        // End of day 0: 1080 - 10 + 30 = 1100. End of day 1: 1080 - 10 = 1070. Today isn't rebuilt.
        expect(days.map(d => [d.date, num(d.balanceUsd)])).toEqual([['1970-01-01', 1100], ['1970-01-02', 1070]])
        expect(days[0].takenAt).toEqual(new Date(DAY - 1))
        expect(num(opening)).toBe(1000)
    })
})

// --- Adapter ---

function fakeClient(overrides = {}){
    return {
        apiRestrictions: async () => ({ enableReading: true }),
        account: async () => ({ assets: [{ asset: 'USDT', walletBalance: '1000', unrealizedProfit: '12' }] }),
        positions: async () => [],
        income: async () => [],
        userTrades: async () => [],
        ...overrides,
    }
}

describe('Binance adapter', () => {
    const keys = { apiKey: 'a'.repeat(64), apiSecret: 'b'.repeat(64) }
    const verifyWith = client => binanceAdapter.verify(keys, { createClient: () => client })

    it('accepts a read-only key and returns a masked hint', async () => {
        await expect(verifyWith(fakeClient())).resolves.toEqual({ hint: '••••aaaa' })
    })

    it('refuses keys that can trade, transfer or withdraw (D-15)', async () => {
        const client = fakeClient({ apiRestrictions: async () => ({ enableReading: true, enableFutures: true, enableWithdrawals: true }) })
        await expect(verifyWith(client)).rejects.toThrow(/can trade futures and withdraw/)
        await expect(verifyWith(client)).rejects.toBeInstanceOf(KeyRejectedError)
    })

    it('refuses a key without reading', async () => {
        await expect(verifyWith(fakeClient({ apiRestrictions: async () => ({ enableReading: false }) }))).rejects.toThrow(/Enable Reading/)
    })

    it('explains a rejected key and refused futures data', async () => {
        const auth = new BinanceError('Invalid API-key', { kind: 'AUTH' })
        await expect(verifyWith(fakeClient({ apiRestrictions: async () => { throw auth } }))).rejects.toThrow(/rejected this key/)
        await expect(verifyWith(fakeClient({ account: async () => { throw auth } }))).rejects.toThrow(/refused its futures data/)
    })

    it('passes on location and network problems as they are', async () => {
        const location = new BinanceError('restricted location', { kind: 'LOCATION' })
        await expect(verifyWith(fakeClient({ apiRestrictions: async () => { throw location } }))).rejects.toBe(location)
    })

    it('imports the window on the first sync, then only what is new', async () => {
        const DAY = 24 * 3600e3
        const now = 100 * DAY
        const t = now - 2 * DAY
        const income = [
            { incomeType: 'TRANSFER', asset: 'USDT', income: '900', time: t - DAY, tranId: 1, symbol: '' },
            { incomeType: 'COMMISSION', asset: 'USDT', income: '-0.1', time: t, tranId: 2, symbol: 'BTCUSDT' },
            { incomeType: 'REALIZED_PNL', asset: 'USDT', income: '20', time: t + 1000, tranId: 3, symbol: 'BTCUSDT' },
            { incomeType: 'COMMISSION', asset: 'USDT', income: '-0.1', time: t + 1000, tranId: 4, symbol: 'BTCUSDT' },
        ]
        const fills = [
            { id: 10, symbol: 'BTCUSDT', side: 'BUY', qty: '1', price: '100', time: t, realizedPnl: '0', commission: '0.1', commissionAsset: 'USDT', positionSide: 'BOTH' },
            { id: 11, symbol: 'BTCUSDT', side: 'SELL', qty: '1', price: '120', time: t + 1000, realizedPnl: '20', commission: '0.1', commissionAsset: 'USDT', positionSide: 'BOTH' },
        ]
        const userTrades = vi.fn(async (symbol, start, end) => fills.filter(f => f.symbol === symbol && f.time >= start && f.time <= end))
        const client = fakeClient({
            account: async () => ({ assets: [{ asset: 'USDT', walletBalance: '919.8', unrealizedProfit: '0' }] }),
            income: async (start, end) => income.filter(r => r.time >= start && r.time <= end),
            userTrades,
        })
        const deps = { createClient: () => client }

        const first = await binanceAdapter.sync({ credentials: keys, cursor: null, now }, deps)
        expect(first.trades).toHaveLength(1)
        expect(num(first.trades[0].pnl)).toBe(19.8)
        expect(first.cash).toHaveLength(1)
        expect(num(first.opening.balance)).toBe(0) // 919.8 - 900 - 20 + 0.2
        expect(first.history.length).toBe(88)
        expect(num(first.history.at(-1).balanceUsd)).toBe(919.8)
        expect(num(first.balance)).toBe(919.8)

        // Same records again on the next sync (Binance's overlap): nothing new.
        const cursor = JSON.parse(JSON.stringify(first.cursor))
        const second = await binanceAdapter.sync({ credentials: keys, cursor, now: now + 600e3 }, deps)
        expect(second.trades).toHaveLength(0)
        expect(second.cash).toHaveLength(0)
        expect(second.history).toBeNull()
        expect(second.opening).toBeNull()
    })
})

// --- Sync service and figures ---

describe('sync failures (D-65)', () => {
    it('stops on a rejected key and retries other problems', () => {
        expect(describeFailure({ kind: 'AUTH' }).status).toBe('RECONNECT')
        expect(describeFailure({ kind: 'CREDENTIALS' }).status).toBe('RECONNECT')
        expect(describeFailure({ kind: 'LOCATION' })).toMatchObject({ status: 'ERROR', message: expect.stringMatching(/region/) })
        expect(describeFailure({ kind: 'NETWORK', message: "Couldn't reach Binance (timed out)." }).message).toMatch(/retry/)
        expect(describeFailure(new Error('boom')).message).toBe('Sync failed: boom')
    })

    it('backs off from 10 minutes, doubling, up to 6 hours', () => {
        expect(backoffDelay(1)).toBe(10 * 60e3)
        expect(backoffDelay(2)).toBe(20 * 60e3)
        expect(backoffDelay(10)).toBe(6 * 3600e3)
    })
})

describe('synced account figures (D-64)', () => {
    const synced = {
        openingBalanceUsd: D(100), openingDate: new Date('2026-08-01'),
        reportedBalanceUsd: D(1000), reportedFloatingUsd: D(-25),
    }
    const trades = [{ closedAt: new Date('2026-09-01'), pnlUsd: D(400) }]
    const cash = [{ type: 'DEPOSIT', amountUsd: D(450), occurredAt: new Date('2026-08-02') }]

    it("uses the broker's balance and explains the rest as 'other'", () => {
        const f = accountFigures(synced, trades, cash, null, 2)
        expect(f).toMatchObject({ balance: 1000, floating: -25, equity: 975, other: 50, openPositions: 2 })
    })

    it("keeps D-19's calculated balance for manual accounts", () => {
        const manual = { openingBalanceUsd: D(100), openingDate: new Date('2026-08-01') }
        expect(accountFigures(manual, trades, cash, null)).toMatchObject({ balance: 950, floating: 0, other: 0, openPositions: 0 })
    })

    it('never sends the key, cursor or raw reported figures to the browser', () => {
        const dto = toAccountDTO({ id: 'a', credentialsEncrypted: 'v1:x', syncCursor: { x: 1 }, reportedBalanceUsd: D(1), openingBalance: D(0) }, null, { syncing: true })
        expect(dto).toEqual({ id: 'a', openingBalance: 0, hasCredentials: true, syncing: true })
    })

    it('charts each day from the latest snapshot before it ended', () => {
        const day = (date, end) => ({ date, start: new Date(end - 86400e3), end: new Date(end) })
        const base = Date.UTC(2026, 10, 10)
        const days = [day('2026-11-09', base), day('2026-11-10', base + 86400e3), day('2026-11-11', base + 2 * 86400e3)]
        const snapshots = [
            { takenAt: new Date(base + 1000), equityUsd: D(500) },
            { takenAt: new Date(base + 5000), equityUsd: D(510) },
        ]
        const points = snapshotSeries(snapshots, [{ type: 'DEPOSIT', amountUsd: D(50), occurredAt: new Date(base + 2000) }], days)
        expect(points).toEqual([
            { date: '2026-11-10', value: 510, movements: [{ type: 'DEPOSIT', amountUsd: 50 }] },
            { date: '2026-11-11', value: 510, movements: [] },
        ])
    })
})
