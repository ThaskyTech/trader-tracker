// One day in the calendar. `label` is the already-formatted P&L (e.g. '+R12.3K'),
// `amount` its raw value, used for the colour. `onClick` is null for days that
// can't be opened (in the future).
export default function CalendarCell({ day, amount, label, isToday, onClick }) {
  const isProfit = amount > 0
  const hasData = amount !== null && amount !== undefined

  return (
    <div
      onClick={onClick ?? undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }) : undefined}
      style={{
        backgroundColor: '#141414',
        borderRadius: '8px',
        padding: '10px 4px 8px',
        textAlign: 'center',
        border: isToday ? '2px solid #22d3ee' : '2px solid transparent',
        cursor: onClick ? 'pointer' : 'default',
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
          // Break-even days (exactly 0) show grey rather than as a loss.
          color: isProfit ? '#22c55e' : amount < 0 ? '#ef4444' : '#888',
          fontSize: '15px',
          fontWeight: '500',
          lineHeight: 1,
        }}>
          {label}
        </span>
      ) : (
        <span style={{ color: '#2a2a2a', fontSize: '20px', lineHeight: 1 }}>——</span>
      )}
    </div>
  )
}
