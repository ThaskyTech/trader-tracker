import prisma from '../config/db.js'
import { HttpError } from '../middleware/error.middleware.js'
import { RESEND_GAP_MS, RESEND_MAX_PER_HOUR, hashToken, sendVerificationEmail } from '../services/verification.service.js'
import { verifyEmailSchema } from '../validators/auth.schema.js'

// Email verification (D-70). No try/catch: Express 5 forwards thrown errors.

// POST /api/auth/verify-email  { token }  Public: the token is the proof.
// One message for unknown, used and expired tokens: the fix is the same (a new link).
export async function verifyEmail(req, res){
    const { token } = verifyEmailSchema.parse(req.body)
    const record = await prisma.emailVerification.findUnique({ where: { tokenHash: hashToken(token) } })
    if(!record || record.expiresAt < new Date()){
        throw new HttpError(400, 'This link has expired or was already used. Send a new one from the app.')
    }

    // Verified once, every pending link for the user is done with.
    await prisma.$transaction([
        prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
        prisma.emailVerification.deleteMany({ where: { userId: record.userId } }),
    ])
    res.status(200).json({ verified: true })
}

// POST /api/auth/resend-verification  Signed in, not yet verified.
// -> { sentTo, delivered }. delivered is false when the server has no email set up,
// which the app says plainly rather than claiming it was sent.
export async function resendVerification(req, res){
    const user = await prisma.user.findUnique({ where: { id: req.userId } })
    if(!user) throw new HttpError(404, 'User not found.')
    if(user.emailVerifiedAt) throw new HttpError(400, 'Your email is already verified.')

    const recent = await prisma.emailVerification.findMany({
        where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 3600e3) } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
    })
    const wait = recent.length ? recent[0].createdAt.getTime() + RESEND_GAP_MS - Date.now() : 0
    if(wait > 0) throw new HttpError(429, `Just sent. You can send another in ${Math.ceil(wait / 1000)} s.`)
    if(recent.length >= RESEND_MAX_PER_HOUR) throw new HttpError(429, 'Several emails were sent in the last hour. Check your spam folder, or try again later.')

    const { delivered } = await sendVerificationEmail(user)
    res.status(200).json({ sentTo: user.email, delivered })
}
