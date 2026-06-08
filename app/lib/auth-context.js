'use client'
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

// Clé localStorage de la vue active, namespacée par utilisateur.
const agenceKey = (uid) => `batilis.agenceActive.${uid}`

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  // profileStatus lève l'ambiguïté de `profile === null` :
  //  'loading' = fetch en cours/non résolu · 'loaded' = profil présent · 'absent' = 0 ligne confirmée.
  // État SÉPARÉ de `initialized` (qui reste posé à true immédiatement, cf. plus bas).
  const [profileStatus, setProfileStatus] = useState('loading')
  const [displayAgenceName, setDisplayAgenceName] = useState(null)
  // Multi-agence : liste des agences (admin uniquement) + vue active.
  // agenceActive : null = Consolidé (pas de filtre) · uuid = une agence choisie.
  const [agences, setAgences] = useState([])
  const [agenceActive, setAgenceActiveState] = useState(null)
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

  // Nom à afficher dans le header : agence de l'utilisateur si rattaché à une
  // agence (agence_id non NULL), sinon société (cas admin multi-agence).
  const loadAgenceName = useCallback(async (prof) => {
    if (!prof) { setDisplayAgenceName(null); return }
    try {
      if (prof.agence_id) {
        const { data } = await supabase.from('agences').select('nom').eq('id', prof.agence_id).single()
        setDisplayAgenceName(data?.nom ?? null)
      } else if (prof.societe_id) {
        const { data } = await supabase.from('societes').select('nom_societe').eq('id', prof.societe_id).single()
        setDisplayAgenceName(data?.nom_societe ?? null)
      } else {
        setDisplayAgenceName(null)
      }
    } catch {
      // erreur réseau transitoire, on ne reset pas le nom déjà affiché
    }
  }, [])

  // Charge la liste des agences (admin uniquement) PUIS calcule la vue active
  // depuis localStorage — la validation se fait une fois la liste connue (pas de race).
  const loadAgences = useCallback(async (prof) => {
    if (!prof || prof.role !== 'admin' || !prof.societe_id) {
      // agente / non-admin → pas de liste, vue Consolidée (null).
      setAgences([])
      setAgenceActiveState(null)
      return
    }
    try {
      const { data } = await supabase.from('agences').select('id, nom, code').eq('societe_id', prof.societe_id).order('code')
      const list = data || []
      setAgences(list)
      // Validation : on n'adopte la valeur stockée que si elle appartient bien
      // aux agences de l'utilisateur courant ; sinon Consolidé (null).
      let initial = null
      try {
        const stored = localStorage.getItem(agenceKey(prof.id))
        if (stored && list.some(a => a.id === stored)) initial = stored
      } catch { /* localStorage indisponible → Consolidé */ }
      setAgenceActiveState(initial)
    } catch {
      // erreur réseau transitoire : on ne casse pas l'état existant
    }
  }, [])

  // Setter exposé : met l'état ET persiste (uuid) ou purge (null) la clé de l'user.
  const setAgenceActive = useCallback((idOuNull) => {
    setAgenceActiveState(idOuNull)
    const uid = prevUserIdRef.current
    if (!uid) return
    try {
      if (idOuNull) localStorage.setItem(agenceKey(uid), idOuNull)
      else localStorage.removeItem(agenceKey(uid))
    } catch { /* localStorage indisponible : l'état en mémoire suffit */ }
  }, [])

  // Recharge UNIQUEMENT la liste des agences (après création d'une agence p.ex.).
  // Ne touche PAS agenceActive (la vue active choisie reste intacte). Lit le
  // `profile` courant du state (≠ loadAgences qui reçoit le profil tout juste fetché).
  const refreshAgences = useCallback(async () => {
    if (!profile || profile.role !== 'admin' || !profile.societe_id) return
    try {
      const { data } = await supabase.from('agences').select('id, nom, code').eq('societe_id', profile.societe_id).order('code')
      setAgences(data || [])
    } catch { /* erreur réseau transitoire : on garde la liste existante */ }
  }, [profile])

  const fetchProfile = useCallback(async (uid) => {
    setProfileStatus('loading')
    try {
      // maybeSingle : 0 ligne => data null sans erreur (≠ .single() qui lèverait).
      const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
      if (error) {
        // Erreur réseau : NE PAS conclure « absent ». On reste 'loading' ; le retry
        // par page (filet existant) rejouera fetchProfile.
        return
      }
      if (data) {
        setProfile(data)
        loadAgenceName(data)
        loadAgences(data)
        setProfileStatus('loaded')
      } else {
        // 0 ligne, pas d'erreur => profil confirmé absent (admin invité sans société).
        setProfile(null)
        setDisplayAgenceName(null)
        setProfileStatus('absent')
      }
      loadUnread(uid)
    } catch {
      // erreur réseau transitoire, on ne reset pas le profil ni le statut (reste 'loading')
    }
  }, [loadUnread, loadAgenceName, loadAgences])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (!u) {
        // Purge la vue active de l'utilisateur qui se déconnecte.
        try { if (prevUserIdRef.current) localStorage.removeItem(agenceKey(prevUserIdRef.current)) } catch { /* ignore */ }
        prevUserIdRef.current = null
        setProfile(null)
        setProfileStatus('loading')
        setDisplayAgenceName(null)
        setAgences([])
        setAgenceActiveState(null)
        setUnreadCount(0)
        setInitialized(true)
        return
      }
      const userChanged = prevUserIdRef.current !== u.id
      prevUserIdRef.current = u.id
      // initialized est positionné immédiatement — fetchProfile tourne en arrière-plan.
      // Si on attendait le fetch, un hang réseau bloquerait initialized indéfiniment.
      setInitialized(true)
      if (userChanged || event === 'INITIAL_SESSION') {
        fetchProfile(u.id)
      }
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
    <AuthContext.Provider value={{ user, profile, profileStatus, displayAgenceName, agences, agenceActive, setAgenceActive, refreshAgences, initialized, unreadCount, markAllRead, loadUnread, fetchProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
