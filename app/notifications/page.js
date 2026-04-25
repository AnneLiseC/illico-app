'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'

const TYPE_LABELS = {
  deadline_devis: '📋 Deadline devis',
}

export default function Notifications() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const { user, initialized, markAllRead } = useAuth()

  useEffect(() => {
    if (!initialized) return
    if (!user) { router.replace('/login'); return }

    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setNotifications(data || [])
        setLoading(false)
      })

    markAllRead()
  }, [initialized, user?.id, router, markAllRead])

  const goToDossier = (n) => {
    if (n.dossier_id) router.push(`/chantiers/${n.dossier_id}`)
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Chargement...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-sm">
          ← Retour
        </button>
        <h1 className="text-lg font-bold text-blue-900">Notifications</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-2">
        {notifications.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400">
            <p className="text-4xl mb-3">🔔</p>
            <p>Aucune notification</p>
          </div>
        ) : (
          notifications.map(n => (
            <div
              key={n.id}
              onClick={() => goToDossier(n)}
              className={`bg-white border rounded-xl px-4 py-3 transition-all ${
                n.dossier_id ? 'cursor-pointer hover:border-blue-300 hover:shadow-sm' : ''
              } ${!n.lu ? 'border-blue-200 bg-blue-50' : 'border-gray-200'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-blue-600 font-medium mb-0.5">
                    {TYPE_LABELS[n.type] || n.type}
                  </p>
                  <p className="text-sm font-medium text-gray-800">{n.titre}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <p className="text-xs text-gray-400">
                    {new Date(n.created_at).toLocaleDateString('fr-FR')}
                  </p>
                  {!n.lu && <span className="w-2 h-2 rounded-full bg-blue-500" />}
                </div>
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  )
}
