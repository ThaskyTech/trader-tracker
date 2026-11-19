import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_URL } from '../../api/client'
import { useAccounts } from '../../context/AccountsContext'
import { freshnessLine, syncState } from '../../utils/accounts'

const PING_EVERY_MS = 30 * 1000
const TIMEOUT_MS = 8000

const latencyColor = ms => (ms < 300 ? '#22c55e' : ms < 1000 ? '#f59e0b' : '#ef4444')

// D-42. With synced accounts, the question this card answers is "can I trust the
// numbers above?", so it shows each synced account's freshness (D-14) instead of the
// API's response time. Without any, it stays the API health check.
export default function SystemStatusCard() {
  const { synced, titleOf } = useAccounts()
  return synced.length > 0 ? <SyncStatus accounts={synced} titleOf={titleOf} /> : <ApiStatus />
}

function Frame({ color, label, children }) {
  return (
    <div style={{
      margin: '0.75rem 1rem 0',
      backgroundColor: '#141414',
      borderRadius: '12px',
      padding: '1rem',
      border: `1px solid ${color}33`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: color }} />
        <span style={{ color, fontSize: '10px', letterSpacing: '1.5px' }}>{label}</span>
      </div>
      {children}
    </div>
  )
}

// One row per synced account; a tap opens it, where the banner explains any problem.
function SyncStatus({ accounts, titleOf }) {
  const navigate = useNavigate()
  const states = accounts.map(a => syncState(a))
  const failing = states.filter(s => s === 'ERROR' || s === 'RECONNECT').length
  const stale = states.filter(s => s === 'STALE').length
  const color = failing ? '#ef4444' : stale ? '#f59e0b' : '#22c55e'
  const headline = failing ? `${failing} NEED${failing === 1 ? 'S' : ''} ATTENTION` : stale ? 'BEHIND SCHEDULE' : 'ALL UP TO DATE'

  return (
    <Frame color={color} label={`SYNC STATUS · ${headline}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {accounts.map(account => {
          const freshness = freshnessLine(account)
          return (
            <button
              key={account.id}
              type="button"
              onClick={() => navigate(`/accounts/${account.id}`)}
              style={{
                display: 'flex', justifyContent: 'space-between', gap: '10px', background: 'none', border: 'none',
                padding: 0, cursor: 'pointer', fontFamily: 'monospace', textAlign: 'left',
              }}
            >
              <span style={{ color: '#e5e7eb', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titleOf(account)}</span>
              <span style={{ color: freshness.color, fontSize: '11px', flexShrink: 0 }}>{freshness.text}</span>
            </button>
          )
        })}
      </div>
    </Frame>
  )
}

// Real connection check: times a request to the API's /health endpoint, every 30s.
// The first ping after the server has been idle can be slow while it wakes up.
function ApiStatus() {
  // { online: boolean, latency: ms } once the first ping finishes
  const [status, setStatus] = useState(null)

  useEffect(() => {
    let cancelled = false

    const ping = async () => {
      const started = performance.now()
      try {
        const response = await fetch(`${API_URL}/health`, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) })
        if (!cancelled) setStatus({ online: response.ok, latency: Math.round(performance.now() - started) })
      } catch {
        if (!cancelled) setStatus({ online: false, latency: null })
      }
    }

    ping()
    const timer = setInterval(ping, PING_EVERY_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  const color = status === null ? '#555' : status.online ? '#22c55e' : '#ef4444'
  const headline = status === null ? 'CHECKING...' : status.online ? 'STABLE' : 'UNREACHABLE'

  return (
    <Frame color={color} label="SYSTEM STATUS">
      <div style={{ color: '#e5e7eb', fontSize: '13px', letterSpacing: '0.5px', marginBottom: '8px' }}>
        API CONNECTION<br />{headline}
      </div>

      {/* No "Host:" line: the server's address doesn't help the user decide anything. */}
      <div style={{ color: '#444', fontSize: '11px', letterSpacing: '0.5px' }}>
        Response time:{' '}
        <span style={{ color: status?.latency != null ? latencyColor(status.latency) : '#666' }}>
          {status?.latency != null ? `${status.latency}ms` : '—'}
        </span>
      </div>
    </Frame>
  )
}
