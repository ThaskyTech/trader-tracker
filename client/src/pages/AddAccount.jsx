import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Field, PrimaryButton, StylePicker } from '../components/accounts/ui'
import { inputStyle } from '../components/accounts/styles'
import WalletCard from '../components/accounts/WalletCard'
import { CATEGORIES, CATEGORY_KEYS, CREATABLE_PROVIDERS, PROVIDERS, PROVIDER_KEYS, accountTitle, titleClashError } from '../utils/accounts'
import { CURRENCIES } from '../utils/currency'
import { parseAmount } from '../utils/tradeForm'
import { useAccounts } from '../context/AccountsContext'
import { accountApi } from '../api/client'

// Add-account wizard (D-16): type -> connect (automatic types only) -> details -> verify -> done.
// Only MT5 and manual accounts can be created until the sync adapters exist (roadmap
// 7-8). The connect screens for the automatic types are kept for then.
export default function AddAccount() {
  const navigate = useNavigate()
  const [step, setStep] = useState('type')
  const [provider, setProvider] = useState(null)
  const [credentials, setCredentials] = useState(null)
  const [details, setDetails] = useState(null)
  const [result, setResult] = useState(null)

  const auto = provider && PROVIDERS[provider].sync === 'auto'
  const steps = auto ? ['type', 'connect', 'details', 'verify'] : ['type', 'details', 'verify']
  const stepNumber = Math.min(steps.indexOf(step) + 1, steps.length)

  const back = () => {
    if (step === 'type' || step === 'done') return navigate(-1)
    if (step === 'verify') return // can't step back mid-verification
    setStep(steps[steps.indexOf(step) - 1])
  }

  const titles = {
    type: 'Add Account',
    connect: `Connect ${provider ? PROVIDERS[provider].label : ''}`,
    details: 'Account Details',
    verify: auto ? 'Verifying' : 'Creating',
    done: 'Account Added',
  }

  return (
    <div style={{ paddingBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '1rem 1rem 0' }}>
        <button type="button" onClick={back} aria-label="Back" style={{ background: 'none', border: 'none', color: '#22c55e', fontSize: '20px', cursor: 'pointer', padding: 0, lineHeight: 1 }}>←</button>
        <span style={{ color: '#fff', fontSize: '17px', fontWeight: 500 }}>{titles[step]}</span>
        {step !== 'done' && (
          <span style={{ marginLeft: 'auto', color: '#555', fontSize: '10px', letterSpacing: '1px' }}>
            STEP {stepNumber} OF {provider ? steps.length : '…'}
          </span>
        )}
      </div>

      {step !== 'done' && (
        <div aria-hidden style={{ display: 'flex', gap: '4px', padding: '10px 1rem 0' }}>
          {steps.map((s, i) => (
            <div key={s} style={{ flex: 1, height: '3px', borderRadius: '2px', backgroundColor: i < stepNumber ? '#22c55e' : '#222' }} />
          ))}
        </div>
      )}

      <div style={{ padding: '1rem' }}>
        {step === 'type' && (
          <TypeStep onPick={key => { setProvider(key); setCredentials(null); setDetails(null); setStep(PROVIDERS[key].sync === 'auto' ? 'connect' : 'details') }} />
        )}
        {step === 'connect' && (
          <ConnectStep provider={provider} initial={credentials} onNext={c => { setCredentials(c); setStep('details') }} />
        )}
        {step === 'details' && (
          <DetailsStep provider={provider} credentials={credentials} initial={details} onNext={d => { setDetails(d); setStep('verify') }} />
        )}
        {step === 'verify' && (
          <VerifyStep
            details={details}
            onDone={r => { setResult(r); setStep('done') }}
            onFail={() => setStep('details')}
          />
        )}
        {step === 'done' && result && <DoneStep result={result} />}
      </div>
    </div>
  )
}

// --- Step 1: pick the connection type ---

function TypeStep({ onPick }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ color: '#777', fontSize: '12px', lineHeight: 1.5, marginBottom: '4px' }}>
        Where is this account? Automatic types sync on their own. Manual types update from the trades and cash movements you log.
      </div>
      {PROVIDER_KEYS.map(key => {
        const p = PROVIDERS[key]
        const auto = p.sync === 'auto'
        // Shown but not selectable yet, so it's clear they're planned (roadmap 7-8).
        const available = CREATABLE_PROVIDERS.includes(key)
        return (
          <button
            key={key}
            type="button"
            onClick={() => onPick(key)}
            disabled={!available}
            style={{
              textAlign: 'left', backgroundColor: '#141414', border: '1px solid #222', borderRadius: '12px',
              padding: '14px', cursor: available ? 'pointer' : 'default', fontFamily: 'monospace', color: '#e5e7eb',
              display: 'flex', alignItems: 'center', gap: '12px', opacity: available ? 1 : 0.45,
            }}
          >
            <span aria-hidden style={{
              width: '10px', alignSelf: 'stretch', borderRadius: '3px',
              backgroundColor: CATEGORIES[p.defaultCategory].color, opacity: 0.8, flexShrink: 0,
            }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ fontSize: '14px', color: '#fff' }}>{p.label}</span>
                <span style={{
                  fontSize: '9px', letterSpacing: '1px', padding: '3px 7px', borderRadius: '4px', alignSelf: 'center',
                  color: auto ? '#22c55e' : '#9ca3af',
                  border: `1px solid ${auto ? '#16a34a55' : '#33333388'}`,
                }}>
                  {!available ? 'SOON' : auto ? 'AUTOMATIC' : 'MANUAL'}
                </span>
              </span>
              <span style={{ display: 'block', color: '#777', fontSize: '11px', marginTop: '5px', lineHeight: 1.4 }}>{p.blurb}</span>
              <span style={{ display: 'block', color: '#555', fontSize: '10px', marginTop: '5px' }}>{p.method} · {p.freshness}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

// --- Step 2: credentials (automatic types) ---

function ConnectStep({ provider, initial, onNext }) {
  if (provider === 'CTRADER') return <CTraderConnect initial={initial} onNext={onNext} />

  const fields = provider === 'BINANCE'
    ? [{ key: 'apiKey', label: 'API KEY' }, { key: 'secret', label: 'SECRET KEY', secret: true }]
    : [{ key: 'token', label: 'FLEX TOKEN', secret: true }, { key: 'queryId', label: 'QUERY ID', numeric: true }]
  const help = provider === 'BINANCE' ? [
    'In Binance: Profile → API Management → Create API.',
    'Tick only "Enable Reading". Leave trading and withdrawals off.',
    'We check this before saving and refuse keys that can trade (D-15).',
  ] : [
    'In IBKR Client Portal: Settings → Flex Web Service → generate a token.',
    'Reports → Flex Queries: create an Activity query with Trades, Open Positions and Cash Transactions, and copy its Query ID.',
    'The token is read-only and lasts up to a year. We remind you before it expires.',
  ]
  return <CredentialForm fields={fields} help={help} initial={initial} onNext={onNext} />
}

function CredentialForm({ fields, help, initial, onNext }) {
  const [values, setValues] = useState(() => initial ?? Object.fromEntries(fields.map(f => [f.key, ''])))
  const [errors, setErrors] = useState({})

  const submit = e => {
    e.preventDefault()
    const found = {}
    for (const f of fields) {
      const v = values[f.key].trim()
      if (!v) found[f.key] = 'Required.'
      else if (f.numeric && !/^\d+$/.test(v)) found[f.key] = 'Numbers only.'
      else if (!f.numeric && v.length < 12) found[f.key] = 'That looks too short.'
    }
    setErrors(found)
    if (Object.keys(found).length === 0) onNext(Object.fromEntries(fields.map(f => [f.key, values[f.key].trim()])))
  }

  return (
    <form onSubmit={submit} noValidate>
      <HelpBox lines={help} />
      {fields.map(f => (
        <Field key={f.key} label={f.label} htmlFor={f.key} error={errors[f.key]}>
          <input
            id={f.key}
            type={f.secret ? 'password' : 'text'}
            inputMode={f.numeric ? 'numeric' : undefined}
            autoComplete="off" spellCheck={false} autoCapitalize="none"
            value={values[f.key]}
            onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
            style={inputStyle(errors[f.key])}
          />
        </Field>
      ))}
      <div style={{ color: '#555', fontSize: '11px', lineHeight: 1.5, marginBottom: '14px' }}>
        Stored encrypted on the server (AES-256-GCM, D-15) and never shown again, only a masked hint.
      </div>
      <PrimaryButton type="submit">CONTINUE</PrimaryButton>
    </form>
  )
}

// cTrader uses OAuth: the user logs in on Spotware's site and comes back with a token,
// then picks which trading account this card is for.
const CTRADER_SAMPLE_ACCOUNTS = [
  { number: '8820412', broker: 'Pepperstone', type: 'Live', currency: 'USD' },
  { number: '3105577', broker: 'Pepperstone', type: 'Demo', currency: 'USD' },
]

function CTraderConnect({ initial, onNext }) {
  const [phase, setPhase] = useState(initial ? 'pick' : 'login')
  const [picked, setPicked] = useState(initial?.number ?? null)

  useEffect(() => {
    if (phase !== 'redirecting') return
    const timer = setTimeout(() => setPhase('pick'), 1200)
    return () => clearTimeout(timer)
  }, [phase])

  if (phase !== 'pick') {
    return (
      <div>
        <HelpBox lines={[
          'You log in on cTrader\'s own site, so we never see your cTrader password.',
          'cTrader then gives us read access to the trading accounts you choose.',
        ]} />
        <PrimaryButton onClick={() => setPhase('redirecting')} disabled={phase === 'redirecting'}>
          {phase === 'redirecting' ? 'OPENING cTRADER LOGIN…' : 'LOG IN WITH cTRADER'}
        </PrimaryButton>
      </div>
    )
  }

  return (
    <div>
      <div style={{ color: '#22c55e', fontSize: '12px', marginBottom: '12px' }}>✓ Connected to your cTrader ID</div>
      <div style={{ color: '#777', fontSize: '12px', marginBottom: '10px' }}>Which trading account is this card for?</div>
      <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
        {CTRADER_SAMPLE_ACCOUNTS.map(a => (
          <button
            key={a.number}
            type="button"
            role="radio"
            aria-checked={picked === a.number}
            onClick={() => setPicked(a.number)}
            style={{
              textAlign: 'left', padding: '12px 14px', borderRadius: '10px', cursor: 'pointer', fontFamily: 'monospace',
              backgroundColor: picked === a.number ? '#16a34a1a' : '#141414',
              border: `1px solid ${picked === a.number ? '#16a34a88' : '#222'}`, color: '#e5e7eb',
            }}
          >
            <div style={{ fontSize: '13px' }}>{a.broker} · {a.type}</div>
            <div style={{ color: '#666', fontSize: '11px', marginTop: '3px' }}>#{a.number} · {a.currency}</div>
          </button>
        ))}
      </div>
      <div style={{ color: '#555', fontSize: '11px', marginBottom: '14px' }}>Want both? Add the other one as its own card afterwards.</div>
      <PrimaryButton disabled={!picked} onClick={() => onNext(CTRADER_SAMPLE_ACCOUNTS.find(a => a.number === picked))}>CONTINUE</PrimaryButton>
    </div>
  )
}

// --- Step 3: details ---

function DetailsStep({ provider, credentials, initial, onNext }) {
  const p = PROVIDERS[provider]
  const { accounts: loaded } = useAccounts()
  const accounts = loaded ?? []
  const presetBroker = p.broker ?? credentials?.broker ?? ''
  const lockCurrency = provider === 'BINANCE'

  const [form, setForm] = useState(() => initial?.form ?? {
    broker: presetBroker,
    style: null, // no default: how an account is traded is a conscious choice
    category: p.defaultCategory,
    currency: credentials?.currency ?? 'USD',
    accountNumber: credentials?.number?.slice(-4) ?? '',
    openingBalance: '',
  })
  const [errors, setErrors] = useState({})
  const set = (key, value) => { setForm(f => ({ ...f, [key]: value })); setErrors(e => ({ ...e, [key]: undefined })) }

  const candidate = { id: null, broker: form.broker.trim(), style: form.style, accountNumber: form.accountNumber.trim() }
  const previewTitle = candidate.broker && form.style ? accountTitle(candidate, [...accounts, candidate]) : null

  const submit = e => {
    e.preventDefault()
    const found = {}
    const broker = candidate.broker
    if (!broker) found.broker = 'Required.'
    else if (broker.length > 50) found.broker = 'At most 50 characters.'
    if (!form.style) found.style = 'Pick how this account is traded.'
    if (candidate.accountNumber && !/^\d{4}$/.test(candidate.accountNumber)) found.accountNumber = 'Exactly 4 digits.'
    else if (broker && form.style) {
      const clash = titleClashError(candidate, accounts)
      if (clash) found.accountNumber = clash
    }
    // In the account's own currency; the server stores it with today's rate (D-22).
    let openingBalance = 0
    if (p.sync === 'manual') {
      const amount = parseAmount(form.openingBalance)
      if (amount === null) found.openingBalance = 'Enter the balance as it is today.'
      else if (amount < 0) found.openingBalance = "A balance can't be negative."
      else openingBalance = amount
    }
    setErrors(found)
    if (Object.keys(found).length > 0) return
    onNext({ form, draft: {
      provider, broker, style: form.style, category: form.category, currency: form.currency,
      accountNumber: candidate.accountNumber || null, openingBalance,
    } })
  }

  return (
    <form onSubmit={submit} noValidate>
      <Field label="BROKER" htmlFor="broker" error={errors.broker}>
        <input
          id="broker" value={form.broker} onChange={e => set('broker', e.target.value)}
          readOnly={Boolean(p.broker)} list="broker-suggestions" placeholder="Exness" autoComplete="off"
          style={{ ...inputStyle(errors.broker), opacity: p.broker ? 0.6 : 1 }}
        />
        <datalist id="broker-suggestions">{(p.brokerSuggestions ?? []).map(b => <option key={b} value={b} />)}</datalist>
      </Field>

      <Field label="TRADING STYLE" error={errors.style}
        hint={previewTitle ? `Card title: ${previewTitle}` : 'How this account is traded. Together with the broker it becomes the card title (D-47).'}>
        <StylePicker value={form.style} onChange={v => { set('style', v); setErrors(e => ({ ...e, accountNumber: undefined })) }} />
      </Field>

      <Field label="CATEGORY" hint="Each account belongs to one niche (D-17). You can change it later.">
        <div role="radiogroup" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {CATEGORY_KEYS.map(key => {
            const c = CATEGORIES[key]
            const active = form.category === key
            return (
              <button
                key={key} type="button" role="radio" aria-checked={active} onClick={() => set('category', key)}
                style={{
                  padding: '12px 4px', borderRadius: '10px', cursor: 'pointer', fontFamily: 'monospace',
                  fontSize: '11px', letterSpacing: '1px',
                  backgroundColor: active ? `${c.color}22` : '#141414',
                  border: `1px solid ${active ? `${c.color}88` : '#2a2a2a'}`,
                  color: active ? '#e5e7eb' : '#666',
                }}
              >
                {c.label.toUpperCase()}
              </button>
            )
          })}
        </div>
      </Field>

      <Field label="ACCOUNT CURRENCY" htmlFor="currency"
        hint={lockCurrency ? 'Futures are USDT-margined, and USDT counts as USD (D-26).' : 'The currency your broker reports this account in.'}>
        <select id="currency" value={form.currency} disabled={lockCurrency} onChange={e => set('currency', e.target.value)}
          style={{ ...inputStyle(false), cursor: 'pointer', opacity: lockCurrency ? 0.6 : 1 }}>
          {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} {c.symbol}</option>)}
        </select>
      </Field>

      <Field label="ACCOUNT NUMBER · LAST 4 DIGITS" htmlFor="accountNumber" error={errors.accountNumber}
        hint={`Optional. Lets you match the card to your login, and is required if you have two ${candidate.broker || 'same-broker'} accounts with the same style.`}>
        <input id="accountNumber" value={form.accountNumber} onChange={e => set('accountNumber', e.target.value.replace(/\D/g, ''))}
          inputMode="numeric" maxLength={4} placeholder="1093" autoComplete="off" style={inputStyle(errors.accountNumber)} />
      </Field>

      {p.sync === 'manual' && (
        <Field label="BALANCE TODAY" htmlFor="openingBalance" error={errors.openingBalance}
          hint="From now on the balance updates itself from the trades and deposits/withdrawals you log (D-19). Trades you logged before today don't change it.">
          <input id="openingBalance" value={form.openingBalance} onChange={e => set('openingBalance', e.target.value)}
            inputMode="decimal" placeholder="2000.00" autoComplete="off" style={inputStyle(errors.openingBalance)} />
        </Field>
      )}

      {provider === 'MT5' && (
        <div style={{ color: '#555', fontSize: '11px', lineHeight: 1.5, marginBottom: '14px' }}>
          Once the VPS reporter is live, this account switches to automatic and reports its real balance and open positions (D-13).
        </div>
      )}

      <PrimaryButton type="submit">{p.sync === 'auto' ? 'CONNECT AND SYNC' : 'CREATE ACCOUNT'}</PrimaryButton>
    </form>
  )
}

// --- Step 4: create ---

// Saves the account. A server-side refusal (e.g. a title clash found since the details
// step) goes back to the details with the message.
function VerifyStep({ details, onDone, onFail }) {
  const { refresh } = useAccounts()
  const [error, setError] = useState(null)
  // React runs effects twice in development; this keeps it to one account.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    accountApi.create(details.draft)
      .then(async ({ account }) => { await refresh(); onDone({ account }) })
      .catch(err => setError(err.message))
  }, [details, onDone, refresh])

  if (error) {
    return (
      <div>
        <div role="alert" style={{ color: '#ef4444', fontSize: '13px', padding: '12px', borderRadius: '10px', border: '1px solid #ef444444', backgroundColor: '#ef444411', lineHeight: 1.5, marginBottom: '14px' }}>
          {error}
        </div>
        <PrimaryButton onClick={onFail}>BACK TO DETAILS</PrimaryButton>
      </div>
    )
  }

  return <div style={{ color: '#9ca3af', fontSize: '13px', padding: '0.5rem 0' }}>Creating the account…</div>
}

// --- Done ---

function DoneStep({ result }) {
  const navigate = useNavigate()
  const { titleOf } = useAccounts()
  const { account } = result
  const title = titleOf(account)

  return (
    <div>
      <WalletCard account={account} title={title} figures={account.figures} />
      <div style={{ color: '#22c55e', fontSize: '13px', margin: '16px 0 4px' }}>✓ {title} is in your wallet</div>
      <div style={{ color: '#777', fontSize: '12px', lineHeight: 1.5, marginBottom: '18px' }}>
        Log trades and deposits/withdrawals against it, and its balance keeps itself up to date.
      </div>
      <PrimaryButton onClick={() => navigate(`/accounts/${account.id}`, { replace: true })}>VIEW ACCOUNT</PrimaryButton>
      <button type="button" onClick={() => navigate('/accounts', { replace: true })}
        style={{ width: '100%', marginTop: '10px', background: 'none', border: '1px solid #2a2a2a', borderRadius: '10px', color: '#9ca3af', padding: '14px', fontSize: '12px', letterSpacing: '1px', cursor: 'pointer', fontFamily: 'monospace' }}>
        BACK TO WALLET
      </button>
    </div>
  )
}

function HelpBox({ lines }) {
  return (
    <ul style={{ margin: '0 0 16px', padding: '12px 12px 12px 28px', backgroundColor: '#141414', borderRadius: '10px', color: '#9ca3af', fontSize: '12px', lineHeight: 1.6 }}>
      {lines.map(line => <li key={line}>{line}</li>)}
    </ul>
  )
}
