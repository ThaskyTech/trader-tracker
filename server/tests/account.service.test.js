import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
import { accountFigures, balanceParts, correctionFor, equitySeries, toAccountDTO, toCashDTO } from '../src/services/account.service.js'
import { titleClashError } from '../src/utils/accounts.js'
import { lastLocalDays } from '../src/utils/time.js'
import { createAccountSchema, updateAccountSchema, cashMovementSchema } from '../src/validators/account.schema.js'

const d = value => new Prisma.Decimal(value)
const at = iso => new Date(iso)

const account = {
    id: 'a1', broker: 'Exness', style: 'SWING', accountNumber: null,
    openingBalance: d(1000), openingFxRate: d(1), openingBalanceUsd: d(1000),
    openingDate: at('2026-11-01T00:00:00Z'), credentialsEncrypted: null,
}
const trades = [
    { closedAt: at('2026-10-20T10:00:00Z'), pnlUsd: d(500) },   // before opening: already in the opening balance
    { closedAt: at('2026-11-02T10:00:00Z'), pnlUsd: d('0.1') },
    { closedAt: at('2026-11-03T10:00:00Z'), pnlUsd: d('0.2') },
    { closedAt: at('2026-11-05T10:00:00Z'), pnlUsd: d(-50) },
]
const cash = [
    { type: 'DEPOSIT', amountUsd: d(300), occurredAt: at('2026-11-03T12:00:00Z') },
    { type: 'WITHDRAWAL', amountUsd: d(-100), occurredAt: at('2026-11-04T12:00:00Z') },
    { type: 'ADJUSTMENT', amountUsd: d(-7.5), occurredAt: at('2026-11-05T12:00:00Z') },
]

describe('accountFigures (D-19)', () => {
    const figures = accountFigures(account, trades, cash, { start: at('2026-11-01T00:00:00Z'), end: at('2026-12-01T00:00:00Z') })

    it('balance = opening + trades since opening + deposits + withdrawals + corrections', () => {
        // 1000 + (0.1 + 0.2 - 50) + 300 - 100 - 7.5, exactly (no 0.30000000000000004)
        expect(figures).toMatchObject({
            opening: 1000, tradePnl: -49.7, deposits: 300, withdrawals: -100, adjustments: -7.5, balance: 1142.8,
        })
    })

    it('counts every trade for the archive and delete messages, including ones before opening', () => {
        expect(figures.tradeCount).toBe(4)
        expect(figures.allTimePnl).toBe(450.3)
    })

    it('equity equals balance while there are no live positions', () => {
        expect(figures.floating).toBe(0)
        expect(figures.equity).toBe(figures.balance)
    })

    it("the card's month P&L counts closed trades only, never deposits (D-27)", () => {
        expect(figures.month).toMatchObject({ totalPnl: -49.7, totalTrades: 3, wins: 2, losses: 1 })
    })

    it('ignores cash dated before the opening date', () => {
        const early = [{ type: 'DEPOSIT', amountUsd: d(999), occurredAt: at('2026-10-01T00:00:00Z') }]
        expect(balanceParts(account, [], early).balance.toNumber()).toBe(1000)
    })
})

describe('correctionFor', () => {
    it('records the difference, in USD and in the account currency', () => {
        const c = correctionFor(d(1100), d('1142.8'), d('18.5'))
        expect(c.amountUsd.toNumber()).toBe(-42.8)
        expect(c.amount.toNumber()).toBe(-791.8)
    })

    it('returns null when the balance already matches', () => {
        expect(correctionFor(d('1142.8'), d('1142.8'), d(1))).toBeNull()
    })
})

describe('equitySeries', () => {
    const days = lastLocalDays(10, 'UTC', at('2026-11-06T15:00:00Z'))

    it('starts at the opening day and ends on the current equity', () => {
        const points = equitySeries(account, trades, cash, days)
        expect(points[0].date).toBe('2026-11-01')
        expect(points.at(-1)).toMatchObject({ date: '2026-11-06', value: 1142.8 })
    })

    it('steps on the day of each trade and cash movement, and marks the cash ones', () => {
        const byDate = Object.fromEntries(equitySeries(account, trades, cash, days).map(p => [p.date, p]))
        expect(byDate['2026-11-01'].value).toBe(1000)
        expect(byDate['2026-11-03'].value).toBe(1300.3)
        expect(byDate['2026-11-03'].movements).toEqual([{ type: 'DEPOSIT', amountUsd: 300 }])
        expect(byDate['2026-11-02'].movements).toEqual([])
    })

    it('includes activity from before the range in the first point', () => {
        const short = lastLocalDays(2, 'UTC', at('2026-11-06T15:00:00Z'))
        const points = equitySeries(account, trades, cash, short)
        expect(points.map(p => p.date)).toEqual(['2026-11-05', '2026-11-06'])
        expect(points[0].value).toBe(1142.8)
    })
})

describe('lastLocalDays', () => {
    it('crosses month ends and uses local midnights', () => {
        const days = lastLocalDays(3, 'Africa/Johannesburg', at('2026-12-01T10:00:00Z'))
        expect(days.map(x => x.date)).toEqual(['2026-11-29', '2026-11-30', '2026-12-01'])
        // Johannesburg is UTC+2, so its midnight is 22:00 UTC the day before.
        expect(days[2].start.toISOString()).toBe('2026-11-30T22:00:00.000Z')
        expect(days[2].end.toISOString()).toBe('2026-12-01T22:00:00.000Z')
    })
})

describe('titleClashError (D-47)', () => {
    const other = { id: 'b', broker: 'Exness', style: 'SWING', accountNumber: '5512' }

    it('allows a different broker or style', () => {
        expect(titleClashError({ broker: 'Exness', style: 'BOT' }, [other])).toBeNull()
        expect(titleClashError({ broker: 'FP Markets', style: 'SWING' }, [other])).toBeNull()
    })

    it('requires a distinct account number when broker and style match (ignoring case and spaces)', () => {
        expect(titleClashError({ broker: ' exness ', style: 'SWING' }, [other])).toMatch(/last 4 digits/)
        expect(titleClashError({ broker: 'Exness', style: 'SWING', accountNumber: '5512' }, [other])).toMatch(/also ends in 5512/)
        expect(titleClashError({ broker: 'Exness', style: 'SWING', accountNumber: '1093' }, [other])).toBeNull()
    })

    it("doesn't compare an account with itself when editing", () => {
        expect(titleClashError({ ...other }, [other])).toBeNull()
    })
})

describe('DTOs', () => {
    it('never sends the encrypted credentials, only whether there are any', () => {
        const dto = toAccountDTO({ ...account, credentialsEncrypted: 'secret' })
        expect(dto).not.toHaveProperty('credentialsEncrypted')
        expect(dto).toMatchObject({ hasCredentials: true, openingBalance: 1000, openingBalanceUsd: 1000 })
    })

    it('turns cash Decimals into numbers', () => {
        expect(toCashDTO({ id: 'c', amount: d(-100), fxRate: d(1), amountUsd: d(-100) })).toEqual({ id: 'c', amount: -100, fxRate: 1, amountUsd: -100 })
    })
})

describe('account validators', () => {
    const valid = { provider: 'MT5', broker: ' Exness ', style: 'BOT', category: 'FOREX', currency: 'USD', openingBalance: 2500 }

    it('accepts a manual or MT5 account and strips what the client may not set', () => {
        const parsed = createAccountSchema.parse({ ...valid, userId: 'x', archivedAt: '2026-01-01', openingBalanceUsd: 1 })
        expect(parsed).toEqual({ ...valid, broker: 'Exness' })
    })

    it('refuses synced types until their adapters exist', () => {
        expect(createAccountSchema.safeParse({ ...valid, provider: 'CTRADER' }).success).toBe(false)
        expect(createAccountSchema.safeParse({ ...valid, provider: 'BINANCE' }).success).toBe(false) // needs a key
    })

    it('requires a style on new accounts (D-47) and 4-digit account numbers', () => {
        expect(createAccountSchema.safeParse({ ...valid, style: undefined }).success).toBe(false)
        expect(createAccountSchema.safeParse({ ...valid, accountNumber: '12345' }).success).toBe(false)
    })

    it("can't clear a style or change broker and currency on edit", () => {
        expect(updateAccountSchema.safeParse({ style: null }).success).toBe(false)
        expect(updateAccountSchema.safeParse({ broker: 'Other' }).success).toBe(false) // nothing editable left
        expect(updateAccountSchema.parse({ accountNumber: '' })).toEqual({ accountNumber: null })
    })

    it('only takes positive deposit and withdrawal amounts; corrections go through their own endpoint', () => {
        const base = { type: 'DEPOSIT', amount: 100, currency: 'ZAR', occurredAt: '2026-11-03T12:00:00Z' }
        expect(cashMovementSchema.safeParse(base).success).toBe(true)
        expect(cashMovementSchema.safeParse({ ...base, amount: -100 }).success).toBe(false)
        expect(cashMovementSchema.safeParse({ ...base, type: 'ADJUSTMENT' }).success).toBe(false)
    })
})
