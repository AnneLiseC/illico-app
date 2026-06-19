// app/lib/objectifs.js
// Écriture/lecture des objectifs de CA (table objectifs_ca, grain annuel).
// Source unique partagée (admin via /parametres, agente via /profil).
//
// L'upsert PostgREST ne peut pas cibler les index PARTIELS d'unicité
// (objectifs_ca_agente_unique / objectifs_ca_agence_unique → ON CONFLICT sans
// WHERE = 42P10), d'où le SELECT-puis-UPDATE/INSERT. `societe_id` est dérivé de
// `agence_id` par le trigger objectifs_ca_derive_societe (NE PAS le passer ici).
import { supabase } from './supabase'

// Écrit l'objectif (UPDATE si la ligne existe, sinon INSERT). Throw sur erreur.
// Aucun rafraîchissement : l'appelant recharge ce dont il a besoin.
export async function saveObjectif({ cible, agenteId = null, agenceId, montant, annee = new Date().getFullYear() }) {
  if (!agenceId) throw new Error('agence_id requis (NOT NULL + policy)')
  const montantNum = parseFloat(montant) || 0

  // Clé d'unicité réelle (index partiels) :
  //  - agente : (annee, cible, agente_id)
  //  - agence : (annee, cible, agence_id) WHERE agente_id IS NULL
  let q = supabase.from('objectifs_ca').select('id').eq('annee', annee).eq('cible', cible)
  q = agenteId ? q.eq('agente_id', agenteId) : q.is('agente_id', null).eq('agence_id', agenceId)
  const { data: existing, error: selErr } = await q.maybeSingle()
  if (selErr) throw new Error(selErr.message)

  if (existing) {
    const { error } = await supabase.from('objectifs_ca').update({ montant: montantNum }).eq('id', existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('objectifs_ca')
      .insert({ annee, cible, agente_id: agenteId || null, agence_id: agenceId, montant: montantNum })
    if (error) throw new Error(error.message)
  }
}

// Lit l'objectif PERSONNEL d'une agente pour une année donnée.
// Retourne { id, montant } si la ligne existe, sinon null (≠ montant 0).
export async function getObjectifAgente(agenteId, annee = new Date().getFullYear()) {
  const { data, error } = await supabase
    .from('objectifs_ca')
    .select('id, montant')
    .eq('cible', 'agente')
    .eq('agente_id', agenteId)
    .eq('annee', annee)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ?? null
}
