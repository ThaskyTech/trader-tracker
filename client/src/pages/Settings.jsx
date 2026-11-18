import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../context/CurrencyContext'
import { CURRENCIES } from '../utils/currency'

function SettingRow({ label, sublabel, children }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 0',
      borderBottom: '1px solid #1a1a1a',
    }}>
      <div>
        <div style={{ color: '#ccc', fontSize: '13px', marginBottom: sublabel ? '3px' : 0 }}>
          {label}
        </div>
        {sublabel && (
          <div style={{ color: '#555', fontSize: '11px', letterSpacing: '0.3px' }}>
            {sublabel}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

function Toggle({ value, onChange }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        width: '44px',
        height: '24px',
        borderRadius: '12px',
        backgroundColor: value ? '#16a34a' : '#2a2a2a',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background-color 0.2s',
        flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute',
        top: '3px',
        left: value ? '23px' : '3px',
        width: '18px',
        height: '18px',
        borderRadius: '50%',
        backgroundColor: value ? '#22c55e' : '#555',
        transition: 'left 0.2s',
      }} />
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
  const [notifications, setNotifications] = useState(true)
  const [livePrice, setLivePrice] = useState(false)
  const [compactView, setCompactView] = useState(false)
  const navigate = useNavigate()
  const { logout } = useAuth()
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

  return (
    <div style={{ paddingBottom: '2rem' }}>

      {/* Header */}
      <div style={{ padding: '1.25rem 1rem 0' }}>
        <div style={{ color: '#555', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '4px' }}>
          SYSTEM
        </div>
        <div style={{ color: '#fff', fontSize: '20px', fontWeight: '500' }}>
          Settings
        </div>
      </div>

      <div style={{ padding: '0 1rem' }}>

        {/* Account section */}
        <SectionLabel label="ACCOUNT" />
        <div style={{ backgroundColor: '#141414', borderRadius: '12px', padding: '0 1rem' }}>
          <SettingRow label="Username" sublabel="trader_01">
            <span style={{ color: '#555', fontSize: '12px' }}>EDIT →</span>
          </SettingRow>
          <SettingRow label="Broker" sublabel="IC Markets / FTMO">
            <span style={{ color: '#555', fontSize: '12px' }}>EDIT →</span>
          </SettingRow>
          <SettingRow
            label="Display Currency"
            sublabel={currencyError ?? 'Amounts are stored in USD and shown in this currency'}
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

        {/* Display section */}
        <SectionLabel label="DISPLAY" />
        <div style={{ backgroundColor: '#141414', borderRadius: '12px', padding: '0 1rem' }}>
          <SettingRow label="Compact card view" sublabel="Smaller trade cards in list">
            <Toggle value={compactView} onChange={setCompactView} />
          </SettingRow>
          <SettingRow label="Live price feed" sublabel="Pulls market data in real time">
            <Toggle value={livePrice} onChange={setLivePrice} />
          </SettingRow>
        </div>

        {/* Notifications section */}
        <SectionLabel label="NOTIFICATIONS" />
        <div style={{ backgroundColor: '#141414', borderRadius: '12px', padding: '0 1rem' }}>
          <SettingRow label="Push notifications" sublabel="Trade alerts and session summaries">
            <Toggle value={notifications} onChange={setNotifications} />
          </SettingRow>
        </div>

        {/* Data section */}
        <SectionLabel label="DATA" />
        <div style={{ backgroundColor: '#141414', borderRadius: '12px', padding: '0 1rem' }}>
          <SettingRow label="Export all trades" sublabel="Download full history as CSV">
            <span style={{ color: '#555', fontSize: '12px' }}>EXPORT →</span>
          </SettingRow>
          <SettingRow label="Sync broker account" sublabel="Connect via MetaApi / Binance">
            <span style={{ color: '#22c55e', fontSize: '12px' }}>CONNECT →</span>
          </SettingRow>
        </div>

        {/* Danger zone */}
        <SectionLabel label="DANGER ZONE" />
        <div style={{ backgroundColor: '#141414', borderRadius: '12px', padding: '0 1rem' }}>
          <SettingRow label="Clear all data" sublabel="Permanently wipes all trades">
            <span style={{ color: '#ef4444', fontSize: '12px' }}>CLEAR →</span>
          </SettingRow>
          <SettingRow label="Sign out">
            <span onClick={async () => {
              await logout()
              navigate('/login')
              }}
              style={{ color: '#ef4444', fontSize: '12px' }}>SIGN OUT →</span>
          </SettingRow>
        </div>

      </div>
    </div>
  )
}