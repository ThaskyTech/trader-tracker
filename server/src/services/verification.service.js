import crypto from 'node:crypto'
import prisma from '../config/db.js'
import { sendMail } from './mail.service.js'

// Email verification links (D-70).
//   A link carries a random 256-bit token. Only its SHA-256 hash is stored, so a
//   database leak doesn't hand out working links. (A fast hash is fine here: the token
//   is random, not a password, so there's nothing to guess.)
//   It works for 24 hours and only once.
//   It opens an app page, which then POSTs the token. Mail scanners (e.g. Outlook's
//   safe links) open every link in an email; a link that verified on GET would be used
//   up by the scanner before the person clicked it.

export const TOKEN_TTL_MS = 24 * 3600e3
// Resending: at most one a minute and five an hour per user, so the button can't be
// used to flood an inbox (or burn the email quota).
export const RESEND_GAP_MS = 60e3
export const RESEND_MAX_PER_HOUR = 5

export const hashToken = token => crypto.createHash('sha256').update(token).digest('hex')

export function createToken(){
    const token = crypto.randomBytes(32).toString('hex')
    return { token, tokenHash: hashToken(token) }
}

// The app page the link opens. CLIENT_URL is the browser app's address.
export function verificationLink(token, clientUrl = process.env.CLIENT_URL){
    const url = new URL('/verify-email', clientUrl)
    url.searchParams.set('token', token)
    return url.toString()
}

const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// The email itself: plain text plus a simple HTML version. Pure, so it's tested directly.
export function verificationEmail({ username, link }){
    const subject = 'Confirm your email for Summa'
    const text = [
        `Hi ${username},`,
        '',
        'Open this link to confirm your email address and finish setting up Summa:',
        link,
        '',
        'It works for 24 hours. If you didn\'t create a Summa account, ignore this email.',
    ].join('\n')
    const html = `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#0a0a0a;font-family:ui-monospace,Menlo,Consolas,monospace;color:#e5e7eb">
<div style="max-width:420px;margin:0 auto">
<div style="font-size:24px;font-weight:600;color:#ffffff;margin-bottom:20px">Summa</div>
<p style="font-size:14px;line-height:1.6;margin:0 0 20px">Hi ${escapeHtml(username)}, open the link below to confirm your email address and finish setting up Summa.</p>
<a href="${escapeHtml(link)}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:600;letter-spacing:1px;font-size:13px;padding:14px 22px;border-radius:10px">CONFIRM EMAIL</a>
<p style="font-size:12px;line-height:1.6;color:#777;margin:24px 0 0">It works for 24 hours. If you didn't create a Summa account, ignore this email.</p>
</div></body></html>`
    return { subject, text, html }
}

// Creates a fresh link for the user and emails it. Earlier links stay valid until they
// expire, so an email that arrives late still works. Returns sendMail's { delivered }.
export async function sendVerificationEmail(user, now = Date.now()){
    const { token, tokenHash } = createToken()
    await prisma.emailVerification.create({
        data: { userId: user.id, tokenHash, expiresAt: new Date(now + TOKEN_TTL_MS) },
    })
    return sendMail({ to: user.email, ...verificationEmail({ username: user.username, link: verificationLink(token) }) })
}
