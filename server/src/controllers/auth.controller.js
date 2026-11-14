import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import prisma from '../config/db.js'

const SALT_ROUNDS = 10

export async function signup(req, res){
    try{
        console.log('1. Request received', req.body)
        const { email, username, password } = req.body

        if(!email){
            return res.status(400).json({error: 'Email required!'})
        }
        if(!username){
            return res.status(400).json({error: 'Username is required!'})
        }
        if(!password){
            return res.status(400).json({error: 'Password is required!'})
        }

        if(password.length < 8){
            return res.status(400).json({error: 'Password Length must be at least 8 characters!'})
        }
        console.log('2. Validation passed, checking existing user...')
        const existingUser = await prisma.user.findFirst({
            where: { OR: [{email}, {username}]}
        })
        console.log('3. Existing user check complete:', existingUser)
        if(existingUser){
            return res.status(409).json({error: 'Email or username already in use.'})
        }
        
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
        const user = await prisma.user.create({
            data: {email, username, passwordHash},
            select: {id: true, email: true, username: true, createdAt: true}
        })
        const accessToken = jwt.sign(
            {userID: user.id},
            process.env.JWT_SECRET,
            {expiresIn: '15m'}
        )
        const refreshToken = jwt.sign(
            {userID: user.id},
            process.env.JWT_REFRESH_SECRET,
            {expiresIn: '30d'}
        )

        await prisma.refreshToken.create({
            data:{
                token: refreshToken,
                userId: user.id,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            }
        })
        res.status(201).json({user, accessToken, refreshToken})
    }catch(err){
        console.error('signup error:', err)
        res.status(500).json({error: 'something went wrong during signup.'})
    }
    
}

export async function login(req,res){
    try{
        console.log('1. Login request received', req.body)
        const { email, password } = req.body

        if(!email){return res.status(400).json({status: 'Email is required'})}
        if(!password){return res.status(400).json({status: 'Password is required'})}
        const user = await prisma.user.findUnique({ where: { email } })
        if(!user){return res.status(401).json({status: 'Invalid email or password'})}
        
        console.log('2. User found, checking passowrd...')
        const passwordMatch = await bcrypt.compare(password, user.passwordHash)
        if(!passwordMatch){return res.status(401).json({status: 'Invalid email or password.'})}

        console.log('3. Password verified, issuing tokens...')
        const accessToken = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET,
            { expiresIn: '15m'}
        )
        const refreshToken = jwt.sign(
            { userId: user.id },
            process.env.JWT_REFRESH_SECRET,
            { expiresIn: '30d'}
        )

        await prisma.refreshToken.create({
            data: {
                token: refreshToken,
                userId: user.id,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            }
        })

        const safeUser = {
            id: user.id,
            email: user.email,
            username: user.username,
            createdAt: user.createdAt
        }
        res.status(200).json({ user: safeUser, accessToken, refreshToken })
    } catch(err){
        console.error('login error', err)
        res.status(500).json({ error: 'soemthing went wrong during login.'})
    }
}

export async function refresh(req,res){
    try{
        const { refreshToken } = req.body

        if(!refreshToken){return res.status(400).json({ error: 'Refresh token is required.' })}

        const storedToken = await prisma.refreshToken.findUnique({where: {token: refreshToken}})
        if(!storedToken){return res.status(401).json({ error: 'Invalid refreshToken.' })}
        if(storedToken.expiresAt < new Date()){
            await prisma.refreshToken.delete({where: {id: storedToken}})
            return res.status(401).json({error: 'Refresg token expired. Please login again'})
        }

        let payload
        try{
            payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)
        }catch(err){
            return res.status(401).json({ error: 'Invalid refresh Token.' })
        }

        const accessToken = jwt.sign(
            {userId: payload.userId},
            process.env.JWT_SECRET,
            {expiresIn: '15m'}
        )

        res.status(200).json({accessToken})
    }catch(err){
        console.error('refresh error:', err)
        res.status(500).json({error: 'something went wrong during refresh.'})
    }
}

export async function logout(req,res){
    try{
        const { refreshToken } = req.body

        if(!refreshToken){return res.status(400).json({error:'Refresh Token is required'})}

        await prisma.refreshToken.deleteMany({where: {token: refreshToken}})

        res.status(200).json({message:'Logged our successfully.'})
    }catch(err){
        console.error('logout error:', err)
        res.status(500).json({error:'something went wrong during logout.'})
    }
}