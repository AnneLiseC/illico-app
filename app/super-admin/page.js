'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth-context'
import { apiFetch } from '../lib/api-auth-client'

// ESPACE CRÉATRICE (super-admin éditrice). Gardé côté client par l'email
// (isSuperAdmin) ; la VRAIE sécurité est côté serveur sur les routes
// /api/super-admin/* (requireSuperAdmin). Cette page ne montre JAMAIS de
// données tenant (dossiers/clients/finances) — uniquement des COMPTES.
export default function SuperAdmin() {
  const { user, isSuperAdmin, initialized } = useAuth()
  const router = useRouter()

  const [demandes, setDemandes]   = useState([])
  const [societes, setSocietes]   = useState([])
  const [chargement, setChargement] = useState(true)
  const [busyId, setBusyId]       = useState(null)   // id de demande en cours (valider/rejeter)
  const [erreur, setErreur]       = useState('')
  const [succes, setSucces]       = useState('')

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteBusy, setInviteBusy]   = useState(false)

  const charger = async () => {
    try {
      const [rReq, rAcc] = await Promise.all([
        apiFetch('/api/super-admin/agent-requests'),
        apiFetch('/api/super-admin/accounts'),
      ])
      const dReq = await rReq.json().catch(() => ({}))
      const dAcc = await rAcc.json().catch(() => ({}))
      if (rReq.ok) setDemandes(dReq.demandes || [])
      if (rAcc.ok) setSocietes(dAcc.societes || [])
      setChargement(false)
    } catch { setChargement(false) /* réseau : on garde l'état existant */ }
  }

  useEffect(() => {
    if (!initialized) return
    if (!isSuperAdmin) { router.replace(user ? '/dashboard' : '/login'); return }
    // Chargement au montage : le setState n'a lieu qu'après le fetch (await),
    // encapsulé pour ne pas être un appel setState « synchrone » dans l'effet.
    ;(async () => { await charger() })()
  }, [initialized, user, isSuperAdmin, router])

  if (!initialized || !user || !isSuperAdmin) {
    return <div className="page-loading" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#fff' }} />
  }

  const logout = async () => { await supabase.auth.signOut(); router.replace('/login') }

  const traiter = async (id, action) => {
    if (action === 'reject' && !window.confirm('Rejeter cette demande ? Aucun compte ne sera créé.')) return
    setBusyId(id); setErreur(''); setSucces('')
    try {
      const res = await apiFetch(`/api/super-admin/agent-requests/${id}`, { method: 'POST', body: JSON.stringify({ action }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) setErreur(data.error || 'Erreur')
      else { setSucces(action === 'fulfill' ? 'Agent créé et invité ✓' : 'Demande rejetée ✓'); await charger() }
    } catch (err) { setErreur(err.message) }
    setBusyId(null)
  }

  const inviterAdmin = async () => {
    const email = inviteEmail.trim()
    if (!email) return
    setInviteBusy(true); setErreur(''); setSucces('')
    try {
      const res = await apiFetch('/api/super-admin/invite-admin', { method: 'POST', body: JSON.stringify({ email }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) setErreur(data.error || 'Erreur')
      else { setSucces(`Invitation admin envoyée à ${email} ✓`); setInviteEmail('') }
    } catch (err) { setErreur(err.message) }
    setInviteBusy(false)
  }

  const enAttente = demandes.filter(d => d.statut === 'en_attente')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-2, #f7f8fa)', padding: '40px 24px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* En-tête */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--brand-800)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800 }}>Co</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink-900)' }}>Espace créatrice</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>{user.email}</div>
            </div>
          </div>
          <button onClick={logout} className="btn btn-ghost" style={{ fontSize: 13 }}>Se déconnecter</button>
        </div>

        {succes && <div style={{ background: 'rgba(22,163,74,0.07)', border: '1px solid rgba(22,163,74,0.25)', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: '#15803d' }}>{succes}</div>}
        {erreur && <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: '#b91c1c' }}>{erreur}</div>}

        {/* Demandes d'agents à valider */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink-900)', marginBottom: 4 }}>Demandes d&apos;agents</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-500)', marginBottom: 16 }}>Valider = le compte est créé et l&apos;invitation envoyée. Les redevances et parts sont réglées ensuite par le franchisé.</div>

          {chargement ? (
            <div style={{ fontSize: 13, color: 'var(--ink-400)' }}>Chargement…</div>
          ) : enAttente.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--ink-400)', textAlign: 'center', padding: '16px 0' }}>Aucune demande en attente.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {enAttente.map(d => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 14px', border: '1px solid var(--ink-200)', borderRadius: 10 }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-900)' }}>{d.prenom} {d.nom}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>{d.email}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-400)', marginTop: 2 }}>
                      {d.societe?.nom_societe || '—'}{d.agence?.nom ? ` · ${d.agence.nom}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost" style={{ fontSize: 12.5, padding: '6px 12px', color: 'var(--bad)', borderColor: 'rgba(239,68,68,0.3)' }}
                      onClick={() => traiter(d.id, 'reject')} disabled={busyId === d.id}>Rejeter</button>
                    <button className="btn btn-primary" style={{ fontSize: 12.5, padding: '6px 14px', opacity: busyId === d.id ? 0.5 : 1 }}
                      onClick={() => traiter(d.id, 'fulfill')} disabled={busyId === d.id}>
                      {busyId === d.id ? '…' : 'Valider'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Inviter un admin franchisé */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink-900)', marginBottom: 4 }}>Inviter un admin franchisé</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-500)', marginBottom: 14 }}>Il recevra une invitation et créera sa société + sa première agence à la première connexion.</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input className="input" type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
              placeholder="admin@illico-travaux.com" style={{ flex: 1, minWidth: 240 }} />
            <button className="btn btn-primary" onClick={inviterAdmin}
              disabled={inviteBusy || !inviteEmail.trim()} style={{ opacity: (inviteBusy || !inviteEmail.trim()) ? 0.5 : 1 }}>
              {inviteBusy ? 'Envoi…' : 'Inviter'}
            </button>
          </div>
        </div>

        {/* Annuaire des comptes */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink-900)', marginBottom: 4 }}>Comptes par société</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-500)', marginBottom: 16 }}>Comptes utilisateurs uniquement (franchisés et agents). Aucune donnée métier.</div>

          {chargement ? (
            <div style={{ fontSize: 13, color: 'var(--ink-400)' }}>Chargement…</div>
          ) : societes.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--ink-400)', textAlign: 'center', padding: '16px 0' }}>Aucune société.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {societes.map(s => (
                <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink-900)' }}>{s.nom_societe || '—'}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-400)' }}>{s.agences.length} agence{s.agences.length > 1 ? 's' : ''} · {s.comptes.length} compte{s.comptes.length > 1 ? 's' : ''}</div>
                  </div>
                  {s.comptes.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: 'var(--ink-400)', paddingLeft: 2 }}>Aucun compte.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {s.comptes.map(c => {
                        const ag = s.agences.find(a => a.id === c.agence_id)
                        return (
                          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, padding: '6px 10px', background: 'var(--surface-2)', borderRadius: 8 }}>
                            <span style={{ fontWeight: 600, color: 'var(--ink-800)' }}>{c.prenom} {c.nom}</span>
                            <span style={{ color: 'var(--ink-500)' }}>{c.email}</span>
                            <span style={{ padding: '1px 8px', borderRadius: 99, fontSize: 10.5, fontWeight: 700, background: c.role === 'admin' ? 'rgba(0,87,142,0.1)' : 'var(--ink-100)', color: c.role === 'admin' ? 'var(--brand-800)' : 'var(--ink-600)' }}>
                              {c.role === 'admin' ? 'Franchisé' : 'Agent'}
                            </span>
                            {ag && <span style={{ fontSize: 11.5, color: 'var(--ink-400)' }}>{ag.nom}</span>}
                            {c.actif === false && <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>· désactivé</span>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ fontSize: 11.5, color: 'var(--ink-400)', textAlign: 'center' }}>
          Cloisonnement : cette page ne voit que les comptes. Jamais les dossiers, les clients, ni les finances.
        </div>
      </div>
    </div>
  )
}
