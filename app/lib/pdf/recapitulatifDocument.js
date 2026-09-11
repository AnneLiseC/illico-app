// app/lib/pdf/recapitulatifDocument.js
// Le RÉCAPITULATIF FINANCIER client, extrait de app/api/pdf/route.js le 11/09.
//
// POURQUOI L'EXTRACTION — le mail de demande d'acompte doit joindre ce même
// récapitulatif, à jour au moment de l'envoi. Le cron ne peut pas appeler /api/pdf, qui
// exige un utilisateur authentifié : il lui faut le GÉNÉRATEUR, pas la route. Même
// patron que crDocument.js, extrait pour /api/drive/push-cr.
//
// Le document est donc désormais rendu à DEUX endroits (la route, le cron) à partir d'une
// seule définition : un client qui reçoit son récapitulatif par mail voit exactement ce
// qu'il téléchargerait depuis l'application. Deux copies auraient divergé au premier
// changement de mise en page.
//
// Les helpers (`fmt`, `toNumber`), les couleurs et les styles suivent le composant et
// restent exportés : le reste de la route les utilise pour ses autres PDF.

import React from 'react'
import path from 'path'
import fs from 'fs'
import { Document, Page, Text, View, Image as PdfImage, StyleSheet } from '@react-pdf/renderer'
import { buildSuiviPaiementsSection } from '../../api/pdf/restitution.js'
import { formatNomClient } from '../clients.js'
import RecapHonoraires from './RecapHonoraires.js'
import './fonts.js'

// ── Couleurs ──
export const BLEU = '#00578e'
export const BLEU_CLAIR = '#2f8dcb'
export const GRIS = '#f3f4f6'
export const GRIS_TEXTE = '#6b7280'

// ── Helpers ──
export const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const normalized = String(value).replace(/\s/g, '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

export const fmt = (n) => {
  const v = toNumber(n).toFixed(2)
  const [int, dec] = v.split('.')
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + dec + ' €'
}

export function getLogoBase64() {
  const filePath = path.join(process.cwd(), 'public', 'logo.png')
  if (!fs.existsSync(filePath)) return null
  const data = fs.readFileSync(filePath)
  return `data:image/png;base64,${data.toString('base64')}`
}

export const logoBase64 = getLogoBase64()

// ── Styles ──
export const styles = StyleSheet.create({
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
export function RecapitulatifPDF({ dossier, devis, suiviFinancier, factures, preview = false, anomalies = null }) {
  const client = dossier.client
  const nomClient = formatNomClient(client, { civilite: true, withRepresentant: true })
  const referente = dossier.referente
    ? `${dossier.referente.prenom || ''} ${dossier.referente.nom || ''}`.trim()
    : '—'
  const typologieLabel = {
    courtage: 'Courtage', amo: 'AMO', estimo: 'Estimo', merad: 'MERAD',
    audit_energetique: 'Audit énergétique', studio_jardin: 'Studio de jardin',
  }[dossier.typologie] || dossier.typologie || '—'

  const devisAcceptes = (devis || []).filter((d) => preview ? (d.statut === 'recu' || d.statut === 'accepte') : d.statut === 'accepte')
  const totalDevisTTCSignes = devisAcceptes.reduce((s, d) => s + toNumber(d.montant_ttc), 0)
  const totalDevisHTSignes = devisAcceptes.reduce((s, d) => s + toNumber(d.montant_ht), 0)
  const fraisTTC = toNumber(dossier.frais_consultation)
  const fraisStatut = dossier.frais_statut
  const fraisInTable = fraisTTC > 0 && fraisStatut !== 'offerts' && fraisStatut !== 'rembourse'
  const fraisOfferts = fraisStatut === 'offerts' && fraisTTC > 0
  // Fuseau explicite : Vercel tourne en UTC, donc entre minuit et 2 h du matin
  // heure de Paris le document se serait daté de la VEILLE. C'est la mention
  // « établi le » remise au client, elle fait foi. (09/09)
  const dateAuj = new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })

  const totalFraisTable = fraisInTable ? fraisTTC : 0
  const totalTTCAvecFrais = totalDevisTTCSignes + totalFraisTable

  // Acomptes par artisan
  const acomptesArtisans = devisAcceptes.map(d => {
    const ttc = toNumber(d.montant_ttc)
    const pct = toNumber(d.acompte_pourcentage ?? 30)
    const montantFixe = toNumber(d.acompte_montant_fixe)
    const acompte = pct === -1 ? montantFixe : ttc * (pct / 100)
    const pctLabel = pct === -1 ? '' : ` (${pct}%)`
    const suiviArt = (suiviFinancier || []).find(s => s.type_echeance === 'acompte_artisan' && s.devis_id === d.id)
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
                  <Text style={[styles.cellRight, { flex: 2 }]}>{fmt(fraisTTC / TVA_FRAIS)}</Text>
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
                  {fmt(totalDevisHTSignes + (fraisInTable ? fraisTTC / TVA_FRAIS : 0))}
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
        {preview ? null : (buildSuiviPaiementsSection({ devisList: devisAcceptes, factures, suiviFinancier, dossier, anomalies }) || null)}

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
            

export function buildRecapitulatifDocument({ dossier, devis, suiviFinancier, factures, preview = false, anomalies = null })
{
  return React.createElement(RecapitulatifPDF, { dossier, devis, suiviFinancier, factures, preview, anomalies })
}


