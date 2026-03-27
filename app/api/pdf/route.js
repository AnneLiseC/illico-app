// app/api/pdf/route.js
import React from 'react'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { renderToBuffer, Document, Page, Text, View, Image as PdfImage, StyleSheet } from '@react-pdf/renderer'
import path from 'path'
import fs from 'fs'

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const BLEU_FONCE = '#00578e'
const BLEU_CLAIR = '#2f8dcb'
const ORANGE     = '#f37f2b'
const GRIS_CLAIR = '#f3f4f6'
const GRIS_TEXTE = '#6b7280'
const BLANC      = '#ffffff'
const NOIR       = '#1f2937'

const toNumber = (v) => {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
const fmt = (n) => `${toNumber(n).toFixed(2).replace('.', ',')} €`

function getLogoBase64() {
  const candidates = [
    path.join(process.cwd(), 'public', 'logo_real.png'),
    path.join(process.cwd(), 'public', 'logo.png'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const data = fs.readFileSync(p)
      const ext = p.includes('_real') ? 'png' : 'jpeg'
      return `data:image/${ext};base64,${data.toString('base64')}`
    }
  }
  return null
}
const logoBase64 = getLogoBase64()

const S = StyleSheet.create({
  page: { padding: 35, fontFamily: 'Helvetica', fontSize: 9, color: NOIR, backgroundColor: BLANC },
  headerBox: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  logo: { width: 130, height: 57, objectFit: 'contain' },
  headerTitle: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: BLEU_FONCE, textAlign: 'right' },
  agenceName: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: BLEU_FONCE, marginTop: 6 },
  agenceText: { fontSize: 8, color: GRIS_TEXTE, marginTop: 1 },
  agenceEmail: { fontSize: 8, color: BLEU_CLAIR, marginTop: 1 },
  clientName: { fontSize: 9, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  clientText: { fontSize: 8, color: GRIS_TEXTE, textAlign: 'right', marginTop: 1 },
  divider: { height: 2, backgroundColor: BLEU_FONCE, marginBottom: 12 },
  dividerLight: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 5 },
  tableHeader: { flexDirection: 'row', backgroundColor: BLEU_FONCE, paddingVertical: 5, paddingHorizontal: 4 },
  tableHeaderCell: { color: BLANC, fontSize: 8, fontFamily: 'Helvetica-Bold' },
  tableRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tableRowAlt: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#f0f7fb' },
  tableRowSubtotal: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 4, backgroundColor: '#e0eef8' },
  tableRowTotal: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 4, backgroundColor: BLEU_FONCE },
  cell: { fontSize: 8 },
  cellBold: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  cellRight: { fontSize: 8, textAlign: 'right' },
  cellRightBold: { fontSize: 8, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  cellWhite: { fontSize: 8, color: BLANC },
  cellWhiteBold: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: BLANC },
  cellRightWhiteBold: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: BLANC, textAlign: 'right' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  summaryRowBlue: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, paddingHorizontal: 6, backgroundColor: '#e0eef8', marginTop: 2, borderRadius: 2 },
  summaryRowOrange: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, paddingHorizontal: 6, backgroundColor: '#fff3e8', marginTop: 2, borderRadius: 2 },
  summaryLabel: { fontSize: 8, color: GRIS_TEXTE },
  summaryLabelBlue: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: BLEU_FONCE },
  summaryLabelOrange: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: ORANGE },
  summaryValue: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  summaryValueOrange: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: ORANGE },
  footerCenter: { position: 'absolute', bottom: 24, left: 35, right: 35, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 6 },
  footerSlogan: { fontSize: 8, color: BLEU_CLAIR, fontFamily: 'Helvetica-Oblique' },
  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: BLEU_FONCE, marginTop: 12, marginBottom: 4 },
  infoGrid: { flexDirection: 'row', marginBottom: 8 },
  infoBlock: { flex: 1 },
  infoLabel: { fontSize: 7, color: GRIS_TEXTE, marginBottom: 1 },
  infoValue: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  coverBlue: { backgroundColor: BLEU_FONCE, borderRadius: 6, padding: 18, marginBottom: 20 },
  coverTitle: { color: BLANC, fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  coverRef: { color: '#93c5fd', fontSize: 11 },
  coverSub: { color: '#93c5fd', fontSize: 9, marginTop: 3 },
  signatureBox: { height: 55, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 3, marginTop: 4 },
  signatureLabel: { fontSize: 7, color: GRIS_TEXTE, marginTop: 3 },
})

function RecapitulatifPDF({ dossier, devis, suiviFinancier }) {
  const client = dossier.client
  const nomClient = client
    ? [client.civilite, client.prenom, client.nom, client.prenom2 ? `& ${client.prenom2} ${client.nom2}` : null].filter(Boolean).join(' ')
    : '—'

  const devisAcceptes = (devis || []).filter(d => d.statut === 'accepte')
  const totalDevisHT  = devisAcceptes.reduce((s, d) => s + toNumber(d.montant_ht), 0)
  const totalDevisTTC = devisAcceptes.reduce((s, d) => s + toNumber(d.montant_ttc), 0)

  const tauxCourtage = toNumber(dossier.taux_courtage || 0.06)
  const tauxAmo      = toNumber(dossier.honoraires_amo_taux ?? 9) / 100
  const fraisTTC     = toNumber(dossier.frais_consultation)
  const fraisHT      = fraisTTC / 1.2
  const honCourtage  = totalDevisTTC * tauxCourtage
  const honAMO       = totalDevisTTC * (tauxCourtage + tauxAmo)

  const isAMO      = dossier.typologie === 'amo'
  const isCourtage = ['courtage', 'amo'].includes(dossier.typologie)

  const getSuivi = (type, artisanId) =>
    (suiviFinancier || []).find(s => s.type_echeance === type && (!artisanId || s.artisan_id === artisanId))

  const dateAuj = new Date().toLocaleDateString('fr-FR')
  let rowNum = 0

  return React.createElement(Document, null,
    React.createElement(Page, { size: 'A4', style: S.page },
      // Header
      React.createElement(View, { style: S.headerBox },
        React.createElement(View, null,
          logoBase64
            ? React.createElement(PdfImage, { src: logoBase64, style: S.logo })
            : React.createElement(Text, { style: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: BLEU_FONCE } }, 'illiCO travaux'),
          React.createElement(Text, { style: S.agenceName }, 'CONSEIL TRAVAUX PROVENCE - CTP'),
          React.createElement(Text, { style: S.agenceText }, '22 rue Ramade, 13500 MARTIGUES'),
          React.createElement(Text, { style: S.agenceText }, '06.59.81.06.81'),
          React.createElement(Text, { style: S.agenceEmail }, 'marine.michelangeli@illico-travaux.com'),
        ),
        React.createElement(View, null,
          React.createElement(Text, { style: S.headerTitle }, 'Récapitulatif Financier'),
          React.createElement(Text, { style: [S.clientName, { marginTop: 8 }] }, nomClient),
          client?.adresse && React.createElement(Text, { style: S.clientText }, client.adresse),
          React.createElement(Text, { style: [S.clientText, { marginTop: 4 }] }, `Réf. : ${dossier.reference}`),
          React.createElement(Text, { style: S.clientText }, `Établi le ${dateAuj}`),
        ),
      ),
      React.createElement(View, { style: S.divider }),

      // Tableau
      React.createElement(View, { style: S.tableHeader },
        React.createElement(Text, { style: [S.tableHeaderCell, { width: 18 }] }, ' '),
        React.createElement(Text, { style: [S.tableHeaderCell, { flex: 3 }] }, 'Intervenant'),
        React.createElement(Text, { style: [S.tableHeaderCell, { flex: 4 }] }, 'Description'),
        React.createElement(Text, { style: [S.tableHeaderCell, { flex: 2, textAlign: 'center' }] }, 'Date paiement'),
        React.createElement(Text, { style: [S.tableHeaderCell, { flex: 2, textAlign: 'right' }] }, 'Montant HT'),
        React.createElement(Text, { style: [S.tableHeaderCell, { flex: 2, textAlign: 'right' }] }, 'Montant TTC'),
      ),

      // Ligne 0 frais
      fraisTTC > 0 && dossier.frais_statut !== 'offerts' && React.createElement(View, { style: S.tableRow },
        React.createElement(Text, { style: [S.cell, { width: 18, color: GRIS_TEXTE }] }, '0'),
        React.createElement(Text, { style: [S.cell, { flex: 3 }] }, 'illiCO travaux'),
        React.createElement(Text, { style: [S.cell, { flex: 4 }] }, 'Frais de consultation'),
        React.createElement(Text, { style: [S.cell, { flex: 2, textAlign: 'center' }] }, ''),
        React.createElement(Text, { style: [S.cellRight, { flex: 2 }] }, fmt(fraisHT)),
        React.createElement(Text, { style: [S.cellRightBold, { flex: 2 }] }, fmt(fraisTTC)),
      ),

      // Lignes artisans
      ...devisAcceptes.map((d, idx) => {
        const n = ++rowNum
        return React.createElement(View, { key: d.id, style: n % 2 === 0 ? S.tableRow : S.tableRowAlt },
          React.createElement(Text, { style: [S.cell, { width: 18, color: GRIS_TEXTE }] }, String(n)),
          React.createElement(Text, { style: [S.cell, { flex: 3 }] }, d.artisan?.entreprise || '—'),
          React.createElement(Text, { style: [S.cell, { flex: 4, color: GRIS_TEXTE }] }, d.notes || '—'),
          React.createElement(Text, { style: [S.cell, { flex: 2, textAlign: 'center' }] }, ''),
          React.createElement(Text, { style: [S.cellRight, { flex: 2 }] }, fmt(d.montant_ht)),
          React.createElement(Text, { style: [S.cellRightBold, { flex: 2 }] }, fmt(d.montant_ttc)),
        )
      }),

      // Sous-totaux
      React.createElement(View, { style: S.tableRowSubtotal },
        React.createElement(Text, { style: [S.cellBold, { width: 18 }] }, ' '),
        React.createElement(Text, { style: [S.cellBold, { flex: 9 }] }, 'Total devis HT'),
        React.createElement(Text, { style: [S.cellRightBold, { flex: 2, color: BLEU_FONCE }] }, fmt(totalDevisHT + fraisHT)),
        React.createElement(Text, { style: { flex: 2 } }, ''),
      ),
      React.createElement(View, { style: S.tableRowTotal },
        React.createElement(Text, { style: [S.cellWhite, { width: 18 }] }, ' '),
        React.createElement(Text, { style: [S.cellWhiteBold, { flex: 9 }] }, 'Total devis TTC'),
        React.createElement(Text, { style: { flex: 2 } }, ''),
        React.createElement(Text, { style: [S.cellRightWhiteBold, { flex: 2 }] }, fmt(totalDevisTTC + fraisTTC)),
      ),

      // Acomptes
      devisAcceptes.length > 0 && React.createElement(View, { style: { marginTop: 14 } },
        React.createElement(Text, { style: [S.summaryLabel, { marginBottom: 4 }] }, 'Acomptes entreprises de 30% à 40% à la signature des devis'),
        ...devisAcceptes.map(d => {
          const ttc = toNumber(d.montant_ttc)
          const acompte = d.acompte_pourcentage === -1 ? toNumber(d.acompte_montant_fixe) : ttc * (toNumber(d.acompte_pourcentage || 30) / 100)
          return React.createElement(View, { key: d.id, style: S.summaryRow },
            React.createElement(Text, { style: [S.summaryLabel, { flex: 1 }] }, d.artisan?.entreprise || '—'),
            React.createElement(Text, { style: S.summaryValue }, fmt(acompte)),
          )
        }),
        isCourtage && React.createElement(View, { style: S.summaryRow },
          React.createElement(Text, { style: [S.summaryLabel, { flex: 1 }] }, 'Acompte illiCO travaux de la valeur du courtage à la signature des devis'),
          React.createElement(Text, { style: S.summaryValue }, fmt(honCourtage)),
        ),
      ),

      // Honoraires
      isCourtage && totalDevisTTC > 0 && React.createElement(View, { style: { marginTop: 10 } },
        React.createElement(View, { style: S.summaryRow },
          React.createElement(Text, { style: [S.summaryLabel, { flex: 1 }] }, `Honoraires illiCO travaux COURTAGE : ${(tauxCourtage * 100).toFixed(1)}%`),
          React.createElement(Text, { style: S.summaryValue }, fmt(honCourtage)),
        ),
        React.createElement(View, { style: S.summaryRow },
          React.createElement(Text, { style: [S.summaryLabel, { flex: 1, color: '#9ca3af' }] }, 'TOTAL CHANTIER si COURTAGE'),
          React.createElement(Text, { style: [S.summaryValue, { color: '#9ca3af' }] }, fmt(totalDevisTTC + fraisTTC + honCourtage)),
        ),
        isAMO && React.createElement(View, null,
          React.createElement(View, { style: [S.dividerLight, { marginTop: 4 }] }),
          React.createElement(View, { style: S.summaryRowOrange },
            React.createElement(Text, { style: [S.summaryLabelOrange, { flex: 1 }] }, `Honoraires illiCO travaux AMO : ${((tauxCourtage + tauxAmo) * 100).toFixed(1)}%`),
            React.createElement(Text, { style: S.summaryValueOrange }, fmt(honAMO)),
          ),
          React.createElement(View, { style: S.summaryRowOrange },
            React.createElement(Text, { style: [S.summaryLabelOrange, { flex: 1 }] }, 'TOTAL CHANTIER si AMO'),
            React.createElement(Text, { style: S.summaryValueOrange }, fmt(totalDevisTTC + fraisTTC + honAMO)),
          ),
        ),
      ),

      // Footer
      React.createElement(View, { style: S.footerCenter, fixed: true },
        React.createElement(Text, { style: S.footerSlogan }, 'Quand vous pensez travaux, pensez illiCO !'),
      ),
    )
  )
}

function DossierFinChantierPDF({ dossier, devis, comptes_rendus, referente }) {
  const client = dossier.client
  const nomClient = client
    ? [client.civilite, client.prenom, client.nom, client.prenom2 ? `& ${client.prenom2} ${client.nom2}` : null].filter(Boolean).join(' ')
    : '—'
  const dateAuj = new Date().toLocaleDateString('fr-FR')
  const typologieLabel = { courtage: 'Courtage', amo: 'AMO', estimo: 'Estimo', audit_energetique: 'Audit', studio_jardin: 'Studio jardin' }[dossier.typologie] || dossier.typologie
  const devisAcceptes = (devis || []).filter(d => d.statut === 'accepte')
  const totalTTC = devisAcceptes.reduce((s, d) => s + toNumber(d.montant_ttc), 0)
  const crs = (comptes_rendus || []).filter(cr => cr.valide)

  const logoEl = logoBase64 ? React.createElement(PdfImage, { src: logoBase64, style: S.logo }) : React.createElement(View, { style: S.logo })

  const makeHeader = (title, sub) => React.createElement(View, null,
    React.createElement(View, { style: S.headerBox },
      React.createElement(View, null, logoEl),
      React.createElement(View, null,
        React.createElement(Text, { style: S.headerTitle }, title),
        sub && React.createElement(Text, { style: [S.clientText, { marginTop: 4 }] }, sub),
      ),
    ),
    React.createElement(View, { style: S.divider }),
  )

  const makeFooter = () => React.createElement(View, { style: S.footerCenter, fixed: true },
    React.createElement(Text, { style: S.footerSlogan }, 'Quand vous pensez travaux, pensez illiCO !'),
  )

  return React.createElement(Document, null,
    // Page 1
    React.createElement(Page, { size: 'A4', style: S.page },
      makeHeader('Dossier de fin de chantier', `Établi le ${dateAuj}`),
      React.createElement(View, { style: S.coverBlue },
        React.createElement(Text, { style: S.coverTitle }, nomClient),
        React.createElement(Text, { style: S.coverRef }, dossier.reference),
        React.createElement(Text, { style: S.coverSub }, typologieLabel),
      ),
      React.createElement(View, { style: S.infoGrid },
        React.createElement(View, { style: S.infoBlock },
          React.createElement(Text, { style: S.infoLabel }, 'Référente'),
          React.createElement(Text, { style: S.infoValue }, `${referente?.prenom || ''} ${referente?.nom || ''}`),
        ),
        React.createElement(View, { style: S.infoBlock },
          React.createElement(Text, { style: S.infoLabel }, 'Démarrage'),
          React.createElement(Text, { style: S.infoValue }, dossier.date_demarrage_chantier ? new Date(dossier.date_demarrage_chantier).toLocaleDateString('fr-FR') : '—'),
        ),
        React.createElement(View, { style: S.infoBlock },
          React.createElement(Text, { style: S.infoLabel }, 'Fin de chantier'),
          React.createElement(Text, { style: S.infoValue }, dossier.date_fin_chantier ? new Date(dossier.date_fin_chantier).toLocaleDateString('fr-FR') : '—'),
        ),
      ),
      React.createElement(View, { style: [S.dividerLight, { marginVertical: 10 }] }),
      React.createElement(Text, { style: S.sectionTitle }, 'Artisans intervenus'),
      React.createElement(View, { style: S.tableHeader },
        React.createElement(Text, { style: [S.tableHeaderCell, { flex: 3 }] }, 'Artisan'),
        React.createElement(Text, { style: [S.tableHeaderCell, { flex: 3 }] }, 'Description'),
        React.createElement(Text, { style: [S.tableHeaderCell, { flex: 2, textAlign: 'right' }] }, 'Montant HT'),
        React.createElement(Text, { style: [S.tableHeaderCell, { flex: 2, textAlign: 'right' }] }, 'Montant TTC'),
        React.createElement(Text, { style: [S.tableHeaderCell, { flex: 2, textAlign: 'center' }] }, 'Signature'),
      ),
      ...devisAcceptes.map((d, idx) =>
        React.createElement(View, { key: d.id, style: idx % 2 === 0 ? S.tableRow : S.tableRowAlt },
          React.createElement(Text, { style: [S.cell, { flex: 3 }] }, d.artisan?.entreprise || '—'),
          React.createElement(Text, { style: [S.cell, { flex: 3, color: GRIS_TEXTE }] }, d.notes || '—'),
          React.createElement(Text, { style: [S.cellRight, { flex: 2 }] }, fmt(d.montant_ht)),
          React.createElement(Text, { style: [S.cellRightBold, { flex: 2 }] }, fmt(d.montant_ttc)),
          React.createElement(Text, { style: [S.cell, { flex: 2, textAlign: 'center' }] }, d.date_signature ? new Date(d.date_signature).toLocaleDateString('fr-FR') : '—'),
        )
      ),
      React.createElement(View, { style: S.tableRowTotal },
        React.createElement(Text, { style: [S.cellWhiteBold, { flex: 6 }] }, 'TOTAL TRAVAUX'),
        React.createElement(Text, { style: { flex: 2 } }, ''),
        React.createElement(Text, { style: [S.cellRightWhiteBold, { flex: 2 }] }, fmt(totalTTC)),
        React.createElement(Text, { style: { flex: 2 } }, ''),
      ),
      makeFooter(),
    ),

    // Page CRs
    crs.length > 0 && React.createElement(Page, { size: 'A4', style: S.page },
      makeHeader('Comptes-rendus de visite', `${dossier.reference} — ${nomClient}`),
      ...crs.map((cr, idx) => {
        const typeLabel = { r1: 'R1 — Visite client', r2: 'R2 — Visite artisan', r3: 'R3 — Présentation devis', suivi: 'Visite de suivi', reception: 'Réception chantier' }[cr.type_visite] || cr.type_visite
        return React.createElement(View, { key: cr.id, style: { marginBottom: 14 }, wrap: false },
          React.createElement(View, { style: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 } },
            React.createElement(Text, { style: [S.cellBold, { color: BLEU_FONCE }] }, typeLabel),
            React.createElement(Text, { style: { fontSize: 8, color: GRIS_TEXTE } }, cr.date_visite ? new Date(cr.date_visite).toLocaleDateString('fr-FR') : new Date(cr.created_at).toLocaleDateString('fr-FR')),
          ),
          (cr.contenu_final || cr.notes_brutes) && React.createElement(Text, { style: { fontSize: 8, lineHeight: 1.6 } }, cr.contenu_final || cr.notes_brutes),
          idx < crs.length - 1 && React.createElement(View, { style: [S.dividerLight, { marginTop: 10 }] }),
        )
      }),
      makeFooter(),
    ),

    // Page attestation
    React.createElement(Page, { size: 'A4', style: S.page },
      makeHeader('Attestation de réception', `${dossier.reference} — ${nomClient}`),
      React.createElement(View, { style: { marginBottom: 24 } },
        React.createElement(Text, { style: { fontSize: 9, lineHeight: 1.8, marginBottom: 12 } },
          `Je soussigné(e) ${nomClient}, certifie avoir reçu et accepté la réception des travaux réalisés dans le cadre du dossier ${dossier.reference}, supervisé par illiCO travaux Martigues.`),
        React.createElement(Text, { style: { fontSize: 9, lineHeight: 1.8 } }, "Les travaux ont été réalisés conformément aux devis signés. Le dossier de fin de chantier m'a été remis."),
      ),
      React.createElement(View, { style: { flexDirection: 'row', gap: 30 } },
        React.createElement(View, { style: { flex: 1 } },
          React.createElement(Text, { style: S.infoLabel }, 'Fait à _________________, le _________________'),
          React.createElement(Text, { style: [S.cellBold, { color: BLEU_FONCE, marginTop: 14, marginBottom: 4 }] }, 'Signature client'),
          React.createElement(View, { style: S.signatureBox }),
          React.createElement(Text, { style: S.signatureLabel }, nomClient),
        ),
        React.createElement(View, { style: { flex: 1 } },
          React.createElement(Text, { style: S.infoLabel }, 'Cachet et signature illiCO travaux'),
          React.createElement(Text, { style: [S.cellBold, { color: BLEU_FONCE, marginTop: 14, marginBottom: 4 }] }, 'Signature référente'),
          React.createElement(View, { style: S.signatureBox }),
          React.createElement(Text, { style: S.signatureLabel }, `${referente?.prenom || ''} ${referente?.nom || ''} — illiCO travaux Martigues`),
        ),
      ),
      makeFooter(),
    ),
  )
}

export async function POST(request) {
  try {
    const { dossierId, type } = await request.json()
    if (!dossierId || !type) return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })

    const { data: dossier, error: dErr } = await supabaseAdmin
      .from('dossiers')
      .select('*, referente:profiles!dossiers_referente_id_fkey(id, prenom, nom), client:clients(*)')
      .eq('id', dossierId).single()
    if (dErr || !dossier) return NextResponse.json({ error: dErr?.message || 'Dossier non trouvé' }, { status: 404 })

    const { data: devis } = await supabaseAdmin
      .from('devis_artisans')
      .select('*, artisan:artisans(id, entreprise)')
      .eq('dossier_id', dossierId).order('created_at')

    let pdfBuffer
    if (type === 'recapitulatif') {
      const { data: suiviFinancier } = await supabaseAdmin.from('suivi_financier').select('*').eq('dossier_id', dossierId)
      pdfBuffer = await renderToBuffer(React.createElement(RecapitulatifPDF, { dossier, devis: devis || [], suiviFinancier: suiviFinancier || [] }))
    } else if (type === 'dossier_fin') {
      const { data: comptes_rendus } = await supabaseAdmin.from('comptes_rendus').select('*').eq('dossier_id', dossierId).order('date_visite')
      pdfBuffer = await renderToBuffer(React.createElement(DossierFinChantierPDF, { dossier, devis: devis || [], comptes_rendus: comptes_rendus || [], referente: dossier.referente }))
    } else {
      return NextResponse.json({ error: 'Type inconnu' }, { status: 400 })
    }

    const filename = type === 'recapitulatif' ? `Recapitulatif_${dossier.reference}.pdf` : `DossierFin_${dossier.reference}.pdf`
    return new Response(pdfBuffer, {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"` },
    })
  } catch (err) {
    console.error('PDF generation error:', err)
    return NextResponse.json({ error: err.message || 'Erreur PDF' }, { status: 500 })
  }
}