import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import WalletStack from '../components/accounts/WalletStack'
import { PreviewBanner, Section, OutlineButton } from '../components/accounts/ui'
import { CATEGORIES, CATEGORY_KEYS, accountTitle } from '../utils/accounts'
import { useCurrency } from '../context/CurrencyContext'
import {
  useAccountsPreview, previewActions, activeAccounts, archivedAccounts,
  accountFigures, accountTrades,
} from '../preview/accountsPreview'

// The Accounts tab (D-16, D-46). Runs on sample data until roadmap step 6c.
export default function Accounts() {
  const navigate = useNavigate()
  const { formatUsd } = useCurrency()
  const store = useAccountsPreview()

  // Category filter in the URL, like History's, so coming back from an account keeps it.
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('category')
  const category = requested && Object.hasOwn(CATEGORIES, requested) ? requested : null
  const setCategory = key => setSearchParams(key ? { category: key } : {}, { replace: true })

  const active = activeAccounts(store).map(account => ({
    account,
    title: accountTitle(account, store.accounts),
    figures: accountFigures(store, account),
  }))
  const netWorth = active.reduce((sum, i) => sum + i.figures.equity, 0)
  const items = active
    .map(i => ({ ...i, share: netWorth > 0 ? (i.figures.equity / netWorth) * 100 : 0 }))
    .filter(i => !category || i.account.category === category)

  // Equity per category, for the allocation bar and the filter pills.
  const byCategory = CATEGORY_KEYS.map(key => {
    const total = active.filter(i => i.account.category === key).reduce((sum, i) => sum + i.figures.equity, 0)
    return { key, total, share: netWorth > 0 ? (total / netWorth) * 100 : 0 }
  })

  return (
    <div style={{ paddingBottom: '1.5rem' }}>
      {/* Adding an account lives only in the tile under the stack, so there's one way in. */}
      {/* No "ACCOUNTS" eyebrow: it repeated the bottom-nav tab the user just tapped. */}
      <div style={{ padding: '1.25rem 1rem 0' }}>
        <div style={{ color: '#fff', fontSize: '20px', fontWeight: 500 }}>Your Wallet</div>
      </div>

      <PreviewBanner />

      {/* Net worth and how it splits across categories */}
      <Section>
        <div style={{ color: '#555', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '6px' }}>NET WORTH</div>
        <div style={{ color: '#fff', fontSize: '28px', fontWeight: 600, letterSpacing: '-1px' }}>{formatUsd(netWorth)}</div>
        <div style={{ color: '#555', fontSize: '11px', marginTop: '4px' }}>
          Equity across {active.length} {active.length === 1 ? 'account' : 'accounts'}, including open positions
        </div>

        {netWorth > 0 && (
          <div aria-hidden style={{ display: 'flex', gap: '2px', height: '8px', marginTop: '14px', borderRadius: '4px', overflow: 'hidden' }}>
            {byCategory.filter(c => c.total > 0).map(c => (
              <div key={c.key} style={{ flex: c.total, backgroundColor: CATEGORIES[c.key].color }} />
            ))}
          </div>
        )}

        {/* Legend doubling as the category filter */}
        <div role="radiogroup" aria-label="Filter by category" style={{ display: 'flex', gap: '6px', marginTop: '12px', flexWrap: 'wrap' }}>
          <FilterPill active={!category} onClick={() => setCategory(null)} label="ALL" />
          {byCategory.map(c => (
            <FilterPill
              key={c.key}
              active={category === c.key}
              onClick={() => setCategory(category === c.key ? null : c.key)}
              color={CATEGORIES[c.key].color}
              label={CATEGORIES[c.key].label.toUpperCase()}
              detail={`${c.share.toFixed(0)}%`}
            />
          ))}
        </div>
      </Section>

      <div style={{ padding: '1rem 1rem 0' }}>
        {items.length > 0 ? (
          <WalletStack
            items={items}
            onOpen={id => navigate(`/accounts/${id}`)}
            onAddTrade={id => navigate(`/trades/new?account=${id}`)}
          />
        ) : (
          <div style={{ color: '#444', fontSize: '12px', textAlign: 'center', padding: '2rem 0', letterSpacing: '0.5px' }}>
            {category ? `NO ${CATEGORIES[category].label.toUpperCase()} ACCOUNTS` : 'NO ACCOUNTS YET'}
          </div>
        )}

        <button
          type="button"
          onClick={() => navigate('/accounts/new')}
          style={{
            width: '100%', marginTop: '12px', padding: '18px', borderRadius: '16px',
            border: '1px dashed #2a2a2a', background: 'none', color: '#666',
            fontSize: '12px', letterSpacing: '1px', cursor: 'pointer', fontFamily: 'monospace',
          }}
        >
          + ADD ACCOUNT
        </button>
      </div>

      <ArchivedList store={store} />
    </div>
  )
}

function FilterPill({ active, onClick, label, detail, color }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        background: active ? '#262626' : 'none',
        border: `1px solid ${active ? '#3f3f3f' : '#222'}`,
        borderRadius: '20px', padding: '5px 11px',
        color: active ? '#e5e7eb' : '#777', fontSize: '10px', letterSpacing: '0.5px',
        cursor: 'pointer', fontFamily: 'monospace',
      }}
    >
      {color && <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: color }} />}
      {label}
      {detail && <span style={{ color: '#9ca3af' }}>{detail}</span>}
    </button>
  )
}

// Archived accounts (D-18): out of net worth, trades kept, can be restored.
function ArchivedList({ store }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const archived = archivedAccounts(store)
  if (archived.length === 0) return null

  return (
    <Section
      title={`ARCHIVED (${archived.length})`}
      action={<OutlineButton onClick={() => setOpen(o => !o)} aria-expanded={open}>{open ? 'HIDE' : 'SHOW'}</OutlineButton>}
      style={{ marginTop: '1.25rem' }}
    >
      {!open && (
        <div style={{ color: '#555', fontSize: '11px', lineHeight: 1.5 }}>
          Not counted in net worth. Their trades still count in History, P&L and win rate.
        </div>
      )}
      {open && archived.map(account => (
        <div key={account.id} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px',
          padding: '10px 0', borderTop: '1px solid #1f1f1f',
        }}>
          {/* Opens the account, where it can also be deleted permanently */}
          <button type="button" onClick={() => navigate(`/accounts/${account.id}`)}
            style={{ minWidth: 0, flex: 1, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'monospace' }}>
            <span style={{ display: 'block', color: '#ccc', fontSize: '13px' }}>{accountTitle(account, store.accounts)} ›</span>
            <span style={{ display: 'block', color: '#555', fontSize: '11px', marginTop: '3px' }}>
              {accountTrades(store, account.id).length} trades kept
            </span>
          </button>
          <OutlineButton color="#22c55e" onClick={() => previewActions.restoreAccount(account.id)}>RESTORE</OutlineButton>
        </div>
      ))}
    </Section>
  )
}
