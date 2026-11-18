import { Prisma } from '@prisma/client'

const DECIMAL_FIELDS = ['lotSize', 'entryPrice', 'exitPrice', 'pnl', 'pnlUsd', 'fxRate']

// Prisma returns Decimal objects, which JSON would serialise as strings ("1250.5").
// Storage and all maths stay exact. Values are only converted to plain numbers
// here, at the API boundary, so the client can use them directly.
export function toTradeDTO(trade){
    const dto = { ...trade }
    for(const field of DECIMAL_FIELDS){
        if(dto[field] != null) dto[field] = Number(dto[field])
    }
    return dto
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
