import { useMemo, useRef, useState } from 'react'
import { useCurrency } from '../../context/CurrencyContext'

const WIDTH = 360
const HEIGHT = 150
const PAD = { top: 12, right: 8, bottom: 20, left: 8 }
const RANGES = [{ key: '1M', days: 30 }, { key: '3M', days: 90 }]

// Equity over time for one account. A single series, so no legend: the card title
// names it. Hover or drag shows a crosshair with the day's value, plus any deposit
// or withdrawal that day (those are the steps in the line, D-27).
// points: [{ date, value (USD), movements: [{ type, amountUsd }] }], oldest first.
export default function EquityChart({ points, color }) {
  const { formatUsd } = useCurrency()
  const [range, setRange] = useState('3M')
  const [hover, setHover] = useState(null)
  const svgRef = useRef(null)

  const shown = useMemo(() => {
    const days = RANGES.find(r => r.key === range).days
    return points.slice(-days - 1)
  }, [points, range])

  const geometry = useMemo(() => {
    if(shown.length < 2) return null
    const values = shown.map(p => p.value)
    let min = Math.min(...values)
    let max = Math.max(...values)
    const pad = (max - min) * 0.12 || Math.abs(max) * 0.05 || 1
    min -= pad
    max += pad
    const innerW = WIDTH - PAD.left - PAD.right
    const innerH = HEIGHT - PAD.top - PAD.bottom
    const x = i => PAD.left + (i / (shown.length - 1)) * innerW
    const y = v => PAD.top + (1 - (v - min) / (max - min)) * innerH
    const line = shown.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('')
    const area = `${line}L${x(shown.length - 1).toFixed(1)},${HEIGHT - PAD.bottom}L${PAD.left},${HEIGHT - PAD.bottom}Z`
    const grid = [0.25, 0.5, 0.75].map(f => ({ y: PAD.top + f * innerH, value: max - f * (max - min) }))
    return { x, y, line, area, grid }
  }, [shown])

  if(!geometry){
    return (
      <div style={{ color: '#555', fontSize: '12px', padding: '2rem 0', textAlign: 'center' }}>
        Not enough history yet. The chart fills in as days are recorded.
      </div>
    )
  }

  const first = shown[0].value
  const last = shown.at(-1).value
  // The heading is performance, so deposits and withdrawals inside the range are taken
  // out (D-27): a deposit lifts the line but isn't profit. The first point already
  // includes its own day's movements, so only later days count. Balance corrections
  // stay in: they stand in for unlogged swaps and commissions, which are trading costs.
  const netCashIn = shown.slice(1).reduce(
    (sum, p) => sum + p.movements.filter(m => m.type !== 'ADJUSTMENT').reduce((s, m) => s + m.amountUsd, 0),
    0,
  )
  const change = last - first - netCashIn

  const handlePointer = e => {
    const rect = svgRef.current.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    const svgX = ratio * WIDTH
    const index = Math.round(((svgX - PAD.left) / (WIDTH - PAD.left - PAD.right)) * (shown.length - 1))
    setHover(Math.max(0, Math.min(shown.length - 1, index)))
  }

  const hovered = hover === null ? null : shown[hover]
  const tooltipLeft = hover === null ? 0 : (geometry.x(hover) / WIDTH) * 100

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '12px' }}>
          <span style={{ color: change >= 0 ? '#22c55e' : '#ef4444' }}>
            {change >= 0 ? '▲' : '▼'} {formatUsd(Math.abs(change))} from trading
          </span>
          <span style={{ color: '#666' }}>
            {' · '}{range === '1M' ? '30 days' : '90 days'}
            {/* Explains why the line moved more (or less) than the trading figure. */}
            {netCashIn !== 0 && ` · ${formatUsd(netCashIn, { signed: true })} net cash in`}
          </span>
        </span>
        <div role="radiogroup" aria-label="Chart range" style={{ display: 'flex', gap: '4px' }}>
          {RANGES.map(r => (
            <button
              key={r.key}
              type="button"
              role="radio"
              aria-checked={range === r.key}
              onClick={() => { setRange(r.key); setHover(null) }}
              style={{
                background: range === r.key ? '#262626' : 'none',
                border: '1px solid #2a2a2a', borderRadius: '6px',
                color: range === r.key ? '#e5e7eb' : '#666',
                fontSize: '10px', padding: '4px 8px', cursor: 'pointer', fontFamily: 'monospace',
              }}
            >
              {r.key}
            </button>
          ))}
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          width="100%"
          role="img"
          aria-label={`Equity chart, ${formatUsd(first)} to ${formatUsd(last)}`}
          onPointerMove={handlePointer}
          onPointerDown={handlePointer}
          onPointerLeave={() => setHover(null)}
          style={{ display: 'block', touchAction: 'pan-y', cursor: 'crosshair' }}
        >
          <defs>
            <linearGradient id={`eq-fill-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Recessive grid with value labels */}
          {geometry.grid.map(g => (
            <g key={g.y}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={g.y} y2={g.y} stroke="#1f1f1f" strokeWidth="1" />
              <text x={WIDTH - PAD.right} y={g.y - 3} textAnchor="end" fill="#4b5563" fontSize="9" fontFamily="monospace">
                {formatUsd(g.value, { compact: true })}
              </text>
            </g>
          ))}

          <path d={geometry.area} fill={`url(#eq-fill-${color.slice(1)})`} />
          <path d={geometry.line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

          {/* Days with a deposit or withdrawal: 8px markers ringed in the surface colour */}
          {shown.map((p, i) => p.movements.length > 0 && (
            <circle key={p.date} cx={geometry.x(i)} cy={geometry.y(p.value)} r="4" fill="#e5e7eb" stroke="#141414" strokeWidth="2" />
          ))}

          {/* Date labels at both ends */}
          <text x={PAD.left} y={HEIGHT - 5} fill="#4b5563" fontSize="9" fontFamily="monospace">{shortDate(shown[0].date)}</text>
          <text x={WIDTH - PAD.right} y={HEIGHT - 5} textAnchor="end" fill="#4b5563" fontSize="9" fontFamily="monospace">Today</text>

          {hovered && (
            <g pointerEvents="none">
              <line x1={geometry.x(hover)} x2={geometry.x(hover)} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="#4b5563" strokeWidth="1" strokeDasharray="3 3" />
              <circle cx={geometry.x(hover)} cy={geometry.y(hovered.value)} r="4.5" fill={color} stroke="#141414" strokeWidth="2" />
            </g>
          )}
        </svg>

        {hovered && (
          <div style={{
            position: 'absolute', top: 0,
            left: `${tooltipLeft}%`,
            transform: `translateX(${tooltipLeft > 60 ? 'calc(-100% - 10px)' : '10px'})`,
            backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', borderRadius: '8px',
            padding: '6px 9px', pointerEvents: 'none', whiteSpace: 'nowrap',
          }}>
            <div style={{ color: '#9ca3af', fontSize: '10px', marginBottom: '2px' }}>{shortDate(hovered.date)}</div>
            <div style={{ color: '#e5e7eb', fontSize: '13px' }}>{formatUsd(hovered.value)}</div>
            {hovered.movements.map((m, i) => (
              <div key={i} style={{ color: '#9ca3af', fontSize: '10px', marginTop: '2px' }}>
                {MOVEMENT_LABEL[m.type]} {formatUsd(m.amountUsd, { signed: true })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const MOVEMENT_LABEL = { DEPOSIT: 'Deposit', WITHDRAWAL: 'Withdrawal', ADJUSTMENT: 'Adjustment' }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function shortDate(iso){
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}
