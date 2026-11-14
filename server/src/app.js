import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.routes.js'
import tradeRoutes from './routes/trade.routes.js'

const app = express()

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }))
app.use(express.json())
app.use('/api/auth', authRoutes)
app.use('/api/trades', tradeRoutes)
app.get('/api/health', (req,res) =>{ res.json({status: 'ok'}) })


export default app