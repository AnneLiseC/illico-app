'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../lib/api-auth-client'

// Carte « Mon Drive » (OneDrive / Microsoft Graph) :
//   - connexion / déconnexion (tokens chiffrés dans comptes_oauth).
//   - DOSSIER RACINE via un navigateur drive-aware : Mes fichiers + Partagés avec moi,
//     navigation dans les sous-dossiers, choix de N'IMPORTE QUEL dossier (y compris
//     partagé, qui vit dans le Drive de son propriétaire → couple driveId+itemId).
//
// Props : profile, onError, onSucces (pilotent le bandeau de la page hôte).

const cardStyle = { padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }
const labelStyle = { fontSize: 12, fontWeight: 600, color: 'var(--ink-600)', display: 'block', marginBottom: 5 }

export default function MonDrive({ profile, onError, onSucces }) {
  const [compte, setCompte] = useState(null)
  const [connecting, setConnecting] = useState(false)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [crumbs, setCrumbs] = useState([])        // [{driveId,itemId,name}] chemin courant
  const [folders, setFolders] = useState([])
  const [myDriveId, setMyDriveId] = useState(null)
  const [loadingFolders, setLoadingFolders] = useState(false)
  const [reconnect, setReconnect] = useState(false)
  const [createName, setCreateName] = useState('')
  const [saving, setSaving] = useState(false)
  const [rattrapage, setRattrapage] = useState(null) // null | { done, total } pendant le backfill
  const [inbox, setInbox] = useState([])             // fichiers déposés dans le Drive « à rattacher »
  const [dossiersRef, setDossiersRef] = useState([]) // mes chantiers (pour rattacher)
  const [rattacherId, setRattacherId] = useState(null)
  const [rForm, setRForm] = useState({ dossier_id: '', categorie: '' })
  const [importing, setImporting] = useState(false)

  const charger = useCallback(async () => {
    if (!profile) return
    const { data } = await supabase.from('comptes_oauth')
      .select('id, compte_email, drive_root_drive_id, drive_root_id, drive_root_path')
      .eq('user_id', profile.id).eq('fournisseur', 'microsoft').maybeSingle()
    setCompte(data || null)
    if (data) {
      const { data: inboxData } = await supabase.from('drive_inbox')
        .select('id, name, parent_path, web_url').eq('user_id', profile.id).eq('statut', 'a_rattacher')
        .order('created_at', { ascending: false })
      setInbox(inboxData || [])
      const { data: doss } = await supabase.from('dossiers')
        .select('id, created_at, client:clients(nom)').eq('referente_id', profile.id)
        .order('created_at', { ascending: false })
      setDossiersRef(doss || [])
    }
  }, [profile?.id])

  useEffect(() => { charger() }, [charger])

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
      const res = await apiFetch('/api/auth/microsoft', { method: 'POST' })
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
      const res = await apiFetch('/api/calendar/account/disconnect', {
        method: 'POST',
        body: JSON.stringify({ compte_oauth_id: compte.id }),
      })
      const d = await res.json()
      if (res.ok) { onSucces?.('OneDrive déconnecté ✓'); setCompte(null); setPickerOpen(false) }
      else onError?.(d.error || 'Déconnexion impossible')
    } catch { onError?.('Déconnexion impossible') }
  }

  // Charge un niveau : `path` vide → racine (Mes fichiers + Partagés) ; sinon enfants
  // du dernier dossier de `path`.
  const loadLevel = async (path) => {
    setLoadingFolders(true); setReconnect(false); onError?.('')
    try {
      let url = '/api/drive/folders'
      if (path.length) {
        const last = path[path.length - 1]
        url += `?drive_id=${encodeURIComponent(last.driveId)}&item_id=${encodeURIComponent(last.itemId)}`
      }
      const res = await apiFetch(url)
      const d = await res.json()
      if (d.reconnect) { setReconnect(true); setFolders([]) }
      else if (res.ok) { setFolders(d.folders || []); if (d.my_drive_id) setMyDriveId(d.my_drive_id) }
      else onError?.(d.error || 'Impossible de lister les dossiers')
    } catch { onError?.('Impossible de lister les dossiers') }
    setLoadingFolders(false)
  }

  const ouvrirPicker = () => { setPickerOpen(true); setCreateName(''); setCrumbs([]); loadLevel([]) }
  const entrer = (f) => { const p = [...crumbs, f]; setCrumbs(p); loadLevel(p) }
  const allerA = (i) => { const p = crumbs.slice(0, i + 1); setCrumbs(p); loadLevel(p) } // i=-1 → racine

  const enregistrerRacine = async (payload) => {
    setSaving(true); onError?.(''); onSucces?.('')
    try {
      const res = await apiFetch('/api/drive/folders', {
        method: 'POST', body: JSON.stringify(payload),
      })
      const d = await res.json()
      if (res.ok) {
        setCompte(c => ({ ...c, drive_root_drive_id: d.root_drive_id, drive_root_id: d.root_id, drive_root_path: d.root_path }))
        setPickerOpen(false); setCreateName('')
        onSucces?.(`Dossier racine : ${d.root_path} ✓`)
      } else onError?.(d.error || 'Enregistrement impossible')
    } catch { onError?.('Enregistrement impossible') }
    setSaving(false)
  }

  // Rattrapage initial : envoie TOUS mes chantiers existants (docs, photos, CR validés)
  // vers mon OneDrive. Une seule fois après avoir choisi la racine. Idempotent (les routes
  // sautent ce qui est déjà dans doc_index) → re-cliquer reprend là où ça s'était arrêté.
  const lancerRattrapage = async () => {
    onError?.(''); onSucces?.(''); setRattrapage({ done: 0, total: 0 })
    const { data: doss } = await supabase.from('dossiers').select('id').eq('referente_id', profile.id)
    const ids = (doss || []).map(d => d.id)
    if (!ids.length) { setRattrapage(null); onSucces?.('Aucun chantier à synchroniser.'); return }
    const [{ data: docs }, { data: phts }, { data: crs }, { data: dvs }] = await Promise.all([
      supabase.from('chantier_documents').select('id').in('dossier_id', ids),
      supabase.from('photos').select('id, type_media').in('dossier_id', ids),
      supabase.from('comptes_rendus').select('id, valide').in('dossier_id', ids),
      supabase.from('devis_artisans').select('id, devis_pdf_path, devis_signe_path').in('dossier_id', ids),
    ])
    const jobs = [
      ...(docs || []).map(d => ['/api/drive/push', { document_id: d.id }]),
      ...(phts || []).filter(p => p.type_media === 'photo').map(p => ['/api/drive/push', { photo_id: p.id }]),
      ...(crs || []).filter(c => c.valide).map(c => ['/api/drive/push-cr', { cr_id: c.id }]),
      ...(dvs || []).filter(d => d.devis_pdf_path || d.devis_signe_path).map(d => ['/api/drive/push-devis', { devis_id: d.id }]),
    ]
    const total = jobs.length
    setRattrapage({ done: 0, total })
    let envoyes = 0, sautes = 0, echecs = 0
    for (let i = 0; i < jobs.length; i++) {
      const [url, payload] = jobs[i]
      try {
        const r = await apiFetch(url, { method: 'POST', body: JSON.stringify(payload) })
        const d = await r.json().catch(() => ({}))
        if (d.already || d.skipped) sautes++
        else if (d.ok) envoyes++
        else echecs++
      } catch { echecs++ }
      setRattrapage({ done: i + 1, total })
    }
    setRattrapage(null)
    onSucces?.(`Rattrapage OneDrive : ${envoyes} envoyé(s), ${sautes} déjà présent(s), ${echecs} échec(s)`)
  }

  const importer = async () => {
    if (!rattacherId || !rForm.dossier_id) return
    setImporting(true); onError?.(''); onSucces?.('')
    try {
      const res = await apiFetch('/api/drive/import', {
        method: 'POST',
        body: JSON.stringify({ inbox_id: rattacherId, dossier_id: rForm.dossier_id, categorie: rForm.categorie || null }),
      })
      const d = await res.json()
      if (res.ok && d.ok) { onSucces?.('Fichier rattaché au chantier ✓'); setRattacherId(null); setRForm({ dossier_id: '', categorie: '' }); charger() }
      else onError?.(d.error || 'Rattachement impossible')
    } catch { onError?.('Rattachement impossible') }
    setImporting(false)
  }

  const ignorer = async (id) => {
    onError?.(''); onSucces?.('')
    try {
      const res = await apiFetch('/api/drive/inbox', {
        method: 'POST', body: JSON.stringify({ inbox_id: id, action: 'ignore' }),
      })
      if (res.ok) charger()
    } catch { /* ignore */ }
  }

  const choisir = (f) => enregistrerRacine({ drive_id: f.driveId, item_id: f.itemId, name: f.name })
  const courant = crumbs[crumbs.length - 1]
  const creer = () => {
    const parent = courant || { driveId: myDriveId, itemId: 'root' }
    enregistrerRacine({ create_name: createName.trim(), parent_drive_id: parent.driveId, parent_item_id: parent.itemId })
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
        Connecte ton OneDrive et choisis le dossier racine (n&apos;importe lequel, y compris
        un dossier partagé) : c&apos;est là que les chantiers seront rangés automatiquement.
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
                {/* Fil d'Ariane */}
                <div style={{ fontSize: 12, color: 'var(--ink-600)', display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '2px 6px' }} onClick={() => allerA(-1)}>🏠 Racine</button>
                  {crumbs.map((c, i) => (
                    <span key={c.itemId} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: 'var(--ink-300)' }}>/</span>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '2px 6px' }} onClick={() => allerA(i)}>{c.name}</button>
                    </span>
                  ))}
                </div>

                {loadingFolders && <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>Lecture des dossiers…</div>}
                {reconnect && <div style={{ fontSize: 12.5, color: '#dc2626' }}>Accès OneDrive expiré. Déconnecte puis reconnecte ton compte ci-dessus.</div>}

                {!loadingFolders && !reconnect && (
                  <>
                    {/* Choisir le dossier courant (si on est descendu quelque part) */}
                    {courant && (
                      <button className="btn btn-primary" style={{ fontSize: 12.5 }} disabled={saving}
                        onClick={() => choisir(courant)}>
                        {saving ? 'Enregistrement…' : `Utiliser « ${courant.name} » comme racine`}
                      </button>
                    )}

                    {/* Liste des dossiers du niveau courant */}
                    {folders.length === 0
                      ? <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>Aucun sous-dossier ici.</div>
                      : <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                          {folders.map(f => (
                            <div key={`${f.driveId}:${f.itemId}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, border: '1px solid var(--ink-100)', borderRadius: 8, padding: '8px 10px' }}>
                              <button onClick={() => entrer(f)} title="Ouvrir"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: 'var(--ink-900)', display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                                <span>📁</span>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                                {f.source === 'partage' && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: 'var(--ink-100)', color: 'var(--ink-600)' }}>Partagé</span>}
                              </button>
                              <button className="btn btn-ghost" style={{ fontSize: 11.5, flexShrink: 0 }} disabled={saving} onClick={() => choisir(f)}>Choisir</button>
                            </div>
                          ))}
                        </div>}

                    {/* Créer un dossier ici */}
                    <div style={{ borderTop: '1px solid var(--ink-100)', paddingTop: 12 }}>
                      <label style={labelStyle}>…ou créer un dossier ici {courant ? `(dans « ${courant.name} »)` : '(dans Mes fichiers)'}</label>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input className="input" placeholder="Nom du dossier (ex. Batilis)" value={createName}
                          onChange={e => setCreateName(e.target.value)} style={{ height: 40, flex: 1, minWidth: 180 }} />
                        <button className="btn btn-ghost" style={{ fontSize: 12.5 }} disabled={saving || !createName.trim()} onClick={creer}>
                          {saving ? 'Création…' : 'Créer et utiliser'}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                <div><button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setPickerOpen(false)}>Fermer</button></div>
              </div>
            )}
          </div>

          {/* ── Rattrapage initial (backfill de MES chantiers) ── */}
          <div style={{ borderTop: '1px solid var(--ink-100)', paddingTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-800)' }}>Rattrapage initial</div>
            <div style={{ fontSize: 12, color: 'var(--ink-500)', marginBottom: 8 }}>
              Envoie tous tes chantiers existants (documents, photos, CR validés) vers ton OneDrive.
              À faire une seule fois, après avoir choisi ta racine.
            </div>
            <button className="btn btn-ghost" style={{ fontSize: 12.5 }}
              disabled={!compte.drive_root_id || !!rattrapage} onClick={lancerRattrapage}>
              {rattrapage ? `Synchronisation… ${rattrapage.done}/${rattrapage.total}` : '☁️ Envoyer tous mes chantiers'}
            </button>
            {!compte.drive_root_id && (
              <div style={{ fontSize: 11.5, color: '#a16207', marginTop: 6 }}>Choisis d&apos;abord un dossier racine ci-dessus.</div>
            )}
          </div>

          {/* ── Fichiers déposés dans le Drive → à rattacher à un chantier ── */}
          {inbox.length > 0 && (
            <div style={{ borderTop: '1px solid var(--ink-100)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-800)' }}>📥 Fichiers déposés à rattacher ({inbox.length})</div>
              {inbox.map(it => (
                <div key={it.id} style={{ border: '1px solid var(--ink-100)', borderRadius: 8, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--ink-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📄 {it.name}</div>
                      {it.parent_path && <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{it.parent_path.replace(/^.*root:/, '')}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button className="btn btn-ghost" style={{ fontSize: 11.5 }} onClick={() => { setRattacherId(rattacherId === it.id ? null : it.id); setRForm({ dossier_id: '', categorie: '' }) }}>Rattacher</button>
                      <button className="btn btn-ghost" style={{ fontSize: 11.5 }} onClick={() => ignorer(it.id)}>Ignorer</button>
                    </div>
                  </div>
                  {rattacherId === it.id && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <select className="input" style={{ height: 38, flex: 1, minWidth: 180 }} value={rForm.dossier_id} onChange={e => setRForm(f => ({ ...f, dossier_id: e.target.value }))}>
                        <option value="">— Chantier —</option>
                        {dossiersRef.map(d => <option key={d.id} value={d.id}>{(d.created_at || '').slice(0, 10)} {d.client?.nom || ''}</option>)}
                      </select>
                      <select className="input" style={{ height: 38 }} value={rForm.categorie} onChange={e => setRForm(f => ({ ...f, categorie: e.target.value }))}>
                        <option value="">Autres</option>
                        <option value="compte_rendu">Rapport de visite</option>
                        <option value="plans">Plans</option>
                        <option value="administratif">Administratif</option>
                      </select>
                      <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={importing || !rForm.dossier_id} onClick={importer}>
                        {importing ? '…' : 'Valider'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
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
