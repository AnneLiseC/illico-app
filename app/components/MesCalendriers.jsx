'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { authHeaders } from '../lib/api-auth-client'

// Carte « Mes calendriers » (lot 8) extraite de profil/page.js (Placement-1) — comptes
// connectés + agendas (8a/8b), connexion/déconnexion iCloud (8c), cibles + renommage (8d/8f),
// badge multi-fournisseur. Autonome et réutilisable (profil ET parametres).
//
// Props :
//   profile  : le profil connecté (role, id, agence_id, societe_id).
//   onError  / onSucces : pilotent le bandeau global de la page hôte (succès/erreur), pour
//              un comportement identique à l'inline d'origine. Les erreurs de FORMULAIRE
//              (iCloud, création de cible) restent internes (erreurIcloud / erreurCible).

const cardStyle = { padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }

export default function MesCalendriers({ profile, onError, onSucces, onDefautChange }) {
  // Comptes connectés du user + leurs agendas (8b, lecture seule).
  const [comptesCal, setComptesCal] = useState([])
  const [agendas, setAgendas] = useState({}) // { [compteId]: { loading, error, reconnect, items } }
  // Formulaire de connexion iCloud (8c)
  const [icloudOpen, setIcloudOpen] = useState(false)
  const [appleId, setAppleId] = useState('')
  const [appPassword, setAppPassword] = useState('')
  const [connectingIcloud, setConnectingIcloud] = useState(false)
  const [erreurIcloud, setErreurIcloud] = useState('') // erreur affichée DANS le formulaire
  // Cibles calendrier (8d) : liste + formulaire de création
  const [cibles, setCibles] = useState([])
  const [agences, setAgences] = useState([]) // agences de la société (admin → cible d'agence)
  const [cibleOpen, setCibleOpen] = useState(false)
  const [cibleCompteId, setCibleCompteId] = useState('')
  const [cibleAgenda, setCibleAgenda] = useState('')
  const [cibleLibelle, setCibleLibelle] = useState('')
  const [ciblePerimetre, setCiblePerimetre] = useState('') // admin : choix FORCÉ (pas de défaut) ; agente : ignoré → perso d'office (creerCible)
  const [cibleAgenceId, setCibleAgenceId] = useState('')
  const [creatingCible, setCreatingCible] = useState(false)
  const [erreurCible, setErreurCible] = useState('')
  const [cibleEditId, setCibleEditId] = useState(null)    // cible en cours de renommage
  const [cibleEditLibelle, setCibleEditLibelle] = useState('')
  const [cibleDefautId, setCibleDefautId] = useState(null) // profiles.cible_calendrier_defaut_id (8e)

  // Charge les comptes calendrier du user (RLS comptes_oauth_own) puis, pour chacun, ses
  // agendas via la route 8a (Bearer authHeaders). LECTURE SEULE. Réutilisable après
  // connexion / déconnexion d'un compte (8c).
  const chargerComptes = useCallback(async () => {
    if (!profile) return
    // Fournisseurs CALENDRIER uniquement : on exclut les comptes Drive (ex. 'microsoft'
    // = OneDrive, géré par le composant MonDrive), qui partagent la table comptes_oauth
    // mais n'ont ni agenda ni cible. Sinon un compte Drive s'afficherait à tort ici et
    // /api/calendar/list échouerait dessus (token Files, pas Calendar).
    const { data } = await supabase.from('comptes_oauth')
      .select('id, fournisseur, compte_email, caldav_username').eq('user_id', profile.id)
      .in('fournisseur', ['google', 'icloud', 'outlook'])
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

  // Cibles visibles du user (RLS SELECT = perso ∪ agence ∪ admin-société) + sa cible par
  // défaut perso (profiles.cible_calendrier_defaut_id, RLS profiles own). LECTURE.
  const chargerCibles = useCallback(async () => {
    if (!profile) return
    const { data } = await supabase.from('cibles_calendrier')
      .select('id, fournisseur, calendar_id, compte_oauth_id, libelle, agenda_nom, user_id, agence_id, actif')
    setCibles(data || [])
    const { data: prof } = await supabase.from('profiles')
      .select('cible_calendrier_defaut_id').eq('id', profile.id).single()
    setCibleDefautId(prof?.cible_calendrier_defaut_id || null)
  }, [profile?.id])

  // Agences de la société (admin uniquement, pour créer une cible d'agence).
  const chargerAgences = useCallback(async () => {
    if (!profile || profile.role !== 'admin') return
    const { data } = await supabase.from('agences').select('id, nom').eq('societe_id', profile.societe_id)
    setAgences(data || [])
    setCibleAgenceId(prev => prev || data?.[0]?.id || '')
  }, [profile?.id, profile?.role, profile?.societe_id])

  useEffect(() => { chargerCibles(); chargerAgences() }, [chargerCibles, chargerAgences])

  if (!profile) return null

  // ── Helpers d'affichage ──
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

  const compteSel = comptesCal.find(c => c.id === cibleCompteId)
  const agendasSel = agendas[cibleCompteId]?.items || []
  const labelPerimetre = (c) => c.agence_id ? 'Agence' : 'Perso'
  // Nom de l'agenda : agenda_nom STOCKÉ d'abord (stable côté admin sans charger le compte
  // d'autrui) ; sinon résolution via les agendas chargés ; sinon l'id brut en dernier recours.
  const labelAgenda = (c) => {
    if (c.agenda_nom) return c.agenda_nom
    const found = agendas[c.compte_oauth_id]?.items?.find(x => x.externalId === c.calendar_id)
    return found?.label || c.calendar_id
  }
  // L'UI reflète la RLS cibles_write : perso supprimable par son propriétaire ; agence par
  // l'admin. La RLS reste le vrai garde-fou (un delete hors périmètre affecte 0 ligne).
  const peutSupprimer = (c) => (c.user_id && c.user_id === profile.id) || (profile.role === 'admin' && !!c.agence_id)

  const connecterGoogle = async () => {
    onError(''); onSucces('')
    try {
      const res = await fetch('/api/auth/google', { method: 'POST', headers: await authHeaders() })
      const d = await res.json()
      if (res.ok && d.url) window.location.href = d.url
      else onError(d.error || 'Erreur de connexion Google')
    } catch { onError('Erreur de connexion Google') }
  }

  const connecterIcloud = async () => {
    setConnectingIcloud(true); setErreurIcloud(''); onSucces('')
    try {
      const res = await fetch('/api/calendar/icloud/connect', {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ appleId, appPassword }),
      })
      const d = await res.json()
      if (res.ok) {
        onSucces('Compte iCloud connecté ✓')
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
    onError(''); onSucces('')
    try {
      const res = await fetch('/api/calendar/account/disconnect', {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ compte_oauth_id: c.id }),
      })
      const d = await res.json()
      if (res.ok) { onSucces('Compte déconnecté ✓'); await chargerComptes() }
      else onError(d.error || 'Déconnexion impossible')
    } catch { onError('Déconnexion impossible') }
  }

  // Création d'une cible (insert AUTHENTIFIÉ → RLS cibles_write : agente=perso,
  // admin=perso+agence ; le trigger derive_societe remplit societe_id ; created_by défaut).
  const creerCible = async () => {
    setCreatingCible(true); setErreurCible('')
    if (!compteSel || !cibleAgenda || !cibleLibelle.trim()) {
      setErreurCible('Compte, agenda et libellé requis'); setCreatingCible(false); return
    }
    // Admin : le périmètre est un CHOIX FORCÉ (ni défaut, ni déduction). L'agente n'a pas de
    // sélecteur → ciblePerimetre reste '' et retombe sur la branche perso (user_id = self).
    if (profile.role === 'admin' && !ciblePerimetre) {
      setErreurCible('Choisis un périmètre : Perso ou Agence'); setCreatingCible(false); return
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
      // nom lisible de l'agenda choisi (capturé depuis la liste 8a), stocké pour affichage stable
      agenda_nom: agendasSel.find(a => a.externalId === cibleAgenda)?.label || null,
      ...perimetre,
    })
    if (error) setErreurCible('Création refusée : ' + error.message)
    else {
      onSucces('Calendrier cible ajouté ✓')
      setCibleOpen(false); setCibleCompteId(''); setCibleAgenda(''); setCibleLibelle(''); setCiblePerimetre(''); setErreurCible('')
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
    onError(''); onSucces('')
    // RLS cibles_write borne la suppression ; .select → 0 ligne = hors périmètre (non bloquant).
    const { data, error } = await supabase.from('cibles_calendrier').delete().eq('id', cible.id).select('id')
    if (error) onError('Suppression impossible : ' + error.message)
    else if (!data || data.length === 0) onError('Suppression non autorisée pour cette cible.')
    else { onSucces('Cible supprimée ✓'); await chargerCibles() }
  }

  // Renomme une cible : n'écrit QUE libelle (pas calendar_id / agenda_nom / périmètre).
  // RLS cibles_update borne (owner perso, admin agence) ; .select → 0 ligne = non autorisé.
  const renommerCible = async (cible) => {
    const nom = cibleEditLibelle.trim()
    if (!nom) return
    onError(''); onSucces('')
    const { data, error } = await supabase.from('cibles_calendrier')
      .update({ libelle: nom }).eq('id', cible.id).select('id')
    if (error) onError('Renommage impossible : ' + error.message)
    else if (!data || data.length === 0) onError('Renommage non autorisé pour cette cible.')
    else { onSucces('Cible renommée ✓'); setCibleEditId(null); await chargerCibles() }
  }

  // Définit (ou retire si re-clic) SA cible par défaut perso. Le défaut alimente la
  // pré-sélection à la création d'un RDV (lot 3, resoudreCibleDefaut). Éligibilité = toute
  // cible visible (= la liste). RLS profiles own (chacun son défaut). FK SET NULL si la
  // cible défaut est supprimée plus tard (8d).
  const definirDefaut = async (cible) => {
    const nouvelId = cibleDefautId === cible.id ? null : cible.id
    onError(''); onSucces('')
    const { error } = await supabase.from('profiles')
      .update({ cible_calendrier_defaut_id: nouvelId }).eq('id', profile.id)
    if (error) onError('Impossible de définir le défaut : ' + error.message)
    else {
      onSucces(nouvelId ? 'Cible par défaut définie ✓' : 'Cible par défaut retirée ✓')
      setCibleDefautId(nouvelId)
      onDefautChange?.() // rafraîchit le profil du contexte → pré-sélection planning à jour
    }
  }

  return (
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
            Génère un mot de passe d&apos;application sur{' '}
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
          <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>Connecte d&apos;abord un compte ci-dessus.</div>
        )}

        {cibles.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cibles.map(c => {
              const editing = cibleEditId === c.id
              return (
                <div key={c.id} style={{ border: '1px solid var(--ink-200)', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {editing ? (
                      <input className="input" value={cibleEditLibelle} onChange={e => setCibleEditLibelle(e.target.value)}
                        autoFocus style={{ height: 34, width: '100%', maxWidth: 280 }} />
                    ) : (
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-900)' }}>
                        {c.libelle}
                        <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: 'var(--ink-100)', color: 'var(--ink-600)' }}>{labelPerimetre(c)}</span>
                        {cibleDefautId === c.id && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: '#b45309' }}>★ par défaut</span>}
                        {!c.actif && <span style={{ marginLeft: 6, fontSize: 10.5, color: '#a16207' }}>· inactive</span>}
                      </div>
                    )}
                    <div style={{ fontSize: 11.5, color: 'var(--ink-500)' }}>
                      {labelFournisseur(c.fournisseur)} · {labelAgenda(c)}
                      {!c.compte_oauth_id && <span style={{ color: '#dc2626' }}> · compte déconnecté</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {editing ? (
                      <>
                        <button className="btn btn-primary" style={{ fontSize: 11.5 }} onClick={() => renommerCible(c)} disabled={!cibleEditLibelle.trim()}>Valider</button>
                        <button className="btn btn-ghost" style={{ fontSize: 11.5 }} onClick={() => setCibleEditId(null)}>Annuler</button>
                      </>
                    ) : (
                      <>
                        {/* Défaut : éligible pour TOUTE cible visible (= resoudreCibleDefaut) */}
                        <button className="btn btn-ghost" style={{ fontSize: 11.5, color: cibleDefautId === c.id ? '#b45309' : undefined }}
                          onClick={() => definirDefaut(c)}>{cibleDefautId === c.id ? '★ Par défaut' : 'Définir par défaut'}</button>
                        {peutSupprimer(c) && (
                          <>
                            <button className="btn btn-ghost" style={{ fontSize: 11.5 }} onClick={() => { setCibleEditId(c.id); setCibleEditLibelle(c.libelle); onError('') }}>Renommer</button>
                            <button className="btn btn-ghost" style={{ fontSize: 11.5 }} onClick={() => supprimerCible(c)}>Supprimer</button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
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
                {/* Plusieurs agences → choix ; une seule → prise d'office (cibleAgenceId déjà
                    initialisé dans chargerAgences), affichée en texte. */}
                {ciblePerimetre === 'agence' && agences.length > 1 && (
                  <select className="input" value={cibleAgenceId} onChange={e => setCibleAgenceId(e.target.value)} style={{ height: 36, maxWidth: 220 }}>
                    {agences.map(ag => <option key={ag.id} value={ag.id}>{ag.nom}</option>)}
                  </select>
                )}
                {ciblePerimetre === 'agence' && agences.length === 1 && (
                  <span style={{ fontSize: 12.5, color: 'var(--ink-600)' }}>Agence : {agences[0].nom}</span>
                )}
                {!ciblePerimetre && (
                  <span style={{ fontSize: 11.5, color: '#a16207' }}>Choisis Perso ou Agence pour continuer.</span>
                )}
              </div>
            )}
            {erreurCible && (
              <div style={{ fontSize: 12.5, color: '#dc2626', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px 12px' }}>{erreurCible}</div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ fontSize: 12.5 }} onClick={creerCible}
                disabled={creatingCible || !cibleCompteId || !cibleAgenda || !cibleLibelle.trim()
                  || (profile.role === 'admin' && (!ciblePerimetre || (ciblePerimetre === 'agence' && !cibleAgenceId)))}>
                {creatingCible ? 'Création…' : 'Créer la cible'}
              </button>
              <button className="btn btn-ghost" style={{ fontSize: 12.5 }}
                onClick={() => { setCibleOpen(false); setErreurCible('') }}>Annuler</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
