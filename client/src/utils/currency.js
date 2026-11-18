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

// formatMoney(1250.5, 'ZAR')                   -> 'R1,250.50'
// formatMoney(-1250.5, 'ZAR', { signed: true }) -> '-R1,250.50'  (signed also adds '+' to gains)
export function formatMoney(amount, code, { signed = false } = {}){
  const { symbol, decimals } = BY_CODE[code] ?? { symbol: `${code} `, decimals: 2 }
  const number = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
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
