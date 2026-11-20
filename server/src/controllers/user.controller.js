import prisma from '../config/db.js'
import { HttpError } from '../middleware/error.middleware.js'
import { updateMeSchema } from '../validators/user.schema.js'

// The fields of a user that are safe to send to the browser (never passwordHash).
export const PUBLIC_USER_FIELDS = { id: true, email: true, username: true, displayCurrency: true, emailVerifiedAt: true, createdAt: true }

// GET /api/users/me
export async function getMe(req, res){
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: PUBLIC_USER_FIELDS })
    if(!user) throw new HttpError(404, 'User not found.')

    res.status(200).json({ user })
}

// PATCH /api/users/me  { displayCurrency: 'ZAR' }
export async function updateMe(req, res){
    const data = updateMeSchema.parse(req.body)

    const user = await prisma.user.update({ where: { id: req.userId }, data, select: PUBLIC_USER_FIELDS })

    res.status(200).json({ user })
}
