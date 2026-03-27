// app/api/pdf/route.js
// Génération PDF : récapitulatif financier client + dossier fin de chantier

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { renderToBuffer, Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer'
import path from 'path'
import fs from 'fs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ── Couleurs illiCO ──
const BLEU = '#1E3A5F'
const BLEU_CLAIR = '#E8F0FB'
const GRIS = '#F3F4F6'
const GRIS_TEXTE = '#6B7280'
const VERT = '#166534'
const VERT_CLAIR = '#DCFCE7'
const ORANGE = '#C2410C'

// ── Styles ──
const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#1F2937' },
  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: BLEU },
  logo: { width: 140, height: 50, objectFit: 'contain' },
  headerRight: { alignItems: 'flex-end' },
  headerTitle: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: BLEU, marginBottom: 2 },
  headerSub: { fontSize: 9, color: GRIS_TEXTE },
  // Section
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: BLEU, marginBottom: 8, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: BLEU_CLAIR },
  // Infos client
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
  // Badge
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, alignSelf: 'flex-start' },
  badgeGreen: { backgroundColor: VERT_CLAIR },
  badgeText: { fontSize: 8, color: VERT },
  // Montant highlight
  montantBlock: { flexDirection: 'row', justifyContent: 'space-between', padding: 10, backgroundColor: BLEU, borderRadius: 6, marginTop: 8 },
  montantLabel: { color: 'white', fontSize: 10, fontFamily: 'Helvetica-Bold' },
  montantValue: { color: 'white', fontSize: 14, fontFamily: 'Helvetica-Bold' },
  // Footer
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 8 },
  footerText: { fontSize: 8, color: GRIS_TEXTE },
  // Séparateur
  divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 8 },
  // Ligne info
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  infoRowLabel: { fontSize: 9, color: GRIS_TEXTE },
  infoRowValue: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  // Signature
  signatureBox: { height: 60, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 4, marginTop: 4 },
  signatureLabel: { fontSize: 8, color: GRIS_TEXTE, marginTop: 4 },
})

const fmt = (n) => `${(n || 0).toFixed(2)} €`

// ── Logo path ──
const logoPath = path.join(process.cwd(), 'public', 'logo.png')

// ── RÉCAPITULATIF FINANCIER CLIENT ──
function RecapitulatifPDF({ dossier, devis, suiviFinancier }) {
  const client = dossier.client
  const nomClient = client ? `${client.civilite || ''} ${client.prenom} ${client.nom}`.trim() : '—'
  const referente = dossier.referente ? `${dossier.referente.prenom} ${dossier.referente.nom}` : '—'
  const typologieLabel = { courtage: 'Courtage', amo: 'AMO', estimo: 'Estimo', audit_energetique: 'Audit énergétique', studio_jardin: 'Studio de jardin' }[dossier.typologie] || dossier.typologie

  const devisAcceptes = devis.filter(d => d.statut === 'accepte')
  const devisActifs = devis.filter(d => d.statut !== 'refuse')
  const totalDevisTTCSignes = devisAcceptes.reduce((s, d) => s + (d.montant_ttc || 0), 0)
  const totalDevisHTSignes = devisAcceptes.reduce((s, d) => s + (d.montant_ht || 0), 0)

  const tauxCourtage = dossier.taux_courtage ?? 0.06
  const tauxAmo = (dossier.honoraires_amo_taux ?? 9) / 100
  const honorairesCourtage = totalDevisTTCSignes * tauxCourtage
  const honorairesAMO = totalDevisTTCSignes * (tauxCourtage + tauxAmo)
  const fraisTTC = parseFloat(dossier.frais_consultation) || 0

  const isAMO = dossier.typologie === 'amo'
  const isCourtage = ['courtage', 'amo'].includes(dossier.typologie)

  const getSuivi = (type) => suiviFinancier.find(s => s.type_echeance === type)
  const statutLabel = (s) => ({ en_attente: 'En attente', envoye: 'Facturé', regle: '✓ Réglé' })[s] || s

  const dateAuj = new Date().toLocaleDateString('fr-FR')

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          {fs.existsSync(logoPath) && <Image src={logoPath} style={styles.logo} />}
          <View style={styles.headerRight}>
            <Text style={styles.headerTitle}>Récapitulatif financier</Text>
            <Text style={styles.headerSub}>illiCO travaux Martigues</Text>
            <Text style={[styles.headerSub, { marginTop: 2 }]}>Établi le {dateAuj}</Text>
          </View>
        </View>

        {/* Infos client */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations du dossier</Text>
          <View style={styles.infoGrid}>
            <View style={styles.infoBlock}>
              <Text style={styles.infoLabel}>Client</Text>
              <Text style={styles.infoValue}>{nomClient}</Text>
            </View>
            <View style={styles.infoBlock}>
              <Text style={styles.infoLabel}>Référence chantier</Text>
              <Text style={styles.infoValue}>{dossier.reference}</Text>
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
          {client?.adresse && (
            <View style={{ marginTop: 4 }}>
              <Text style={styles.infoLabel}>Adresse</Text>
              <Text style={styles.cell}>{client.adresse}</Text>
            </View>
          )}
        </View>

        {/* Devis artisans */}
        {devisAcceptes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Devis artisans signés</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Artisan</Text>
                <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>Montant HT</Text>
                <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>Montant TTC</Text>
                <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>Acompte (30%)</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'center' }]}>Statut</Text>
              </View>
              {devisAcceptes.map((d, idx) => {
                const acompte = d.acompte_pourcentage === -1
                  ? (d.acompte_montant_fixe || 0)
                  : (d.montant_ttc || 0) * ((d.acompte_pourcentage || 30) / 100)
                const suiviAcompte = suiviFinancier.find(s => s.type_echeance === 'acompte_artisan' && s.artisan_id === d.artisan_id)
                return (
                  <View key={d.id} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                    <Text style={[styles.cell, { flex: 3 }]}>{d.artisan?.entreprise || '—'}</Text>
                    <Text style={[styles.cellRight, { flex: 2 }]}>{fmt(d.montant_ht)}</Text>
                    <Text style={[styles.cellRightBold, { flex: 2 }]}>{fmt(d.montant_ttc)}</Text>
                    <Text style={[styles.cellRight, { flex: 2 }]}>{fmt(acompte)}</Text>
                    <Text style={[styles.cell, { flex: 1, textAlign: 'center', color: suiviAcompte?.statut_client === 'regle' ? VERT : ORANGE }]}>
                      {statutLabel(suiviAcompte?.statut_client || 'en_attente')}
                    </Text>
                  </View>
                )
              })}
              <View style={styles.tableRowTotal}>
                <Text style={[styles.cellBold, { flex: 3 }]}>TOTAL</Text>
                <Text style={[styles.cellRightBold, { flex: 2 }]}>{fmt(totalDevisHTSignes)}</Text>
                <Text style={[styles.cellRightBold, { flex: 2 }]}>{fmt(totalDevisTTCSignes)}</Text>
                <Text style={[styles.cellRightBold, { flex: 2 }]}>{fmt(totalDevisTTCSignes * 0.3)}</Text>
                <Text style={{ flex: 1 }}></Text>
              </View>
            </View>
          </View>
        )}

        {/* Honoraires */}
        {isCourtage && totalDevisTTCSignes > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Honoraires illiCO travaux</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoRowLabel}>Honoraires courtage ({(tauxCourtage * 100).toFixed(1)}%) — à la signature des devis</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.infoRowValue}>{fmt(honorairesCourtage)}</Text>
                <Text style={[styles.infoRowLabel, { color: getSuivi('honoraires_courtage')?.statut_client === 'regle' ? VERT : ORANGE }]}>
                  {statutLabel(getSuivi('honoraires_courtage')?.statut_client || 'en_attente')}
                </Text>
              </View>
            </View>
            {isAMO && (
              <View style={styles.infoRow}>
                <Text style={styles.infoRowLabel}>Honoraires AMO solde ({(tauxAmo * 100).toFixed(1)}%) — à la fin du chantier</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.infoRowValue}>{fmt(honorairesAMO - honorairesCourtage)}</Text>
                  <Text style={[styles.infoRowLabel, { color: getSuivi('solde_amo')?.statut_client === 'regle' ? VERT : ORANGE }]}>
                    {statutLabel(getSuivi('solde_amo')?.statut_client || 'en_attente')}
                  </Text>
                </View>
              </View>
            )}
            {isAMO && (
              <View style={[styles.infoRow, { backgroundColor: BLEU_CLAIR, borderRadius: 4, paddingHorizontal: 8 }]}>
                <Text style={styles.cellBold}>Total honoraires AMO</Text>
                <Text style={styles.cellRightBold}>{fmt(honorairesAMO)}</Text>
              </View>
            )}
          </View>
        )}

        {/* Frais de consultation */}
        {fraisTTC > 0 && dossier.frais_statut !== 'offerts' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Frais de consultation</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoRowLabel}>Visite technique initiale</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.infoRowValue}>{fmt(fraisTTC)}</Text>
                <Text style={[styles.infoRowLabel, { color: dossier.frais_statut === 'regle' ? VERT : ORANGE }]}>
                  {dossier.frais_statut === 'regle' ? '✓ Réglé' : 'En attente'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Total général */}
        <View style={styles.montantBlock}>
          <Text style={styles.montantLabel}>Total travaux + honoraires</Text>
          <Text style={styles.montantValue}>
            {fmt(totalDevisTTCSignes + (isAMO ? honorairesAMO : isCourtage ? honorairesCourtage : 0) + fraisTTC)}
          </Text>
        </View>

        {/* Échéancier */}
        <View style={[styles.section, { marginTop: 16 }]}>
          <Text style={styles.sectionTitle}>Échéancier de paiement</Text>
          {fraisTTC > 0 && dossier.frais_statut !== 'offerts' && (
            <View style={styles.infoRow}>
              <Text style={styles.infoRowLabel}>Frais de consultation — À la signature du contrat (48h)</Text>
              <Text style={styles.infoRowValue}>{fmt(fraisTTC)}</Text>
            </View>
          )}
          {isCourtage && totalDevisTTCSignes > 0 && (
            <View style={styles.infoRow}>
              <Text style={styles.infoRowLabel}>Honoraires courtage — À la signature des devis (48h)</Text>
              <Text style={styles.infoRowValue}>{fmt(honorairesCourtage)}</Text>
            </View>
          )}
          {devisAcceptes.map(d => {
            const acompte = d.acompte_pourcentage === -1
              ? (d.acompte_montant_fixe || 0)
              : (d.montant_ttc || 0) * ((d.acompte_pourcentage || 30) / 100)
            return (
              <View key={d.id} style={styles.infoRow}>
                <Text style={styles.infoRowLabel}>Acompte {d.artisan?.entreprise} — Démarrage chantier (1 semaine)</Text>
                <Text style={styles.infoRowValue}>{fmt(acompte)}</Text>
              </View>
            )
          })}
          {devisAcceptes.map(d => {
            const acompte = d.acompte_pourcentage === -1
              ? (d.acompte_montant_fixe || 0)
              : (d.montant_ttc || 0) * ((d.acompte_pourcentage || 30) / 100)
            const solde = (d.montant_ttc || 0) - acompte
            return (
              <View key={d.id + '_solde'} style={styles.infoRow}>
                <Text style={styles.infoRowLabel}>Solde {d.artisan?.entreprise} — Fin de chantier</Text>
                <Text style={styles.infoRowValue}>{fmt(solde)}</Text>
              </View>
            )
          })}
          {isAMO && totalDevisTTCSignes > 0 && (
            <View style={styles.infoRow}>
              <Text style={styles.infoRowLabel}>Honoraires AMO solde — Fin de chantier (48h)</Text>
              <Text style={styles.infoRowValue}>{fmt(honorairesAMO - honorairesCourtage)}</Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>illiCO travaux Martigues — {dossier.reference}</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

// ── DOSSIER FIN DE CHANTIER ──
function DossierFinChantierPDF({ dossier, devis, comptes_rendus, referente }) {
  const client = dossier.client
  const nomClient = client ? `${client.civilite || ''} ${client.prenom} ${client.nom}`.trim() : '—'
  const dateAuj = new Date().toLocaleDateString('fr-FR')
  const typologieLabel = { courtage: 'Courtage', amo: 'AMO', estimo: 'Estimo' }[dossier.typologie] || dossier.typologie
  const devisAcceptes = devis.filter(d => d.statut === 'accepte')
  const totalTTC = devisAcceptes.reduce((s, d) => s + (d.montant_ttc || 0), 0)

  return (
    <Document>
      {/* Page de garde */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {fs.existsSync(logoPath) && <Image src={logoPath} style={styles.logo} />}
          <View style={styles.headerRight}>
            <Text style={styles.headerTitle}>Dossier de fin de chantier</Text>
            <Text style={styles.headerSub}>illiCO travaux Martigues</Text>
          </View>
        </View>

        {/* Infos principales */}
        <View style={{ backgroundColor: BLEU, borderRadius: 8, padding: 20, marginBottom: 24 }}>
          <Text style={{ color: 'white', fontSize: 20, fontFamily: 'Helvetica-Bold', marginBottom: 8 }}>{nomClient}</Text>
          <Text style={{ color: '#93C5FD', fontSize: 12, marginBottom: 4 }}>{dossier.reference}</Text>
          <Text style={{ color: '#93C5FD', fontSize: 10 }}>{typologieLabel}</Text>
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Référente</Text>
            <Text style={styles.infoValue}>{referente?.prenom} {referente?.nom}</Text>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Démarrage</Text>
            <Text style={styles.infoValue}>{dossier.date_demarrage_chantier ? new Date(dossier.date_demarrage_chantier).toLocaleDateString('fr-FR') : '—'}</Text>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Fin de chantier</Text>
            <Text style={styles.infoValue}>{dossier.date_fin_chantier ? new Date(dossier.date_fin_chantier).toLocaleDateString('fr-FR') : '—'}</Text>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Établi le</Text>
            <Text style={styles.infoValue}>{dateAuj}</Text>
          </View>
        </View>

        <View style={[styles.divider, { marginVertical: 16 }]} />

        {/* Récap artisans */}
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
                {d.date_signature ? new Date(d.date_signature).toLocaleDateString('fr-FR') : '—'}
              </Text>
            </View>
          ))}
          <View style={styles.tableRowTotal}>
            <Text style={[styles.cellBold, { flex: 3 }]}>TOTAL TRAVAUX</Text>
            <Text style={{ flex: 2 }}></Text>
            <Text style={[styles.cellRightBold, { flex: 2 }]}>{fmt(totalTTC)}</Text>
            <Text style={{ flex: 2 }}></Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>illiCO travaux Martigues — Dossier de fin de chantier — {dossier.reference}</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* Page comptes-rendus */}
      {comptes_rendus.length > 0 && (
        <Page size="A4" style={styles.page}>
          <View style={styles.header}>
            {fs.existsSync(logoPath) && <Image src={logoPath} style={styles.logo} />}
            <View style={styles.headerRight}>
              <Text style={styles.headerTitle}>Comptes-rendus de visite</Text>
              <Text style={styles.headerSub}>{dossier.reference} — {nomClient}</Text>
            </View>
          </View>

          {comptes_rendus.filter(cr => cr.valide).map((cr, idx) => {
            const typeLabel = { r1: 'R1 — Visite client', r2: 'R2 — Visite avec artisan', r3: 'R3 — Présentation devis', suivi: 'Visite de suivi', reception: 'Réception chantier' }[cr.type_visite] || cr.type_visite
            return (
              <View key={cr.id} style={{ marginBottom: 16 }} wrap={false}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={[styles.cellBold, { color: BLEU }]}>{typeLabel}</Text>
                  <Text style={styles.infoRowLabel}>
                    {cr.date_visite ? new Date(cr.date_visite).toLocaleDateString('fr-FR') : new Date(cr.created_at).toLocaleDateString('fr-FR')}
                  </Text>
                </View>
                {cr.contenu_final ? (
                  <Text style={[styles.cell, { lineHeight: 1.6, color: '#374151' }]}>{cr.contenu_final}</Text>
                ) : cr.notes_brutes ? (
                  <Text style={[styles.cell, { lineHeight: 1.6, color: GRIS_TEXTE }]}>{cr.notes_brutes}</Text>
                ) : null}
                {idx < comptes_rendus.length - 1 && <View style={[styles.divider, { marginTop: 12 }]} />}
              </View>
            )
          })}

          <View style={styles.footer} fixed>
            <Text style={styles.footerText}>illiCO travaux Martigues — Dossier de fin de chantier — {dossier.reference}</Text>
            <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      )}

      {/* Page signature */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {fs.existsSync(logoPath) && <Image src={logoPath} style={styles.logo} />}
          <View style={styles.headerRight}>
            <Text style={styles.headerTitle}>Attestation de réception</Text>
            <Text style={styles.headerSub}>{dossier.reference} — {nomClient}</Text>
          </View>
        </View>

        <View style={{ marginBottom: 32 }}>
          <Text style={[styles.cell, { lineHeight: 1.8, marginBottom: 16 }]}>
            Je soussigné(e) <Text style={{ fontFamily: 'Helvetica-Bold' }}>{nomClient}</Text>, certifie avoir reçu et accepté la réception des travaux réalisés dans le cadre du dossier <Text style={{ fontFamily: 'Helvetica-Bold' }}>{dossier.reference}</Text>, supervisé par illiCO travaux Martigues.
          </Text>
          <Text style={[styles.cell, { lineHeight: 1.8, marginBottom: 16 }]}>
            Les travaux ont été réalisés conformément aux devis signés. Le dossier de fin de chantier m'a été remis.
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 40 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoRowLabel}>Fait à _____________, le _____________</Text>
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Signature client</Text>
            <View style={styles.signatureBox} />
            <Text style={styles.signatureLabel}>{nomClient}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoRowLabel}>Cachet et signature illiCO travaux</Text>
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Signature référente</Text>
            <View style={styles.signatureBox} />
            <Text style={styles.signatureLabel}>{referente?.prenom} {referente?.nom} — illiCO travaux Martigues</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>illiCO travaux Martigues — Dossier de fin de chantier — {dossier.reference}</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

// ── ROUTE API ──
export async function POST(request) {
  try {
    const { dossierId, type, userId } = await request.json()
    if (!dossierId || !type) return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })

    // Charger le dossier complet
    const { data: dossier } = await supabaseAdmin
      .from('dossiers')
      .select('*, referente:profiles!dossiers_referente_id_fkey(id, prenom, nom), client:clients(*)')
      .eq('id', dossierId)
      .single()

    if (!dossier) return NextResponse.json({ error: 'Dossier non trouvé' }, { status: 404 })

    // Charger les devis
    const { data: devis } = await supabaseAdmin
      .from('devis_artisans')
      .select('*, artisan:artisans(id, entreprise)')
      .eq('dossier_id', dossierId)
      .order('created_at')

    let pdfBuffer

    if (type === 'recapitulatif') {
      const { data: suiviFinancier } = await supabaseAdmin
        .from('suivi_financier').select('*').eq('dossier_id', dossierId)

      pdfBuffer = await renderToBuffer(
        <RecapitulatifPDF dossier={dossier} devis={devis || []} suiviFinancier={suiviFinancier || []} />
      )
    } else if (type === 'dossier_fin') {
      const { data: comptes_rendus } = await supabaseAdmin
        .from('comptes_rendus').select('*').eq('dossier_id', dossierId).order('date_visite')

      pdfBuffer = await renderToBuffer(
        <DossierFinChantierPDF
          dossier={dossier}
          devis={devis || []}
          comptes_rendus={comptes_rendus || []}
          referente={dossier.referente}
        />
      )
    } else {
      return NextResponse.json({ error: 'Type de PDF inconnu' }, { status: 400 })
    }

    const filename = type === 'recapitulatif'
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
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}