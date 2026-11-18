import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../context/CurrencyContext'
import { CURRENCIES } from '../utils/currency'

// Only settings that work are shown. The earlier placeholders (username and broker
// "EDIT", display and notification toggles, CSV export, broker sync, "clear all data")
// did nothing; they come back one by one as they're built. Broker connections live in
// the Accounts tab (D-16).

function SettingRow({ label, sublabel, children }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      padding: '14px 0',
      borderBottom: '1px solid #1a1a1a',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: '#ccc', fontSize: '13px', marginBottom: sublabel ? '3px' : 0 }}>
          {label}
        </div>
        {sublabel && (
          <div style={{ color: '#555', fontSize: '11px', letterSpacing: '0.3px', overflowWrap: 'anywhere' }}>
            {sublabel}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

function SectionLabel({ label }) {
  return (
    <div style={{
      color: '#22c55e',
      fontSize: '10px',
      letterSpacing: '1.5px',
      marginBottom: '4px',
      marginTop: '1.5rem',
    }}>
      {label}
    </div>
  )
}

export default function Settings() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { displayCurrency, setDisplayCurrency } = useCurrency()
  const [currencySaving, setCurrencySaving] = useState(false)
  const [currencyError, setCurrencyError] = useState(null)

  const changeCurrency = async (code) => {
    setCurrencySaving(true)
    setCurrencyError(null)
    try {
      await setDisplayCurrency(code)
    } catch (err) {
      setCurrencyError(err.message)
    } finally {
      setCurrencySaving(false)
    }
  }

  const signOut = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div style={{ paddingBottom: '2rem' }}>
      <div style={{ padding: '1.25rem 1rem 0' }}>
        <div style={{ color: '#fff', fontSize: '20px', fontWeight: '500' }}>
          Settings
        </div>
      </div>

      <div style={{ padding: '0 1rem' }}>
        {/* "Profile", not "Account": in this app an account is a broker account (Accounts tab). */}
        <SectionLabel label="PROFILE" />
        <div style={{ backgroundColor: '#141414', borderRadius: '12px', padding: '0 1rem' }}>
          {/* Who is signed in matters once friends share a device or the app (D-04). */}
          <SettingRow label={user?.username ?? 'Signed in'} sublabel={user?.email}>
            <button
              type="button"
              onClick={signOut}
              style={{
                background: 'none', border: 'none', color: '#ef4444', fontSize: '12px',
                cursor: 'pointer', fontFamily: 'monospace', padding: 0, flexShrink: 0,
              }}
            >
              SIGN OUT →
            </button>
          </SettingRow>
          <SettingRow
            label="Display currency"
            sublabel={currencyError ?? 'Every amount in the app is shown in this currency'}
          >
            <select
              value={displayCurrency}
              onChange={e => changeCurrency(e.target.value)}
              disabled={currencySaving}
              aria-label="Display currency"
              style={{
                background: '#1f1f1f',
                border: '1px solid #2a2a2a',
                borderRadius: '6px',
                color: '#ccc',
                fontSize: '12px',
                padding: '4px 8px',
                fontFamily: 'monospace',
                cursor: 'pointer',
              }}
            >
              {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} {c.symbol}</option>)}
            </select>
          </SettingRow>
        </div>
      </div>
    </div>
  )
}
