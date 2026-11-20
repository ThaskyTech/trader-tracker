import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authApi } from '../api/client'
import { BrandHeader } from '../components/common/Brand'

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Off by default: only for the user's own device (D-68).
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  // Hidden until the server says signups are open, and if it can't be asked.
  const [signupsOpen, setSignupsOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    authApi.signupStatus()
      .then(({ open }) => { if (!cancelled) setSignupsOpen(open === true) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const handleLogin = async (e) => {
    e?.preventDefault()
    if (loading) return
    if (!email || !password) {
      setError('All fields required.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await login(email, password, remember)
      navigate('/')
    }catch(err){
      setError(err.message)
    }finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '2rem 1.5rem',
    }}>

      <BrandHeader />

      {/* A real form, so Enter submits and password managers recognise it. */}
      <form onSubmit={handleLogin} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <div style={{ color: '#555', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '8px' }}>
            EMAIL
          </div>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={inputStyle}
          />
        </div>

        <div>
          <div style={{ color: '#555', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '8px' }}>
            PASSWORD
          </div>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            style={inputStyle}
          />
        </div>

        {/* Without it, an hour unused signs you out, even with the browser left open. */}
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={remember}
            onChange={e => setRemember(e.target.checked)}
            style={{ width: '18px', height: '18px', margin: '1px 0 0', accentColor: '#16a34a', flexShrink: 0 }}
          />
          <span>
            <span style={{ display: 'block', color: '#e5e7eb', fontSize: '13px' }}>Keep me signed in on this device</span>
            <span style={{ display: 'block', color: '#555', fontSize: '11px', marginTop: '3px', lineHeight: 1.4 }}>
              For 30 days. Only on your own device. Otherwise you're signed out after an hour unused.
            </span>
          </span>
        </label>

        {error && (
          <div style={{
            color: '#ef4444',
            fontSize: '12px',
            letterSpacing: '0.3px',
            padding: '10px 12px',
            backgroundColor: '#ef444411',
            borderRadius: '8px',
            border: '1px solid #ef444433',
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: '8px',
            backgroundColor: loading ? '#14532d' : '#16a34a',
            border: 'none',
            borderRadius: '10px',
            color: loading ? '#555' : '#fff',
            fontSize: '13px',
            fontWeight: '600',
            letterSpacing: '1px',
            padding: '16px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'monospace',
            transition: 'background-color 0.2s',
          }}
        >
          {loading ? 'SIGNING IN…' : 'SIGN IN'}
        </button>
      </form>

      {/* Only while the server takes signups (D-71): when they're closed (D-04) the
          link would only lead to a refusal. */}
      {signupsOpen && (
        <div style={{ marginTop: '2rem', textAlign: 'center', color: '#555', fontSize: '13px' }}>
          No account?{' '}
          <Link to="/signup" style={{ color: '#22c55e', textDecoration: 'none' }}>
            Create one
          </Link>
        </div>
      )}
    </div>
  )
}

const inputStyle = {
  width: '100%',
  backgroundColor: '#141414',
  border: '1px solid #2a2a2a',
  borderRadius: '10px',
  color: '#e5e7eb',
  fontSize: '16px',
  padding: '14px',
  fontFamily: 'monospace',
  boxSizing: 'border-box',
  outline: 'none',
}