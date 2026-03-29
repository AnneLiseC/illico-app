// app/api/pdf/restitution.js
// Dossier de restitution : page de garde dynamique + séparateurs illiCO + vraies pièces PDF

import React from 'react'
import { renderToBuffer, Document, Page, Text, View, Image as PdfImage, StyleSheet } from '@react-pdf/renderer'
import { PDFDocument, degrees } from 'pdf-lib'
import { SEP_DESCRIPTIF }    from '../../lib/sep_descriptif.js'
import { SEP_ILLUSTRATIONS } from '../../lib/sep_illustrations.js'
import { SEP_RECAP }         from '../../lib/sep_recap.js'
import { SEP_DEVIS }         from '../../lib/sep_devis.js'
import { SEP_PLANNING }      from '../../lib/sep_planning.js'
import { SEP_REFS }          from '../../lib/sep_refs.js'
import { SEP_KBIS }         from '../../lib/sep_kbis.js'
import { SEP_QUALIFICATION } from '../../lib/sep_qualification.js'

// ── Couleurs ──
const BLEU  = '#00578e'
const BLEU2 = '#2f8dcb'
const GRIS  = '#6b7280'
const BLANC = '#ffffff'
const VERT  = '#166534'

const toNum = (v) => {
  if (!v && v !== 0) return 0
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
const fmt = (n) => `${toNum(n).toFixed(2).replace('.', ',')} €`

function getTelReferente(ref) {
  if (!ref) return '06 59 81 06 81'
  const p = (ref.prenom || '').toLowerCase()
  if (p === 'marine') return '06 59 81 06 81'
  if (p.includes('anne')) return '06 74 95 04 02'
  return ref.telephone || '06 59 81 06 81'
}
function getNomRef(ref) {
  if (!ref) return 'Marine MICHELANGELI'
  const p = (ref.prenom || '').toLowerCase()
  if (p === 'marine') return 'Marine MICHELANGELI'
  if (p.includes('anne')) return 'Anne-Lise CAILLET'
  return `${ref.prenom || ''} ${(ref.nom || '').toUpperCase()}`.trim()
}

// ── Styles ──
const CS = StyleSheet.create({
  page:        { padding: 38, fontFamily: 'Helvetica', fontSize: 9, backgroundColor: '#ffffff' },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: BLEU },
  logo:        { width: 110, height: 44 },
  headerTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: BLEU, textAlign: 'right' },
  headerSub:   { fontSize: 8, color: GRIS, marginTop: 2, textAlign: 'right' },
  sectionH:    { fontSize: 10, fontFamily: 'Helvetica-Bold', color: BLEU, marginTop: 14, marginBottom: 5, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: '#e8f4fb' },
  infoRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  infoLabel:   { fontSize: 8, color: GRIS, flex: 1 },
  infoValue:   { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  tableHdr:    { flexDirection: 'row', backgroundColor: BLEU, paddingVertical: 5, paddingHorizontal: 4 },
  th:          { color: BLANC, fontSize: 8, fontFamily: 'Helvetica-Bold' },
  tr:          { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  trAlt:       { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#f0f7fb' },
  trTotal:     { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 4, backgroundColor: BLEU },
  trSub:       { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 4, backgroundColor: '#ddeef8' },
  td:          { fontSize: 8 },
  tdB:         { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  tdR:         { fontSize: 8, textAlign: 'right' },
  tdRB:        { fontSize: 8, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  tdW:         { fontSize: 8, color: BLANC },
  tdWB:        { fontSize: 8, fontFamily: 'Helvetica-Bold', color: BLANC },
  tdRWB:       { fontSize: 8, fontFamily: 'Helvetica-Bold', color: BLANC, textAlign: 'right' },
  sumRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  sumLabel:    { fontSize: 8, color: GRIS, flex: 1 },
  sumValue:    { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  sumOrange:   { flexDirection: 'row', justifyContent: 'space-between', padding: 6, backgroundColor: '#fff0e0', marginTop: 2, borderRadius: 2 },
  totalBlock:  { flexDirection: 'row', justifyContent: 'space-between', padding: 9, backgroundColor: BLEU, borderRadius: 4, marginTop: 8 },
  photoImg:    { width: 148, height: 110, objectFit: 'cover', borderRadius: 4 },
  footer:      { position: 'absolute', bottom: 22, left: 38, right: 38, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 5 },
  footerTxt:   { fontSize: 7, color: GRIS },
  footerSlogan:{ fontSize: 7, color: BLEU2, fontFamily: 'Helvetica-Oblique' },
  // Cover
  coverPage:   { padding: 0, backgroundColor: '#ffffff' },
  coverTopBand:{ height: 8, backgroundColor: '#00578e' },
  coverLogoArea:{ padding: 30, paddingBottom: 0 },
  coverLogo:   { width: 140, height: 56 },
  coverBlueBand:{ backgroundColor: '#00578e', paddingVertical: 40, paddingLeft: 32, marginTop: 50 },
  coverTitle:  { color: BLANC, fontSize: 38, fontFamily: 'Helvetica-Bold', lineHeight: 1.2 },
  coverOrangeBand:{ backgroundColor: '#f37f2b', height: 14, marginRight: 80 },
  coverBottom: { position: 'absolute', bottom: 56, left: 0, right: 0, alignItems: 'center' },
  coverName:   { fontSize: 11, color: BLEU, textAlign: 'center', marginBottom: 3 },
  coverText:   { fontSize: 10, color: '#374151', textAlign: 'center', marginBottom: 2 },
  coverSlogan: { fontSize: 10, color: BLEU2, textAlign: 'center', fontFamily: 'Helvetica-Oblique', marginTop: 8 },
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
function Ftr({ ref: r }) {
  return React.createElement(View, { style: CS.footer, fixed: true },
    React.createElement(Text, { style: CS.footerTxt }, `illiCO travaux Martigues — ${r}`),
    React.createElement(Text, { style: CS.footerSlogan }, 'Quand vous pensez travaux, pensez illiCO !'),
    React.createElement(Text, { style: CS.footerTxt, render: ({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}` }),
  )
}

// ── Page de garde dynamique ──
function makeCoverPage({ nomRef, telRef, logo }) {
  return React.createElement(Page, { size: 'A4', style: CS.coverPage },
    React.createElement(View, { style: CS.coverTopBand }),
    React.createElement(View, { style: CS.coverLogoArea },
      logo ? React.createElement(PdfImage, { src: logo, style: CS.coverLogo }) : null,
    ),
    React.createElement(View, { style: CS.coverBlueBand },
      React.createElement(Text, { style: CS.coverTitle }, 'Votre projet avec'),
      React.createElement(Text, { style: CS.coverTitle }, 'illiCO travaux'),
    ),
    React.createElement(View, { style: CS.coverOrangeBand }),
    React.createElement(View, { style: CS.coverBottom },
      React.createElement(Text, { style: CS.coverName }, nomRef),
      React.createElement(Text, { style: CS.coverText }, 'Société CONSEIL TRAVAUX PROVENCE - CTP'),
      React.createElement(Text, { style: CS.coverText }, '22 rue ramade, quartier Jonquières'),
      React.createElement(Text, { style: CS.coverText }, '13 500 MARTIGUES'),
      React.createElement(Text, { style: CS.coverText }, telRef),
      React.createElement(Text, { style: CS.coverSlogan }, 'Quand vous pensez travaux, pensez illiCO !'),
    ),
  )
}

// ── Génère les pages de contenu ──
async function buildContentPDF({ dossier, devis, photos, interventions, logo }) {
  const client = dossier.client
  const ref = dossier.referente
  const nomClient = client
    ? [client.civilite, client.prenom, client.nom, client.prenom2 ? `& ${client.prenom2} ${client.nom2}` : null].filter(Boolean).join(' ')
    : '—'
  const TYPO = { courtage: 'Courtage', amo: 'AMO', estimo: 'Estimo', audit_energetique: 'Audit énergétique', studio_jardin: 'Studio de jardin' }
  const nomRef = getNomRef(ref)
  const dateAuj = new Date().toLocaleDateString('fr-FR')

  const devisAcceptes = (devis || []).filter(d => d.statut === 'accepte')
  const totalHT  = devisAcceptes.reduce((s, d) => s + toNum(d.montant_ht), 0)
  const totalTTC = devisAcceptes.reduce((s, d) => s + toNum(d.montant_ttc), 0)
  const fraisTTC = toNum(dossier.frais_consultation)
  const fraisHT  = fraisTTC / 1.2
  const tauxC = toNum(dossier.taux_courtage || 0.06)
  const tauxA = toNum(dossier.honoraires_amo_taux ?? 9) / 100
  const honC  = totalTTC * tauxC
  const honAMO= totalTTC * (tauxC + tauxA)
  const isAMO = dossier.typologie === 'amo'
  const isC   = ['courtage', 'amo'].includes(dossier.typologie)
  const photosMaquette = (photos || []).filter(p => p.categorie === 'maquette')

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
          ['Référente',          nomRef],
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
      dossier.resume_projet && React.createElement(View, null,
        React.createElement(Text, { style: CS.sectionH }, 'Résumé du projet'),
        React.createElement(Text, { style: { fontSize: 8.5, lineHeight: 1.6, color: '#374151' } }, dossier.resume_projet),
      ),
      React.createElement(Ftr, { ref: dossier.reference }),
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
      // Acomptes
      devisAcceptes.length > 0 && React.createElement(View, { style: { marginTop: 14 } },
        React.createElement(Text, { style: CS.sectionH }, 'Acomptes entreprises'),
        ...devisAcceptes.map(d => {
          const ttc = toNum(d.montant_ttc)
          const acompte = d.acompte_pourcentage === -1 ? toNum(d.acompte_montant_fixe) : ttc * (toNum(d.acompte_pourcentage || 30) / 100)
          const pct = d.acompte_pourcentage === -1 ? '' : ` (${d.acompte_pourcentage || 30}%)`
          return React.createElement(View, { key: d.id, style: CS.sumRow },
            React.createElement(Text, { style: CS.sumLabel }, `${d.artisan?.entreprise || '—'}${pct}`),
            React.createElement(Text, { style: CS.sumValue }, fmt(acompte)),
          )
        }),
      ),
      // Honoraires
      isC && totalTTC > 0 && React.createElement(View, { style: { marginTop: 10 } },
        React.createElement(Text, { style: CS.sectionH }, 'Honoraires illiCO travaux'),
        React.createElement(View, { style: CS.sumRow },
          React.createElement(Text, { style: CS.sumLabel }, `Honoraires courtage (${(tauxC * 100).toFixed(1)}%)`),
          React.createElement(Text, { style: CS.sumValue }, fmt(honC)),
        ),
        isAMO && React.createElement(View, { style: CS.sumOrange },
          React.createElement(Text, { style: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#f37f2b', flex: 1 } }, `Honoraires AMO (${((tauxC + tauxA) * 100).toFixed(1)}%)`),
          React.createElement(Text, { style: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#f37f2b' } }, fmt(honAMO)),
        ),
        React.createElement(View, { style: CS.totalBlock },
          React.createElement(Text, { style: { color: BLANC, fontSize: 9, fontFamily: 'Helvetica-Bold' } }, 'TOTAL CHANTIER'),
          React.createElement(Text, { style: { color: BLANC, fontSize: 13, fontFamily: 'Helvetica-Bold' } }, fmt(totalTTC + fraisTTC + (isAMO ? honAMO : honC))),
        ),
      ),
      React.createElement(Ftr, { ref: dossier.reference }),
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
        React.createElement(Text, { style: { fontSize: 7, color: GRIS, fontFamily: 'Helvetica-Oblique', marginTop: 14, lineHeight: 1.4 } },
          "Ce planning est communiqué à titre purement indicatif et ne possède aucune valeur contractuelle.",
        ),
        React.createElement(Ftr, { ref: dossier.reference }),
      )
    )
  }

  // ── Photos maquette ──
  if (photosMaquette.length > 0) {
    for (let i = 0; i < photosMaquette.length; i += 4) {
      const chunk = photosMaquette.slice(i, i + 4)
      pages.push(
        React.createElement(Page, { key: `maq-${i}`, size: 'A4', style: CS.page },
          React.createElement(Hdr, { title: 'Illustrations & vues 3D', sub: `${dossier.reference} — ${nomClient}`, logo }),
          React.createElement(View, { style: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 } },
            ...chunk.filter(p => p.base64).map(ph =>
              React.createElement(PdfImage, { key: ph.id, src: ph.base64, style: CS.photoImg })
            ),
          ),
          React.createElement(Text, { style: { fontSize: 7, color: GRIS, fontFamily: 'Helvetica-Oblique', marginTop: 16, lineHeight: 1.4 } },
            "Les illustrations graphiques reproduites sont des illustrations commerciales qui ne peuvent servir de base à la réalisation du chantier.",
          ),
          React.createElement(Ftr, { ref: dossier.reference }),
        )
      )
    }
  }

  return renderToBuffer(React.createElement(Document, null, ...pages))
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

// ── Merge principal ──
export async function buildDossierRestitution({ dossier, devis, photos, interventions, fichesTech, logo, supabaseAdmin }) {
  const isAMO = dossier.typologie === 'amo'
  const devisAcceptes = (devis || []).filter(d => d.statut === 'accepte')
  const photosMaquette = (photos || []).filter(p => p.categorie === 'maquette')
  const hasQualif = devisAcceptes.some(d => d.artisan?.qualification_url)
  const hasFichesTech = (fichesTech || []).length > 0

  // Charger les séparateurs
  const loadSep = async (b64) => PDFDocument.load(Buffer.from(b64, 'base64'))

  const [sepDescriptif, sepIllustrations, sepRecap, sepDevis, sepPlanning, sepRefs, sepKbis, sepQualification] = await Promise.all([
    loadSep(SEP_DESCRIPTIF), loadSep(SEP_ILLUSTRATIONS), loadSep(SEP_RECAP),
    loadSep(SEP_DEVIS), loadSep(SEP_PLANNING), loadSep(SEP_REFS),
    loadSep(SEP_KBIS), loadSep(SEP_QUALIFICATION),
  ])

  // Générer les pages de contenu
  const contentBuffer = await buildContentPDF({ dossier, devis, photos, interventions, logo })
  const contentPdf = await PDFDocument.load(contentBuffer)

  // PDF final
  const final = await PDFDocument.create()
  let cIdx = 0 // index dans contentPdf

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
        // Normaliser en portrait : si paysage, pivoter de 90°
        const { width, height } = p.getSize()
        if (width > height) {
          p.setRotation(degrees(90))
        }
        final.addPage(p)
      })
    } catch {}
  }

  // ── Page de garde (générée dynamiquement) ──
  const nomRef = getNomRef(dossier.referente)
  const telRef = getTelReferente(dossier.referente)
  const coverBuf = await renderToBuffer(
    React.createElement(Document, null, makeCoverPage({ nomRef, telRef, logo }))
  )
  const coverPdf = await PDFDocument.load(coverBuf)
  const [coverPage] = await final.copyPages(coverPdf, [0])
  final.addPage(coverPage)

  // ── Descriptif du projet ──
  await addSep(sepDescriptif)
  await addContent()  // page descriptif

  // ── Récapitulatif financier ──
  await addSep(sepRecap)
  await addContent()  // page récap

  // ── Devis, Factures, PV réception ──
  await addSep(sepDevis)
  // Merger les vrais PDFs devis signés + factures
  for (const d of devisAcceptes) {
    if (d.devis_signe_path) {
      const buf = await downloadPDF(supabaseAdmin, 'documents', d.devis_signe_path)
      await addExternalPDF(buf)
    }
    if (d.facture_path) {
      const buf = await downloadPDF(supabaseAdmin, 'documents', d.facture_path)
      await addExternalPDF(buf)
    }
  }

  // ── Qualification (seulement si au moins un artisan en a une) ──
  if (hasQualif) {
    await addSep(sepQualification)
    for (const d of devisAcceptes) {
      if (d.artisan?.qualification_url) {
        const buf = await downloadPDF(supabaseAdmin, 'documents', d.artisan.qualification_url)
        await addExternalPDF(buf)
      }
    }
  }

  // ── Planning provisoire indicatif (AMO uniquement) ──
  if (isAMO) {
    await addSep(sepPlanning)
    if ((interventions || []).length > 0) {
      await addContent()  // page planning
    }
  }

  // ── Illustrations & vues 3D (seulement si photos maquette) ──
  if (photosMaquette.length > 0) {
    await addSep(sepIllustrations)
    const nbPhotoPages = Math.ceil(photosMaquette.length / 4)
    for (let i = 0; i < nbPhotoPages; i++) {
      await addContent()
    }
  }

  // ── Références produits (seulement si fiches techniques cochées) ──
  if (hasFichesTech) {
    await addSep(sepRefs)
  }

  // ── KBIS - Assurances ──
  await addSep(sepKbis)
  // Merger les vrais PDFs Kbis + décennales
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

  const bytes = await final.save()
  return Buffer.from(bytes)
}