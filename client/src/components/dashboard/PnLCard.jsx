import { useCurrency } from '../../context/CurrencyContext'

const MONTHS_SHORT = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']

// P&L for the month the calendar is showing, compared with the month before.
// The comparison is a difference in money, not a %: a percentage of P&L breaks
// down when last month was negative or close to zero.
export default function PnlCard({ view, summary, previousSummary }) {
  const { formatUsd } = useCurrency()
  const monthLabel = `${MONTHS_SHORT[view.month - 1]} ${view.year}`
  const previousLabel = MONTHS_SHORT[(view.month + 10) % 12]

  const pnl = summary?.totalPnl
  const isProfit = pnl === undefined || pnl >= 0
  const hasComparison = summary && previousSummary && (summary.totalTrades > 0 || previousSummary.totalTrades > 0)
  const difference = hasComparison ? summary.totalPnl - previousSummary.totalPnl : null

  return (
    <div style={{
      margin: '0 1rem',
      backgroundColor: '#141414',
      borderRadius: '12px',
      padding: '1rem',
    }}>
      <div style={{ color: '#555', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '8px' }}>
        MONTHLY P/L · {monthLabel}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px 10px' }}>
        <span style={{
          color: pnl === undefined ? '#555' : isProfit ? '#22c55e' : '#ef4444',
          fontSize: '28px',
          fontWeight: '600',
          letterSpacing: '-1px',
        }}>
          {pnl === undefined ? '—' : formatUsd(pnl, { signed: true })}
        </span>
        {difference !== null && (
          <span style={{
            color: difference >= 0 ? '#22c55e' : '#ef4444',
            fontSize: '12px',
            opacity: 0.8,
          }}>
            {difference >= 0 ? '▲' : '▼'} {formatUsd(Math.abs(difference))} vs {previousLabel}
          </span>
        )}
      </div>
    </div>
  )
}
