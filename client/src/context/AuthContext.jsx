import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { api, tokenStore, setSessionExpiredHandler } from '../api/client'

const AuthContext = createContext(null)

// Read the saved session synchronously on the first render. The old version did
// this in a useEffect, so ProtectedRoute saw "no user" on the first render and
// redirected to /login on every page refresh.
function readStoredUser(){
    const storedUser = localStorage.getItem('user')
    if(!storedUser || !tokenStore.getRefresh()) return null
    try {
        return JSON.parse(storedUser)
    } catch {
        tokenStore.clear()
        return null
    }
}

export function AuthProvider({children}){
    const [user, setUser] = useState(readStoredUser)

    // When the API layer can't refresh the session, drop the user. ProtectedRoute
    // then sends them to /login.
    useEffect(() => {
        setSessionExpiredHandler(() => setUser(null))
        return () => setSessionExpiredHandler(() => {})
    }, [])

    const login = async (email, password) =>{
        const data = await api.post('/auth/login', {email, password})
        tokenStore.setSession(data)
        setUser(data.user)
        return data
    }

    const signup = async (email, username, password)=>{
        const data = await api.post('/auth/signup', {email, username, password})
        tokenStore.setSession(data)
        setUser(data.user)
        return data
    }

    const logout = async () =>{
        const refreshToken = tokenStore.getRefresh()
        try {
            if (refreshToken) {
                await api.post('/auth/logout', {refreshToken})
            }
        } catch (err){
            console.error('logout error (logging out locally anyway):', err)
        }
        tokenStore.clear()
        setUser(null)
    }

    // Replace the stored user after the server returns a fresh copy, e.g. after
    // changing the display currency. useCallback keeps it stable for effect deps.
    const updateUser = useCallback((nextUser) => {
        tokenStore.setUser(nextUser)
        setUser(nextUser)
    }, [])

    return (<AuthContext.Provider value = {{user, login, signup, logout, updateUser}}>{children}</AuthContext.Provider>)
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(){return useContext(AuthContext)}
