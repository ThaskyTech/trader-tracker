import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authApi } from '../api/client'
import { SummaMark } from '../components/common/Brand'

// Where the emailed link lands: /verify-email?token=… (D-70). The page sends the token
// to the server itself (a POST), so a mail scanner opening the link can't use it up.
// The link may be opened on a device that isn't signed in (a phone's mail app), so
// the next step depends on whether someone is signed in here.
export default function VerifyEmail() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { user, refreshVerification } = useAuth()
  const [state, setState] = useState({ phase: 'checking' }) // checking | done | failed
  // React runs effects twice in development; a link only works once.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    authApi.verifyEmail(params.get('token') ?? '')
      .then(() => setState({ phase: 'done' }))
      .catch(err => setState({ phase: 'failed', message: err.message }))
  }, [params])

  // Signed in here: refresh the session so the app opens straight away.
  const continueIn = async () => {
    try { await refreshVerification() } catch { /* the app re-checks on load anyway */ }
    navigate('/', { replace: true })
  }

  const heading = { checking: 'Confirming your email…', done: 'Email confirmed', failed: "That link didn't work" }[state.phase]

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '2rem 1.5rem', boxSizing: 'border-box' }}>
      <SummaMark size={36} animate={false} />
      <h1 style={{ margin: '18px 0 0', color: '#fff', fontSize: '26px', fontWeight: 600, letterSpacing: '-0.5px' }}>{heading}</h1>

      {state.phase === 'done' && (
        <p style={{ color: '#9ca3af', fontSize: '13px', lineHeight: 1.6, margin: '10px 0 0' }}>
          {user ? 'Your account is ready.' : 'Sign in to start using Summa.'}
        </p>
      )}
      {state.phase === 'failed' && (
        <p role="alert" style={{ color: '#9ca3af', fontSize: '13px', lineHeight: 1.6, margin: '10px 0 0' }}>{state.message}</p>
      )}

      {state.phase !== 'checking' && (
        <button
          type="button"
          // Failed and signed in: the app's "check your email" screen has the resend button.
          onClick={() => (user ? (state.phase === 'done' ? continueIn() : navigate('/', { replace: true })) : navigate('/login', { replace: true }))}
          style={{
            marginTop: '24px', backgroundColor: '#16a34a', border: 'none', borderRadius: '10px', color: '#fff',
            fontSize: '13px', fontWeight: 600, letterSpacing: '1px', padding: '16px', cursor: 'pointer', fontFamily: 'monospace',
          }}
        >
          {!user ? 'SIGN IN' : state.phase === 'done' ? 'CONTINUE' : 'GET A NEW LINK'}
        </button>
      )}
    </div>
  )
}
