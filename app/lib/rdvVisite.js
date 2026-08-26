// app/lib/rdvVisite.js
// Rattache un compte-rendu à son rendez-vous de visite (colonne comptes_rendus.visite_rdv_id).
// Règle : si un RDV du bon type existe déjà à la date du CR, on le rattache ; sinon on le
// crée (9 h, heure de Paris) puis on le pousse au calendrier (même endpoint que la fiche RDV).
// Appelé côté client (session utilisateur) : `supabase` authentifié + `apiFetch` authentifié.
import { parisLocalToInstant } from './dates'

// type_visite (comptes_rendus) -> type_rdv (rendez_vous)
export const TYPE_VISITE_VERS_RDV = {
  r1: 'visite_technique_client',
  r2: 'visite_technique_artisan',
  r3: 'presentation_devis',
  suivi: 'suivi',
  reception: 'reception',
}

export async function lierOuCreerRdvVisite({ supabase, apiFetch, crId, dossierId, agenceId = null, typeVisite, dateVisite }) {
  const typeRdv = TYPE_VISITE_VERS_RDV[typeVisite]
  // Pas de type mappable (ex. visite non typée) ou pas de date → on ne fait rien.
  if (!crId || !dossierId || !typeRdv || !dateVisite) return null

  // 1) Un RDV du même type existe-t-il ce jour-là ?
  const debut = parisLocalToInstant(`${dateVisite}T00:00`)
  const fin = parisLocalToInstant(`${dateVisite}T23:59`)
  let rdvId = null
  if (debut && fin) {
    const { data: existants } = await supabase.from('rendez_vous')
      .select('id')
      .eq('dossier_id', dossierId).eq('type_rdv', typeRdv)
      .gte('date_heure', debut).lte('date_heure', fin)
      .order('date_heure').limit(1)
    if (existants && existants.length) rdvId = existants[0].id
  }

  // 2) Sinon on le crée (owner_id / tenant posés par le trigger agenda_derive_tenant) + push.
  if (!rdvId) {
    const { data: cree, error } = await supabase.from('rendez_vous').insert({
      dossier_id: dossierId,
      type_rdv: typeRdv,
      date_heure: parisLocalToInstant(`${dateVisite}T09:00`),
      duree_minutes: 60,
      lieu: 'client',
      agence_id: agenceId || null,
    }).select('id').single()
    if (error || !cree) return null
    rdvId = cree.id
    // Push calendrier — non bloquant, comme partout ailleurs dans l'app.
    try {
      apiFetch('/api/google/calendar/push', {
        method: 'POST', body: JSON.stringify({ type: 'rdv', id: rdvId }),
      }).catch(() => {})
    } catch { /* push best-effort */ }
  }

  // 3) Rattachement au compte-rendu.
  await supabase.from('comptes_rendus').update({ visite_rdv_id: rdvId }).eq('id', crId)
  return rdvId
}
