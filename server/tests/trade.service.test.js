import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
import { summarizeTrades, dailyTotals, toTradeDTO, tradeFilterWhere, encodeCursor, decodeCursor, afterCursorWhere } from '../src/services/trade.service.js'

const d = (value) => new Prisma.Decimal(value)

describe('summarizeTrades', () => {
    it('adds money exactly (floats would give 0.30000000000000004)', () => {
        expect(summarizeTrades([{ pnlUsd: d('0.1') }, { pnlUsd: d('0.2') }]).totalPnl).toBe(0.3)
    })

    it('counts wins, losses and break-evens', () => {
        const summary = summarizeTrades([{ pnlUsd: d(100) }, { pnlUsd: d(-40) }, { pnlUsd: d(0) }, { pnlUsd: d(25.5) }])
        expect(summary).toEqual({ totalPnl: 85.5, wins: 2, losses: 1, totalTrades: 4, winRate: 50 })
    })

    it('rounds the win rate to one decimal place', () => {
        expect(summarizeTrades([{ pnlUsd: d(1) }, { pnlUsd: d(-1) }, { pnlUsd: d(-1) }]).winRate).toBe(33.3)
    })

    it('handles no trades', () => {
        expect(summarizeTrades([])).toEqual({ totalPnl: 0, wins: 0, losses: 0, totalTrades: 0, winRate: 0 })
    })
})

describe('dailyTotals', () => {
    it('groups P&L by the day the callback returns', () => {
        const trades = [
            { closedAt: new Date('2026-11-01T10:00:00Z'), pnlUsd: d('100.10') },
            { closedAt: new Date('2026-11-01T12:00:00Z'), pnlUsd: d('-50.05') },
            { closedAt: new Date('2026-11-02T10:00:00Z'), pnlUsd: d(20) }
        ]
        expect(dailyTotals(trades, date => date.getUTCDate())).toEqual({ 1: 50.05, 2: 20 })
    })
})

describe('toTradeDTO', () => {
    it('turns Decimal fields into plain numbers for JSON', () => {
        const dto = toTradeDTO({ id: 't1', symbol: 'BTCUSDT', lotSize: d('0.015'), entryPrice: d('64201.5'), exitPrice: d('65000'), pnl: d('200'), pnlUsd: d('11.81'), fxRate: d('16.9327') })
        expect(dto).toEqual({ id: 't1', symbol: 'BTCUSDT', lotSize: 0.015, entryPrice: 64201.5, exitPrice: 65000, pnl: 200, pnlUsd: 11.81, fxRate: 16.9327 })
    })
})

describe('tradeFilterWhere', () => {
    it('builds no conditions without filters', () => {
        expect(tradeFilterWhere({})).toEqual({})
    })

    it('filters by direction and by the sign of the USD P&L (break-even matches neither)', () => {
        expect(tradeFilterWhere({ direction: 'SHORT', outcome: 'PROFIT' })).toEqual({ direction: 'SHORT', pnlUsd: { gt: 0 } })
        expect(tradeFilterWhere({ outcome: 'LOSS' })).toEqual({ pnlUsd: { lt: 0 } })
    })
})

describe('trade list cursors', () => {
    const trade = { id: '6f1c2a9e-0000-4000-8000-000000000001', closedAt: new Date('2026-11-17T10:00:00.000Z') }

    it('round-trips the last trade of a page', () => {
        expect(decodeCursor(encodeCursor(trade))).toEqual(trade)
    })

    it('rejects malformed cursors', () => {
        for(const bad of ['', 'not-a-cursor', Buffer.from('nonsense|').toString('base64url'), Buffer.from('2026-11-17T10:00:00Z|a|b').toString('base64url')]){
            expect(decodeCursor(bad)).toBeNull()
        }
    })

    it('continues after the cursor, using id to order trades that closed at the same moment', () => {
        expect(afterCursorWhere(trade)).toEqual({
            OR: [{ closedAt: { lt: trade.closedAt } }, { closedAt: trade.closedAt, id: { lt: trade.id } }]
        })
    })
})
