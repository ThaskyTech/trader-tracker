const API_URL = import.meta.env.VITE_API_URL

async function request(endpoint, options = {}){
    const token = localStorage.getItem('accessToken') //rEVISIT FOR LONG TERM!!
    const headers = {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers
    }
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers
    })
    const data = await response.json()

    if(!response.ok){ throw new Error(data.error || 'Something went wrong.')}

    return data
}

export const api = {
    get: (endpoint) => request(endpoint, { method: 'GET'}),
    post: (endpoint, body) => request(endpoint, { method: 'POST', body: JSON.stringify(body)}),
    put: (endpoint, body) => request(endpoint, { method: 'PUT', body: JSON.stringify(body)}),
    delete: (endpoint) => request(endpoint, { method: 'DELETE'})
}

export const tradeApi = {
    getMonthlySummary: (year, month) =>  api.get(`/trades/summary/month${year && month ? `?year={year}&month={month}` : ''}`),
    getCalendarSummary: (year, month) => api.get(`/trades/summary/calendar${year && month ? `?year=${year}&month=${month}` : ''}`),
    getHostorySummary: () => api.get('/trades/summary/history'),
    getTradesByDay: (data) => api.get(`/trades/day/${data}`),
    getAllTrades: () => api.get('/trades'),
    createTrade: (TRADEdATA) => api.post('/trades', tradeData)
}
