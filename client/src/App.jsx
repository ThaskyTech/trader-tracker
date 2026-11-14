import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import DailyLog from './pages/DailyLog'
import History from './pages/History'
import Settings from './pages/Settings'
import Login from './pages/Login'
import Signup from './pages/Signup'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/common/ProtectedRoute'

const AUTH_ROUTES = ['/login', '/signup']

function AppShell() {
  const location = useLocation()
  const isAuthScreen = AUTH_ROUTES.includes(location.pathname)

  return (
    <div style={{
      maxWidth: '430px',
      margin: '0 auto',
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#0a0a0a',
      position: 'relative',
    }}>
      <main style={{
        flex: 1,
        overflowY: 'auto',
        paddingBottom: isAuthScreen ? '0' : '64px',
      }}>
        <Routes>
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/daily/:date" element={<ProtectedRoute><DailyLog /></ProtectedRoute>} />
          <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
        </Routes>
      </main>

      {!isAuthScreen && (
        <nav style={{
          position: 'fixed',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: '430px',
          height: '64px',
          backgroundColor: '#141414',
          borderTop: '1px solid #1f1f1f',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>
          <NavLink to="/" end style={navStyle}>
            {({ isActive }) => <NavItem icon="⊞" label="HOME" active={isActive} />}
          </NavLink>
          <NavLink to="/history" style={navStyle}>
            {({ isActive }) => <NavItem icon="◫" label="HISTORY" active={isActive} />}
          </NavLink>
          <NavLink to="/settings" style={navStyle}>
            {({ isActive }) => <NavItem icon="⊟" label="SETTINGS" active={isActive} />}
          </NavLink>
        </nav>
      )}
    </div>
  )
}

function NavItem({ icon, label, active }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '4px',
      color: active ? '#22c55e' : '#555',
      fontSize: '10px',
      letterSpacing: '1px',
      fontFamily: 'monospace',
      transition: 'color 0.15s',
    }}>
      <span style={{ fontSize: '20px', lineHeight: 1 }}>{icon}</span>
      {label}
    </div>
  )
}

const navStyle = {
  textDecoration: 'none',
  flex: 1,
  display: 'flex',
  justifyContent: 'center',
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </AuthProvider>
  )
}