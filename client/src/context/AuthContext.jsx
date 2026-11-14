import { createContext, useContext, useState, useEffect } from "react"
import { api } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({children}){
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(null)

    useEffect(()=>{
        const storedUser = localStorage.getItem('user')
        const storedToken = localStorage.getItem('accessToken')

        if(storedUser && storedToken){
            setUser(JSON.parse(storedUser))
        }
        setLoading(false)
    }, [])

    const login = async (email, password) =>{
        const data = await api.post('/auth/login', {email, password})
        localStorage.setItem('accessToken', data.accessToken)
        localStorage.setItem('refreshToken', data.refreshToken)
        localStorage.setItem('user', JSON.stringify(data.user))
        setUser(data.user)
        return data
    }

    const signup = async (email, username, password)=>{
        const data = await api.post('/auth/signup', {email, username, password})
        localStorage.setItem('accessToken', data.accessToken)
        localStorage.setItem('refreshToken', data.refreshToken)
        localStorage.setItem('user', JSON.stringify(data.user))
        setUser(data.user)
        return data
    }

    const logout = async () =>{
        const refreshToken = localStorage.getItem('refreshToken')
        try {
            if (refreshToken) {
                await api.post('/auth/logout', {refreshToken})
            }
        } catch (err){
            console.error('logout error (processing anyway):', err)
        }
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        localStorage.removeItem('user')
        setUser(null)
    }

    return (<AuthContext.Provider value = {{user, loading, login, signup, logout}}>{children}</AuthContext.Provider>)
}

export function useAuth(){return useContext(AuthContext)}
