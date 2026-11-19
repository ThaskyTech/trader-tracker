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

// A Binance API key and secret: 64 letters and digits each today; a little leeway in
// case Binance changes the length. Checked again by Binance itself when verifying.
const apiKeyPart = z.string().trim().min(20).max(128).regex(/^[A-Za-z0-9]+$/, 'Letters and digits only. Copy it again from Binance.')
export const binanceCredentialsSchema = z.object({ apiKey: apiKeyPart, apiSecret: apiKeyPart })

const provider = z.enum(PROVIDERS).refine(p => CREATABLE_PROVIDERS.includes(p), {
    message: "Syncing this type of account isn't available yet. Add it as MT5 or Other (manual) for now.",
})

// Manual and MT5 accounts: the user names the broker and gives today's balance (D-19).
const manualAccountSchema = z.object({
    provider: z.enum(['MT5', 'MANUAL']),
    broker: z.string().trim().min(1).max(50),
    style,
    category,
    currency: z.enum(CURRENCIES),
    accountNumber: accountNumber.nullable().optional(),
    // D-19: what the broker shows today, in the account's currency. Trades closed and
    // cash moved from now on are added to it.
    openingBalance: z.number().min(0).lt(MAX_AMOUNT).default(0),
})

// Binance Futures (D-12): the broker, currency and balance come from Binance itself
// (USDT counts as USD, D-26), so only the style, category and key are asked for.
const binanceAccountSchema = z.object({
    provider: z.literal('BINANCE'),
    style,
    category: category.default('CRYPTO'),
    accountNumber: accountNumber.nullable().optional(),
    credentials: binanceCredentialsSchema,
}).transform(data => ({ ...data, broker: 'Binance', currency: 'USD', openingBalance: 0 }))

// POST /accounts. Fields a user may set; anything else (userId, sync status,
// encrypted credentials, archivedAt, opening rate or USD value) is stripped.
// The provider is checked first so an unsupported one gets a clear message.
export const createAccountSchema = z.object({ provider }).loose().transform((data, ctx) => {
    const result = (data.provider === 'BINANCE' ? binanceAccountSchema : manualAccountSchema).safeParse(data)
    if(!result.success){
        for(const issue of result.error.issues) ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path })
        return z.NEVER
    }
    return result.data
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
