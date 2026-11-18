import prisma from '../config/db.js'
import { HttpError } from '../middleware/error.middleware.js'
import {
    toTradeDTO, summarizeTrades, dailyTotals, TRADE_INCLUDE,
    tradeFilterWhere, TRADE_LIST_ORDER, encodeCursor, decodeCursor, afterCursorWhere
} from '../services/trade.service.js'
import { convertPnl } from '../services/fx.service.js'
import {
    createTradeSchema, updateTradeSchema, checkTradeTimes,
    dayQuerySchema, monthQuerySchema, listTradesQuerySchema, tradeFilterSchema
} from '../validators/trade.schema.js'
import { findWritableAccount } from './account.controller.js'
import { getLocalParts, localDayRange, localMonthRange, parseDateString } from '../utils/time.js'

// No try/catch here: Express 5 sends any thrown error, including a ZodError from
// .parse(), to errorHandler in error.middleware.js, which builds the response.

// Year and month from the query, defaulting to the current month in the user's timezone.
function resolveMonth(query){
    const { tz, year, month, accountId } = monthQuerySchema.parse(query)
    const now = getLocalParts(new Date(), tz)
    return { tz, year: year ?? now.year, month: month ?? now.month, accountId }
}

export async function createTrade(req, res){
    const data = createTradeSchema.parse(req.body)
    // Another user's account is a 404 and an archived one a 400 (D-18, D-33).
    await findWritableAccount(req.userId, data.accountId)
    // Store the USD value alongside what was typed, using the rate on the close date.
    const fx = await convertPnl(data)

    const trade = await prisma.trade.create({
        data: { ...data, ...fx, userId: req.userId, source: 'MANUAL' },
        include: TRADE_INCLUDE
    })

    res.status(201).json({ trade: toTradeDTO(trade) })
}

// GET /trades?limit=50&direction=LONG&outcome=PROFIT&cursor=...
// -> { trades, nextCursor }. nextCursor is null on the last page.
export async function getTrades(req, res){
    const { limit, cursor, ...filters } = listTradesQuerySchema.parse(req.query)

    let after = {}
    if(cursor){
        const position = decodeCursor(cursor)
        if(!position) throw new HttpError(400, 'Invalid cursor.')
        after = afterCursorWhere(position)
    }

    // Ask for one extra row: if it comes back, there's another page.
    const rows = await prisma.trade.findMany({
        where: { userId: req.userId, ...tradeFilterWhere(filters), ...after },
        orderBy: TRADE_LIST_ORDER,
        take: limit === undefined ? undefined : limit + 1,
        include: TRADE_INCLUDE
    })

    const hasMore = limit !== undefined && rows.length > limit
    const trades = hasMore ? rows.slice(0, limit) : rows

    res.status(200).json({
        trades: trades.map(toTradeDTO),
        nextCursor: hasMore ? encodeCursor(trades.at(-1)) : null
    })
}

// GET /trades/:id — one trade, used by the edit form.
export async function getTrade(req, res){
    const trade = await prisma.trade.findFirst({ where: { id: req.params.id, userId: req.userId }, include: TRADE_INCLUDE })
    if(!trade) throw new HttpError(404, 'Trade not found.')

    res.status(200).json({ trade: toTradeDTO(trade) })
}

// GET /trades/day/2026-11-17?tz=Africa/Johannesburg
// Trades that closed on that local calendar day.
export async function getTradesByDay(req, res){
    const date = parseDateString(req.params.date)
    if(!date) throw new HttpError(400, 'Invalid date. Use the format YYYY-MM-DD.')

    const { tz, accountId } = dayQuerySchema.parse(req.query)
    const { start, end } = localDayRange(date.year, date.month, date.day, tz)

    const trades = await prisma.trade.findMany({
        where: { userId: req.userId, ...(accountId && { accountId }), closedAt: { gte: start, lt: end } },
        orderBy: { closedAt: 'desc' },
        include: TRADE_INCLUDE
    })

    res.status(200).json({ trades: trades.map(toTradeDTO) })
}

export async function updateTrade(req, res){
    const data = updateTradeSchema.parse(req.body)

    // Look the trade up by id AND owner. Someone else's trade gives the same 404
    // as a missing one, so the API never reveals that it exists.
    const existing = await prisma.trade.findFirst({ where: { id: req.params.id, userId: req.userId } })
    if(!existing) throw new HttpError(404, 'Trade not found.')

    const problem = checkTradeTimes({
        openedAt: data.openedAt ?? existing.openedAt,
        closedAt: data.closedAt ?? existing.closedAt
    })
    if(problem) throw new HttpError(400, `closedAt: ${problem}`)

    // Moving a trade to another account: same checks as creating one there.
    if(data.accountId && data.accountId !== existing.accountId) await findWritableAccount(req.userId, data.accountId)

    // The USD value depends on the amount, its currency and the close date (which
    // picks the rate). If any of them change, convert again using the merged values.
    let fx = {}
    if(data.pnl !== undefined || data.pnlCurrency !== undefined || data.closedAt !== undefined){
        fx = await convertPnl({
            pnl: data.pnl ?? existing.pnl,
            pnlCurrency: data.pnlCurrency ?? existing.pnlCurrency,
            closedAt: data.closedAt ?? existing.closedAt
        })
    }

    const trade = await prisma.trade.update({ where: { id: existing.id }, data: { ...data, ...fx }, include: TRADE_INCLUDE })

    res.status(200).json({ trade: toTradeDTO(trade) })
}

export async function deleteTrade(req, res){
    // deleteMany with userId checks ownership and deletes in one query.
    const { count } = await prisma.trade.deleteMany({ where: { id: req.params.id, userId: req.userId } })
    if(count === 0) throw new HttpError(404, 'Trade not found.')

    res.status(200).json({ message: 'Trade deleted successfully.' })
}

// GET /trades/summary/month?year=2026&month=11&tz=Africa/Johannesburg
export async function getMonthlySummary(req, res){
    const { tz, year, month, accountId } = resolveMonth(req.query)
    const { start, end } = localMonthRange(year, month, tz)

    const trades = await prisma.trade.findMany({
        where: { userId: req.userId, ...(accountId && { accountId }), closedAt: { gte: start, lt: end } },
        select: { pnlUsd: true }
    })

    res.status(200).json({ year, month, ...summarizeTrades(trades) })
}

// GET /trades/summary/calendar?year=2026&month=11&tz=Africa/Johannesburg
// Net P&L per local day: { days: { 1: 840, 2: -1205, ... } }
export async function getCalendarSummary(req, res){
    const { tz, year, month, accountId } = resolveMonth(req.query)
    const { start, end } = localMonthRange(year, month, tz)

    const trades = await prisma.trade.findMany({
        where: { userId: req.userId, ...(accountId && { accountId }), closedAt: { gte: start, lt: end } },
        select: { closedAt: true, pnlUsd: true }
    })

    const days = dailyTotals(trades, closedAt => getLocalParts(closedAt, tz).day)

    res.status(200).json({ year, month, days })
}

// GET /trades/summary/history?direction=LONG&outcome=PROFIT
// All-time totals, optionally for the same filters as the trade list.
export async function getHistorySummary(req, res){
    const filters = tradeFilterSchema.parse(req.query)

    const trades = await prisma.trade.findMany({
        where: { userId: req.userId, ...tradeFilterWhere(filters) },
        select: { pnlUsd: true }
    })

    res.status(200).json(summarizeTrades(trades))
}
