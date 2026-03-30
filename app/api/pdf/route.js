// app/api/pdf/route.js
// Génération PDF : récapitulatif financier client + dossier fin de chantier

import React from 'react'
import { buildDossierRestitution } from './restitution.js'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import  {renderToBuffer, Document,  Page,  Text,  View,  Image as PdfImage,  StyleSheet,} from '@react-pdf/renderer'
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
const VERT = '#166534'
const ORANGE = '#f37f2b'

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

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: BLEU },
  logo: { width: 140, height: 50 },
  headerRight: { alignItems: 'flex-end' },
  headerTitle: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: BLEU, marginBottom: 2 },
  headerSub: { fontSize: 9, color: GRIS_TEXTE },

  // Section
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: BLEU, marginBottom: 8, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: BLEU_CLAIR },

  // Infos
  infoGrid: { flexDirection: 'row', gap: 20, marginBottom: 4 },
  infoBlock: { flex: 1 },
  infoLabel: { fontSize: 8, color: GRIS_TEXTE, marginBottom: 2 },
  infoValue: { fontSize: 10, fontFamily: 'Helvetica-Bold' },

  // Tableau
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

  // Total
  montantBlock: { flexDirection: 'row', justifyContent: 'space-between', padding: 10, backgroundColor: BLEU, borderRadius: 6, marginTop: 8 },
  montantLabel: { color: 'white', fontSize: 14, fontFamily: 'Helvetica-Bold' },
  montantValue: { color: 'white', fontSize: 14, fontFamily: 'Helvetica-Bold' },

  // Footer
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 8 },
  footerText: { fontSize: 8, color: GRIS_TEXTE },

  // Divers
  divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 8 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  infoRowLabel: { fontSize: 9, color: GRIS_TEXTE, flex: 1, paddingRight: 12 },
  infoRowValue: { fontSize: 9, fontFamily: 'Helvetica-Bold' },

  // Cover
  coverBlock: { backgroundColor: BLEU, borderRadius: 8, padding: 20, marginBottom: 24 },
  coverTitle: { color: 'white', fontSize: 20, fontFamily: 'Helvetica-Bold', marginBottom: 8 },
  coverRef: { color: '#93C5FD', fontSize: 12, marginBottom: 4 },
  coverSub: { color: '#93C5FD', fontSize: 10 },

  // Signature
  signatureBox: { height: 60, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 4, marginTop: 4 },
  signatureLabel: { fontSize: 8, color: GRIS_TEXTE, marginTop: 4 },
})

// ── RÉCAPITULATIF FINANCIER CLIENT ──
function RecapitulatifPDF({ dossier, devis, suiviFinancier }) {
  const client = dossier.client

  const nomClient = client
    ? `${client.civilite || ''} ${client.prenom || ''} ${client.nom || ''}`.trim()
    : '—'

  const referente = dossier.referente
    ? `${dossier.referente.prenom || ''} ${dossier.referente.nom || ''}`.trim()
    : '—'

  const typologieLabel = {
    courtage: 'Courtage',
    amo: 'AMO',
    estimo: 'Estimo',
    audit_energetique: 'Audit énergétique',
    studio_jardin: 'Studio de jardin',
  }[dossier.typologie] || dossier.typologie || '—'

  const devisAcceptes = (devis || []).filter((d) => d.statut === 'accepte')
  const totalDevisTTCSignes = devisAcceptes.reduce((s, d) => s + toNumber(d.montant_ttc), 0)
  const totalDevisHTSignes = devisAcceptes.reduce((s, d) => s + toNumber(d.montant_ht), 0)

  const tauxCourtage = toNumber(dossier.taux_courtage ?? 0.06)
  const tauxAmo = toNumber(dossier.honoraires_amo_taux ?? 9) / 100
  const honorairesCourtage = totalDevisTTCSignes * tauxCourtage
  const honorairesAMO = totalDevisTTCSignes * (tauxCourtage + tauxAmo)
  const fraisTTC = toNumber(dossier.frais_consultation)

  const isAMO = dossier.typologie === 'amo'
  const isCourtage = ['courtage', 'amo'].includes(dossier.typologie)

  const getSuivi = (type) =>
    (suiviFinancier || []).find((s) => s.type_echeance === type)

  const dateAuj = new Date().toLocaleDateString('fr-FR')

  const acomptesArtisans = devisAcceptes.map((d) => {
    const montantTTC = toNumber(d.montant_ttc)
    const acompte = d.acompte_pourcentage === -1
      ? toNumber(d.acompte_montant_fixe)
      : montantTTC * (toNumber(d.acompte_pourcentage || 30) / 100)

    const suiviAcompte = (suiviFinancier || []).find(
      (s) =>
        s.type_echeance === 'acompte_artisan' &&
        s.artisan_id === d.artisan_id
    )

    return {
      id: d.id,
      artisan: d.artisan?.entreprise || '—',
      montant: acompte,
      statut: suiviAcompte?.statut_client || 'en_attente',
    }
  })

  const totalAcomptes = acomptesArtisans.reduce((sum, a) => sum + toNumber(a.montant), 0)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {logoBase64 ? (
            <PdfImage src={logoBase64} style={styles.logo} />
          ) : (
            <View style={styles.logo} />
          )}
          <View style={styles.headerRight}>
            <Text style={styles.headerTitle}>Récapitulatif financier</Text>
            <Text style={styles.headerSub}>illiCO travaux Martigues</Text>
            <Text style={[styles.headerSub, { marginTop: 2 }]}>Établi le {dateAuj}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations du dossier</Text>
          <View style={styles.infoGrid}>
            <View style={styles.infoBlock}>
              <Text style={styles.infoLabel}>Client</Text>
              <Text style={styles.infoValue}>{nomClient}</Text>
            </View>
            <View style={styles.infoBlock}>
              <Text style={styles.infoLabel}>Référence chantier</Text>
              <Text style={styles.infoValue}>{dossier.reference || '—'}</Text>
            </View>
            <View style={styles.infoBlock}>
              <Text style={styles.infoLabel}>Prestation</Text>
              <Text style={styles.infoValue}>{typologieLabel}</Text>
            </View>
            <View style={styles.infoBlock}>
              <Text style={styles.infoLabel}>Référente</Text>
              <Text style={styles.infoValue}>{referente}</Text>
            </View>
          </View>

          {client?.adresse ? (
            <View style={{ marginTop: 4 }}>
              <Text style={styles.infoLabel}>Adresse</Text>
              <Text style={styles.cell}>{client.adresse}</Text>
            </View>
          ) : null}
        </View>

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottomWidth: 1,
            borderBottomColor: BLEU_CLAIR,
            paddingBottom: 4,
            marginBottom: 8,
          }}
        >
          <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: BLEU }}>
            Frais de consultation
          </Text>

          <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#000' }}>
            {dossier.frais_statut === 'offerts' ? 'Offerts' : fmt(fraisTTC)}
          </Text>
        </View>

        {devisAcceptes.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Devis artisans signés</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Entreprises</Text>
                <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>Montant HT</Text>
                <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>Montant TTC</Text>
              </View>

              {devisAcceptes.map((d, idx) => (
                <View key={d.id} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                  <Text style={[styles.cell, { flex: 3 }]}>{d.artisan?.entreprise || '—'}</Text>
                  <Text style={[styles.cellRight, { flex: 2 }]}>{fmt(d.montant_ht)}</Text>
                  <Text style={[styles.cellRightBold, { flex: 2 }]}>{fmt(d.montant_ttc)}</Text>
                </View>
              ))}

              <View style={styles.tableRowTotal}>
                <Text style={[styles.cellBold, { flex: 3 }]}>TOTAL</Text>
                <Text style={[styles.cellRightBold, { flex: 2 }]}>{fmt(totalDevisHTSignes)}</Text>
                <Text style={[styles.cellRightBold, { flex: 2 }]}>{fmt(totalDevisTTCSignes)}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {acomptesArtisans.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Acomptes artisans</Text>

            {acomptesArtisans.map((a) => (
              <View key={a.id} style={styles.infoRow}>
                <Text style={styles.infoRowLabel}>{a.artisan}</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.infoRowValue}>{fmt(a.montant)}</Text>
                </View>
              </View>
            ))}

            <View
              style={[
                styles.infoRow,
                {
                  backgroundColor: BLEU_CLAIR,
                  borderRadius: 4,
                  paddingHorizontal: 8,
                  marginTop: 4,
                },
              ]}
            >
              <Text style={styles.cellBold}>Total acomptes artisans</Text>
              <Text style={styles.cellRightBold}>{fmt(totalAcomptes)}</Text>
            </View>
          </View>
        ) : null}

        {isCourtage && totalDevisTTCSignes > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Honoraires illiCO travaux</Text>

            <View style={styles.infoRow}>
              <Text style={styles.infoRowLabel}>
                Honoraires courtage ({(tauxCourtage * 100).toFixed(1)}%) — à la signature des devis
              </Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.infoRowValue}>{fmt(honorairesCourtage)}</Text>
              </View>
            </View>

            {isAMO ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoRowLabel}>
                  Honoraires AMO solde ({(tauxAmo * 100).toFixed(1)}%) — à la fin du chantier
                </Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.infoRowValue}>{fmt(honorairesAMO - honorairesCourtage)}</Text>
                </View>
              </View>
            ) : null}

            {isAMO ? (
              <View
                style={[
                  styles.infoRow,
                  {
                    backgroundColor: BLEU_CLAIR,
                    borderRadius: 4,
                    paddingHorizontal: 8,
                  },
                ]}
              >
                <Text style={styles.cellBold}>Total honoraires AMO ({((tauxCourtage + tauxAmo)* 100).toFixed(1)}%)</Text>
                <Text style={styles.cellRightBold}>{fmt(honorairesAMO)}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.montantBlock}>
          <Text style={styles.montantLabel}>TOTAL PROJET</Text>
          <Text style={styles.montantValue}>
            {fmt(
              totalDevisTTCSignes +
                (isAMO ? honorairesAMO : isCourtage ? honorairesCourtage : 0) +
                (dossier.frais_statut === 'offerts' ? 0 : fraisTTC)
            )}
          </Text>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>illiCO travaux Martigues — {dossier.reference}</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  )
}

// ── DOSSIER FIN DE CHANTIER ──
function DossierFinChantierPDF({ dossier, devis, referente }) {
  const client = dossier.client
  const nomClient = client
    ? `${client.civilite || ''} ${client.prenom || ''} ${client.nom || ''}`.trim()
    : '—'

  const dateAuj = new Date().toLocaleDateString('fr-FR')

  const typologieLabel = {
    courtage: 'Courtage',
    amo: 'AMO',
    estimo: 'Estimo',
    audit_energetique: 'Audit énergétique',
    studio_jardin: 'Studio de jardin',
  }[dossier.typologie] || dossier.typologie || '—'

  const devisAcceptes = (devis || []).filter((d) => d.statut === 'accepte')
  const totalHT = devisAcceptes.reduce((s, d) => s + toNumber(d.montant_ht), 0)
  const totalTTC = devisAcceptes.reduce((s, d) => s + toNumber(d.montant_ttc), 0)

  const tauxCourtage = toNumber(dossier.taux_courtage ?? 0.06)
  const tauxAmo = toNumber(dossier.honoraires_amo_taux ?? 9) / 100
  const fraisTTC = dossier.frais_statut === 'offerts' ? 0 : toNumber(dossier.frais_consultation)

  const honoraires = dossier.typologie === 'amo'
    ? totalTTC * (tauxCourtage + tauxAmo)
    : ['courtage', 'amo'].includes(dossier.typologie)
      ? totalTTC * tauxCourtage
      : 0

  const totalProjet = totalTTC + honoraires + fraisTTC

  const descriptifProjet =
    dossier.descriptif_projet ||
    dossier.description ||
    dossier.objet_travaux ||
    'Descriptif du projet à compléter.'

  const planningItems = Array.isArray(dossier.planning_indicatif)
    ? dossier.planning_indicatif
    : []

  const referencesProduits = Array.isArray(dossier.references_produits)
    ? dossier.references_produits
    : []

  return (
    <Document>
      {/* PAGE DE GARDE */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {logoBase64 ? <PdfImage src={logoBase64} style={styles.logo} /> : <View style={styles.logo} />}
          <View style={styles.headerRight}>
            <Text style={styles.headerTitle}>Dossier de présentation</Text>
            <Text style={styles.headerSub}>illiCO travaux Martigues</Text>
          </View>
        </View>

        <View style={styles.coverBlock}>
          <Text style={styles.coverTitle}>{nomClient}</Text>
          <Text style={styles.coverRef}>{dossier.reference || '—'}</Text>
          <Text style={styles.coverSub}>{typologieLabel}</Text>
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Référente</Text>
            <Text style={styles.infoValue}>{referente?.prenom || ''} {referente?.nom || ''}</Text>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Client</Text>
            <Text style={styles.infoValue}>{nomClient}</Text>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Référence chantier</Text>
            <Text style={styles.infoValue}>{dossier.reference || '—'}</Text>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Établi le</Text>
            <Text style={styles.infoValue}>{dateAuj}</Text>
          </View>
        </View>

        {client?.adresse ? (
          <View style={{ marginTop: 6 }}>
            <Text style={styles.infoLabel}>Adresse</Text>
            <Text style={styles.cell}>{client.adresse}</Text>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>illiCO travaux Martigues — {dossier.reference}</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* DESCRIPTIF DU PROJET */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {logoBase64 ? <PdfImage src={logoBase64} style={styles.logo} /> : <View style={styles.logo} />}
          <View style={styles.headerRight}>
            <Text style={styles.headerTitle}>Descriptif du projet</Text>
            <Text style={styles.headerSub}>{dossier.reference} — {nomClient}</Text>
          </View>
        </View>

        <Text style={[styles.cell, { lineHeight: 1.7 }]}>
          {descriptifProjet}
        </Text>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>illiCO travaux Martigues — {dossier.reference}</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* ILLUSTRATIONS & VUES 3D */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {logoBase64 ? <PdfImage src={logoBase64} style={styles.logo} /> : <View style={styles.logo} />}
          <View style={styles.headerRight}>
            <Text style={styles.headerTitle}>Illustrations & vues 3D</Text>
            <Text style={styles.headerSub}>{dossier.reference} — {nomClient}</Text>
          </View>
        </View>

        <Text style={[styles.cell, { marginBottom: 14, lineHeight: 1.6, color: GRIS_TEXTE }]}>
          Les illustrations graphiques, coupes 3D ou plans reproduits dans ce dossier sont des illustrations commerciales. Elles ne constituent pas des plans d’exécution et ne peuvent pas servir de base à la réalisation de l’ouvrage.
        </Text>

        <View
          style={{
            borderWidth: 1,
            borderColor: '#D1D5DB',
            borderRadius: 6,
            minHeight: 420,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}
        >
          <Text style={{ color: GRIS_TEXTE, fontSize: 10, textAlign: 'center' }}>
            Emplacement réservé aux photos, illustrations et futures vues de maquette 3D.
          </Text>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>illiCO travaux Martigues — {dossier.reference}</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* SYNTHÈSE BUDGÉTAIRE */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {logoBase64 ? <PdfImage src={logoBase64} style={styles.logo} /> : <View style={styles.logo} />}
          <View style={styles.headerRight}>
            <Text style={styles.headerTitle}>Synthèse budgétaire</Text>
            <Text style={styles.headerSub}>{dossier.reference} — {nomClient}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 4 }]}>Poste</Text>
            <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>Montant</Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={[styles.cell, { flex: 4 }]}>Total devis HT</Text>
            <Text style={[styles.cellRight, { flex: 2 }]}>{fmt(totalHT)}</Text>
          </View>

          <View style={styles.tableRowAlt}>
            <Text style={[styles.cell, { flex: 4 }]}>Total devis TTC</Text>
            <Text style={[styles.cellRightBold, { flex: 2 }]}>{fmt(totalTTC)}</Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={[styles.cell, { flex: 4 }]}>Frais de consultation</Text>
            <Text style={[styles.cellRight, { flex: 2 }]}>
              {dossier.frais_statut === 'offerts' ? 'Offerts' : fmt(fraisTTC)}
            </Text>
          </View>

          <View style={styles.tableRowAlt}>
            <Text style={[styles.cell, { flex: 4 }]}>Honoraires illiCO travaux</Text>
            <Text style={[styles.cellRightBold, { flex: 2 }]}>{fmt(honoraires)}</Text>
          </View>

          <View style={styles.tableRowTotal}>
            <Text style={[styles.cellBold, { flex: 4 }]}>TOTAL PROJET</Text>
            <Text style={[styles.cellRightBold, { flex: 2 }]}>{fmt(totalProjet)}</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>illiCO travaux Martigues — {dossier.reference}</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* PLANNING PROVISOIRE INDICATIF */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {logoBase64 ? <PdfImage src={logoBase64} style={styles.logo} /> : <View style={styles.logo} />}
          <View style={styles.headerRight}>
            <Text style={styles.headerTitle}>Planning provisoire indicatif</Text>
            <Text style={styles.headerSub}>{dossier.reference} — {nomClient}</Text>
          </View>
        </View>

        <Text style={[styles.cell, { marginBottom: 14, lineHeight: 1.6, color: GRIS_TEXTE }]}>
          Ce planning est communiqué à titre purement indicatif. Il ne possède aucune valeur contractuelle et peut évoluer selon les disponibilités des entreprises, des matériaux ou l’évolution du projet.
        </Text>

        {planningItems.length > 0 ? (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Intervenant</Text>
              <Text style={[styles.tableHeaderCell, { flex: 4 }]}>Intervention</Text>
              <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'center' }]}>Période</Text>
            </View>

            {planningItems.map((item, idx) => (
              <View key={`${item.intervenant || 'planning'}-${idx}`} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                <Text style={[styles.cell, { flex: 3 }]}>{item.intervenant || '—'}</Text>
                <Text style={[styles.cell, { flex: 4 }]}>{item.intervention || '—'}</Text>
                <Text style={[styles.cell, { flex: 2, textAlign: 'center' }]}>{item.periode || '—'}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={{ borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 6, padding: 16 }}>
            <Text style={{ color: GRIS_TEXTE, fontSize: 10 }}>
              Planning partagé à intégrer.
            </Text>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>illiCO travaux Martigues — {dossier.reference}</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* DEVIS */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {logoBase64 ? <PdfImage src={logoBase64} style={styles.logo} /> : <View style={styles.logo} />}
          <View style={styles.headerRight}>
            <Text style={styles.headerTitle}>Devis</Text>
            <Text style={styles.headerSub}>{dossier.reference} — {nomClient}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Entreprise</Text>
            <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Objet</Text>
            <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>Montant TTC</Text>
            <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'center' }]}>Date signature</Text>
          </View>

          {devisAcceptes.map((d, idx) => (
            <View key={d.id} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
              <Text style={[styles.cell, { flex: 3 }]}>{d.artisan?.entreprise || '—'}</Text>
              <Text style={[styles.cell, { flex: 3 }]}>{d.notes || d.description || 'Devis signé'}</Text>
              <Text style={[styles.cellRightBold, { flex: 2 }]}>{fmt(d.montant_ttc)}</Text>
              <Text style={[styles.cell, { flex: 2, textAlign: 'center' }]}>
                {d.date_signature ? new Date(d.date_signature).toLocaleDateString('fr-FR') : '—'}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>illiCO travaux Martigues — {dossier.reference}</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* RÉFÉRENCES PRODUITS */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {logoBase64 ? <PdfImage src={logoBase64} style={styles.logo} /> : <View style={styles.logo} />}
          <View style={styles.headerRight}>
            <Text style={styles.headerTitle}>Références produits</Text>
            <Text style={styles.headerSub}>{dossier.reference} — {nomClient}</Text>
          </View>
        </View>

        {referencesProduits.length > 0 ? (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Produit</Text>
              <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Référence</Text>
              <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Marque</Text>
            </View>

            {referencesProduits.map((p, idx) => (
              <View key={`${p.reference || 'produit'}-${idx}`} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                <Text style={[styles.cell, { flex: 3 }]}>{p.nom || '—'}</Text>
                <Text style={[styles.cell, { flex: 3 }]}>{p.reference || '—'}</Text>
                <Text style={[styles.cell, { flex: 2 }]}>{p.marque || '—'}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={{ borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 6, padding: 16 }}>
            <Text style={{ color: GRIS_TEXTE, fontSize: 10 }}>
              Fiches techniques / références produits à intégrer.
            </Text>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>illiCO travaux Martigues — {dossier.reference}</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* QUALIFICATIONS ET ASSURANCES */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {logoBase64 ? <PdfImage src={logoBase64} style={styles.logo} /> : <View style={styles.logo} />}
          <View style={styles.headerRight}>
            <Text style={styles.headerTitle}>Qualifications et assurances</Text>
            <Text style={styles.headerSub}>{dossier.reference} — {nomClient}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Entreprise</Text>
            <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'center' }]}>KBIS</Text>
            <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'center' }]}>Décennale</Text>
            <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Observations</Text>
          </View>

          {devisAcceptes.map((d, idx) => (
            <View key={d.id} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
              <Text style={[styles.cell, { flex: 3 }]}>{d.artisan?.entreprise || '—'}</Text>
              <Text style={[styles.cell, { flex: 2, textAlign: 'center' }]}>
                {d.artisan?.kbis_fourni ? 'Oui' : 'À joindre'}
              </Text>
              <Text style={[styles.cell, { flex: 2, textAlign: 'center' }]}>
                {d.artisan?.decennale_fournie ? 'Oui' : 'À joindre'}
              </Text>
              <Text style={[styles.cell, { flex: 3 }]}>Pièces administratives artisan</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>illiCO travaux Martigues — {dossier.reference}</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

function buildRecapitulatifDocument({ dossier, devis, suiviFinancier }) {
  return React.createElement(RecapitulatifPDF, {
    dossier,
    devis,
    suiviFinancier,
  })
}

function buildDossierFinDocument({ dossier, devis, referente }) {
  return React.createElement(DossierFinChantierPDF, {
    dossier,
    devis,
    referente,
  })
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
    r1:       'COMPTE RENDU DE PREMIÈRE VISITE',
    r2:       'COMPTE RENDU DE VISITE TECHNIQUE',
    r3:       'COMPTE RENDU DE PRÉSENTATION DES DEVIS',
    suivi:    'COMPTE RENDU DE SUIVI DE CHANTIER',
    reception:'COMPTE RENDU DE RÉCEPTION DE CHANTIER',
  }
  const titre = TITRES[cr.type_visite] || 'COMPTE RENDU DE VISITE'
  const dateVisite = cr.date_visite
    ? new Date(cr.date_visite).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date(cr.created_at).toLocaleDateString('fr-FR')
  const dateEmis = new Date(cr.created_at || Date.now()).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  const CRS = StyleSheet.create({
    page:       { padding: 40, paddingBottom: 60, fontFamily: 'Helvetica', fontSize: 9, backgroundColor: '#ffffff' },
    logoImg:    { width: 120, height: 48, marginBottom: 12 },
    titleBlock: { marginBottom: 18, borderBottomWidth: 2, borderBottomColor: BLEU, paddingBottom: 10 },
    mainTitle:  { fontSize: 16, fontFamily: 'Helvetica-Bold', color: BLEU, marginBottom: 3 },
    emis:       { fontSize: 9, color: '#6b7280' },
    secWrap:    { marginBottom: 14 },
    secHeader:  { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    secNum:     { fontSize: 11, fontFamily: 'Helvetica-Bold', color: BLEU, marginRight: 6 },
    secTitle:   { fontSize: 11, fontFamily: 'Helvetica-Bold', color: BLEU, flex: 1 },
    secLine:    { height: 1.5, backgroundColor: BLEU, marginBottom: 8 },
    para:       { fontSize: 9, color: '#1f2937', lineHeight: 1.65, marginBottom: 5 },
    listRow:    { flexDirection: 'row', marginBottom: 4, paddingLeft: 4 },
    listBullet: { fontSize: 9, color: '#1f2937', width: 14 },
    listText:   { fontSize: 9, color: '#1f2937', flex: 1, lineHeight: 1.55 },
    bold:       { fontFamily: 'Helvetica-Bold' },
    footer:     { position: 'absolute', bottom: 22, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 5 },
    footerTxt:  { fontSize: 7.5, color: '#6b7280' },
  })

  // ── Rendu inline : **gras** ──
  const inlineEl = (text) => {
    const parts = text.split(/\*\*(.+?)\*\*/g)
    if (parts.length === 1) return text
    return parts.map((p, i) =>
      i % 2 === 1 ? React.createElement(Text, { key: i, style: CRS.bold }, p) : p
    )
  }

  // ── Table 2 colonnes : KV pour Identification ──
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

  // ── Rendu principal d'une section ──
  const renderContent = (contenu, secTitre) => {
    if (!contenu) return []
    const lines = contenu.split('\n').filter(l => l !== undefined)
    const isIdent   = /identification/i.test(secTitre || '')
    const isPlanning = /planning/i.test(secTitre || '')

    // Détecter les lignes **Label :** Valeur
    const kvLines = lines.filter(l => l.trim()).map(l => {
      const m = l.match(/^\*\*(.+?)\s*:\*\*\s*(.*)/) || l.match(/^\*\*(.+?):\s*\*\*(.*)/)
      return m ? [m[1].trim(), m[2].trim()] : null
    })
    const allKV = kvLines.length > 0 && kvLines.every(Boolean)

    // Tableau identification
    if (isIdent && allKV) {
      return [renderKVTable(kvLines, 'Champ', 'Information')]
    }
    // Tableau planning
    if (isPlanning && allKV) {
      return [renderKVTable(kvLines, 'Date', 'Interventions prévues')]
    }

    // Rendu standard : sous-titres, listes, paragraphes
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
      // Sous-titre type **Artisan :**
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
      // Logo
      logo && React.createElement(PdfImage, { src: logo, style: CRS.logoImg }),
      // Titre principal
      React.createElement(View, { style: CRS.titleBlock },
        React.createElement(Text, { style: CRS.mainTitle }, titre),
        React.createElement(Text, { style: CRS.emis }, 'Émis le ' + dateEmis),
      ),
      // Sections
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
      // Footer
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

    if (dossierError) {
      return NextResponse.json({ error: dossierError.message }, { status: 500 })
    }

    if (!dossier) {
      return NextResponse.json({ error: 'Dossier non trouvé' }, { status: 404 })
    }

    const { data: devis, error: devisError } = await supabaseAdmin
      .from('devis_artisans')
      .select('*, artisan:artisans(id, entreprise)')
      .eq('dossier_id', dossierId)
      .order('created_at')

    if (devisError) {
      return NextResponse.json({ error: devisError.message }, { status: 500 })
    }

    let pdfBuffer

    if (type === 'recapitulatif') {
      const { data: suiviFinancier, error: suiviError } = await supabaseAdmin
        .from('suivi_financier')
        .select('*')
        .eq('dossier_id', dossierId)

      if (suiviError) {
        return NextResponse.json({ error: suiviError.message }, { status: 500 })
      }

      const doc = buildRecapitulatifDocument({
        dossier,
        devis: devis || [],
        suiviFinancier: suiviFinancier || [],
      }) 

      pdfBuffer = await renderToBuffer(doc)
    } else if (type === 'dossier_restitution') {
      // Charger toutes les données nécessaires pour le dossier de restitution
      const { data: devisComplets } = await supabaseAdmin
        .from('devis_artisans')
        .select('*, artisan:artisans(id, entreprise, metier, kbis_url, decennale_url, decennale_expiration)')
        .eq('dossier_id', dossierId).order('created_at')

      const { data: photos } = await supabaseAdmin
        .from('photos').select('*')
        .eq('dossier_id', dossierId)
        .eq('categorie', 'maquette')
        .order('created_at')

      const { data: interventions } = await supabaseAdmin
        .from('interventions_artisans')
        .select('*, artisan:artisans(id, entreprise)')
        .eq('dossier_id', dossierId).order('date_debut')

      // Fiches techniques cochées pour ce chantier
      const { data: fichesTech } = await supabaseAdmin
        .from('chantier_fiches_techniques')
        .select('fiche:fiches_techniques(id, nom, description)')
        .eq('dossier_id', dossierId)

      // Charger photos maquette en base64
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

      const logoSrc = getLogoBase64()
      pdfBuffer = await buildDossierRestitution({
        dossier,
        devis: devisComplets || [],
        photos: photosWithBase64,
        interventions: interventions || [],
        fichesTech: fichesTech || [],
        logo: logoSrc,
        supabaseAdmin,
      })
    } else if (type === 'cr') {
      if (!crId) return NextResponse.json({ error: 'crId manquant' }, { status: 400 })

      const { data: cr } = await supabaseAdmin
        .from('comptes_rendus').select('*').eq('id', crId).single()

      if (!cr) return NextResponse.json({ error: 'CR non trouvé' }, { status: 404 })

      // Parser les sections depuis le contenu_final (format ## N. Titre)
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
      type === 'recapitulatif'
        ? `Recapitulatif_${dossier.reference}.pdf`
        : type === 'dossier_restitution'
        ? `DossierRestitution_${dossier.reference}.pdf`
        : type === 'cr'
        ? `CR_${TYPES_LABEL[dossier?.cr?.type_visite] || 'visite'}_${dossier.reference}.pdf`
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
// ─────────────────────────────────────────────────────────
// DOSSIER DE RESTITUTION
// ─────────────────────────────────────────────────────────

// Mapping téléphone par prénom (en attendant la colonne telephone dans profiles)
function getTelReferente(referente) {
  if (!referente) return '06 59 81 06 81'
  const prenom = (referente.prenom || '').toLowerCase()
  const email = (referente.email || '').toLowerCase()
  if (prenom === 'marine' || email.includes('marine')) return '06 59 81 06 81'
  if (prenom.includes('anne') || email.includes('anne')) return '06 74 95 04 02'
  return referente.telephone || '06 59 81 06 81'
}

function getNomCompletReferente(referente) {
  if (!referente) return 'Marine MICHELANGELI'
  const prenom = (referente.prenom || '').toLowerCase()
  if (prenom === 'marine') return 'Marine MICHELANGELI'
  if (prenom.includes('anne')) return 'Anne-Lise CAILLET'
  return `${referente.prenom || ''} ${(referente.nom || '').toUpperCase()}`.trim()
}

// Styles spécifiques dossier restitution
const RS = StyleSheet.create({
  page: { padding: 0, fontFamily: 'Helvetica', fontSize: 10, backgroundColor: '#ffffff' },

  // Page de garde
  coverPage: { flex: 1, backgroundColor: '#ffffff' },
  coverHeader: { backgroundColor: '#00578e', height: 8 },
  coverLogoArea: { padding: 30, paddingBottom: 10 },
  coverLogo: { width: 140, height: 56 },
  coverHeroBand: { marginTop: 40, marginBottom: 0, position: 'relative' },
  coverBlueBand: { backgroundColor: '#00578e', height: 180, marginLeft: 0, marginRight: 0 },
  coverOrangeBand: { backgroundColor: '#f37f2b', height: 12, marginLeft: 0, marginRight: 100 },
  coverTitle: { position: 'absolute', top: 30, left: 30, color: '#ffffff', fontSize: 36, fontFamily: 'Helvetica-Bold', lineHeight: 1.2 },
  coverFooter: { position: 'absolute', bottom: 60, left: 0, right: 0, alignItems: 'center' },
  coverFooterName: { fontSize: 11, color: '#00578e', textAlign: 'center', marginBottom: 3 },
  coverFooterText: { fontSize: 10, color: '#374151', textAlign: 'center', marginBottom: 2 },
  coverSlogan: { fontSize: 10, color: '#2f8dcb', textAlign: 'center', fontFamily: 'Helvetica-Oblique', marginTop: 10 },

  // Page séparateur section
  sepPage: { flex: 1, backgroundColor: '#ffffff', position: 'relative' },
  sepTopBand: { height: 8, backgroundColor: '#00578e' },
  sepHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 30, paddingTop: 25, paddingBottom: 10 },
  sepLogo: { width: 120, height: 48 },
  sepTitleArea: { flex: 1, paddingLeft: 30, alignItems: 'flex-end' },
  sepTitle: { fontSize: 28, fontFamily: 'Helvetica-Bold', color: '#00578e', textAlign: 'right', lineHeight: 1.25 },
  sepDiamondOuter: { width: 260, height: 260, alignSelf: 'center', marginTop: 40, backgroundColor: '#e8f4fb', transform: 'rotate(45deg)' },
  sepDecorRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingRight: 30, marginTop: 10 },
  sepOrangeSquare: { width: 60, height: 60, backgroundColor: '#f37f2b' },
  sepBlueRectBot: { position: 'absolute', bottom: 0, right: 0, width: 160, height: 280, backgroundColor: '#00578e' },
  sepBlueMidRect: { position: 'absolute', bottom: 120, right: 120, width: 100, height: 180, backgroundColor: '#2f8dcb' },
  sepSloganArea: { position: 'absolute', bottom: 30, left: 0, right: 0, paddingHorizontal: 30 },
  sepSlogan: { fontSize: 9, color: '#6b7280', fontFamily: 'Helvetica-Oblique' },

  // Pages contenu
  contentPage: { padding: 35, fontFamily: 'Helvetica', fontSize: 9, backgroundColor: '#ffffff' },
  contentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: '#00578e' },
  contentLogo: { width: 90, height: 36 },
  contentTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#00578e', textAlign: 'right' },
  contentSubTitle: { fontSize: 8, color: '#6b7280', textAlign: 'right', marginTop: 2 },
  sectionH: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#00578e', marginTop: 14, marginBottom: 6, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: '#e8f4fb' },
  tableHdr: { flexDirection: 'row', backgroundColor: '#00578e', paddingVertical: 5, paddingHorizontal: 4 },
  thCell: { color: '#ffffff', fontSize: 8, fontFamily: 'Helvetica-Bold' },
  trEven: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  trOdd: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#f0f7fb' },
  trTotal: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 4, backgroundColor: '#00578e' },
  tdNorm: { fontSize: 8 },
  tdBold: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  tdR: { fontSize: 8, textAlign: 'right' },
  tdRBold: { fontSize: 8, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  tdWBold: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  tdRWBold: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#ffffff', textAlign: 'right' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  infoLabel: { fontSize: 8, color: '#6b7280', flex: 1 },
  infoValue: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  summaryLabel: { fontSize: 8, color: '#6b7280', flex: 1 },
  summaryValue: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  summaryRowOrange: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, paddingHorizontal: 6, backgroundColor: '#fff0e0', marginTop: 2, borderRadius: 2 },
  summaryLabelOrange: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#f37f2b', flex: 1 },
  summaryValueOrange: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#f37f2b' },
  badgeOk: { backgroundColor: '#dcfce7', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 8 },
  badgeWarn: { backgroundColor: '#fff3e0', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 8 },
  badgeErr: { backgroundColor: '#fde8e8', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 8 },
  badgeOkText: { fontSize: 7, color: '#166534', fontFamily: 'Helvetica-Bold' },
  badgeWarnText: { fontSize: 7, color: '#c2410c', fontFamily: 'Helvetica-Bold' },
  badgeErrText: { fontSize: 7, color: '#991b1b', fontFamily: 'Helvetica-Bold' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  photoImg: { width: 150, height: 112, objectFit: 'cover', borderRadius: 4 },
  contentFooter: { position: 'absolute', bottom: 20, left: 35, right: 35, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 5 },
  footerTxt: { fontSize: 7, color: '#6b7280' },
  footerSlogan: { fontSize: 7, color: '#2f8dcb', fontFamily: 'Helvetica-Oblique' },
})

function SepPage({ title, logoSrc, note }) {
  const lines = title.split('\n')
  return React.createElement(Page, { size: 'A4', style: RS.sepPage },
    // Bande bleue top
    React.createElement(View, { style: RS.sepTopBand }),
    // Header : logo + titre
    React.createElement(View, { style: RS.sepHeaderRow },
      React.createElement(View, null,
        logoSrc
          ? React.createElement(PdfImage, { src: logoSrc, style: RS.sepLogo })
          : React.createElement(Text, { style: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#00578e' } }, 'illiCO travaux'),
      ),
      React.createElement(View, { style: RS.sepTitleArea },
        ...lines.map((line, i) => React.createElement(Text, { key: i, style: RS.sepTitle }, line)),
      ),
    ),
    // Décorations géométriques — losange stylisé simplifié
    React.createElement(View, { style: { marginTop: 40, alignItems: 'center' } },
      React.createElement(View, { style: { width: 240, height: 240, backgroundColor: '#e8f4fb', transform: [{ rotate: '45deg' }] } }),
    ),
    // Carré orange + rectangle bleu superposé
    React.createElement(View, { style: { position: 'absolute', bottom: 100, right: 60 } },
      React.createElement(View, { style: { width: 64, height: 64, backgroundColor: '#f37f2b' } }),
    ),
    React.createElement(View, { style: { position: 'absolute', bottom: 0, right: 0, width: 140, height: 260, backgroundColor: '#00578e' } }),
    React.createElement(View, { style: { position: 'absolute', bottom: 100, right: 110, width: 90, height: 160, backgroundColor: '#2f8dcb' } }),
    // Note en bas
    note && React.createElement(View, { style: { position: 'absolute', bottom: 28, left: 30, right: 180 } },
      React.createElement(Text, { style: { fontSize: 7, color: '#6b7280', fontFamily: 'Helvetica-Oblique', lineHeight: 1.4 } }, note),
    ),
  )
}

function ContentHeader({ title, sub, logoSrc }) {
  return React.createElement(View, { style: RS.contentHeader },
    logoSrc
      ? React.createElement(PdfImage, { src: logoSrc, style: RS.contentLogo })
      : React.createElement(Text, { style: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#00578e' } }, 'illiCO'),
    React.createElement(View, { style: { alignItems: 'flex-end' } },
      React.createElement(Text, { style: RS.contentTitle }, title),
      sub && React.createElement(Text, { style: RS.contentSubTitle }, sub),
    ),
  )
}

function ContentFooter({ ref, page }) {
  return React.createElement(View, { style: RS.contentFooter, fixed: true },
    React.createElement(Text, { style: RS.footerTxt }, `illiCO travaux Martigues — ${ref}`),
    React.createElement(Text, { style: RS.footerSlogan }, 'Quand vous pensez travaux, pensez illiCO !'),
    React.createElement(Text, { style: RS.footerTxt, render: ({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}` }),
  )
}

function DossierRestitutionPDF({ dossier, devis, photos, fichesTech, interventions, suiviFinancier, logoSrc }) {
  const client = dossier.client
  const ref = dossier.referente
  const nomClient = client
    ? [client.civilite, client.prenom, client.nom, client.prenom2 ? `& ${client.prenom2} ${client.nom2}` : null].filter(Boolean).join(' ')
    : '—'
  const nomRef = getNomCompletReferente(ref)
  const telRef = getTelReferente(ref)
  const emailRef = ref?.email || 'marine.michelangeli@illico-travaux.com'
  const dateAuj = new Date().toLocaleDateString('fr-FR')

  const isAMO = dossier.typologie === 'amo'
  const devisAcceptes = (devis || []).filter(d => d.statut === 'accepte')
  const totalDevisHT = devisAcceptes.reduce((s, d) => s + toNumber(d.montant_ht), 0)
  const totalDevisTTC = devisAcceptes.reduce((s, d) => s + toNumber(d.montant_ttc), 0)

  const tauxCourtage = toNumber(dossier.taux_courtage || 0.06)
  const tauxAmo = toNumber(dossier.honoraires_amo_taux ?? 9) / 100
  const fraisTTC = toNumber(dossier.frais_consultation)
  const fraisHT = fraisTTC / 1.2
  const honCourtage = totalDevisTTC * tauxCourtage
  const honAMO = totalDevisTTC * (tauxCourtage + tauxAmo)

  const photosMaquette = (photos || []).filter(p => p.categorie === 'maquette' || p.categorie === 'illustration')

  // Grouper fiches par artisan
  const fichesParArtisan = {}
  ;(fichesTech || []).forEach(f => {
    const nomArt = f.artisan?.entreprise || f.artisan_id
    if (!fichesParArtisan[nomArt]) fichesParArtisan[nomArt] = []
    fichesParArtisan[nomArt].push(f.fiche)
  })

  const pages = []

  // ── PAGE DE GARDE ──
  pages.push(
    React.createElement(Page, { key: 'cover', size: 'A4', style: RS.coverPage },
      React.createElement(View, { style: RS.coverHeader }),
      React.createElement(View, { style: RS.coverLogoArea },
        logoSrc
          ? React.createElement(PdfImage, { src: logoSrc, style: RS.coverLogo })
          : React.createElement(Text, { style: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#00578e' } }, 'illiCO travaux'),
      ),
      React.createElement(View, { style: RS.coverHeroBand },
        React.createElement(View, { style: RS.coverBlueBand },
          React.createElement(Text, { style: RS.coverTitle }, `Votre projet avec\nilliCO travaux`),
        ),
        React.createElement(View, { style: RS.coverOrangeBand }),
      ),
      React.createElement(View, { style: RS.coverFooter },
        React.createElement(Text, { style: RS.coverFooterName }, nomRef),
        React.createElement(Text, { style: RS.coverFooterText }, 'Société CONSEIL TRAVAUX PROVENCE - CTP'),
        React.createElement(Text, { style: RS.coverFooterText }, '22 rue ramade, quartier Jonquières'),
        React.createElement(Text, { style: RS.coverFooterText }, '13 500 MARTIGUES'),
        React.createElement(Text, { style: RS.coverFooterText }, telRef),
        React.createElement(Text, { style: RS.coverSlogan }, 'Quand vous pensez travaux, pensez illiCO !'),
      ),
    )
  )

  // ── DESCRIPTIF DU PROJET ──
  pages.push(React.createElement(SepPage, { key: 'sep-desc', title: 'Descriptif du\nprojet', logoSrc }))
  pages.push(
    React.createElement(Page, { key: 'desc', size: 'A4', style: RS.contentPage },
      React.createElement(ContentHeader, { title: 'Descriptif du projet', sub: `${dossier.reference} — ${nomClient}`, logoSrc }),
      React.createElement(View, { style: { marginBottom: 12 } },
        React.createElement(View, { style: RS.infoRow },
          React.createElement(Text, { style: RS.infoLabel }, 'Référence'),
          React.createElement(Text, { style: RS.infoValue }, dossier.reference || '—'),
        ),
        React.createElement(View, { style: RS.infoRow },
          React.createElement(Text, { style: RS.infoLabel }, 'Client'),
          React.createElement(Text, { style: RS.infoValue }, nomClient),
        ),
        client?.adresse && React.createElement(View, { style: RS.infoRow },
          React.createElement(Text, { style: RS.infoLabel }, 'Adresse'),
          React.createElement(Text, { style: RS.infoValue }, client.adresse),
        ),
        React.createElement(View, { style: RS.infoRow },
          React.createElement(Text, { style: RS.infoLabel }, 'Prestation'),
          React.createElement(Text, { style: RS.infoValue }, { courtage: 'Courtage', amo: 'AMO', estimo: 'Estimo', audit_energetique: 'Audit énergétique', studio_jardin: 'Studio de jardin' }[dossier.typologie] || dossier.typologie),
        ),
        React.createElement(View, { style: RS.infoRow },
          React.createElement(Text, { style: RS.infoLabel }, 'Référente'),
          React.createElement(Text, { style: RS.infoValue }, nomRef),
        ),
        dossier.date_demarrage_chantier && React.createElement(View, { style: RS.infoRow },
          React.createElement(Text, { style: RS.infoLabel }, 'Démarrage chantier'),
          React.createElement(Text, { style: RS.infoValue }, new Date(dossier.date_demarrage_chantier).toLocaleDateString('fr-FR')),
        ),
        dossier.date_fin_chantier && React.createElement(View, { style: RS.infoRow },
          React.createElement(Text, { style: RS.infoLabel }, 'Fin de chantier'),
          React.createElement(Text, { style: RS.infoValue }, new Date(dossier.date_fin_chantier).toLocaleDateString('fr-FR')),
        ),
        React.createElement(View, { style: RS.infoRow },
          React.createElement(Text, { style: RS.infoLabel }, 'Document établi le'),
          React.createElement(Text, { style: RS.infoValue }, dateAuj),
        ),
      ),
      React.createElement(ContentFooter, { ref: dossier.reference }),
    )
  )

  // ── RÉCAPITULATIF FINANCIER ──
  pages.push(React.createElement(SepPage, { key: 'sep-recap', title: 'Récapitulatif\nfinancier', logoSrc }))
  const isC = ['courtage', 'amo'].includes(dossier.typologie)
  let rowNum = 0
  pages.push(
    React.createElement(Page, { key: 'recap', size: 'A4', style: RS.contentPage },
      React.createElement(ContentHeader, { title: 'Récapitulatif financier', sub: `${dossier.reference} — ${nomClient}`, logoSrc }),
      // Tableau artisans
      React.createElement(View, { style: RS.tableHdr },
        React.createElement(Text, { style: [RS.thCell, { width: 18 }] }, ' '),
        React.createElement(Text, { style: [RS.thCell, { flex: 3 }] }, 'Intervenant'),
        React.createElement(Text, { style: [RS.thCell, { flex: 4 }] }, 'Description'),
        React.createElement(Text, { style: [RS.thCell, { flex: 2, textAlign: 'right' }] }, 'Montant HT'),
        React.createElement(Text, { style: [RS.thCell, { flex: 2, textAlign: 'right' }] }, 'Montant TTC'),
      ),
      fraisTTC > 0 && dossier.frais_statut !== 'offerts' && React.createElement(View, { style: RS.trEven },
        React.createElement(Text, { style: [RS.tdNorm, { width: 18, color: '#6b7280' }] }, '0'),
        React.createElement(Text, { style: [RS.tdNorm, { flex: 3 }] }, 'illiCO travaux'),
        React.createElement(Text, { style: [RS.tdNorm, { flex: 4 }] }, 'Frais de consultation'),
        React.createElement(Text, { style: [RS.tdR, { flex: 2 }] }, fmt(fraisHT)),
        React.createElement(Text, { style: [RS.tdRBold, { flex: 2 }] }, fmt(fraisTTC)),
      ),
      ...devisAcceptes.map(d => {
        const n = ++rowNum
        return React.createElement(View, { key: d.id, style: n % 2 === 0 ? RS.trEven : RS.trOdd },
          React.createElement(Text, { style: [RS.tdNorm, { width: 18, color: '#6b7280' }] }, String(n)),
          React.createElement(Text, { style: [RS.tdNorm, { flex: 3 }] }, d.artisan?.entreprise || '—'),
          React.createElement(Text, { style: [RS.tdNorm, { flex: 4, color: '#6b7280' }] }, d.notes || '—'),
          React.createElement(Text, { style: [RS.tdR, { flex: 2 }] }, fmt(d.montant_ht)),
          React.createElement(Text, { style: [RS.tdRBold, { flex: 2 }] }, fmt(d.montant_ttc)),
        )
      }),
      React.createElement(View, { style: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 4, backgroundColor: '#ddeef8' } },
        React.createElement(Text, { style: [RS.tdBold, { width: 18 }] }, ' '),
        React.createElement(Text, { style: [RS.tdBold, { flex: 7 }] }, 'Total devis HT'),
        React.createElement(Text, { style: [RS.tdRBold, { flex: 2, color: '#00578e' }] }, fmt(totalDevisHT + fraisHT)),
        React.createElement(Text, { style: { flex: 2 } }, ''),
      ),
      React.createElement(View, { style: RS.trTotal },
        React.createElement(Text, { style: [RS.tdWBold, { width: 18 }] }, ' '),
        React.createElement(Text, { style: [RS.tdWBold, { flex: 7 }] }, 'Total devis TTC'),
        React.createElement(Text, { style: { flex: 2 } }, ''),
        React.createElement(Text, { style: [RS.tdRWBold, { flex: 2 }] }, fmt(totalDevisTTC + fraisTTC)),
      ),
      // Honoraires
      isC && totalDevisTTC > 0 && React.createElement(View, { style: { marginTop: 12 } },
        React.createElement(Text, { style: RS.sectionH }, 'Honoraires illiCO travaux'),
        React.createElement(View, { style: RS.summaryRow },
          React.createElement(Text, { style: RS.summaryLabel }, `Honoraires courtage (${(tauxCourtage * 100).toFixed(1)}%)`),
          React.createElement(Text, { style: RS.summaryValue }, fmt(honCourtage)),
        ),
        isAMO && React.createElement(View, { style: RS.summaryRowOrange },
          React.createElement(Text, { style: RS.summaryLabelOrange }, `Honoraires AMO total (${((tauxCourtage + tauxAmo) * 100).toFixed(1)}%)`),
          React.createElement(Text, { style: RS.summaryValueOrange }, fmt(honAMO)),
        ),
        React.createElement(View, { style: { flexDirection: 'row', justifyContent: 'space-between', padding: 8, backgroundColor: '#00578e', borderRadius: 4, marginTop: 6 } },
          React.createElement(Text, { style: { color: '#ffffff', fontSize: 9, fontFamily: 'Helvetica-Bold' } }, 'TOTAL CHANTIER'),
          React.createElement(Text, { style: { color: '#ffffff', fontSize: 12, fontFamily: 'Helvetica-Bold' } }, fmt(totalDevisTTC + fraisTTC + (isAMO ? honAMO : honCourtage))),
        ),
      ),
      React.createElement(ContentFooter, { ref: dossier.reference }),
    )
  )

  // ── DEVIS, FACTURES ──
  pages.push(React.createElement(SepPage, { key: 'sep-devis', title: 'Devis,\nFactures', logoSrc }))
  pages.push(
    React.createElement(Page, { key: 'devis', size: 'A4', style: RS.contentPage },
      React.createElement(ContentHeader, { title: 'Devis & Factures', sub: `${dossier.reference} — ${nomClient}`, logoSrc }),
      React.createElement(Text, { style: RS.sectionH }, 'Devis artisans signés'),
      React.createElement(View, { style: RS.tableHdr },
        React.createElement(Text, { style: [RS.thCell, { flex: 3 }] }, 'Artisan'),
        React.createElement(Text, { style: [RS.thCell, { flex: 2, textAlign: 'right' }] }, 'Montant TTC'),
        React.createElement(Text, { style: [RS.thCell, { flex: 2, textAlign: 'center' }] }, 'Signature'),
        React.createElement(Text, { style: [RS.thCell, { flex: 2, textAlign: 'center' }] }, 'Devis signé'),
        React.createElement(Text, { style: [RS.thCell, { flex: 2, textAlign: 'center' }] }, 'Facture'),
      ),
      ...devisAcceptes.map((d, idx) => React.createElement(View, { key: d.id, style: idx % 2 === 0 ? RS.trEven : RS.trOdd },
        React.createElement(Text, { style: [RS.tdNorm, { flex: 3 }] }, d.artisan?.entreprise || '—'),
        React.createElement(Text, { style: [RS.tdRBold, { flex: 2 }] }, fmt(d.montant_ttc)),
        React.createElement(Text, { style: [RS.tdNorm, { flex: 2, textAlign: 'center' }] }, d.date_signature ? new Date(d.date_signature).toLocaleDateString('fr-FR') : '—'),
        React.createElement(Text, { style: [RS.tdNorm, { flex: 2, textAlign: 'center', color: d.devis_signe_path ? '#166534' : '#6b7280' }] }, d.devis_signe_path ? '✓ Oui' : 'Non'),
        React.createElement(Text, { style: [RS.tdNorm, { flex: 2, textAlign: 'center', color: d.facture_path ? '#166534' : '#6b7280' }] }, d.facture_path ? '✓ Oui' : 'Non'),
      )),
      React.createElement(ContentFooter, { ref: dossier.reference }),
    )
  )

  // ── QUALIFICATION ──
  pages.push(React.createElement(SepPage, { key: 'sep-qual', title: 'Qualification', logoSrc }))
  pages.push(
    React.createElement(Page, { key: 'qual', size: 'A4', style: RS.contentPage },
      React.createElement(ContentHeader, { title: 'Qualification artisans', sub: `${dossier.reference} — ${nomClient}`, logoSrc }),
      React.createElement(View, { style: RS.tableHdr },
        React.createElement(Text, { style: [RS.thCell, { flex: 3 }] }, 'Artisan'),
        React.createElement(Text, { style: [RS.thCell, { flex: 2 }] }, 'Métier'),
        React.createElement(Text, { style: [RS.thCell, { flex: 2, textAlign: 'center' }] }, 'Kbis'),
        React.createElement(Text, { style: [RS.thCell, { flex: 3, textAlign: 'center' }] }, 'Décennale'),
      ),
      ...devisAcceptes.map((d, idx) => {
        const art = d.artisan || {}
        const today = new Date()
        const decExp = art.decennale_expiration ? new Date(art.decennale_expiration) : null
        const diffDays = decExp ? Math.round((decExp - today) / (1000 * 60 * 60 * 24)) : null
        const decStatus = !decExp ? '—' : diffDays < 0 ? '❌ Expirée' : diffDays <= 30 ? '⚠️ < 30 jours' : `✓ ${decExp.toLocaleDateString('fr-FR')}`
        const decColor = !decExp ? '#6b7280' : diffDays < 0 ? '#991b1b' : diffDays <= 30 ? '#c2410c' : '#166534'
        return React.createElement(View, { key: d.id, style: idx % 2 === 0 ? RS.trEven : RS.trOdd },
          React.createElement(Text, { style: [RS.tdBold, { flex: 3 }] }, art.entreprise || '—'),
          React.createElement(Text, { style: [RS.tdNorm, { flex: 2 }] }, art.metier || '—'),
          React.createElement(Text, { style: [RS.tdNorm, { flex: 2, textAlign: 'center', color: art.kbis_url ? '#166534' : '#6b7280' }] }, art.kbis_url ? '✓ Présent' : 'Manquant'),
          React.createElement(Text, { style: [RS.tdNorm, { flex: 3, textAlign: 'center', color: decColor }] }, decStatus),
        )
      }),
      React.createElement(ContentFooter, { ref: dossier.reference }),
    )
  )

  // ── PLANNING PROVISOIRE (AMO uniquement) ──
  if (isAMO) {
    pages.push(React.createElement(SepPage, {
      key: 'sep-plan',
      title: 'Planning\nprovisoire indicatif',
      logoSrc,
      note: "Ce planning est communiqué à titre purement indicatif et ne possède aucune valeur contractuelle. Il est susceptible d'évoluer en fonction des disponibilités des entreprises/des matériaux ou de l'évolution du projet du maître d'ouvrage.",
    }))
    if ((interventions || []).length > 0) {
      pages.push(
        React.createElement(Page, { key: 'plan', size: 'A4', style: RS.contentPage },
          React.createElement(ContentHeader, { title: 'Planning des interventions', sub: `${dossier.reference} — ${nomClient}`, logoSrc }),
          React.createElement(View, { style: RS.tableHdr },
            React.createElement(Text, { style: [RS.thCell, { flex: 3 }] }, 'Artisan'),
            React.createElement(Text, { style: [RS.thCell, { flex: 3 }] }, 'Type'),
            React.createElement(Text, { style: [RS.thCell, { flex: 3, textAlign: 'center' }] }, 'Période'),
          ),
          ...(interventions || []).map((i, idx) => React.createElement(View, { key: i.id, style: idx % 2 === 0 ? RS.trEven : RS.trOdd },
            React.createElement(Text, { style: [RS.tdBold, { flex: 3 }] }, i.artisan?.entreprise || '—'),
            React.createElement(Text, { style: [RS.tdNorm, { flex: 3 }] }, i.type_intervention === 'periode' ? 'Période continue' : 'Jours spécifiques'),
            React.createElement(Text, { style: [RS.tdNorm, { flex: 3, textAlign: 'center' }] },
              i.type_intervention === 'periode'
                ? `${i.date_debut ? new Date(i.date_debut).toLocaleDateString('fr-FR') : '?'} → ${i.date_fin ? new Date(i.date_fin).toLocaleDateString('fr-FR') : '?'}`
                : `${(i.jours_specifiques || []).length} jour(s)`
            ),
          )),
          React.createElement(Text, { style: { fontSize: 7, color: '#6b7280', fontFamily: 'Helvetica-Oblique', marginTop: 16, lineHeight: 1.4 } },
            "Ce planning est communiqué à titre purement indicatif et ne possède aucune valeur contractuelle. Il est susceptible d'évoluer en fonction des disponibilités des entreprises/des matériaux ou de l'évolution du projet du maître d'ouvrage.",
          ),
          React.createElement(ContentFooter, { ref: dossier.reference }),
        )
      )
    }
  }

  // ── MAQUETTE & VUES 3D ──
  pages.push(React.createElement(SepPage, {
    key: 'sep-maquette',
    title: 'Maquette\n& vues 3D',
    logoSrc,
    note: "Les illustrations graphiques, coupes 3D, ou plans ci-dessus reproduits sont des illustrations commerciales qui ne peuvent servir de base à la réalisation du chantier.",
  }))
  if (photosMaquette.length > 0) {
    // Grouper par 4 photos max par page
    for (let i = 0; i < photosMaquette.length; i += 4) {
      const chunk = photosMaquette.slice(i, i + 4)
      pages.push(
        React.createElement(Page, { key: `maquette-${i}`, size: 'A4', style: RS.contentPage },
          React.createElement(ContentHeader, { title: 'Maquette & vues 3D', sub: `${dossier.reference} — ${nomClient}`, logoSrc }),
          React.createElement(View, { style: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 } },
            ...chunk.map(p => p.base64
              ? React.createElement(PdfImage, { key: p.id, src: p.base64, style: RS.photoImg })
              : React.createElement(View, { key: p.id, style: [RS.photoImg, { backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' }] },
                  React.createElement(Text, { style: { fontSize: 7, color: '#6b7280' } }, 'Photo non disponible')
                )
            ),
          ),
          React.createElement(ContentFooter, { ref: dossier.reference }),
        )
      )
    }
  }

  // ── RÉFÉRENCES PRODUITS ──
  pages.push(React.createElement(SepPage, { key: 'sep-refs', title: 'Références\nproduits', logoSrc }))
  if (Object.keys(fichesParArtisan).length > 0) {
    pages.push(
      React.createElement(Page, { key: 'refs', size: 'A4', style: RS.contentPage },
        React.createElement(ContentHeader, { title: 'Références produits', sub: `${dossier.reference} — ${nomClient}`, logoSrc }),
        ...Object.entries(fichesParArtisan).map(([artisan, fiches]) =>
          React.createElement(View, { key: artisan, style: { marginBottom: 12 } },
            React.createElement(Text, { style: RS.sectionH }, artisan),
            ...(fiches || []).map((f, i) => React.createElement(View, { key: i, style: RS.infoRow },
              React.createElement(Text, { style: [RS.infoLabel, { fontFamily: 'Helvetica-Bold', color: '#374151' }] }, f?.nom || '—'),
              React.createElement(Text, { style: [RS.infoValue, { color: '#6b7280', flex: 2, textAlign: 'right' }] }, f?.description || ''),
            )),
          )
        ),
        React.createElement(ContentFooter, { ref: dossier.reference }),
      )
    )
  }

  // ── KBIS - ASSURANCES ──
  pages.push(React.createElement(SepPage, { key: 'sep-kbis', title: 'KBIS -\nAssurances', logoSrc }))
  pages.push(
    React.createElement(Page, { key: 'kbis', size: 'A4', style: RS.contentPage },
      React.createElement(ContentHeader, { title: 'KBIS & Assurances', sub: `${dossier.reference} — ${nomClient}`, logoSrc }),
      React.createElement(Text, { style: [RS.tdNorm, { color: '#6b7280', marginBottom: 12 }] }, "Documents de qualification des artisans intervenus sur ce chantier."),
      ...devisAcceptes.map((d, idx) => {
        const art = d.artisan || {}
        const today = new Date()
        const decExp = art.decennale_expiration ? new Date(art.decennale_expiration) : null
        const diffDays = decExp ? Math.round((decExp - today) / (1000 * 60 * 60 * 24)) : null
        return React.createElement(View, { key: d.id, style: { marginBottom: 10, padding: 8, backgroundColor: idx % 2 === 0 ? '#f8fafc' : '#ffffff', borderLeftWidth: 3, borderLeftColor: '#00578e' } },
          React.createElement(Text, { style: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#00578e', marginBottom: 4 } }, art.entreprise || '—'),
          React.createElement(View, { style: RS.infoRow },
            React.createElement(Text, { style: RS.infoLabel }, 'Métier'),
            React.createElement(Text, { style: RS.infoValue }, art.metier || '—'),
          ),
          React.createElement(View, { style: RS.infoRow },
            React.createElement(Text, { style: RS.infoLabel }, 'Kbis'),
            React.createElement(Text, { style: [RS.infoValue, { color: art.kbis_url ? '#166534' : '#991b1b' }] }, art.kbis_url ? '✓ Document présent' : '⚠ Document manquant'),
          ),
          React.createElement(View, { style: RS.infoRow },
            React.createElement(Text, { style: RS.infoLabel }, 'Assurance décennale'),
            React.createElement(Text, { style: [RS.infoValue, { color: !decExp ? '#6b7280' : diffDays < 0 ? '#991b1b' : diffDays <= 30 ? '#c2410c' : '#166534' }] },
              !decExp ? 'Non renseignée' : diffDays < 0 ? '❌ Expirée' : diffDays <= 30 ? `⚠ Expire le ${decExp.toLocaleDateString('fr-FR')}` : `✓ Valide jusqu'au ${decExp.toLocaleDateString('fr-FR')}`
            ),
          ),
        )
      }),
      React.createElement(ContentFooter, { ref: dossier.reference }),
    )
  )

  return React.createElement(Document, null, ...pages)
}