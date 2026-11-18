import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { getLatestRates } from '../services/fx.service.js'

const router = Router()

// Behind login so the app isn't a free public proxy for the rates API.
router.use(requireAuth)

// GET /api/fx/rates -> { base: 'USD', date: '2026-11-17', rates: { USD: 1, ZAR: 16.93, ... } }
// The client uses these to show USD amounts in the user's display currency.
router.get('/rates', async (req, res) => {
    const { date, rates } = await getLatestRates()
    res.status(200).json({
        base: 'USD',
        date,
        rates: Object.fromEntries(Object.entries(rates).map(([currency, rate]) => [currency, Number(rate)]))
    })
})

export default router
