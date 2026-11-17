import jwt from 'jsonwebtoken'

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
        next()
    }catch{
        return res.status(401).json({error:'Invalid or expired token.'})
    }
}
