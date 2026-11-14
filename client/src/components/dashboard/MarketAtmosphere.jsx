export default function MarketAtmosphere() {
  const fearGreedIndex = 84
  const volatility = 'LOW'

  const getSentiment = (index) => {
    if (index >= 75) return 'GREED'
    if (index >= 55) return 'NEUTRAL'
    if (index >= 35) return 'FEAR'
    return 'EXTREME FEAR'
  }

  const getSentimentColor = (index) => {
    if (index >= 75) return '#f59e0b'
    if (index >= 55) return '#22d3ee'
    return '#ef4444'
  }

  return (
    <div style={{
      margin: '0.75rem 1rem 0',
      backgroundColor: '#141414',
      borderRadius: '12px',
      padding: '1rem',
    }}>
      <div style={{ color: '#555', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '12px' }}>
        MARKET_ATMOSPHERE
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ color: '#444', fontSize: '10px', letterSpacing: '1px', marginBottom: '4px' }}>
            VOLATILITY
          </div>
          <div style={{ color: '#22d3ee', fontSize: '16px', letterSpacing: '1px' }}>
            {volatility}
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#444', fontSize: '10px', letterSpacing: '1px', marginBottom: '4px' }}>
            FEAR & GREED INDEX
          </div>
          <div style={{
            color: getSentimentColor(fearGreedIndex),
            fontSize: '16px',
            letterSpacing: '1px',
          }}>
            {fearGreedIndex}{' '}
            <span style={{ fontSize: '12px', opacity: 0.8 }}>
              ({getSentiment(fearGreedIndex)})
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}