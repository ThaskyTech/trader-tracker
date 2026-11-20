import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import prisma from '../config/db.js'
import { PUBLIC_USER_FIELDS } from './user.controller.js'
import { sessionExpiry } from '../utils/session.js'
import { sendVerificationEmail } from '../services/verification.service.js'

const SALT_ROUNDS = 10
const ACCESS_TOKEN_TTL = '15m'
// The JWT's own lifetime is the longest a sign-in can last. When it actually ends is
// the database row's expiresAt (D-68): an hour after last use unless remembered.
const REFRESH_TOKEN_TTL_DAYS = 30

// Single place that creates tokens, so every flow (signup, login, refresh)
// puts the same claim name in the payload. The middleware reads `userId`.
// emailVerified travels in the access token (D-70), so the data routes can check it
// without a database query on every request. It can only go from false to true, and the
// client refreshes its token right after verifying.
function signAccessToken(userId, emailVerified){
    return jwt.sign({ userId, emailVerified }, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL })
}

async function issueTokens(userId, { remember = false, emailVerified = false } = {}){
    const accessToken = signAccessToken(userId, emailVerified)
    const refreshToken = jwt.sign(
        { userId },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d` }
    )

    await prisma.refreshToken.create({
        data: {
            token: refreshToken,
            userId,
            remember,
            expiresAt: sessionExpiry(remember)
        }
    })

    return { accessToken, refreshToken }
}

export async function signup(req, res){
    try{
        // Private app: signups are closed unless explicitly opened with
        // ALLOW_SIGNUPS=true. If the variable is missing, signups stay closed.
        if(process.env.ALLOW_SIGNUPS !== 'true'){
            return res.status(403).json({error: 'Signups are currently closed.'})
        }

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

        const existingUser = await prisma.user.findFirst({
            where: { OR: [{email}, {username}]}
        })
        if(existingUser){
            return res.status(409).json({error: 'Email or username already in use.'})
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
        const user = await prisma.user.create({
            data: {email, username, passwordHash},
            select: PUBLIC_USER_FIELDS
        })

        // A failed email doesn't fail the signup: the user can send it again from the app.
        try {
            await sendVerificationEmail(user)
        } catch (err) {
            console.error('verification email failed at signup:', err.message)
        }

        const { accessToken, refreshToken } = await issueTokens(user.id)
        res.status(201).json({user, accessToken, refreshToken})
    }catch(err){
        console.error('signup error:', err)
        res.status(500).json({error: 'Something went wrong during signup.'})
    }
}

export async function login(req,res){
    try{
        const { email, password } = req.body
        // Only an explicit true keeps the device signed in (D-68).
        const remember = req.body.remember === true

        if(!email){return res.status(400).json({error: 'Email is required.'})}
        if(!password){return res.status(400).json({error: 'Password is required.'})}

        const user = await prisma.user.findUnique({ where: { email } })
        if(!user){return res.status(401).json({error: 'Invalid email or password.'})}

        const passwordMatch = await bcrypt.compare(password, user.passwordHash)
        if(!passwordMatch){return res.status(401).json({error: 'Invalid email or password.'})}

        const { accessToken, refreshToken } = await issueTokens(user.id, { remember, emailVerified: Boolean(user.emailVerifiedAt) })

        const safeUser = {
            id: user.id,
            email: user.email,
            username: user.username,
            displayCurrency: user.displayCurrency,
            emailVerifiedAt: user.emailVerifiedAt,
            createdAt: user.createdAt
        }
        res.status(200).json({ user: safeUser, accessToken, refreshToken })
    } catch(err){
        console.error('login error:', err)
        res.status(500).json({ error: 'Something went wrong during login.'})
    }
}

export async function refresh(req,res){
    try{
        const { refreshToken } = req.body

        if(!refreshToken){return res.status(400).json({ error: 'Refresh token is required.' })}

        const storedToken = await prisma.refreshToken.findUnique({
            where: {token: refreshToken},
            include: { user: { select: { emailVerifiedAt: true } } }
        })
        if(!storedToken){return res.status(401).json({ error: 'Invalid refresh token.' })}

        if(storedToken.expiresAt < new Date()){
            await prisma.refreshToken.delete({where: {id: storedToken.id}})
            return res.status(401).json({error: 'Refresh token expired. Please log in again.'})
        }

        let payload
        try{
            payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)
        }catch{
            return res.status(401).json({ error: 'Invalid refresh token.' })
        }

        // Trust the user id stored in the database, not just the token payload.
        // This also covers old tokens that were signed with a different claim name.
        if(payload.userId !== storedToken.userId){
            return res.status(401).json({ error: 'Invalid refresh token.' })
        }

        // Still in use, so a sign-in that isn't remembered gets another idle hour (D-68).
        if(!storedToken.remember){
            await prisma.refreshToken.update({ where: { id: storedToken.id }, data: { expiresAt: sessionExpiry(false) } })
        }

        res.status(200).json({ accessToken: signAccessToken(storedToken.userId, Boolean(storedToken.user.emailVerifiedAt)) })
    }catch(err){
        console.error('refresh error:', err)
        res.status(500).json({error: 'Something went wrong during refresh.'})
    }
}

export async function logout(req,res){
    try{
        const { refreshToken } = req.body

        if(!refreshToken){return res.status(400).json({error:'Refresh token is required.'})}

        await prisma.refreshToken.deleteMany({where: {token: refreshToken}})

        res.status(200).json({message:'Logged out successfully.'})
    }catch(err){
        console.error('logout error:', err)
        res.status(500).json({error:'Something went wrong during logout.'})
    }
}
