import prisma from '../config/db.js'

export async function createTrade(req,res){
    try{
        console.log('Trades received', req.body)
        const {symbol,direction,broker,lotSize,entryPrice,exitPrice,pnl,openedAt,closedAt,notes,source} = req.body

        if(!symbol || !direction || !broker || !lotSize || !entryPrice || !exitPrice || pnl === undefined || !openedAt || closedAt){
        }

        if(!['LONG', 'SHORT'].includes(direction)){
            return res.status(400).json({error: 'Direction must be LONG or SHORT.'})
        }

        const trade = await prisma.trade.create({
            data:{
                userId: req.userId,
                symbol,
                direction,
                broker,
                lotSize,
                entryPrice,
                exitPrice,
                pnl,
                openedAt: new Date(openedAt),
                closedAt: new Date(closedAt),
                notes: notes || null,
                source: source || 'MANUAL'
            }
        })

        res.status(201).json({trade})
    }catch(err){
        console.error('createTrades error:', err)
        res.status(500).json({error: 'Something went wrong in trade creation!'})
    }
}

export async function getTrades(req,res){
    try{
        const trades = await prisma.trade.findMany({
            where: { userId: req.userId },
            orderBy: { openedAt: 'desc'}
        })

        res.status(200).json({ trades })

    } catch(err){
        console.error('getTrades error: ',err)
        res.status(500).json({ error : 'Something went wrong getting Trades!'})
    }
}

export async function getTradesByDay(req,res){
    try{
        const { date } = req.params //Format should be: YYYY-MM-DD
        const startOfDay = new Date(`${date}T00:00:00.000z`)
        const endOfDay = new Date(`${date}T23:59:59.999z`)

        if(isNaN(startOfDay.getTime())){
            return res.status(400).json({ error : 'Invalid date format.'})
        }

        const trades = await prisma.trade.findMany({
            where : {
                userId: req.userId,
                openedAt: { gte: startOfDay, lte: endOfDay}
            },
            orderBy: { openedAt: 'desc'}
        })

        res.status(200).json({ trades })
    }catch(err){
        console.error('getTradesByDay error: ',err)
        return res.status(500).json({ error : 'Something went while getting trades by date'})
    }
}

export async function updateTrade(req,res){
    try{
        const { id } = req.params
        const existingTrade = await prisma.trade.findUnique({where: { id } })

        if(!existingTrade){
            return res.status(404).json({ error : 'Trade not Found.'})
        }

        if(existingTrade.userId !== req.userId){
            return res.status(403).json({ error : 'You do not have permission to edit this trade!'})
        }

        const {symbol,direction,broker,lotSize,entryPrice,exitPrice,pnl,openedAt,closedAt,notes} = req.body
        const updatedTrade = await prisma.trade.update({
            where: {id},
            data: {
                ...(symbol && { symbol }),
                ...(direction && { direction }),
                ...(broker && { broker }),
                ...(lotSize !== undefined && { lotSize }),
                ...(entryPrice !== undefined && { entryPrice }),
                ...(exitPrice !== undefined && { exitPrice }),
                ...(pnl !== undefined && { pnl }),
                ...(openedAt && { openedAt: new Date(openedAt) }),
                ...(closedAt && {closedAt: new Date(closedAt) }),
                ...(notes !== undefined && { notes })
            }
        })

        res.status(200).json({ trade: updatedTrade })
    }catch(err){
        console.error('updateTrade error: ', err)
        return res.status(500).json({ error : 'Something went wrong while updating trade!'})
    }
}

export async function deleteTrade(req,res){
    try{
        const { id } = req.params
        const existingTrade = await prisma.trade.findUnique({ where : { id } })

        if(!existingTrade){
            return res.status(404).json({ error : 'Trade not found.' })
        }

        if(existingTrade.userId !== req.userId){
            return res.status(403).json({ error : 'Not qualified to delete trade.' })
        }

        await prisma.trade.delete({ where: { id }});
        res.status(200).json({ message: 'Trade deleted Successfully.' })

    }catch(err){
        console.error("deleteTrade error: ",err)
        return res.status(500).json({ error : 'Something went wrong while deleting trade!' })
    }
}

export async function getMonthlySummary(req,res){
    try{
        const now = new Date()
        const year = req.query.year ? parseInt(req.query.year) : now.getFullYear()
        const month = req.query.month ? parseInt(req.query.month) : now.getMonth() + 1

        if(isNaN(year) || isNaN(month) || month < 1 || month > 12){
            return res.status(400).json({ error : 'Invalid year or month'})
        }

        const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
        const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
        const trades = await prisma.trade.findMany({
            where: {
                userId: req.userId,
                openedAt: { gte: startOfMonth, lte: endOfMonth }
            }
        })

        const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0)
        const wins = trades.filter(t => t.pnl > 0).length
        const losses = trades.filter(t => t.pnl < 0).length
        const totalTrades = trades.length
        const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0

        res.status(200).json({
            year,
            month,
            totalPnl,
            wins,
            losses,
            totalTrades,
            winRate: parseInt(winRate.toFixed(1))
        })
    }catch(err){
        console.error('getMonthlySummary error:', err)
        res.status(500).json({ error: 'Something went wrong fetching the monthly summary'})
    }

}

export async function getCalenderSummary(req,res){
    try{
        const now = new Date();
        const year = req.query.year ? parseInt(req.query.year) : now.getFullYear()
        const month = req.query.month ? parseInt(req.query.month) : now.getMonth() + 1

        if(isNaN(year) || isNaN(month) || month < 1 || month > 12){
            return res.status(400).json({ error: 'Invalid year or month.'})
        }

        const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
        const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
        const trades = await prisma.trade.findMany({
            where: {
                userId: req.userId,
                openedAt: { gte: startOfMonth, lte: endOfMonth }
            },
            select: { openedAt: true, pnl: true }
        })

        const dailyTotals = {}

         for(const trade of trades){
            const day = trade.openedAt.getUTCDate()
            dailyTotals[day] = (dailyTotals[day] || 0) + trade.pnl
         }
        
         res.status(200).json({
            year,
            month,
            days: dailyTotals
         })

    }catch(err){
        console.error('getCalendarSummary error: ', err)
        res.status(500).json({ error: 'Something went wrong while fetching C alendar Summary.'})
    }
}

export async function getHistorySummary(req,res){
    try{
        const trades = await prisma.trade.findMany({
            where: { userId: req.userId },
            select: { pnl: true }
        })

        const totalPnl = trades.reduce((sum, t)=> sum + t.pnl, 0)
        const wins = trades.filter(t => t.pnl > 0).length
        const losses = trades.filter( t => t.pnl < 0).length
        const totalTrades = trades.length
        const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0
        
        res.status(200).json({
            totalPnl,
            wins,
            losses,
            totalTrades,
            winRate: parseFloat(winRate.toFixed(1))
        })

    }catch(err){
        console.error('getHostorySummary error: ', err)
        res.status(500).json({ error: 'Something went wrong while fetching the history summary.'})
    }
}