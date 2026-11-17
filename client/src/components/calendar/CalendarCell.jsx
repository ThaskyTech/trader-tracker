import { formatCellAmount } from '../../utils/format'

export default function CalendarCell({ day, amount, isToday, onClick }) {
  const formatted = formatCellAmount(amount)
  const isProfit = amount > 0
  const hasData = amount !== null && amount !== undefined

  return (
    <div
      onClick={() => hasData && onClick(day)}
      style={{
        backgroundColor: '#141414',
        borderRadius: '8px',
        padding: '10px 4px 8px',
        textAlign: 'center',
        border: isToday ? '2px solid #22d3ee' : '2px solid transparent',
        cursor: hasData ? 'pointer' : 'default',
        transition: 'background-color 0.15s',
        minHeight: '68px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: '12px',
      }}
    >
      <span style={{
        color: isToday ? '#fff' : '#666',
        fontSize: '13px',
        fontWeight: isToday ? '500' : '400',
        lineHeight: 1,
      }}>
        {String(day).padStart(2, '0')}
      </span>

      {hasData ? (
        <span style={{
          color: isProfit ? '#22c55e' : '#ef4444',
          fontSize: '15px',
          fontWeight: '500',
          lineHeight: 1,
        }}>
          {formatted}
        </span>
      ) : (
        <span style={{ color: '#2a2a2a', fontSize: '20px', lineHeight: 1 }}>——</span>
      )}
    </div>
  )
}