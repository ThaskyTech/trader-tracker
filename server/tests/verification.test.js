import { describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import { createToken, hashToken, verificationEmail, verificationLink, TOKEN_TTL_MS } from '../src/services/verification.service.js'
import { verifyEmailSchema } from '../src/validators/auth.schema.js'

describe('email verification links (D-70)', () => {
    it('makes a random 256-bit token and stores only its hash', () => {
        const a = createToken()
        const b = createToken()
        expect(a.token).toMatch(/^[a-f0-9]{64}$/)
        expect(a.token).not.toBe(b.token)
        expect(a.tokenHash).toBe(crypto.createHash('sha256').update(a.token).digest('hex'))
        expect(a.tokenHash).not.toBe(a.token)
        expect(hashToken(a.token)).toBe(a.tokenHash)
    })

    it('links to the app page, not the API', () => {
        expect(verificationLink('ab'.repeat(32), 'https://trader-tracker.pages.dev'))
            .toBe(`https://trader-tracker.pages.dev/verify-email?token=${'ab'.repeat(32)}`)
    })

    it('lasts 24 hours', () => {
        expect(TOKEN_TTL_MS).toBe(24 * 3600e3)
    })

    it('writes the email with the link in both versions, escaping the username', () => {
        const link = 'https://example.test/verify-email?token=abc'
        const email = verificationEmail({ username: '<b>sam</b>', link })
        expect(email.subject).toBe('Confirm your email for Summa')
        expect(email.text).toContain(link)
        expect(email.html).toContain(`href="${link}"`)
        expect(email.html).toContain('&lt;b&gt;sam&lt;/b&gt;')
        expect(email.html).not.toContain('<b>sam</b>')
    })

    it('accepts only a whole token', () => {
        expect(verifyEmailSchema.safeParse({ token: 'a'.repeat(64) }).success).toBe(true)
        const cut = verifyEmailSchema.safeParse({ token: 'a'.repeat(40) })
        expect(cut.success).toBe(false)
        expect(cut.error.issues[0].message).toMatch(/incomplete/)
        expect(verifyEmailSchema.safeParse({ token: 'Z'.repeat(64) }).success).toBe(false)
    })
})
