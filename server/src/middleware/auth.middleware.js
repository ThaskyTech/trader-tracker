import jwt from 'jsonwebtoken'
import prisma from '../config/db.js'

export function requireAuth(req,res,next){
    const authHeader = req.headers.authorization

    if(!authHeader || !authHeader.startsWith('Bearer ')){return res.status(401).json({error:'No token provided.'})}

    const token = authHeader.split(' ')[1]

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET)

        // Never let a request through without a user id. Prisma treats
        // `where: { userId: undefined }` as "no filter", which would return
        // every user's data.
        if(typeof payload.userId !== 'string' || !payload.userId){
            return res.status(401).json({error:'Invalid or expired token.'})
        }

        req.userId = payload.userId
        req.emailVerified = payload.emailVerified
        next()
    }catch{
        return res.status(401).json({error:'Invalid or expired token.'})
    }
}

// For the app's data (trades, accounts): only users who have verified their email
// (D-70). Goes after requireAuth. The answer comes from the access token; tokens issued
// before verification existed don't carry it, so those are looked up once.
// The code lets the client tell this 403 apart and show the "check your email" screen.
export async function requireVerified(req, res, next){
    let verified = req.emailVerified
    if(typeof verified !== 'boolean'){
        const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { emailVerifiedAt: true } })
        verified = Boolean(user?.emailVerifiedAt)
    }
    if(!verified) return res.status(403).json({ error: 'Verify your email address first.', code: 'EMAIL_NOT_VERIFIED' })
    next()
}
