import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { authApi } from '../api/client'
import { SummaMark } from '../components/common/Brand'

const CHECK_EVERY_MS = 10_000

// Shown instead of every page while a signed-in user's email isn't verified (D-70).
// Each part has one job:
//   the address: so a typo is spotted (signing out and up again is the fix)
//   RESEND: for a lost or expired link
//   sign out: to use another account, or start again with the right address
// No "I've verified" button: the page notices by itself, checking every 10 s while
// it's visible and as soon as the user comes back to it (e.g. from their mail app).
export default function CheckEmail() {
  const { user, logout, refreshVerification } = useAuth()
  const [status, setStatus] = useState(null) // { tone: 'ok' | 'warn' | 'error', text }
  const [sending, setSending] = useState(false)

  const check = useCallback(() => {
    if (document.visibilityState !== 'visible') return
    refreshVerification().catch(() => { /* offline for a moment: the next check retries */ })
  }, [refreshVerification])

  useEffect(() => {
    const timer = setInterval(check, CHECK_EVERY_MS)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [check])

  const resend = async () => {
    setSending(true)
    setStatus(null)
    try {
      const { sentTo, delivered } = await authApi.resendVerification()
      setStatus(delivered
        ? { tone: 'ok', text: `Sent a new link to ${sentTo}.` }
        // The server has no email set up (no RESEND_API_KEY): say so, don't pretend.
        : { tone: 'warn', text: "Email sending isn't set up on this server yet, so nothing was sent." })
    } catch (err) {
      setStatus({ tone: 'error', text: err.message })
    } finally {
      setSending(false)
    }
  }

  const toneColor = { ok: '#22c55e', warn: '#f59e0b', error: '#ef4444' }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '2rem 1.5rem', boxSizing: 'border-box' }}>
      <SummaMark size={36} animate={false} />
      <h1 style={{ margin: '18px 0 0', color: '#fff', fontSize: '26px', fontWeight: 600, letterSpacing: '-0.5px' }}>Check your email</h1>
      <p style={{ color: '#9ca3af', fontSize: '13px', lineHeight: 1.6, margin: '10px 0 0' }}>
        We sent a link to <span style={{ color: '#e5e7eb', overflowWrap: 'anywhere' }}>{user.email}</span>. Open it to finish setting up your account. It works for 24 hours.
      </p>

      {status && (
        <div role="status" style={{ color: toneColor[status.tone], fontSize: '12px', lineHeight: 1.5, marginTop: '18px' }}>{status.text}</div>
      )}

      <button
        type="button"
        onClick={resend}
        disabled={sending}
        style={{
          marginTop: '24px', backgroundColor: sending ? '#14532d' : '#16a34a', border: 'none', borderRadius: '10px',
          color: sending ? '#555' : '#fff', fontSize: '13px', fontWeight: 600, letterSpacing: '1px', padding: '16px',
          cursor: sending ? 'not-allowed' : 'pointer', fontFamily: 'monospace',
        }}
      >
        {sending ? 'SENDING…' : 'SEND A NEW LINK'}
      </button>

      <button
        type="button"
        onClick={logout}
        style={{ marginTop: '18px', background: 'none', border: 'none', color: '#777', fontSize: '12px', cursor: 'pointer', fontFamily: 'monospace' }}
      >
        Wrong address? Sign out
      </button>
    </div>
  )
}
