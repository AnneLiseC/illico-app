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
function DossierFinChantierPDF({ dossier, devis, comptes_rendus, referente }) {
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
  const totalTTC = devisAcceptes.reduce((s, d) => s + toNumber(d.montant_ttc), 0)
  const comptesRendusValides = (comptes_rendus || []).filter((cr) => cr.valide)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {logoBase64 ? <PdfImage src={logoBase64} style={styles.logo} /> : <View style={styles.logo} />}
          <View style={styles.headerRight}>
            <Text style={styles.headerTitle}>Dossier de fin de chantier</Text>
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
            <Text style={styles.infoValue}>
              {referente?.prenom || ''} {referente?.nom || ''}
            </Text>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Démarrage</Text>
            <Text style={styles.infoValue}>
              {dossier.date_demarrage_chantier
                ? new Date(dossier.date_demarrage_chantier).toLocaleDateString('fr-FR')
                : '—'}
            </Text>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Fin de chantier</Text>
            <Text style={styles.infoValue}>
              {dossier.date_fin_chantier
                ? new Date(dossier.date_fin_chantier).toLocaleDateString('fr-FR')
                : '—'}
            </Text>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Établi le</Text>
            <Text style={styles.infoValue}>{dateAuj}</Text>
          </View>
        </View>

        <View style={[styles.divider, { marginVertical: 16 }]} />

        <Text style={styles.sectionTitle}>Artisans intervenus</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Artisan</Text>
            <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>Montant HT</Text>
            <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>Montant TTC</Text>
            <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'center' }]}>Date signature</Text>
          </View>

          {devisAcceptes.map((d, idx) => (
            <View key={d.id} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
              <Text style={[styles.cell, { flex: 3 }]}>{d.artisan?.entreprise || '—'}</Text>
              <Text style={[styles.cellRight, { flex: 2 }]}>{fmt(d.montant_ht)}</Text>
              <Text style={[styles.cellRightBold, { flex: 2 }]}>{fmt(d.montant_ttc)}</Text>
              <Text style={[styles.cell, { flex: 2, textAlign: 'center' }]}>
                {d.date_signature
                  ? new Date(d.date_signature).toLocaleDateString('fr-FR')
                  : '—'}
              </Text>
            </View>
          ))}

          <View style={styles.tableRowTotal}>
            <Text style={[styles.cellBold, { flex: 3 }]}>TOTAL TRAVAUX</Text>
            <Text style={{ flex: 2 }} />
            <Text style={[styles.cellRightBold, { flex: 2 }]}>{fmt(totalTTC)}</Text>
            <Text style={{ flex: 2 }} />
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            illiCO travaux Martigues — Dossier de fin de chantier — {dossier.reference}
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>

      {comptesRendusValides.length > 0 && (
        <Page size="A4" style={styles.page}>
          <View style={styles.header}>
            {logoBase64 ? <PdfImage src={logoBase64} style={styles.logo} /> : <View style={styles.logo} />}
            <View style={styles.headerRight}>
              <Text style={styles.headerTitle}>Comptes-rendus de visite</Text>
              <Text style={styles.headerSub}>
                {dossier.reference} — {nomClient}
              </Text>
            </View>
          </View>

          {comptesRendusValides.map((cr, idx) => {
            const typeLabel = {
              r1: 'R1 — Visite client',
              r2: 'R2 — Visite avec artisan',
              r3: 'R3 — Présentation devis',
              suivi: 'Visite de suivi',
              reception: 'Réception chantier',
            }[cr.type_visite] || cr.type_visite

            return (
              <View key={cr.id} style={{ marginBottom: 16 }} wrap={false}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    marginBottom: 4,
                  }}
                >
                  <Text style={[styles.cellBold, { color: BLEU }]}>{typeLabel}</Text>
                  <Text style={styles.infoRowLabel}>
                    {cr.date_visite
                      ? new Date(cr.date_visite).toLocaleDateString('fr-FR')
                      : new Date(cr.created_at).toLocaleDateString('fr-FR')}
                  </Text>
                </View>

                {cr.contenu_final ? (
                  <Text style={[styles.cell, { lineHeight: 1.6, color: '#374151' }]}>
                    {cr.contenu_final}
                  </Text>
                ) : cr.notes_brutes ? (
                  <Text style={[styles.cell, { lineHeight: 1.6, color: GRIS_TEXTE }]}>
                    {cr.notes_brutes}
                  </Text>
                ) : null}

                {idx < comptesRendusValides.length - 1 && (
                  <View style={[styles.divider, { marginTop: 12 }]} />
                )}
              </View>
            )
          })}

          <View style={styles.footer} fixed>
            <Text style={styles.footerText}>
              illiCO travaux Martigues — Dossier de fin de chantier — {dossier.reference}
            </Text>
            <Text
              style={styles.footerText}
              render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
            />
          </View>
        </Page>
      )}

      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {logoBase64 ? <PdfImage src={logoBase64} style={styles.logo} /> : <View style={styles.logo} />}
          <View style={styles.headerRight}>
            <Text style={styles.headerTitle}>Attestation de réception</Text>
            <Text style={styles.headerSub}>
              {dossier.reference} — {nomClient}
            </Text>
          </View>
        </View>

        <View style={{ marginBottom: 32 }}>
          <Text style={[styles.cell, { lineHeight: 1.8, marginBottom: 16 }]}>
            Je soussigné(e) <Text style={{ fontFamily: 'Helvetica-Bold' }}>{nomClient}</Text>,
            certifie avoir reçu et accepté la réception des travaux réalisés dans le cadre du
            dossier <Text style={{ fontFamily: 'Helvetica-Bold' }}>{dossier.reference}</Text>,
            supervisé par illiCO travaux Martigues.
          </Text>
          <Text style={[styles.cell, { lineHeight: 1.8, marginBottom: 16 }]}>
            Les travaux ont été réalisés conformément aux devis signés. Le dossier de fin de
            chantier m’a été remis.
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 40 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabel}>Fait à _____________, le _____________</Text>
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Signature client</Text>
            <View style={styles.signatureBox} />
            <Text style={styles.signatureLabel}>{nomClient}</Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabel}>Cachet et signature illiCO travaux</Text>
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Signature référente</Text>
            <View style={styles.signatureBox} />
            <Text style={styles.signatureLabel}>
              {referente?.prenom || ''} {referente?.nom || ''} — illiCO travaux Martigues
            </Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            illiCO travaux Martigues — Dossier de fin de chantier — {dossier.reference}
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
          />
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

function buildDossierFinDocument({ dossier, devis, comptes_rendus, referente }) {
  return React.createElement(DossierFinChantierPDF, {
    dossier,
    devis,
    comptes_rendus,
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
      const { data: comptes_rendus, error: comptesRendusError } = await supabaseAdmin
        .from('comptes_rendus')
        .select('*')
        .eq('dossier_id', dossierId)
        .order('date_visite')

      if (comptesRendusError) {
        return NextResponse.json({ error: comptesRendusError.message }, { status: 500 })
      }

      const doc = buildDossierFinDocument({
        dossier,
        devis: devis || [],
        comptes_rendus: comptes_rendus || [],
        referente: dossier.referente,
      })

      pdfBuffer = await renderToBuffer(doc)
    } else {
      return NextResponse.json({ error: 'Type de PDF inconnu' }, { status: 400 })
    }

    const filename =
      type === 'recapitulatif'
        ? `Recapitulatif_${dossier.reference}.pdf`
        : `DossierFin_${dossier.reference}.pdf`

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