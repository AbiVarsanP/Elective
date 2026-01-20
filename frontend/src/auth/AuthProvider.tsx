import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Session } from '@supabase/supabase-js'

type AuthContextType = {
  session: Session | null
  role: string | null
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  role: null,
  loading: true
})

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setRole(data.session?.user.user_metadata?.role ?? null)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setRole(session?.user.user_metadata?.role ?? null)
        setLoading(false)
      }
    )

    return () => listener.subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ session, role, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
