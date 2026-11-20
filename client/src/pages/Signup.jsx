import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { BrandHeader } from '../components/common/Brand'

export default function Signup() {
  const navigate = useNavigate()
  const { signup } = useAuth()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSignup = async (e) => {
    e?.preventDefault()
    if (loading) return
    if (!username || !email || !password || !confirm) {
      setError('All fields required.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await signup(email, username, password)
      navigate('/')
    }catch(err){
      setError(err.message)
    }finally{
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

      {/* A real form, so Enter submits and password managers offer to save the password. */}
      <form onSubmit={handleSignup} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <div style={labelStyle}>USERNAME</div>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            placeholder="your_name"
            style={inputStyle}
          />
        </div>

        <div>
          <div style={labelStyle}>EMAIL</div>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            style={inputStyle}
          />
        </div>

        <div>
          <div style={labelStyle}>PASSWORD</div>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="Min. 8 characters"
            style={inputStyle}
          />
        </div>

        <div>
          <div style={labelStyle}>CONFIRM PASSWORD</div>
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="••••••••"
            style={inputStyle}
          />
        </div>

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
          {loading ? 'CREATING ACCOUNT…' : 'CREATE ACCOUNT'}
        </button>
      </form>

      {/* Footer */}
      <div style={{
        marginTop: '2rem',
        textAlign: 'center',
        color: '#555',
        fontSize: '13px',
      }}>
        Already have an account?{' '}
        <Link to="/login" style={{ color: '#22c55e', textDecoration: 'none' }}>
          Sign in
        </Link>
      </div>

    </div>
  )
}

const labelStyle = {
  color: '#555',
  fontSize: '10px',
  letterSpacing: '1.5px',
  marginBottom: '8px',
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