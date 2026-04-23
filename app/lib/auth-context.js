'use client'
import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    // getSession lit depuis localStorage — aucune requête réseau, instantané
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) {
        const { data } = await supabase.from('profiles').select('*').eq('id', u.id).single()
        setProfile(data)
      }
      setInitialized(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (!u) { setProfile(null); setInitialized(true); return }
      if (event === 'SIGNED_IN') {
        const { data } = await supabase.from('profiles').select('*').eq('id', u.id).single()
        setProfile(data)
        setInitialized(true)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ user, profile, initialized }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
