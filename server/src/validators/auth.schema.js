import { z } from 'zod'

// POST /api/auth/verify-email (D-70). A token is 64 hex characters; anything else is
// a link that got cut off or mangled on the way.
export const verifyEmailSchema = z.object({
    token: z.string().regex(/^[a-f0-9]{64}$/, 'This link is incomplete. Open it again from the email, or send a new one.'),
})
