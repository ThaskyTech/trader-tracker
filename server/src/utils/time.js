// Timezone helpers built on the standard Intl API (no extra dependency).
//
// Why this exists: timestamps are stored in UTC, but "which day did this trade
// close on?" depends on where the user is. At UTC+2, a trade closed at 01:00
// local time is 23:00 UTC the *previous* day. Every day and month boundary has
// to be computed in the user's timezone, then converted back to UTC for the query.

export const DEFAULT_TIME_ZONE = 'UTC'

export function isValidTimeZone(timeZone){
    if(typeof timeZone !== 'string' || !timeZone) return false
    try {
        new Intl.DateTimeFormat('en-US', { timeZone })
        return true
    } catch {
        return false
    }
}

const formatterCache = new Map()
function getFormatter(timeZone){
    if(!formatterCache.has(timeZone)){
        formatterCache.set(timeZone, new Intl.DateTimeFormat('en-US', {
            timeZone,
            hourCycle: 'h23',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        }))
    }
    return formatterCache.get(timeZone)
}

// Wall-clock parts (year, month 1-12, day, hour, minute, second) of an instant in a timezone.
export function getLocalParts(date, timeZone){
    const parts = {}
    for(const { type, value } of getFormatter(timeZone).formatToParts(date)){
        if(type !== 'literal') parts[type] = Number(value)
    }
    return parts
}

// How far ahead of UTC the timezone is at a given instant, in ms (e.g. +2h for Johannesburg).
function getOffsetMs(instantMs, timeZone){
    const p = getLocalParts(new Date(instantMs), timeZone)
    const wallClockAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    const wholeSeconds = instantMs - (((instantMs % 1000) + 1000) % 1000)
    return wallClockAsUtc - wholeSeconds
}

// The UTC instant at which local midnight starts on year-month-day in the timezone.
// Out-of-range values roll over like Date.UTC does: day 32 means the next month's
// day 1, and month 13 means January of the next year. That is how "end of month"
// is computed below.
export function startOfLocalDay(year, month, day, timeZone){
    const guess = Date.UTC(year, month - 1, day)
    const offset = getOffsetMs(guess, timeZone)
    let result = guess - offset
    // On a daylight-saving change, the offset at the result can differ from the guess.
    const correctedOffset = getOffsetMs(result, timeZone)
    if(correctedOffset !== offset) result = guess - correctedOffset
    return new Date(result)
}

// [start, end) range covering one local calendar day. `end` is exclusive.
export function localDayRange(year, month, day, timeZone){
    return {
        start: startOfLocalDay(year, month, day, timeZone),
        end: startOfLocalDay(year, month, day + 1, timeZone)
    }
}

// [start, end) range covering one local calendar month. `end` is exclusive.
export function localMonthRange(year, month, timeZone){
    return {
        start: startOfLocalDay(year, month, 1, timeZone),
        end: startOfLocalDay(year, month + 1, 1, timeZone)
    }
}

// Parses a strict 'YYYY-MM-DD' string. Returns null for bad formats and impossible dates such as 2026-02-31.
export function parseDateString(value){
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '')
    if(!match) return null
    const [year, month, day] = match.slice(1).map(Number)
    const check = new Date(Date.UTC(year, month - 1, day))
    if(check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null
    return { year, month, day }
}

// The last `count` local calendar days up to and including today, oldest first:
// [{ date: 'YYYY-MM-DD', start, end }], each a [start, end) range. Used by the equity chart.
export function lastLocalDays(count, timeZone, now = new Date()){
    const today = getLocalParts(now, timeZone)
    const days = []
    for(let back = count - 1; back >= 0; back--){
        // Date.UTC rolls day 0 or -3 back into the previous month, so this works across months.
        const d = new Date(Date.UTC(today.year, today.month - 1, today.day - back))
        const year = d.getUTCFullYear(), month = d.getUTCMonth() + 1, day = d.getUTCDate()
        const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        days.push({ date, ...localDayRange(year, month, day, timeZone) })
    }
    return days
}
