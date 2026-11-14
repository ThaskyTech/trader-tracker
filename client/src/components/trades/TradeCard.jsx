export default function TradeCard({ trade }) {
  const isProfit = trade.pnl >= 0
  const isLong = trade.direction === 'LONG'

  return (
    <div style={{
      backgroundColor: '#141414',
      borderRadius: '12px',
      overflow: 'hidden',
      marginBottom: '10px',
    }}>
      {/* Top row — symbol, direction, status */}
      <div style={{
        backgroundColor: '#1a1a1a',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            color: isLong ? '#22c55e' : '#ef4444',
            fontSize: '13px',
            fontWeight: '500',
            letterSpacing: '0.5px',
          }}>
            {trade.symbol}
          </span>
          <span style={{ color: '#444', fontSize: '12px' }}>•</span>
          <span style={{ color: '#888', fontSize: '12px', letterSpacing: '0.5px' }}>
            {trade.direction}
          </span>
        </div>

        <span style={{
          fontSize: '10px',
          letterSpacing: '0.5px',
          padding: '3px 8px',
          borderRadius: '4px',
          backgroundColor: isLong ? '#16a34a22' : '#dc262622',
          color: isLong ? '#22c55e' : '#ef4444',
          border: `1px solid ${isLong ? '#16a34a44' : '#dc262644'}`,
        }}>
          {trade.status}
        </span>
      </div>

      {/* Detail grid */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '10px',
          marginBottom: '12px',
        }}>
          <DetailField label="BROKER" value={trade.broker} />
          <DetailField label="LOT SIZE" value={trade.lotSize.toFixed(2)} />
          <DetailField label="ENTRY TIME" value={trade.entryTime} />
          <DetailField label="EXIT TIME" value={trade.exitTime} />
        </div>

        <div>
          <div style={{ color: '#555', fontSize: '10px', letterSpacing: '1px', marginBottom: '4px' }}>
            NET P/L
          </div>
          <div style={{
            color: isProfit ? '#22c55e' : '#ef4444',
            fontSize: '15px',
            fontWeight: '500'
          }}>
            {isProfit ? '+' : '-'}${Math.abs(trade.pnl).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailField({ label, value }) {
  return (
    <div>
      <div style={{ color: '#555', fontSize: '10px', letterSpacing: '1px', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ color: '#ccc', fontSize: '13px' }}>
        {value}
      </div>
    </div>
  )
}