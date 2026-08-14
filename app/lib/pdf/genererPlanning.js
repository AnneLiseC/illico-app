// app/lib/pdf/genererPlanning.js
// Génère le PDF du PLANNING (Gantt) d'un dossier — Lot 4-4. Reçoit un client Supabase admin.
// Charge lots (+ artisan/jours travaillés pour la durée) et interventions non rattachées,
// aplatit en lignes (lot racine puis ses sous-lots), calcule la durée en jours ouvrés, rend.
// Renvoie { buffer, dossier }.

import path from 'path'
import fs from 'fs'
import { renderToBuffer } from '@react-pdf/renderer'
import './fonts.js'
import { buildPlanningDocument } from './planningDocument.js'
import { dureeJours } from '../joursOuvres.js'

function getLogoBase64() {
  try {
    const p = path.join(process.cwd(), 'public', 'logo.png')
    if (!fs.existsSync(p)) return null
    return `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`
  } catch { return null }
}

export async function genererPlanningPDF(db, dossierId, { format = 'A4', colonnes = {}, mention = '', today = null } = {}) {
  const { data: dossier } = await db.from('dossiers')
    .select('*, client:clients(*)').eq('id', dossierId).maybeSingle()
  if (!dossier) throw new Error('Dossier introuvable')

  const { data: lots } = await db.from('lots')
    .select('id, parent_lot_id, nom, artisan_id, intervention_id, date_debut, date_fin, avancement, couleur, ordre, created_at, artisan:artisans(entreprise, metier, jours_travailles)')
    .eq('dossier_id', dossierId).order('ordre').order('created_at')
  const listeLots = lots || []

  const { data: inters } = await db.from('interventions_artisans')
    .select('id, date_debut, date_fin, type_intervention, artisan:artisans(entreprise, metier)')
    .eq('dossier_id', dossierId)
    .eq('type_intervention', 'periode')   // cohérent avec l'éditeur : seules les périodes sont des barres
  const interLiees = new Set(listeLots.map(l => l.intervention_id).filter(Boolean).map(String))

  const mapLigne = (l) => ({
    key: l.id,
    niveau: l.parent_lot_id ? 1 : 0,
    nom: l.nom || 'Lot',
    artisan: l.artisan?.entreprise || l.artisan?.metier || '',
    debut: l.date_debut || null,
    fin: l.date_fin || null,
    duree: (l.date_debut && l.date_fin) ? dureeJours(l.date_debut, l.date_fin) : null,
    avancement: l.avancement || 0,
    couleur: l.couleur || '#4f46e5',
    readonly: false,
  })

  // Aplatissement : chaque lot racine suivi de ses sous-lots.
  const racines = listeLots.filter(l => !l.parent_lot_id)
  const sousDe = (pid) => listeLots.filter(l => l.parent_lot_id === pid)
  const lignes = []
  for (const r of racines) {
    lignes.push(mapLigne(r))
    for (const s of sousDe(r.id)) lignes.push(mapLigne(s))
  }
  // Interventions non rattachées à un lot → lignes lecture seule.
  for (const it of (inters || [])) {
    if (!it.date_debut || !it.date_fin) continue
    if (interLiees.has(String(it.id))) continue
    lignes.push({
      key: 'int_' + it.id, niveau: 0,
      nom: (it.artisan?.entreprise || it.artisan?.metier || 'Intervention') + ' (intervention)',
      artisan: it.artisan?.entreprise || it.artisan?.metier || '',
      debut: it.date_debut, fin: it.date_fin, duree: null, avancement: 0, couleur: '#9ca3af', readonly: true,
    })
  }

  const doc = buildPlanningDocument({
    dossier, lignes, colonnes, mention, logo: getLogoBase64(), format,
    today: today || new Date().toISOString(),
  })
  const buffer = await renderToBuffer(doc)
  return { buffer, dossier }
}
