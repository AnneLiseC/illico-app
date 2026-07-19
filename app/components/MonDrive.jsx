'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { authHeaders } from '../lib/api-auth-client'

// Carte « Mon Drive » (Lot 1 OneDrive) — connexion/déconnexion d'un compte OneDrive
// (Microsoft Graph) pour l'utilisateur. Stockage des tokens dans comptes_oauth
// (fournisseur='microsoft', RLS comptes_oauth_own), chiffrés côté serveur.
//
// Périmètre Lot 1 : prouver le consentement + le stockage du token. Le choix du
// dossier racine et le miroir des fichiers arrivent au Lot 2.
//
// Props : profile, onError, onSucces (pilotent le bandeau de la page hôte).

const cardStyle = { padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }

export default function MonDrive({ profile, onError, onSucces }) {
  const [compte, setCompte] = useState(null)   // la ligne comptes_oauth 'microsoft' du user (ou null)
  const [connecting, setConnecting] = useState(false)

  const charger = useCallback(async () => {
    if (!profile) return
    const { data } = await supabase.from('comptes_oauth')
      .select('id, fournisseur, compte_email')
      .eq('user_id', profile.id).eq('fournisseur', 'microsoft').maybeSingle()
    setCompte(data || null)
  }, [profile?.id])

  useEffect(() => { charger() }, [charger])

  // Lit le retour du callback (/parametres?onedrive=connected|error) une seule fois,
  // affiche le bandeau, puis nettoie l'URL.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const r = params.get('onedrive')
    if (!r) return
    if (r === 'connected') { onSucces?.('OneDrive connecté ✓'); charger() }
    else onError?.('Connexion OneDrive impossible. Réessaie ou vérifie l\'autorisation Microsoft.')
    params.delete('onedrive'); params.delete('reason')
    const qs = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile) return null

  const connecter = async () => {
    setConnecting(true); onError?.(''); onSucces?.('')
    try {
      const res = await fetch('/api/auth/microsoft', { method: 'POST', headers: await authHeaders() })
      const d = await res.json()
      if (res.ok && d.url) window.location.href = d.url
      else { onError?.(d.error || 'Erreur de connexion OneDrive'); setConnecting(false) }
    } catch { onError?.('Erreur de connexion OneDrive'); setConnecting(false) }
  }

  const deconnecter = async () => {
    if (!compte) return
    const ok = window.confirm('Déconnecter ton compte OneDrive ?\n\nLes fichiers déjà dans ton Drive n\'y touchent pas ; l\'application arrête simplement d\'y accéder.')
    if (!ok) return
    onError?.(''); onSucces?.('')
    try {
      const res = await fetch('/api/calendar/account/disconnect', {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ compte_oauth_id: compte.id }),
      })
      const d = await res.json()
      if (res.ok) { onSucces?.('OneDrive déconnecté ✓'); setCompte(null) }
      else onError?.(d.error || 'Déconnexion impossible')
    } catch { onError?.('Déconnexion impossible') }
  }

  return (
    <div className="card" style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="eyebrow">Mon Drive</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {compte
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, color: 'var(--ink-700)' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#15803d', flexShrink: 0 }} />
                OneDrive
              </span>
            : <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>Aucun Drive connecté</span>}
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>
        Connecte ton OneDrive pour que les documents de tes chantiers se rangent
        automatiquement dans ton Drive. Le choix du dossier racine arrive prochainement.
      </p>

      {compte ? (
        <div style={{ border: '1px solid var(--ink-200)', borderRadius: 12, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink-900)' }}>OneDrive</div>
            <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>{compte.compte_email || 'Compte Microsoft'}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#15803d', flexShrink: 0 }} />
            <button className="btn btn-ghost" style={{ fontSize: 11.5 }} onClick={deconnecter}>Déconnecter</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={connecter} disabled={connecting} style={{ fontSize: 12.5 }}>
            {connecting ? 'Redirection…' : '☁️ Connecter OneDrive'}
          </button>
        </div>
      )}
    </div>
  )
}
