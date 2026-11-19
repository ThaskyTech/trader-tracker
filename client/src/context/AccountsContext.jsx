import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { io } from 'socket.io-client'
import { API_URL, accountApi, refreshAccessToken, tokenStore } from '../api/client'
import { useAuth } from './AuthContext'
import { accountTitle, isAutoSync } from '../utils/accounts'

// The user's accounts, loaded once after login and shared by every screen that needs
// them: the Accounts tab, account pages, the trade form's picker, History's account
// chip and trade-card titles, and Home's net worth. Screens call refresh() after a
// change (a new trade, a deposit, an archive) so balances everywhere stay current.
//
// Live updates (D-10, D-66): a socket to the server, which says "accounts:changed"
// after each broker sync. The list is then refetched, and `syncVersion` goes up so
// screens with their own data (Home's trades, an account page) reload it too. The
// socket carries no data itself: everything still comes through the API.
const AccountsContext = createContext(null)

// The socket lives on the API's server, at its root rather than under /api.
const socketOrigin = () => new URL(API_URL, window.location.href).origin

export function AccountsProvider({ children }) {
  const { user } = useAuth()
  const userId = user?.id
  // { userId, accounts } so a previous user's accounts are never shown after a switch.
  const [loaded, setLoaded] = useState(null)
  const [error, setError] = useState(null)
  const [connection, setConnection] = useState({ userId: null, live: false, syncVersion: 0 })

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

  useEffect(() => {
    if (!userId) return
    // auth is a function so every reconnect sends the newest access token.
    const socket = io(socketOrigin(), { auth: send => send({ token: tokenStore.getAccess() }) })
    const changed = () => {
      refresh()
      setConnection(c => ({ ...c, syncVersion: c.syncVersion + 1 }))
    }
    let connectedBefore = false
    let retriedAuth = false

    socket.on('connect', () => {
      setConnection(c => ({ ...c, userId, live: true }))
      retriedAuth = false
      // Back after a drop (a phone waking up): anything pushed meanwhile was missed.
      if (connectedBefore) changed()
      connectedBefore = true
    })
    socket.on('disconnect', () => setConnection(c => ({ ...c, live: false })))
    socket.on('connect_error', async err => {
      setConnection(c => ({ ...c, live: false }))
      // The token is checked only at the handshake, and access tokens last 15 minutes.
      // A refused handshake isn't retried automatically, so refresh the token and retry once.
      if (err.message === 'unauthorized' && !retriedAuth) {
        retriedAuth = true
        if (await refreshAccessToken()) socket.connect()
      }
    })
    socket.on('accounts:changed', changed)
    return () => { socket.disconnect() }
  }, [userId, refresh])

  const value = useMemo(() => {
    // Logged out, userId and loaded?.userId are both undefined, so check loaded itself
    // too: comparing ids alone crashed every logged-out page, the login page included.
    const accounts = loaded && userId && loaded.userId === userId ? loaded.accounts : null
    // Titles need every account: the "#5512" suffix depends on the others (D-47).
    const titleOf = account => accountTitle(account, accounts ?? [])
    const byId = new Map((accounts ?? []).map(a => [a.id, a]))
    const active = accounts?.filter(a => !a.archivedAt) ?? []
    const mine = Boolean(userId) && connection.userId === userId
    return {
      accounts,                       // null while loading
      active,
      archived: accounts?.filter(a => a.archivedAt) ?? [],
      // Connected accounts that update on their own (the LIVE dot and sync status need one).
      synced: active.filter(a => isAutoSync(a) && a.hasCredentials),
      error,
      refresh,
      titleOf,
      byId: id => byId.get(id) ?? null,
      live: mine && connection.live,
      syncVersion: mine ? connection.syncVersion : 0,
    }
  }, [loaded, userId, error, refresh, connection])

  return <AccountsContext.Provider value={value}>{children}</AccountsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAccounts(){ return useContext(AccountsContext) }

// Net worth = total equity of accounts that aren't archived (D-02, D-18).
// eslint-disable-next-line react-refresh/only-export-components
export const netWorthOf = accounts => accounts.reduce((sum, a) => sum + a.figures.equity, 0)
