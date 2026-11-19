import { describe, expect, it } from 'vitest'
import { IDLE_MS, REMEMBER_MS, sessionExpiry } from '../src/utils/session.js'

describe('sign-in lifetime (D-68)', () => {
    it('ends an hour after last use unless remembered', () => {
        expect(IDLE_MS).toBe(3600e3)
        expect(sessionExpiry(false, 1000).getTime()).toBe(1000 + 3600e3)
    })

    it('lasts 30 days on a remembered device', () => {
        expect(sessionExpiry(true, 0).getTime()).toBe(REMEMBER_MS)
        expect(REMEMBER_MS).toBe(30 * 24 * 3600e3)
    })
})
