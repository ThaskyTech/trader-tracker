import crypto from 'node:crypto'

// A small client for the Binance endpoints the sync reads (USDⓈ-M Futures, D-12).
// Only GET requests: the key is read-only (D-15) and the app never trades.
//
// Facts from Binance's docs (checked 2026-11-19):
// - Signed requests carry `timestamp` (ms) and an HMAC-SHA256 `signature` of the query
//   string, with the key in the X-MBX-APIKEY header. Binance refuses a timestamp more
//   than recvWindow ms behind its clock, so the server's clock offset is measured first.
// - Limits are per IP: request weight per minute, reported back in X-MBX-USED-WEIGHT-1M.
//   Going past it gives 429, and carrying on after 429s gets the IP banned (418).
// - Errors are JSON: { code: -2015, msg: 'Invalid API-key, IP, or permissions for action.' }

const LIVE_FUTURES_URL = 'https://fapi.binance.com'
// Binance's docs name both of these for the futures testnet; general-info says demo-fapi.
const TESTNET_FUTURES_URL = 'https://demo-fapi.binance.com'
const SPOT_URL = 'https://api.binance.com'

const RECV_WINDOW = 10_000
const REQUEST_TIMEOUT_MS = 15_000
// Stay well under the documented 2400 weight a minute: other users' syncs share the IP.
const WEIGHT_PAUSE_AT = 1800

// Testnet keys (BINANCE_TESTNET=true) are for development. The testnet has no
// key-permission endpoint, so the read-only check is skipped there (see the adapter).
export const isTestnet = () => process.env.BINANCE_TESTNET === 'true'
const futuresUrl = () => process.env.BINANCE_FUTURES_URL || (isTestnet() ? TESTNET_FUTURES_URL : LIVE_FUTURES_URL)

// kind tells the sync what to do about it (D-65):
//   AUTH       the key was rejected or lacks a permission -> stop until it's replaced
//   LOCATION   Binance refuses the server's country -> the server must move region
//   RATE_LIMIT Binance asked us to slow down -> retry later
//   NETWORK    couldn't reach Binance -> retry later
//   OTHER      anything else -> retry later, showing Binance's message
export class BinanceError extends Error {
    constructor(message, { kind = 'OTHER', status, code } = {}){
        super(message)
        this.kind = kind
        this.status = status
        this.code = code
    }
}

const AUTH_CODES = new Set([-2014, -2015, -1022, -1002, -2008])

export function classifyBinanceError(status, body){
    const code = body?.code
    const msg = body?.msg ?? `HTTP ${status}`
    if(status === 451 || /restricted location/i.test(msg)) return new BinanceError(msg, { kind: 'LOCATION', status, code })
    if(status === 429 || status === 418 || code === -1003) return new BinanceError(msg, { kind: 'RATE_LIMIT', status, code })
    if(status === 401 || AUTH_CODES.has(code)) return new BinanceError(msg, { kind: 'AUTH', status, code })
    return new BinanceError(msg, { kind: 'OTHER', status, code })
}

const sleepFor = ms => new Promise(resolve => setTimeout(resolve, ms))

// deps are injectable for tests: fetch, the clock and sleep.
export function createBinanceClient({ apiKey, apiSecret }, { fetchImpl = fetch, now = Date.now, sleep = sleepFor } = {}){
    let clockOffset = null // Binance time minus our time, in ms

    async function call(baseUrl, path, params, { signed = true } = {}){
        const search = new URLSearchParams()
        for(const [key, value] of Object.entries(params ?? {})) if(value !== undefined && value !== null) search.set(key, String(value))
        if(signed){
            if(clockOffset === null) await syncClock()
            search.set('recvWindow', String(RECV_WINDOW))
            search.set('timestamp', String(Math.round(now() + clockOffset)))
            search.set('signature', crypto.createHmac('sha256', apiSecret).update(search.toString()).digest('hex'))
        }

        let response
        try {
            response = await fetchImpl(`${baseUrl}${path}?${search}`, {
                headers: signed ? { 'X-MBX-APIKEY': apiKey } : {},
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            })
        } catch (err) {
            throw new BinanceError(`Couldn't reach Binance (${err.name === 'TimeoutError' ? 'timed out' : err.message}).`, { kind: 'NETWORK' })
        }

        const text = await response.text()
        let body = null
        try { body = text ? JSON.parse(text) : null } catch { body = { msg: text.slice(0, 200) } }
        if(!response.ok) throw classifyBinanceError(response.status, body)

        // Pause before the next request if this IP has used most of the minute's weight.
        const used = Number(response.headers.get('x-mbx-used-weight-1m'))
        if(used >= WEIGHT_PAUSE_AT) await sleep(60_000 - (now() % 60_000) + 1000)
        return body
    }

    async function syncClock(){
        const before = now()
        const { serverTime } = await call(futuresUrl(), '/fapi/v1/time', {}, { signed: false })
        // Assume the server read its clock halfway through the round trip.
        clockOffset = serverTime - Math.round((before + now()) / 2)
    }

    const futures = (path, params) => call(futuresUrl(), path, params)

    return {
        // { enableReading, enableFutures, enableWithdrawals, ... } Live Binance only.
        apiRestrictions: () => call(SPOT_URL, '/sapi/v1/account/apiRestrictions', {}),
        // Wallet: { assets: [{ asset, walletBalance, unrealizedProfit, ... }], positions: [...] }
        account: () => futures('/fapi/v3/account'),
        // Open positions with entry and mark prices.
        positions: () => futures('/fapi/v3/positionRisk'),
        // Fills for one symbol. Max 7 days between start and end, last 3 months only.
        userTrades: (symbol, startTime, endTime) => futures('/fapi/v1/userTrades', { symbol, startTime, endTime, limit: 1000 }),
        // Every wallet change: REALIZED_PNL, COMMISSION, FUNDING_FEE, TRANSFER, ... Last 3 months only.
        income: (startTime, endTime) => futures('/fapi/v1/income', { startTime, endTime, limit: 1000 }),
    }
}

const WEEK_MS = 7 * 24 * 3600e3

// Walks [from, to] in windows of at most 7 days (both endpoints' limit), paging inside
// a window when it's full: the next page starts at the last row's time, and rows
// already seen are dropped by key. Oldest first, as Binance returns them.
async function fetchWindowed(fetchPage, from, to, keyOf){
    const rows = []
    const seen = new Set()
    for(let windowStart = from; windowStart <= to; windowStart += WEEK_MS){
        const windowEnd = Math.min(windowStart + WEEK_MS - 1, to)
        let start = windowStart
        for(;;){
            const page = await fetchPage(start, windowEnd)
            let added = 0
            for(const row of page){
                const key = keyOf(row)
                if(seen.has(key)) continue
                seen.add(key)
                rows.push(row)
                added++
            }
            if(page.length < 1000) break
            const last = page.at(-1).time
            // A full page whose rows all share one millisecond (or were all seen) would
            // repeat forever; step past it instead.
            start = added === 0 || last <= start ? Math.max(start, last) + 1 : last
            if(start > windowEnd) break
        }
    }
    return rows
}

export const incomeKey = row => `${row.incomeType}:${row.tranId}`

export const fetchIncome = (client, from, to) =>
    fetchWindowed((start, end) => client.income(start, end), from, to, incomeKey)

export const fetchFills = (client, symbol, from, to) =>
    fetchWindowed((start, end) => client.userTrades(symbol, start, end), from, to, row => row.id)
