import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { createTrade, getTrades, getTradesByDay, updateTrade, deleteTrade, getMonthlySummary, getCalenderSummary, getHistorySummary } from '../controllers/trade.controller.js'


const router = Router()

router.use(requireAuth)
router.post('/', createTrade)
router.get('/', getTrades)
router.get('/day/:date', getTradesByDay)
router.get('/summary/month', getMonthlySummary)
router.get('/summary/calendar', getCalenderSummary)
router.get('/summary/history', getHistorySummary)
router.put('/:id', updateTrade)
router.delete('/:id', deleteTrade)

export default router
