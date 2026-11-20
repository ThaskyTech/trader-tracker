import { HttpError } from '../middleware/error.middleware.js'

// Sending email (D-70) through Resend's HTTP API (https://resend.com): one POST, no
// SDK or SMTP connection. Needs RESEND_API_KEY and MAIL_FROM, e.g.
// "Summa <noreply@lethasky.co.za>" (the domain must be verified in Resend).
//
// Without RESEND_API_KEY nothing is sent: the email is written to the server log
// instead, so development works without an account. The log includes links only when
// CLIENT_URL is a localhost address, since a verification link is a credential.

const RESEND_URL = 'https://api.resend.com/emails'
const TIMEOUT_MS = 10_000

let testTransport = null
// Tests capture emails here instead of sending them.
export function setMailTransport(fn){ testTransport = fn }

export const isMailConfigured = () => Boolean(process.env.RESEND_API_KEY)

// Returns { delivered: true } once Resend accepted it, { delivered: false } when
// sending isn't set up. Throws a 502 HttpError if Resend refuses or can't be reached.
export async function sendMail({ to, subject, text, html }){
    if(testTransport) return testTransport({ to, subject, text, html })

    if(!isMailConfigured()){
        const local = /^http:\/\/localhost/.test(process.env.CLIENT_URL ?? '')
        console.log(`[mail] RESEND_API_KEY not set, so this email to ${to} was not sent: "${subject}"${local ? `\n${text}` : ''}`)
        return { delivered: false }
    }

    let response
    try {
        response = await fetch(RESEND_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text, html }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        })
    } catch (err) {
        console.error('[mail] Resend unreachable:', err.message)
        throw new HttpError(502, "The email couldn't be sent right now. Try again in a minute.")
    }
    if(!response.ok){
        console.error(`[mail] Resend refused (${response.status}):`, (await response.text()).slice(0, 300))
        throw new HttpError(502, "The email couldn't be sent right now. Try again in a minute.")
    }
    return { delivered: true }
}
