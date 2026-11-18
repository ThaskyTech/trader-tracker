// The currencies a P&L can be entered in and displayed in.
// Keep in sync with the Currency enum in prisma/schema.prisma and client/src/utils/currency.js.
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'ZAR']

// Every amount is stored in USD, so rates are "units of X per 1 USD".
export const BASE_CURRENCY = 'USD'
