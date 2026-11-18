import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { accountApi } from '../api/client'
import { useAuth } from './AuthContext'
import { accountTitle } from '../utils/accounts'

// The user's accounts, loaded once after login and shared by every screen that needs
// them: the Accounts tab, account pages, the trade form's picker, History's account
// chip and trade-card titles, and Home's net worth. Screens call refresh() after a
// change (a new trade, a deposit, an archive) so balances everywhere stay current.
const AccountsContext = createContext(null)

export function AccountsProvider({ children }) {
  const { user } = useAuth()
  const userId = user?.id
  // { userId, accounts } so a previous user's accounts are never shown after a switch.
  const [loaded, setLoaded] = useState(null)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    if (!userId) return
    try {
      const { accounts } = await accountApi.list()
      setLoaded({ userId, accounts })
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }, [userId])

  // First load after login (and after switching user). The cancel flag stops a slow
  // response for a previous user from landing after a switch.
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    accountApi.list()
      .then(({ accounts }) => { if (!cancelled) { setLoaded({ userId, accounts }); setError(null) } })
      .catch(err => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [userId])

  const value = useMemo(() => {
    const accounts = loaded?.userId === userId ? loaded.accounts : null
    // Titles need every account: the "#5512" suffix depends on the others (D-47).
    const titleOf = account => accountTitle(account, accounts ?? [])
    const byId = new Map((accounts ?? []).map(a => [a.id, a]))
    return {
      accounts,                       // null while loading
      active: accounts?.filter(a => !a.archivedAt) ?? [],
      archived: accounts?.filter(a => a.archivedAt) ?? [],
      error,
      refresh,
      titleOf,
      byId: id => byId.get(id) ?? null,
    }
  }, [loaded, userId, error, refresh])

  return <AccountsContext.Provider value={value}>{children}</AccountsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAccounts(){ return useContext(AccountsContext) }

// Net worth = total equity of accounts that aren't archived (D-02, D-18).
// eslint-disable-next-line react-refresh/only-export-components
export const netWorthOf = accounts => accounts.reduce((sum, a) => sum + a.figures.equity, 0)
