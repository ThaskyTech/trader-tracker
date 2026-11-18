import { useNavigate } from 'react-router-dom'
import CalendarCell from './CalendarCell'
import { useCurrency } from '../../context/CurrencyContext'

const MONTHS = [
  'JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
  'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'
]

const pad = n => String(n).padStart(2, '0')

// view: { year, month (1-12) }, owned by the Dashboard so the P&L and win rate
// cards follow the same month. days: { 1: 840, 2: -1205, ... } in USD, or
// undefined while loading.
// onDayClick: optional (dateKey) => void. Defaults to opening that day's Daily Log;
// pass null to make the days not clickable (the account preview does this).
export default function CalendarGrid({ view, days, onPrev, onNext, onDayClick }) {
  const navigate = useNavigate()
  const { formatUsd } = useCurrency()
  const { year, month } = view

  const today = new Date()
  const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  const daysInMonth = new Date(year, month, 0).getDate()
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  // Any day up to today opens its Daily Log, including empty ones, so a missed
  // trade can be added from there. Future days can't have closed trades yet.
  const dateKey = day => `${year}-${pad(month)}-${pad(day)}`
  const openDay = onDayClick === undefined ? key => navigate(`/daily/${key}`) : onDayClick

  return (
    <div style={{
      margin: '0.75rem 1rem 0',
      backgroundColor: '#141414',
      borderRadius: '12px',
      padding: '1rem',
    }}>
      {/* Month header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px',
      }}>
        <button onClick={onPrev} aria-label="Previous month" style={arrowStyle}>‹</button>
        <span style={{
          color: '#e5e7eb',
          fontSize: '13px',
          fontWeight: '500',
          letterSpacing: '1.5px',
        }}>
          {MONTHS[month - 1]} {year}
        </span>
        <button onClick={onNext} aria-label="Next month" style={arrowStyle}>›</button>
      </div>

      {/* Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '6px',
        opacity: days ? 1 : 0.5,
        transition: 'opacity 0.15s',
      }}>
        {dayNumbers.map(day => {
          const key = dateKey(day)
          const amount = days?.[day] ?? null
          return (
            <CalendarCell
              key={day}
              day={day}
              amount={amount}
              label={amount === null ? null : formatUsd(amount, { signed: true, compact: true })}
              isToday={key === todayKey}
              onClick={openDay && key <= todayKey ? () => openDay(key) : null}
            />
          )
        })}
      </div>
    </div>
  )
}

const arrowStyle = {
  background: 'none',
  border: 'none',
  color: '#555',
  fontSize: '20px',
  cursor: 'pointer',
  padding: '0 8px',
  lineHeight: 1,
  fontFamily: 'monospace',
}
