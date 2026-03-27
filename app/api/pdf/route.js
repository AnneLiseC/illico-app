// app/api/pdf/route.js
// Génération PDF : récapitulatif financier client + dossier fin de chantier

import React from 'react'
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

// ── ROUTE API ──
export async function POST(request) {
  try {
    const { dossierId, type } = await request.json()

    if (!dossierId || !type) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
    }

    const { data: dossier, error: dossierError } = await supabaseAdmin
      .from('dossiers')
      .select('*, referente:profiles!dossiers_referente_id_fkey(id, prenom, nom), client:clients(*)')
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
    } else if (type === 'dossier_fin') {
      const doc = buildDossierFinDocument({
        dossier,
        devis: devis || [],
        referente: dossier.referente,
      })

      pdfBuffer = await renderToBuffer(doc)
    } else {
      return NextResponse.json({ error: 'Type de PDF inconnu' }, { status: 400 })
    }

    const filename =
      type === 'recapitulatif'
        ? `Recapitulatif_${dossier.reference}.pdf`
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