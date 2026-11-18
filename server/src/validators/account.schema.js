import { z } from 'zod'
import { CURRENCIES } from '../utils/currency.js'
import { CATEGORIES, CREATABLE_PROVIDERS, PROVIDERS, STYLES } from '../utils/accounts.js'
import { isValidTimeZone, DEFAULT_TIME_ZONE } from '../utils/time.js'

// Same limit as trades: Decimal(20, 8) holds at most 12 digits before the point.
const MAX_AMOUNT = 1e12

const timestamp = z.iso.datetime({ offset: true }).transform(value => new Date(value))

// Last 4 digits only (D-47): enough to tell two accounts apart, without storing the full number.
const accountNumber = z.string().regex(/^\d{4}$/, 'Exactly 4 digits.')

const style = z.enum(STYLES)
const category = z.enum(CATEGORIES)

// POST /accounts. Fields a user may set; anything else (userId, sync status,
// credentials, archivedAt, opening rate or USD value) is stripped.
export const createAccountSchema = z.object({
    provider: z.enum(PROVIDERS).refine(p => CREATABLE_PROVIDERS.includes(p), {
        message: "Syncing this type of account isn't available yet. Add it as MT5 or Other (manual) for now.",
    }),
    broker: z.string().trim().min(1).max(50),
    style,
    category,
    currency: z.enum(CURRENCIES),
    accountNumber: accountNumber.nullable().optional(),
    // D-19: what the broker shows today, in the account's currency. Trades closed and
    // cash moved from now on are added to it.
    openingBalance: z.number().min(0).lt(MAX_AMOUNT).default(0),
})

// PATCH /accounts/:id. Broker and currency can't change: trades and cash movements
// were recorded against them. Style can be set but not cleared (D-47).
export const updateAccountSchema = z.object({
    style,
    category,
    // null or '' clears it.
    accountNumber: z.union([accountNumber, z.literal('').transform(() => null), z.null()]),
}).partial().refine(data => Object.keys(data).length > 0, { message: 'Provide at least one field to update.' })

// POST /accounts/:id/cash. The amount is always positive; the type says which way it went.
// Adjustments aren't accepted here: they're made through balance-correction, which
// works out the difference itself.
export const cashMovementSchema = z.object({
    type: z.enum(['DEPOSIT', 'WITHDRAWAL']),
    amount: z.number().positive().lt(MAX_AMOUNT),
    currency: z.enum(CURRENCIES),
    occurredAt: timestamp,
    note: z.string().trim().max(120).nullable().optional(),
})

// POST /accounts/:id/balance-correction: the balance the broker shows, in the account's currency.
export const balanceCorrectionSchema = z.object({
    balance: z.number().min(0).lt(MAX_AMOUNT),
})

const tz = z.string()
    .refine(isValidTimeZone, { message: 'Unknown timezone. Use an IANA name such as Africa/Johannesburg.' })
    .default(DEFAULT_TIME_ZONE)

// GET /accounts and /accounts/:id: tz decides which days count as "this month" on the card.
export const accountQuerySchema = z.object({ tz })

// GET /accounts/:id/equity?days=90
export const equityQuerySchema = z.object({
    tz,
    days: z.coerce.number().int().min(7).max(366).default(90),
})
