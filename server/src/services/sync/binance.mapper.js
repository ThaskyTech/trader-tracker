import { Prisma } from '@prisma/client'

// Pure functions that turn Binance's responses into the app's shapes. No network and
// no database, so every rule here is covered by tests with recorded responses.
// All money is Decimal (D-20). USDT and USDC count as USD (D-26).

const D = value => new Prisma.Decimal(value ?? 0)
const round = value => value.toDecimalPlaces(8)

export const STABLE_ASSETS = new Set(['USDT', 'USDC'])
const isStable = asset => STABLE_ASSETS.has(asset)

export const DAY_MS = 24 * 3600e3
// Binance serves fills and income for the last 3 months only (D-62). 88 days stays
// inside that even for the shortest three months (e.g. 1 Feb to 1 May is 89 days).
export const IMPORT_DAYS = 88

// A track is one position line: a symbol in one-way mode ("BTCUSDT|BOTH"), or one
// side of it in hedge mode ("BTCUSDT|LONG"), which Binance keeps as two positions.
export const trackKey = (symbol, positionSide = 'BOTH') => `${symbol}|${positionSide || 'BOTH'}`
export const symbolOf = key => key.split('|')[0]

// --- Wallet and positions ---

// Wallet balance (realised money) and floating P&L of the futures wallet, in USD.
// From /fapi/v3/account's assets; other margin assets aren't valued (D-26).
export function walletFigures(account){
    let balance = D(0)
    let floating = D(0)
    for(const asset of account?.assets ?? []){
        if(!isStable(asset.asset)) continue
        balance = balance.plus(D(asset.walletBalance))
        floating = floating.plus(D(asset.unrealizedProfit))
    }
    return { balance: round(balance), floating: round(floating) }
}

// Signed size of each open track now: positive long, negative short.
export function currentAmounts(positionRows){
    const amounts = new Map()
    for(const row of positionRows ?? []){
        const amount = D(row.positionAmt)
        if(amount.isZero()) continue
        amounts.set(trackKey(row.symbol, row.positionSide), amount)
    }
    return amounts
}

// /fapi/v3/positionRisk rows -> Position rows (D-64). openedAt comes from the round trip
// the sync is following, when it saw the position open.
export function mapPositions(positionRows, tracks = {}){
    return (positionRows ?? [])
        .filter(row => !D(row.positionAmt).isZero())
        .map(row => {
            const amount = D(row.positionAmt)
            const short = row.positionSide === 'SHORT' || (row.positionSide !== 'LONG' && amount.isNeg())
            const unrealized = round(D(row.unRealizedProfit ?? row.unrealizedProfit))
            const trip = tracks[trackKey(row.symbol, row.positionSide)]?.trip
            return {
                symbol: row.symbol,
                direction: short ? 'SHORT' : 'LONG',
                quantity: amount.abs(),
                entryPrice: D(row.entryPrice),
                markPrice: row.markPrice != null ? D(row.markPrice) : null,
                unrealizedPnl: unrealized,
                currency: 'USD',
                unrealizedPnlUsd: unrealized,
                openedAt: trip ? new Date(trip.openedAt) : null,
            }
        })
}

// --- Income ---

// Transfers into and out of the futures wallet -> cash movements (D-27). Binance's
// income is signed from the wallet's point of view: positive in, negative out.
export function transfersFrom(income){
    return income
        .filter(row => row.incomeType === 'TRANSFER' && isStable(row.asset) && !D(row.income).isZero())
        .map(row => {
            const amount = round(D(row.income))
            return {
                externalId: `TRANSFER:${row.tranId}`,
                type: amount.isNeg() ? 'WITHDRAWAL' : 'DEPOSIT',
                amount,
                occurredAt: new Date(row.time),
            }
        })
}

// Funding payments, attributed to whichever trip is open on that symbol (D-61).
export function fundingFrom(income){
    return income
        .filter(row => row.incomeType === 'FUNDING_FEE' && row.symbol && isStable(row.asset))
        .map(row => ({ kind: 'funding', symbol: row.symbol, time: Number(row.time), amount: D(row.income) }))
}

// Symbols that had fills in this income: every fill pays commission, and every
// closing fill realises P&L.
export function tradedSymbols(income){
    const symbols = new Map() // symbol -> earliest time seen
    for(const row of income){
        if(!row.symbol || (row.incomeType !== 'COMMISSION' && row.incomeType !== 'REALIZED_PNL')) continue
        const time = Number(row.time)
        if(!symbols.has(row.symbol) || time < symbols.get(row.symbol)) symbols.set(row.symbol, time)
    }
    return symbols
}

// Daily balances for the past window, rebuilt backwards from today's balance (D-64).
// Every change to the futures wallet is an income row, so the balance at the end of a
// day is today's balance minus everything that happened after it.
// Returns { days: [{ date, balanceUsd, takenAt }] up to yesterday, opening } where
// opening is the balance at `from`.
export function rebuildDailyBalances(balanceNow, income, from, now){
    const rows = income
        .filter(row => isStable(row.asset))
        .map(row => ({ time: Number(row.time), amount: D(row.income) }))
        .sort((a, b) => b.time - a.time) // newest first

    const balanceBefore = moment => {
        let value = D(balanceNow)
        for(const row of rows){
            if(row.time < moment) break
            value = value.minus(row.amount)
        }
        return round(value)
    }

    const days = []
    const todayStart = Math.floor(now / DAY_MS) * DAY_MS
    for(let dayStart = Math.floor(from / DAY_MS) * DAY_MS; dayStart < todayStart; dayStart += DAY_MS){
        const end = dayStart + DAY_MS
        days.push({ date: new Date(dayStart).toISOString().slice(0, 10), balanceUsd: balanceBefore(end), takenAt: new Date(end - 1) })
    }
    return { days, opening: balanceBefore(from) }
}

// --- Round trips (D-60) ---

// Tracks are saved in the account's syncCursor as JSON, so Decimals travel as strings.
const TRIP_DECIMALS = ['maxQty', 'openQty', 'openNotional', 'closeQty', 'closeNotional', 'realized', 'commission', 'funding']

export function hydrateTracks(saved = {}){
    const tracks = {}
    for(const [key, track] of Object.entries(saved)){
        const trip = track.trip ? { ...track.trip } : null
        if(trip) for(const field of TRIP_DECIMALS) trip[field] = D(trip[field])
        tracks[key] = { pos: D(track.pos), trip }
    }
    return tracks
}

export function dehydrateTracks(tracks){
    const saved = {}
    for(const [key, track] of Object.entries(tracks)){
        // Flat with nothing open: nothing to remember.
        if(track.pos.isZero() && !track.trip) continue
        const trip = track.trip ? { ...track.trip } : null
        if(trip) for(const field of TRIP_DECIMALS) trip[field] = trip[field].toString()
        saved[key] = { pos: track.pos.toString(), trip }
    }
    return saved
}

function openTrip(signedQty, fill, qty, price, commission){
    return {
        direction: signedQty.isNeg() ? 'SHORT' : 'LONG',
        openedAt: Number(fill.time),
        firstFillId: String(fill.id),
        maxQty: qty,
        openQty: qty,
        openNotional: qty.times(price),
        closeQty: D(0),
        closeNotional: D(0),
        realized: D(0),
        commission,
        funding: D(0),
    }
}

// A closed trip -> the trade it's saved as. P&L is net of commission and funding;
// fees holds what they cost (D-61). Binance signs funding: negative when paid.
function finishTrip(trip, key, closedAt){
    const [symbol, side] = key.split('|')
    return {
        externalId: `${symbol}:${side}:${trip.firstFillId}`,
        symbol,
        direction: trip.direction,
        lotSize: round(trip.maxQty),
        entryPrice: round(trip.openNotional.div(trip.openQty)),
        exitPrice: round(trip.closeNotional.div(trip.closeQty)),
        pnl: round(trip.realized.minus(trip.commission).plus(trip.funding)),
        fees: round(trip.commission.minus(trip.funding)),
        openedAt: new Date(trip.openedAt),
        closedAt: new Date(Number(closedAt)),
    }
}

// One fill against its track. Returns the trades it closed (usually none, at most one).
function applyFill(track, fill, key){
    const qty = D(fill.qty)
    const price = D(fill.price)
    const signed = fill.side === 'BUY' ? qty : qty.neg()
    const commission = isStable(fill.commissionAsset) ? D(fill.commission) : D(0)
    const before = track.pos
    const after = before.plus(signed)
    const closed = []

    if(before.isZero()){
        track.trip = openTrip(signed, fill, qty, price, commission)
    } else if(before.isNeg() === signed.isNeg()){
        // Adding to the position. While skipping a trip that opened before the import
        // window (trip is null), there's nothing to add to.
        if(track.trip){
            const trip = track.trip
            trip.openQty = trip.openQty.plus(qty)
            trip.openNotional = trip.openNotional.plus(qty.times(price))
            trip.commission = trip.commission.plus(commission)
            if(after.abs().gt(trip.maxQty)) trip.maxQty = after.abs()
        }
    } else {
        // Reducing. A fill bigger than the position flips it: the part that closes
        // belongs to this trip, the rest opens the next one, and commission is split
        // in proportion. Realised P&L only comes from the closing part.
        const closingQty = Prisma.Decimal.min(qty, before.abs())
        const remainder = qty.minus(closingQty)
        const closingCommission = commission.times(closingQty).div(qty)
        if(track.trip){
            const trip = track.trip
            trip.closeQty = trip.closeQty.plus(closingQty)
            trip.closeNotional = trip.closeNotional.plus(closingQty.times(price))
            trip.realized = trip.realized.plus(D(fill.realizedPnl))
            trip.commission = trip.commission.plus(closingCommission)
        }
        if(after.isZero() || after.isNeg() !== before.isNeg()){
            if(track.trip) closed.push(finishTrip(track.trip, key, fill.time))
            track.trip = remainder.gt(0) ? openTrip(signed, fill, remainder, price, commission.minus(closingCommission)) : null
        }
    }
    track.pos = after
    return closed
}

// Runs new fills and funding through the tracks, oldest first, and returns the trades
// that closed. `tracks` (hydrated) is updated in place.
//   fills:   /fapi/v1/userTrades rows not seen before, any symbols
//   funding: from fundingFrom()
//   current: currentAmounts() of the positions Binance reports now
// A track seen for the first time starts at (current size - what these fills added).
// If that isn't zero, the position opened before the import window: its entry is
// unknown, so it's followed (trip = null) but not saved as a trade.
// Afterwards each track must match Binance's current size. If one doesn't (a fill was
// missed), it's reset to Binance's figure and its trip dropped rather than saving a
// wrong trade. Those keys come back as `mismatches`.
export function applyActivity(tracks, { fills, funding = [], current }){
    const added = new Map()
    for(const fill of fills){
        const key = trackKey(fill.symbol, fill.positionSide)
        const signed = fill.side === 'BUY' ? D(fill.qty) : D(fill.qty).neg()
        added.set(key, (added.get(key) ?? D(0)).plus(signed))
    }
    for(const [key, sum] of added){
        if(!tracks[key]) tracks[key] = { pos: (current.get(key) ?? D(0)).minus(sum), trip: null }
    }

    // Fills before funding at the same moment; fills in id order (Binance's sequence).
    const events = [
        ...fills.map(fill => ({ kind: 'fill', time: Number(fill.time), id: Number(fill.id), fill })),
        ...funding.map(event => ({ ...event, id: Infinity })),
    ].sort((a, b) => a.time - b.time || (a.kind === b.kind ? a.id - b.id : a.kind === 'fill' ? -1 : 1))

    const trades = []
    for(const event of events){
        if(event.kind === 'fill'){
            const key = trackKey(event.fill.symbol, event.fill.positionSide)
            trades.push(...applyFill(tracks[key], event.fill, key))
        } else {
            // Hedge mode can have both sides open; the payment goes to the first one.
            const open = Object.entries(tracks).find(([key, track]) => symbolOf(key) === event.symbol && track.trip)
            if(open) open[1].trip.funding = open[1].trip.funding.plus(event.amount)
        }
    }

    const mismatches = []
    for(const key of new Set([...Object.keys(tracks), ...current.keys()])){
        const expected = current.get(key) ?? D(0)
        if(!tracks[key]) tracks[key] = { pos: expected, trip: null }
        else if(!tracks[key].pos.eq(expected)){
            mismatches.push(key)
            tracks[key] = { pos: expected, trip: null }
        }
    }
    return { trades, mismatches }
}
