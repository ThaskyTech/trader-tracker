const API_URL = import.meta.env.VITE_API_URL

// Tokens live in localStorage. That is fine for this app: the frontend and backend
// are on different domains, which makes httpOnly cookies unreliable (Safari blocks
// third-party cookies).
export const tokenStore = {
    getAccess: () => localStorage.getItem('accessToken'),
    getRefresh: () => localStorage.getItem('refreshToken'),
    setAccess: (token) => localStorage.setItem('accessToken', token),
    setSession: ({ accessToken, refreshToken, user }) => {
        localStorage.setItem('accessToken', accessToken)
        localStorage.setItem('refreshToken', refreshToken)
        localStorage.setItem('user', JSON.stringify(user))
    },
    clear: () => {
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        localStorage.removeItem('user')
    }
}

// AuthContext registers a callback here so the API layer can log the user out
// when the session can't be refreshed, without importing React code.
let onSessionExpired = () => {}
export function setSessionExpiredHandler(handler){ onSessionExpired = handler }

// Endpoints where a 401 means "wrong credentials", not "access token expired".
const NO_REFRESH_ENDPOINTS = ['/auth/login', '/auth/signup', '/auth/refresh', '/auth/logout']

async function parseBody(response){
    // Some responses aren't JSON, such as an HTML 502 page from the host or an
    // empty 204. Don't crash on those.
    const text = await response.text()
    if(!text) return null
    try { return JSON.parse(text) } catch { return { error: text.slice(0, 200) } }
}

// If several requests hit a 401 at once, they all wait on the same refresh call.
let refreshPromise = null

async function refreshAccessToken(){
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

    if(!response.ok){ throw new Error(data?.error || `Request failed (${response.status}).`)}

    return data
}

export const api = {
    get: (endpoint) => request(endpoint, { method: 'GET'}),
    post: (endpoint, body) => request(endpoint, { method: 'POST', body: JSON.stringify(body)}),
    put: (endpoint, body) => request(endpoint, { method: 'PUT', body: JSON.stringify(body)}),
    delete: (endpoint) => request(endpoint, { method: 'DELETE'})
}

function monthQuery(year, month){
    return year && month ? `?year=${year}&month=${month}` : ''
}

export const tradeApi = {
    getMonthlySummary: (year, month) => api.get(`/trades/summary/month${monthQuery(year, month)}`),
    getCalendarSummary: (year, month) => api.get(`/trades/summary/calendar${monthQuery(year, month)}`),
    getHistorySummary: () => api.get('/trades/summary/history'),
    getTradesByDay: (date) => api.get(`/trades/day/${date}`),
    getAllTrades: () => api.get('/trades'),
    createTrade: (tradeData) => api.post('/trades', tradeData),
    updateTrade: (id, tradeData) => api.put(`/trades/${id}`, tradeData),
    deleteTrade: (id) => api.delete(`/trades/${id}`)
}
