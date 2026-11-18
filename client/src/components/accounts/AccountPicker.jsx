import { useState } from 'react'
import { Sheet } from './ui'
import { CATEGORIES, PROVIDERS } from '../../utils/accounts'

// The trade form's account field (D-37). A field that opens a sheet, rather than a list
// of every account inline: it usually already holds the right account (the last one used
// on this device), so the common case costs no taps and the form stays short.
//   Field: category dot + account title. The dot links it to the wallet's colours; the
//          title alone identifies the account (D-47).
//   Sheet rows: dot, title, and the platform with currency, which is what tells two
//          similar accounts apart when picking (e.g. a ZAR and a USD MT5 account).
// options: [{ account, title }] for active accounts only (archived ones take no new trades).
export default function AccountPicker({ id, options, value, onChange, error, locked = false }) {
  const [open, setOpen] = useState(false)
  const selected = options.find(o => o.account.id === value) ?? null

  return (
    <>
      <button
        id={id}
        type="button"
        onClick={() => !locked && setOpen(true)}
        disabled={locked}
        aria-haspopup="dialog"
        style={{
          width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: '10px',
          backgroundColor: '#141414', border: `1px solid ${error ? '#ef4444' : '#2a2a2a'}`, borderRadius: '8px',
          padding: '11px 12px', fontFamily: 'monospace', fontSize: '14px', textAlign: 'left',
          color: selected ? '#e5e7eb' : '#555', cursor: locked ? 'default' : 'pointer',
          opacity: locked ? 0.7 : 1,
        }}
      >
        {selected && <Dot color={CATEGORIES[selected.account.category].color} />}
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.title : 'Choose an account'}
        </span>
        {/* The chevron is what says "tap to change"; a locked field has nothing to change. */}
        {!locked && <span aria-hidden style={{ color: '#555' }}>▾</span>}
      </button>

      {open && (
        <Sheet title="Which account?" onClose={() => setOpen(false)}>
          <div role="radiogroup" aria-label="Account">
            {options.map(({ account, title }) => {
              const active = account.id === value
              const platform = PROVIDERS[account.provider]?.platform
              return (
                <button
                  key={account.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => { onChange(account); setOpen(false) }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left',
                    padding: '12px', marginBottom: '6px', borderRadius: '10px', cursor: 'pointer', fontFamily: 'monospace',
                    backgroundColor: active ? '#1a1a1a' : 'transparent',
                    border: `1px solid ${active ? '#16a34a66' : '#1f1f1f'}`,
                  }}
                >
                  <Dot color={CATEGORIES[account.category].color} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', color: '#e5e7eb', fontSize: '14px' }}>{title}</span>
                    <span style={{ display: 'block', color: '#666', fontSize: '11px', marginTop: '3px' }}>
                      {[platform, account.currency].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {active && <span aria-hidden style={{ color: '#22c55e' }}>✓</span>}
                </button>
              )
            })}
          </div>
        </Sheet>
      )}
    </>
  )
}

function Dot({ color }) {
  return <span aria-hidden style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
}
