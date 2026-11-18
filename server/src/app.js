import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.routes.js'
import tradeRoutes from './routes/trade.routes.js'
import userRoutes from './routes/user.routes.js'
import fxRoutes from './routes/fx.routes.js'
import { notFound, errorHandler } from './middleware/error.middleware.js'

const app = express()

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }))
app.use(express.json({ limit: '100kb' }))
app.use('/api/auth', authRoutes)
app.use('/api/trades', tradeRoutes)
app.use('/api/users', userRoutes)
app.use('/api/fx', fxRoutes)
app.get('/api/health', (req,res) =>{ res.json({status: 'ok'}) })

// These two must come after all routes: unknown URLs get a JSON 404, and any
// thrown error becomes a JSON response instead of Express's default HTML page.
app.use(notFound)
app.use(errorHandler)

export default app