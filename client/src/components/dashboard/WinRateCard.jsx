export default function WinRateCard() {
  const wins = 22
  const total = 32
  const rate = ((wins / total) * 100).toFixed(1)

  const getEfficiency = (r) => {
    if (r >= 70) return 'HIGH'
    if (r >= 50) return 'MODERATE'
    return 'LOW'
  }

  return (
    <div style={{
      margin: '0.75rem 1rem 0',
      backgroundColor: '#141414',
      borderRadius: '12px',
      padding: '1rem',
    }}>
      <div style={{ color: '#555', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '8px' }}>
        WIN RATE
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '6px' }}>
        <span style={{ color: '#22d3ee', fontSize: '28px', fontWeight: '600' }}>
          {rate}%
        </span>
        <span style={{ color: '#555', fontSize: '13px' }}>
          {wins} / {total}
        </span>
      </div>

      <div style={{ color: '#444', fontSize: '11px', letterSpacing: '0.5px' }}>
        Operational efficiency:{' '}
        <span style={{ color: '#22d3ee' }}>{getEfficiency(parseFloat(rate))}</span>
      </div>
    </div>
  )
}