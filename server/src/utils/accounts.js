// Account rules shared by the validators and controllers. The client mirrors these in
// client/src/utils/accounts.js for instant feedback; the server is authoritative (D-32).

export const PROVIDERS = ['BINANCE', 'CTRADER', 'IBKR', 'MT5', 'MANUAL']
export const CATEGORIES = ['CRYPTO', 'FOREX', 'STOCKS']
export const STYLES = ['BOT', 'SCALPING', 'DAY', 'SWING', 'LONG_TERM']

// What can be added today. Binance, cTrader and IBKR need their sync adapters first
// (roadmap 7-8), so creating one would give an account that can never update.
export const CREATABLE_PROVIDERS = ['MT5', 'MANUAL']

const STYLE_LABELS = { BOT: 'Bot', SCALPING: 'Scalping', DAY: 'Day trading', SWING: 'Swing', LONG_TERM: 'Long-term' }

const sameSlot = (a, b) =>
    a.broker.trim().toLowerCase() === b.broker.trim().toLowerCase() && a.style === b.style

// D-47: two accounts with the same broker and style must both carry a different last-4
// account number, or their titles ("Exness · Swing") couldn't be told apart.
// `others` is every other account the user has, archived ones included: they still
// appear by title in the archived list and in History.
// Returns an error message, or null if the candidate is fine.
export function titleClashError(candidate, others){
    const clashes = others.filter(a => a.id !== candidate.id && sameSlot(a, candidate))
    if(clashes.length === 0) return null
    const label = `${candidate.broker.trim()} · ${STYLE_LABELS[candidate.style] ?? 'no style'}`
    if(!candidate.accountNumber) return `You already have a ${label} account. Add the last 4 digits of this one's account number to tell them apart.`
    if(clashes.some(a => a.accountNumber === candidate.accountNumber)) return `Your other ${label} account also ends in ${candidate.accountNumber}.`
    return null
}
