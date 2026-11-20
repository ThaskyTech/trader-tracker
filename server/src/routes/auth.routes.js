import { Router } from 'express'
import { signup, login, refresh, logout } from '../controllers/auth.controller.js'
import { verifyEmail, resendVerification } from '../controllers/verification.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'

const router = Router()

// Public: lets the login page show "Create one" only while signups are open (D-71).
router.get('/signup-status', (req, res) => res.json({ open: process.env.ALLOW_SIGNUPS === 'true' }))
router.post('/signup', signup)
router.post('/login', login)
router.post('/refresh', refresh)
router.post('/logout', logout)
// D-70. verify-email is public: the token in the link is the proof, and it may be
// opened on a device that isn't signed in (a phone's mail app).
router.post('/verify-email', verifyEmail)
router.post('/resend-verification', requireAuth, resendVerification)

export default router