import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { api, tokenStore, setSessionExpiredHandler, refreshAccessToken } from '../api/client'

const AuthContext = createContext(null)

// D-68: a sign-in that isn't "kept" ends after an hour without use. The server enforces
// it too (the refresh token's expiry); this side catches a tab left open, which live
// updates would otherwise keep refreshing.
const IDLE_MS = 60 * 60 * 1000
const CHECK_EVERY_MS = 60 * 1000
const isIdle = () => !tokenStore.isRemembered() && Date.now() - tokenStore.getLastActivity() > IDLE_MS

// Read the saved session synchronously on the first render. The old version did
// this in a useEffect, so ProtectedRoute saw "no user" on the first render and
// redirected to /login on every page refresh.
// A session that has sat unused past the idle limit is dropped here, before any page
// (and any figure) is shown.
function readStoredUser(){
    const storedUser = localStorage.getItem('user')
    if(!storedUser || !tokenStore.getRefresh()) return null
    if(isIdle()){
        // The server token has expired too, or will be refused; forget it locally.
        tokenStore.clear()
        return null
    }
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

    // remember: "Keep me signed in on this device" (D-68).
    const login = async (email, password, remember = false) =>{
        const data = await api.post('/auth/login', {email, password, remember})
        tokenStore.setSession(data, remember)
        setUser(data.user)
        return data
    }

    const signup = async (email, username, password)=>{
        const data = await api.post('/auth/signup', {email, username, password})
        tokenStore.setSession(data)
        setUser(data.user)
        return data
    }

    const logout = useCallback(async () =>{
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
    }, [])

    // Idle sign-out (D-68), only for sessions that aren't kept. Any tap, key or scroll
    // counts as use (written at most every 30 s); the check runs every minute and when
    // the tab comes back into view, so a phone woken hours later signs out at once
    // instead of showing the figures first.
    useEffect(() => {
        if(!user || tokenStore.isRemembered()) return
        let lastWrite = 0
        const onUse = () => {
            if(Date.now() - lastWrite < 30_000) return
            lastWrite = Date.now()
            tokenStore.touch()
        }
        const check = () => { if(isIdle()) logout() }
        const onVisible = () => { if(document.visibilityState === 'visible') check() }
        const events = ['pointerdown', 'keydown', 'scroll', 'touchstart']
        for(const name of events) window.addEventListener(name, onUse, { passive: true, capture: true })
        document.addEventListener('visibilitychange', onVisible)
        const timer = setInterval(check, CHECK_EVERY_MS)
        return () => {
            for(const name of events) window.removeEventListener(name, onUse, { capture: true })
            document.removeEventListener('visibilitychange', onVisible)
            clearInterval(timer)
        }
    }, [user, logout])

    // Replace the stored user after the server returns a fresh copy, e.g. after
    // changing the display currency. useCallback keeps it stable for effect deps.
    const updateUser = useCallback((nextUser) => {
        tokenStore.setUser(nextUser)
        setUser(nextUser)
    }, [])

    // After the email is verified (D-70): a fresh access token (it carries the verified
    // flag the server checks), then the fresh profile, which opens the app.
    // Returns whether the user is now verified.
    const refreshVerification = useCallback(async () => {
        const { user: fresh } = await api.get('/users/me')
        if(fresh.emailVerifiedAt) await refreshAccessToken()
        updateUser(fresh)
        return Boolean(fresh.emailVerifiedAt)
    }, [updateUser])

    return (<AuthContext.Provider value = {{user, login, signup, logout, updateUser, refreshVerification}}>{children}</AuthContext.Provider>)
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(){return useContext(AuthContext)}

// D-70. Only an explicit null counts: a user saved in the browser before verification
// existed has no field at all, and is checked when /users/me answers rather than being
// shown the verify screen by mistake.
// eslint-disable-next-line react-refresh/only-export-components
export const isUnverified = user => user?.emailVerifiedAt === null
