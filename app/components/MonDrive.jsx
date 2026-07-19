'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { authHeaders } from '../lib/api-auth-client'

// Carte « Mon Drive » (OneDrive / Microsoft Graph) :
//   - Lot 1 : connexion / déconnexion (tokens chiffrés dans comptes_oauth).
//   - Lot 2a : choix du DOSSIER RACINE (« c'est là que mes chantiers atterrissent »).
//     Liste les dossiers de premier niveau via /api/drive/folders (prouve que le token
//     parle à Graph + refresh transparent), ou crée un dossier dédié.
//
// Props : profile, onError, onSucces (pilotent le bandeau de la page hôte).

const cardStyle = { padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }

export default function MonDrive({ profile, onError, onSucces }) {
  const [compte, setCompte] = useState(null)   // ligne comptes_oauth 'microsoft' (ou null)
  const [connecting, setConnecting] = useState(false)

  // Dossier racine
  const [pickerOpen, setPickerOpen] = useState(false)
  const [folders, setFolders] = useState([])
  const [loadingFolders, setLoadingFolders] = useState(false)
  const [reconnect, setReconnect] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [createName, setCreateName] = useState('')
  const [saving, setSaving] = useState(false)

  const charger = useCallback(async () => {
    if (!profile) return
    const { data } = await supabase.from('comptes_oauth')
      .select('id, compte_email, drive_root_id, drive_root_path')
      .eq('user_id', profile.id).eq('fournisseur', 'microsoft').maybeSingle()
    setCompte(data || null)
  }, [profile?.id])

  useEffect(() => { charger() }, [charger])

  // Retour du callback (?onedrive=connected|error), une fois, puis nettoyage de l'URL.
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
      if (res.ok) { onSucces?.('OneDrive déconnecté ✓'); setCompte(null); setPickerOpen(false) }
      else onError?.(d.error || 'Déconnexion impossible')
    } catch { onError?.('Déconnexion impossible') }
  }

  // Ouvre le sélecteur : charge les dossiers de premier niveau du OneDrive.
  const ouvrirPicker = async () => {
    setPickerOpen(true); setReconnect(false); setCreateName(''); onError?.(''); onSucces?.('')
    setSelectedId(compte?.drive_root_id || '')
    setLoadingFolders(true)
    try {
      const res = await fetch('/api/drive/folders', { headers: await authHeaders() })
      const d = await res.json()
      if (d.reconnect) { setReconnect(true); setFolders([]) }
      else if (res.ok) { setFolders(d.folders || []) }
      else onError?.(d.error || 'Impossible de lister les dossiers')
    } catch { onError?.('Impossible de lister les dossiers') }
    setLoadingFolders(false)
  }

  const enregistrerRacine = async (payload) => {
    setSaving(true); onError?.(''); onSucces?.('')
    try {
      const res = await fetch('/api/drive/folders', {
        method: 'POST', headers: await authHeaders(), body: JSON.stringify(payload),
      })
      const d = await res.json()
      if (res.ok) {
        setCompte(c => ({ ...c, drive_root_id: d.root_id, drive_root_path: d.root_path }))
        setPickerOpen(false); setCreateName('')
        onSucces?.(`Dossier racine : ${d.root_path} ✓`)
      } else onError?.(d.error || 'Enregistrement impossible')
    } catch { onError?.('Enregistrement impossible') }
    setSaving(false)
  }

  const dossierChoisi = folders.find(f => f.id === selectedId)

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
        Connecte ton OneDrive et choisis le dossier racine : c&apos;est là que les dossiers
        de tes chantiers seront rangés automatiquement.
      </p>

      {compte ? (
        <>
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

          {/* ── Dossier racine ── */}
          <div style={{ borderTop: '1px solid var(--ink-100)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-800)' }}>Dossier racine</div>
                <div style={{ fontSize: 12, color: compte.drive_root_path ? 'var(--ink-700)' : '#a16207' }}>
                  {compte.drive_root_path
                    ? <>📁 {compte.drive_root_path}</>
                    : 'Non défini — les chantiers ne se rangeront pas tant qu\'il manque.'}
                </div>
              </div>
              <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={ouvrirPicker}>
                {compte.drive_root_path ? 'Changer' : 'Choisir le dossier racine'}
              </button>
            </div>

            {pickerOpen && (
              <div style={{ border: '1px solid var(--ink-200)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {loadingFolders && <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>Lecture de tes dossiers OneDrive…</div>}

                {reconnect && (
                  <div style={{ fontSize: 12.5, color: '#dc2626' }}>
                    Ton accès OneDrive a expiré. Déconnecte puis reconnecte ton compte ci-dessus.
                  </div>
                )}

                {!loadingFolders && !reconnect && (
                  <>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-600)', display: 'block', marginBottom: 5 }}>
                        Choisir un dossier existant
                      </label>
                      <select className="input" value={selectedId} onChange={e => setSelectedId(e.target.value)} style={{ height: 40 }}>
                        <option value="">— Sélectionne un dossier —</option>
                        {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                      <button className="btn btn-primary" style={{ fontSize: 12.5, marginTop: 8 }}
                        disabled={saving || !dossierChoisi}
                        onClick={() => enregistrerRacine({ root_id: dossierChoisi.id, root_name: dossierChoisi.name })}>
                        {saving ? 'Enregistrement…' : 'Utiliser ce dossier'}
                      </button>
                    </div>

                    <div style={{ borderTop: '1px solid var(--ink-100)', paddingTop: 12 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-600)', display: 'block', marginBottom: 5 }}>
                        …ou créer un nouveau dossier à la racine de ton OneDrive
                      </label>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input className="input" placeholder="Nom du dossier (ex. BATILIS)" value={createName}
                          onChange={e => setCreateName(e.target.value)} style={{ height: 40, flex: 1, minWidth: 180 }} />
                        <button className="btn btn-ghost" style={{ fontSize: 12.5 }}
                          disabled={saving || !createName.trim()}
                          onClick={() => enregistrerRacine({ create_name: createName.trim() })}>
                          {saving ? 'Création…' : 'Créer et utiliser'}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setPickerOpen(false)}>Fermer</button>
                </div>
              </div>
            )}
          </div>
        </>
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
