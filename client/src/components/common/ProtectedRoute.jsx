import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function ProtectedRoute({children}){
    const { user, loading } = useAuth()

    if(loading){
        return (
            <div style={{
                minHeight: '100dvh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#22c55e',
                fontFamily: 'monospace',
                fontSize: '13px',
                letterSpacing: '1px',
            }}>
                LOADING...
            </div>
        )
    }

    if(!user){
        return <Navigate to="/login" replace />
    }

    return children
}