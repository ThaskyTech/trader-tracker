// Win rate for the month the calendar is showing. Break-even trades count
// towards the total but aren't wins (the server decides this in summarizeTrades).
export default function WinRateCard({ summary }) {
  const hasTrades = summary?.totalTrades > 0


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
        <span style={{ color: hasTrades ? '#22d3ee' : '#555', fontSize: '28px', fontWeight: '600' }}>
          {hasTrades ? `${summary.winRate.toFixed(1)}%` : '—'}
        </span>
        {summary && (
          <span style={{ color: '#555', fontSize: '13px' }}>
            {summary.wins} / {summary.totalTrades}
          </span>
        )}
      </div>

      {/* No "efficiency" grade: it restated the percentage in words, and win rate alone
          doesn't measure efficiency (a 40% win rate with big winners is a good result). */}
      {!hasTrades && (
        <div style={{ color: '#444', fontSize: '11px', letterSpacing: '0.5px' }}>No closed trades this month.</div>
      )}
    </div>
  )
}
