const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const pad = n => String(n).padStart(2, '0')

// "08:14" if the timestamp falls on `day` ('YYYY-MM-DD') in local time,
// otherwise "16 Nov 23:50", so a trade held overnight is clear.
export function formatTradeTime(iso, day){
    const d = new Date(iso)
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
    const sameDay = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` === day
    return sameDay ? time : `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${time}`
}
