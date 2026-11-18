import { describe, it, expect } from 'vitest'
import { createTradeSchema, updateTradeSchema, monthQuerySchema } from '../src/validators/trade.schema.js'

const validTrade = {
    symbol: ' eurusd ',
    direction: 'LONG',
    broker: 'Exness',
    lotSize: 0.5,
    entryPrice: 1.0821,
    exitPrice: 1.0855,
    pnl: 170,
    openedAt: '2026-11-17T08:00:00.000Z',
    closedAt: '2026-11-17T10:30:00+02:00'
}

const issuesFor = (schema, input) => {
    const result = schema.safeParse(input)
    return result.success ? [] : result.error.issues.map(i => i.path.join('.'))
}

describe('createTradeSchema', () => {
    it('accepts a valid trade, tidies the symbol and converts timestamps to Dates', () => {
        const trade = createTradeSchema.parse(validTrade)
        expect(trade.symbol).toBe('EURUSD')
        expect(trade.closedAt).toBeInstanceOf(Date)
        expect(trade.closedAt.toISOString()).toBe('2026-11-17T08:30:00.000Z')
    })

    it('strips fields the client must not set', () => {
        const trade = createTradeSchema.parse({ ...validTrade, userId: 'someone-else', source: 'BINANCE', id: 'x' })
        expect(trade).not.toHaveProperty('userId')
        expect(trade).not.toHaveProperty('source')
        expect(trade).not.toHaveProperty('id')
    })

    it('reports every missing required field', () => {
        expect(issuesFor(createTradeSchema, {})).toEqual(
            expect.arrayContaining(['symbol', 'direction', 'broker', 'lotSize', 'entryPrice', 'exitPrice', 'pnl', 'openedAt', 'closedAt'])
        )
    })

    it.each([
        ['negative lot size', { lotSize: -1 }, 'lotSize'],
        ['zero entry price', { entryPrice: 0 }, 'entryPrice'],
        ['number sent as a string', { pnl: '170' }, 'pnl'],
        ['amount too big for the column', { exitPrice: 1e13 }, 'exitPrice'],
        ['unknown direction', { direction: 'UP' }, 'direction'],
        ['timestamp without a timezone', { openedAt: '2026-11-17T08:00:00' }, 'openedAt'],
        ['closed before it opened', { closedAt: '2026-11-17T07:00:00.000Z' }, 'closedAt'],
        ['closed in the future', { closedAt: '2099-01-01T00:00:00.000Z' }, 'closedAt'],
        ['empty symbol', { symbol: '   ' }, 'symbol']
    ])('rejects %s', (_, override, field) => {
        expect(issuesFor(createTradeSchema, { ...validTrade, ...override })).toContain(field)
    })

    it('defaults the P&L currency to USD and accepts the supported ones', () => {
        expect(createTradeSchema.parse(validTrade).pnlCurrency).toBe('USD')
        expect(createTradeSchema.parse({ ...validTrade, pnlCurrency: 'ZAR' }).pnlCurrency).toBe('ZAR')
    })

    it('rejects an unsupported currency, and ignores client-sent USD values', () => {
        expect(issuesFor(createTradeSchema, { ...validTrade, pnlCurrency: 'CAD' })).toContain('pnlCurrency')
        const trade = createTradeSchema.parse({ ...validTrade, pnlUsd: 999999, fxRate: 1 })
        expect(trade).not.toHaveProperty('pnlUsd')
        expect(trade).not.toHaveProperty('fxRate')
    })

    it('allows a negative P&L', () => {
        expect(createTradeSchema.safeParse({ ...validTrade, pnl: -45.25 }).success).toBe(true)
    })
})

describe('updateTradeSchema', () => {
    it('accepts a partial update', () => {
        expect(updateTradeSchema.parse({ notes: 'moved SL to BE' })).toEqual({ notes: 'moved SL to BE' })
    })

    it('rejects an empty update', () => {
        expect(updateTradeSchema.safeParse({}).success).toBe(false)
    })
})

describe('monthQuerySchema', () => {
    it('coerces query strings and defaults the timezone to UTC', () => {
        expect(monthQuerySchema.parse({ year: '2026', month: '11' })).toEqual({ year: 2026, month: 11, tz: 'UTC' })
    })

    it('rejects a bad month or timezone', () => {
        expect(monthQuerySchema.safeParse({ month: '13' }).success).toBe(false)
        expect(monthQuerySchema.safeParse({ tz: 'Nowhere/City' }).success).toBe(false)
    })
})
