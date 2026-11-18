import { useEffect } from 'react'
import { CATEGORIES, STYLES, STYLE_KEYS } from '../../utils/accounts'

export function Section({ title, action, children, style }) {
  return (
    <section style={{ margin: '0.75rem 1rem 0', backgroundColor: '#141414', borderRadius: '12px', padding: '1rem', ...style }}>
      {(title || action) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '8px' }}>
          <h2 style={{ margin: 0, color: '#555', fontSize: '10px', letterSpacing: '1.5px', fontWeight: 400 }}>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

// Bottom sheet for short flows (record a deposit, archive, delete). Escape or a tap
// on the backdrop closes it, unless `busy`.
export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        backgroundColor: '#000000aa',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '430px', maxHeight: '88dvh', overflowY: 'auto',
          backgroundColor: '#111', borderTop: '1px solid #2a2a2a',
          borderRadius: '16px 16px 0 0',
          padding: '1rem 1rem calc(1.25rem + env(safe-area-inset-bottom))',
          boxSizing: 'border-box',
          animation: 'tt-sheet-up 0.25s ease both',
          fontFamily: 'monospace',
        }}
      >
        <style>{'@keyframes tt-sheet-up { from { transform: translateY(24px); opacity: 0 } to { transform: none; opacity: 1 } }'}</style>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <span style={{ color: '#fff', fontSize: '15px', fontWeight: 500 }}>{title}</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: '#666', fontSize: '18px', cursor: 'pointer' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, htmlFor, hint, error, children }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label htmlFor={htmlFor} style={{ display: 'block', color: '#555', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '8px' }}>
        {label}
      </label>
      {children}
      {hint && !error && <div style={{ color: '#555', fontSize: '11px', marginTop: '6px', lineHeight: 1.4 }}>{hint}</div>}
      {error && <div role="alert" style={{ color: '#ef4444', fontSize: '11px', marginTop: '6px' }}>{error}</div>}
    </div>
  )
}

export function PrimaryButton({ children, disabled, danger, style, ...props }) {
  const base = danger ? '#dc2626' : '#16a34a'
  return (
    <button
      type="button"
      disabled={disabled}
      {...props}
      style={{
        width: '100%',
        backgroundColor: disabled ? '#1f1f1f' : base,
        border: 'none', borderRadius: '10px',
        color: disabled ? '#555' : '#fff',
        fontSize: '13px', fontWeight: 600, letterSpacing: '1px',
        padding: '15px', cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'monospace',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

export function OutlineButton({ children, color = '#9ca3af', style, ...props }) {
  return (
    <button
      type="button"
      {...props}
      style={{
        background: 'none', border: `1px solid ${color}55`, borderRadius: '8px',
        color, fontSize: '11px', letterSpacing: '1px', padding: '9px 14px',
        cursor: 'pointer', fontFamily: 'monospace',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

// The five styles as one radio group. Shared by the add form and the account's Details.
export function StylePicker({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Trading style" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
      {STYLE_KEYS.map(key => {
        const active = value === key
        return (
          <button
            key={key} type="button" role="radio" aria-checked={active} onClick={() => onChange(key)}
            style={{
              padding: '12px 4px', borderRadius: '10px', cursor: 'pointer', fontFamily: 'monospace',
              fontSize: '11px', letterSpacing: '0.5px',
              backgroundColor: active ? '#16a34a22' : '#141414',
              border: `1px solid ${active ? '#16a34a88' : '#2a2a2a'}`,
              color: active ? '#e5e7eb' : '#666',
            }}
          >
            {STYLES[key].label.toUpperCase()}
          </button>
        )
      })}
    </div>
  )
}

// "These trades are one account's" (History and Daily Log, D-46). The dot and title match
// the wallet card; ✕ goes back to all accounts. It sits above the totals because the
// totals are filtered too.
export function AccountFilterChip({ account, title, onClear }) {
  return (
    <div style={{ padding: '0.75rem 1rem 0' }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '8px', maxWidth: '100%', boxSizing: 'border-box',
        padding: '6px 6px 6px 12px', borderRadius: '20px', fontSize: '12px', color: '#e5e7eb',
        backgroundColor: '#141414', border: `1px solid ${CATEGORIES[account.category].color}66`,
      }}>
        <span aria-hidden style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: CATEGORIES[account.category].color, flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        <button type="button" onClick={onClear} aria-label={`Show all accounts, not just ${title}`} style={{
          background: '#1f1f1f', border: 'none', borderRadius: '50%', width: '22px', height: '22px', flexShrink: 0,
          color: '#9ca3af', fontSize: '11px', cursor: 'pointer', lineHeight: 1, padding: 0,
        }}>✕</button>
      </span>
    </div>
  )
}
