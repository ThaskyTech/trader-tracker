import { Navigate } from 'react-router-dom'
import { useAuth, isUnverified } from '../../context/AuthContext'
import CheckEmail from '../../pages/CheckEmail'

export default function ProtectedRoute({children}){
    const { user } = useAuth()

    // The session is read synchronously on startup, so there's no loading state.
    if(!user){
        return <Navigate to="/login" replace />
    }

    // Signed in but the email isn't verified yet (D-70): the server refuses their data,
    // so every page shows the "check your email" screen instead.
    if(isUnverified(user)) return <CheckEmail />

    return children
}
