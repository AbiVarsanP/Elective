import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthProvider'

const ProtectedRoute = ({
  role: requiredRole,
  children
}: {
  role: string
  children: JSX.Element
}) => {
  const { session, role, loading } = useAuth()

  if (loading) return <div>Loading...</div>

  if (!session) {
    return <Navigate to="/" replace />
  }

  if (role !== requiredRole) {
    return <Navigate to="/unauthorized" replace />
  }

  return children
}

export default ProtectedRoute
