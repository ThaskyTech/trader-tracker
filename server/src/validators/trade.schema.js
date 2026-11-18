import { z } from 'zod'
import { isValidTimeZone, DEFAULT_TIME_ZONE } from '../utils/time.js'
import { CURRENCIES } from '../utils/currency.js'

// Decimal(20, 8) columns hold at most 12 digits before the decimal point.
// Anything larger would make the database throw, so reject it here as a 400 instead.
const MAX_AMOUNT = 1e12

const positiveAmount = z.number().positive().lt(MAX_AMOUNT)

// Timestamps must be full ISO strings with a timezone, e.g. "2026-11-17T14:30:00.000Z"
// or "2026-11-17T16:30:00+02:00". A timestamp without a timezone is ambiguous.
const timestamp = z.iso.datetime({ offset: true }).transform(value => new Date(value))

// Fields a user may set. Anything else in the body, such as userId, source or id,
// is stripped by zod, so a client can't assign a trade to another user or fake a broker sync.
// fxRate and pnlUsd are also stripped: the server works those out itself.
const tradeFields = {
    symbol: z.string().trim().min(1).max(30).transform(s => s.toUpperCase()),
    direction: z.enum(['LONG', 'SHORT']),
    broker: z.string().trim().min(1).max(50),
    lotSize: positiveAmount,
    entryPrice: positiveAmount,
    exitPrice: positiveAmount,
    // The P&L as the user entered it, in pnlCurrency.
    pnl: z.number().gt(-MAX_AMOUNT).lt(MAX_AMOUNT),
    pnlCurrency: z.enum(CURRENCIES),
    openedAt: timestamp,
    closedAt: timestamp,
    notes: z.string().trim().max(2000).nullable().optional()
}

// Small allowance for clock differences between the user's device and the server.
const CLOCK_SKEW_MS = 5 * 60 * 1000

export function checkTradeTimes({ openedAt, closedAt }){
    if(closedAt < openedAt) return 'closedAt must be the same as or after openedAt.'
    if(closedAt.getTime() > Date.now() + CLOCK_SKEW_MS) return 'closedAt cannot be in the future.'
    return null
}

// On create, a missing currency means USD, so older clients keep working.
export const createTradeSchema = z.object({ ...tradeFields, pnlCurrency: tradeFields.pnlCurrency.default('USD') }).superRefine((trade, ctx) => {
    const problem = checkTradeTimes(trade)
    if(problem) ctx.addIssue({ code: 'custom', message: problem, path: ['closedAt'] })
})

// Every field is optional on update. The time check needs the stored values too,
// so the controller runs it after merging the update into the existing trade.
export const updateTradeSchema = z.object(tradeFields).partial().refine(
    data => Object.keys(data).length > 0,
    { message: 'Provide at least one field to update.' }
)

const timeZoneParam = z.string()
    .refine(isValidTimeZone, { message: 'Unknown timezone. Use an IANA name such as Africa/Johannesburg.' })
    .default(DEFAULT_TIME_ZONE)

export const timeZoneQuerySchema = z.object({ tz: timeZoneParam })

export const monthQuerySchema = z.object({
    tz: timeZoneParam,
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional()
})
