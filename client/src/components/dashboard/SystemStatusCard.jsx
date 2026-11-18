import { useEffect, useState } from 'react'
import { API_URL } from '../../api/client'

const PING_EVERY_MS = 30 * 1000
const TIMEOUT_MS = 8000

const latencyColor = ms => (ms < 300 ? '#22c55e' : ms < 1000 ? '#f59e0b' : '#ef4444')

// Real connection check: times a request to the API's /health endpoint, every 30s.
// The first ping after the server has been idle can be slow while it wakes up.
export default function SystemStatusCard() {
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
    <div style={{
      margin: '0.75rem 1rem 0',
      backgroundColor: '#141414',
      borderRadius: '12px',
      padding: '1rem',
      border: `1px solid ${color}33`,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '10px',
      }}>
        <div style={{
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          backgroundColor: color,
        }} />
        <span style={{ color, fontSize: '10px', letterSpacing: '1.5px' }}>
          SYSTEM STATUS
        </span>
      </div>

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
    </div>
  )
}
