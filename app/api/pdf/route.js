// app/api/pdf/route.js
// Génération PDF : récapitulatif financier client + CR

import React from 'react'
import { buildDossierSuivi, buildSuiviPaiementsSection } from './restitution.js'
import { formatNomClient } from '../../lib/clients.js'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { renderToBuffer, Document, Page, Text, View, Image as PdfImage, StyleSheet } from '@react-pdf/renderer'
import '../../lib/pdf/fonts.js'
import path from 'path'
import fs from 'fs'
import { requireUser } from '../../lib/api-auth'
import RecapHonoraires from '../../lib/pdf/RecapHonoraires.js'
import { stripEmojiPdf } from '../../lib/pdf/stripEmoji.js'

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

const fmt = (n) => {
  const v = toNumber(n).toFixed(2)
  const [int, dec] = v.split('.')
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + dec + ' €'
}

function getLogoBase64() {
  const filePath = path.join(process.cwd(), 'public', 'logo.png')
  if (!fs.existsSync(filePath)) return null
  const data = fs.readFileSync(filePath)
  return `data:image/png;base64,${data.toString('base64')}`
}

const logoBase64 = getLogoBase64()

// ── Styles ──
const styles = StyleSheet.create({
  page: { padding: 32, paddingBottom: 50, fontFamily: 'Roboto', fontSize: 10, color: '#1F2937' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: BLEU },
  logo: { width: 120, height: 44 },
  headerRight: { alignItems: 'flex-end' },
  headerTitle: { fontSize: 16, fontFamily: 'Roboto-Bold', color: BLEU, marginBottom: 2 },
  headerSub: { fontSize: 8, color: GRIS_TEXTE },
  section: { marginBottom: 10 },
  sectionTitle: { fontSize: 10, fontFamily: 'Roboto-Bold', color: BLEU, marginBottom: 5, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: BLEU_CLAIR },
  infoGrid: { flexDirection: 'row', gap: 16, marginBottom: 3 },
  infoBlock: { flex: 1 },
  infoLabel: { fontSize: 7.5, color: GRIS_TEXTE, marginBottom: 1 },
  infoValue: { fontSize: 9, fontFamily: 'Roboto-Bold' },
  table: { marginBottom: 8 },
  tableHeader: { flexDirection: 'row', backgroundColor: BLEU, padding: 5, borderRadius: 3 },
  tableHeaderCell: { color: 'white', fontSize: 8, fontFamily: 'Roboto-Bold' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingVertical: 4, paddingHorizontal: 4 },
  tableRowAlt: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingVertical: 4, paddingHorizontal: 4, backgroundColor: GRIS },
  tableRowTotal: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 4, backgroundColor: BLEU_CLAIR, marginTop: 3, borderRadius: 3 },
  cell: { fontSize: 8 },
  cellBold: { fontSize: 8, fontFamily: 'Roboto-Bold' },
  cellRight: { fontSize: 8, textAlign: 'right' },
  cellRightBold: { fontSize: 8, fontFamily: 'Roboto-Bold', textAlign: 'right' },
  montantBlock: { flexDirection: 'row', justifyContent: 'space-between', padding: 8, backgroundColor: BLEU, borderRadius: 6, marginTop: 6 },
  montantLabel: { color: 'white', fontSize: 13, fontFamily: 'Roboto-Bold' },
  montantValue: { color: 'white', fontSize: 13, fontFamily: 'Roboto-Bold' },
  footer: { position: 'absolute', bottom: 22, left: 32, right: 32, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 6 },
  footerText: { fontSize: 7.5, color: GRIS_TEXTE },
  divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 5 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  infoRowLabel: { fontSize: 8.5, color: GRIS_TEXTE, flex: 1, paddingRight: 12 },
  infoRowValue: { fontSize: 8.5, fontFamily: 'Roboto-Bold' },
  coverBlock: { backgroundColor: BLEU, borderRadius: 8, padding: 20, marginBottom: 24 },
  coverTitle: { color: 'white', fontSize: 20, fontFamily: 'Roboto-Bold', marginBottom: 8 },
  coverRef: { color: '#93C5FD', fontSize: 12, marginBottom: 4 },
  coverSub: { color: '#93C5FD', fontSize: 10 },
  signatureBox: { height: 60, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 4, marginTop: 4 },
  signatureLabel: { fontSize: 8, color: GRIS_TEXTE, marginTop: 4 },
})

// ── RÉCAPITULATIF FINANCIER CLIENT ──
function RecapitulatifPDF({ dossier, devis, suiviFinancier, factures, preview = false }) {
  const client = dossier.client
  const nomClient = formatNomClient(client, { civilite: true })
  const referente = dossier.referente
    ? `${dossier.referente.prenom || ''} ${dossier.referente.nom || ''}`.trim()
    : '—'
  const typologieLabel = {
    courtage: 'Courtage', amo: 'AMO', estimo: 'Estimo',
    audit_energetique: 'Audit énergétique', studio_jardin: 'Studio de jardin',
  }[dossier.typologie] || dossier.typologie || '—'

  const devisAcceptes = (devis || []).filter((d) => preview ? (d.statut === 'recu' || d.statut === 'accepte') : d.statut === 'accepte')
  const totalDevisTTCSignes = devisAcceptes.reduce((s, d) => s + toNumber(d.montant_ttc), 0)
  const totalDevisHTSignes = devisAcceptes.reduce((s, d) => s + toNumber(d.montant_ht), 0)
  const fraisTTC = toNumber(dossier.frais_consultation)
  const fraisStatut = dossier.frais_statut
  const fraisInTable = fraisTTC > 0 && fraisStatut !== 'offerts' && fraisStatut !== 'rembourse'
  const fraisOfferts = fraisStatut === 'offerts' && fraisTTC > 0
  const dateAuj = new Date().toLocaleDateString('fr-FR')

  const totalFraisTable = fraisInTable ? fraisTTC : 0
  const totalTTCAvecFrais = totalDevisTTCSignes + totalFraisTable

  // Acomptes par artisan
  const acomptesArtisans = devisAcceptes.map(d => {
    const ttc = toNumber(d.montant_ttc)
    const pct = toNumber(d.acompte_pourcentage ?? 30)
    const montantFixe = toNumber(d.acompte_montant_fixe)
    const acompte = pct === -1 ? montantFixe : ttc * (pct / 100)
    const pctLabel = pct === -1 ? '' : ` (${pct}%)`
    const suiviArt = (suiviFinancier || []).find(s => s.type_echeance === 'acompte_artisan' && (s.artisan_id === d.artisan_id || s.artisan_id === d.artisan?.id))
    const statut = suiviArt?.statut_client === 'regle' ? 'Payé' : 'À régler'
    const couleurStatut = suiviArt?.statut_client === 'regle' ? '#16a34a' : '#d97706'
    return { entreprise: d.artisan?.entreprise || '—', acompte, pctLabel, statut, couleurStatut }
  })
  const totalAcomptes = acomptesArtisans.reduce((s, a) => s + a.acompte, 0)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {logoBase64 ? <PdfImage src={logoBase64} style={styles.logo} /> : <View style={styles.logo} />}
          <View style={styles.headerRight}>
            <Text style={styles.headerTitle}>{preview ? 'Récapitulatif financier' : 'Suivi financier'}</Text>
            <Text style={styles.headerSub}>{dossier.agence?.nom || ''}</Text>
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

        {/* ── Tableau intervenants ── */}
        {(devisAcceptes.length > 0 || fraisInTable || fraisOfferts) ? (
          <View style={[styles.section, { marginBottom: 2 }]}>
            <Text style={styles.sectionTitle}>{preview ? 'Intervenants' : 'Intervenants (devis signés)'}</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { width: 18 }]}> </Text>
                <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Intervenant</Text>
                <Text style={[styles.tableHeaderCell, { flex: 4 }]}>Description</Text>
                <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>Montant HT</Text>
                <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>Montant TTC</Text>
              </View>
              {/* Frais de consultation — dans le tableau si non offerts */}
              {fraisInTable ? (
                <View style={styles.tableRow}>
                  <Text style={[styles.cell, { width: 18, color: GRIS_TEXTE }]}>0</Text>
                  <Text style={[styles.cell, { flex: 3 }]}>illiCO travaux</Text>
                  <Text style={[styles.cell, { flex: 4 }]}>Frais de consultation</Text>
                  <Text style={[styles.cellRight, { flex: 2 }]}>{fmt(fraisTTC / 1.2)}</Text>
                  <Text style={[styles.cellRightBold, { flex: 2 }]}>{fmt(fraisTTC)}</Text>
                </View>
              ) : null}
              {/* Frais offerts — mention "Offert" */}
              {fraisOfferts ? (
                <View style={[styles.tableRow, { backgroundColor: '#eff6ff' }]}>
                  <Text style={[styles.cell, { width: 18, color: GRIS_TEXTE }]}>0</Text>
                  <Text style={[styles.cell, { flex: 3 }]}>illiCO travaux</Text>
                  <Text style={[styles.cell, { flex: 4 }]}>Frais de consultation</Text>
                  <Text style={[styles.cellRight, { flex: 2, color: '#2563eb' }]}>—</Text>
                  <Text style={[styles.cellRightBold, { flex: 2, color: '#2563eb' }]}>Offert</Text>
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
              <View style={{ flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 4, backgroundColor: '#ddeef8' }}>
                <Text style={[styles.cell, { width: 18 }]}> </Text>
                <Text style={[styles.cell, { flex: 9, fontSize: 7.5 }]}>Total HT</Text>
                <Text style={[styles.cellRight, { flex: 2, color: BLEU, fontSize: 7.5 }]}>
                  {fmt(totalDevisHTSignes + (fraisInTable ? fraisTTC / 1.2 : 0))}
                </Text>
                <Text style={{ flex: 2 }}> </Text>
              </View>
              <View style={{ flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 4, backgroundColor: BLEU }}>
                <Text style={[styles.cell, { width: 18, color: 'white' }]}> </Text>
                <Text style={[styles.cell, { flex: 9, color: 'white', fontSize: 7.5 }]}>Total TTC artisans</Text>
                <Text style={{ flex: 2 }}> </Text>
                <Text style={[styles.cellRight, { flex: 2, color: 'white', fontSize: 7.5 }]}>
                  {fmt(totalTTCAvecFrais)}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* ── Geste commercial — frais remboursés après signature ── */}
        {/* NOTE: affiché dans la section honoraires ci-dessous */}

        {/* ── Acomptes artisans ── */}
        {acomptesArtisans.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Acomptes entreprises</Text>
            {acomptesArtisans.map((a, i) => (
              <View key={i} style={styles.infoRow}>
                <Text style={[styles.infoRowLabel, { flex: 1 }]}>{a.entreprise}{a.pctLabel}</Text>
                {!preview ? (
                  <Text style={{ fontSize: 7.5, color: a.couleurStatut, fontFamily: 'Roboto-Bold', width: 54, textAlign: 'center' }}>{a.statut}</Text>
                ) : null}
                <Text style={[styles.infoRowValue, { width: 72, textAlign: 'right' }]}>{fmt(a.acompte)}</Text>
              </View>
            ))}
            <View style={[styles.infoRow, { backgroundColor: '#ddeef8', paddingHorizontal: 4, borderRadius: 3 }]}>
              <Text style={[styles.cellBold, { flex: 1 }]}>Total acomptes artisans</Text>
              <Text style={[styles.cellRightBold, { color: BLEU, fontSize: 9 }]}>{fmt(totalAcomptes)}</Text>
            </View>
          </View>
        ) : null}

        {/* ── Suivi paiements (final uniquement) ── */}
        {preview ? null : (buildSuiviPaiementsSection({ devisList: devisAcceptes, factures, suiviFinancier, dossier }) || null)}

        {/* ── Honoraires illiCO (composant partagé) ── */}
        <RecapHonoraires dossier={dossier} devis={devis} suiviFinancier={suiviFinancier} preview={preview} />


        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{dossier.agence?.nom || ''} — {dossier.reference}</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
            

function buildRecapitulatifDocument({ dossier, devis, suiviFinancier, factures, preview = false }) 
{
  return React.createElement(RecapitulatifPDF, { dossier, devis, suiviFinancier, factures, preview })
}

// ── COMPTE-RENDU PDF ──
function buildCRDocument({ dossier, cr, sections, logo }) {
  const client = dossier.client
  const nomClient = formatNomClient(client, { civilite: true })
  const ref = dossier.referente
  const nomRef = ref ? (ref.prenom + ' ' + ref.nom) : ''

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
    page: { padding: 40, paddingBottom: 60, fontFamily: 'Roboto', fontSize: 9, backgroundColor: '#ffffff' },
    logoImg: { width: 120, height: 48, marginBottom: 12 },
    titleBlock: { marginBottom: 18, borderBottomWidth: 2, borderBottomColor: BLEU, paddingBottom: 10 },
    mainTitle: { fontSize: 16, fontFamily: 'Roboto-Bold', color: BLEU, marginBottom: 3 },
    emis: { fontSize: 9, color: '#6b7280' },
    secHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    secNum: { fontSize: 11, fontFamily: 'Roboto-Bold', color: BLEU, marginRight: 6 },
    secTitle: { fontSize: 11, fontFamily: 'Roboto-Bold', color: BLEU, flex: 1 },
    secLine: { height: 1.5, backgroundColor: BLEU, marginBottom: 8 },
    para: { fontSize: 9, color: '#1f2937', lineHeight: 1.65, marginBottom: 5 },
    listRow: { flexDirection: 'row', marginBottom: 4, paddingLeft: 4 },
    listBullet: { fontSize: 9, color: '#1f2937', width: 14 },
    listText: { fontSize: 9, color: '#1f2937', flex: 1, lineHeight: 1.55 },
    bold: { fontFamily: 'Roboto-Bold' },
    footer: { position: 'absolute', bottom: 22, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 5 },
    footerTxt: { fontSize: 7.5, color: '#6b7280' },
  })

  const inlineEl = (text) => {
    const parts = text.split(/\*\*(.+?)\*\*/g)
    if (parts.length === 1) return text
    return parts.map((p, i) => i % 2 === 1 ? React.createElement(Text, { key: i, style: CRS.bold }, p) : p)
  }

  // keepTogether=true -> wrap:false (insécable). À RÉSERVER aux tableaux BORNÉS qui ne
  // peuvent pas dépasser une page (identification : ~8 lignes). Sinon (planning, prose)
  // le tableau reste sécable pour pouvoir paginer.
  const renderKVTable = (rows, col1Label, col2Label, keepTogether = false) => {
    const thStyle = { color: '#ffffff', fontSize: 9, fontFamily: 'Roboto-Bold' }
    return React.createElement(View, { style: { marginBottom: 8 }, wrap: !keepTogether },
      React.createElement(View, { style: { flexDirection: 'row', backgroundColor: BLEU, paddingVertical: 5, paddingHorizontal: 8 } },
        React.createElement(Text, { style: [thStyle, { flex: 1.8 }] }, col1Label),
        React.createElement(Text, { style: [thStyle, { flex: 2.2 }] }, col2Label),
      ),
      ...rows.map(([k, v], i) =>
        React.createElement(View, { key: i, style: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: i % 2 === 0 ? '#f9fafb' : '#ffffff' } },
          React.createElement(Text, { style: { fontSize: 9, fontFamily: 'Roboto-Bold', flex: 1.8, color: '#374151' } }, k),
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
    // firstGroupable : le 1er bloc peut-il être groupé (insécable) avec l'en-tête de section
    // sans risque de dépasser une page ? Tableau d'identification = borné -> oui ; tableau de
    // planning = sécable (peut grandir) -> NON (sinon on recréerait un insécable surdimensionné).
    if (isIdent && allKV) return { blocks: [renderKVTable(kvLines, 'Champ', 'Information', true)], firstGroupable: true }
    if (isPlanning && allKV) return { blocks: [renderKVTable(kvLines, 'Date', 'Interventions prévues')], firstGroupable: false }

    const blocks = []
    let listItems = []
    const flushList = () => {
      if (!listItems.length) return
      // Listes APLATIES : chaque ITEM = un bloc atomique insécable (puce « – » + texte,
      // 1-3 lignes < 1 page). La liste pagine ENTRE les items (blocs frères sécables). Ainsi
      // blocs[0] est toujours atomique -> groupable avec l'en-tête sans dépasser une page.
      listItems.forEach(item =>
        blocks.push(React.createElement(View, { key: 'li' + blocks.length, style: CRS.listRow, wrap: false },
          React.createElement(Text, { style: CRS.listBullet }, '–'),
          React.createElement(Text, { style: CRS.listText }, inlineEl(item)),
        ))
      )
      listItems = []
    }
    lines.forEach((line, i) => {
      const bullet = line.match(/^[-–]\s+(.+)/)
      if (bullet) { listItems.push(bullet[1]); return }
      if (!line.trim()) { flushList(); return }
      flushList()
      const subhead = line.match(/^\*\*(.+?)\s*:\*\*\s*$/) || line.match(/^\*\*(.+?):\s*\*\*\s*$/)
      if (subhead) {
        blocks.push(React.createElement(Text, { key: i, style: { fontSize: 9, fontFamily: 'Roboto-Bold', color: '#1f2937', marginTop: 6, marginBottom: 3 } }, subhead[1].trim() + ' :'))
        return
      }
      blocks.push(React.createElement(Text, { key: i, style: CRS.para }, inlineEl(line.trim())))
    })
    flushList()
    // Prose : blocs atomiques (paragraphes, sous-titres, items de liste) -> blocs[0] borné -> groupable.
    return { blocks, firstGroupable: true }
  }

  return React.createElement(Document, null,
    React.createElement(Page, { size: 'A4', style: CRS.page },
      logo && React.createElement(PdfImage, { src: logo, style: CRS.logoImg }),
      React.createElement(View, { style: CRS.titleBlock },
        React.createElement(Text, { style: CRS.mainTitle }, titre),
        React.createElement(Text, { style: CRS.emis }, 'Émis le ' + dateEmis),
      ),
      ...sections.map((s, i) => {
        const { blocks, firstGroupable } = renderContent(s.contenu, s.titre)
        const enTete = [
          React.createElement(View, { key: 'h', style: CRS.secHeader },
            s.numero && React.createElement(Text, { style: CRS.secNum }, s.numero + '.'),
            React.createElement(Text, { style: CRS.secTitle }, (s.titre || '').toUpperCase()),
          ),
          React.createElement(View, { key: 'ln', style: CRS.secLine }),
        ]
        // DÉFAUT 2 : marge INTER-sections via marginTop (sauf la 1re) -> AUCUNE marge après la
        // dernière section -> pas de débordement de fin -> plus de page fantôme.
        const outerStyle = i === 0 ? undefined : { marginTop: 14 }
        // DÉFAUT 1 : en-tête groupé (insécable) AVEC son 1er bloc -> le titre emmène toujours
        // son 1er élément, jamais orphelin. Le 1er bloc est BORNÉ (item de liste, paragraphe,
        // ou tableau d'identification) -> wrap:false sûr. Le RESTE des blocs reste sécable.
        // Section longue -> pagine toujours (seul le 1er bloc voyage avec le titre).
        if (blocks.length && firstGroupable) {
          return React.createElement(View, { key: i, style: outerStyle },
            React.createElement(View, { key: 'g', wrap: false }, ...enTete, blocks[0]),
            ...blocks.slice(1),
          )
        }
        // 1er bloc NON groupable (tableau planning sécable) ou vide : en-tête seul avec
        // minPresenceAhead (anti-orphelin sans créer d'insécable surdimensionné).
        return React.createElement(View, { key: i, style: outerStyle },
          React.createElement(View, { key: 'g', minPresenceAhead: 60 }, ...enTete),
          ...blocks,
        )
      }),
      React.createElement(View, { style: CRS.footer, fixed: true },
        React.createElement(Text, { style: CRS.footerTxt }, 'Document établi le ' + dateEmis + ' – Chantier ' + nomClient),
        React.createElement(Text, { style: CRS.footerTxt }, nomRef + (dossier.agence?.nom ? ' – ' + dossier.agence.nom : '')),
        React.createElement(Text, { style: CRS.footerTxt, render: ({ pageNumber, totalPages }) => pageNumber + ' / ' + totalPages }),
      ),
    )
  )
}

// ── ROUTE API ──
// Types autorisés pour un utilisateur client (lecture de son propre dossier uniquement)
const CLIENT_ALLOWED_TYPES = new Set(['cr', 'devis'])

export async function POST(request) {
  const auth = await requireUser(request)
  if (auth.error) return auth.error
  try {
    const { dossierId, type, crId, devisId } = await request.json()

    if (!dossierId || !type) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
    }

    const { data: dossier, error: dossierError } = await supabaseAdmin
      .from('dossiers')
      .select('*, referente:profiles!dossiers_referente_id_fkey(id, prenom, nom, email, telephone), client:clients(*), agence:agences!dossiers_agence_id_fkey(nom, ville, adresse, code_postal, telephone, societe:societes(nom_societe, siret, rcs))')
      .eq('id', dossierId)
      .single()

    if (dossierError) return NextResponse.json({ error: dossierError.message }, { status: 500 })
    if (!dossier) return NextResponse.json({ error: 'Dossier non trouvé' }, { status: 404 })

    // Contrôle d'accès : un client ne peut récupérer que les CR de son propre dossier.
    if (auth.profile.role === 'client') {
      if (!CLIENT_ALLOWED_TYPES.has(type)) {
        return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
      }
      if (!auth.profile.client_id || dossier.client_id !== auth.profile.client_id) {
        return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
      }
    } else if (auth.profile.role === 'admin' || auth.profile.role === 'agente') {
      // Contrôle d'appartenance (service_role contourne la RLS) : admin = même
      // société, agente = même agence. 404 uniforme (introuvable ou autre tenant).
      const autorise = auth.profile.role === 'admin'
        ? dossier.societe_id === auth.profile.societe_id
        : dossier.agence_id === auth.profile.agence_id
      if (!autorise) {
        return NextResponse.json({ error: 'Dossier non trouvé' }, { status: 404 })
      }
    } else {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { data: devis, error: devisError } = await supabaseAdmin
      .from('devis_artisans')
      .select('*, artisan:artisans(id, entreprise)')
      .eq('dossier_id', dossierId)
      .order('ordre', { nullsFirst: false })
      .order('created_at')

    if (devisError) return NextResponse.json({ error: devisError.message }, { status: 500 })

    let pdfBuffer
    let cr = null

    if (type === 'recapitulatif_prev') {
      const doc = buildRecapitulatifDocument({ dossier, devis: devis || [], suiviFinancier: [], factures: [], preview: true })
      pdfBuffer = await renderToBuffer(doc)

    } else if (type === 'recapitulatif') {
      const { data: suiviFinancier, error: suiviError } = await supabaseAdmin
        .from('suivi_financier').select('*').eq('dossier_id', dossierId)
      if (suiviError) return NextResponse.json({ error: suiviError.message }, { status: 500 })
      const { data: factures, error: facturesError } = await supabaseAdmin
        .from('factures_artisans').select('*').eq('dossier_id', dossierId).order('date_paiement')
      if (facturesError) return NextResponse.json({ error: facturesError.message }, { status: 500 })
      const doc = buildRecapitulatifDocument({ dossier, devis: devis || [], suiviFinancier: suiviFinancier || [], factures: factures || [] })
      pdfBuffer = await renderToBuffer(doc)

    } else if (type === 'dossier_suivi') {
      const { data: devisComplets } = await supabaseAdmin
        .from('devis_artisans')
        .select('*, artisan:artisans(id, entreprise, metier, kbis_url, decennale_url, decennale_expiration)')
        .eq('dossier_id', dossierId).order('ordre', { nullsFirst: false }).order('created_at')

      const { data: photos } = await supabaseAdmin
        .from('photos').select('*')
        .eq('dossier_id', dossierId).eq('categorie', 'maquette').order('created_at')

      const { data: interventions } = await supabaseAdmin
        .from('interventions_artisans')
        .select('*, artisan:artisans(id, entreprise)')
        .eq('dossier_id', dossierId).order('date_debut')

      const { data: fichesTech } = await supabaseAdmin
        .from('chantier_fiches_techniques')
        .select('fiche:fiches_techniques(id, nom, description, url)')
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

      // RIB + KBIS de l'admin franchisé de la société du dossier (pour la restitution).
      const { data: adminFranchise } = await supabaseAdmin
        .from('profiles')
        .select('id, prenom, nom, rib_url, kbis_url')
        .eq('societe_id', dossier.societe_id)
        .eq('role', 'admin')
        .maybeSingle()

      pdfBuffer = await buildDossierSuivi({
        dossier,
        devis: devisComplets || [],
        photos: photosWithBase64,
        interventions: interventions || [],
        fichesTech: fichesTech || [],
        docsRestitution: docsRestitution || [],
        factures: factures || [],
        suiviFinancier: suiviFinancier || [],
        adminFranchise: adminFranchise || null,
        logo: getLogoBase64(),
        supabaseAdmin,
      })

    } else if (type === 'cr') {
      if (!crId) return NextResponse.json({ error: 'crId manquant' }, { status: 400 })
      const { data: crData } = await supabaseAdmin.from('comptes_rendus').select('*').eq('id', crId).single()
      // Le CR doit être rattaché au dossier validé (crId vient du body) — sinon 404.
      if (!crData || crData.dossier_id !== dossierId) return NextResponse.json({ error: 'CR non trouvé' }, { status: 404 })
      cr = crData

      // Retrait des emojis (tofu en Roboto) AVANT le split : ne touche ni `## n.`,
      // ni les puces `–`, ni le gras `**` → la structure est préservée. Donnée en
      // base inchangée (nettoyage à l'affichage uniquement).
      const sections = stripEmojiPdf(cr.contenu_final || '').split(/(?=## \d+\.)/).map(block => {
        const match = block.match(/^## (\d+)\. (.+?)\n([\s\S]*)/)
        if (match) return { numero: match[1], titre: match[2].trim(), contenu: match[3].trim() }
        const trimmed = block.trim()
        if (!trimmed) return null
        return { numero: '', titre: '', contenu: trimmed }
      }).filter(Boolean).filter(s => s.contenu)

      const doc = buildCRDocument({ dossier, cr, sections, logo: getLogoBase64() })
      pdfBuffer = await renderToBuffer(doc)

    } else if (type === 'devis') {
      // Devis SIGNÉ : fichier STOCKÉ (bucket documents), pas généré. Servi via
      // service_role, jamais via le bucket (qui reste fermé au client).
      if (!devisId) return NextResponse.json({ error: 'devisId manquant' }, { status: 400 })

      // Ownership STRICT : le devis doit appartenir au dossier déjà vérifié (:419).
      // `devis` est scopé à dossierId (:435) → retrouver devisId dedans garantit
      // qu'il est dans le dossier possédé. Forge d'un devisId d'un autre dossier → 404.
      const devisCible = (devis || []).find(d => d.id === devisId)
      if (!devisCible || devisCible.dossier_id !== dossierId) {
        return NextResponse.json({ error: 'Devis non trouvé' }, { status: 404 })
      }
      // Cohérence C7-1 : le client ne télécharge que ce qu'il voit (devis accepté).
      if (devisCible.statut !== 'accepte') {
        return NextResponse.json({ error: 'Devis non trouvé' }, { status: 404 })
      }
      // Tous les acceptés n'ont pas de PDF signé → 404 propre (pas de crash).
      if (!devisCible.devis_signe_path) {
        return NextResponse.json({ error: 'PDF du devis non disponible' }, { status: 404 })
      }
      const { data: fileData, error: dlErr } = await supabaseAdmin.storage
        .from('documents').download(devisCible.devis_signe_path)
      if (dlErr || !fileData) {
        return NextResponse.json({ error: 'PDF du devis non disponible' }, { status: 404 })
      }
      const fileBuf = Buffer.from(await fileData.arrayBuffer())

      // Content-Type dérivé de l'extension (le devis signé peut être pdf OU image).
      const ext = (devisCible.devis_signe_path.split('.').pop() || '').toLowerCase()
      const contentType = ext === 'pdf' ? 'application/pdf'
        : (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg'
        : ext === 'png' ? 'image/png'
        : 'application/octet-stream'
      const devisNom = `Devis_${dossier.reference}_${devisCible.artisan?.entreprise || 'artisan'}.${ext || 'pdf'}`
      const devisAscii = devisNom.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')
      // inline : le client ouvre le document dans un onglet (carte « voir le devis »).
      return new Response(fileBuf, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `inline; filename="${devisAscii}"; filename*=UTF-8''${encodeURIComponent(devisNom)}`,
        },
      })

    } else {
      return NextResponse.json({ error: 'Type de PDF inconnu' }, { status: 400 })
    }

    // CR : nom de fichier « DATE_CR_NOM » (date de visite, sinon date d'émission).
    // Nom de famille uniquement (sans prénom) ; couple à deux noms → « Nom1 & Nom2 ».
    const crDate = cr?.date_visite || cr?.created_at
    const crDateStr = crDate ? new Date(crDate).toISOString().slice(0, 10) : ''
    const nomClient = dossier.client
      ? [dossier.client.nom, dossier.client.nom2].filter(Boolean).join(' & ') || 'Client'
      : 'Client'
    const filename =
      type === 'recapitulatif_prev' ? `Recap_Financier_${dossier.reference}.pdf`
      : type === 'recapitulatif' ? `Suivi_Financier_${dossier.reference}.pdf`
      : type === 'dossier_suivi' ? `DossierSuivi_${dossier.reference}.pdf`
      : type === 'cr' ? `${crDateStr ? crDateStr + '_' : ''}CR_${nomClient}.pdf`
      : `Dossier_${dossier.reference}.pdf`

    // En-tête robuste aux accents/espaces : fallback ASCII + version UTF-8 (RFC 5987).
    const asciiName = filename.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')
    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    })
  } catch (err) {
    console.error('PDF generation error:', err)
    return NextResponse.json({ error: err.message || 'Erreur PDF' }, { status: 500 })
  }
}