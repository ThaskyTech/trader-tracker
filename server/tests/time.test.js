import { describe, it, expect } from 'vitest'
import { localDayRange, localMonthRange, getLocalParts, parseDateString, isValidTimeZone } from '../src/utils/time.js'

const JHB = 'Africa/Johannesburg' // UTC+2, no daylight saving

describe('localDayRange', () => {
    it('starts a Johannesburg day at 22:00 UTC the previous day', () => {
        const { start, end } = localDayRange(2026, 11, 17, JHB)
        expect(start.toISOString()).toBe('2026-11-16T22:00:00.000Z')
        expect(end.toISOString()).toBe('2026-11-17T22:00:00.000Z')
    })

    it('matches UTC midnight when the timezone is UTC', () => {
        const { start, end } = localDayRange(2026, 11, 17, 'UTC')
        expect(start.toISOString()).toBe('2026-11-17T00:00:00.000Z')
        expect(end.toISOString()).toBe('2026-11-18T00:00:00.000Z')
    })

    it('handles a daylight-saving change (New York, 2026-03-08 is only 23 hours long)', () => {
        const { start, end } = localDayRange(2026, 3, 8, 'America/New_York')
        expect(start.toISOString()).toBe('2026-03-08T05:00:00.000Z') // EST, UTC-5
        expect(end.toISOString()).toBe('2026-03-09T04:00:00.000Z')   // EDT, UTC-4
        expect(end - start).toBe(23 * 60 * 60 * 1000)
    })
})

describe('localMonthRange', () => {
    it('rolls December over into January of the next year', () => {
        const { start, end } = localMonthRange(2026, 12, JHB)
        expect(start.toISOString()).toBe('2026-11-30T22:00:00.000Z')
        expect(end.toISOString()).toBe('2026-12-31T22:00:00.000Z')
    })
})

describe('getLocalParts', () => {
    it('puts a trade closed at 23:30 UTC on the next local day in Johannesburg', () => {
        // The bug this fixes: in Johannesburg this trade closed at 01:30 on the 18th, not the 17th.
        const parts = getLocalParts(new Date('2026-11-17T23:30:00Z'), JHB)
        expect(parts).toMatchObject({ year: 2026, month: 11, day: 18, hour: 1, minute: 30 })
    })
})

describe('parseDateString', () => {
    it('accepts a real date', () => {
        expect(parseDateString('2026-02-28')).toEqual({ year: 2026, month: 2, day: 28 })
    })

    it.each(['2026-02-31', '2026-13-01', '2026-2-1', '17-11-2026', '', undefined, '2026-11-17T00:00'])(
        'rejects %s', (value) => expect(parseDateString(value)).toBeNull()
    )
})

describe('isValidTimeZone', () => {
    it('accepts IANA names and rejects junk', () => {
        expect(isValidTimeZone(JHB)).toBe(true)
        expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false)
        expect(isValidTimeZone('')).toBe(false)
    })
})
