// app/api/pdf/restitution.js
// Génération du dossier de restitution avec merge du template PDF illiCO

import React from 'react'
import { renderToBuffer, Document, Page, Text, View, Image as PdfImage, StyleSheet } from '@react-pdf/renderer'
import { PDFDocument } from 'pdf-lib'
import path from 'path'
import fs from 'fs'

// ── Couleurs charte ──
const BLEU  = '#00578e'
const BLEU2 = '#2f8dcb'
const GRIS  = '#6b7280'
const BLANC = '#ffffff'
const ROUGE = '#991b1b'
const ORANGE_TX = '#c2410c'

const toNum = (v) => {
  if (!v && v !== 0) return 0
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
const fmt = (n) => `${toNum(n).toFixed(2).replace('.', ',')} €`

// Indices des pages du template (0-based)
const TPL = {
  cover: 0,
  coverBlank: 1,
  descriptif: 2,
  descriptifBlank: 3,
  recap: 4,
  recapBlank: 5,
  devisFactures: 6,
  devisFacturesBlank: 7,
  qualification: 8,
  qualificationBlank: 9,
  planning: 10,
  planningBlank: 11,
  maquette: 12,     // "Illustrations & vues 3D"
  maquetteBlank: 13,
  refsProds: 14,
  refsProdBlank: 15,
  kbisAssur: 16,
  kbisAssurBlank: 17,
  // 18 = Audit énergétique → on skip
}

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

// ── Styles pour pages de contenu ──
const CS = StyleSheet.create({
  page: { padding: 38, fontFamily: 'Helvetica', fontSize: 9, backgroundColor: '#ffffff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: BLEU },
  logo: { width: 110, height: 44 },
  headerRight: { alignItems: 'flex-end' },
  headerTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: BLEU },
  headerSub: { fontSize: 8, color: GRIS, marginTop: 2 },
  sectionH: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: BLEU, marginTop: 14, marginBottom: 5, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: '#e8f4fb' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  infoLabel: { fontSize: 8, color: GRIS, flex: 1 },
  infoValue: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  tableHdr: { flexDirection: 'row', backgroundColor: BLEU, paddingVertical: 5, paddingHorizontal: 4 },
  th: { color: BLANC, fontSize: 8, fontFamily: 'Helvetica-Bold' },
  tr: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  trAlt: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#f0f7fb' },
  trTotal: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 4, backgroundColor: BLEU },
  trSub: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 4, backgroundColor: '#ddeef8' },
  td: { fontSize: 8 },
  tdB: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  tdR: { fontSize: 8, textAlign: 'right' },
  tdRB: { fontSize: 8, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  tdW: { fontSize: 8, color: BLANC },
  tdWB: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: BLANC },
  tdRWB: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: BLANC, textAlign: 'right' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  sumLabel: { fontSize: 8, color: GRIS, flex: 1 },
  sumValue: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  sumRowOrange: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, paddingHorizontal: 6, backgroundColor: '#fff0e0', marginTop: 2, borderRadius: 2 },
  sumLabelOrange: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#f37f2b', flex: 1 },
  sumValueOrange: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#f37f2b' },
  totalBlock: { flexDirection: 'row', justifyContent: 'space-between', padding: 9, backgroundColor: BLEU, borderRadius: 4, marginTop: 8 },
  totalLabel: { color: BLANC, fontSize: 9, fontFamily: 'Helvetica-Bold' },
  totalValue: { color: BLANC, fontSize: 13, fontFamily: 'Helvetica-Bold' },
  photoImg: { width: 148, height: 110, objectFit: 'cover', borderRadius: 4 },
  footer: { position: 'absolute', bottom: 22, left: 38, right: 38, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 5 },
  footerTxt: { fontSize: 7, color: GRIS },
  footerSlogan: { fontSize: 7, color: BLEU2, fontFamily: 'Helvetica-Oblique' },
})

function Hdr({ title, sub, logo }) {
  return React.createElement(View, { style: CS.header },
    logo ? React.createElement(PdfImage, { src: logo, style: CS.logo }) : React.createElement(Text, { style: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: BLEU } }, 'illiCO'),
    React.createElement(View, { style: CS.headerRight },
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

// ── Génère les pages de contenu ──
function buildContentPDF({ dossier, devis, photos, interventions, suiviFinancier, logo }) {
  const client = dossier.client
  const ref = dossier.referente
  const nomClient = client
    ? [client.civilite, client.prenom, client.nom, client.prenom2 ? `& ${client.prenom2} ${client.nom2}` : null].filter(Boolean).join(' ')
    : '—'
  const nomRef = getNomRef(ref)
  const dateAuj = new Date().toLocaleDateString('fr-FR')
  const TYPO = { courtage: 'Courtage', amo: 'AMO', estimo: 'Estimo', audit_energetique: 'Audit énergétique', studio_jardin: 'Studio de jardin' }

  const devisAcceptes = (devis || []).filter(d => d.statut === 'accepte')
  const totalHT = devisAcceptes.reduce((s, d) => s + toNum(d.montant_ht), 0)
  const totalTTC = devisAcceptes.reduce((s, d) => s + toNum(d.montant_ttc), 0)
  const fraisTTC = toNum(dossier.frais_consultation)
  const fraisHT = fraisTTC / 1.2
  const tauxC = toNum(dossier.taux_courtage || 0.06)
  const tauxA = toNum(dossier.honoraires_amo_taux ?? 9) / 100
  const honC = totalTTC * tauxC
  const honAMO = totalTTC * (tauxC + tauxA)
  const isAMO = dossier.typologie === 'amo'
  const isC = ['courtage', 'amo'].includes(dossier.typologie)

  // Acomptes
  const totalAcomptes = devisAcceptes.reduce((s, d) => {
    const ttc = toNum(d.montant_ttc)
    return s + (d.acompte_pourcentage === -1 ? toNum(d.acompte_montant_fixe) : ttc * (toNum(d.acompte_pourcentage || 30) / 100))
  }, 0)

  const photosMaquette = (photos || []).filter(p => p.categorie === 'maquette')

  let rowNum = 0
  const pages = []

  // ── PAGE 0 : Descriptif du projet ──
  pages.push(
    React.createElement(Page, { key: 'desc', size: 'A4', style: CS.page },
      React.createElement(Hdr, { title: 'Descriptif du projet', sub: `${dossier.reference} — ${nomClient}`, logo }),
      React.createElement(View, { style: { marginBottom: 14 } },
        ...[
          ['Référence', dossier.reference || '—'],
          ['Client', nomClient],
          client?.adresse ? ['Adresse', client.adresse] : null,
          ['Prestation', TYPO[dossier.typologie] || dossier.typologie],
          ['Référente', nomRef],
          dossier.date_demarrage_chantier ? ['Démarrage chantier', new Date(dossier.date_demarrage_chantier).toLocaleDateString('fr-FR')] : null,
          dossier.date_fin_chantier ? ['Fin de chantier', new Date(dossier.date_fin_chantier).toLocaleDateString('fr-FR')] : null,
          ['Document établi le', dateAuj],
        ].filter(Boolean).map(([label, value]) =>
          React.createElement(View, { key: label, style: CS.infoRow },
            React.createElement(Text, { style: CS.infoLabel }, label),
            React.createElement(Text, { style: CS.infoValue }, value),
          )
        ),
      ),
      // Résumé du projet
      dossier.resume_projet && React.createElement(View, null,
        React.createElement(Text, { style: CS.sectionH }, 'Résumé du projet'),
        React.createElement(Text, { style: { fontSize: 8.5, lineHeight: 1.6, color: '#374151' } }, dossier.resume_projet),
      ),
      React.createElement(Ftr, { ref: dossier.reference }),
    )
  )

  // ── PAGE 1 : Récapitulatif financier ──
  pages.push(
    React.createElement(Page, { key: 'recap', size: 'A4', style: CS.page },
      React.createElement(Hdr, { title: 'Récapitulatif financier', sub: `${dossier.reference} — ${nomClient}`, logo }),
      // Tableau principal
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
        React.createElement(Text, { style: [CS.tdB, { flex: 9 }] }, 'Total devis HT'),
        React.createElement(Text, { style: [CS.tdRB, { flex: 2, color: BLEU }] }, fmt(totalHT + fraisHT)),
        React.createElement(Text, { style: { flex: 2 } }, ''),
      ),
      React.createElement(View, { style: CS.trTotal },
        React.createElement(Text, { style: [CS.tdW, { width: 18 }] }, ' '),
        React.createElement(Text, { style: [CS.tdWB, { flex: 9 }] }, 'Total devis TTC'),
        React.createElement(Text, { style: { flex: 2 } }, ''),
        React.createElement(Text, { style: [CS.tdRWB, { flex: 2 }] }, fmt(totalTTC + fraisTTC)),
      ),

      // Acomptes
      devisAcceptes.length > 0 && React.createElement(View, { style: { marginTop: 14 } },
        React.createElement(Text, { style: CS.sectionH }, 'Acomptes entreprises de 30% à 40% à la signature des devis'),
        ...devisAcceptes.map(d => {
          const ttc = toNum(d.montant_ttc)
          const acompte = d.acompte_pourcentage === -1 ? toNum(d.acompte_montant_fixe) : ttc * (toNum(d.acompte_pourcentage || 30) / 100)
          const pct = d.acompte_pourcentage === -1 ? '' : ` (${d.acompte_pourcentage || 30}%)`
          return React.createElement(View, { key: d.id, style: CS.summaryRow },
            React.createElement(Text, { style: CS.sumLabel }, `${d.artisan?.entreprise || '—'}${pct}`),
            React.createElement(Text, { style: CS.sumValue }, fmt(acompte)),
          )
        }),
        isC && React.createElement(View, { style: [CS.summaryRow, { borderBottomWidth: 0 }] },
          React.createElement(Text, { style: CS.sumLabel }, 'Acompte illiCO travaux (valeur du courtage)'),
          React.createElement(Text, { style: CS.sumValue }, fmt(honC)),
        ),
      ),

      // Honoraires
      isC && totalTTC > 0 && React.createElement(View, { style: { marginTop: 10 } },
        React.createElement(Text, { style: CS.sectionH }, 'Honoraires illiCO travaux'),
        React.createElement(View, { style: CS.summaryRow },
          React.createElement(Text, { style: CS.sumLabel }, `Honoraires courtage (${(tauxC * 100).toFixed(1)}%)`),
          React.createElement(Text, { style: CS.sumValue }, fmt(honC)),
        ),
        !isAMO && React.createElement(View, { style: [CS.summaryRow, { borderBottomWidth: 0 }] },
          React.createElement(Text, { style: [CS.sumLabel, { color: '#9ca3af' }] }, 'TOTAL CHANTIER si COURTAGE'),
          React.createElement(Text, { style: [CS.sumValue, { color: '#9ca3af' }] }, fmt(totalTTC + fraisTTC + honC)),
        ),
        isAMO && React.createElement(View, null,
          React.createElement(View, { style: CS.sumRowOrange },
            React.createElement(Text, { style: CS.sumLabelOrange }, `Honoraires AMO (${((tauxC + tauxA) * 100).toFixed(1)}%)`),
            React.createElement(Text, { style: CS.sumValueOrange }, fmt(honAMO)),
          ),
        ),
        React.createElement(View, { style: CS.totalBlock },
          React.createElement(Text, { style: CS.totalLabel }, 'TOTAL CHANTIER'),
          React.createElement(Text, { style: CS.totalValue }, fmt(totalTTC + fraisTTC + (isAMO ? honAMO : honC))),
        ),
      ),
      React.createElement(Ftr, { ref: dossier.reference }),
    )
  )

  // ── PAGE 2 (optionnel) : Planning — AMO uniquement ──
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
              : `${(i.jours_specifiques || []).slice(0, 3).map(j => new Date(j).toLocaleDateString('fr-FR')).join(', ')}${(i.jours_specifiques || []).length > 3 ? '…' : ''}`
          ),
        )),
        React.createElement(Text, { style: { fontSize: 7, color: GRIS, fontFamily: 'Helvetica-Oblique', marginTop: 14, lineHeight: 1.4 } },
          "Ce planning est communiqué à titre purement indicatif et ne possède aucune valeur contractuelle.",
        ),
        React.createElement(Ftr, { ref: dossier.reference }),
      )
    )
  }

  // ── PAGE 3 (optionnel) : Photos maquette/illustration ──
  if (photosMaquette.length > 0) {
    for (let i = 0; i < photosMaquette.length; i += 4) {
      const chunk = photosMaquette.slice(i, i + 4)
      pages.push(
        React.createElement(Page, { key: `maq-${i}`, size: 'A4', style: CS.page },
          React.createElement(Hdr, { title: 'Maquette & vues 3D', sub: `${dossier.reference} — ${nomClient}`, logo }),
          React.createElement(View, { style: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 } },
            ...chunk.map(ph => ph.base64
              ? React.createElement(PdfImage, { key: ph.id, src: ph.base64, style: CS.photoImg })
              : null
            ).filter(Boolean),
          ),
          React.createElement(Text, { style: { fontSize: 7, color: GRIS, fontFamily: 'Helvetica-Oblique', marginTop: 16, lineHeight: 1.4 } },
            "Les illustrations graphiques, coupes 3D, ou plans reproduits sont des illustrations commerciales qui ne peuvent servir de base à la réalisation du chantier.",
          ),
          React.createElement(Ftr, { ref: dossier.reference }),
        )
      )
    }
  }

  return React.createElement(Document, null, ...pages)
}

// ── Merge template + contenu ──
export async function buildDossierRestitution({ dossier, devis, photos, interventions, suiviFinancier, logo }) {
  const isAMO = dossier.typologie === 'amo'
  const hasQualif = (devis || []).some(d => d.qualification_path)
  const photosMaquette = (photos || []).filter(p => p.categorie === 'maquette')
  const hasPlanning = isAMO && (interventions || []).length > 0

  // 1. Générer les pages de contenu avec react-pdf
  const contentDoc = buildContentPDF({ dossier, devis, photos, interventions, suiviFinancier, logo })
  const contentBuffer = await renderToBuffer(contentDoc)
  const contentPdf = await PDFDocument.load(contentBuffer)

  // 2. Charger le template
  const templatePath = path.join(process.cwd(), 'public', 'template_restitution.pdf')
  const templateBytes = fs.readFileSync(templatePath)
  const templatePdf = await PDFDocument.load(templateBytes)

  // 3. Construire le PDF final
  const final = await PDFDocument.create()

  // Copier une page du template
  const fromTpl = async (pageIdx) => {
    const [p] = await final.copyPages(templatePdf, [pageIdx])
    final.addPage(p)
  }
  // Copier une page du contenu généré
  const fromContent = async (pageIdx) => {
    const [p] = await final.copyPages(contentPdf, [pageIdx])
    final.addPage(p)
  }

  // Index des pages de contenu
  let contentIdx = 0

  // ── Cover
  await fromTpl(TPL.cover)
  // Pas de blank cover pour plus de compacité — optionnel, on l'enlève

  // ── Descriptif du projet
  await fromTpl(TPL.descriptif)
  await fromContent(contentIdx++) // page descriptif

  // ── Récapitulatif financier
  await fromTpl(TPL.recap)
  await fromContent(contentIdx++) // page récap

  // ── Devis, Factures (separator + blanc pour insertion physique)
  await fromTpl(TPL.devisFactures)
  await fromTpl(TPL.devisFacturesBlank)

  // ── Qualification (seulement si fichiers de qualification présents)
  if (hasQualif) {
    await fromTpl(TPL.qualification)
    await fromTpl(TPL.qualificationBlank)
  }

  // ── Planning (AMO uniquement)
  if (isAMO) {
    await fromTpl(TPL.planning)
    if (hasPlanning) {
      await fromContent(contentIdx++) // page planning
    } else {
      await fromTpl(TPL.planningBlank)
    }
  }

  // ── Maquette & vues 3D (seulement si photos)
  if (photosMaquette.length > 0) {
    await fromTpl(TPL.maquette)
    // Toutes les pages photos maquette
    const nbPhotoPages = Math.ceil(photosMaquette.length / 4)
    for (let i = 0; i < nbPhotoPages; i++) {
      await fromContent(contentIdx++)
    }
  }

  // ── Références produits (separator + blanc)
  await fromTpl(TPL.refsProds)
  await fromTpl(TPL.refsProdBlank)

  // ── KBIS - Assurances (separator + blanc)
  await fromTpl(TPL.kbisAssur)
  await fromTpl(TPL.kbisAssurBlank)

  // 4. Sauvegarder
  const bytes = await final.save()
  return Buffer.from(bytes)
}