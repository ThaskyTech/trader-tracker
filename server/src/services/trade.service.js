import { Prisma } from '@prisma/client'

const DECIMAL_FIELDS = ['lotSize', 'entryPrice', 'exitPrice', 'pnl', 'pnlUsd', 'fxRate', 'fees']

// Prisma returns Decimal objects, which JSON would serialise as strings ("1250.5").
// Storage and all maths stay exact. Values are only converted to plain numbers
// here, at the API boundary, so the client can use them directly.
// The broker name is stored on the account (D-37); queries include it through
// TRADE_INCLUDE, and it's flattened back onto the trade here so clients still get `broker`.
export function toTradeDTO(trade){
    const { account, ...dto } = trade
    for(const field of DECIMAL_FIELDS){
        if(dto[field] != null) dto[field] = Number(dto[field])
    }
    if(account) dto.broker = account.broker
    return dto
}

export const TRADE_INCLUDE = { account: { select: { broker: true } } }

// Prisma `where` conditions for the History filters.
export function tradeFilterWhere({ accountId, direction, outcome } = {}){
    return {
        ...(accountId && { accountId }),
        ...(direction && { direction }),
        ...(outcome === 'PROFIT' && { pnlUsd: { gt: 0 } }),
        ...(outcome === 'LOSS' && { pnlUsd: { lt: 0 } })
    }
}

// Paging. Trades are listed newest first, by closedAt, with id breaking ties when
// two trades closed at the same moment (common with bots). A cursor records where
// the last page ended, so the next page starts right after it. Unlike "skip 50",
// that doesn't shift if a new trade is added between page loads.
export const TRADE_LIST_ORDER = [{ closedAt: 'desc' }, { id: 'desc' }]

export function encodeCursor(trade){
    return Buffer.from(`${trade.closedAt.toISOString()}|${trade.id}`).toString('base64url')
}

// Returns { closedAt, id }, or null if the cursor is malformed.
export function decodeCursor(cursor){
    const [iso, id, extra] = Buffer.from(cursor, 'base64url').toString('utf8').split('|')
    const closedAt = new Date(iso)
    if(!id || extra !== undefined || isNaN(closedAt.getTime())) return null
    return { closedAt, id }
}

// Trades that come after the cursor in TRADE_LIST_ORDER.
export function afterCursorWhere({ closedAt, id }){
    return { OR: [{ closedAt: { lt: closedAt } }, { closedAt, id: { lt: id } }] }
}

// Totals use Decimal arithmetic, so summing many trades never drifts
// (with floats, 0.1 + 0.2 = 0.30000000000000004).
// Everything is summed in USD (pnlUsd), whatever currency each trade was entered in.
export function summarizeTrades(trades){
    let total = new Prisma.Decimal(0)
    let wins = 0
    let losses = 0

    for(const { pnlUsd } of trades){
        total = total.plus(pnlUsd)
        if(pnlUsd.gt(0)) wins++
        else if(pnlUsd.lt(0)) losses++
    }

    const totalTrades = trades.length
    // Break-even trades count towards the total but are neither wins nor losses.
    const winRate = totalTrades > 0 ? Math.round((wins / totalTrades) * 1000) / 10 : 0

    // totalPnl is in USD.
    return { totalPnl: total.toNumber(), wins, losses, totalTrades, winRate }
}

// Net USD P&L per local calendar day, keyed by day of month: { 1: 840, 2: -1205, ... }
export function dailyTotals(trades, getLocalDay){
    const totals = new Map()
    for(const { closedAt, pnlUsd } of trades){
        const day = getLocalDay(closedAt)
        totals.set(day, (totals.get(day) ?? new Prisma.Decimal(0)).plus(pnlUsd))
    }
    return Object.fromEntries([...totals].map(([day, sum]) => [day, sum.toNumber()]))
}
