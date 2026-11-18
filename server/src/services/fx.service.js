import { Prisma } from '@prisma/client'
import prisma from '../config/db.js'
import { HttpError } from '../middleware/error.middleware.js'
import { CURRENCIES, BASE_CURRENCY } from '../utils/currency.js'

// Exchange rates come from Frankfurter (https://frankfurter.dev): free, no API key,
// European Central Bank reference rates, published once per working day.
const FX_API = 'https://api.frankfurter.dev/v1'
const QUOTE_CURRENCIES = CURRENCIES.filter(c => c !== BASE_CURRENCY)
const REQUEST_TIMEOUT_MS = 8000
const LATEST_CACHE_MS = 60 * 60 * 1000 // ECB rates only change daily, so an hour is plenty.

// Rates go in and out of this service as Decimal, like the money columns.
const one = () => new Prisma.Decimal(1)

// Calls Frankfurter and returns { date, rates: { EUR: Decimal, ..., USD: 1 } }.
async function fetchRates(path){
    let response
    try {
        response = await fetch(`${FX_API}/${path}?base=${BASE_CURRENCY}&symbols=${QUOTE_CURRENCIES.join(',')}`, {
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        })
    } catch (err) {
        console.error('FX rate request failed:', err.message)
        throw new HttpError(503, 'Could not get exchange rates right now. Try again shortly, or enter the P&L in USD.')
    }
    if(!response.ok){
        console.error(`FX rate request failed: HTTP ${response.status} for ${path}`)
        throw new HttpError(503, 'Could not get exchange rates right now. Try again shortly, or enter the P&L in USD.')
    }

    const body = await response.json()
    const rates = { [BASE_CURRENCY]: one() }
    for(const currency of QUOTE_CURRENCIES){
        if(body.rates?.[currency] == null) throw new HttpError(503, `No exchange rate available for ${currency}.`)
        rates[currency] = new Prisma.Decimal(body.rates[currency])
    }
    return { date: body.date, rates }
}

// 'YYYY-MM-DD' of an instant, in UTC. Rates are looked up by the UTC day a trade closed.
const utcDay = date => date.toISOString().slice(0, 10)

// Units of `currency` per 1 USD on the day of `date`. Each day is fetched from the API
// once, then read from the fx_rates table.
export async function getRateForDate(currency, date){
    if(currency === BASE_CURRENCY) return one()

    const day = new Date(utcDay(date)) // midnight UTC, matching the DATE column
    const stored = await prisma.fxRate.findUnique({ where: { date_currency: { date: day, currency } } })
    if(stored) return stored.rate

    const { rates } = await fetchRates(utcDay(date))
    // Save every currency for that day, so other currencies on the same day skip the API.
    // skipDuplicates covers two requests saving the same day at the same time.
    await prisma.fxRate.createMany({
        data: QUOTE_CURRENCIES.map(c => ({ date: day, currency: c, rate: rates[c] })),
        skipDuplicates: true
    })
    return rates[currency]
}

// Converts an amount in `rate`'s currency to USD, rounded to the 8 places the column holds.
export function toUsd(amount, rate){
    return new Prisma.Decimal(amount).div(rate).toDecimalPlaces(8)
}

// Fills in fxRate and pnlUsd for a trade's P&L. Uses the rate from the day the trade closed.
export async function convertPnl({ pnl, pnlCurrency, closedAt }){
    const fxRate = await getRateForDate(pnlCurrency, closedAt)
    return { fxRate, pnlUsd: toUsd(pnl, fxRate) }
}

// Latest rates, for showing USD amounts in the user's display currency.
// Kept in memory for an hour. If Frankfurter is down, falls back to the last
// rates we have (in memory, then in the database) rather than failing.
let latestCache = null

export async function getLatestRates(){
    if(latestCache && Date.now() - latestCache.fetchedAt < LATEST_CACHE_MS) return latestCache.value

    try {
        const value = await fetchRates('latest')
        latestCache = { value, fetchedAt: Date.now() }
        return value
    } catch (err) {
        if(latestCache) return latestCache.value

        const newest = await prisma.fxRate.findFirst({ orderBy: { date: 'desc' }, select: { date: true } })
        if(!newest) throw err
        const rows = await prisma.fxRate.findMany({ where: { date: newest.date } })
        const rates = { [BASE_CURRENCY]: one() }
        for(const row of rows) rates[row.currency] = row.rate
        if(QUOTE_CURRENCIES.some(c => !rates[c])) throw err
        return { date: utcDay(newest.date), rates }
    }
}

// Test helper: forget the in-memory latest rates.
export function clearLatestRatesCache(){ latestCache = null }
