import { createContext, useContext, useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from './AuthContext'
import { formatMoney, fromUsd } from '../utils/currency'

// The "presentation mask": every amount comes from the server in USD, and this
// context shows it in the user's chosen display currency at today's rate.
const CurrencyContext = createContext(null)

// The last rates are kept in this browser, so amounts show in the right currency
// straight away on the next visit instead of flashing USD first.
const RATES_KEY = 'fxRates'
function readCachedRates(){
  try { return JSON.parse(localStorage.getItem(RATES_KEY)) } catch { return null }
}

export function CurrencyProvider({ children }) {
  const { user, updateUser } = useAuth()
  const [rates, setRates] = useState(readCachedRates)
  const userId = user?.id

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    api.get('/fx/rates')
      .then(data => {
        if (cancelled) return
        setRates(data.rates)
        try { localStorage.setItem(RATES_KEY, JSON.stringify(data.rates)) } catch { /* storage unavailable */ }
      })
      .catch(err => console.error('Could not load exchange rates:', err.message))

    // Pick up preferences changed on another device (and fill in displayCurrency
    // for sessions saved before it existed).
    api.get('/users/me')
      .then(data => { if (!cancelled) updateUser(data.user) })
      .catch(err => console.error('Could not refresh user:', err.message))

    return () => { cancelled = true }
  }, [userId, updateUser])

  const displayCurrency = user?.displayCurrency ?? 'USD'
  const ratesReady = displayCurrency === 'USD' || Boolean(rates?.[displayCurrency])

  // Show a USD amount in the display currency. Until rates load, it shows USD
  // rather than a wrong number.
  const formatUsd = (usd, options) => {
    const converted = fromUsd(usd, displayCurrency, rates)
    return converted === null ? formatMoney(usd, 'USD', options) : formatMoney(converted, displayCurrency, options)
  }

  // A trade's P&L. If it was entered in the display currency, show exactly what was
  // typed; otherwise convert its USD value. This way a trade entered as R1,250 still
  // reads R1,250, not R1,248.91 because the rand moved since it closed.
  const formatTradePnl = (trade, options) =>
    trade.pnlCurrency === displayCurrency
      ? formatMoney(trade.pnl, trade.pnlCurrency, options)
      : formatUsd(trade.pnlUsd, options)

  const setDisplayCurrency = async (code) => {
    const data = await api.patch('/users/me', { displayCurrency: code })
    updateUser(data.user)
  }

  return (
    <CurrencyContext.Provider value={{ displayCurrency, rates, ratesReady, formatUsd, formatTradePnl, setDisplayCurrency }}>
      {children}
    </CurrencyContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCurrency(){ return useContext(CurrencyContext) }
