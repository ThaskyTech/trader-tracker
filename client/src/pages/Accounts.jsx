import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import WalletStack from '../components/accounts/WalletStack'
import { Section, OutlineButton } from '../components/accounts/ui'
import { CATEGORIES, CATEGORY_KEYS } from '../utils/accounts'
import { useCurrency } from '../context/CurrencyContext'
import { useAccounts, netWorthOf } from '../context/AccountsContext'
import { accountApi } from '../api/client'

// No accounts yet (or all archived): one message and one action, instead of a $0 net
// worth, an empty bar and 0% pills (D-46).
function EmptyWallet({ hasArchived, onAdd }) {
  return (
    <div style={{
      margin: '1rem', padding: '2rem 1.25rem', borderRadius: '16px', textAlign: 'center',
      border: '1px dashed #2a2a2a',
    }}>
      <div style={{ color: '#e5e7eb', fontSize: '15px', fontWeight: 500, marginBottom: '8px' }}>
        {hasArchived ? 'No active accounts' : 'Add your first account'}
      </div>
      <div style={{ color: '#666', fontSize: '12px', lineHeight: 1.6, marginBottom: '18px' }}>
        {hasArchived
          ? 'Restore one from the archived list below, or add a new one.'
          : 'Connect Binance, cTrader or IBKR, or track any broker by hand. Your net worth is the total of your accounts.'}
      </div>
      <OutlineButton color="#22c55e" onClick={onAdd} style={{ padding: '10px 20px' }}>+ ADD ACCOUNT</OutlineButton>
    </div>
  )
}

// The Accounts tab (D-16, D-46).
export default function Accounts() {
  const navigate = useNavigate()
  const { formatUsd } = useCurrency()
  const { accounts, active: activeList, archived, error, titleOf, refresh } = useAccounts()

  // Category filter in the URL, like History's, so coming back from an account keeps it.
  const [searchParams, setSearchParams] = useSearchParams()
  const setCategory = key => setSearchParams(key ? { category: key } : {}, { replace: true })

  const active = activeList.map(account => ({ account, title: titleOf(account), figures: account.figures }))
  const netWorth = netWorthOf(activeList)

  // Equity per category, for the allocation bar and the filter pills. Only categories
  // the user actually has: a "STOCKS 0%" pill would filter to nothing (D-46).
  const byCategory = CATEGORY_KEYS
    .filter(key => active.some(i => i.account.category === key))
    .map(key => {
      const total = active.filter(i => i.account.category === key).reduce((sum, i) => sum + i.figures.equity, 0)
      return { key, total, share: netWorth > 0 ? (total / netWorth) * 100 : 0 }
    })
  // With one category, the bar is a single solid colour and the filter has nothing to
  // narrow, so both are hidden.
  const showSplit = byCategory.length > 1

  // A category from the URL that no longer has accounts (e.g. its last one was archived) is ignored.
  const requested = searchParams.get('category')
  const category = showSplit && byCategory.some(c => c.key === requested) ? requested : null

  const items = active
    .map(i => ({ ...i, share: netWorth > 0 ? (i.figures.equity / netWorth) * 100 : 0 }))
    .filter(i => !category || i.account.category === category)

  const heading = (
    <div style={{ padding: '1.25rem 1rem 0' }}>
      <div style={{ color: '#fff', fontSize: '20px', fontWeight: 500 }}>Your Wallet</div>
    </div>
  )

  if (accounts === null) {
    return (
      <div style={{ paddingBottom: '1.5rem' }}>
        {heading}
        {error
          ? <LoadError message={error} onRetry={refresh} />
          : <div style={{ margin: '1rem', color: '#555', fontSize: '12px', letterSpacing: '1px' }}>LOADING...</div>}
      </div>
    )
  }

  if (active.length === 0) {
    return (
      <div style={{ paddingBottom: '1.5rem' }}>
        {heading}
        <EmptyWallet hasArchived={archived.length > 0} onAdd={() => navigate('/accounts/new')} />
        <ArchivedList archived={archived} titleOf={titleOf} onRestored={refresh} />
      </div>
    )
  }

  return (
    <div style={{ paddingBottom: '1.5rem' }}>
      {/* Adding an account lives only in the tile under the stack, so there's one way in. */}
      {/* No "ACCOUNTS" eyebrow: it repeated the bottom-nav tab the user just tapped. */}
      {heading}

      {/* Net worth and how it splits across categories */}
      <Section>
        <div style={{ color: '#555', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '6px' }}>NET WORTH</div>
        <div style={{ color: '#fff', fontSize: '28px', fontWeight: 600, letterSpacing: '-1px' }}>{formatUsd(netWorth)}</div>
        <div style={{ color: '#555', fontSize: '11px', marginTop: '4px' }}>
          {/* Says floating P/L is in the total, only when some account has positions open. */}
          Equity across {active.length} {active.length === 1 ? 'account' : 'accounts'}
          {active.some(a => a.figures.openPositions > 0) && ', including open positions'}
        </div>

        {showSplit && netWorth > 0 && (
          <div aria-hidden style={{ display: 'flex', gap: '2px', height: '8px', marginTop: '14px', borderRadius: '4px', overflow: 'hidden' }}>
            {byCategory.filter(c => c.total > 0).map(c => (
              <div key={c.key} style={{ flex: c.total, backgroundColor: CATEGORIES[c.key].color }} />
            ))}
          </div>
        )}

        {/* Legend doubling as the category filter */}
        {showSplit && <div role="radiogroup" aria-label="Filter by category" style={{ display: 'flex', gap: '6px', marginTop: '12px', flexWrap: 'wrap' }}>
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
        </div>}
      </Section>

      <div style={{ padding: '1rem 1rem 0' }}>
        <WalletStack
          items={items}
          onOpen={id => navigate(`/accounts/${id}`)}
          onAddTrade={id => navigate(`/trades/new?account=${id}`)}
        />

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

      <ArchivedList archived={archived} titleOf={titleOf} onRestored={refresh} />
    </div>
  )
}

function LoadError({ message, onRetry }) {
  return (
    <div role="alert" style={{
      margin: '1rem', padding: '10px 12px', borderRadius: '8px', fontSize: '12px', lineHeight: 1.5,
      color: '#ef4444', backgroundColor: '#ef444411', border: '1px solid #ef444433',
    }}>
      Couldn't load your accounts: {message}
      <div><OutlineButton color="#ef4444" onClick={onRetry} style={{ marginTop: '8px' }}>TRY AGAIN</OutlineButton></div>
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
function ArchivedList({ archived, titleOf, onRestored }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [restoring, setRestoring] = useState(null)
  const [restoreError, setRestoreError] = useState(null)
  if (archived.length === 0) return null

  const restore = async id => {
    setRestoring(id)
    setRestoreError(null)
    try {
      await accountApi.restore(id)
      await onRestored()
    } catch (err) {
      setRestoreError(err.message)
    } finally {
      setRestoring(null)
    }
  }

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
      {restoreError && <div role="alert" style={{ color: '#ef4444', fontSize: '12px', marginBottom: '8px' }}>{restoreError}</div>}
      {open && archived.map(account => (
        <div key={account.id} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px',
          padding: '10px 0', borderTop: '1px solid #1f1f1f',
        }}>
          {/* Opens the account, where it can also be deleted permanently */}
          <button type="button" onClick={() => navigate(`/accounts/${account.id}`)}
            style={{ minWidth: 0, flex: 1, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'monospace' }}>
            <span style={{ display: 'block', color: '#ccc', fontSize: '13px' }}>{titleOf(account)} ›</span>
            <span style={{ display: 'block', color: '#555', fontSize: '11px', marginTop: '3px' }}>
              {account.figures.tradeCount} {account.figures.tradeCount === 1 ? 'trade' : 'trades'} kept
            </span>
          </button>
          <OutlineButton color="#22c55e" onClick={() => restore(account.id)} disabled={restoring !== null}>
            {restoring === account.id ? 'RESTORING…' : 'RESTORE'}
          </OutlineButton>
        </div>
      ))}
    </Section>
  )
}
