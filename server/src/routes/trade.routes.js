import { Router } from 'express'
import { requireAuth, requireVerified } from '../middleware/auth.middleware.js'
import { createTrade, getTrades, getTrade, getTradesByDay, updateTrade, deleteTrade, getMonthlySummary, getCalendarSummary, getHistorySummary } from '../controllers/trade.controller.js'


const router = Router()

// Signed in with a verified email (D-70).
router.use(requireAuth, requireVerified)
router.post('/', createTrade)
router.get('/', getTrades)
router.get('/day/:date', getTradesByDay)
router.get('/summary/month', getMonthlySummary)
router.get('/summary/calendar', getCalendarSummary)
router.get('/summary/history', getHistorySummary)
// Keep /:id after the fixed paths above so it reads as "everything else".
router.get('/:id', getTrade)
router.put('/:id', updateTrade)
router.delete('/:id', deleteTrade)

export default router
