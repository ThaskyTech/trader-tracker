import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { tradeApi } from '../api/client'
import {
  emptyForm, tradeToForm, validateForm, changedFields,
  serverFieldErrors, toLocalDateString, parseAmount,
} from '../utils/tradeForm'
import { CURRENCIES, CURRENCY_CODES, formatMoney } from '../utils/currency'
import { useCurrency } from '../context/CurrencyContext'
import { useAccounts } from '../context/AccountsContext'
import AccountPicker from '../components/accounts/AccountPicker'
import { isAutoSync } from '../utils/accounts'
import { formatTradeTime } from '../utils/format'

// The account picked last time on this device (D-37), for the same reason as the currency.
const LAST_ACCOUNT_KEY = 'lastAccountId'
function readLastAccount(){
  try { return localStorage.getItem(LAST_ACCOUNT_KEY) } catch { return null }
}
function saveLastAccount(id){
  try { localStorage.setItem(LAST_ACCOUNT_KEY, id) } catch { /* storage unavailable */ }
}

// The P&L currency picked last time on this device. Most people log most trades from
// the same account, so this saves re-picking it every time.
const LAST_CURRENCY_KEY = 'lastPnlCurrency'
function readLastCurrency(){
  try {
    const code = localStorage.getItem(LAST_CURRENCY_KEY)
    return CURRENCY_CODES.includes(code) ? code : null
  } catch { return null }
}
function saveLastCurrency(code){
  try { localStorage.setItem(LAST_CURRENCY_KEY, code) } catch { /* storage unavailable */ }
}

// One page for both routes:
//   /trades/new?date=2026-11-17  -> log a new trade (date is optional)
//   /trades/:id/edit             -> edit or delete an existing trade
export default function TradeForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { accounts } = useAccounts()
  // A new trade's starting account and currency depend on the accounts, so wait for them.
  if (!id && accounts === null) {
    return (
      <Page title="Log Trade" onBack={() => navigate(-1)}>
        <div style={{ color: '#555', fontSize: '12px', letterSpacing: '1px' }}>LOADING...</div>
      </Page>
    )
  }
  // The key gives each trade (and "new") its own fresh form state, even when
  // React Router reuses this component while navigating between them.
  return <TradeFormInner key={id ?? 'new'} id={id} />
}

function TradeFormInner({ id }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const isEdit = Boolean(id)
  const { displayCurrency, rates } = useCurrency()

  // Opened from an account (/trades/new?account=...): the account is locked and the
  // currency starts as the account's (D-16, D-37). Archived accounts take no new trades,
  // and synced ones take none by hand: their trades come from the broker (D-63).
  const { active: allActive, byId, titleOf, refresh: refreshAccounts } = useAccounts()
  const active = allActive.filter(a => !isAutoSync(a))
  const lockedAccount = isEdit ? null : active.find(a => a.id === searchParams.get('account')) ?? null

  const [form, setForm] = useState(() => {
    if (isEdit) return null
    // Which account a new trade starts on: the locked one, else the last one used here,
    // else the only one if there's just one. Otherwise none, so it's a deliberate choice.
    const last = active.find(a => a.id === readLastAccount())
    const start = lockedAccount ?? last ?? (active.length === 1 ? active[0] : null)
    // P&L currency starts as the account's: a broker reports P&L in the account currency.
    const initial = emptyForm(searchParams.get('date'), start?.currency ?? readLastCurrency() ?? displayCurrency)
    return start ? { ...initial, accountId: start.id } : initial
  })

  // Accounts the trade can be on. When editing a trade on an archived account, that
  // account is included so the field still shows where the trade is.
  const current = form?.accountId ? byId(form.accountId) : null
  const accountOptions = [...active, ...(current?.archivedAt ? [current] : [])]
    .map(account => ({ account, title: titleOf(account) }))

  const pickAccount = account => {
    setForm(f => ({ ...f, accountId: account.id, pnlCurrency: account.currency }))
    if (errors.accountId) setErrors(e => ({ ...e, accountId: undefined }))
  }
  // In edit mode: the stored trade as the form sees it, to work out what changed.
  const [baseline, setBaseline] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // A trade synced from a broker opens as a read-only record instead (D-63).
  const [syncedTrade, setSyncedTrade] = useState(null)

  useEffect(() => {
    if (!isEdit) return
    let cancelled = false
    tradeApi.getTrade(id)
      .then(({ trade }) => {
        if (cancelled) return
        if (trade.source !== 'MANUAL') return setSyncedTrade(trade)
        const loaded = tradeToForm(trade)
        setForm(loaded)
        setBaseline({ payload: validateForm(loaded).payload, closedAt: trade.closedAt })
      })
      .catch(err => { if (!cancelled) setLoadError(err.message) })
    return () => { cancelled = true }
  }, [id, isEdit])

  const update = (field, value) => {
    setForm(f => ({ ...f, [field]: value }))
    if (errors[field]) setErrors(e => ({ ...e, [field]: undefined }))
  }
  const bind = field => ({ value: form[field], onChange: e => update(field, e.target.value) })

  // After logging a new trade, show the day it closed on, since that's where it now appears.
  const goToDay = closedAt => navigate(`/daily/${toLocalDateString(new Date(closedAt))}`, { replace: true })

  // D-36: logged from an account (locked), go back to it, where the trade now shows.
  const finishCreate = closedAt => {
    if (!lockedAccount) return goToDay(closedAt)
    if (location.key !== 'default') return navigate(-1)
    navigate(`/accounts/${lockedAccount.id}`, { replace: true })
  }

  // After editing or deleting, return to wherever the user came from (Daily Log or
  // History), which reloads with the change. If the form was opened directly from
  // a link, there's nowhere to go back to, so show the trade's day instead.
  const finishEdit = closedAt => (location.key !== 'default' ? navigate(-1) : goToDay(closedAt))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (saving) return
    setFormError(null)

    const { payload, errors: found } = validateForm(form)
    if (found) {
      setErrors(found)
      setFormError('Check the highlighted fields.')
      return
    }

    setSaving(true)
    saveLastCurrency(payload.pnlCurrency)
    // A locked account was imposed by where the form opened, not chosen, so it isn't remembered.
    if (!isEdit && !lockedAccount) saveLastAccount(payload.accountId)
    try {
      if (isEdit) {
        const changes = baseline?.payload ? changedFields(payload, baseline.payload) : payload
        if (Object.keys(changes).length === 0) return finishEdit(baseline.closedAt)
        const { trade } = await tradeApi.updateTrade(id, changes)
        // Balances are calculated from trades (D-19), so the accounts list is reloaded.
        refreshAccounts()
        finishEdit(trade.closedAt)
      } else {
        const { trade } = await tradeApi.createTrade(payload)
        refreshAccounts()
        finishCreate(trade.closedAt)
      }
    } catch (err) {
      setErrors(serverFieldErrors(err.details))
      setFormError(err.message)
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    // First tap arms the button, second tap deletes. Cheaper on mobile than a dialog.
    if (!confirmDelete) return setConfirmDelete(true)
    setSaving(true)
    setFormError(null)
    try {
      await tradeApi.deleteTrade(id)
      refreshAccounts()
      finishEdit(baseline.closedAt)
    } catch (err) {
      setFormError(err.message)
      setSaving(false)
      setConfirmDelete(false)
    }
  }

  const title = isEdit ? 'Edit Trade' : 'Log Trade'

  if (syncedTrade) return <SyncedTrade trade={syncedTrade} onBack={() => navigate(-1)} onSaved={() => finishEdit(syncedTrade.closedAt)} />

  if (loadError) {
    return (
      <Page title={title} onBack={() => navigate(-1)}>
        <ErrorBox>{loadError}</ErrorBox>
      </Page>
    )
  }
  if (!form) {
    return (
      <Page title={title} onBack={() => navigate(-1)}>
        <div style={{ color: '#555', fontSize: '12px', letterSpacing: '1px' }}>LOADING TRADE...</div>
      </Page>
    )
  }

  return (
    <Page title={title} onBack={() => navigate(-1)}>
      <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

        <Field label="DIRECTION">
          <Segmented
            value={form.direction}
            onChange={v => update('direction', v)}
            options={[
              { value: 'LONG', label: 'LONG', color: '#22c55e' },
              { value: 'SHORT', label: 'SHORT', color: '#ef4444' },
            ]}
          />
        </Field>

        <Field label="SYMBOL" htmlFor="symbol" error={errors.symbol}>
          <input
            id="symbol" {...bind('symbol')}
            placeholder="EURUSD"
            autoCapitalize="characters" autoComplete="off" spellCheck={false}
            style={inputStyle(errors.symbol)}
          />
        </Field>

        {/* The account the trade was on (D-37). Editing can move a trade to another account. */}
        <Field label="ACCOUNT" htmlFor="account" error={errors.accountId}>
          {accountOptions.length === 0 ? (
            <div style={{ color: '#9ca3af', fontSize: '12px', lineHeight: 1.5 }}>
              {allActive.length > 0
                ? 'Your accounts sync their trades automatically. To log trades by hand, add a manual account in the Accounts tab.'
                : 'Add an account first, in the Accounts tab. Every trade belongs to one.'}
            </div>
          ) : (
            <AccountPicker
              id="account"
              options={accountOptions}
              value={form.accountId}
              onChange={pickAccount}
              error={Boolean(errors.accountId)}
              locked={Boolean(lockedAccount)}
            />
          )}
          {lockedAccount && (
            <div style={{ color: '#555', fontSize: '11px', marginTop: '6px', lineHeight: 1.4 }}>
              Set by the account you came from.
            </div>
          )}
        </Field>

        <Field label="LOT SIZE" htmlFor="lotSize" error={errors.lotSize}>
          <input id="lotSize" {...bind('lotSize')} inputMode="decimal" placeholder="0.50" style={inputStyle(errors.lotSize)} />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <Field label="ENTRY PRICE" htmlFor="entryPrice" error={errors.entryPrice}>
            <input id="entryPrice" {...bind('entryPrice')} inputMode="decimal" placeholder="1.08210" style={inputStyle(errors.entryPrice)} />
          </Field>
          <Field label="EXIT PRICE" htmlFor="exitPrice" error={errors.exitPrice}>
            <input id="exitPrice" {...bind('exitPrice')} inputMode="decimal" placeholder="1.08550" style={inputStyle(errors.exitPrice)} />
          </Field>
        </div>

        <Field label="NET P/L" htmlFor="pnlAmount" error={errors.pnlAmount || errors.pnlCurrency}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Segmented
              value={form.pnlSign}
              onChange={v => update('pnlSign', v)}
              options={[
                { value: 'PROFIT', label: 'PROFIT', color: '#22c55e' },
                { value: 'LOSS', label: 'LOSS', color: '#ef4444' },
              ]}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <select
                aria-label="P&L currency"
                {...bind('pnlCurrency')}
                style={{ ...inputStyle(errors.pnlCurrency), width: '96px', flexShrink: 0, cursor: 'pointer' }}
              >
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} {c.symbol}</option>)}
              </select>
              <div style={{ position: 'relative', flex: 1 }}>
                <span style={{
                  position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
                  color: form.pnlSign === 'LOSS' ? '#ef4444' : '#22c55e', fontSize: '16px', pointerEvents: 'none',
                }}>
                  {form.pnlSign === 'LOSS' ? '-' : '+'}
                </span>
                <input
                  id="pnlAmount" {...bind('pnlAmount')}
                  inputMode="decimal" placeholder="170.00"
                  style={{ ...inputStyle(errors.pnlAmount), paddingLeft: '30px' }}
                />
              </div>
            </div>
            <UsdPreview form={form} rates={rates} />
          </div>
        </Field>

        <Field label="OPENED" htmlFor="openedAt" error={errors.openedAt}>
          <input id="openedAt" type="datetime-local" {...bind('openedAt')} style={inputStyle(errors.openedAt)} />
        </Field>

        <Field label="CLOSED" htmlFor="closedAt" error={errors.closedAt}>
          <input id="closedAt" type="datetime-local" {...bind('closedAt')} style={inputStyle(errors.closedAt)} />
        </Field>

        <Field label="NOTES (OPTIONAL)" htmlFor="notes" error={errors.notes}>
          <textarea
            id="notes" {...bind('notes')}
            rows={3} maxLength={2000}
            placeholder="Setup, reasoning, what you'd do differently..."
            style={{ ...inputStyle(errors.notes), resize: 'vertical', fontSize: '14px' }}
          />
        </Field>

        {formError && <ErrorBox>{formError}</ErrorBox>}

        <button type="submit" disabled={saving} style={primaryButtonStyle(saving)}>
          {saving ? 'SAVING...' : isEdit ? 'SAVE CHANGES' : 'SAVE TRADE'}
        </button>

        {isEdit && (
          <button
            type="button"
            onClick={handleDelete}
            onBlur={() => setConfirmDelete(false)}
            disabled={saving}
            style={{
              background: confirmDelete ? '#ef444422' : 'none',
              border: '1px solid #ef444455',
              borderRadius: '10px',
              color: '#ef4444',
              fontSize: '12px',
              letterSpacing: '1px',
              padding: '14px',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: 'monospace',
            }}
          >
            {confirmDelete ? 'TAP AGAIN TO DELETE' : 'DELETE TRADE'}
          </button>
        )}
      </form>
    </Page>
  )
}

// A synced trade (D-63): the broker's record, shown as it is, with only the notes
// editable. Editing anything else would disagree with the broker, and a deleted trade
// would come back on the next sync. Each row is something the trade card doesn't show
// in full: the fees behind the net P/L (D-61) and the exact times.
function SyncedTrade({ trade, onBack, onSaved }) {
  const { formatTradePnl, formatUsd } = useCurrency()
  const { byId, titleOf } = useAccounts()
  const [notes, setNotes] = useState(trade.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const account = byId(trade.accountId)
  const changed = notes.trim() !== (trade.notes ?? '')

  const save = async e => {
    e.preventDefault()
    if (!changed) return onSaved()
    setSaving(true)
    setError(null)
    try {
      await tradeApi.updateTrade(trade.id, { notes: notes.trim() || null })
      onSaved()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const row = (label, value, color = '#e5e7eb') => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '8px 0', borderTop: '1px solid #1f1f1f', fontSize: '13px' }}>
      <span style={{ color: '#777' }}>{label}</span>
      <span style={{ color, textAlign: 'right' }}>{value}</span>
    </div>
  )

  return (
    <Page title="Trade" onBack={onBack}>
      <div style={{ backgroundColor: '#141414', borderRadius: '12px', padding: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
          <span style={{ color: trade.direction === 'LONG' ? '#22c55e' : '#ef4444', fontSize: '16px', fontWeight: 500 }}>{trade.symbol}</span>
          <span style={{ color: '#888', fontSize: '12px' }}>{trade.direction}</span>
        </div>
        {row('Account', account ? titleOf(account) : trade.broker)}
        {row('Size', trade.lotSize)}
        {row('Entry → exit', `${trade.entryPrice} → ${trade.exitPrice}`)}
        {row('Opened', formatTradeTime(trade.openedAt, null))}
        {row('Closed', formatTradeTime(trade.closedAt, null))}
        {trade.fees != null && row('Fees & funding', formatUsd(-trade.fees / trade.fxRate, { signed: true }))}
        {row('Net P/L', formatTradePnl(trade, { signed: true }), trade.pnl < 0 ? '#ef4444' : '#22c55e')}
      </div>
      <div style={{ color: '#555', fontSize: '11px', lineHeight: 1.5, margin: '10px 0 16px' }}>
        Synced from {trade.broker}, so only your notes can change.
      </div>
      <form onSubmit={save} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <Field label="NOTES" htmlFor="notes">
          <textarea
            id="notes" value={notes} onChange={e => setNotes(e.target.value)}
            rows={4} maxLength={2000}
            placeholder="Setup, reasoning, what you'd do differently..."
            style={{ ...inputStyle(false), resize: 'vertical', fontSize: '14px' }}
          />
        </Field>
        {error && <ErrorBox>{error}</ErrorBox>}
        <button type="submit" disabled={saving || !changed} style={primaryButtonStyle(saving || !changed)}>
          {saving ? 'SAVING...' : 'SAVE NOTES'}
        </button>
      </form>
    </Page>
  )
}

function Page({ title, onBack, children }) {
  return (
    <div style={{ paddingBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '1rem' }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          style={{ background: 'none', border: 'none', color: '#22c55e', fontSize: '20px', cursor: 'pointer', padding: 0, lineHeight: 1 }}
        >
          ←
        </button>
        <span style={{ color: '#fff', fontSize: '17px', fontWeight: '500' }}>{title}</span>
      </div>
      <div style={{ padding: '0 1rem' }}>{children}</div>
    </div>
  )
}

function Field({ label, htmlFor, error, children }) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        style={{ display: 'block', color: '#555', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '8px' }}
      >
        {label}
      </label>
      {children}
      {error && <div role="alert" style={{ color: '#ef4444', fontSize: '11px', marginTop: '6px' }}>{error}</div>}
    </div>
  )
}

// Two-option toggle, used for LONG/SHORT and PROFIT/LOSS.
function Segmented({ value, onChange, options }) {
  return (
    <div role="radiogroup" style={{ display: 'grid', gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: '8px' }}>
      {options.map(opt => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            style={{
              backgroundColor: active ? `${opt.color}22` : '#141414',
              border: `1px solid ${active ? `${opt.color}88` : '#2a2a2a'}`,
              borderRadius: '10px',
              color: active ? opt.color : '#555',
              fontSize: '12px',
              fontWeight: '600',
              letterSpacing: '1px',
              padding: '12px',
              cursor: 'pointer',
              fontFamily: 'monospace',
              transition: 'all 0.15s',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// For non-USD entries, a rough USD figure so the user can sanity-check the amount.
// It's only a preview at today's rate. The server converts at the close date's rate.
function UsdPreview({ form, rates }) {
  const amount = parseAmount(form.pnlAmount)
  const rate = rates?.[form.pnlCurrency]
  if (form.pnlCurrency === 'USD' || amount === null || !rate) return null

  const usd = (form.pnlSign === 'LOSS' ? -amount : amount) / rate
  return (
    <div style={{ color: '#555', fontSize: '11px', lineHeight: 1.4 }}>
      ≈ {formatMoney(usd, 'USD', { signed: true })} USD at today's rate. Saved using the rate on the close date.
    </div>
  )
}

function ErrorBox({ children }) {
  return (
    <div role="alert" style={{
      color: '#ef4444',
      fontSize: '12px',
      letterSpacing: '0.3px',
      padding: '10px 12px',
      backgroundColor: '#ef444411',
      borderRadius: '8px',
      border: '1px solid #ef444433',
    }}>
      {children}
    </div>
  )
}

const inputStyle = (hasError) => ({
  width: '100%',
  backgroundColor: '#141414',
  border: `1px solid ${hasError ? '#ef444488' : '#2a2a2a'}`,
  borderRadius: '10px',
  color: '#e5e7eb',
  // 16px stops iOS Safari zooming in when an input is focused.
  fontSize: '16px',
  padding: '14px',
  fontFamily: 'monospace',
  boxSizing: 'border-box',
  outline: 'none',
  // Makes the native date picker and its calendar icon dark, so the icon is visible.
  colorScheme: 'dark',
})

const primaryButtonStyle = (busy) => ({
  marginTop: '8px',
  backgroundColor: busy ? '#14532d' : '#16a34a',
  border: 'none',
  borderRadius: '10px',
  color: busy ? '#555' : '#fff',
  fontSize: '13px',
  fontWeight: '600',
  letterSpacing: '1px',
  padding: '16px',
  cursor: busy ? 'not-allowed' : 'pointer',
  fontFamily: 'monospace',
  transition: 'background-color 0.2s',
})
