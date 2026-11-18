// SAMPLE DATA for the Accounts UI preview (roadmap step 6a, D-46).
// Nothing here touches the server. It lives in memory for this browser tab and resets
// on reload. When the real API exists (step 6b/6c), the screens swap this hook for
// API calls and this whole folder is deleted.
//
// The calculations are the real rules though, so they can be checked in the preview:
//   balance (manual, D-19) = opening balance + P&L of trades closed since + cash movements
//   equity  (D-02)         = balance + floating P&L of open positions
//   net worth              = sum of equity over accounts that aren't archived

import { useSyncExternalStore } from 'react'
import { PROVIDERS, isAutoSync } from '../utils/accounts'

const DAY = 86400e3
const now = Date.now()
const daysAgo = (d, hour = 12) => {
  const date = new Date(now - d * DAY)
  date.setHours(hour, (d * 37) % 60, 0, 0)
  return date.toISOString()
}

// Rough units-per-USD rates, only for converting the sample ZAR account's trades.
const SAMPLE_RATES = { USD: 1, EUR: 0.92, GBP: 0.79, JPY: 154, AUD: 1.52, ZAR: 17.8 }

// Small seeded random generator, so the sample data is the same on every reload.
function seeded(seed){
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SYMBOLS = {
  CRYPTO: [['BTCUSDT', 68000], ['ETHUSDT', 3400], ['SOLUSDT', 160]],
  FOREX: [['EURUSD', 1.082], ['XAUUSD', 2650], ['GBPJPY', 192.4], ['USDJPY', 154.2]],
  STOCKS: [['AAPL', 228], ['MSFT', 415], ['NVDA', 135], ['VOO', 520]],
}
const SOURCE = { BINANCE: 'BINANCE', CTRADER: 'CTRADER', IBKR: 'IBKR', MT5: 'MANUAL', MANUAL: 'MANUAL' }

function sampleTrades(account, count, seed, { avgUsd = 60, winRate = 0.58, maxDaysAgo = 80 } = {}){
  const rand = seeded(seed)
  const symbols = SYMBOLS[account.category]
  const rate = SAMPLE_RATES[account.currency] ?? 1
  const trades = []
  for(let i = 0; i < count; i++){
    const [symbol, price] = symbols[Math.floor(rand() * symbols.length)]
    const win = rand() < winRate
    const usd = Math.round((win ? 1 : -0.85) * avgUsd * (0.3 + rand() * 1.4) * 100) / 100
    const closedDaysAgo = Math.floor(rand() * maxDaysAgo)
    const closedAt = daysAgo(closedDaysAgo, 8 + Math.floor(rand() * 10))
    const openedAt = new Date(new Date(closedAt).getTime() - (20 + rand() * 300) * 60e3).toISOString()
    const direction = rand() < 0.55 ? 'LONG' : 'SHORT'
    const move = price * (0.001 + rand() * 0.004) * (win === (direction === 'LONG') ? 1 : -1)
    trades.push({
      id: `${account.id}-t${i}`,
      accountId: account.id,
      symbol,
      direction,
      broker: account.broker,
      lotSize: account.category === 'STOCKS' ? Math.ceil(rand() * 20) : Math.round((0.05 + rand() * 0.95) * 100) / 100,
      entryPrice: price,
      exitPrice: Math.round((price + move) * 1e5) / 1e5,
      pnl: Math.round(usd * rate * 100) / 100,
      pnlCurrency: account.currency,
      pnlUsd: usd,
      openedAt,
      closedAt,
      source: SOURCE[account.provider],
      notes: null,
    })
  }
  return trades.sort((a, b) => b.closedAt.localeCompare(a.closedAt))
}

// --- Initial sample state: the owner's real setup from D-12, with made-up numbers ---

const ACCOUNTS = [
  {
    id: 'acc-binance', provider: 'BINANCE', broker: 'Binance', style: 'DAY',
    category: 'CRYPTO', currency: 'USD', accountNumber: '4471',
    status: 'OK', lastSyncedAt: new Date(now - 4 * 60e3).toISOString(), lastError: null,
    credentialHint: 'Key ending …a3F9', openingBalanceUsd: 2600, openingDate: daysAgo(90),
    // USDⓈ-M Futures (D-12): positions with floating P&L, sizes in coin quantity.
    positions: {
      kind: 'POSITIONS', items: [
        { symbol: 'BTCUSDT', direction: 'LONG', lotSize: 0.015, entryPrice: 67240, currentPrice: 68120, floatingUsd: 13.2 },
        { symbol: 'ETHUSDT', direction: 'SHORT', lotSize: 0.4, entryPrice: 3388, currentPrice: 3402, floatingUsd: -5.6 },
      ],
    },
    createdAt: daysAgo(90), archivedAt: null,
  },
  {
    id: 'acc-pepperstone', provider: 'CTRADER', broker: 'Pepperstone', style: 'SWING',
    category: 'FOREX', currency: 'USD', accountNumber: '8820',
    status: 'ERROR', lastSyncedAt: new Date(now - 3 * 3600e3).toISOString(),
    lastError: 'cTrader rejected the access token (expired). Reconnect to resume syncing.',
    credentialHint: 'Connected via cTrader ID', openingBalanceUsd: 5000, openingDate: daysAgo(90),
    positions: {
      kind: 'POSITIONS', items: [
        { symbol: 'EURUSD', direction: 'LONG', lotSize: 0.5, entryPrice: 1.0812, currentPrice: 1.0839, floatingUsd: 135 },
        { symbol: 'XAUUSD', direction: 'SHORT', lotSize: 0.1, entryPrice: 2641.2, currentPrice: 2652.7, floatingUsd: -115 },
      ],
    },
    createdAt: daysAgo(90), archivedAt: null,
  },
  {
    id: 'acc-exness-bot', provider: 'MT5', broker: 'Exness', style: 'BOT',
    category: 'FOREX', currency: 'USD', accountNumber: '1093',
    status: 'MANUAL', lastSyncedAt: null, lastError: null, credentialHint: null,
    openingBalanceUsd: 2000, openingDate: daysAgo(90), positions: null,
    createdAt: daysAgo(90), archivedAt: null,
  },
  {
    id: 'acc-exness-manual', provider: 'MT5', broker: 'Exness', style: 'SWING',
    category: 'FOREX', currency: 'USD', accountNumber: '5512',
    status: 'MANUAL', lastSyncedAt: null, lastError: null, credentialHint: null,
    openingBalanceUsd: 750, openingDate: daysAgo(90), positions: null,
    createdAt: daysAgo(90), archivedAt: null,
  },
  {
    id: 'acc-fpmarkets', provider: 'MT5', broker: 'FP Markets', style: 'SCALPING',
    category: 'FOREX', currency: 'ZAR', accountNumber: '3307',
    status: 'MANUAL', lastSyncedAt: null, lastError: null, credentialHint: null,
    openingBalanceUsd: 1100, openingDate: daysAgo(90), positions: null,
    createdAt: daysAgo(90), archivedAt: null,
  },
  {
    id: 'acc-ibkr', provider: 'IBKR', broker: 'IBKR', style: 'LONG_TERM',
    category: 'STOCKS', currency: 'USD', accountNumber: '7702',
    status: 'OK', lastSyncedAt: new Date(now - 9 * 3600e3).toISOString(), lastError: null,
    credentialHint: 'Token ending …0Q7 · expires in 241 days', openingBalanceUsd: 11200, openingDate: daysAgo(90),
    positions: {
      kind: 'HOLDINGS', items: [
        { symbol: 'VOO', quantity: 14, valueUsd: 7280, unrealisedUsd: 612 },
        { symbol: 'MSFT', quantity: 6, valueUsd: 2490, unrealisedUsd: 188 },
        { symbol: 'NVDA', quantity: 12, valueUsd: 1620, unrealisedUsd: -94 },
      ],
    },
    createdAt: daysAgo(90), archivedAt: null,
  },
]

const TRADES = [
  ...sampleTrades(ACCOUNTS[0], 22, 11, { avgUsd: 45 }),
  ...sampleTrades(ACCOUNTS[1], 30, 22, { avgUsd: 70 }),
  ...sampleTrades(ACCOUNTS[2], 60, 33, { avgUsd: 18, winRate: 0.64 }),
  ...sampleTrades(ACCOUNTS[3], 9, 44, { avgUsd: 40 }),
  ...sampleTrades(ACCOUNTS[4], 14, 55, { avgUsd: 25 }),
  ...sampleTrades(ACCOUNTS[5], 5, 66, { avgUsd: 120, winRate: 0.8 }),
]

// type: DEPOSIT | WITHDRAWAL | ADJUSTMENT. amountUsd is signed (withdrawals negative).
// origin: SYNCED (imported from the broker) or MANUAL (typed by the user).
const CASH = [
  { id: 'c1', accountId: 'acc-binance', type: 'DEPOSIT', amountUsd: 500, date: daysAgo(41), note: null, origin: 'SYNCED' },
  { id: 'c2', accountId: 'acc-pepperstone', type: 'WITHDRAWAL', amountUsd: -400, date: daysAgo(18), note: null, origin: 'SYNCED' },
  { id: 'c3', accountId: 'acc-exness-bot', type: 'DEPOSIT', amountUsd: 300, date: daysAgo(55), note: 'Top-up for bot margin', origin: 'MANUAL' },
  { id: 'c4', accountId: 'acc-fpmarkets', type: 'WITHDRAWAL', amountUsd: -150, date: daysAgo(12), note: 'To FNB', origin: 'MANUAL' },
  { id: 'c5', accountId: 'acc-ibkr', type: 'DEPOSIT', amountUsd: 1000, date: daysAgo(30), note: null, origin: 'SYNCED' },
]

// --- Store: a tiny external store, read with useSyncExternalStore ---

let state = { accounts: ACCOUNTS, trades: TRADES, cash: CASH }
const listeners = new Set()
const setState = updater => {
  state = updater(state)
  listeners.forEach(listener => listener())
}
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener) }

export function useAccountsPreview(){
  return useSyncExternalStore(subscribe, () => state)
}

let nextId = 1
const newId = prefix => `${prefix}-new${nextId++}`

export const previewActions = {
  // draft: { provider, broker, style, category, currency, accountNumber, openingBalanceUsd, credentialHint }
  addAccount(draft){
    const id = newId('acc')
    const auto = PROVIDERS[draft.provider].sync === 'auto'
    const account = {
      id,
      ...draft,
      status: auto ? 'OK' : 'MANUAL',
      lastSyncedAt: auto ? new Date().toISOString() : null,
      lastError: null,
      openingDate: auto ? daysAgo(60) : new Date().toISOString(),
      positions: auto ? { kind: draft.provider === 'IBKR' ? 'HOLDINGS' : 'POSITIONS', items: [] } : null,
      createdAt: new Date().toISOString(),
      archivedAt: null,
    }
    // An automatic account "imports" some history on its first sync.
    const imported = auto ? sampleTrades(account, 12, nextId * 101, { avgUsd: 40, maxDaysAgo: 55 }) : []
    setState(s => ({ ...s, accounts: [...s.accounts, account], trades: [...s.trades, ...imported] }))
    return { id, importedTrades: imported.length }
  },
  updateAccount(id, patch){
    setState(s => ({ ...s, accounts: s.accounts.map(a => (a.id === id ? { ...a, ...patch } : a)) }))
  },
  // D-18: archive wipes credentials and stops sync; trades stay.
  archiveAccount(id){
    previewActions.updateAccount(id, { archivedAt: new Date().toISOString(), credentialHint: null })
  },
  // A restored automatic account has no credentials any more, so it needs reconnecting.
  restoreAccount(id){
    const account = state.accounts.find(a => a.id === id)
    previewActions.updateAccount(id, {
      archivedAt: null,
      status: account && isAutoSync(account) ? 'RECONNECT' : account?.status,
      lastError: account && isAutoSync(account) ? 'Credentials were removed when this account was archived.' : null,
    })
  },
  // D-18: delete removes the account and everything belonging to it.
  deleteAccount(id){
    setState(s => ({
      accounts: s.accounts.filter(a => a.id !== id),
      trades: s.trades.filter(t => t.accountId !== id),
      cash: s.cash.filter(c => c.accountId !== id),
    }))
  },
  reconnect(id){
    previewActions.updateAccount(id, {
      status: 'OK', lastError: null, lastSyncedAt: new Date().toISOString(), credentialHint: 'Key ending …new1',
    })
  },
  syncNow(id){
    previewActions.updateAccount(id, { lastSyncedAt: new Date().toISOString() })
  },
  // entry: { accountId, type, amountUsd (signed), date, note }
  addCash(entry){
    setState(s => ({ ...s, cash: [...s.cash, { id: newId('c'), origin: 'MANUAL', ...entry }] }))
  },
  // D-19: "Correct balance" records the difference as a visible adjustment.
  correctBalance(accountId, targetUsd, note){
    const difference = Math.round((targetUsd - balanceUsd(state, accountId)) * 100) / 100
    if(difference === 0) return 0
    previewActions.addCash({ accountId, type: 'ADJUSTMENT', amountUsd: difference, date: new Date().toISOString(), note })
    return difference
  },
}

// --- Calculations ---

const tradesOf = (s, accountId) => s.trades.filter(t => t.accountId === accountId)
const cashOf = (s, accountId) => s.cash.filter(c => c.accountId === accountId)

// Balance at a point in time from the account's ledger (D-19).
function ledgerBalance(s, account, at = Infinity){
  const start = new Date(account.openingDate).getTime()
  let total = account.openingBalanceUsd ?? 0
  for(const t of tradesOf(s, account.id)){
    const closed = new Date(t.closedAt).getTime()
    if(closed >= start && closed <= at) total += t.pnlUsd
  }
  for(const c of cashOf(s, account.id)){
    const when = new Date(c.date).getTime()
    if(when >= start && when <= at) total += c.amountUsd
  }
  return total
}

export function balanceUsd(s, accountId){
  const account = s.accounts.find(a => a.id === accountId)
  return account ? ledgerBalance(s, account) : 0
}

export function floatingUsd(account){
  if(!account.positions) return 0
  return account.positions.items.reduce((sum, p) => sum + (p.floatingUsd ?? p.unrealisedUsd ?? 0), 0)
}

export function accountFigures(s, account){
  const balance = ledgerBalance(s, account)
  const floating = floatingUsd(account)
  const cash = cashOf(s, account.id)
  const deposits = cash.filter(c => c.type === 'DEPOSIT').reduce((sum, c) => sum + c.amountUsd, 0)
  const withdrawals = cash.filter(c => c.type === 'WITHDRAWAL').reduce((sum, c) => sum + c.amountUsd, 0)
  const adjustments = cash.filter(c => c.type === 'ADJUSTMENT').reduce((sum, c) => sum + c.amountUsd, 0)
  const start = new Date(account.openingDate).getTime()
  const tradePnl = tradesOf(s, account.id)
    .filter(t => new Date(t.closedAt).getTime() >= start)
    .reduce((sum, t) => sum + t.pnlUsd, 0)
  // This calendar month's closed-trade P&L, for the card (D-47). Cash movements are
  // left out on purpose: a deposit isn't performance (D-27).
  const today = new Date()
  const month = accountMonth(s, account.id, { year: today.getFullYear(), month: today.getMonth() + 1 }).summary
  return {
    balance, floating, equity: balance + floating,
    opening: account.openingBalanceUsd ?? 0, tradePnl, deposits, withdrawals, adjustments,
    month,
  }
}

export const activeAccounts = s => s.accounts.filter(a => !a.archivedAt)
export const archivedAccounts = s => s.accounts.filter(a => a.archivedAt)

export function netWorthUsd(s){
  return activeAccounts(s).reduce((sum, a) => sum + accountFigures(s, a).equity, 0)
}

export function accountTrades(s, accountId){
  return tradesOf(s, accountId).sort((a, b) => b.closedAt.localeCompare(a.closedAt))
}

export function accountCash(s, accountId){
  return cashOf(s, accountId).sort((a, b) => b.date.localeCompare(a.date))
}

// Month summary and calendar for one account, shaped like the real API responses
// so the existing PnlCard, WinRateCard and CalendarGrid render them unchanged.
export function accountMonth(s, accountId, { year, month }){
  const inMonth = tradesOf(s, accountId).filter(t => {
    const d = new Date(t.closedAt)
    return d.getFullYear() === year && d.getMonth() + 1 === month
  })
  const totalPnl = inMonth.reduce((sum, t) => sum + t.pnlUsd, 0)
  const wins = inMonth.filter(t => t.pnlUsd > 0).length
  const days = {}
  for(const t of inMonth){
    const day = new Date(t.closedAt).getDate()
    days[day] = (days[day] ?? 0) + t.pnlUsd
  }
  return {
    summary: { totalPnl, totalTrades: inMonth.length, wins, winRate: inMonth.length ? (wins / inMonth.length) * 100 : 0 },
    days,
  }
}

// One equity point per day over the last `days` days. Cash movements show as steps,
// which is exactly why D-27 tracks them. Synced accounts get a little day-to-day
// wobble standing in for floating P&L, ending on today's real equity.
export function equitySeries(s, account, days = 90){
  const rand = seeded(account.id.length * 7919)
  const floating = floatingUsd(account)
  const cash = cashOf(s, account.id)
  const created = new Date(account.openingDate).getTime()
  const points = []
  for(let d = days; d >= 0; d--){
    const end = new Date(now - d * DAY)
    end.setHours(23, 59, 59, 999)
    if(end.getTime() < created) continue
    const wobble = isAutoSync(account) && d > 0 ? (rand() - 0.5) * Math.abs(floating || 80) * 1.5 : 0
    const value = ledgerBalance(s, account, end.getTime()) + (d === 0 ? floating : wobble)
    const dayKey = end.toDateString()
    const movements = cash.filter(c => new Date(c.date).toDateString() === dayKey)
    points.push({ date: end.toISOString(), value, movements })
  }
  return points
}
