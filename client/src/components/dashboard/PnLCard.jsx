export default function PnlCard() {
  const pnl = 18240.55
  const change = 14.2
  const isProfit = pnl >= 0

  return (
    <div style={{
      margin: '0 1rem',
      backgroundColor: '#141414',
      borderRadius: '12px',
      padding: '1rem',
    }}>
      <div style={{ color: '#555', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '8px' }}>
        MONTHLY PNL
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '12px' }}>
        <span style={{
          color: isProfit ? '#22c55e' : '#ef4444',
          fontSize: '28px',
          fontWeight: '600',
          letterSpacing: '-1px',
        }}>
          {isProfit ? '+' : '-'}${Math.abs(pnl).toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </span>
        <span style={{
          color: isProfit ? '#22c55e' : '#ef4444',
          fontSize: '12px',
          opacity: 0.8,
        }}>
          {isProfit ? '▲' : '▼'} {change}%
        </span>
      </div>

      <div style={{
        height: '2px',
        backgroundColor: '#1f1f1f',
        borderRadius: '2px',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${Math.min(change * 4, 100)}%`,
          backgroundColor: isProfit ? '#22c55e' : '#ef4444',
          borderRadius: '2px',
        }} />
      </div>
    </div>
  )
}