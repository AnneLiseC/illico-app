'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'

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

  useEffect(() => {
    if (!initialized) return
    if (!user) { router.replace('/login'); return }
    if (profile?.role === 'client') { router.replace('/espace-client'); return }
  }, [initialized, user?.id, profile?.role, router])

  // Initialise le champ téléphone éditable depuis le profil chargé.
  useEffect(() => { if (profile) setTel(profile.telephone || '') }, [profile?.id])

  if (!initialized || !profile) return <div className="page-loading" />

  // ── Handlers (transposés de parametres, keyés sur le profil connecté) ──
  const sauvegarderTel = async () => {
    setSavingTel(true); setError(''); setSucces('')
    const { error } = await supabase.from('profiles').update({ telephone: tel || null }).eq('id', profile.id)
    if (error) setError('Erreur : ' + error.message)
    else { setSucces('Téléphone enregistré ✓'); fetchProfile(user.id) }
    setSavingTel(false)
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

  return (
    <div className="page-enter page-pad" style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 720, margin: '0 auto' }}>

      {/* En-tête */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 4 }}>Mon compte</div>
        <h1 className="page">Mon profil</h1>
      </div>

      {succes && <div style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.3)', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: '#15803d' }}>{succes}</div>}
      {error  && <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: '#dc2626' }}>{error}</div>}

      {/* Mes infos */}
      <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
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

      {/* Rémunération (lecture seule — transparence ; réglée par l'administrateur) */}
      <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="eyebrow">Rémunération · réglée par l'administrateur</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <RO label="Ma part / part agence (commission)" value={fmtPart(profile.part_agente_defaut)} />
          <RO label="Ma part / part agence (frais conso)" value={fmtPart(profile.frais_part_agente_defaut)} />
          <RO label="Redevance mensuelle" value={profile.redevance_mensuelle_ht != null ? `${profile.redevance_mensuelle_ht} € HT` : '—'} />
          <RO label="Début de redevance" value={profile.redevance_debut ? new Date(profile.redevance_debut).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '—'} />
        </div>
      </div>

      {/* Mon RIB (owner : voir + remplacer) */}
      <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="eyebrow">Mon RIB</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: profile.rib_url ? 'var(--ink-700)' : '#a16207' }}>
            {profile.rib_url ? 'Fichier enregistré' : 'Aucun RIB enregistré'}
          </span>
          {profile.rib_url && (
            <button className="btn btn-ghost" onClick={voirRib}>Voir</button>
          )}
          <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
            {uploadingRib ? 'Upload…' : (profile.rib_url ? 'Remplacer' : '+ Ajouter mon RIB')}
            <input type="file" accept=".pdf" style={{ display: 'none' }} disabled={uploadingRib}
              onChange={e => e.target.files[0] && uploadRib(e.target.files[0])} />
          </label>
        </div>
      </div>

      {/* Mon Kbis (admin-only : voir seulement, pas de remplacement) */}
      <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="eyebrow">Mon Kbis</div>
        {profile.kbis_url ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--ink-700)' }}>Fichier disponible</span>
            <button className="btn btn-ghost" onClick={voirKbis}>Voir</button>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>Kbis non disponible — géré par l'administrateur.</div>
        )}
      </div>

      {/* Mot de passe */}
      <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="eyebrow">Mot de passe</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
        </div>
        <button className="btn btn-primary" onClick={changerMotDePasse} disabled={savingPwd || !newPwd || !newPwdConfirm}
          style={{ alignSelf: 'flex-start' }}>
          {savingPwd ? 'Enregistrement…' : 'Changer le mot de passe'}
        </button>
      </div>

    </div>
  )
}
