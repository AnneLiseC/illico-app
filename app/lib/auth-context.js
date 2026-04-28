'use client'
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [initialized, setInitialized] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  const loadUnread = useCallback(async (uid) => {
    if (!uid) { setUnreadCount(0); return }
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', uid)
      .eq('lu', false)
    setUnreadCount(count || 0)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) {
        const { data } = await supabase.from('profiles').select('*').eq('id', u.id).single()
        setProfile(data)
        loadUnread(u.id)
      }
      setInitialized(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (!u) { setProfile(null); setUnreadCount(0); setInitialized(true); return }
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
        const { data } = await supabase.from('profiles').select('*').eq('id', u.id).single()
        setProfile(data)
        loadUnread(u.id)
        setInitialized(true)
      }
    })

    return () => subscription.unsubscribe()
  }, [loadUnread])

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
    <AuthContext.Provider value={{ user, profile, initialized, unreadCount, markAllRead, loadUnread }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
