'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'
import { getObjectifAgente, saveObjectif } from '../lib/objectifs'
import { authHeaders } from '../lib/api-auth-client'

// Page profil de l'utilisateur connecté (pensée pour les agentes ; l'admin gère
// tout via /parametres, mais la page reste consultable sans erreur). Réutilise
// les handlers de parametres, keyés sur le profil connecté (useAuth).
// Sécurité : seuls les champs persos sont éditables ; le DB (trigger
// profiles_protege_identite) verrouille les champs admin-managed même en cas de
// requête forgée. Le RIB est owner (upload/voir) ; le Kbis est admin-only (voir seul).

const fmtPart = (v) => (v === undefined || v === null) ? '—' : `${Math.round(v * 100)} / ${100 - Math.round(v * 100)}`
const roleLabel = (r) => r === 'admin' ? 'Franchisée' : r === 'agente' ? 'Agente' : 'Membre'

export default function Profil() {
  const { user, profile, initialized, displayAgenceName, fetchProfile } = useAuth()
  const router = useRouter()

  const [tel, setTel] = useState('')
  const [savingTel, setSavingTel] = useState(false)
  const [uploadingRib, setUploadingRib] = useState(false)
  const [newPwd, setNewPwd] = useState('')
  const [newPwdConfirm, setNewPwdConfirm] = useState('')
  const [savingPwd, setSavingPwd] = useState(false)
  const [error, setError] = useState('')
  const [succes, setSucces] = useState('')
  // Objectif annuel perso (agente) — '' = aucune ligne (≠ 0). objExiste distingue
  // « pas d'objectif » de « objectif à 0 ».
  const [objMontant, setObjMontant] = useState('')
  const [objExiste, setObjExiste] = useState(false)
  const [savingObj, setSavingObj] = useState(false)
  // Mes calendriers (lot 8b, lecture seule) : comptes connectés du user + leurs agendas.
  const [comptesCal, setComptesCal] = useState([])
  const [agendas, setAgendas] = useState({}) // { [compteId]: { loading, error, reconnect, items } }
  // Formulaire de connexion iCloud (lot 8c)
  const [icloudOpen, setIcloudOpen] = useState(false)
  const [appleId, setAppleId] = useState('')
  const [appPassword, setAppPassword] = useState('')
  const [connectingIcloud, setConnectingIcloud] = useState(false)
  const [erreurIcloud, setErreurIcloud] = useState('') // erreur affichée DANS le formulaire
  // Cibles calendrier (lot 8d) : liste + formulaire de création
  const [cibles, setCibles] = useState([])
  const [agences, setAgences] = useState([]) // agences de la société (admin → cible d'agence)
  const [cibleOpen, setCibleOpen] = useState(false)
  const [cibleCompteId, setCibleCompteId] = useState('')
  const [cibleAgenda, setCibleAgenda] = useState('')
  const [cibleLibelle, setCibleLibelle] = useState('')
  const [ciblePerimetre, setCiblePerimetre] = useState('perso')
  const [cibleAgenceId, setCibleAgenceId] = useState('')
  const [creatingCible, setCreatingCible] = useState(false)
  const [erreurCible, setErreurCible] = useState('')

  useEffect(() => {
    if (!initialized) return
    if (!user) { router.replace('/login'); return }
    if (profile?.role === 'client') { router.replace('/espace-client'); return }
  }, [initialized, user?.id, profile?.role, router])

  // Initialise le champ téléphone éditable depuis le profil chargé.
  useEffect(() => { if (profile) setTel(profile.telephone || '') }, [profile?.id])

  // Pré-remplit l'objectif annuel PERSO de l'agente (sa ligne objectifs_ca, année
  // courante). row === null → champ vide (placeholder) ; JAMAIS le fallback agence.
  useEffect(() => {
    if (!profile || profile.role !== 'agente' || !profile.agence_id) return
    getObjectifAgente(profile.id)
      .then(row => { setObjMontant(row?.montant ?? ''); setObjExiste(!!row) })
      .catch(() => { /* erreur réseau transitoire : on laisse le champ tel quel */ })
  }, [profile?.id])

  // Charge les comptes calendrier du user (RLS comptes_oauth_own) puis, pour chacun, ses
  // agendas via la route 8a (Bearer authHeaders). LECTURE SEULE. Réutilisable après
  // connexion / déconnexion d'un compte (8c).
  const chargerComptes = useCallback(async () => {
    if (!profile) return
    const { data } = await supabase.from('comptes_oauth')
      .select('id, fournisseur, compte_email, caldav_username').eq('user_id', profile.id)
    const list = data || []
    setComptesCal(list)
    setAgendas({})
    for (const c of list) {
      setAgendas(a => ({ ...a, [c.id]: { loading: true } }))
      try {
        const res = await fetch(`/api/calendar/list?compte_oauth_id=${c.id}`, { headers: await authHeaders() })
        const d = await res.json()
        if (res.ok) setAgendas(a => ({ ...a, [c.id]: { loading: false, items: d.calendriers || [] } }))
        else setAgendas(a => ({ ...a, [c.id]: { loading: false, error: d.error, reconnect: !!d.reconnect } }))
      } catch {
        setAgendas(a => ({ ...a, [c.id]: { loading: false, error: 'Erreur réseau' } }))
      }
    }
  }, [profile?.id])

  useEffect(() => { chargerComptes() }, [chargerComptes])

  // Cibles visibles du user (RLS SELECT = perso ∪ agence ∪ admin-société). LECTURE.
  const chargerCibles = useCallback(async () => {
    if (!profile) return
    const { data } = await supabase.from('cibles_calendrier')
      .select('id, fournisseur, calendar_id, compte_oauth_id, libelle, user_id, agence_id, actif')
    setCibles(data || [])
  }, [profile?.id])

  // Agences de la société (admin uniquement, pour créer une cible d'agence).
  const chargerAgences = useCallback(async () => {
    if (!profile || profile.role !== 'admin') return
    const { data } = await supabase.from('agences').select('id, nom').eq('societe_id', profile.societe_id)
    setAgences(data || [])
    setCibleAgenceId(prev => prev || data?.[0]?.id || '')
  }, [profile?.id, profile?.role, profile?.societe_id])

  useEffect(() => { chargerCibles(); chargerAgences() }, [chargerCibles, chargerAgences])

  if (!initialized || !profile) return <div className="page-loading" />

  // ── Handlers (transposés de parametres, keyés sur le profil connecté) ──
  const sauvegarderTel = async () => {
    setSavingTel(true); setError(''); setSucces('')
    const { error } = await supabase.from('profiles').update({ telephone: tel || null }).eq('id', profile.id)
    if (error) setError('Erreur : ' + error.message)
    else { setSucces('Téléphone enregistré ✓'); fetchProfile(user.id) }
    setSavingTel(false)
  }

  const enregistrerObjectif = async () => {
    setSavingObj(true); setError(''); setSucces('')
    try {
      await saveObjectif({ cible: 'agente', agenteId: profile.id, agenceId: profile.agence_id, montant: objMontant })
      const row = await getObjectifAgente(profile.id)
      setObjMontant(row?.montant ?? ''); setObjExiste(!!row)
      setSucces('Objectif enregistré ✓')
    } catch (e) {
      setError('Erreur : ' + e.message)
    }
    setSavingObj(false)
  }

  const voirRib = async () => {
    if (!profile.rib_url) return
    const { data } = await supabase.storage.from('documents').createSignedUrl(profile.rib_url, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const uploadRib = async (fichier) => {
    if (!fichier) return
    setUploadingRib(true); setError(''); setSucces('')
    const chemin = `rib/${profile.id}.pdf`
    const { error: upErr } = await supabase.storage.from('documents')
      .upload(chemin, fichier, { upsert: true, contentType: 'application/pdf' })
    if (upErr) { setError('Erreur upload RIB : ' + upErr.message); setUploadingRib(false); return }
    const { error } = await supabase.from('profiles').update({ rib_url: chemin }).eq('id', profile.id)
    if (error) setError('Erreur sauvegarde RIB : ' + error.message)
    else { setSucces('RIB enregistré ✓'); fetchProfile(user.id) }
    setUploadingRib(false)
  }

  const voirKbis = async () => {
    if (!profile.kbis_url) return
    const { data } = await supabase.storage.from('documents').createSignedUrl(profile.kbis_url, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const changerMotDePasse = async () => {
    setError(''); setSucces('')
    if (newPwd.length < 8) { setError('8 caractères minimum'); return }
    if (newPwd !== newPwdConfirm) { setError('Les mots de passe ne correspondent pas'); return }
    setSavingPwd(true)
    const { error } = await supabase.auth.updateUser({ password: newPwd })
    if (error) setError('Erreur : ' + error.message)
    else { setSucces('Mot de passe modifié ✓'); setNewPwd(''); setNewPwdConfirm('') }
    setSavingPwd(false)
  }

  const LS = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-600)', marginBottom: 5 }
  const RO = ({ label, value }) => (
    <div>
      <div className="eyebrow" style={{ marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)' }}>{value || '—'}</div>
    </div>
  )

  // Paliers de commission : liste des splits disponibles ; à défaut, le palier courant.
  const paliers = (profile.parts_agente_disponibles && profile.parts_agente_disponibles.length > 0)
    ? profile.parts_agente_disponibles
    : (profile.part_agente_defaut != null ? [profile.part_agente_defaut] : [])

  const cardStyle = { padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }

  // ── Mes calendriers (lot 8b) ──
  const labelFournisseur = (f) => f === 'google' ? 'Google' : f === 'icloud' ? 'iCloud' : f
  // Identité affichée : compte_email si présent ; sinon Apple ID iCloud ; sinon, pour
  // Google, l'id du calendrier principal (= adresse e-mail) renvoyé par la route 8a.
  const identiteCompte = (c) => {
    if (c.compte_email) return c.compte_email
    if (c.fournisseur === 'icloud') return c.caldav_username || 'Compte iCloud'
    const principal = agendas[c.id]?.items?.find(x => x.primary)
    return principal?.externalId || 'Compte Google'
  }
  const fournisseursConnectes = [...new Set(comptesCal.map(c => c.fournisseur))]

  // ── Cibles (lot 8d) ──
  const compteSel = comptesCal.find(c => c.id === cibleCompteId)
  const agendasSel = agendas[cibleCompteId]?.items || []
  const labelPerimetre = (c) => c.agence_id ? 'Agence' : 'Perso'
  const labelAgenda = (c) => {
    const found = agendas[c.compte_oauth_id]?.items?.find(x => x.externalId === c.calendar_id)
    return found?.label || c.calendar_id
  }
  // L'UI reflète la RLS cibles_write : perso supprimable par son propriétaire ; agence par
  // l'admin. La RLS reste le vrai garde-fou (un delete hors périmètre affecte 0 ligne).
  const peutSupprimer = (c) => (c.user_id && c.user_id === profile.id) || (profile.role === 'admin' && !!c.agence_id)

  const connecterGoogle = async () => {
    setError(''); setSucces('')
    try {
      const res = await fetch('/api/auth/google', { method: 'POST', headers: await authHeaders() })
      const d = await res.json()
      if (res.ok && d.url) window.location.href = d.url
      else setError(d.error || 'Erreur de connexion Google')
    } catch { setError('Erreur de connexion Google') }
  }

  const connecterIcloud = async () => {
    setConnectingIcloud(true); setErreurIcloud(''); setSucces('')
    try {
      const res = await fetch('/api/calendar/icloud/connect', {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ appleId, appPassword }),
      })
      const d = await res.json()
      if (res.ok) {
        setSucces('Compte iCloud connecté ✓')
        setIcloudOpen(false); setAppleId(''); setAppPassword(''); setErreurIcloud('')
        await chargerComptes()
      } else setErreurIcloud(d.error || 'Connexion iCloud impossible')
    } catch { setErreurIcloud('Connexion iCloud impossible') }
    setConnectingIcloud(false)
  }

  const deconnecterCompte = async (c) => {
    const ok = window.confirm(
      `Déconnecter ce compte ${labelFournisseur(c.fournisseur)} ?\n\n` +
      'Les calendriers cibles associés à ce compte seront désactivés.'
    )
    if (!ok) return
    setError(''); setSucces('')
    try {
      const res = await fetch('/api/calendar/account/disconnect', {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ compte_oauth_id: c.id }),
      })
      const d = await res.json()
      if (res.ok) { setSucces('Compte déconnecté ✓'); await chargerComptes() }
      else setError(d.error || 'Déconnexion impossible')
    } catch { setError('Déconnexion impossible') }
  }

  // Création d'une cible (insert AUTHENTIFIÉ → RLS cibles_write : agente=perso,
  // admin=perso+agence ; le trigger derive_societe remplit societe_id ; created_by défaut).
  const creerCible = async () => {
    setCreatingCible(true); setErreurCible('')
    if (!compteSel || !cibleAgenda || !cibleLibelle.trim()) {
      setErreurCible('Compte, agenda et libellé requis'); setCreatingCible(false); return
    }
    if (ciblePerimetre === 'agence' && !cibleAgenceId) {
      setErreurCible('Choisis une agence'); setCreatingCible(false); return
    }
    const perimetre = ciblePerimetre === 'agence'
      ? { agence_id: cibleAgenceId, user_id: null }
      : { user_id: profile.id, agence_id: null }
    const { error } = await supabase.from('cibles_calendrier').insert({
      fournisseur: compteSel.fournisseur,
      calendar_id: cibleAgenda,
      compte_oauth_id: cibleCompteId,
      libelle: cibleLibelle.trim(),
      ...perimetre,
    })
    if (error) setErreurCible('Création refusée : ' + error.message)
    else {
      setSucces('Calendrier cible ajouté ✓')
      setCibleOpen(false); setCibleCompteId(''); setCibleAgenda(''); setCibleLibelle(''); setErreurCible('')
      await chargerCibles()
    }
    setCreatingCible(false)
  }

  const supprimerCible = async (cible) => {
    const ok = window.confirm(
      `Supprimer la cible « ${cible.libelle} » ?\n\n` +
      'Les RDV / interventions liés ne se synchroniseront plus (les événements déjà créés ' +
      'restent dans le calendrier du fournisseur).'
    )
    if (!ok) return
    setError(''); setSucces('')
    // RLS cibles_write borne la suppression ; .select → 0 ligne = hors périmètre (non bloquant).
    const { data, error } = await supabase.from('cibles_calendrier').delete().eq('id', cible.id).select('id')
    if (error) setError('Suppression impossible : ' + error.message)
    else if (!data || data.length === 0) setError('Suppression non autorisée pour cette cible.')
    else { setSucces('Cible supprimée ✓'); await chargerCibles() }
  }

  return (
    <div className="page-enter page-pad" style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 980, margin: '0 auto' }}>

      {/* En-tête */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 4 }}>Mon compte</div>
        <h1 className="page">Mon profil</h1>
      </div>

      {succes && <div style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.3)', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: '#15803d' }}>{succes}</div>}
      {error  && <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: '#dc2626' }}>{error}</div>}

      {/* Grille 2×2 — 2 colonnes desktop, 1 colonne mobile (auto-fit) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, alignItems: 'start' }}>

        {/* ── Informations ── */}
        <div className="card" style={cardStyle}>
          <div className="eyebrow">Mes informations</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <RO label="Prénom" value={profile.prenom} />
            <RO label="Nom" value={profile.nom} />
            <RO label="Email" value={profile.email} />
            <RO label="Agence" value={displayAgenceName} />
            <RO label="Rôle" value={roleLabel(profile.role)} />
          </div>
          <div>
            <label style={LS}>Téléphone</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <input className="input" type="tel" value={tel} onChange={e => setTel(e.target.value)}
                placeholder="06 00 00 00 00" style={{ height: 40, flex: 1 }} />
              <button className="btn btn-primary" onClick={sauvegarderTel}
                disabled={savingTel || tel === (profile.telephone || '')}>
                {savingTel ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Mon objectif annuel (agente : éditable par elle-même) ── */}
        {profile.role === 'agente' && profile.agence_id && (
          <div className="card" style={cardStyle}>
            <div className="eyebrow">Mon objectif annuel {new Date().getFullYear()}</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>
              Tu fixes ton objectif de CA généré pour l'année. Visible dans Finances.
            </div>
            <div>
              <label style={LS}>Objectif de CA (€)</label>
              <div style={{ display: 'flex', gap: 10 }}>
                <input className="input" type="number" min="0" value={objMontant}
                  onChange={e => setObjMontant(e.target.value)}
                  placeholder="ex. 65000" style={{ height: 40, flex: 1 }} />
                <button className="btn btn-primary" onClick={enregistrerObjectif} disabled={savingObj}>
                  {savingObj ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
              {!objExiste && (
                <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                  Aucun objectif défini pour {new Date().getFullYear()}.
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Rémunération (lecture seule — réglée par l'administrateur) ── */}
        <div className="card" style={cardStyle}>
          <div className="eyebrow">Rémunération · réglée par l'administrateur</div>

          {(() => {
            const frais = profile.frais_part_agente_defaut
            const single = paliers.length === 1
            // Fusion seulement si UN palier identique au frais (comparaison numérique).
            const fusion = single && frais != null && Number(paliers[0]) === Number(frais)

            if (fusion) {
              return <RO label="Part (commission et frais)" value={fmtPart(paliers[0])} />
            }
            if (single) {
              return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <RO label="Part de commission (ma part / agence)" value={fmtPart(paliers[0])} />
                  <RO label="Frais de consultation (ma part / agence)" value={fmtPart(frais)} />
                </div>
              )
            }
            // Plusieurs paliers (ou aucun) : sections séparées, jamais de fusion.
            return (
              <>
                <div>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>Part de commission (ma part / agence)</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {paliers.length === 0 && <span style={{ fontSize: 13, color: 'var(--ink-400)' }}>—</span>}
                    {paliers.map((p, i) => (
                      <span key={i} style={{
                        padding: '4px 10px', borderRadius: 99, fontSize: 13, fontWeight: 600,
                        background: 'var(--ink-100)', color: 'var(--ink-700)',
                      }}>{fmtPart(p)}</span>
                    ))}
                  </div>
                </div>
                <RO label="Frais de consultation (ma part / agence)" value={fmtPart(frais)} />
              </>
            )
          })()}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <RO label="Redevance mensuelle" value={profile.redevance_mensuelle_ht != null ? `${profile.redevance_mensuelle_ht} € HT` : '—'} />
            <RO label="Début de redevance" value={profile.redevance_debut ? new Date(profile.redevance_debut).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '—'} />
          </div>
        </div>

        {/* ── Mes documents (RIB owner + Kbis lecture seule) ── */}
        <div className="card" style={cardStyle}>
          <div className="eyebrow">Mes documents</div>

          {/* RIB */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-800)', marginBottom: 8 }}>RIB</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: profile.rib_url ? 'var(--ink-700)' : '#a16207' }}>
                {profile.rib_url ? 'Fichier enregistré' : 'Aucun RIB enregistré'}
              </span>
              {profile.rib_url && <button className="btn btn-ghost" onClick={voirRib}>Voir</button>}
              <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
                {uploadingRib ? 'Upload…' : (profile.rib_url ? 'Remplacer' : '+ Ajouter')}
                <input type="file" accept=".pdf" style={{ display: 'none' }} disabled={uploadingRib}
                  onChange={e => e.target.files[0] && uploadRib(e.target.files[0])} />
              </label>
            </div>
          </div>

          {/* Kbis (admin-only : voir seulement) */}
          <div style={{ borderTop: '1px solid var(--ink-100)', paddingTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-800)', marginBottom: 8 }}>
              Kbis <span style={{ fontWeight: 400, color: 'var(--ink-400)', fontSize: 12 }}>· géré par l'administrateur</span>
            </div>
            {profile.kbis_url ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--ink-700)' }}>Fichier disponible</span>
                <button className="btn btn-ghost" onClick={voirKbis}>Voir</button>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>Kbis non disponible.</div>
            )}
          </div>
        </div>

        {/* ── Mot de passe ── */}
        <div className="card" style={cardStyle}>
          <div className="eyebrow">Mot de passe</div>
          <div>
            <label style={LS}>Nouveau mot de passe</label>
            <input className="input" type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)}
              placeholder="8 caractères minimum" style={{ height: 40, width: '100%' }} />
          </div>
          <div>
            <label style={LS}>Confirmer</label>
            <input className="input" type="password" value={newPwdConfirm} onChange={e => setNewPwdConfirm(e.target.value)}
              placeholder="Retapez le mot de passe" style={{ height: 40, width: '100%' }} />
          </div>
          <button className="btn btn-primary" onClick={changerMotDePasse} disabled={savingPwd || !newPwd || !newPwdConfirm}
            style={{ alignSelf: 'flex-start' }}>
            {savingPwd ? 'Enregistrement…' : 'Changer le mot de passe'}
          </button>
        </div>

      </div>

      {/* ── Mes calendriers (lot 8b, lecture seule) ── */}
      <div className="card" style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="eyebrow">Mes calendriers</div>
          {/* Badge multi-fournisseur (présence du compte, pas l'expiry) */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {fournisseursConnectes.length === 0
              ? <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>Aucun calendrier connecté</span>
              : fournisseursConnectes.map(f => (
                  <span key={f} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, color: 'var(--ink-700)' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#15803d', flexShrink: 0 }} />
                    {labelFournisseur(f)}
                  </span>
                ))}
          </div>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>
          Connecte tes agendas pour y pousser tes RDV et interventions. La gestion des
          calendriers cibles arrive prochainement.
        </p>

        {comptesCal.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {comptesCal.map(c => {
              const a = agendas[c.id] || {}
              return (
                <div key={c.id} style={{ border: '1px solid var(--ink-200)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink-900)' }}>{labelFournisseur(c.fournisseur)}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>{identiteCompte(c)}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: a.reconnect ? '#dc2626' : '#15803d', flexShrink: 0 }} />
                      <button className="btn btn-ghost" style={{ fontSize: 11.5 }} onClick={() => deconnecterCompte(c)}>Déconnecter</button>
                    </div>
                  </div>
                  {a.loading && <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>Chargement des agendas…</div>}
                  {a.reconnect && <div style={{ fontSize: 12, color: '#dc2626' }}>Compte à reconnecter.</div>}
                  {a.error && !a.reconnect && <div style={{ fontSize: 12, color: '#b91c1c' }}>{a.error}</div>}
                  {a.items && a.items.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>Aucun agenda.</div>}
                  {a.items && a.items.length > 0 && (
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {a.items.map(cal => (
                        <li key={cal.externalId} style={{ fontSize: 12.5, color: 'var(--ink-700)', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--ink-300)', flexShrink: 0 }} />
                          {cal.label}{cal.primary ? ' · principal' : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={connecterGoogle} style={{ fontSize: 12.5 }}>📅 Connecter Google</button>
          <button className="btn btn-ghost" onClick={() => { setIcloudOpen(o => !o); setErreurIcloud('') }}
            style={{ fontSize: 12.5 }}> Connecter iCloud</button>
        </div>

        {icloudOpen && (
          <div style={{ border: '1px solid var(--ink-200)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>
              Génère un mot de passe d'application sur{' '}
              <a href="https://appleid.apple.com" target="_blank" rel="noreferrer" style={{ color: 'var(--brand-700)' }}>appleid.apple.com</a>{' '}
              (Connexion et sécurité → Mots de passe des apps), puis saisis-le ici.
            </div>
            <input className="input" placeholder="Apple ID (email)" value={appleId}
              onChange={e => setAppleId(e.target.value)} style={{ height: 40 }} />
            <input className="input" type="password" placeholder="Mot de passe d'application" value={appPassword}
              onChange={e => setAppPassword(e.target.value)} style={{ height: 40 }} />
            {erreurIcloud && (
              <div style={{ fontSize: 12.5, color: '#dc2626', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px 12px' }}>
                {erreurIcloud}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ fontSize: 12.5 }} onClick={connecterIcloud}
                disabled={connectingIcloud || !appleId || !appPassword}>
                {connectingIcloud ? 'Connexion…' : 'Connecter'}
              </button>
              <button className="btn btn-ghost" style={{ fontSize: 12.5 }}
                onClick={() => { setIcloudOpen(false); setAppleId(''); setAppPassword(''); setErreurIcloud('') }}>Annuler</button>
            </div>
          </div>
        )}

        {/* ── Calendriers cibles (lot 8d) ── */}
        <div style={{ borderTop: '1px solid var(--ink-100)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-800)' }}>Calendriers cibles</div>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} disabled={comptesCal.length === 0}
              onClick={() => { setCibleOpen(o => !o); setErreurCible('') }}>+ Ajouter un calendrier cible</button>
          </div>
          {comptesCal.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>Connecte d'abord un compte ci-dessus.</div>
          )}

          {cibles.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cibles.map(c => (
                <div key={c.id} style={{ border: '1px solid var(--ink-200)', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-900)' }}>
                      {c.libelle}
                      <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: 'var(--ink-100)', color: 'var(--ink-600)' }}>{labelPerimetre(c)}</span>
                      {!c.actif && <span style={{ marginLeft: 6, fontSize: 10.5, color: '#a16207' }}>· inactive</span>}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-500)' }}>
                      {labelFournisseur(c.fournisseur)} · {labelAgenda(c)}
                      {!c.compte_oauth_id && <span style={{ color: '#dc2626' }}> · compte déconnecté</span>}
                    </div>
                  </div>
                  {peutSupprimer(c) && (
                    <button className="btn btn-ghost" style={{ fontSize: 11.5 }} onClick={() => supprimerCible(c)}>Supprimer</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {cibleOpen && (
            <div style={{ border: '1px solid var(--ink-200)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <select className="input" value={cibleCompteId} style={{ height: 40 }}
                onChange={e => { setCibleCompteId(e.target.value); setCibleAgenda('') }}>
                <option value="">— Compte connecté —</option>
                {comptesCal.map(c => <option key={c.id} value={c.id}>{labelFournisseur(c.fournisseur)} · {identiteCompte(c)}</option>)}
              </select>
              <select className="input" value={cibleAgenda} disabled={!cibleCompteId} style={{ height: 40 }}
                onChange={e => setCibleAgenda(e.target.value)}>
                <option value="">— Agenda —</option>
                {agendasSel.map(a => <option key={a.externalId} value={a.externalId}>{a.label}{a.primary ? ' · principal' : ''}</option>)}
              </select>
              {cibleCompteId && agendasSel.length === 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--ink-400)' }}>Aucun agenda (compte à reconnecter ?).</div>
              )}
              <input className="input" placeholder="Libellé (ex. Agenda Martigues)" value={cibleLibelle}
                onChange={e => setCibleLibelle(e.target.value)} style={{ height: 40 }} />
              {profile.role === 'admin' && (
                <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <input type="radio" name="perimetre" checked={ciblePerimetre === 'perso'} onChange={() => setCiblePerimetre('perso')} /> Perso
                  </label>
                  <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <input type="radio" name="perimetre" checked={ciblePerimetre === 'agence'} onChange={() => setCiblePerimetre('agence')} /> Agence
                  </label>
                  {ciblePerimetre === 'agence' && (
                    <select className="input" value={cibleAgenceId} onChange={e => setCibleAgenceId(e.target.value)} style={{ height: 36, maxWidth: 220 }}>
                      {agences.map(ag => <option key={ag.id} value={ag.id}>{ag.nom}</option>)}
                    </select>
                  )}
                </div>
              )}
              {erreurCible && (
                <div style={{ fontSize: 12.5, color: '#dc2626', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px 12px' }}>{erreurCible}</div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ fontSize: 12.5 }} onClick={creerCible}
                  disabled={creatingCible || !cibleCompteId || !cibleAgenda || !cibleLibelle.trim()}>
                  {creatingCible ? 'Création…' : 'Créer la cible'}
                </button>
                <button className="btn btn-ghost" style={{ fontSize: 12.5 }}
                  onClick={() => { setCibleOpen(false); setErreurCible('') }}>Annuler</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
