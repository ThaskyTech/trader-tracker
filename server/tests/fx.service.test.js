import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Prisma } from '@prisma/client'

// Stand-ins for the database and the Frankfurter API, so these tests run offline
// and never touch real data.
const db = vi.hoisted(() => ({
    fxRate: { findUnique: vi.fn(), createMany: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() }
}))
vi.mock('../src/config/db.js', () => ({ default: db }))

const { getRateForDate, convertPnl, toUsd, getLatestRates, clearLatestRatesCache } = await import('../src/services/fx.service.js')

const RATES = { AUD: 1.4848, EUR: 0.91, GBP: 0.75808, JPY: 159.3, ZAR: 16.9327 }
const apiReturns = (body, ok = true) => vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body })

beforeEach(() => {
    vi.resetAllMocks()
    clearLatestRatesCache()
})
afterEach(() => vi.unstubAllGlobals())

describe('toUsd', () => {
    it('divides by the rate and rounds to 8 decimal places', () => {
        expect(toUsd(1250, new Prisma.Decimal('16.9327')).toString()).toBe('73.82165868')
        expect(toUsd(-100, new Prisma.Decimal('0.91')).toString()).toBe('-109.89010989')
    })
})

describe('getRateForDate', () => {
    it('never calls the API for USD', async () => {
        const fetch = vi.fn()
        vi.stubGlobal('fetch', fetch)
        expect((await getRateForDate('USD', new Date())).toString()).toBe('1')
        expect(fetch).not.toHaveBeenCalled()
        expect(db.fxRate.findUnique).not.toHaveBeenCalled()
    })

    it('uses a saved rate without calling the API', async () => {
        const fetch = vi.fn()
        vi.stubGlobal('fetch', fetch)
        db.fxRate.findUnique.mockResolvedValue({ rate: new Prisma.Decimal('16.9635') })

        const rate = await getRateForDate('ZAR', new Date('2026-11-14T15:00:00Z'))

        expect(rate.toString()).toBe('16.9635')
        expect(db.fxRate.findUnique).toHaveBeenCalledWith({
            where: { date_currency: { date: new Date('2026-11-14T00:00:00Z'), currency: 'ZAR' } }
        })
        expect(fetch).not.toHaveBeenCalled()
    })

    it('fetches a missing day once and saves every currency for it', async () => {
        db.fxRate.findUnique.mockResolvedValue(null)
        const fetch = apiReturns({ date: '2026-11-13', rates: RATES })
        vi.stubGlobal('fetch', fetch)

        const rate = await getRateForDate('GBP', new Date('2026-11-14T15:00:00Z'))

        expect(rate.toString()).toBe('0.75808')
        expect(fetch.mock.calls[0][0]).toBe('https://api.frankfurter.dev/v1/2026-11-14?base=USD&symbols=EUR,GBP,JPY,AUD,ZAR')
        const saved = db.fxRate.createMany.mock.calls[0][0]
        expect(saved.skipDuplicates).toBe(true)
        expect(saved.data.map(r => r.currency)).toEqual(['EUR', 'GBP', 'JPY', 'AUD', 'ZAR'])
    })

    it('gives a clear 503 when the API is down', async () => {
        db.fxRate.findUnique.mockResolvedValue(null)
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

        await expect(getRateForDate('EUR', new Date())).rejects.toMatchObject({ status: 503 })
    })
})

describe('convertPnl', () => {
    it('returns the rate and the USD amount', async () => {
        db.fxRate.findUnique.mockResolvedValue({ rate: new Prisma.Decimal('16.9327') })

        const { fxRate, pnlUsd } = await convertPnl({ pnl: -1250, pnlCurrency: 'ZAR', closedAt: new Date('2026-11-17T10:00:00Z') })

        expect(fxRate.toString()).toBe('16.9327')
        expect(pnlUsd.toString()).toBe('-73.82165868')
    })
})

describe('getLatestRates', () => {
    it('caches the latest rates instead of calling the API every time', async () => {
        const fetch = apiReturns({ date: '2026-11-17', rates: RATES })
        vi.stubGlobal('fetch', fetch)

        await getLatestRates()
        const { date, rates } = await getLatestRates()

        expect(fetch).toHaveBeenCalledTimes(1)
        expect(date).toBe('2026-11-17')
        expect(rates.USD.toString()).toBe('1')
        expect(rates.ZAR.toString()).toBe('16.9327')
    })

    it('falls back to the newest saved rates when the API is down', async () => {
        vi.stubGlobal('fetch', apiReturns({}, false))
        const day = new Date('2026-11-13T00:00:00Z')
        db.fxRate.findFirst.mockResolvedValue({ date: day })
        db.fxRate.findMany.mockResolvedValue(
            Object.entries(RATES).map(([currency, rate]) => ({ currency, rate: new Prisma.Decimal(rate) }))
        )

        const { date, rates } = await getLatestRates()

        expect(date).toBe('2026-11-13')
        expect(rates.EUR.toString()).toBe('0.91')
    })
})
