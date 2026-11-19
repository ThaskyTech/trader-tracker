import { Prisma } from '@prisma/client'
import { summarizeTrades } from './trade.service.js'

const zero = () => new Prisma.Decimal(0)
const sum = (rows, field) => rows.reduce((total, row) => total.plus(row[field]), zero())

const ACCOUNT_DECIMALS = ['openingBalance', 'openingFxRate', 'openingBalanceUsd']
const CASH_DECIMALS = ['amount', 'fxRate', 'amountUsd']
const POSITION_DECIMALS = ['quantity', 'entryPrice', 'markPrice', 'unrealizedPnl', 'unrealizedPnlUsd']

// Decimals become plain numbers only here, at the API boundary (D-20).
// The encrypted credentials never leave the server (D-15, D-16), nor does the sync
// cursor (internal). The reported balance reaches the client through `figures`.
//   extra: { syncing } from the sync service
const SERVER_ONLY = ['credentialsEncrypted', 'syncCursor', 'reportedBalance', 'reportedBalanceUsd', 'reportedFloating', 'reportedFloatingUsd']

export function toAccountDTO(account, figures, extra = {}){
    const dto = { ...account }
    for(const field of SERVER_ONLY) delete dto[field]
    for(const field of ACCOUNT_DECIMALS) if(dto[field] != null) dto[field] = Number(dto[field])
    dto.hasCredentials = Boolean(account.credentialsEncrypted)
    Object.assign(dto, extra)
    return figures ? { ...dto, figures } : dto
}

export function toPositionDTO(position){
    const dto = { ...position }
    for(const field of POSITION_DECIMALS) if(dto[field] != null) dto[field] = Number(dto[field])
    return dto
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

// A synced account that has completed a sync: its balance is the broker's (D-64).
export const usesReportedBalance = account => account.reportedBalanceUsd != null

// The balance in USD with the breakdown the Cash tab shows, and equity (D-02).
//   trades: [{ closedAt, pnlUsd }] for this account
//   cash:   [{ type, amountUsd, occurredAt }] for this account (signed amounts)
//   month:  { start, end } of the current local month, for the card's month P&L (D-47)
//   openPositions: how many positions the broker reports open
// Manual accounts: D-19's calculated balance, recalculated whenever it's read, and no
// floating P&L. Synced accounts: the balance and floating P&L the broker last reported
// (D-64). `other` is what the breakdown can't explain from trades and transfers: fees
// and funding on still-open positions, rebates, closes of positions opened before the
// import window. Always 0 for manual accounts.
export function accountFigures(account, trades, cash, month, openPositions = 0){
    const parts = balanceParts(account, trades, cash)
    const { opening, tradePnl, deposits, withdrawals, adjustments } = parts
    const reported = usesReportedBalance(account)
    const balance = reported ? new Prisma.Decimal(account.reportedBalanceUsd) : parts.balance
    const floating = reported ? new Prisma.Decimal(account.reportedFloatingUsd ?? 0) : zero()
    const other = balance.minus(parts.balance)

    // The card's month P&L is closed-trade P&L only: a deposit isn't performance (D-27).
    const inMonth = month ? trades.filter(t => t.closedAt >= month.start && t.closedAt < month.end) : []

    return {
        opening: opening.toNumber(),
        tradePnl: tradePnl.toNumber(),
        deposits: deposits.toNumber(),
        withdrawals: withdrawals.toNumber(),
        adjustments: adjustments.toNumber(),
        other: other.toNumber(),
        balance: balance.toNumber(),
        floating: floating.toNumber(),
        openPositions,
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

// Equity per local day for a synced account (D-64), from its daily snapshots: each day
// shows the latest snapshot taken before the day ended. Days before the first snapshot
// are left out. Movements are marked like equitySeries' (synced transfers).
//   snapshots: [{ takenAt, equityUsd }] oldest first
export function snapshotSeries(snapshots, cash, days){
    const points = []
    let next = 0
    let value = null
    for(const day of days){
        while(next < snapshots.length && snapshots[next].takenAt < day.end){
            value = snapshots[next].equityUsd
            next++
        }
        if(value === null) continue
        const movements = cash
            .filter(c => c.occurredAt >= day.start && c.occurredAt < day.end)
            .map(c => ({ type: c.type, amountUsd: Number(c.amountUsd) }))
        points.push({ date: day.date, value: Number(value), movements })
    }
    return points
}
