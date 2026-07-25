// app/api/pdf/restitution.js
// Dossier de restitution : page de garde dynamique + séparateurs illiCO + vraies pièces PDF

import React from 'react'
import { renderToBuffer, Document, Page, Text, View, Image as PdfImage, StyleSheet } from '@react-pdf/renderer'
import '../../lib/pdf/fonts.js'
import RecapHonoraires from '../../lib/pdf/RecapHonoraires.js'
import { formatNomClient } from '../../lib/clients.js'
import { TVA_FRAIS } from '../../lib/finance.js'
import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib'
import { SEP_PAGE_GARDE } from '../../lib/sep_page_garde.js'
import { SEP_DESCRIPTIF }    from '../../lib/sep_descriptif.js'
import { SEP_ILLUSTRATIONS } from '../../lib/sep_illustrations.js'
import { SEP_RECAP }         from '../../lib/sep_recap.js'
import { SEP_DEVIS }         from '../../lib/sep_devis.js'
import { SEP_PLANNING }      from '../../lib/sep_planning.js'
import { SEP_REFS }          from '../../lib/sep_refs.js'
import { SEP_KBIS }         from '../../lib/sep_kbis.js'
import { SEP_QUALIFICATION } from '../../lib/sep_qualification.js'

// ── Couleurs ──
const BLEU  = '#0f766e'
const BLEU2 = '#2f8dcb'
const GRIS  = '#6b7280'
const BLANC = '#ffffff'

const toNum = (v) => {
  if (!v && v !== 0) return 0
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
const fmt = (n) => {
  const v = toNum(n).toFixed(2)
  const [int, dec] = v.split('.')
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + dec + ' €'
}

function getTelReferente(ref) {
  return ref?.telephone || ''
}
function getNomRef(ref) {
  if (!ref) return ''
  return `${ref.prenom || ''} ${(ref.nom || '').toUpperCase()}`.trim()
}

// ── Styles ──
const CS = StyleSheet.create({
  page:        { padding: 28, fontFamily: 'Roboto', fontSize: 9, backgroundColor: '#ffffff' },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 7, borderBottomWidth: 2, borderBottomColor: BLEU },
  logo:        { width: 110, height: 44 },
  headerTitle: { fontSize: 13, fontFamily: 'Roboto-Bold', color: BLEU, textAlign: 'right' },
  headerSub:   { fontSize: 8, color: GRIS, marginTop: 2, textAlign: 'right' },
  sectionH:    { fontSize: 9.5, fontFamily: 'Roboto-Bold', color: BLEU, marginTop: 8, marginBottom: 3, paddingBottom: 2, borderBottomWidth: 1, borderBottomColor: '#e8f4fb' },
  infoRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  infoLabel:   { fontSize: 8, color: GRIS, flex: 1 },
  infoValue:   { fontSize: 8, fontFamily: 'Roboto-Bold' },
  tableHdr:    { flexDirection: 'row', backgroundColor: BLEU, paddingVertical: 3, paddingHorizontal: 4 },
  th:          { color: BLANC, fontSize: 7.5, fontFamily: 'Roboto-Bold' },
  tr:          { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  trAlt:       { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#f0f7fb' },
  trTotal:     { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 4, backgroundColor: BLEU },
  trSub:       { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 4, backgroundColor: '#ddeef8' },
  td:          { fontSize: 7.5 },
  tdB:         { fontSize: 7.5, fontFamily: 'Roboto-Bold' },
  tdR:         { fontSize: 7.5, textAlign: 'right' },
  tdRB:        { fontSize: 7.5, fontFamily: 'Roboto-Bold', textAlign: 'right' },
  tdW:         { fontSize: 7.5, color: BLANC },
  tdWB:        { fontSize: 7.5, fontFamily: 'Roboto-Bold', color: BLANC },
  tdRWB:       { fontSize: 7.5, fontFamily: 'Roboto-Bold', color: BLANC, textAlign: 'right' },
  sumRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  sumLabel:    { fontSize: 7.5, color: GRIS, flex: 1 },
  sumValue:    { fontSize: 7.5, fontFamily: 'Roboto-Bold' },
  sumOrange:   { flexDirection: 'row', justifyContent: 'space-between', padding: 4, backgroundColor: '#fff0e0', marginTop: 2, borderRadius: 2 },
  totalBlock:  { flexDirection: 'row', justifyContent: 'space-between', padding: 7, backgroundColor: BLEU, borderRadius: 4, marginTop: 6 },
  photoImg:    { width: 148, height: 110, objectFit: 'cover', borderRadius: 4 },
  footer:      { position: 'absolute', bottom: 18, left: 28, right: 28, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 4 },
  footerTxt:   { fontSize: 7, color: GRIS },
  footerSlogan:{ fontSize: 7, color: BLEU2, fontFamily: 'Roboto-Italic' },
  // Cover
  coverPage:   { padding: 0, backgroundColor: '#ffffff' },
  coverTopBand:{ height: 8, backgroundColor: '#0f766e' },
  coverLogoArea:{ padding: 30, paddingBottom: 0 },
  coverLogo:   { width: 140, height: 56 },
  coverBlueBand:{ backgroundColor: '#0f766e', paddingVertical: 40, paddingLeft: 32, marginTop: 50 },
  coverTitle:  { color: BLANC, fontSize: 38, fontFamily: 'Roboto-Bold', lineHeight: 1.2 },
  coverOrangeBand:{ backgroundColor: '#f37f2b', height: 14, marginRight: 80 },
  coverBottom: { position: 'absolute', bottom: 56, left: 0, right: 0, alignItems: 'center' },
  coverName:   { fontSize: 11, color: BLEU, textAlign: 'center', marginBottom: 3 },
  coverText:   { fontSize: 10, color: '#374151', textAlign: 'center', marginBottom: 2 },
  coverSlogan: { fontSize: 10, color: BLEU2, textAlign: 'center', fontFamily: 'Roboto-Italic', marginTop: 8 },
  // Suivi paiements
  paiementBloc:        { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 3, padding: 8, marginBottom: 6 },
  paiementHeader:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  paiementHeaderTitle: { fontSize: 9, fontFamily: 'Roboto-Bold' },
  paiementHeaderMontant:{ fontSize: 8, color: GRIS },
  paiementLigne:       { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: '#e5e7eb', paddingVertical: 3 },
  paiementCol:         { fontSize: 8 },
  paiementEmpty:       { fontSize: 8, color: '#9ca3af', fontStyle: 'italic', textAlign: 'center', paddingVertical: 5 },
  paiementTotal:       { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#9ca3af', paddingTop: 5, marginTop: 3 },
})

function Hdr({ title, sub, logo }) {
  return React.createElement(View, { style: CS.header },
    logo ? React.createElement(PdfImage, { src: logo, style: CS.logo }) : null,
    React.createElement(View, { style: { alignItems: 'flex-end' } },
      React.createElement(Text, { style: CS.headerTitle }, title),
      sub && React.createElement(Text, { style: CS.headerSub }, sub),
    ),
  )
}
function Ftr({ ref: r, agenceNom }) {
  return React.createElement(View, { style: CS.footer, fixed: true },
    React.createElement(Text, { style: CS.footerTxt }, `${agenceNom || ''} — ${r}`),
    React.createElement(Text, { style: CS.footerSlogan }, 'Quand vous pensez travaux, pensez illiCO !'),
    React.createElement(Text, { style: CS.footerTxt, render: ({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}` }),
  )
}

// ── Construit la section "Suivi des paiements" pour les PDFs financiers ──
// Option A anti-doublon : les factures_artisans sont la source de vérité comptable.
// L'acompte suivi_financier n'est affiché QUE si aucune facture n'existe pour le devis.
export function buildSuiviPaiementsSection({ devisList, factures, suiviFinancier, dossier }) {
  const fraisTTC = toNum(dossier.frais_consultation)
  const suiviFrais = (suiviFinancier || []).find(s => s.type_echeance === 'frais_consultation')

  const blocs = []

  // ── Bloc frais de consultation ──
  if (fraisTTC > 0 && dossier.frais_statut !== 'offerts') {
    const datePaiement = suiviFrais?.date_paiement ? new Date(suiviFrais.date_paiement).toLocaleDateString('fr-FR') : null
    const paye = dossier.frais_statut === 'regle'
    blocs.push(
      React.createElement(View, { key: 'frais', style: CS.paiementBloc },
        React.createElement(View, { style: CS.paiementHeader },
          React.createElement(Text, { style: CS.paiementHeaderTitle }, 'illiCO travaux — Frais de consultation'),
          React.createElement(Text, { style: CS.paiementHeaderMontant }, `${fmt(fraisTTC)} TTC`),
        ),
        React.createElement(View, { style: CS.paiementLigne },
          React.createElement(Text, { style: [CS.paiementCol, { flex: 2.5, color: GRIS }] }, 'Frais de consultation'),
          React.createElement(Text, { style: [CS.paiementCol, { flex: 1, textAlign: 'right' }] }, datePaiement || '—'),
          React.createElement(Text, { style: [CS.paiementCol, { flex: 1, textAlign: 'right' }] }, fmt(fraisTTC)),
          React.createElement(Text, { style: [CS.paiementCol, { flex: 1, textAlign: 'right', color: paye ? '#16a34a' : '#d97706', fontFamily: 'Roboto-Bold' }] },
            paye ? 'Payé' : 'En attente'),
        ),
      )
    )
  }

  // ── Bloc honoraires illiCO (courtage / AMO) ──
  // Montants lus dans suivi_financier (posés par le RPC suivi_toggle_honoraires) → cohérents
  // avec l'écran. ⚠️ Sur AMO, honoraires_courtage et acompte_amo sont le MÊME encaissement
  // (part courtage vue AMO) : on n'affiche QUE 'Acompte AMO', jamais les deux.
  {
    const typo = dossier.typologie
    const findSuivi = (type) => (suiviFinancier || []).find(s => s.type_echeance === type)
    const estPaye = (s) => s?.statut_client === 'regle'
    const dateDe = (s) => s?.date_paiement ? new Date(s.date_paiement).toLocaleDateString('fr-FR') : '—'
    const honoLignes = []

    if (typo === 'courtage') {
      const courtage = findSuivi('honoraires_courtage')
      if (courtage && toNum(courtage.montant_ttc) > 0) {
        honoLignes.push({ libelle: 'Honoraires courtage', date: dateDe(courtage), montant: toNum(courtage.montant_ttc), paye: estPaye(courtage) })
      }
      const ts = (suiviFinancier || [])
        .filter(s => s.type_echeance === 'honoraires_courtage_ts' && toNum(s.montant_ttc) > 0)
        .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
      ts.forEach((s, i) => honoLignes.push({
        libelle: `Honoraires courtage — travaux suppl.${ts.length > 1 ? ' ' + (i + 1) : ''}`,
        date: dateDe(s), montant: toNum(s.montant_ttc), paye: estPaye(s),
      }))
    } else if (typo === 'amo') {
      const acompte = findSuivi('acompte_amo')
      if (acompte && toNum(acompte.montant_ttc) > 0) {
        honoLignes.push({ libelle: 'Acompte AMO', date: dateDe(acompte), montant: toNum(acompte.montant_ttc), paye: estPaye(acompte) })
      }
      // Solde AMO : tranches encaissées si elles existent (une ligne = un versement reçu),
      // sinon la ligne solde_amo globale.
      const tranches = (suiviFinancier || [])
        .filter(s => s.type_echeance === 'solde_amo_paiement' && toNum(s.montant_ttc) > 0)
        .sort((a, b) => new Date(a.date_paiement || a.created_at || 0) - new Date(b.date_paiement || b.created_at || 0))
      if (tranches.length > 0) {
        tranches.forEach((s, i) => honoLignes.push({
          libelle: `Solde AMO — versement ${i + 1}`, date: dateDe(s), montant: toNum(s.montant_ttc), paye: true,
        }))
      } else {
        const solde = findSuivi('solde_amo')
        if (solde && toNum(solde.montant_ttc) > 0) {
          honoLignes.push({ libelle: 'Solde AMO', date: dateDe(solde), montant: toNum(solde.montant_ttc), paye: estPaye(solde) })
        }
      }
    }

    if (honoLignes.length > 0) {
      const totalHono = honoLignes.reduce((s, l) => s + l.montant, 0)
      const totalPaye = honoLignes.filter(l => l.paye).reduce((s, l) => s + l.montant, 0)
      const reste = totalHono - totalPaye
      const resteColor = reste > 0 ? '#d97706' : '#0f766e'
      const children = [
        React.createElement(View, { key: 'head', style: CS.paiementHeader },
          React.createElement(Text, { style: CS.paiementHeaderTitle }, 'illiCO travaux — Honoraires'),
          React.createElement(Text, { style: CS.paiementHeaderMontant }, `${fmt(totalHono)} TTC`),
        ),
      ]
      honoLignes.forEach((l, i) => children.push(
        React.createElement(View, { key: `h${i}`, style: CS.paiementLigne },
          React.createElement(Text, { style: [CS.paiementCol, { flex: 2.5, color: GRIS }] }, l.libelle),
          React.createElement(Text, { style: [CS.paiementCol, { flex: 1, textAlign: 'right' }] }, l.date),
          React.createElement(Text, { style: [CS.paiementCol, { flex: 1, textAlign: 'right' }] }, fmt(l.montant)),
          React.createElement(Text, { style: [CS.paiementCol, { flex: 1, textAlign: 'right', color: l.paye ? '#16a34a' : '#d97706', fontFamily: 'Roboto-Bold' }] },
            l.paye ? 'Payé' : 'En attente'),
        )
      ))
      children.push(
        React.createElement(View, { key: 'total', style: CS.paiementTotal },
          React.createElement(Text, { style: [CS.paiementCol, { flex: 2.5, fontFamily: 'Roboto-Bold' }] }, 'Total payé'),
          React.createElement(Text, { style: [CS.paiementCol, { flex: 1 }] }, ''),
          React.createElement(Text, { style: [CS.paiementCol, { flex: 1, textAlign: 'right', fontFamily: 'Roboto-Bold' }] }, fmt(totalPaye)),
          React.createElement(Text, { style: [CS.paiementCol, { flex: 1, textAlign: 'right', color: resteColor, fontFamily: 'Roboto-Bold' }] }, `Reste : ${fmt(reste)}`),
        )
      )
      blocs.push(React.createElement(View, { key: 'honoraires', style: CS.paiementBloc, wrap: false }, ...children))
    }
  }

  // ── Un bloc par devis ──
  for (const d of devisList) {
    const ttc = toNum(d.montant_ttc)
    const facturesDevis = (factures || [])
      .filter(f => f.devis_id === d.id)
      .sort((a, b) => {
        const da = a.date_paiement ? new Date(a.date_paiement).getTime() : 0
        const db = b.date_paiement ? new Date(b.date_paiement).getTime() : 0
        return da - db
      })

    // Construction des lignes de paiement
    const lignes = []
    let totalPaye = 0

    if (facturesDevis.length > 0) {
      // Option A : les factures sont la source de vérité, on ignore l'acompte suivi_financier
      for (const f of facturesDevis) {
        const mt = toNum(f.montant_ttc)
        const date = f.date_paiement ? new Date(f.date_paiement).toLocaleDateString('fr-FR') : '—'
        const paye = f.statut === 'paye'
        if (paye) totalPaye += mt
        lignes.push({
          libelle: f.libelle || 'Facture',
          date,
          montant: mt,
          paye,
        })
      }
    } else {
      // Pas de factures : on tombe sur suivi_financier pour l'acompte
      const suiviAcompte = (suiviFinancier || []).find(s =>
        s.type_echeance === 'acompte_artisan' &&
        s.devis_id === d.id &&
        s.statut_client === 'regle'
      )
      if (suiviAcompte) {
        const acompteMontant = d.acompte_pourcentage === -1
          ? toNum(d.acompte_montant_fixe)
          : ttc * (toNum(d.acompte_pourcentage ?? 30) / 100)
        const date = suiviAcompte.date_paiement ? new Date(suiviAcompte.date_paiement).toLocaleDateString('fr-FR') : '—'
        totalPaye += acompteMontant
        lignes.push({
          libelle: 'Acompte',
          date,
          montant: acompteMontant,
          paye: true,
        })
      }
    }

    const reste = ttc - totalPaye

    const children = [
      React.createElement(View, { key: 'head', style: CS.paiementHeader },
        React.createElement(Text, { style: CS.paiementHeaderTitle }, d.artisan?.entreprise || '—'),
        React.createElement(Text, { style: CS.paiementHeaderMontant }, `${fmt(ttc)} TTC`),
      ),
    ]

    if (lignes.length === 0) {
      children.push(
        React.createElement(Text, { key: 'empty', style: CS.paiementEmpty }, 'Aucun paiement enregistré')
      )
    } else {
      lignes.forEach((l, i) => {
        children.push(
          React.createElement(View, { key: `l${i}`, style: CS.paiementLigne },
            React.createElement(Text, { style: [CS.paiementCol, { flex: 2.5, color: GRIS }] }, l.libelle),
            React.createElement(Text, { style: [CS.paiementCol, { flex: 1, textAlign: 'right' }] }, l.date),
            React.createElement(Text, { style: [CS.paiementCol, { flex: 1, textAlign: 'right' }] }, fmt(l.montant)),
            React.createElement(Text, { style: [CS.paiementCol, { flex: 1, textAlign: 'right', color: l.paye ? '#16a34a' : '#d97706', fontFamily: 'Roboto-Bold' }] },
              l.paye ? 'Payé' : 'En attente'),
          )
        )
      })
    }

    // Ligne total
    const resteColor = reste > 0 ? '#d97706' : reste < 0 ? '#dc2626' : '#0f766e'
    const resteLabel = reste < 0 ? `Trop-perçu : ${fmt(Math.abs(reste))}` : `Reste : ${fmt(reste)}`
    children.push(
      React.createElement(View, { key: 'total', style: CS.paiementTotal },
        React.createElement(Text, { style: [CS.paiementCol, { flex: 2.5, fontFamily: 'Roboto-Bold' }] }, 'Total payé'),
        React.createElement(Text, { style: [CS.paiementCol, { flex: 1 }] }, ''),
        React.createElement(Text, { style: [CS.paiementCol, { flex: 1, textAlign: 'right', fontFamily: 'Roboto-Bold' }] }, fmt(totalPaye)),
        React.createElement(Text, { style: [CS.paiementCol, { flex: 1, textAlign: 'right', color: resteColor, fontFamily: 'Roboto-Bold' }] }, resteLabel),
      )
    )

    blocs.push(
      React.createElement(View, { key: d.id, style: CS.paiementBloc, wrap: false }, ...children)
    )
  }

  if (blocs.length === 0) return null

  return React.createElement(View, { style: { marginTop: 14 } },
    React.createElement(Text, { style: CS.sectionH }, 'Suivi des paiements'),
    ...blocs,
  )
}

// ── Page de garde : template illiCO + overlay texte référente ──
async function makeCoverPage({ nomRef, telRef, agence }) {
  // Charger le template (design illiCO sans les coordonnées)
  const tplBytes = Buffer.from(SEP_PAGE_GARDE, 'base64')
  const tplPdf = await PDFDocument.load(tplBytes)
  const finalCover = await PDFDocument.create()
  const [page] = await finalCover.copyPages(tplPdf, [0])
  finalCover.addPage(page)

  // Polices
  const fontNormal = await finalCover.embedFont(StandardFonts.Helvetica)
  const fontBold   = await finalCover.embedFont(StandardFonts.HelveticaBold)

  const pageW = page.getWidth() // 595
  const bleu  = rgb(0/255, 87/255, 142/255)   // #0f766e
  const gris  = rgb(55/255, 65/255, 81/255)    // #374151

  // Lignes de contact — centrées, au-dessus du slogan (y=29)
  const lignes = [
    { text: nomRef,                               font: fontBold,   size: 11, color: bleu },
    { text: `Société ${agence?.societe?.nom_societe || ''}`, font: fontNormal, size: 10, color: gris },
    { text: agence?.adresse || '',                font: fontNormal, size: 10, color: gris },
    { text: `${agence?.code_postal || ''} ${agence?.ville || ''}`.trim(), font: fontNormal, size: 10, color: gris },
    { text: telRef,                               font: fontNormal, size: 10, color: gris },
  ]

  const lineHeight = 17
  const blockHeight = lignes.length * lineHeight
  // Centre de la zone blanche (entre y=55 et y=215) → midY ≈ 135
  const midY = 135
  let y = midY + blockHeight / 2

  for (const { text, font, size, color } of lignes) {
    const textWidth = font.widthOfTextAtSize(text, size)
    const x = (pageW - textWidth) / 2
    page.drawText(text, { x, y, size, font, color })
    y -= lineHeight
  }

  const bytes = await finalCover.save()
  return Buffer.from(bytes)
}

// ── Génère les pages de contenu ──
async function buildContentPDF({ dossier, devis, photos, interventions, factures, suiviFinancier, logo, resumeGenere }) {
  const client = dossier.client
  const ref = dossier.referente
  const nomClient = formatNomClient(client, { civilite: true, withRepresentant: true })
  const TYPO = { courtage: 'Courtage', amo: 'AMO', estimo: 'Estimo', audit_energetique: 'Audit énergétique', studio_jardin: 'Studio de jardin' }
  const nomRef = getNomRef(ref)
  const dateAuj = new Date().toLocaleDateString('fr-FR')

  const devisAcceptes = (devis || []).filter(d => d.statut === 'accepte')
  const totalHT  = devisAcceptes.reduce((s, d) => s + toNum(d.montant_ht), 0)
  const totalTTC = devisAcceptes.reduce((s, d) => s + toNum(d.montant_ttc), 0)
  const fraisTTC = toNum(dossier.frais_consultation)
  const fraisHT  = fraisTTC / TVA_FRAIS
  const isAMO = dossier.typologie === 'amo'
  const photosMaquette = (photos || []).filter(p => p.categorie === 'maquette')

  const acomptesArtisans = devisAcceptes.map(d => {
    const ttc = toNum(d.montant_ttc)
    const pct = toNum(d.acompte_pourcentage ?? 30)
    const montantFixe = toNum(d.acompte_montant_fixe)
    const acompte = pct === -1 ? montantFixe : ttc * (pct / 100)
    const pctLabel = pct === -1 ? '' : ` (${pct}%)`
    const suiviArt = (suiviFinancier || []).find(s => s.type_echeance === 'acompte_artisan' && s.devis_id === d.id)
    const statut = suiviArt?.statut_client === 'regle' ? 'Payé' : 'À régler'
    const couleurStatut = suiviArt?.statut_client === 'regle' ? '#16a34a' : '#d97706'
    return { entreprise: d.artisan?.entreprise || '—', acompte, pctLabel, statut, couleurStatut }
  })
  const totalAcomptes = acomptesArtisans.reduce((s, a) => s + a.acompte, 0)

  const pages = []

  // ── Descriptif du projet ──
  pages.push(
    React.createElement(Page, { key: 'desc', size: 'A4', style: CS.page },
      React.createElement(Hdr, { title: 'Descriptif du projet', sub: `${dossier.reference} — ${nomClient}`, logo }),
      React.createElement(View, null,
        ...[
          ['Référence',          dossier.reference || '—'],
          ['Client',             nomClient],
          client?.adresse ? ['Adresse', client.adresse] : null,
          ['Prestation',         TYPO[dossier.typologie] || dossier.typologie],
          ['Référent',          nomRef],
          dossier.date_demarrage_chantier ? ['Démarrage chantier', new Date(dossier.date_demarrage_chantier).toLocaleDateString('fr-FR')] : null,
          dossier.date_fin_chantier ? ['Fin de chantier', new Date(dossier.date_fin_chantier).toLocaleDateString('fr-FR')] : null,
          ['Document établi le', dateAuj],
        ].filter(Boolean).map(([l, v]) =>
          React.createElement(View, { key: l, style: CS.infoRow },
            React.createElement(Text, { style: CS.infoLabel }, l),
            React.createElement(Text, { style: CS.infoValue }, v),
          )
        ),
      ),
      resumeGenere && React.createElement(View, { style: { marginTop: 12 } },
        React.createElement(Text, { style: CS.sectionH }, 'Résumé du projet'),
        React.createElement(Text, { style: { fontSize: 8.5, lineHeight: 1.6, color: '#374151' } }, resumeGenere),
      ),
      React.createElement(Ftr, { ref: dossier.reference, agenceNom: dossier.agence?.nom }),
    )
  )

  // ── Récapitulatif financier ──
  let rowNum = 0
  pages.push(
    React.createElement(Page, { key: 'recap', size: 'A4', style: CS.page },
      React.createElement(Hdr, { title: 'Récapitulatif financier', sub: `${dossier.reference} — ${nomClient}`, logo }),
      React.createElement(View, { style: CS.tableHdr },
        React.createElement(Text, { style: [CS.th, { width: 18 }] }, ' '),
        React.createElement(Text, { style: [CS.th, { flex: 3 }] }, 'Intervenant'),
        React.createElement(Text, { style: [CS.th, { flex: 4 }] }, 'Description'),
        React.createElement(Text, { style: [CS.th, { flex: 2, textAlign: 'right' }] }, 'Montant HT'),
        React.createElement(Text, { style: [CS.th, { flex: 2, textAlign: 'right' }] }, 'Montant TTC'),
      ),
      fraisTTC > 0 && dossier.frais_statut !== 'offerts' && React.createElement(View, { style: CS.tr },
        React.createElement(Text, { style: [CS.td, { width: 18, color: GRIS }] }, '0'),
        React.createElement(Text, { style: [CS.td, { flex: 3 }] }, 'illiCO travaux'),
        React.createElement(Text, { style: [CS.td, { flex: 4 }] }, 'Frais de consultation'),
        React.createElement(Text, { style: [CS.tdR, { flex: 2 }] }, fmt(fraisHT)),
        React.createElement(Text, { style: [CS.tdRB, { flex: 2 }] }, fmt(fraisTTC)),
      ),
      ...devisAcceptes.map(d => {
        const n = ++rowNum
        return React.createElement(View, { key: d.id, style: n % 2 === 0 ? CS.tr : CS.trAlt },
          React.createElement(Text, { style: [CS.td, { width: 18, color: GRIS }] }, String(n)),
          React.createElement(Text, { style: [CS.td, { flex: 3 }] }, d.artisan?.entreprise || '—'),
          React.createElement(Text, { style: [CS.td, { flex: 4, color: GRIS }] }, d.notes || '—'),
          React.createElement(Text, { style: [CS.tdR, { flex: 2 }] }, fmt(d.montant_ht)),
          React.createElement(Text, { style: [CS.tdRB, { flex: 2 }] }, fmt(d.montant_ttc)),
        )
      }),
      React.createElement(View, { style: CS.trSub },
        React.createElement(Text, { style: [CS.tdB, { width: 18 }] }, ' '),
        React.createElement(Text, { style: [CS.tdB, { flex: 9 }] }, 'Total HT'),
        React.createElement(Text, { style: [CS.tdRB, { flex: 2, color: BLEU }] }, fmt(totalHT + fraisHT)),
        React.createElement(Text, { style: { flex: 2 } }, ''),
      ),
      React.createElement(View, { style: CS.trTotal },
        React.createElement(Text, { style: [CS.tdW, { width: 18 }] }, ' '),
        React.createElement(Text, { style: [CS.tdWB, { flex: 9 }] }, 'Total TTC'),
        React.createElement(Text, { style: { flex: 2 } }, ''),
        React.createElement(Text, { style: [CS.tdRWB, { flex: 2 }] }, fmt(totalTTC + fraisTTC)),
      ),
      // Acomptes artisans avec statut Payé / À régler
      acomptesArtisans.length > 0 && React.createElement(View, { style: { marginTop: 6 } },
        React.createElement(Text, { style: CS.sectionH }, 'Acomptes entreprises'),
        ...acomptesArtisans.map((a, i) =>
          React.createElement(View, { key: i, style: CS.infoRow },
            React.createElement(Text, { style: [CS.infoLabel, { flex: 1 }] }, `${a.entreprise}${a.pctLabel}`),
            React.createElement(Text, { style: { fontSize: 7.5, color: a.couleurStatut, fontFamily: 'Roboto-Bold', width: 54, textAlign: 'center' } }, a.statut),
            React.createElement(Text, { style: [CS.infoValue, { width: 72, textAlign: 'right' }] }, fmt(a.acompte)),
          )
        ),
        React.createElement(View, { style: [CS.infoRow, { backgroundColor: '#ddeef8', paddingHorizontal: 4, borderRadius: 3 }] },
          React.createElement(Text, { style: [CS.tdB, { flex: 1 }] }, 'Total acomptes artisans'),
          React.createElement(Text, { style: [CS.tdRB, { color: BLEU, fontSize: 9 }] }, fmt(totalAcomptes)),
        ),
      ),
      // Honoraires — composant partagé (source unique, branché finance.js)
      React.createElement(RecapHonoraires, { dossier, devis, suiviFinancier, preview: false }),
      React.createElement(Ftr, { ref: dossier.reference, agenceNom: dossier.agence?.nom }),
    )
  )

  // ── Suivi des paiements (page séparée) ──
  pages.push(
    React.createElement(Page, { key: 'suivi-paiements', size: 'A4', style: CS.page },
      React.createElement(Hdr, { title: 'Suivi des paiements', sub: `${dossier.reference} — ${nomClient}`, logo }),
      buildSuiviPaiementsSection({ devisList: devisAcceptes, factures, suiviFinancier, dossier }),
      React.createElement(Ftr, { ref: dossier.reference, agenceNom: dossier.agence?.nom }),
    )
  )

  // ── Planning (AMO) ──
  if (isAMO && (interventions || []).length > 0) {
    pages.push(
      React.createElement(Page, { key: 'plan', size: 'A4', style: CS.page },
        React.createElement(Hdr, { title: 'Planning des interventions', sub: `${dossier.reference} — ${nomClient}`, logo }),
        React.createElement(View, { style: CS.tableHdr },
          React.createElement(Text, { style: [CS.th, { flex: 3 }] }, 'Artisan'),
          React.createElement(Text, { style: [CS.th, { flex: 2 }] }, 'Type'),
          React.createElement(Text, { style: [CS.th, { flex: 4, textAlign: 'center' }] }, 'Période'),
        ),
        ...(interventions || []).map((i, idx) => React.createElement(View, { key: i.id, style: idx % 2 === 0 ? CS.tr : CS.trAlt },
          React.createElement(Text, { style: [CS.tdB, { flex: 3 }] }, i.artisan?.entreprise || '—'),
          React.createElement(Text, { style: [CS.td, { flex: 2 }] }, i.type_intervention === 'periode' ? 'Période' : 'Jours spécifiques'),
          React.createElement(Text, { style: [CS.td, { flex: 4, textAlign: 'center' }] },
            i.type_intervention === 'periode'
              ? `${i.date_debut ? new Date(i.date_debut).toLocaleDateString('fr-FR') : '?'} → ${i.date_fin ? new Date(i.date_fin).toLocaleDateString('fr-FR') : '?'}`
              : `${(i.jours_specifiques || []).slice(0, 4).map(j => new Date(j).toLocaleDateString('fr-FR')).join(', ')}${(i.jours_specifiques || []).length > 4 ? '…' : ''}`
          ),
        )),
        React.createElement(Text, { style: { fontSize: 7, color: GRIS, fontFamily: 'Roboto-Italic', marginTop: 14, lineHeight: 1.4 } },
          "Ce planning est communiqué à titre purement indicatif et ne possède aucune valeur contractuelle.",
        ),
        React.createElement(Ftr, { ref: dossier.reference, agenceNom: dossier.agence?.nom }),
      )
    )
  }

  // ── Photos maquette ──
  if (photosMaquette.length > 0) {
    for (let i = 0; i < photosMaquette.length; i += 2) {
      const chunk = photosMaquette.slice(i, i + 2)
      pages.push(
        React.createElement(Page, { key: `maq-${i}`, size: 'A4', style: CS.page },
          React.createElement(Hdr, { title: 'Illustrations & vues 3D', sub: `${dossier.reference} — ${nomClient}`, logo }),
          React.createElement(View, { style: { flexDirection: 'column', flex: 1, justifyContent: 'space-between', paddingBottom: 40 } },
            ...chunk.filter(p => p.base64).map(ph =>
              React.createElement(View, { key: ph.id, style: { flex: 1, marginVertical: 4 } },
                React.createElement(PdfImage, { src: ph.base64, style: { width: '100%', height: '100%', objectFit: 'contain' } }),
              )
            ),
          ),
          React.createElement(Text, { style: { position: 'absolute', bottom: 40, left: 38, right: 38, fontSize: 7, color: GRIS, fontFamily: 'Roboto-Italic', lineHeight: 1.4 } },
            "Les illustrations graphiques reproduites sont des illustrations commerciales qui ne peuvent servir de base à la réalisation du chantier.",
          ),
          React.createElement(Ftr, { ref: dossier.reference, agenceNom: dossier.agence?.nom }),
        )
      )
    }
  }

  return renderToBuffer(React.createElement(Document, null, ...pages))
}

// ── Génère un résumé IA du projet via l'API Anthropic ──
async function generateResumeProjet({ crR1, description, devisNotes }) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const parts = []
  if (description) parts.push(`Description du projet : ${description}`)
  if (crR1?.contenu_final) parts.push(`Compte-rendu de première visite (R1) :\n${crR1.contenu_final}`)
  const notes = (devisNotes || []).filter(Boolean)
  if (notes.length > 0) parts.push(`Descriptions des devis artisans :\n- ${notes.join('\n- ')}`)

  if (parts.length === 0) return null

  const prompt = `Tu es un assistant pour illiCO travaux, une société de courtage en travaux et assistance à maîtrise d'ouvrage dans le bâtiment. 
  À partir des éléments ci-dessous, rédige un résumé professionnel et synthétique du projet de rénovation. Le résumé doit être clair, fluide, en français, sans bullet points, en 3 à 5 phrases maximum. Ne mentionne pas les artisans ni les montants. Parle du projet du point de vue du client.

${parts.join('\n\n')}

Résumé :`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!response.ok) return null
    const data = await response.json()
    return data.content?.[0]?.text?.trim() || null
  } catch {
    return null
  }
}

// ── Télécharger un PDF depuis Supabase Storage ──
async function downloadPDF(supabaseAdmin, bucket, path) {
  try {
    const { data, error } = await supabaseAdmin.storage.from(bucket).download(path)
    if (error || !data) return null
    return Buffer.from(await data.arrayBuffer())
  } catch {
    return null
  }
}

// ── DOSSIER R3 (présentation devis avant signature) ──
// Génère la page récap du R3 : tableau devis reçus + acomptes + honoraires + TOTAL PROJET
// Simulation "si tu signes tout"
async function buildR3ContentPDF({ dossier, devisR3, logo, resumeGenere }) {
  const client = dossier.client
  const ref = dossier.referente
  const nomClient = formatNomClient(client, { civilite: true, withRepresentant: true })
  const TYPO = { courtage: 'Courtage', amo: 'AMO', estimo: 'Estimo', audit_energetique: 'Audit énergétique', studio_jardin: 'Studio de jardin' }
  const nomRef = getNomRef(ref)
  const dateAuj = new Date().toLocaleDateString('fr-FR')

  const totalHT  = devisR3.reduce((s, d) => s + toNum(d.montant_ht), 0)
  const totalTTC = devisR3.reduce((s, d) => s + toNum(d.montant_ttc), 0)
  const fraisTTC = toNum(dossier.frais_consultation)
  const fraisHT  = fraisTTC / TVA_FRAIS

  let rowNum = 0
  const showFrais = fraisTTC > 0 && dossier.frais_statut !== 'offerts'

  const pages = [
    // ── Descriptif du projet ──
    React.createElement(Page, { key: 'desc', size: 'A4', style: CS.page },
      React.createElement(Hdr, { title: 'Descriptif du projet', sub: `${dossier.reference} — ${nomClient}`, logo }),
      React.createElement(View, null,
        ...[
          ['Référence',          dossier.reference || '—'],
          ['Client',             nomClient],
          client?.adresse ? ['Adresse', client.adresse] : null,
          ['Prestation',         TYPO[dossier.typologie] || dossier.typologie],
          ['Référent',          nomRef],
          ['Document établi le', dateAuj],
        ].filter(Boolean).map(([l, v]) =>
          React.createElement(View, { key: l, style: CS.infoRow },
            React.createElement(Text, { style: CS.infoLabel }, l),
            React.createElement(Text, { style: CS.infoValue }, v),
          )
        ),
      ),
      resumeGenere && React.createElement(View, { style: { marginTop: 12 } },
        React.createElement(Text, { style: CS.sectionH }, 'Résumé du projet'),
        React.createElement(Text, { style: { fontSize: 8.5, lineHeight: 1.6, color: '#374151' } }, resumeGenere),
      ),
      React.createElement(Text, { style: { fontSize: 7, color: GRIS, fontFamily: 'Roboto-Italic', marginTop: 16, lineHeight: 1.4 } },
        "Ce document présente l'ensemble des devis reçus et signés pour votre projet. Les devis signés sont déjà engagés ; les devis à valider constituent une simulation sous réserve de signature.",
      ),
      React.createElement(Ftr, { ref: dossier.reference, agenceNom: dossier.agence?.nom }),
    ),
    // ── Récapitulatif financier (simulation) ──
    React.createElement(Page, { key: 'recap', size: 'A4', style: CS.page },
      React.createElement(Hdr, { title: 'Récapitulatif financier', sub: `${dossier.reference} — ${nomClient}`, logo }),
      React.createElement(Text, { style: { fontSize: 7.5, color: '#f37f2b', fontFamily: 'Roboto-Italic', marginBottom: 5 } },
        "Vue globale — devis signés (engagés) et devis à valider. Les montants définitifs dépendent de la signature des devis en attente.",
      ),
      React.createElement(View, { style: CS.tableHdr },
        React.createElement(Text, { style: [CS.th, { width: 18 }] }, ' '),
        React.createElement(Text, { style: [CS.th, { flex: 3 }] }, 'Intervenant'),
        React.createElement(Text, { style: [CS.th, { flex: 3 }] }, 'Description'),
        React.createElement(Text, { style: [CS.th, { flex: 1.3, textAlign: 'center' }] }, 'Statut'),
        React.createElement(Text, { style: [CS.th, { flex: 2, textAlign: 'right' }] }, 'Montant HT'),
        React.createElement(Text, { style: [CS.th, { flex: 2, textAlign: 'right' }] }, 'Montant TTC'),
      ),
      showFrais && React.createElement(View, { style: CS.tr },
        React.createElement(Text, { style: [CS.td, { width: 18, color: GRIS }] }, '0'),
        React.createElement(Text, { style: [CS.td, { flex: 3 }] }, 'illiCO travaux'),
        React.createElement(Text, { style: [CS.td, { flex: 3 }] }, 'Frais de consultation'),
        React.createElement(Text, { style: [CS.td, { flex: 1.3, textAlign: 'center', color: GRIS }] }, '—'),
        React.createElement(Text, { style: [CS.tdR, { flex: 2 }] }, fmt(fraisHT)),
        React.createElement(Text, { style: [CS.tdRB, { flex: 2 }] }, fmt(fraisTTC)),
      ),
      ...devisR3.map(d => {
        const n = ++rowNum
        const estSigne = d.statut === 'accepte'
        return React.createElement(View, { key: d.id, style: n % 2 === 0 ? CS.tr : CS.trAlt },
          React.createElement(Text, { style: [CS.td, { width: 18, color: GRIS }] }, String(n)),
          React.createElement(Text, { style: [CS.td, { flex: 3 }] }, d.artisan?.entreprise || '—'),
          React.createElement(Text, { style: [CS.td, { flex: 3, color: GRIS }] }, d.notes || '—'),
          React.createElement(Text, { style: [CS.td, { flex: 1.3, textAlign: 'center', color: estSigne ? '#16a34a' : '#d97706', fontFamily: 'Roboto-Bold' }] },
            estSigne ? 'Signé' : 'À valider'),
          React.createElement(Text, { style: [CS.tdR, { flex: 2 }] }, fmt(d.montant_ht)),
          React.createElement(Text, { style: [CS.tdRB, { flex: 2 }] }, fmt(d.montant_ttc)),
        )
      }),
      React.createElement(View, { style: CS.trSub },
        React.createElement(Text, { style: [CS.tdB, { width: 18 }] }, ' '),
        React.createElement(Text, { style: [CS.tdB, { flex: 7.3 }] }, 'Total HT'),
        React.createElement(Text, { style: [CS.tdRB, { flex: 2, color: BLEU }] }, fmt(totalHT + (showFrais ? fraisHT : 0))),
        React.createElement(Text, { style: { flex: 2 } }, ''),
      ),
      React.createElement(View, { style: CS.trTotal },
        React.createElement(Text, { style: [CS.tdW, { width: 18 }] }, ' '),
        React.createElement(Text, { style: [CS.tdWB, { flex: 7.3 }] }, 'Total TTC'),
        React.createElement(Text, { style: { flex: 2 } }, ''),
        React.createElement(Text, { style: [CS.tdRWB, { flex: 2 }] }, fmt(totalTTC + (showFrais ? fraisTTC : 0))),
      ),
      // Acomptes (simulation)
      devisR3.length > 0 && React.createElement(View, { style: { marginTop: 14 } },
        React.createElement(Text, { style: CS.sectionH }, 'Acomptes entreprises'),
        ...devisR3.map(d => {
          const ttc = toNum(d.montant_ttc)
          const acompte = d.acompte_pourcentage === -1 ? toNum(d.acompte_montant_fixe) : ttc * (toNum(d.acompte_pourcentage ?? 30) / 100)
          const pct = d.acompte_pourcentage === -1 ? '' : ` (${d.acompte_pourcentage ?? 30}%)`
          return React.createElement(View, { key: d.id, style: CS.sumRow },
            React.createElement(Text, { style: CS.sumLabel }, `${d.artisan?.entreprise || '—'}${pct}`),
            React.createElement(Text, { style: CS.sumValue }, fmt(acompte)),
          )
        }),
        React.createElement(View, { style: CS.trSub },
          React.createElement(Text, { style: [CS.tdB, { flex: 1 }] }, 'Total acomptes artisans'),
          React.createElement(Text, { style: [CS.tdRB, { color: BLEU }] }, fmt(
            devisR3.reduce((sum, d) => {
              const ttc = toNum(d.montant_ttc)
              const acompte = d.acompte_pourcentage === -1 ? toNum(d.acompte_montant_fixe) : ttc * (toNum(d.acompte_pourcentage ?? 30) / 100)
              return sum + acompte
            }, 0)
          )),
        ),
      ),
      // Honoraires — composant partagé (source unique, branché finance.js)
      React.createElement(RecapHonoraires, { dossier, devis: devisR3, preview: true }),
      React.createElement(Ftr, { ref: dossier.reference, agenceNom: dossier.agence?.nom }),
    ),
  ]

  return renderToBuffer(React.createElement(Document, null, ...pages))
}

// ── DOSSIER DE SUIVI (fusion R3 + Restitution selon statut) ──
// Génère un dossier adaptatif selon l'avancement du dossier :
//   - Phase avant signature (devis_en_attente, devis_a_modifier…) → style R3 : devis reçus + récap
//   - en_cours_chantier → devis signés + KBIS/assurances + FT
//   - termine → restitution complète avec photos, planning, etc.
export async function buildDossierSuivi({ dossier, devis, photos, interventions, fichesTech, docsRestitution, factures, suiviFinancier, adminFranchise, logo, supabaseAdmin }) {
  const statut = dossier.statut || 'en_cours_chantier'
  const isPreSignature = ['a_contacter', 'a_relancer', 'devis_en_attente', 'devis_a_modifier'].includes(statut)
  const isTermine = statut === 'termine'
  const isAMO = dossier.typologie === 'amo'

  // Filtrage devis selon le stade
  const devisR3 = (devis || []).filter(d => d.statut === 'recu' || d.statut === 'accepte')
  const devisAcceptes = (devis || []).filter(d => d.statut === 'accepte')
  const devisActifs = isPreSignature ? devisR3 : devisAcceptes

  const photosMaquette = (photos || []).filter(p => p.categorie === 'maquette')
  const hasFichesTech = (fichesTech || []).length > 0
  const hasQualif = devisAcceptes.some(d => d.artisan?.qualification_url)

  // Factures honoraires (CTP→client) : à embarquer dans le bloc Factures, pas
  // dans le bloc générique « autres documents ». categorie='facture_honoraire'.
  const facturesHonoraires = (docsRestitution || []).filter(d => d.categorie === 'facture_honoraire')
  const autresDocs = (docsRestitution || []).filter(d => d.categorie !== 'facture_honoraire')

  // Documents « Illustrations & vues 3D » : détectés par le NOM de fichier
  // (plan/plans, vue/vues, coupe/coupes, 3D). Cochés dans_restitution → ils vont
  // dans la section Illustrations plutôt que dans le bloc « autres documents ».
  // Match par MOT ENTIER (« plan_rdc.pdf » ✓ mais « planning.pdf » ✗) + motif « 3d ».
  const MOTS_ILLU = new Set(['plan', 'plans', 'vue', 'vues', 'coupe', 'coupes'])
  const estIllustration = (d) => {
    const n = (d.nom || '').toLowerCase()
    if (n.includes('3d')) return true
    return n.split(/[^a-z0-9]+/).some(t => MOTS_ILLU.has(t))
  }
  const docsIllustration = autresDocs.filter(estIllustration)
  const autresDocsRest = autresDocs.filter(d => !estIllustration(d))

  const loadSep = async (b64) => PDFDocument.load(Buffer.from(b64, 'base64'))
  const [sepDescriptif, sepIllustrations, sepRecap, sepDevis, sepPlanning, sepRefs, sepKbis, sepQualification] = await Promise.all([
    loadSep(SEP_DESCRIPTIF), loadSep(SEP_ILLUSTRATIONS), loadSep(SEP_RECAP),
    loadSep(SEP_DEVIS), loadSep(SEP_PLANNING), loadSep(SEP_REFS),
    loadSep(SEP_KBIS), loadSep(SEP_QUALIFICATION),
  ])

  // Charger CR R1
  const { data: crsData } = await supabaseAdmin.from('comptes_rendus')
    .select('id, type_visite, contenu_final').eq('dossier_id', dossier.id).order('created_at')
  const crR1 = crsData?.find(cr => cr.type_visite === 'r1') || null

  // Générer le résumé IA
  const devisNotes = (devisActifs || []).map(d => d.notes).filter(Boolean)
  const resumeGenere = await generateResumeProjet({ crR1, description: dossier.description, devisNotes })

  // Générer les pages de contenu (descriptif + récap)
  const contentBuffer = isPreSignature
    ? await buildR3ContentPDF({ dossier, devisR3: devisActifs, logo, resumeGenere })
    : await buildContentPDF({ dossier, devis: devisActifs, photos, interventions, factures, suiviFinancier, logo, resumeGenere })
  const contentPdf = await PDFDocument.load(contentBuffer)

  const final = await PDFDocument.create()
  let cIdx = 0

  const addSep = async (sepPdf) => {
    const [p] = await final.copyPages(sepPdf, [0])
    final.addPage(p)
  }
  const addContent = async () => {
    const [p] = await final.copyPages(contentPdf, [cIdx++])
    final.addPage(p)
  }
  const addExternalPDF = async (buf) => {
    if (!buf) return
    try {
      const ext = await PDFDocument.load(buf)
      const copied = await final.copyPages(ext, ext.getPageIndices())
      copied.forEach(p => {
        const { width, height } = p.getSize()
        if (width > height) p.setRotation(degrees(90))
        final.addPage(p)
      })
    } catch {}
  }
  // Ajoute une pièce document : PDF (fusionné) OU image jpg/png (posée pleine page A4).
  // Les autres formats (heic/webp) sont ignorés silencieusement (limite pdf-lib).
  const addDocumentPiece = async (doc) => {
    const buf = await downloadPDF(supabaseAdmin, 'documents', doc.path)
    if (!buf) return
    const mime = (doc.type_mime || '').toLowerCase()
    const nom = (doc.nom || '').toLowerCase()
    const estImage = mime.startsWith('image/') || /\.(jpe?g|png)$/.test(nom)
    if (!estImage) { await addExternalPDF(buf); return }
    try {
      const estPng = mime.includes('png') || nom.endsWith('.png')
      const img = estPng ? await final.embedPng(buf) : await final.embedJpg(buf)
      const A4 = [595.28, 841.89]
      const page = final.addPage(A4)
      const dim = img.scale(1)
      const scale = Math.min((A4[0] - 80) / dim.width, (A4[1] - 80) / dim.height, 1)
      const w = dim.width * scale, h = dim.height * scale
      page.drawImage(img, { x: (A4[0] - w) / 2, y: (A4[1] - h) / 2, width: w, height: h })
    } catch { /* image non intégrable : ignorée */ }
  }

  // ── Page de garde ──
  const nomRef = getNomRef(dossier.referente)
  const telRef = getTelReferente(dossier.referente) || dossier.agence?.telephone || ''
  const coverBuf = await makeCoverPage({ nomRef, telRef, agence: dossier.agence })
  const coverPdf = await PDFDocument.load(coverBuf)
  const [coverPage] = await final.copyPages(coverPdf, [0])
  final.addPage(coverPage)

  // ── Descriptif du projet ──
  await addSep(sepDescriptif)
  await addContent()

  // ── Récapitulatif financier ──
  await addSep(sepRecap)
  await addContent()  // page récap financier
  if (!isPreSignature) {
    await addContent()  // page suivi des paiements
  }

  // ── Devis / Factures / PV — groupés PAR DEVIS ──
  // Post-signature : pour chaque devis accepté → devis signé (ou original) →
  //   ses factures (liées par devis_id) → son PV de réception.
  // Pré-signature : seulement les devis reçus/acceptés (ni factures ni PV).
  await addSep(sepDevis)
  if (!isPreSignature) {
    for (const d of devisR3) {
      const pathDevis = d.devis_signe_path || d.devis_pdf_path
      if (pathDevis) {
        const buf = await downloadPDF(supabaseAdmin, 'documents', pathDevis)
        await addExternalPDF(buf)
      }
      const facturesDevis = (factures || []).filter(f => f.devis_id === d.id)
      for (const f of facturesDevis) {
        if (f.pdf_path) {
          const buf = await downloadPDF(supabaseAdmin, 'documents', f.pdf_path)
          await addExternalPDF(buf)
        }
      }
      if (d.pv_path) {
        const buf = await downloadPDF(supabaseAdmin, 'documents', d.pv_path)
        await addExternalPDF(buf)
      }
    }
    // Factures honoraires (CTP→client) — chantier_documents categorie='facture_honoraire'
    // cochés dans_restitution. Bloc séparé (vient de docsRestitution, pas factures_artisans).
    for (const d of facturesHonoraires) {
      const buf = await downloadPDF(supabaseAdmin, 'documents', d.path)
      await addExternalPDF(buf)
    }
  } else {
    for (const d of devisR3) {
      const path = d.devis_signe_path || d.devis_pdf_path
      if (path) {
        const buf = await downloadPDF(supabaseAdmin, 'documents', path)
        await addExternalPDF(buf)
      }
    }
  }

  // ── Qualifications (si présentes et stade post-signature) ──
  if (!isPreSignature && hasQualif) {
    await addSep(sepQualification)
    for (const d of devisAcceptes) {
      if (d.artisan?.qualification_url) {
        const buf = await downloadPDF(supabaseAdmin, 'documents', d.artisan.qualification_url)
        await addExternalPDF(buf)
      }
    }
  }

  // ── Planning (AMO + post-signature + chantier terminé) ──
  if (isAMO && !isPreSignature && isTermine && (interventions || []).length > 0) {
    await addSep(sepPlanning)
    await addContent()
  }

  // ── Illustrations & vues 3D ──
  // Photos maquette (rendues dans le contenu, si chantier terminé) + documents
  // plan/vue/coupe/3D cochés dans_restitution (PDF ou image).
  const hasIllustrations = (isTermine && photosMaquette.length > 0) || docsIllustration.length > 0
  if (hasIllustrations) {
    await addSep(sepIllustrations)
    if (isTermine && photosMaquette.length > 0) {
      const nbPhotoPages = Math.ceil(photosMaquette.length / 2)
      for (let i = 0; i < nbPhotoPages; i++) {
        await addContent()
      }
    }
    for (const doc of docsIllustration) {
      await addDocumentPiece(doc)
    }
  }

  // ── Références produits / FT (si cochées) ──
  if (hasFichesTech) {
    await addSep(sepRefs)
    for (const ft of (fichesTech || [])) {
      const url = ft.fiche?.url || ft.url
      if (url) {
        const buf = await downloadPDF(supabaseAdmin, 'documents', url)
        await addExternalPDF(buf)
      }
    }
  }

  // ── KBIS + Assurances (post-signature) ──
  if (!isPreSignature) {
    await addSep(sepKbis)
    for (const d of devisAcceptes) {
      const art = d.artisan || {}
      if (art.kbis_url) {
        const buf = await downloadPDF(supabaseAdmin, 'documents', art.kbis_url)
        await addExternalPDF(buf)
      }
      if (art.decennale_url) {
        const buf = await downloadPDF(supabaseAdmin, 'documents', art.decennale_url)
        await addExternalPDF(buf)
      }
    }
  }

  // ── KBIS + RIB du franchisé (admin de la société) — post-signature, sans séparateur. Non bloquant. ──
  if (!isPreSignature) {
    if (adminFranchise?.kbis_url) {
      const buf = await downloadPDF(supabaseAdmin, 'documents', adminFranchise.kbis_url)
      await addExternalPDF(buf)
    }
    if (adminFranchise?.rib_url) {
      const buf = await downloadPDF(supabaseAdmin, 'documents', adminFranchise.rib_url)
      await addExternalPDF(buf)
    }
  }

  // ── Autres documents chantier cochés "dans_restitution" (hors factures honoraires
  //    et hors plans/vues/coupes/3D, déjà placés dans la section Illustrations) ──
  if (autresDocsRest.length > 0) {
    for (const doc of autresDocsRest) {
      const buf = await downloadPDF(supabaseAdmin, 'documents', doc.path)
      await addExternalPDF(buf)
    }
  }

  const bytes = await final.save()
  return Buffer.from(bytes)
}