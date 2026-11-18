import { Prisma } from '@prisma/client'
import { summarizeTrades } from './trade.service.js'

const zero = () => new Prisma.Decimal(0)
const sum = (rows, field) => rows.reduce((total, row) => total.plus(row[field]), zero())

const ACCOUNT_DECIMALS = ['openingBalance', 'openingFxRate', 'openingBalanceUsd']
const CASH_DECIMALS = ['amount', 'fxRate', 'amountUsd']

// Decimals become plain numbers only here, at the API boundary (D-20).
// The encrypted credentials never leave the server (D-15, D-16).
export function toAccountDTO(account, figures){
    const { credentialsEncrypted, ...dto } = account
    for(const field of ACCOUNT_DECIMALS) if(dto[field] != null) dto[field] = Number(dto[field])
    dto.hasCredentials = Boolean(credentialsEncrypted)
    return figures ? { ...dto, figures } : dto
}

export function toCashDTO(movement){
    const dto = { ...movement }
    for(const field of CASH_DECIMALS) if(dto[field] != null) dto[field] = Number(dto[field])
    return dto
}

// Trades and cash movements that count towards the balance: those from the opening
// date on. The opening balance already includes anything earlier (D-19).
export const countsTowardsBalance = (account, when) => when >= account.openingDate

// The D-19 parts as exact Decimals. balance is what correctBalance compares against.
export function balanceParts(account, trades, cash){
    const counted = trades.filter(t => countsTowardsBalance(account, t.closedAt))
    const countedCash = cash.filter(c => countsTowardsBalance(account, c.occurredAt))
    const byType = type => sum(countedCash.filter(c => c.type === type), 'amountUsd')

    const opening = new Prisma.Decimal(account.openingBalanceUsd)
    const tradePnl = sum(counted, 'pnlUsd')
    const deposits = byType('DEPOSIT')
    const withdrawals = byType('WITHDRAWAL')
    const adjustments = byType('ADJUSTMENT')
    const balance = opening.plus(tradePnl).plus(deposits).plus(withdrawals).plus(adjustments)
    return { opening, tradePnl, deposits, withdrawals, adjustments, balance }
}

// D-19 balance, in USD, with the breakdown the Cash tab shows. Calculated when read,
// never stored, so adding, editing or deleting a trade changes it with no extra step.
//   trades: [{ closedAt, pnlUsd }] for this account
//   cash:   [{ type, amountUsd, occurredAt }] for this account (signed amounts)
//   month:  { start, end } of the current local month, for the card's month P&L (D-47)
// Equity = balance + floating P&L. Manual accounts have no live positions, so floating
// is 0 until synced accounts report open positions (roadmap 7).
export function accountFigures(account, trades, cash, month){
    const { opening, tradePnl, deposits, withdrawals, adjustments, balance } = balanceParts(account, trades, cash)
    const floating = zero()

    // The card's month P&L is closed-trade P&L only: a deposit isn't performance (D-27).
    const inMonth = month ? trades.filter(t => t.closedAt >= month.start && t.closedAt < month.end) : []

    return {
        opening: opening.toNumber(),
        tradePnl: tradePnl.toNumber(),
        deposits: deposits.toNumber(),
        withdrawals: withdrawals.toNumber(),
        adjustments: adjustments.toNumber(),
        balance: balance.toNumber(),
        floating: floating.toNumber(),
        equity: balance.plus(floating).toNumber(),
        month: summarizeTrades(inMonth),
        // Every trade on the account, opening date or not: shown as "N trades kept" when
        // archived, and in the delete warning with the P&L that would leave the totals (D-18).
        tradeCount: trades.length,
        allTimePnl: sum(trades, 'pnlUsd').toNumber(),
    }
}

// The balance-correction entry (D-19): the difference between what the broker shows and
// the calculated balance, as a visible ADJUSTMENT. Both in USD; the native amount uses
// the same rate. Returns null when there's nothing to correct.
export function correctionFor(targetUsd, currentUsd, rate){
    const differenceUsd = new Prisma.Decimal(targetUsd).minus(currentUsd).toDecimalPlaces(8)
    if(differenceUsd.isZero()) return null
    return { amountUsd: differenceUsd, amount: differenceUsd.times(rate).toDecimalPlaces(8) }
}

// Equity at the end of each local day, oldest first, for the account's chart (D-45).
//   days: [{ date: 'YYYY-MM-DD', start, end }] local day ranges, oldest first
// Each point: { date, value (USD), movements: [{ type, amountUsd }] } where movements
// are that day's deposits, withdrawals and corrections, which the chart marks.
// Days before the account's opening day are left out: it didn't exist yet.
// Built from trades and cash movements, so no balance snapshots are needed for manual
// accounts; synced accounts add snapshots in roadmap 7.
export function equitySeries(account, trades, cash, days){
    const counted = trades
        .filter(t => countsTowardsBalance(account, t.closedAt))
        .map(t => ({ at: t.closedAt, usd: t.pnlUsd }))
    const countedCash = cash.filter(c => countsTowardsBalance(account, c.occurredAt))
    const events = [...counted, ...countedCash.map(c => ({ at: c.occurredAt, usd: c.amountUsd }))]
        .sort((a, b) => a.at - b.at)

    let value = new Prisma.Decimal(account.openingBalanceUsd)
    let next = 0
    const points = []
    for(const day of days){
        // Everything up to the end of this day, including days before the range starts.
        while(next < events.length && events[next].at < day.end){
            value = value.plus(events[next].usd)
            next++
        }
        if(day.end <= account.openingDate) continue
        const movements = countedCash
            .filter(c => c.occurredAt >= day.start && c.occurredAt < day.end)
            .map(c => ({ type: c.type, amountUsd: Number(c.amountUsd) }))
        points.push({ date: day.date, value: value.toNumber(), movements })
    }
    return points
}
