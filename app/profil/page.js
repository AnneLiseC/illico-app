'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'
import { getObjectifAgente, saveObjectif } from '../lib/objectifs'
import MesCalendriers from '../components/MesCalendriers'
import MonDrive from '../components/MonDrive'

// Page profil de l'utilisateur connecté (pensée pour les agentes ; l'admin gère
// tout via /parametres, mais la page reste consultable sans erreur). Réutilise
// les handlers de parametres, keyés sur le profil connecté (useAuth).
// Sécurité : seuls les champs persos sont éditables ; le DB (trigger
// profiles_protege_identite) verrouille les champs admin-managed même en cas de
// requête forgée. Le RIB est owner (upload/voir) ; le Kbis est admin-only (voir seul).

const fmtPart = (v) => (v === undefined || v === null) ? '—' : `${Math.round(v * 100)} / ${100 - Math.round(v * 100)}`
const roleLabel = (r) => r === 'admin' ? 'Franchisé' : r === 'agente' ? 'Agent' : 'Membre'

// Champ lecture seule (label + valeur). Défini au niveau module : composant
// stable entre les rendus (sinon React recrée le type à chaque render).
const RO = ({ label, value }) => (
  <div>
    <div className="eyebrow" style={{ marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)' }}>{value || '—'}</div>
  </div>
)

// Titre de carte : un cran au-dessus de l'eyebrow (sinon carte et sous-labels se
// confondent). Sépare clairement « bloc » et « champ » dans la hiérarchie visuelle.
const CardTitle = ({ children, sub }) => (
  <div>
    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-900)', letterSpacing: '-0.01em' }}>{children}</div>
    {sub && <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>{sub}</div>}
  </div>
)

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
  const [objInitial, setObjInitial] = useState('')   // valeur chargée → bouton désactivé tant qu'inchangé
  const [objExiste, setObjExiste] = useState(false)
  const [savingObj, setSavingObj] = useState(false)

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
      .then(row => { const m = String(row?.montant ?? ''); setObjMontant(m); setObjInitial(m); setObjExiste(!!row) })
      .catch(() => { /* erreur réseau transitoire : on laisse le champ tel quel */ })
  }, [profile?.id])

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
      { const m = String(row?.montant ?? ''); setObjMontant(m); setObjInitial(m); setObjExiste(!!row) }
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

  // Paliers de commission : liste des splits disponibles ; à défaut, le palier courant.
  const paliers = (profile.parts_agente_disponibles && profile.parts_agente_disponibles.length > 0)
    ? profile.parts_agente_disponibles
    : (profile.part_agente_defaut != null ? [profile.part_agente_defaut] : [])

  const cardStyle = { padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }

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
          <CardTitle>Mes informations</CardTitle>
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
            <CardTitle sub="Tu fixes ton objectif de CA généré pour l'année. Visible dans Finances.">Mon objectif annuel {new Date().getFullYear()}</CardTitle>
            <div>
              <label style={LS}>Objectif de CA (€)</label>
              <div style={{ display: 'flex', gap: 10 }}>
                <input className="input" type="number" min="0" value={objMontant}
                  onChange={e => setObjMontant(e.target.value)}
                  placeholder="ex. 65000" style={{ height: 40, flex: 1 }} />
                <button className="btn btn-primary" onClick={enregistrerObjectif} disabled={savingObj || String(objMontant) === objInitial}>
                  {savingObj ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
              {!objExiste && (
                <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>
                  Aucun objectif défini pour {new Date().getFullYear()}.
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Rémunération (lecture seule — réglée par l'administrateur) ── */}
        <div className="card" style={cardStyle}>
          <CardTitle sub="Réglée par l'administrateur">Rémunération</CardTitle>

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
                    {paliers.length === 0 && <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>—</span>}
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
          <CardTitle>Mes documents</CardTitle>

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
              Kbis <span style={{ fontWeight: 400, color: 'var(--ink-500)', fontSize: 12 }}>· géré par l&apos;administrateur</span>
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
          <CardTitle>Mot de passe</CardTitle>
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

      {/* ── Mes calendriers + Mon Drive ── Agente : ici. Admin : dans /parametres >
          Intégrations (Placement-2) → on ne les affiche pas ici pour lui, pour éviter le doublon. */}
      {profile.role !== 'admin' && (
        <>
          <MesCalendriers profile={profile} onError={setError} onSucces={setSucces} onDefautChange={fetchProfile} />
          <MonDrive profile={profile} onError={setError} onSucces={setSucces} />
        </>
      )}
    </div>
  )
}
