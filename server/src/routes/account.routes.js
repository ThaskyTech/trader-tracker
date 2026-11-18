import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import {
    listAccounts, getAccount, createAccount, updateAccount, archiveAccount, restoreAccount,
    deleteAccount, listCash, addCash, correctBalance, getEquity,
} from '../controllers/account.controller.js'

const router = Router()

router.use(requireAuth)
router.get('/', listAccounts)
router.post('/', createAccount)
router.get('/:id', getAccount)
router.patch('/:id', updateAccount)
router.delete('/:id', deleteAccount)
router.post('/:id/archive', archiveAccount)
router.post('/:id/restore', restoreAccount)
router.get('/:id/cash', listCash)
router.post('/:id/cash', addCash)
router.post('/:id/balance-correction', correctBalance)
router.get('/:id/equity', getEquity)

export default router
