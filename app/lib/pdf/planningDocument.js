// app/lib/pdf/planningDocument.js
// Générateur PDF du PLANNING de chantier (Gantt) — Lot 4-4. Mise en page paysage A4/A3 :
// en-tête, tableau à colonnes activables (lot, artisan, dates, durée, avancement) + zone
// timeline avec une barre par ligne, grille mensuelle et trait « aujourd'hui », puis une
// mention légale en pied. buildPlanningDocument({ dossier, lignes, colonnes, mention, logo,
// format, today }) → élément @react-pdf. Polices (fonts.js) + renderToBuffer : appelant.

import React from 'react'
import { Document, Page, Text, View, Image as PdfImage, StyleSheet } from '@react-pdf/renderer'
import { formatNomClient } from '../clients.js'

const e = React.createElement
const BLEU = '#00578e'
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : ''

// 'YYYY-MM-DD' -> Date locale minuit.
function toDate(v) {
  if (!v) return null
  const m = String(v).slice(0, 10).split('-')
  return m.length === 3 ? new Date(+m[0], +m[1] - 1, +m[2]) : null
}
const JOUR_MS = 86400000
const nbJours = (a, b) => Math.round((b - a) / JOUR_MS)

// Largeurs (pt) des colonnes activables. « lot » toujours présent.
const COLS = {
  lot: { key: 'lot', label: 'Lot / sous-lot', w: 150, always: true },
  artisan: { key: 'artisan', label: 'Artisan', w: 90 },
  debut: { key: 'debut', label: 'Début', w: 52 },
  fin: { key: 'fin', label: 'Fin', w: 52 },
  duree: { key: 'duree', label: 'Durée', w: 40 },
  avancement: { key: 'avancement', label: '%', w: 30 },
}
const ORDRE_COLS = ['lot', 'artisan', 'debut', 'fin', 'duree', 'avancement']

const S = StyleSheet.create({
  page: { padding: 24, paddingBottom: 46, fontFamily: 'Roboto', fontSize: 8.5, backgroundColor: '#fff' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, borderBottomWidth: 2, borderBottomColor: BLEU, paddingBottom: 8 },
  logoImg: { width: 110, height: 44 },
  title: { fontSize: 15, fontFamily: 'Roboto-Bold', color: BLEU },
  sub: { fontSize: 8.5, color: '#374151', marginTop: 2 },
  emis: { fontSize: 8, color: '#6b7280', marginTop: 2 },
  th: { flexDirection: 'row', backgroundColor: BLEU, color: '#fff' },
  thCell: { fontSize: 8, fontFamily: 'Roboto-Bold', paddingVertical: 4, paddingHorizontal: 4 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb', minHeight: 18, alignItems: 'stretch' },
  cell: { fontSize: 8, color: '#1f2937', paddingVertical: 4, paddingHorizontal: 4, justifyContent: 'center' },
  timeline: { position: 'relative', justifyContent: 'center' },
  footer: { position: 'absolute', bottom: 16, left: 24, right: 24, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 5 },
  mention: { fontSize: 7, color: '#6b7280', lineHeight: 1.3 },
  pied: { fontSize: 7, color: '#9ca3af', marginTop: 2, flexDirection: 'row', justifyContent: 'space-between' },
})

// Dimensions utiles (paysage) : A4 = 842x595, A3 = 1191x842. Padding 24 de chaque côté.
const LARGEUR_UTILE = { A4: 842 - 48, A3: 1191 - 48 }

export function buildPlanningDocument({ dossier, lignes = [], colonnes = {}, mention = '', logo = null, format = 'A4', today = null }) {
  const fmt = format === 'A3' ? 'A3' : 'A4'
  const usable = LARGEUR_UTILE[fmt]

  // Colonnes actives (lot toujours) → largeur cumulée.
  const cols = ORDRE_COLS.filter(k => COLS[k].always || colonnes[k])
  const colsW = cols.reduce((s, k) => s + COLS[k].w, 0)
  const tlW = Math.max(120, usable - colsW)   // largeur de la timeline

  // Plage de dates sur les lignes datées.
  const avecDates = lignes.filter(l => l.debut && l.fin)
  let min = null, max = null
  for (const l of avecDates) {
    const a = toDate(l.debut), b = toDate(l.fin)
    if (a && (!min || a < min)) min = a
    if (b && (!max || b > max)) max = b
  }
  // Marge de 2 jours de part et d'autre pour ne pas coller aux bords.
  if (min && max) { min = new Date(min.getTime() - 2 * JOUR_MS); max = new Date(max.getTime() + 2 * JOUR_MS) }
  const span = (min && max) ? Math.max(1, nbJours(min, max)) : 1
  const xOf = (d) => { const t = toDate(d); return t ? Math.max(0, Math.min(tlW, (nbJours(min, t) / span) * tlW)) : 0 }

  // Séparateurs de mois (1er de chaque mois dans la plage) + libellés.
  const mois = []
  if (min && max) {
    const c = new Date(min.getFullYear(), min.getMonth(), 1)
    while (c <= max) {
      if (c >= min) mois.push({ x: xOf(c), label: c.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }) })
      c.setMonth(c.getMonth() + 1)
    }
  }
  const xToday = (today && min && max) ? (() => { const t = toDate(today); return (t >= min && t <= max) ? xOf(today) : null })() : null

  // Grille (mois + aujourd'hui) répétée dans chaque cellule timeline pour un rendu continu.
  const grille = (h) => e(View, { style: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } },
    ...mois.map((m, i) => e(View, { key: 'm' + i, style: { position: 'absolute', top: 0, bottom: 0, left: m.x, width: 0.5, backgroundColor: '#e5e7eb' } })),
    xToday != null ? e(View, { style: { position: 'absolute', top: 0, bottom: 0, left: xToday, width: 1, backgroundColor: '#dc2626' } }) : null,
  )

  const cellStyle = (k) => [S.cell, { width: COLS[k].w }]

  // En-tête timeline (libellés de mois).
  const headerTimeline = e(View, { style: [S.timeline, { width: tlW, height: 16 }] },
    ...mois.map((m, i) => e(Text, { key: 'ml' + i, style: { position: 'absolute', left: m.x + 1, top: 4, fontSize: 7, color: '#6b7280' } }, m.label)),
  )

  const ligneRow = (l, idx) => {
    const cells = cols.map(k => {
      let v = ''
      if (k === 'lot') v = (l.niveau ? '   ↳ ' : '') + (l.nom || '')
      else if (k === 'artisan') v = l.artisan || ''
      else if (k === 'debut') v = fmtDate(l.debut)
      else if (k === 'fin') v = fmtDate(l.fin)
      else if (k === 'duree') v = l.duree != null ? l.duree + ' j' : ''
      else if (k === 'avancement') v = (l.avancement || 0) + ''
      return e(View, { key: k, style: cellStyle(k) },
        e(Text, { style: k === 'lot' ? { fontFamily: l.niveau ? 'Roboto' : 'Roboto-Bold' } : {} }, v))
    })
    const x1 = l.debut ? xOf(l.debut) : 0
    const x2 = l.fin ? xOf(l.fin) : 0
    const barW = Math.max(2, x2 - x1)
    const barStyle = {
      position: 'absolute', left: x1, top: 4, height: 9, width: barW, borderRadius: 2,
      backgroundColor: l.readonly ? '#f3f4f6' : (l.couleur || '#4f46e5'),
    }
    if (l.readonly) { barStyle.borderWidth = 0.6; barStyle.borderColor = '#9ca3af'; barStyle.borderStyle = 'dashed' }
    const bar = (l.debut && l.fin) ? e(View, { style: barStyle },
      // Remplissage d'avancement.
      (!l.readonly && l.avancement) ? e(View, { style: { position: 'absolute', left: 0, top: 0, bottom: 0, width: Math.max(0, Math.min(1, l.avancement / 100)) * barW, backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 2 } }) : null,
    ) : null
    return e(View, { key: l.key || idx, style: S.row, wrap: false },
      ...cells,
      e(View, { style: [S.timeline, { width: tlW }] }, grille(), bar),
    )
  }

  const clientNom = formatNomClient(dossier?.client, { civilite: false }) || dossier?.nom || 'Chantier'

  return e(Document, {},
    e(Page, { size: fmt, orientation: 'landscape', style: S.page },
      // En-tête.
      e(View, { style: S.head },
        e(View, {},
          e(Text, { style: S.title }, 'Planning de chantier'),
          e(Text, { style: S.sub }, clientNom + (dossier?.adresse ? ' — ' + dossier.adresse : '')),
          e(Text, { style: S.emis }, 'Édité le ' + fmtDate(today || new Date().toISOString())),
        ),
        logo ? e(PdfImage, { style: S.logoImg, src: logo }) : null,
      ),
      // En-tête tableau.
      e(View, { style: S.th },
        ...cols.map(k => e(View, { key: k, style: [S.thCell, { width: COLS[k].w }] }, e(Text, {}, COLS[k].label))),
        e(View, { style: [S.thCell, { width: tlW }] }, headerTimeline),
      ),
      // Lignes.
      ...(lignes.length ? lignes.map((l, i) => ligneRow(l, i)) : [e(View, { key: 'vide', style: S.row }, e(Text, { style: [S.cell, { color: '#9ca3af' }] }, 'Aucun lot planifié.'))]),
      // Pied : mention légale + date/pagination.
      e(View, { style: S.footer, fixed: true },
        mention ? e(Text, { style: S.mention }, mention) : null,
        e(View, { style: S.pied },
          e(Text, {}, 'illiCO travaux — planning indicatif, susceptible d’évolution.'),
          e(Text, { render: ({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}` }),
        ),
      ),
    ),
  )
}
