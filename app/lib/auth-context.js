'use client'
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [initialized, setInitialized] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const prevUserIdRef = useRef(null)

  const loadUnread = useCallback(async (uid) => {
    if (!uid) { setUnreadCount(0); return }
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', uid)
      .eq('lu', false)
    setUnreadCount(count || 0)
  }, [])

  const fetchProfile = useCallback(async (uid) => {
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', uid).single()
      if (data) setProfile(data)
      loadUnread(uid)
    } catch {
      // erreur réseau transitoire, on ne reset pas le profil
    }
  }, [loadUnread])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (!u) {
        prevUserIdRef.current = null
        setProfile(null)
        setUnreadCount(0)
        setInitialized(true)
        return
      }
      const userChanged = prevUserIdRef.current !== u.id
      prevUserIdRef.current = u.id
      // Charger le profil uniquement si l'utilisateur change ou au chargement initial.
      // userChanged couvre SIGNED_IN (première fois) et INITIAL_SESSION (rechargement page).
      // On exclut les events répétés (TOKEN_REFRESHED, SIGNED_IN dupliqué) via userChanged.
      if (userChanged || event === 'INITIAL_SESSION') {
        await fetchProfile(u.id)
      }
      setInitialized(true)
    })

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  // Écoute en temps réel les nouvelles notifications
  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel(`notifs-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        setUnreadCount(c => c + 1)
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        loadUnread(user.id)
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [user?.id, loadUnread])

  const markAllRead = useCallback(async () => {
    if (!user?.id) return
    await supabase
      .from('notifications')
      .update({ lu: true })
      .eq('user_id', user.id)
      .eq('lu', false)
    setUnreadCount(0)
  }, [user?.id])

  return (
    <AuthContext.Provider value={{ user, profile, initialized, unreadCount, markAllRead, loadUnread, fetchProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
