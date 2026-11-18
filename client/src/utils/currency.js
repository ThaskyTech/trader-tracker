// The currencies a P&L can be entered in and displayed in.
// Keep in sync with server/src/utils/currency.js and the Currency enum in the Prisma schema.
export const CURRENCIES = [
  { code: 'USD', symbol: '$', decimals: 2 },
  { code: 'EUR', symbol: '€', decimals: 2 },
  { code: 'GBP', symbol: '£', decimals: 2 },
  { code: 'JPY', symbol: '¥', decimals: 0 },
  { code: 'AUD', symbol: 'A$', decimals: 2 },
  { code: 'ZAR', symbol: 'R', decimals: 2 },
]

export const CURRENCY_CODES = CURRENCIES.map(c => c.code)
const BY_CODE = Object.fromEntries(CURRENCIES.map(c => [c.code, c]))

export const currencySymbol = code => BY_CODE[code]?.symbol ?? code

// Short form for tight spaces like calendar cells: 12345 -> '12.3K', 1234567 -> '1.2M', 845.9 -> '845'.
// Truncates rather than rounds, so a cell never overstates a profit or a loss.
function compactNumber(abs){
  if(abs >= 1e6) return `${(Math.floor(abs / 1e5) / 10).toFixed(1)}M`
  if(abs >= 1e3) return `${(Math.floor(abs / 100) / 10).toFixed(1)}K`
  return String(Math.floor(abs))
}

// formatMoney(1250.5, 'ZAR')                    -> 'R1,250.50'
// formatMoney(-1250.5, 'ZAR', { signed: true })  -> '-R1,250.50'  (signed also adds '+' to gains)
// formatMoney(12345, 'ZAR', { compact: true })   -> 'R12.3K'
export function formatMoney(amount, code, { signed = false, compact = false } = {}){
  const { symbol, decimals } = BY_CODE[code] ?? { symbol: `${code} `, decimals: 2 }
  const number = compact
    ? compactNumber(Math.abs(amount))
    : Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  const sign = amount < 0 ? '-' : signed ? '+' : ''
  return `${sign}${symbol}${number}`
}

// Converts a USD amount using rates of "units per 1 USD" ({ ZAR: 16.93, ... }).
// Returns null if the rate isn't known yet.
export function fromUsd(usd, code, rates){
  if(code === 'USD') return usd
  const rate = rates?.[code]
  return rate ? usd * rate : null
}
