// app/api/pdf/route.js
// Génération PDF : récapitulatif financier client + CR

import React from 'react'
import { buildDossierRestitution, buildDossierR3, buildSuiviPaiementsSection } from './restitution.js'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { renderToBuffer, Document, Page, Text, View, Image as PdfImage, StyleSheet } from '@react-pdf/renderer'
import path from 'path'
import fs from 'fs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ── Couleurs ──
const BLEU = '#00578e'
const BLEU_CLAIR = '#2f8dcb'
const GRIS = '#f3f4f6'
const GRIS_TEXTE = '#6b7280'

// ── Helpers ──
const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const normalized = String(value).replace(/\s/g, '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

const fmt = (n) => `${toNumber(n).toFixed(2)} €`

function getLogoBase64() {
  const filePath = path.join(process.cwd(), 'public', 'logo.png')
  if (!fs.existsSync(filePath)) return null
  const data = fs.readFileSync(filePath)
  return `data:image/png;base64,${data.toString('base64')}`
}

const logoBase64 = getLogoBase64()

// ── Styles ──
const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#1F2937' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: BLEU },
  logo: { width: 140, height: 50 },
  headerRight: { alignItems: 'flex-end' },
  headerTitle: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: BLEU, marginBottom: 2 },
  headerSub: { fontSize: 9, color: GRIS_TEXTE },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: BLEU, marginBottom: 8, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: BLEU_CLAIR },
  infoGrid: { flexDirection: 'row', gap: 20, marginBottom: 4 },
  infoBlock: { flex: 1 },
  infoLabel: { fontSize: 8, color: GRIS_TEXTE, marginBottom: 2 },
  infoValue: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  table: { marginBottom: 12 },
  tableHeader: { flexDirection: 'row', backgroundColor: BLEU, padding: 6, borderRadius: 3 },
  tableHeaderCell: { color: 'white', fontSize: 9, fontFamily: 'Helvetica-Bold' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingVertical: 6, paddingHorizontal: 4 },
  tableRowAlt: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingVertical: 6, paddingHorizontal: 4, backgroundColor: GRIS },
  tableRowTotal: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 4, backgroundColor: BLEU_CLAIR, marginTop: 4, borderRadius: 3 },
  cell: { fontSize: 9 },
  cellBold: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  cellRight: { fontSize: 9, textAlign: 'right' },
  cellRightBold: { fontSize: 9, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  montantBlock: { flexDirection: 'row', justifyContent: 'space-between', padding: 10, backgroundColor: BLEU, borderRadius: 6, marginTop: 8 },
  montantLabel: { color: 'white', fontSize: 14, fontFamily: 'Helvetica-Bold' },
  montantValue: { color: 'white', fontSize: 14, fontFamily: 'Helvetica-Bold' },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 8 },
  footerText: { fontSize: 8, color: GRIS_TEXTE },
  divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 8 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  infoRowLabel: { fontSize: 9, color: GRIS_TEXTE, flex: 1, paddingRight: 12 },
  infoRowValue: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  coverBlock: { backgroundColor: BLEU, borderRadius: 8, padding: 20, marginBottom: 24 },
  coverTitle: { color: 'white', fontSize: 20, fontFamily: 'Helvetica-Bold', marginBottom: 8 },
  coverRef: { color: '#93C5FD', fontSize: 12, marginBottom: 4 },
  coverSub: { color: '#93C5FD', fontSize: 10 },
  signatureBox: { height: 60, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 4, marginTop: 4 },
  signatureLabel: { fontSize: 8, color: GRIS_TEXTE, marginTop: 4 },
})

// ── RÉCAPITULATIF FINANCIER CLIENT ──
function RecapitulatifPDF({ dossier, devis, suiviFinancier, factures }) {
  const client = dossier.client
  const nomClient = client
    ? `${client.civilite || ''} ${client.prenom || ''} ${client.nom || ''}`.trim()
    : '—'
  const referente = dossier.referente
    ? `${dossier.referente.prenom || ''} ${dossier.referente.nom || ''}`.trim()
    : '—'
  const typologieLabel = {
    courtage: 'Courtage', amo: 'AMO', estimo: 'Estimo',
    audit_energetique: 'Audit énergétique', studio_jardin: 'Studio de jardin',
  }[dossier.typologie] || dossier.typologie || '—'

  const devisAcceptes = (devis || []).filter((d) => d.statut === 'accepte')
  const totalDevisTTCSignes = devisAcceptes.reduce((s, d) => s + toNumber(d.montant_ttc), 0)
  const totalDevisHTSignes = devisAcceptes.reduce((s, d) => s + toNumber(d.montant_ht), 0)
  const tauxCourtage = toNumber(dossier.taux_courtage ?? 0.06)
  const tauxAmo = toNumber(dossier.honoraires_amo_taux ?? 9) / 100
  const fraisTTC = toNumber(dossier.frais_consultation)
  const fraisHT = (dossier.frais_deduits && fraisTTC) ? fraisTTC / 1.2 : 0
  const baseCourtageHTTC = totalDevisTTCSignes - (fraisHT * 1.2)
  const honorairesCourtage = baseCourtageHTTC * tauxCourtage
  const honorairesAMO = baseCourtageHTTC * (tauxCourtage + tauxAmo)
  const isAMO = dossier.typologie === 'amo'
  const isCourtage = ['courtage', 'amo'].includes(dossier.typologie)
  const dateAuj = new Date().toLocaleDateString('fr-FR')

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {logoBase64 ? <PdfImage src={logoBase64} style={styles.logo} /> : <View style={styles.logo} />}
          <View style={styles.headerRight}>
            <Text style={styles.headerTitle}>Récapitulatif financier</Text>
            <Text style={styles.headerSub}>illiCO travaux Martigues</Text>
            <Text style={[styles.headerSub, { marginTop: 2 }]}>Établi le {dateAuj}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations du dossier</Text>
          <View style={styles.infoGrid}>
            <View style={styles.infoBlock}><Text style={styles.infoLabel}>Client</Text><Text style={styles.infoValue}>{nomClient}</Text></View>
            <View style={styles.infoBlock}><Text style={styles.infoLabel}>Référence chantier</Text><Text style={styles.infoValue}>{dossier.reference || '—'}</Text></View>
            <View style={styles.infoBlock}><Text style={styles.infoLabel}>Prestation</Text><Text style={styles.infoValue}>{typologieLabel}</Text></View>
            <View style={styles.infoBlock}><Text style={styles.infoLabel}>Référente</Text><Text style={styles.infoValue}>{referente}</Text></View>
          </View>
          {client?.adresse ? (<View style={{ marginTop: 4 }}><Text style={styles.infoLabel}>Adresse</Text><Text style={styles.cell}>{client.adresse}</Text></View>) : null}
        </View>

        {(devisAcceptes.length > 0 || (fraisTTC > 0 && dossier.frais_statut !== 'offerts' && !dossier.frais_deduits)) ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Devis artisans signés</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { width: 18 }]}> </Text>
                <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Intervenant</Text>
                <Text style={[styles.tableHeaderCell, { flex: 4 }]}>Description</Text>
                <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>Montant HT</Text>
                <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>Montant TTC</Text>
              </View>
              {fraisTTC > 0 && dossier.frais_statut !== 'offerts' && !dossier.frais_deduits ? (
                <View style={styles.tableRow}>
                  <Text style={[styles.cell, { width: 18, color: GRIS_TEXTE }]}>0</Text>
                  <Text style={[styles.cell, { flex: 3 }]}>illiCO travaux</Text>
                  <Text style={[styles.cell, { flex: 4 }]}>Frais de consultation</Text>
                  <Text style={[styles.cellRight, { flex: 2 }]}>{fmt(fraisTTC / 1.2)}</Text>
                  <Text style={[styles.cellRightBold, { flex: 2 }]}>{fmt(fraisTTC)}</Text>
                </View>
              ) : null}
              {devisAcceptes.map((d, idx) => {
                const n = idx + 1
                const rowStyle = n % 2 === 0 ? styles.tableRow : styles.tableRowAlt
                return (
                  <View key={d.id} style={rowStyle}>
                    <Text style={[styles.cell, { width: 18, color: GRIS_TEXTE }]}>{String(n)}</Text>
                    <Text style={[styles.cell, { flex: 3 }]}>{d.artisan?.entreprise || '—'}</Text>
                    <Text style={[styles.cell, { flex: 4, color: GRIS_TEXTE }]}>{d.notes || '—'}</Text>
                    <Text style={[styles.cellRight, { flex: 2 }]}>{fmt(d.montant_ht)}</Text>
                    <Text style={[styles.cellRightBold, { flex: 2 }]}>{fmt(d.montant_ttc)}</Text>
                  </View>
                )
              })}
              <View style={{ flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 4, backgroundColor: '#ddeef8' }}>
                <Text style={[styles.cellBold, { width: 18 }]}> </Text>
                <Text style={[styles.cellBold, { flex: 9 }]}>Total HT</Text>
                <Text style={[styles.cellRightBold, { flex: 2, color: BLEU }]}>
                  {fmt(totalDevisHTSignes + (fraisTTC > 0 && dossier.frais_statut !== 'offerts' && !dossier.frais_deduits ? fraisTTC / 1.2 : 0))}
                </Text>
                <Text style={{ flex: 2 }}> </Text>
              </View>
              <View style={{ flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 4, backgroundColor: BLEU }}>
                <Text style={[styles.cellBold, { width: 18, color: 'white' }]}> </Text>
                <Text style={[styles.cellBold, { flex: 9, color: 'white' }]}>Total TTC</Text>
                <Text style={{ flex: 2 }}> </Text>
                <Text style={[styles.cellRightBold, { flex: 2, color: 'white' }]}>
                  {fmt(totalDevisTTCSignes + (fraisTTC > 0 && dossier.frais_statut !== 'offerts' && !dossier.frais_deduits ? fraisTTC : 0))}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {buildSuiviPaiementsSection({ devisList: devisAcceptes, factures, suiviFinancier, dossier })}

        {isCourtage && totalDevisTTCSignes > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Honoraires illiCO travaux</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoRowLabel}>Honoraires courtage ({(tauxCourtage * 100).toFixed(1)}%) — à la signature des devis</Text>
              <View style={{ alignItems: 'flex-end' }}><Text style={styles.infoRowValue}>{fmt(honorairesCourtage)}</Text></View>
            </View>
            {isAMO ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoRowLabel}>Honoraires AMO solde ({(tauxAmo * 100).toFixed(1)}%) — à la fin du chantier</Text>
                <View style={{ alignItems: 'flex-end' }}><Text style={styles.infoRowValue}>{fmt(honorairesAMO - honorairesCourtage)}</Text></View>
              </View>
            ) : null}
            {isAMO ? (
              <View style={[styles.infoRow, { backgroundColor: BLEU_CLAIR, borderRadius: 4, paddingHorizontal: 8 }]}>
                <Text style={styles.cellBold}>Total honoraires AMO ({((tauxCourtage + tauxAmo) * 100).toFixed(1)}%)</Text>
                <Text style={styles.cellRightBold}>{fmt(honorairesAMO)}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.montantBlock}>
          <Text style={styles.montantLabel}>TOTAL PROJET</Text>
          <Text style={styles.montantValue}>
            {fmt(totalDevisTTCSignes + (isAMO ? honorairesAMO : isCourtage ? honorairesCourtage : 0) + (dossier.frais_statut === 'offerts' || dossier.frais_deduits ? 0 : fraisTTC))}
          </Text>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>illiCO travaux Martigues — {dossier.reference}</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

function buildRecapitulatifDocument({ dossier, devis, suiviFinancier, factures }) {
  return React.createElement(RecapitulatifPDF, { dossier, devis, suiviFinancier, factures })
}

// ── COMPTE-RENDU PDF ──
function buildCRDocument({ dossier, cr, sections, logo }) {
  const client = dossier.client
  const nomClient = client
    ? [client.civilite, client.prenom, client.nom, client.prenom2 ? '& ' + client.prenom2 + ' ' + client.nom2 : null].filter(Boolean).join(' ')
    : '—'
  const ref = dossier.referente
  const nomRef = ref ? (ref.prenom + ' ' + ref.nom) : 'illiCO travaux Martigues'

  const TITRES = {
    r1: 'COMPTE RENDU DE PREMIÈRE VISITE',
    r2: 'COMPTE RENDU DE VISITE TECHNIQUE',
    r3: 'COMPTE RENDU DE PRÉSENTATION DES DEVIS',
    suivi: 'COMPTE RENDU DE SUIVI DE CHANTIER',
    reception: 'COMPTE RENDU DE RÉCEPTION DE CHANTIER',
  }
  const titre = TITRES[cr.type_visite] || 'COMPTE RENDU DE VISITE'
  const dateEmis = new Date(cr.created_at || Date.now()).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  const CRS = StyleSheet.create({
    page: { padding: 40, paddingBottom: 60, fontFamily: 'Helvetica', fontSize: 9, backgroundColor: '#ffffff' },
    logoImg: { width: 120, height: 48, marginBottom: 12 },
    titleBlock: { marginBottom: 18, borderBottomWidth: 2, borderBottomColor: BLEU, paddingBottom: 10 },
    mainTitle: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: BLEU, marginBottom: 3 },
    emis: { fontSize: 9, color: '#6b7280' },
    secWrap: { marginBottom: 14 },
    secHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    secNum: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: BLEU, marginRight: 6 },
    secTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: BLEU, flex: 1 },
    secLine: { height: 1.5, backgroundColor: BLEU, marginBottom: 8 },
    para: { fontSize: 9, color: '#1f2937', lineHeight: 1.65, marginBottom: 5 },
    listRow: { flexDirection: 'row', marginBottom: 4, paddingLeft: 4 },
    listBullet: { fontSize: 9, color: '#1f2937', width: 14 },
    listText: { fontSize: 9, color: '#1f2937', flex: 1, lineHeight: 1.55 },
    bold: { fontFamily: 'Helvetica-Bold' },
    footer: { position: 'absolute', bottom: 22, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 5 },
    footerTxt: { fontSize: 7.5, color: '#6b7280' },
  })

  const inlineEl = (text) => {
    const parts = text.split(/\*\*(.+?)\*\*/g)
    if (parts.length === 1) return text
    return parts.map((p, i) => i % 2 === 1 ? React.createElement(Text, { key: i, style: CRS.bold }, p) : p)
  }

  const renderKVTable = (rows, col1Label, col2Label) => {
    const thStyle = { color: '#ffffff', fontSize: 9, fontFamily: 'Helvetica-Bold' }
    return React.createElement(View, { style: { marginBottom: 8 } },
      React.createElement(View, { style: { flexDirection: 'row', backgroundColor: BLEU, paddingVertical: 5, paddingHorizontal: 8 } },
        React.createElement(Text, { style: [thStyle, { flex: 1.8 }] }, col1Label),
        React.createElement(Text, { style: [thStyle, { flex: 2.2 }] }, col2Label),
      ),
      ...rows.map(([k, v], i) =>
        React.createElement(View, { key: i, style: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: i % 2 === 0 ? '#f9fafb' : '#ffffff' } },
          React.createElement(Text, { style: { fontSize: 9, fontFamily: 'Helvetica-Bold', flex: 1.8, color: '#374151' } }, k),
          React.createElement(Text, { style: { fontSize: 9, flex: 2.2, color: '#1f2937' } }, v),
        )
      )
    )
  }

  const renderContent = (contenu, secTitre) => {
    if (!contenu) return []
    const lines = contenu.split('\n').filter(l => l !== undefined)
    const isIdent = /identification/i.test(secTitre || '')
    const isPlanning = /planning/i.test(secTitre || '')
    const kvLines = lines.filter(l => l.trim()).map(l => {
      const m = l.match(/^\*\*(.+?)\s*:\*\*\s*(.*)/) || l.match(/^\*\*(.+?):\s*\*\*(.*)/)
      return m ? [m[1].trim(), m[2].trim()] : null
    })
    const allKV = kvLines.length > 0 && kvLines.every(Boolean)
    if (isIdent && allKV) return [renderKVTable(kvLines, 'Champ', 'Information')]
    if (isPlanning && allKV) return [renderKVTable(kvLines, 'Date', 'Interventions prévues')]

    const blocks = []
    let listItems = []
    const flushList = () => {
      if (!listItems.length) return
      blocks.push(React.createElement(View, { key: 'l' + blocks.length, style: { marginBottom: 6 } },
        ...listItems.map((item, i) =>
          React.createElement(View, { key: i, style: CRS.listRow },
            React.createElement(Text, { style: CRS.listBullet }, '–'),
            React.createElement(Text, { style: CRS.listText }, inlineEl(item)),
          )
        )
      ))
      listItems = []
    }
    lines.forEach((line, i) => {
      const bullet = line.match(/^[-–]\s+(.+)/)
      if (bullet) { listItems.push(bullet[1]); return }
      if (!line.trim()) { flushList(); return }
      flushList()
      const subhead = line.match(/^\*\*(.+?)\s*:\*\*\s*$/) || line.match(/^\*\*(.+?):\s*\*\*\s*$/)
      if (subhead) {
        blocks.push(React.createElement(Text, { key: i, style: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#1f2937', marginTop: 6, marginBottom: 3 } }, subhead[1].trim() + ' :'))
        return
      }
      blocks.push(React.createElement(Text, { key: i, style: CRS.para }, inlineEl(line.trim())))
    })
    flushList()
    return blocks
  }

  return React.createElement(Document, null,
    React.createElement(Page, { size: 'A4', style: CRS.page },
      logo && React.createElement(PdfImage, { src: logo, style: CRS.logoImg }),
      React.createElement(View, { style: CRS.titleBlock },
        React.createElement(Text, { style: CRS.mainTitle }, titre),
        React.createElement(Text, { style: CRS.emis }, 'Émis le ' + dateEmis),
      ),
      ...sections.map((s, i) =>
        React.createElement(View, { key: i, style: CRS.secWrap, wrap: false },
          React.createElement(View, { style: CRS.secHeader },
            s.numero && React.createElement(Text, { style: CRS.secNum }, s.numero + '.'),
            React.createElement(Text, { style: CRS.secTitle }, (s.titre || '').toUpperCase()),
          ),
          React.createElement(View, { style: CRS.secLine }),
          ...renderContent(s.contenu, s.titre),
        )
      ),
      React.createElement(View, { style: CRS.footer, fixed: true },
        React.createElement(Text, { style: CRS.footerTxt }, 'Document établi le ' + dateEmis + ' – Chantier ' + nomClient),
        React.createElement(Text, { style: CRS.footerTxt }, nomRef + ' – illiCO travaux Martigues'),
        React.createElement(Text, { style: CRS.footerTxt, render: ({ pageNumber, totalPages }) => pageNumber + ' / ' + totalPages }),
      ),
    )
  )
}

// ── ROUTE API ──
export async function POST(request) {
  try {
    const { dossierId, type, crId } = await request.json()

    if (!dossierId || !type) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
    }

    const { data: dossier, error: dossierError } = await supabaseAdmin
      .from('dossiers')
      .select('*, referente:profiles!dossiers_referente_id_fkey(id, prenom, nom, email, telephone), client:clients(*)')
      .eq('id', dossierId)
      .single()

    if (dossierError) return NextResponse.json({ error: dossierError.message }, { status: 500 })
    if (!dossier) return NextResponse.json({ error: 'Dossier non trouvé' }, { status: 404 })

    const { data: devis, error: devisError } = await supabaseAdmin
      .from('devis_artisans')
      .select('*, artisan:artisans(id, entreprise)')
      .eq('dossier_id', dossierId)
      .order('created_at')

    if (devisError) return NextResponse.json({ error: devisError.message }, { status: 500 })

    let pdfBuffer

    if (type === 'recapitulatif') {
      const { data: suiviFinancier, error: suiviError } = await supabaseAdmin
        .from('suivi_financier').select('*').eq('dossier_id', dossierId)
      if (suiviError) return NextResponse.json({ error: suiviError.message }, { status: 500 })
      const { data: factures, error: facturesError } = await supabaseAdmin
        .from('factures_artisans').select('*').eq('dossier_id', dossierId).order('date_paiement')
      if (facturesError) return NextResponse.json({ error: facturesError.message }, { status: 500 })
      const doc = buildRecapitulatifDocument({ dossier, devis: devis || [], suiviFinancier: suiviFinancier || [], factures: factures || [] })
      pdfBuffer = await renderToBuffer(doc)

    } else if (type === 'dossier_restitution') {
      const { data: devisComplets } = await supabaseAdmin
        .from('devis_artisans')
        .select('*, artisan:artisans(id, entreprise, metier, kbis_url, decennale_url, decennale_expiration)')
        .eq('dossier_id', dossierId).order('created_at')

      const { data: photos } = await supabaseAdmin
        .from('photos').select('*')
        .eq('dossier_id', dossierId).eq('categorie', 'maquette').order('created_at')

      const { data: interventions } = await supabaseAdmin
        .from('interventions_artisans')
        .select('*, artisan:artisans(id, entreprise)')
        .eq('dossier_id', dossierId).order('date_debut')

      const { data: fichesTech } = await supabaseAdmin
        .from('chantier_fiches_techniques')
        .select('fiche:fiches_techniques(id, nom, description)')
        .eq('dossier_id', dossierId)

      const { data: docsRestitution } = await supabaseAdmin
        .from('chantier_documents').select('*')
        .eq('dossier_id', dossierId).eq('dans_restitution', true).order('created_at')

      const { data: factures } = await supabaseAdmin
        .from('factures_artisans').select('*')
        .eq('dossier_id', dossierId).order('date_paiement')

      const { data: suiviFinancier } = await supabaseAdmin
        .from('suivi_financier').select('*').eq('dossier_id', dossierId)

      const photosWithBase64 = await Promise.all((photos || []).map(async (photo) => {
        try {
          const { data: fileData } = await supabaseAdmin.storage.from('photos').download(photo.url)
          if (fileData) {
            const buf = Buffer.from(await fileData.arrayBuffer())
            const ext = (photo.url || '').split('.').pop().toLowerCase()
            const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
            return { ...photo, base64: `data:${mime};base64,${buf.toString('base64')}` }
          }
        } catch {}
        return photo
      }))

      pdfBuffer = await buildDossierRestitution({
        dossier,
        devis: devisComplets || [],
        photos: photosWithBase64,
        interventions: interventions || [],
        fichesTech: fichesTech || [],
        docsRestitution: docsRestitution || [],
        factures: factures || [],
        suiviFinancier: suiviFinancier || [],
        logo: getLogoBase64(),
        supabaseAdmin,
      })

    } else if (type === 'dossier_r3') {
      const { data: devisComplets } = await supabaseAdmin
        .from('devis_artisans')
        .select('*, artisan:artisans(id, entreprise, metier, kbis_url, decennale_url)')
        .eq('dossier_id', dossierId).order('created_at')

      pdfBuffer = await buildDossierR3({
        dossier,
        devis: devisComplets || [],
        supabaseAdmin,
        logo: getLogoBase64(),
      })

    } else if (type === 'cr') {
      if (!crId) return NextResponse.json({ error: 'crId manquant' }, { status: 400 })
      const { data: cr } = await supabaseAdmin.from('comptes_rendus').select('*').eq('id', crId).single()
      if (!cr) return NextResponse.json({ error: 'CR non trouvé' }, { status: 404 })

      const sections = (cr.contenu_final || '').split(/(?=## \d+\.)/).map(block => {
        const match = block.match(/^## (\d+)\. (.+?)\n([\s\S]*)/)
        if (match) return { numero: match[1], titre: match[2].trim(), contenu: match[3].trim() }
        const trimmed = block.trim()
        if (!trimmed) return null
        return { numero: '', titre: '', contenu: trimmed }
      }).filter(Boolean).filter(s => s.contenu)

      const doc = buildCRDocument({ dossier, cr, sections, logo: getLogoBase64() })
      pdfBuffer = await renderToBuffer(doc)

    } else {
      return NextResponse.json({ error: 'Type de PDF inconnu' }, { status: 400 })
    }

    const TYPES_LABEL = { r1: 'R1', r2: 'R2', r3: 'R3', suivi: 'Suivi', reception: 'Reception' }
    const filename =
      type === 'recapitulatif' ? `Recapitulatif_${dossier.reference}.pdf`
      : type === 'dossier_restitution' ? `DossierRestitution_${dossier.reference}.pdf`
      : type === 'dossier_r3' ? `DossierR3_${dossier.reference}.pdf`
      : type === 'cr' ? `CR_${TYPES_LABEL[cr?.type_visite] || 'visite'}_${dossier.reference}.pdf`
      : `Dossier_${dossier.reference}.pdf`

    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('PDF generation error:', err)
    return NextResponse.json({ error: err.message || 'Erreur PDF' }, { status: 500 })
  }
}