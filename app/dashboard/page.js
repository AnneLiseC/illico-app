'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'

export default function Dashboard() {
  const [profile, setProfile] = useState(null)
  const [erreur, setErreur] = useState('')
  const router = useRouter()

  useEffect(() => {
    const getProfile = async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
        router.replace('/login')
        return
      }

      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileError) {
        setErreur('Erreur profil : ' + profileError.message)
        return
      }

      // Rediriger le client AVANT setProfile pour ne jamais afficher le dashboard
      if (data.role === 'client') {
        router.replace('/espace-client')
        return
      }
      setProfile(data)
    }
    getProfile()
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const roleLabel = (role) => {
    if (role === 'admin') return 'Franchisée'
    if (role === 'agente') return 'Agente'
    return 'Client'
  }

  if (erreur) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-red-500">{erreur}</p>
    </div>
  )

  if (!profile) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Chargement...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-6xl mx-auto px-6 py-8">
        <h2 className="text-xl font-semibold text-gray-800 mb-6">
          Bonjour {profile.prenom} 👋
        </h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: 'Chantiers', emoji: '📁', href: '/chantiers', desc: 'Gérer les chantiers' },
            { label: 'Clients', emoji: '👤', href: '/clients', desc: 'Fiches clients' },
            { label: 'Artisans', emoji: '🔨', href: '/artisans', desc: 'Partenaires & contacts' },
            { label: 'Planning', emoji: '📅', href: '/planning', desc: 'Rendez-vous' },
            { label: 'Finances', emoji: '💶', href: '/finances', desc: 'Suivi financier' },
            { label: 'Statistiques', emoji: '📊', href: '/statistiques', desc: 'Tableaux de bord' },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => router.push(item.href)}
              className="bg-white border border-gray-200 rounded-xl p-6 text-left hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="text-3xl mb-3">{item.emoji}</div>
              <div className="font-semibold text-gray-800">{item.label}</div>
              <div className="text-xs text-gray-400 mt-1">{item.desc}</div>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}