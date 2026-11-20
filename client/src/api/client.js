export const API_URL = import.meta.env.VITE_API_URL

// Tokens live in localStorage. That is fine for this app: the frontend and backend
// are on different domains, which makes httpOnly cookies unreliable (Safari blocks
// third-party cookies).
// `remember` is "Keep me signed in on this device" (D-68); `lastActivity` is when the
// user last touched the app, for signing out an unused tab after an hour.
export const tokenStore = {
    getAccess: () => localStorage.getItem('accessToken'),
    getRefresh: () => localStorage.getItem('refreshToken'),
    setAccess: (token) => localStorage.setItem('accessToken', token),
    setUser: (user) => localStorage.setItem('user', JSON.stringify(user)),
    isRemembered: () => localStorage.getItem('rememberDevice') === 'true',
    getLastActivity: () => Number(localStorage.getItem('lastActivity')) || 0,
    touch: () => localStorage.setItem('lastActivity', String(Date.now())),
    setSession: ({ accessToken, refreshToken, user }, remember = false) => {
        localStorage.setItem('accessToken', accessToken)
        localStorage.setItem('refreshToken', refreshToken)
        localStorage.setItem('user', JSON.stringify(user))
        localStorage.setItem('rememberDevice', String(remember))
        localStorage.setItem('lastActivity', String(Date.now()))
    },
    clear: () => {
        for(const key of ['accessToken', 'refreshToken', 'user', 'rememberDevice', 'lastActivity']) localStorage.removeItem(key)
    }
}

// AuthContext registers a callback here so the API layer can log the user out
// when the session can't be refreshed, without importing React code.
let onSessionExpired = () => {}
export function setSessionExpiredHandler(handler){ onSessionExpired = handler }

// Endpoints where a 401 means "wrong credentials", not "access token expired".
const NO_REFRESH_ENDPOINTS = ['/auth/login', '/auth/signup', '/auth/refresh', '/auth/logout', '/auth/verify-email']

async function parseBody(response){
    // Some responses aren't JSON, such as an HTML 502 page from the host or an
    // empty 204. Don't crash on those.
    const text = await response.text()
    if(!text) return null
    try { return JSON.parse(text) } catch { return { error: text.slice(0, 200) } }
}

// If several requests hit a 401 at once, they all wait on the same refresh call.
let refreshPromise = null

// Exported for the live-updates socket, whose token is checked only when it connects.
export async function refreshAccessToken(){
    const refreshToken = tokenStore.getRefresh()
    if(!refreshToken) return false

    if(!refreshPromise){
        refreshPromise = (async () => {
            try {
                const response = await fetch(`${API_URL}/auth/refresh`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken })
                })
                if(!response.ok) return false
                const data = await parseBody(response)
                if(!data?.accessToken) return false
                tokenStore.setAccess(data.accessToken)
                return true
            } catch {
                return false
            } finally {
                refreshPromise = null
            }
        })()
    }
    return refreshPromise
}

async function request(endpoint, options = {}, isRetry = false){
    const token = tokenStore.getAccess()
    const headers = {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers
    }

    let response
    try {
        response = await fetch(`${API_URL}${endpoint}`, { ...options, headers })
    } catch {
        throw new Error('Cannot reach the server. Check your connection.')
    }

    if(response.status === 401 && !isRetry && !NO_REFRESH_ENDPOINTS.includes(endpoint)){
        const refreshed = await refreshAccessToken()
        if(refreshed) return request(endpoint, options, true)

        tokenStore.clear()
        onSessionExpired()
        throw new Error('Your session has expired. Please log in again.')
    }

    const data = await parseBody(response)

    if(!response.ok){
        const error = new Error(data?.error || `Request failed (${response.status}).`)
        error.status = response.status
        // Validation errors carry per-field messages, e.g. { lotSize: ['Too small'] },
        // so a form can show each one next to its input.
        error.details = data?.details
        throw error
    }

    return data
}

export const api = {
    get: (endpoint) => request(endpoint, { method: 'GET'}),
    post: (endpoint, body) => request(endpoint, { method: 'POST', body: JSON.stringify(body)}),
    put: (endpoint, body) => request(endpoint, { method: 'PUT', body: JSON.stringify(body)}),
    patch: (endpoint, body) => request(endpoint, { method: 'PATCH', body: JSON.stringify(body)}),
    delete: (endpoint) => request(endpoint, { method: 'DELETE'})
}

// Email verification (D-70).
export const authApi = {
    // Public: the token from the emailed link is the proof.
    verifyEmail: (token) => api.post('/auth/verify-email', { token }),
    // -> { sentTo, delivered }; delivered is false when the server has no email set up.
    resendVerification: () => api.post('/auth/resend-verification'),
}

// The browser's IANA timezone, e.g. "Africa/Johannesburg". The server uses it to
// decide which local calendar day and month each trade belongs to.
const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

// { limit: 50, cursor: undefined } -> '?limit=50'. Empty values are left out.
function toQueryString(params){
    const search = new URLSearchParams()
    for(const [key, value] of Object.entries(params)){
        if(value !== undefined && value !== null && value !== '') search.set(key, value)
    }
    const text = search.toString()
    return text ? `?${text}` : ''
}

// For endpoints that group by local day or month, so they need the timezone.
const query = (params) => toQueryString({ tz: timeZone(), ...params })

// accountId is optional on the summaries, day and list calls: set, they cover one
// account (its page, or History/Daily Log filtered to it, D-46).
export const tradeApi = {
    getMonthlySummary: (year, month, accountId) => api.get(`/trades/summary/month${query({ year, month, accountId })}`),
    getCalendarSummary: (year, month, accountId) => api.get(`/trades/summary/calendar${query({ year, month, accountId })}`),
    // filters: { accountId, direction: 'LONG' | 'SHORT', outcome: 'PROFIT' | 'LOSS' }, all optional
    getHistorySummary: (filters = {}) => api.get(`/trades/summary/history${toQueryString(filters)}`),
    // date is 'YYYY-MM-DD'
    getTradesByDay: (date, accountId) => api.get(`/trades/day/${date}${query({ accountId })}`),
    // Newest first. params: { limit, cursor, accountId, direction, outcome }, all optional.
    // Returns { trades, nextCursor }; pass nextCursor back to get the next page.
    listTrades: (params = {}) => api.get(`/trades${toQueryString(params)}`),
    getRecentTrades: (limit, accountId) => api.get(`/trades${toQueryString({ limit, accountId })}`),
    getTrade: (id) => api.get(`/trades/${encodeURIComponent(id)}`),
    createTrade: (tradeData) => api.post('/trades', tradeData),
    updateTrade: (id, tradeData) => api.put(`/trades/${id}`, tradeData),
    deleteTrade: (id) => api.delete(`/trades/${id}`)
}

// Accounts (D-16 to D-19, D-27). Each account comes with `figures` (balance, equity,
// this month's summary...), calculated by the server when read. tz decides "this month".
const accountPath = (id, rest = '') => `/accounts/${encodeURIComponent(id)}${rest}`
export const accountApi = {
    list: () => api.get(`/accounts${query({})}`),
    get: (id) => api.get(accountPath(id, query({}))),
    create: (data) => api.post(`/accounts${query({})}`, data),
    update: (id, changes) => api.patch(accountPath(id, query({})), changes),
    archive: (id) => api.post(accountPath(id, `/archive${query({})}`)),
    restore: (id) => api.post(accountPath(id, `/restore${query({})}`)),
    remove: (id) => api.delete(accountPath(id)),
    listCash: (id) => api.get(accountPath(id, '/cash')),
    // { type: 'DEPOSIT' | 'WITHDRAWAL', amount (positive), currency, occurredAt, note }
    addCash: (id, movement) => api.post(accountPath(id, '/cash'), movement),
    // balance: what the broker shows, in the account's currency (D-19)
    correctBalance: (id, balance) => api.post(accountPath(id, '/balance-correction'), { balance }),
    equity: (id, days = 90) => api.get(accountPath(id, `/equity${query({ days })}`)),
    // Synced accounts (D-64, D-65)
    positions: (id) => api.get(accountPath(id, '/positions')),
    syncNow: (id) => api.post(accountPath(id, `/sync${query({})}`)),
    // { apiKey, apiSecret }: checked by the server before it's saved (D-67)
    replaceKey: (id, credentials) => api.post(accountPath(id, `/credentials${query({})}`), credentials),
}
