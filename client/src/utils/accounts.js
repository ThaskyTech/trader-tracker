// Account definitions shared by the Accounts screens (D-16, D-17).
// These survive into the real build; only the sample data in src/preview is temporary.

// Each account belongs to exactly one category (D-17). The colour tints its card and chart.
export const CATEGORIES = {
  CRYPTO: { label: 'Crypto', color: '#f59e0b' },
  FOREX: { label: 'Forex', color: '#38bdf8' },
  STOCKS: { label: 'Stocks', color: '#a78bfa' },
}
export const CATEGORY_KEYS = Object.keys(CATEGORIES)

// How an account is traded (D-47). Picked from a list, never typed, so accounts can
// be grouped and compared by style later (e.g. bots against swing accounts).
export const STYLES = {
  BOT: { label: 'Bot' },
  SCALPING: { label: 'Scalping' },
  DAY: { label: 'Day trading' },
  SWING: { label: 'Swing' },
  LONG_TERM: { label: 'Long-term' },
}
export const STYLE_KEYS = Object.keys(STYLES)

const sameSlot = (a, b) => a.broker.trim().toLowerCase() === b.broker.trim().toLowerCase() && a.style === b.style

// True if another account has the same broker and style, so the title alone can't
// tell them apart and the account number has to.
export const hasTitleClash = (account, accounts) => accounts.some(a => a.id !== account.id && sameSlot(a, account))

// The card title is built, not typed: "Exness · Bot". When two accounts share broker
// and style, the last 4 digits of the account number are added to those two only:
// "Exness · Swing #5512".
// Validation for adding or editing: two accounts with the same broker and style must
// both be told apart by account number. Returns an error message, or null if fine.
export function titleClashError(candidate, accounts){
  const clashes = accounts.filter(a => a.id !== candidate.id && sameSlot(a, candidate))
  if(clashes.length === 0) return null
  const label = `${candidate.broker} · ${STYLES[candidate.style]?.label}`
  if(!candidate.accountNumber) return `You already have a ${label} account. Add the last 4 digits of this one's account number to tell them apart.`
  if(clashes.some(a => a.accountNumber === candidate.accountNumber)) return `Your other ${label} account also ends in ${candidate.accountNumber}.`
  return null
}

export function accountTitle(account, accounts = []){
  const base = `${account.broker} · ${STYLES[account.style]?.label ?? 'Unstyled'}`
  return hasTitleClash(account, accounts) && account.accountNumber ? `${base} #${account.accountNumber}` : base
}

// The connection types the app supports (D-12, D-16). Users pick from this list;
// a new API type needs its own adapter in code, so it can't be added from the UI.
//   sync: 'auto'   -> the server pulls balance, positions, trades and cash movements
//   sync: 'manual' -> the user logs trades and cash movements; balance is calculated (D-19)
export const PROVIDERS = {
  // platform: short name shown on the card's second line. null where the platform IS
  // the broker (Binance, IBKR), so the card doesn't repeat the title.
  BINANCE: {
    label: 'Binance Futures',
    platform: null,
    broker: 'Binance',
    defaultCategory: 'CRYPTO',
    sync: 'auto',
    method: 'Read-only API key',
    freshness: 'Every ~10 min',
    // Futures only (D-12): the owner doesn't use spot.
    blurb: 'USDⓈ-M Futures: balance, open positions, closed P&L and transfers in and out.',
  },
  CTRADER: {
    label: 'cTrader',
    platform: 'cTrader',
    broker: null, // Many brokers run cTrader (Pepperstone, IC Markets...), so the user names it.
    brokerSuggestions: ['Pepperstone', 'IC Markets', 'FxPro'],
    defaultCategory: 'FOREX',
    sync: 'auto',
    method: 'Log in with cTrader',
    freshness: 'Every ~10 min',
    blurb: 'Balance, open positions and closed trades.',
  },
  IBKR: {
    label: 'Interactive Brokers',
    platform: null,
    // Short form on the card: "Interactive Brokers · Long-term" gets cut off next to the equity.
    broker: 'IBKR',
    defaultCategory: 'STOCKS',
    sync: 'auto',
    method: 'Flex Web Service token',
    freshness: 'Once a day',
    blurb: 'Holdings, trades and cash transactions for long-term investing.',
  },
  MT5: {
    label: 'MetaTrader 5',
    platform: 'MT5',
    broker: null,
    brokerSuggestions: ['Exness', 'FP Markets', 'IC Markets'],
    defaultCategory: 'FOREX',
    sync: 'manual',
    method: 'Manual for now',
    freshness: 'When you log trades',
    blurb: 'Automatic once the VPS reporter is live (D-13).',
  },
  MANUAL: {
    label: 'Other (manual)',
    platform: null,
    broker: null,
    brokerSuggestions: [],
    defaultCategory: 'FOREX',
    sync: 'manual',
    method: 'Manual',
    freshness: 'When you log trades',
    blurb: 'Any broker or platform. You log trades and cash movements.',
  },
}
export const PROVIDER_KEYS = Object.keys(PROVIDERS)

// Wallet card geometry (D-46). PEEK is the strip of each card visible in the stack.
export const CARD_HEIGHT = 200
export const CARD_PEEK = 64

export const isAutoSync =account => PROVIDERS[account.provider]?.sync === 'auto'

// How long before an automatic account's figures count as stale (D-14). IBKR only
// syncs daily, so it gets a longer allowance than the ~10 minute brokers.
const STALE_AFTER_MS = { BINANCE: 30 * 60e3, CTRADER: 30 * 60e3, IBKR: 36 * 3600e3 }

// One status per account, so the card, list and detail page all agree.
//   OK | STALE | ERROR | MANUAL | RECONNECT (restored from the archive, credentials wiped)
export function syncState(account, now = Date.now()){
  if(account.status === 'ERROR') return 'ERROR'
  if(account.status === 'RECONNECT') return 'RECONNECT'
  if(!isAutoSync(account)) return 'MANUAL'
  const limit = STALE_AFTER_MS[account.provider] ?? 30 * 60e3
  if(!account.lastSyncedAt || now - new Date(account.lastSyncedAt).getTime() > limit) return 'STALE'
  return 'OK'
}

export const SYNC_STATE_STYLE = {
  OK: { label: 'SYNCED', color: '#22c55e' },
  STALE: { label: 'STALE', color: '#f59e0b' },
  ERROR: { label: 'ERROR', color: '#ef4444' },
  RECONNECT: { label: 'RECONNECT', color: '#ef4444' },
  MANUAL: { label: 'MANUAL', color: '#9ca3af' },
}

// The card's second line: platform + how far the figures can be trusted (D-14, D-47).
//   "MT5 · manual", "cTrader · synced 6 min ago", "Synced 4 min ago" (Binance: platform = broker)
// The colour only adds urgency on top of words that already say what's wrong.
export function freshnessLine(account, now = Date.now()){
  const state = syncState(account, now)
  const ago = timeAgo(account.lastSyncedAt, now)
  const text = {
    OK: `synced ${ago}`,
    STALE: `last synced ${ago}`,
    ERROR: 'sync failed',
    RECONNECT: 'reconnect needed',
    MANUAL: 'manual',
  }[state]
  const platform = PROVIDERS[account.provider]?.platform
  // Capitalise only the status word when it starts the line; platform names keep
  // their own spelling ("cTrader", not "CTrader").
  const line = platform ? `${platform} · ${text}` : text.charAt(0).toUpperCase() + text.slice(1)
  const color = state === 'ERROR' || state === 'RECONNECT' ? '#ef4444' : state === 'STALE' ? '#f59e0b' : '#9ca3af'
  return { text: line, color, state }
}

// '4 min ago', '3 h ago', '2 d ago'
export function timeAgo(iso, now = Date.now()){
  if(!iso) return 'never'
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if(seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if(minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if(hours < 48) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}
