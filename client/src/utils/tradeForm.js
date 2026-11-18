// Helpers for the trade form. No React in here, so the logic is easy to test on its own.
//
// The form keeps every value as a string (that's what inputs give you), and only
// converts to numbers and ISO timestamps when building the request. This avoids
// fighting the input while the user is mid-typing, e.g. "0." or "-".

import { CURRENCY_CODES } from './currency'

// Same limits the server enforces (server/src/validators/trade.schema.js).
const MAX_AMOUNT = 1e12
const CLOCK_SKEW_MS = 5 * 60 * 1000

const pad = n => String(n).padStart(2, '0')

// 'YYYY-MM-DD' for a Date, in the browser's timezone.
export function toLocalDateString(date){
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Value for <input type="datetime-local">: 'YYYY-MM-DDTHH:mm', in the browser's timezone.
// Minutes are precise enough for a journal, and leaving out seconds keeps the picker quick.
export function toLocalInputValue(date){
    return `${toLocalDateString(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// datetime-local values have no timezone. new Date() reads them as local time, and
// toISOString() turns that into an unambiguous UTC timestamp for the server.
export function localInputToISO(value){
    if(!value) return null
    const date = new Date(value)
    return isNaN(date.getTime()) ? null : date.toISOString()
}

// Accepts "1250.5", "0,5" (comma decimal) or "1 250.50". Returns null if it isn't a plain
// non-negative number. "1,250.50" is rejected rather than guessed at.
export function parseAmount(raw){
    const cleaned = String(raw ?? '').replace(/\s/g, '').replace(',', '.')
    if(!/^(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null
    return Number(cleaned)
}

// A blank form. `dateString` ('YYYY-MM-DD') comes from the Daily Log's "add" button:
// for a past day, the times start at midday on that day instead of right now.
// `currency` is the P&L currency to start with.
export function emptyForm(dateString, currency = 'USD', now = new Date()){
    const time = dateString && dateString !== toLocalDateString(now)
        ? `${dateString}T12:00`
        : toLocalInputValue(now)

    return {
        symbol: '',
        direction: 'LONG',
        // The account the trade was on (D-37); the broker name comes from the account.
        accountId: '',
        lotSize: '',
        entryPrice: '',
        exitPrice: '',
        // The P&L sign is a toggle, because phone number keyboards often have no minus key.
        pnlSign: 'PROFIT',
        pnlAmount: '',
        pnlCurrency: currency,
        openedAt: time,
        closedAt: time,
        notes: ''
    }
}

// Fill the form from a trade returned by the API (edit mode).
export function tradeToForm(trade){
    return {
        symbol: trade.symbol,
        direction: trade.direction,
        accountId: trade.accountId,
        lotSize: String(trade.lotSize),
        entryPrice: String(trade.entryPrice),
        exitPrice: String(trade.exitPrice),
        pnlSign: trade.pnl < 0 ? 'LOSS' : 'PROFIT',
        // pnl is the amount as entered, in pnlCurrency (pnlUsd is the converted copy).
        pnlAmount: String(Math.abs(trade.pnl)),
        pnlCurrency: trade.pnlCurrency,
        openedAt: toLocalInputValue(new Date(trade.openedAt)),
        closedAt: toLocalInputValue(new Date(trade.closedAt)),
        notes: trade.notes ?? ''
    }
}

function checkAmount(raw, { allowZero = false } = {}){
    const value = parseAmount(raw)
    if(value === null) return { error: String(raw ?? '').trim() ? 'Enter a plain number, e.g. 1250.50.' : 'Required.' }
    if(!allowZero && value === 0) return { error: 'Must be more than 0.' }
    if(value >= MAX_AMOUNT) return { error: 'That number is too large.' }
    return { value }
}

// Checks the form and builds the request body. Returns { payload } when valid,
// or { errors } keyed by form field name. The server checks everything again;
// this is only so the user gets instant feedback.
export function validateForm(form, now = new Date()){
    const errors = {}
    const symbol = form.symbol.trim()
    const notes = form.notes.trim()

    if(!symbol) errors.symbol = 'Required, e.g. EURUSD.'
    else if(symbol.length > 30) errors.symbol = 'At most 30 characters.'

    if(!form.accountId) errors.accountId = 'Choose the account this trade was on.'

    const lotSize = checkAmount(form.lotSize)
    const entryPrice = checkAmount(form.entryPrice)
    const exitPrice = checkAmount(form.exitPrice)
    const pnl = checkAmount(form.pnlAmount, { allowZero: true })
    if(lotSize.error) errors.lotSize = lotSize.error
    if(entryPrice.error) errors.entryPrice = entryPrice.error
    if(exitPrice.error) errors.exitPrice = exitPrice.error
    if(pnl.error) errors.pnlAmount = pnl.error === 'Required.' ? 'Required. Use 0 for break-even.' : pnl.error
    if(!CURRENCY_CODES.includes(form.pnlCurrency)) errors.pnlCurrency = 'Pick a currency.'

    const openedAt = localInputToISO(form.openedAt)
    const closedAt = localInputToISO(form.closedAt)
    if(!openedAt) errors.openedAt = 'Pick a date and time.'
    if(!closedAt) errors.closedAt = 'Pick a date and time.'
    else if(openedAt && closedAt < openedAt) errors.closedAt = 'Must be the same as or after the open time.'
    else if(new Date(closedAt).getTime() > now.getTime() + CLOCK_SKEW_MS) errors.closedAt = 'Cannot be in the future.'

    if(notes.length > 2000) errors.notes = `At most 2000 characters (currently ${notes.length}).`

    if(Object.keys(errors).length > 0) return { errors }

    return {
        payload: {
            symbol: symbol.toUpperCase(),
            direction: form.direction,
            accountId: form.accountId,
            lotSize: lotSize.value,
            entryPrice: entryPrice.value,
            exitPrice: exitPrice.value,
            // `|| 0` turns a "loss of 0" (-0) into a plain 0.
            pnl: form.pnlSign === 'LOSS' ? -pnl.value || 0 : pnl.value,
            pnlCurrency: form.pnlCurrency,
            openedAt,
            closedAt,
            notes: notes || null
        }
    }
}

// For edits, send only what changed. Untouched fields keep their stored values exactly,
// e.g. the seconds on a timestamp, which the datetime input doesn't show.
export function changedFields(payload, original){
    return Object.fromEntries(Object.entries(payload).filter(([key, value]) => value !== original[key]))
}

// The server names the P&L field `pnl`. In the form it's `pnlAmount`.
const SERVER_TO_FORM_FIELD = { pnl: 'pnlAmount' }

// Server validation details look like { lotSize: ['Too small: ...'] }. Turn them into
// { lotSize: 'Too small: ...' } so each message can show under its input.
export function serverFieldErrors(details){
    if(!details) return {}
    return Object.fromEntries(
        Object.entries(details)
            .filter(([, messages]) => messages?.length)
            .map(([field, messages]) => [SERVER_TO_FORM_FIELD[field] ?? field, messages[0]])
    )
}
