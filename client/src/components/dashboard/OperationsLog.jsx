import { useNavigate } from 'react-router-dom'
import { useCurrency } from '../../context/CurrencyContext'
import { toLocalDateString } from '../../utils/tradeForm'

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const pad = n => String(n).padStart(2, '0')

// "14:02" for today, "17 Nov" for earlier days.
function formatWhen(iso) {
  const d = new Date(iso)
  return toLocalDateString(d) === toLocalDateString(new Date())
    ? `${pad(d.getHours())}:${pad(d.getMinutes())}`
    : `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

// The latest closed trades. Tapping one opens the Daily Log for its day.
// `trades` is undefined while loading.
export default function OperationsLog({ trades }) {
  const navigate = useNavigate()
  const { formatTradePnl } = useCurrency()

  return (
    <div style={{
      margin: '0.75rem 1rem 0',
      backgroundColor: '#141414',
      borderRadius: '12px',
      padding: '1rem',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px',
      }}>
        <span style={{ color: '#22c55e', fontSize: '10px', letterSpacing: '1.5px' }}>
          RECENT_EXECUTIONS
        </span>
        <div style={{
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          backgroundColor: '#22c55e',
        }} />
      </div>

      {trades === undefined && <div style={{ color: '#444', fontSize: '11px' }}>LOADING...</div>}

      {trades?.length === 0 && (
        <div style={{ color: '#444', fontSize: '11px' }}>No trades yet. Tap + to log your first one.</div>
      )}

      {trades?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {trades.map(trade => {
            const color = trade.direction === 'LONG' ? '#22c55e' : '#ef4444'
            return (
              <div
                key={trade.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/daily/${toLocalDateString(new Date(trade.closedAt))}`)}
                onKeyDown={e => { if (e.key === 'Enter') navigate(`/daily/${toLocalDateString(new Date(trade.closedAt))}`) }}
                style={{
                  display: 'flex',
                  gap: '10px',
                  borderLeft: `2px solid ${color}33`,
                  paddingLeft: '10px',
                  cursor: 'pointer',
                }}
              >
                <span style={{ color: '#444', fontSize: '11px', minWidth: '48px', paddingTop: '1px' }}>
                  {formatWhen(trade.closedAt)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ color, fontSize: '11px', letterSpacing: '0.5px' }}>
                    {trade.direction}{' '}
                  </span>
                  <span style={{ color: '#888', fontSize: '11px' }}>
                    {trade.symbol} · {trade.broker}
                  </span>
                </div>
                <span style={{
                  color: trade.pnl < 0 ? '#ef4444' : '#22c55e',
                  fontSize: '11px',
                  whiteSpace: 'nowrap',
                }}>
                  {formatTradePnl(trade, { signed: true })}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
