import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CalendarCell from './CalendarCell'

// mock data — keyed by day number, value is net P&L for that day
const MOCK_DATA = {
  1:  840,
  2:  -1205,
  4:  3645,
  5:  4200,
  6:  1125,
  7:  -240,
  8:  1130,
  9:  5600,
  10: -380,
  12: -3202,
  13: 2454,
  14: 2243,
  15: -1507,
  18: 4601,
  19: -1625,
  20: 2752,
  21: 3730,
  25: -3905,
  26: 4150,
  27: -459,
  28: 341,
  29: 4382,
}

const MONTHS = [
  'JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
  'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'
]

export default function CalendarGrid() {
  const navigate = useNavigate()

  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const isToday = (day) =>
    day === today.getDate() &&
    viewMonth === today.getMonth() &&
    viewYear === today.getFullYear()

  const handlePrev = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }

  const handleNext = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  const handleDayPress = (day) => {
    const month = String(viewMonth + 1).padStart(2, '0')
    const dayStr = String(day).padStart(2, '0')
    navigate(`/daily/${viewYear}-${month}-${dayStr}`)
  }

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
        <button onClick={handlePrev} style={arrowStyle}>‹</button>
        <span style={{
          color: '#e5e7eb',
          fontSize: '13px',
          fontWeight: '500',
          letterSpacing: '1.5px',
        }}>
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <button onClick={handleNext} style={arrowStyle}>›</button>
      </div>

      {/* Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '6px',
      }}>
        {days.map(day => (
          <CalendarCell
            key={day}
            day={day}
            amount={MOCK_DATA[day] ?? null}
            isToday={isToday(day)}
            onClick={handleDayPress}
          />
        ))}
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