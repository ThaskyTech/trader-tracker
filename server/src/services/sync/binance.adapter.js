import { BinanceError, createBinanceClient, fetchFills, fetchIncome, incomeKey, isTestnet } from './binance.client.js'
import {
    DAY_MS, IMPORT_DAYS, applyActivity, currentAmounts, dehydrateTracks, fundingFrom, hydrateTracks,
    mapPositions, rebuildDailyBalances, symbolOf, tradedSymbols, transfersFrom, walletFigures,
} from './binance.mapper.js'
import { maskKey } from '../../utils/secrets.js'

// Binance USDⓈ-M Futures (D-12). An adapter does two things:
//   verify(credentials)        checks a key before it's saved (D-15, D-67)
//   sync({ credentials, cursor, now })  reads what changed since `cursor`
// The sync service (sync.service.js) does all the saving.

// Binance's records can show up slightly after the moment they describe, so each sync
// re-reads a few minutes it has already seen and drops what it already has.
const OVERLAP_MS = 5 * 60e3
const FILL_OVERLAP_MS = 60e3

// Permissions that do more than read. Any of them makes a key unacceptable (D-15).
const MORE_THAN_READING = {
    enableSpotAndMarginTrading: 'trade spot',
    enableFutures: 'trade futures',
    enableMargin: 'use margin',
    enableVanillaOptions: 'trade options',
    enablePortfolioMarginTrading: 'trade portfolio margin',
    enableFixApiTrade: 'trade over FIX',
    enableWithdrawals: 'withdraw',
    enableInternalTransfer: 'transfer to other accounts',
    permitsUniversalTransfer: 'move funds between wallets',
}

const listOf = items => items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0]

// Problems with the key itself, worded for the person pasting it.
export class KeyRejectedError extends Error {}

export const binanceAdapter = {
    provider: 'BINANCE',
    hint: credentials => maskKey(credentials.apiKey),

    async verify(credentials, { createClient = createBinanceClient } = {}){
        const client = createClient(credentials)
        // The testnet has no permissions endpoint; testnet keys hold no real money.
        if(!isTestnet()){
            let restrictions
            try {
                restrictions = await client.apiRestrictions()
            } catch (err) {
                if(err.kind === 'AUTH') throw new KeyRejectedError('Binance rejected this key. Check you copied both the API key and the secret key.')
                throw err
            }
            const extra = Object.entries(MORE_THAN_READING).filter(([flag]) => restrictions[flag]).map(([, label]) => label)
            if(extra.length){
                throw new KeyRejectedError(`This key can ${listOf(extra)}. The app only accepts read-only keys: edit the key on Binance so only "Enable Reading" is ticked, then try again.`)
            }
            if(!restrictions.enableReading) throw new KeyRejectedError('This key can\'t read your account. Tick "Enable Reading" for it on Binance.')
        }
        try {
            await client.account()
        } catch (err) {
            // Docs don't say whether reading futures needs the futures (trading)
            // permission. If it does, a read-only key ends up here: D-67 says to ask the
            // owner rather than accept trading keys.
            if(err.kind === 'AUTH') throw new KeyRejectedError(`Binance accepted the key but refused its futures data (${err.message}). If the key is new, make sure your futures account was opened before the key was created.`)
            throw err
        }
        return { hint: maskKey(credentials.apiKey) }
    },

    // cursor: what the previous sync saved (null on the first sync, which imports the
    // last 3 months, D-62). Returns everything the sync service saves, plus the next cursor.
    async sync({ credentials, cursor, now = Date.now() }, { createClient = createBinanceClient } = {}){
        const client = createClient(credentials)
        const first = !cursor?.version
        const windowStart = now - IMPORT_DAYS * DAY_MS

        // Positions first, then fills up to `now`: a fill made between the two calls is
        // picked up next time, and the track check in applyActivity covers the gap.
        const wallet = await client.account()
        const positionRows = await client.positions()
        const { balance, floating } = walletFigures(wallet)
        const current = currentAmounts(positionRows)

        // Income since last time (or the whole window), without rows already handled.
        const incomeFrom = first ? windowStart : Math.max(windowStart, cursor.income.until - OVERLAP_MS)
        const seen = new Map(first ? [] : cursor.income.seen.map(({ key, time }) => [key, time]))
        const income = (await fetchIncome(client, incomeFrom, now)).filter(row => !seen.has(incomeKey(row)))

        // Fills: for symbols that traded, plus anything still open (to see it close).
        const tracks = hydrateTracks(first ? {} : cursor.tracks)
        const symbols = first ? {} : { ...cursor.symbols }
        const traded = tradedSymbols(income)
        const toRead = new Set([...traded.keys(), ...[...current.keys()].map(symbolOf)])
        for(const [key, track] of Object.entries(tracks)) if(!track.pos.isZero() || track.trip) toRead.add(symbolOf(key))

        const fills = []
        for(const symbol of [...toRead].sort()){
            const known = symbols[symbol]
            const since = known ? known.lastFillTime - FILL_OVERLAP_MS
                : first ? windowStart
                : (traded.get(symbol) ?? incomeFrom) - FILL_OVERLAP_MS
            const rows = (await fetchFills(client, symbol, Math.max(windowStart, since), now))
                .filter(row => !known || Number(row.id) > known.lastFillId)
            for(const row of rows){
                const mark = symbols[symbol]
                if(!mark || Number(row.id) > mark.lastFillId) symbols[symbol] = { lastFillId: Number(row.id), lastFillTime: Number(row.time) }
            }
            fills.push(...rows)
        }

        const { trades, mismatches } = applyActivity(tracks, { fills, funding: fundingFrom(income), current })
        const rebuilt = first ? rebuildDailyBalances(balance, income, windowStart, now) : null

        // Keys of income rows inside the overlap, so the next sync can skip them.
        const stillOverlapping = [
            ...[...seen].map(([key, time]) => ({ key, time })),
            ...income.map(row => ({ key: incomeKey(row), time: Number(row.time) })),
        ].filter(row => row.time >= now - OVERLAP_MS)

        return {
            currency: 'USD',
            balance,
            floating,
            positions: mapPositions(positionRows, tracks),
            trades,
            cash: transfersFrom(income),
            // First sync only: the balance history and the account's opening point (D-64).
            history: rebuilt?.days ?? null,
            opening: rebuilt ? { balance: rebuilt.opening, date: new Date(windowStart) } : null,
            mismatches,
            cursor: {
                version: 1,
                income: { until: now, seen: stillOverlapping },
                symbols,
                tracks: dehydrateTracks(tracks),
            },
        }
    },
}

export { BinanceError }
