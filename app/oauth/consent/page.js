'use client'
// app/oauth/consent/page.js
// Page de CONSENTEMENT du serveur OAuth 2.1 de Supabase (connecteur Claude « BATILIS »).
//
// Supabase redirige ici avec ?authorization_id=… (réglage « Authorization Path » =
// /oauth/consent). La page affiche l'application qui demande l'accès, ce qu'elle obtient
// (lecture seule de vos dossiers), et deux boutons : autoriser ou refuser.
// Méthodes : supabase.auth.oauth.getAuthorizationDetails / approveAuthorization /
// denyAuthorization (supabase-js ≥ 2.78).
// https://supabase.com/docs/guides/auth/oauth-server/getting-started
// https://supabase.com/docs/reference/javascript/oauth-server-getauthorizationdetails
//
// Client component : la session de l'app vit dans le navigateur (localStorage), pas en
// cookie. Non connectée → /login?next=… (filtré, cf. oauth-consentement.js) puis retour ici.
// Seuls les rôles admin et agente avec un profil actif peuvent autoriser ; les autres ne
// voient que « Refuser ». Le serveur MCP revérifie rôle et profil actif à chaque appel.

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth-context'
import { CHEMIN_CONSENTEMENT, ROLES_CONNECTEUR } from '../../lib/oauth-consentement'

const ACCES = [
  'Vos dossiers : fiche, statut, client, devis, finances',
  'Vos rendez-vous, interventions et planning',
  'Vos rapports de visite validés et les actions ouvertes',
  'Les attestations (décennale, qualification) des artisans de vos dossiers',
]

const encadre = (couleur, fond, bord) => ({ background: fond, border: `1px solid ${bord}`, borderRadius: 8, padding: '10px 12px', fontSize: 13, color: couleur })
const ENCADRE_ERREUR = encadre('#b91c1c', 'rgba(239,68,68,0.06)', 'rgba(239,68,68,0.2)')

// Plein écran au-dessus de la navigation, comme /login.
function Cadre({ children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, overflow: 'auto', background: 'var(--surface-2)', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="card" style={{ maxWidth: 480, width: '100%', padding: '32px 32px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--brand-800)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 16 }}>Ba</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink-900)' }}>Batilis</div>
            <div style={{ fontSize: 11, color: 'var(--ink-500)', letterSpacing: 0.06, textTransform: 'uppercase' }}>Autorisation d&apos;accès</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function ConsentementOAuth() {
  const { user, profile, initialized, profileStatus } = useAuth()
  // Lu une fois au montage (null côté serveur, où la page n'affiche que le chargement).
  const [authorizationId] = useState(() =>
    typeof window === 'undefined' ? null : (new URLSearchParams(window.location.search).get('authorization_id') || ''))
  const [details, setDetails] = useState(null)
  const [etat, setEtat] = useState('chargement')   // chargement | pret | envoi | erreur
  const [erreur, setErreur] = useState('')

  const autorise = !!profile && ROLES_CONNECTEUR.includes(profile.role) && profile.actif !== false

  useEffect(() => {
    if (!authorizationId || !initialized) return
    if (!user) {
      const retour = `${CHEMIN_CONSENTEMENT}?authorization_id=${encodeURIComponent(authorizationId)}`
      window.location.replace(`/login?next=${encodeURIComponent(retour)}`)
      return
    }
    if (profileStatus === 'loading') return

    let annule = false
    supabase.auth.oauth.getAuthorizationDetails(authorizationId).then(({ data, error }) => {
      if (annule) return
      if (error || !data) {
        setErreur('Demande d\'autorisation introuvable ou expirée. Relancez la connexion depuis Claude.')
        setEtat('erreur')
        return
      }
      // Consentement déjà donné : Supabase renvoie directement l'URL de retour. On ne la
      // suit que pour un compte autorisé ; sinon l'écran de refus s'affiche.
      if (!('authorization_id' in data) && data.redirect_url && autorise) {
        window.location.assign(data.redirect_url)
        return
      }
      setDetails(data)
      setEtat('pret')
    })
    return () => { annule = true }
  }, [authorizationId, initialized, user, profileStatus, autorise])

  const decider = async (approuver) => {
    setEtat('envoi')
    const { data, error } = approuver
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })
    if (error || !data?.redirect_url) {
      setErreur('La réponse n\'a pas pu être envoyée. Relancez la connexion depuis Claude.')
      setEtat('erreur')
      return
    }
    window.location.assign(data.redirect_url)
  }

  if (authorizationId === '') {
    return <Cadre><div style={ENCADRE_ERREUR}>Lien d&apos;autorisation incomplet. Relancez la connexion depuis Claude.</div></Cadre>
  }
  if (etat === 'chargement') {
    return <div className="page-loading" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#fff' }} />
  }
  if (etat === 'erreur') {
    return <Cadre><div style={ENCADRE_ERREUR}>{erreur}</div></Cadre>
  }

  const nomApplication = details?.client?.name || 'Une application'

  return (
    <Cadre>
      <div className="eyebrow" style={{ marginBottom: 6 }}>Connecteur</div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink-900)', letterSpacing: -0.02, margin: 0 }}>
        {nomApplication} demande l&apos;accès à votre compte BATILIS
      </h2>
      {details?.user?.email && (
        <p style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 8 }}>Compte : {details.user.email}</p>
      )}

      {autorise ? (
        <>
          <div style={{ ...encadre('var(--ink-900)', 'rgba(99,102,241,0.06)', 'rgba(99,102,241,0.2)'), marginTop: 18 }}>
            <strong>Lecture seule.</strong> {nomApplication} pourra consulter, sans jamais rien modifier :
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
              {ACCES.map(a => <li key={a}>{a}</li>)}
            </ul>
          </div>
          <p style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 12, lineHeight: 1.6 }}>
            Uniquement les dossiers que vous voyez dans BATILIS. Vous pourrez retirer cet accès à tout moment
            en déconnectant le connecteur dans Claude.
          </p>
        </>
      ) : (
        <div style={{ ...ENCADRE_ERREUR, marginTop: 18 }}>
          Ce connecteur est réservé aux comptes admin et agente actifs. Votre compte ne peut pas l&apos;autoriser.
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
        <button type="button" className="btn btn-ghost" disabled={etat === 'envoi'} onClick={() => decider(false)}
          style={{ flex: 1, height: 44, justifyContent: 'center', fontSize: 14 }}>
          Refuser
        </button>
        {autorise && (
          <button type="button" className="btn btn-primary" disabled={etat === 'envoi'} onClick={() => decider(true)}
            style={{ flex: 1, height: 44, justifyContent: 'center', fontSize: 14, opacity: etat === 'envoi' ? 0.6 : 1 }}>
            {etat === 'envoi' ? 'Envoi…' : 'Autoriser'}
          </button>
        )}
      </div>
    </Cadre>
  )
}
