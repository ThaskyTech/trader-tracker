import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import EquityChart from '../components/accounts/EquityChart'
import { PreviewBanner, Section, Sheet, Field, PrimaryButton, OutlineButton, StylePicker } from '../components/accounts/ui'
import { inputStyle } from '../components/accounts/styles'
import PnlCard from '../components/dashboard/PnLCard'
import WinRateCard from '../components/dashboard/WinRateCard'
import CalendarGrid from '../components/calendar/CalendarGrid'
import TradeCard from '../components/trades/TradeCard'
import { CATEGORIES, CATEGORY_KEYS, PROVIDERS, accountTitle, freshnessLine, isAutoSync, syncState, timeAgo, titleClashError } from '../utils/accounts'
import { CURRENCIES, formatMoney, fromUsd } from '../utils/currency'
import { parseAmount, toLocalDateString } from '../utils/tradeForm'
import { useCurrency } from '../context/CurrencyContext'
import {
  useAccountsPreview, previewActions, accountFigures, netWorthUsd, equitySeries,
  accountMonth, accountTrades, accountCash,
} from '../preview/accountsPreview'

const TABS = [
  { key: 'overview', label: 'OVERVIEW' },
  { key: 'cash', label: 'CASH' },
  { key: 'connection', label: 'CONNECTION' },
]

function shiftMonth({ year, month }, delta) {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

// One account's page (D-45): the Home screen limited to this account, plus its cash
// movements and connection settings.
export default function AccountDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const store = useAccountsPreview()
  const [tab, setTab] = useState('overview')
  const account = store.accounts.find(a => a.id === id)

  if (!account) {
    return (
      <div style={{ padding: '1rem' }}>
        <BackBar title="Account" onBack={() => navigate('/accounts')} />
        <div style={{ color: '#777', fontSize: '13px', marginTop: '1rem' }}>
          This account doesn't exist (it may have been deleted, or the preview reset on reload).
        </div>
      </div>
    )
  }

  const figures = accountFigures(store, account)
  const title = accountTitle(account, store.accounts)
  const archived = Boolean(account.archivedAt)
  const netWorth = netWorthUsd(store)
  const share = !archived && netWorth > 0 ? (figures.equity / netWorth) * 100 : undefined

  return (
    <div style={{ paddingBottom: '5.5rem' }}>
      <AccountHeader account={account} title={title} onBack={() => navigate(-1)} />
      <PreviewBanner />

      <StatusBanner account={account} />

      <div role="tablist" style={{ display: 'flex', margin: '0.75rem 1rem 0', borderBottom: '1px solid #1f1f1f' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1, background: 'none', border: 'none', padding: '10px 0', cursor: 'pointer', fontFamily: 'monospace',
              color: tab === t.key ? '#e5e7eb' : '#555', fontSize: '11px', letterSpacing: '1px',
              borderBottom: `2px solid ${tab === t.key ? '#22c55e' : 'transparent'}`, marginBottom: '-1px',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab store={store} account={account} figures={figures} share={share} />}
      {tab === 'cash' && <CashTab store={store} account={account} figures={figures} />}
      {tab === 'connection' && <ConnectionTab store={store} account={account} title={title} figures={figures} />}

      {/* Log a trade on this account: the form opens with the account locked */}
      {!archived && (
        <Link
          to={`/trades/new?account=${account.id}`}
          aria-label={`Log a trade on ${title}`}
          style={{
            position: 'fixed',
            bottom: 'calc(64px + 16px + env(safe-area-inset-bottom))',
            right: 'max(16px, calc(50vw - 215px + 16px))',
            width: '56px', height: '56px', borderRadius: '50%',
            backgroundColor: '#16a34a', color: '#fff', fontSize: '28px', lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            textDecoration: 'none', boxShadow: '0 4px 16px #00000088',
          }}
        >
          +
        </Link>
      )}
    </div>
  )
}

function BackBar({ title, onBack }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <button type="button" onClick={onBack} aria-label="Back" style={{ background: 'none', border: 'none', color: '#22c55e', fontSize: '20px', cursor: 'pointer', padding: 0, lineHeight: 1 }}>←</button>
      <span style={{ color: '#fff', fontSize: '17px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
    </div>
  )
}

// Replaces the wallet card at the top (D-45 review): it says which account this is and
// whether its numbers are fresh, and carries no figures, so each figure appears once below.
//   Title: the account's only name on the page (the back bar no longer repeats it).
//   Freshness line: visible on every tab, so Connection doesn't need Status/Last synced rows.
//   Category tint: the visual link back to the card that was tapped; the chip names it,
//   because colour alone isn't reliable for everyone (D-47).
function AccountHeader({ account, title, onBack }) {
  const category = CATEGORIES[account.category]
  const platform = PROVIDERS[account.provider]?.platform
  const freshness = account.archivedAt
    // An archived account doesn't sync, so its freshness would be meaningless.
    ? { text: platform ? `${platform} · archived` : 'Archived', color: '#9ca3af' }
    : freshnessLine(account)

  return (
    <div style={{
      padding: '1rem 1rem 1.1rem',
      backgroundImage: `linear-gradient(160deg, ${category.color}33 0%, ${category.color}0d 55%, transparent 100%)`,
      borderBottom: `1px solid ${category.color}33`,
    }}>
      <button type="button" onClick={onBack} aria-label="Back" style={{ background: 'none', border: 'none', color: '#22c55e', fontSize: '20px', cursor: 'pointer', padding: 0, lineHeight: 1 }}>←</button>
      <h1 style={{ margin: '12px 0 0', color: '#fff', fontSize: '24px', fontWeight: 600, lineHeight: 1.2, overflowWrap: 'anywhere' }}>
        {title}
      </h1>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
        <span style={{ color: freshness.color, fontSize: '12px', minWidth: 0 }}>{freshness.text}</span>
        <span style={{
          fontSize: '9px', letterSpacing: '1px', padding: '3px 7px', borderRadius: '4px', color: '#e5e7eb',
          backgroundColor: `${category.color}2a`, border: `1px solid ${category.color}66`, flexShrink: 0,
        }}>
          {category.label.toUpperCase()}
        </span>
      </div>
    </div>
  )
}

// Archived, or a broken connection: say so at the top, never show silently wrong numbers (D-14).
// The header already says "archived", "sync failed" or when it last synced, so these add
// only what it can't: the consequence and the fix.
function StatusBanner({ account }) {
  const state = syncState(account)
  if (account.archivedAt) {
    return (
      <Banner color="#9ca3af">
        <div>Not counted in net worth. Its trades still count in History and your stats.</div>
        <OutlineButton color="#22c55e" onClick={() => previewActions.restoreAccount(account.id)} style={{ marginTop: '8px' }}>RESTORE</OutlineButton>
      </Banner>
    )
  }
  if (state === 'ERROR' || state === 'RECONNECT') {
    return (
      <Banner color="#ef4444">
        <div>{account.lastError}</div>
        <div style={{ color: '#9ca3af', marginTop: '4px' }}>Figures below are from {timeAgo(account.lastSyncedAt)}.</div>
        <OutlineButton color="#ef4444" onClick={() => previewActions.reconnect(account.id)} style={{ marginTop: '8px' }}>RECONNECT</OutlineButton>
      </Banner>
    )
  }
  if (state === 'STALE') {
    return <Banner color="#f59e0b">That's later than expected ({PROVIDERS[account.provider].freshness.toLowerCase()}), so figures may be out of date.</Banner>
  }
  return null
}

function Banner({ color, children }) {
  return (
    <div role="status" style={{
      margin: '0.75rem 1rem 0', padding: '10px 12px', borderRadius: '8px', fontSize: '12px', lineHeight: 1.5,
      color: '#e5e7eb', backgroundColor: `${color}14`, border: `1px solid ${color}44`,
    }}>
      {children}
    </div>
  )
}

// --- Overview ---

function OverviewTab({ store, account, figures, share }) {
  const navigate = useNavigate()
  const { formatUsd, displayCurrency, rates } = useCurrency()
  const [view, setView] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  })
  const month = accountMonth(store, account.id, view)
  const previous = accountMonth(store, account.id, shiftMonth(view, -1))
  const trades = accountTrades(store, account.id)
  const color = CATEGORIES[account.category].color
  // Same slot rules as the card (D-47): a figure appears only when it says something new.
  const live = Boolean(account.positions)
  const native = account.currency !== displayCurrency ? fromUsd(figures.equity, account.currency, rates) : null

  return (
    <>
      {/* Each figure appears once on the page; equity is the headline, as net worth is on Home. */}
      <Section>
        <div style={{ color: '#555', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '6px' }}>EQUITY</div>
        <div style={{ color: '#fff', fontSize: '28px', fontWeight: 600, letterSpacing: '-1px' }}>{formatUsd(figures.equity)}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 28px', marginTop: '14px' }}>
          {/* Without open positions, balance equals equity, so it's shown only when they differ. */}
          {live && <Figure label="BALANCE" value={formatUsd(figures.balance)} />}
          {live && (
            <Figure
              label="FLOATING P/L"
              value={formatUsd(figures.floating, { signed: true })}
              color={figures.floating > 0 ? '#22c55e' : figures.floating < 0 ? '#ef4444' : undefined}
            />
          )}
          {share !== undefined && <Figure label="OF NET WORTH" value={`${share.toFixed(1)}%`} />}
          {/* To check against the broker's own app; identical (so hidden) in the display currency. */}
          {native !== null && <Figure label="AT BROKER" value={formatMoney(native, account.currency)} />}
        </div>
      </Section>

      <Section title="EQUITY">
        <EquityChart points={equitySeries(store, account)} color={color} />
      </Section>

      <Positions account={account} />

      <div style={{ marginTop: '0.75rem' }}>
        <PnlCard view={view} summary={month.summary} previousSummary={previous.summary} />
        <WinRateCard summary={month.summary} />
        <CalendarGrid
          view={view}
          days={month.days}
          onPrev={() => setView(v => shiftMonth(v, -1))}
          onNext={() => setView(v => shiftMonth(v, 1))}
          onDayClick={null}
        />
      </div>

      <Section
        title="RECENT TRADES"
        action={trades.length > 0 && (
          <OutlineButton color="#22c55e" onClick={() => navigate(`/history?account=${account.id}`)}>VIEW ALL {trades.length}</OutlineButton>
        )}
      >
        {trades.length === 0
          ? <div style={{ color: '#555', fontSize: '12px' }}>No trades on this account yet.</div>
          : trades.slice(0, 3).map(trade => <TradeCard key={trade.id} trade={trade} day={null} withinAccount />)}
      </Section>
    </>
  )
}

function Figure({ label, value, color = '#e5e7eb' }) {
  return (
    <div>
      <div style={{ color: '#555', fontSize: '9px', letterSpacing: '1.5px', marginBottom: '5px' }}>{label}</div>
      <div style={{ color, fontSize: '16px' }}>{value}</div>
    </div>
  )
}

function Positions({ account }) {
  const { formatUsd } = useCurrency()

  if (!account.positions) {
    return (
      <Section title="OPEN POSITIONS">
        <div style={{ color: '#555', fontSize: '12px', lineHeight: 1.5 }}>
          {account.provider === 'MT5'
            ? 'Live positions and floating P/L arrive with the MT5 reporter on the VPS (D-13). Until then only closed trades count.'
            : "Manual accounts don't show live positions. Only closed trades count."}
        </div>
      </Section>
    )
  }

  const { kind, items } = account.positions
  return (
    <Section title={kind === 'HOLDINGS' ? 'HOLDINGS' : 'OPEN POSITIONS'}>
      {items.length === 0 && <div style={{ color: '#555', fontSize: '12px' }}>Nothing open right now.</div>}
      {items.map((p, i) => {
        const pnl = p.floatingUsd ?? p.unrealisedUsd ?? 0
        return (
          <div key={p.symbol + i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px',
            padding: '10px 0', borderTop: i ? '1px solid #1f1f1f' : 'none',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#e5e7eb', fontSize: '13px' }}>
                {p.symbol}
                {p.direction && <span style={{ color: p.direction === 'LONG' ? '#22c55e' : '#ef4444', fontSize: '11px', marginLeft: '8px' }}>{p.direction}</span>}
              </div>
              <div style={{ color: '#555', fontSize: '11px', marginTop: '3px' }}>
                {kind === 'HOLDINGS'
                  ? `${p.quantity} · ${formatUsd(p.valueUsd)}`
                  // Futures sizes are coin quantities (0.015 BTC); forex sizes are lots.
                  : `${p.lotSize} ${account.category === 'CRYPTO' ? p.symbol.replace(/USDT$/, '') : 'lots'} · ${p.entryPrice} → ${p.currentPrice}`}
              </div>
            </div>
            <div style={{ color: pnl >= 0 ? '#22c55e' : '#ef4444', fontSize: '13px', flexShrink: 0 }}>
              {formatUsd(pnl, { signed: true })}
            </div>
          </div>
        )
      })}
    </Section>
  )
}

// --- Cash (D-27) ---

const MOVEMENT = {
  DEPOSIT: { label: 'Deposit', color: '#22c55e' },
  WITHDRAWAL: { label: 'Withdrawal', color: '#ef4444' },
  ADJUSTMENT: { label: 'Balance correction', color: '#9ca3af' },
}

function CashTab({ store, account, figures }) {
  const { formatUsd } = useCurrency()
  const [recording, setRecording] = useState(null) // 'DEPOSIT' | 'WITHDRAWAL'
  const cash = accountCash(store, account.id)
  const auto = isAutoSync(account)
  const archived = Boolean(account.archivedAt)

  return (
    <>
      {/* How the balance is built up: makes every jump in net worth explainable */}
      <Section title="WHERE THE BALANCE COMES FROM">
        <Row label="Opening balance" value={formatUsd(figures.opening)} />
        <Row label="Closed trades P/L" value={formatUsd(figures.tradePnl, { signed: true })} />
        <Row label="Deposits" value={formatUsd(figures.deposits, { signed: true })} />
        <Row label="Withdrawals" value={formatUsd(figures.withdrawals, { signed: true })} />
        {figures.adjustments !== 0 && <Row label="Balance corrections" value={formatUsd(figures.adjustments, { signed: true })} />}
        <Row label="Balance" value={formatUsd(figures.balance)} strong />
      </Section>

      <Section
        title="DEPOSITS & WITHDRAWALS"
        action={!auto && !archived && (
          <div style={{ display: 'flex', gap: '6px' }}>
            <OutlineButton color="#22c55e" onClick={() => setRecording('DEPOSIT')}>+ DEPOSIT</OutlineButton>
            <OutlineButton color="#ef4444" onClick={() => setRecording('WITHDRAWAL')}>− WITHDRAW</OutlineButton>
          </div>
        )}
      >
        {auto && (
          <div style={{ color: '#555', fontSize: '11px', marginBottom: '10px' }}>
            Imported from {account.broker} automatically on each sync.
          </div>
        )}
        {cash.length === 0 && <div style={{ color: '#555', fontSize: '12px' }}>None recorded yet.</div>}
        {cash.map((c, i) => (
          <div key={c.id} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px',
            padding: '10px 0', borderTop: i ? '1px solid #1f1f1f' : 'none',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#e5e7eb', fontSize: '13px' }}>{MOVEMENT[c.type].label}</div>
              <div style={{ color: '#555', fontSize: '11px', marginTop: '3px' }}>
                {new Date(c.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                {' · '}{c.origin === 'SYNCED' ? 'imported' : 'manual'}
                {c.note && ` · ${c.note}`}
              </div>
            </div>
            <div style={{ color: MOVEMENT[c.type].color, fontSize: '13px', flexShrink: 0 }}>{formatUsd(c.amountUsd, { signed: true })}</div>
          </div>
        ))}
      </Section>

      {recording && <CashSheet account={account} type={recording} onClose={() => setRecording(null)} />}
    </>
  )
}

function Row({ label, value, strong }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px',
      color: strong ? '#fff' : '#9ca3af', borderTop: strong ? '1px solid #2a2a2a' : 'none', marginTop: strong ? '4px' : 0,
      paddingTop: strong ? '10px' : '6px',
    }}>
      <span>{label}</span>
      <span style={{ color: strong ? '#fff' : '#e5e7eb' }}>{value}</span>
    </div>
  )
}

function CashSheet({ account, type, onClose }) {
  const { rates } = useCurrency()
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(account.currency)
  const [date, setDate] = useState(() => toLocalDateString(new Date()))
  const [note, setNote] = useState('')
  const [error, setError] = useState(null)
  const isDeposit = type === 'DEPOSIT'

  const save = e => {
    e.preventDefault()
    const value = parseAmount(amount)
    if (value === null || value <= 0) return setError('Enter an amount above zero.')
    if (date > toLocalDateString(new Date())) return setError("The date can't be in the future.")
    const rate = currency === 'USD' ? 1 : rates?.[currency]
    if (!rate) return setError("Exchange rates haven't loaded yet. Try again in a moment.")
    const usd = value / rate
    previewActions.addCash({
      accountId: account.id, type,
      amountUsd: isDeposit ? usd : -usd,
      date: new Date(`${date}T12:00:00`).toISOString(),
      note: note.trim() || null,
    })
    onClose()
  }

  return (
    <Sheet title={isDeposit ? 'Record a deposit' : 'Record a withdrawal'} onClose={onClose}>
      <form onSubmit={save} noValidate>
        <Field label="AMOUNT" htmlFor="cash-amount" error={error}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <select aria-label="Currency" value={currency} onChange={e => setCurrency(e.target.value)} style={{ ...inputStyle(false), width: '96px', flexShrink: 0 }}>
              {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} {c.symbol}</option>)}
            </select>
            <input id="cash-amount" autoFocus value={amount} onChange={e => { setAmount(e.target.value); setError(null) }}
              inputMode="decimal" placeholder="500.00" autoComplete="off" style={inputStyle(Boolean(error))} />
          </div>
        </Field>
        <Field label="DATE" htmlFor="cash-date">
          <input id="cash-date" type="date" value={date} max={toLocalDateString(new Date())} onChange={e => setDate(e.target.value)} style={inputStyle(false)} />
        </Field>
        <Field label="NOTE (OPTIONAL)" htmlFor="cash-note">
          <input id="cash-note" value={note} onChange={e => setNote(e.target.value)} maxLength={120}
            placeholder={isDeposit ? 'From FNB' : 'To FNB'} autoComplete="off" style={inputStyle(false)} />
        </Field>
        <PrimaryButton type="submit">{isDeposit ? 'SAVE DEPOSIT' : 'SAVE WITHDRAWAL'}</PrimaryButton>
      </form>
    </Sheet>
  )
}

// --- Connection panel, details, archive and delete ---

function ConnectionTab({ store, account, title, figures }) {
  const navigate = useNavigate()
  const { formatUsd } = useCurrency()
  const [sheet, setSheet] = useState(null) // 'correct' | 'archive' | 'delete'
  const provider = PROVIDERS[account.provider]
  const auto = isAutoSync(account)
  const state = syncState(account)
  const archived = Boolean(account.archivedAt)
  const trades = accountTrades(store, account.id)
  const cash = accountCash(store, account.id)

  return (
    <>
      {/* No Status or Last synced rows: the header shows both on every tab. The error message
          isn't repeated here either: the banner under the header shows it with RECONNECT. */}
      <Section title="CONNECTION">
        <Row label="Type" value={provider.label} />
        <Row label="Method" value={provider.method} />
        {/* Moved here from the card front (D-47): this is where it's used, to match the card to a login. */}
        <Row label="Account number" value={account.accountNumber ? `ends in ${account.accountNumber}` : 'not set'} />
        {auto && <Row label="Credentials" value={account.credentialHint ?? 'None (removed)'} />}

        {!archived && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
            {auto && <OutlineButton color="#22c55e" onClick={() => previewActions.syncNow(account.id)} disabled={state === 'ERROR' || state === 'RECONNECT'}>SYNC NOW</OutlineButton>}
            {auto && <OutlineButton onClick={() => previewActions.reconnect(account.id)}>{account.provider === 'CTRADER' ? 'RECONNECT' : 'REPLACE KEY'}</OutlineButton>}
            {!auto && <OutlineButton onClick={() => setSheet('correct')}>CORRECT BALANCE</OutlineButton>}
          </div>
        )}
        {account.provider === 'MT5' && (
          <div style={{ color: '#555', fontSize: '11px', marginTop: '12px', lineHeight: 1.5 }}>
            When the VPS reporter is live, a per-account token appears here to paste into the MT5 reporter (D-13).
          </div>
        )}
      </Section>

      <DetailsForm key={account.id} store={store} account={account} />

      <Section title="REMOVE">
        {!archived && (
          <>
            <OutlineButton color="#f59e0b" onClick={() => setSheet('archive')} style={{ width: '100%', padding: '12px' }}>ARCHIVE ACCOUNT</OutlineButton>
            <div style={{ color: '#555', fontSize: '11px', margin: '6px 0 14px', lineHeight: 1.5 }}>Keeps its trades. Leaves net worth. Can be restored.</div>
          </>
        )}
        <OutlineButton color="#ef4444" onClick={() => setSheet('delete')} style={{ width: '100%', padding: '12px' }}>DELETE PERMANENTLY</OutlineButton>
        <div style={{ color: '#555', fontSize: '11px', marginTop: '6px', lineHeight: 1.5 }}>Removes the account and all its trades. Can't be undone.</div>
      </Section>

      {sheet === 'correct' && <CorrectBalanceSheet account={account} figures={figures} onClose={() => setSheet(null)} />}

      {sheet === 'archive' && (
        <Sheet title={`Archive ${title}?`} onClose={() => setSheet(null)}>
          <ul style={listStyle}>
            {auto && <li>Syncing stops and the stored credentials are deleted.</li>}
            <li>Its equity ({formatUsd(figures.equity)}) leaves your net worth.</li>
            <li>Its {trades.length} trades stay in History, P&L and win rate.</li>
            <li>You can restore it from the Archived list{auto ? ', then reconnect it' : ''}.</li>
          </ul>
          <PrimaryButton style={{ backgroundColor: '#b45309' }} onClick={() => { previewActions.archiveAccount(account.id); navigate('/accounts', { replace: true }) }}>
            ARCHIVE
          </PrimaryButton>
        </Sheet>
      )}

      {sheet === 'delete' && (
        <DeleteSheet
          account={account}
          title={title}
          impact={{ equity: archived ? 0 : figures.equity, trades: trades.length, pnl: trades.reduce((s, t) => s + t.pnlUsd, 0), cash: cash.length }}
          onClose={() => setSheet(null)}
          onDeleted={() => navigate('/accounts', { replace: true })}
        />
      )}
    </>
  )
}

function DetailsForm({ store, account }) {
  const [style, setStyle] = useState(account.style)
  const [category, setCategory] = useState(account.category)
  const [accountNumber, setAccountNumber] = useState(account.accountNumber ?? '')
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const changed = style !== account.style || category !== account.category || accountNumber !== (account.accountNumber ?? '')
  const edited = () => { setError(null); setSaved(false) }

  const candidate = { ...account, style, accountNumber }
  const previewTitle = accountTitle(candidate, store.accounts)

  const save = e => {
    e.preventDefault()
    if (accountNumber && !/^\d{4}$/.test(accountNumber)) return setError('Exactly 4 digits.')
    const clash = titleClashError(candidate, store.accounts)
    if (clash) return setError(clash)
    previewActions.updateAccount(account.id, { style, category, accountNumber })
    setSaved(true)
  }

  return (
    <Section title="DETAILS">
      <form onSubmit={save} noValidate>
        <Field label="TRADING STYLE" hint={`Card title: ${previewTitle}`}>
          <StylePicker value={style} onChange={v => { setStyle(v); edited() }} />
        </Field>
        <Field label="ACCOUNT NUMBER · LAST 4 DIGITS" htmlFor="edit-number" error={error}>
          <input id="edit-number" value={accountNumber} maxLength={4} inputMode="numeric" placeholder="1093" autoComplete="off"
            onChange={e => { setAccountNumber(e.target.value.replace(/\D/g, '')); edited() }} style={inputStyle(Boolean(error))} />
        </Field>
        <Field label="CATEGORY">
          <div role="radiogroup" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {CATEGORY_KEYS.map(key => {
              const c = CATEGORIES[key]
              const active = category === key
              return (
                <button key={key} type="button" role="radio" aria-checked={active} onClick={() => { setCategory(key); setSaved(false) }}
                  style={{
                    padding: '10px 4px', borderRadius: '10px', cursor: 'pointer', fontFamily: 'monospace', fontSize: '11px', letterSpacing: '1px',
                    backgroundColor: active ? `${c.color}22` : '#141414', border: `1px solid ${active ? `${c.color}88` : '#2a2a2a'}`, color: active ? '#e5e7eb' : '#666',
                  }}>
                  {c.label.toUpperCase()}
                </button>
              )
            })}
          </div>
        </Field>
        <div style={{ color: '#555', fontSize: '11px', marginBottom: '12px' }}>
          Broker ({account.broker}) and currency ({account.currency}) are fixed once trades exist.
        </div>
        <PrimaryButton type="submit" disabled={!changed}>{saved && !changed ? 'SAVED' : 'SAVE DETAILS'}</PrimaryButton>
      </form>
    </Section>
  )
}

// D-19: the user types what the broker shows; the difference is recorded as a visible correction.
function CorrectBalanceSheet({ account, figures, onClose }) {
  const { rates, formatUsd } = useCurrency()
  const [amount, setAmount] = useState('')
  const [error, setError] = useState(null)
  const rate = account.currency === 'USD' ? 1 : rates?.[account.currency]

  const save = e => {
    e.preventDefault()
    const value = parseAmount(amount)
    if (value === null || value < 0) return setError('Enter the balance your broker shows.')
    if (!rate) return setError("Exchange rates haven't loaded yet. Try again in a moment.")
    previewActions.correctBalance(account.id, value / rate, 'Matched to broker statement')
    onClose()
  }

  const value = parseAmount(amount)
  const difference = value !== null && rate ? value / rate - figures.balance : null

  return (
    <Sheet title="Correct balance" onClose={onClose}>
      <div style={{ color: '#9ca3af', fontSize: '12px', lineHeight: 1.5, marginBottom: '14px' }}>
        Calculated balance: {formatUsd(figures.balance)}. If your broker shows something different (swaps or commissions you didn't log), enter its figure. The difference is saved as a visible correction, not hidden.
      </div>
      <form onSubmit={save} noValidate>
        <Field label={`BALANCE AT ${account.broker.toUpperCase()} (${account.currency})`} htmlFor="correct-amount" error={error}
          hint={difference !== null ? `Correction: ${formatUsd(difference, { signed: true })}` : undefined}>
          <input id="correct-amount" autoFocus value={amount} onChange={e => { setAmount(e.target.value); setError(null) }}
            inputMode="decimal" placeholder={rate ? (figures.balance * rate).toFixed(2) : ''} autoComplete="off" style={inputStyle(Boolean(error))} />
        </Field>
        <PrimaryButton type="submit">SAVE CORRECTION</PrimaryButton>
      </form>
    </Sheet>
  )
}

// D-18: permanent delete, confirmed by typing the account's name. Spells out what
// changes elsewhere, because net worth, P&L and win rate all recalculate.
function DeleteSheet({ account, title, impact, onClose, onDeleted }) {
  const { formatUsd } = useCurrency()
  const [typed, setTyped] = useState('')
  const matches = typed.trim().toLowerCase() === title.toLowerCase()

  return (
    <Sheet title={`Delete ${title}?`} onClose={onClose}>
      <ul style={listStyle}>
        <li>Deletes the account, its {impact.trades} trades and {impact.cash} deposits/withdrawals.</li>
        {impact.equity !== 0 && <li>Net worth drops by {formatUsd(impact.equity)}.</li>}
        {impact.trades > 0 && <li>All-time P&L changes by {formatUsd(-impact.pnl, { signed: true })}, and win rates are recalculated without these trades.</li>}
        <li style={{ color: '#ef4444' }}>This can't be undone. To keep the trades, archive instead.</li>
      </ul>
      <Field label={`TYPE "${title}" TO CONFIRM`} htmlFor="delete-confirm">
        <input id="delete-confirm" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" spellCheck={false} style={inputStyle(false)} />
      </Field>
      <PrimaryButton danger disabled={!matches} onClick={() => { previewActions.deleteAccount(account.id); onDeleted() }}>
        DELETE PERMANENTLY
      </PrimaryButton>
    </Sheet>
  )
}

const listStyle = { margin: '0 0 16px', paddingLeft: '18px', color: '#9ca3af', fontSize: '12px', lineHeight: 1.7 }
