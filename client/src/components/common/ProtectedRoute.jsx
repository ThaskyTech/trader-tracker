import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function ProtectedRoute({children}){
    const { user } = useAuth()

    // The session is read synchronously on startup, so there's no loading state.
    if(!user){
        return <Navigate to="/login" replace />
    }

    return children
}
