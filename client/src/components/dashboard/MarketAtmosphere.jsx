import { useEffect, useState } from 'react'

// Crypto Fear & Greed Index from alternative.me: free, no key, updated once a day.
// 0 = extreme fear, 100 = extreme greed. Their terms ask for the source to be shown.
// It's fetched straight from the browser (the API allows it), so the server isn't involved.
const FNG_URL = 'https://api.alternative.me/fng/?limit=2'

function sentimentColor(value) {
  if (value < 25) return '#ef4444' // extreme fear
  if (value < 45) return '#f59e0b' // fear
  if (value <= 55) return '#22d3ee' // neutral
  return '#22c55e'                 // greed, extreme greed
}

export default function MarketAtmosphere() {
  // { today: { value, label }, yesterday: { value, label } }
  const [index, setIndex] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(FNG_URL, { signal: AbortSignal.timeout(8000) })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then(({ data }) => {
        const read = entry => entry && { value: Number(entry.value), label: entry.value_classification.toUpperCase() }
        if (!cancelled) setIndex({ today: read(data[0]), yesterday: read(data[1]) })
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [])

  const { today, yesterday } = index ?? {}

  return (
    <div style={{
      margin: '0.75rem 1rem 0',
      backgroundColor: '#141414',
      borderRadius: '12px',
      padding: '1rem',
    }}>
      <div style={{ color: '#555', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '12px' }}>
        MARKET_ATMOSPHERE · CRYPTO
      </div>

      {failed ? (
        <div style={{ color: '#444', fontSize: '11px' }}>Fear & Greed index unavailable right now.</div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: '#444', fontSize: '10px', letterSpacing: '1px', marginBottom: '4px' }}>
              YESTERDAY
            </div>
            <div style={{ color: yesterday ? sentimentColor(yesterday.value) : '#555', fontSize: '16px', letterSpacing: '1px' }}>
              {yesterday ? yesterday.value : '—'}
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#444', fontSize: '10px', letterSpacing: '1px', marginBottom: '4px' }}>
              FEAR & GREED INDEX
            </div>
            <div style={{
              color: today ? sentimentColor(today.value) : '#555',
              fontSize: '16px',
              letterSpacing: '1px',
            }}>
              {today ? today.value : '—'}{' '}
              {today && (
                <span style={{ fontSize: '12px', opacity: 0.8 }}>
                  ({today.label})
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ color: '#333', fontSize: '9px', letterSpacing: '0.5px', marginTop: '10px' }}>
        Source: alternative.me
      </div>
    </div>
  )
}
