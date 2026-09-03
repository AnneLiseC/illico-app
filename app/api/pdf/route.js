// app/api/pdf/route.js
// Génération PDF : récapitulatif financier client + CR

import React from 'react'
import { buildDossierSuivi, buildSuiviPaiementsSection } from './restitution.js'
import { formatNomClient } from '../../lib/clients.js'
import { TVA_FRAIS } from '../../lib/finance.js'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { renderToBuffer, Document, Page, Text, View, Image as PdfImage, StyleSheet } from '@react-pdf/renderer'

// Photos : on RÉDUIT + réoriente (EXIF) et recompresse en JPEG avant de les embarquer. Les gros
// JPEG iPhone bruts font ramer @react-pdf et peuvent produire des PAGES BLANCHES ; réduits, le PDF
// est léger, rapide et fiable. Import dynamique de sharp (évite tout souci de bundling). Repli sur
// l'original si sharp indisponible, null si l'image est illisible (elle est alors simplement omise).
let _sharp
async function photoDataURL(buf) {
  try {
    if (!_sharp) _sharp = (await import('sharp')).default
    const out = await _sharp(buf).rotate().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer()
    return `data:image/jpeg;base64,${out.toString('base64')}`
  } catch {
    try { return `data:image/jpeg;base64,${buf.toString('base64')}` } catch { return null }
  }
}

// Nom de fichier basé sur le client (accents/espaces nettoyés). Fallback : référence.
function nomFichierClient(dossier) {
  return (formatNomClient(dossier?.client, { civilite: false }) || dossier?.reference || 'Client')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '')
}
import '../../lib/pdf/fonts.js'
import path from 'path'
import fs from 'fs'
import { requireUser } from '../../lib/api-auth'
import RecapHonoraires from '../../lib/pdf/RecapHonoraires.js'
import { stripEmojiPdf } from '../../lib/pdf/stripEmoji.js'
import { buildCRDocument } from '../../lib/pdf/crDocument.js' // extrait ici (réutilisé par /api/drive/push-cr)
import { empreinteDe, lireCache, ecrireCache, jourDEdition } from '../../lib/pdf/cache.js'

let _supabaseAdmin
function getSupabaseAdmin() {
  if (!_supabaseAdmin) _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _supabaseAdmin
}

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


// ── ROUTE API ──
// Types autorisés pour un utilisateur client (lecture de son propre dossier uniquement)
const CLIENT_ALLOWED_TYPES = new Set(['cr', 'devis'])

export async function POST(request) {
  const auth = await requireUser(request)
  if (auth.error) return auth.error
  try {
    const { dossierId, type, crId, devisId, regenerer } = await request.json()

    if (!dossierId || !type) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
    }

    const { data: dossier, error: dossierError } = await getSupabaseAdmin()
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

    const { data: devis, error: devisError } = await getSupabaseAdmin()
      .from('devis_artisans')
      .select('*, artisan:artisans(id, entreprise)')
      .eq('dossier_id', dossierId)
      .order('ordre', { nullsFirst: false })
      .order('created_at')

    if (devisError) return NextResponse.json({ error: devisError.message }, { status: 500 })

    let pdfBuffer
    let cr = null

    // ── CACHE DES DOCUMENTS ────────────────────────────────────────────────
    // Règle retenue le 03/09 : « dès qu'une modification pourrait toucher le PDF,
    // on le relance ». L'empreinte est donc le CONTENU lui-même — on hache les
    // données qui composent le document. Un champ change, l'empreinte change, le
    // document est refait. On assume de régénérer parfois pour rien.
    //
    // `regenerer: true` dans le corps de la requête force la refabrication : soupape
    // manuelle, pour ne jamais être prisonnier du cache en cas de doute.
    const db = getSupabaseAdmin()
    let servisDuCache = false
    const avecCache = async (cle, donnees, produire) => {
      // La date d'édition est IMPRIMÉE sur le document et calculée au rendu. Sans elle
      // dans l'empreinte, un document servi trois semaines plus tard porte la date de sa
      // première fabrication — et sur une pièce remise au client, cette mention fait foi.
      // Ajoutée ici, en un seul endroit, pour les quatre types de documents. (R13)
      const empreinte = empreinteDe({ ...donnees, jourDEdition: jourDEdition() })
      if (!regenerer) {
        const enCache = await lireCache(db, { dossierId, type, cle, empreinte })
        if (enCache) { servisDuCache = true; return enCache }
      }
      const buffer = await produire()
      await ecrireCache(db, { dossierId, type, cle, empreinte, buffer })
      return buffer
    }

    if (type === 'recapitulatif_prev') {
      // Recap_Financier = doc client remis en réel : charger le vrai suivi_financier
      // pour que getPivotCourtage voie le pivot et applique la TS-1 (cohérence avec
      // le Suivi_Financier et le DossierSuivi). Base devis inchangée (recu+accepte,
      // preview:true) ; seul le suivi passe de [] au réel.
      const { data: suiviFinancier, error: suiviError } = await getSupabaseAdmin()
        .from('suivi_financier').select('*').eq('dossier_id', dossierId)
      if (suiviError) return NextResponse.json({ error: suiviError.message }, { status: 500 })
      pdfBuffer = await avecCache(null,
        { dossier, devis: devis || [], suiviFinancier: suiviFinancier || [], preview: true },
        () => renderToBuffer(buildRecapitulatifDocument({ dossier, devis: devis || [], suiviFinancier: suiviFinancier || [], factures: [], preview: true })))

    } else if (type === 'recapitulatif') {
      const { data: suiviFinancier, error: suiviError } = await getSupabaseAdmin()
        .from('suivi_financier').select('*').eq('dossier_id', dossierId)
      if (suiviError) return NextResponse.json({ error: suiviError.message }, { status: 500 })
      const { data: factures, error: facturesError } = await getSupabaseAdmin()
        .from('factures_artisans').select('*').eq('dossier_id', dossierId).order('date_paiement')
      if (facturesError) return NextResponse.json({ error: facturesError.message }, { status: 500 })
      pdfBuffer = await avecCache(null,
        { dossier, devis: devis || [], suiviFinancier: suiviFinancier || [], factures: factures || [] },
        () => renderToBuffer(buildRecapitulatifDocument({ dossier, devis: devis || [], suiviFinancier: suiviFinancier || [], factures: factures || [] })))

    } else if (type === 'dossier_suivi') {
      const { data: devisComplets } = await getSupabaseAdmin()
        .from('devis_artisans')
        // ⚠️ `qualification_url` est INDISPENSABLE ici : restitution.js teste
        // `d.artisan?.qualification_url` pour décider d'inclure le séparateur et les
        // attestations de qualification. La colonne manquait à ce select, donc la
        // condition était TOUJOURS fausse : la section Qualifications n'est jamais
        // partie dans un dossier de restitution, depuis l'origine. (R17)
        .select('*, artisan:artisans(id, entreprise, metier, kbis_url, decennale_url, decennale_expiration, qualification_url)')
        .eq('dossier_id', dossierId).order('ordre', { nullsFirst: false }).order('created_at')

      const { data: photos } = await getSupabaseAdmin()
        .from('photos').select('*')
        .eq('dossier_id', dossierId).eq('categorie', 'maquette').order('created_at')

      const { data: interventions } = await getSupabaseAdmin()
        .from('interventions_artisans')
        .select('*, artisan:artisans(id, entreprise)')
        .eq('dossier_id', dossierId).order('date_debut')

      const { data: fichesTech } = await getSupabaseAdmin()
        .from('chantier_fiches_techniques')
        .select('fiche:fiches_techniques(id, nom, description, url)')
        .eq('dossier_id', dossierId)

      const { data: docsRestitution } = await getSupabaseAdmin()
        .from('chantier_documents').select('*')
        .eq('dossier_id', dossierId).eq('dans_restitution', true).order('created_at')

      const { data: factures } = await getSupabaseAdmin()
        .from('factures_artisans').select('*')
        .eq('dossier_id', dossierId).order('date_paiement')

      const { data: suiviFinancier } = await getSupabaseAdmin()
        .from('suivi_financier').select('*').eq('dossier_id', dossierId)

      // RIB + KBIS du franchisé — lu avant l'empreinte, il entre dans le document.
      //
      // ⚠ `maybeSingle()` SANS `limit` échouait dès qu'une société avait DEUX admins
      // (deux associés) : PostgREST refuse « plusieurs lignes pour un objet unique »,
      // l'erreur n'était pas lue, et le dossier de restitution partait SANS le RIB ni
      // le Kbis, en silence. Ordre explicite + limite : le résultat est désormais
      // stable et ne peut plus disparaître.
      //
      // Ce profil ne sert plus qu'à NOMMER le franchisé sur le document, et de repli
      // pour les sociétés qui n'ont pas encore leurs propres fichiers (bloc suivant).
      const { data: adminProfil } = await getSupabaseAdmin()
        .from('profiles')
        .select('id, prenom, nom, rib_url, kbis_url')
        .eq('societe_id', dossier.societe_id)
        .eq('role', 'admin')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      // Les documents d'ENTREPRISE sont lus sur la SOCIÉTÉ, plus sur une personne :
      // un RIB de franchise ne doit dépendre ni du nombre d'associés, ni de qui a
      // cliqué sur le bouton. Repli sur le profil de l'admin le plus ancien tant que
      // la société n'a pas ses propres fichiers — aucun document ne se dégrade.
      const { data: societeDocs } = await getSupabaseAdmin()
        .from('societes').select('rib_url, kbis_url').eq('id', dossier.societe_id).maybeSingle()

      const adminFranchise = adminProfil ? {
        ...adminProfil,
        rib_url:  societeDocs?.rib_url  || adminProfil.rib_url  || null,
        kbis_url: societeDocs?.kbis_url || adminProfil.kbis_url || null,
      } : (societeDocs ? { id: null, prenom: null, nom: null, ...societeDocs } : null)

      // Les COMPTES RENDUS entrent dans l'empreinte : le résumé du projet imprimé en
      // tête du dossier est rédigé à partir d'eux (voir restitution.js). Ils étaient
      // lus par le générateur sans entrer dans l'empreinte — corriger un compte rendu
      // ne rafraîchissait donc pas le dossier en cache. (R11)
      const { data: crsEmpreinte } = await getSupabaseAdmin()
        .from('comptes_rendus').select('id, type_visite, contenu_final')
        .eq('dossier_id', dossierId).order('created_at')

      // Empreinte sur les MÉTADONNÉES uniquement (identifiants, chemins, montants,
      // dates) : il serait absurde de télécharger les photos pour décider s'il faut
      // les télécharger. Ajouter, retirer ou remplacer une photo change sa ligne en
      // base, donc l'empreinte. Les chemins des pièces jointes (RIB, Kbis, devis signé,
      // PV, facture) sont désormais horodatés à l'envoi : un fichier remplacé change de
      // chemin, donc d'empreinte. (R10)
      pdfBuffer = await avecCache(null, {
        dossier, devis: devisComplets || [], photos: photos || [],
        interventions: interventions || [], fichesTech: fichesTech || [],
        docsRestitution: docsRestitution || [], factures: factures || [],
        suiviFinancier: suiviFinancier || [], adminFranchise: adminFranchise || null,
        comptesRendus: crsEmpreinte || [],
      }, async () => {

      const photosWithBase64 = await Promise.all((photos || []).map(async (photo) => {
        try {
          const { data: fileData } = await getSupabaseAdmin().storage.from('photos').download(photo.url)
          if (fileData) {
            const b64 = await photoDataURL(Buffer.from(await fileData.arrayBuffer()))
            if (b64) return { ...photo, base64: b64 }
          }
        } catch {}
        return photo
      }))

      return await buildDossierSuivi({
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
        supabaseAdmin: getSupabaseAdmin(),
      })
      })

    } else if (type === 'cr') {
      if (!crId) return NextResponse.json({ error: 'crId manquant' }, { status: 400 })
      const { data: crData } = await getSupabaseAdmin().from('comptes_rendus').select('*').eq('id', crId).single()
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

      // Photos jointes au CR (photos du chantier UNIQUEMENT — jamais les photos ordi,
      // qui restent dans photos_paths comme contexte IA). Même patron que
      // photosWithBase64 (:526), mais source = cr.photos_jointes, sans toucher la maquette.
      // Map chemin → id de photo (photos.id) : le repère [[photo:ID]] du texte référence
      // l'id STABLE, mais photos_jointes stocke les chemins → on résout ici.
      const { data: photosDossier } = await getSupabaseAdmin()
        .from('photos').select('id, url').eq('dossier_id', dossierId)
      const idParChemin = new Map((photosDossier || []).map(p => [p.url, p.id]))

      // Empreinte sur les métadonnées : contenu du CR, dossier, et la LISTE des photos
      // jointes (chemins). Le téléchargement des photos est la partie coûteuse — il
      // passe donc à l'intérieur de la fabrication, après la décision de cache.
      //
      // La correspondance chemin → id entre AUSSI dans l'empreinte : les repères
      // [[photo:ID]] du texte pointent sur l'id de la photo, pas sur son chemin. Une
      // photo recréée au même chemin change d'id et disparaissait du corps du compte
      // rendu, sans que l'empreinte bouge. (R11)
      pdfBuffer = await avecCache(crId,
        {
          dossier, cr, sections,
          photos: crData.photos_jointes || [],
          reperes: (photosDossier || []).map(p => [p.url, p.id]).sort(),
        },
        async () => {

      const photosJointes = await Promise.all((crData.photos_jointes || []).map(async (path) => {
        const id = idParChemin.get(path) ?? null
        try {
          const { data: fileData } = await getSupabaseAdmin().storage.from('photos').download(path)
          if (fileData) {
            const b64 = await photoDataURL(Buffer.from(await fileData.arrayBuffer()))
            if (b64) return { id, path, base64: b64 }
          }
        } catch {}
        return { id, path }
      }))

      return await renderToBuffer(buildCRDocument({ dossier, cr, sections, logo: getLogoBase64(), photos: photosJointes }))
      })

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
      const { data: fileData, error: dlErr } = await getSupabaseAdmin().storage
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
      const devisNom = `Devis_${nomFichierClient(dossier)}_${devisCible.artisan?.entreprise || 'artisan'}.${ext || 'pdf'}`
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
    const nomFich = nomFichierClient(dossier)
    const filename =
      type === 'recapitulatif_prev' ? `Recap_Financier_${nomFich}.pdf`
      : type === 'recapitulatif' ? `Suivi_Financier_${nomFich}.pdf`
      : type === 'dossier_suivi' ? `DossierSuivi_${nomFich}.pdf`
      : type === 'cr' ? `${crDateStr ? crDateStr + '_' : ''}CR_${nomFich}.pdf`
      : `Dossier_${nomFich}.pdf`

    // En-tête robuste aux accents/espaces : fallback ASCII + version UTF-8 (RFC 5987).
    const asciiName = filename.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')
    // En-tête de diagnostic : « cache » si le document a été servi tel quel,
    // « genere » s'il vient d'être fabriqué. Visible dans l'onglet Réseau du
    // navigateur — c'est ce qui permet de VÉRIFIER que le cache fonctionne, au lieu
    // de le supposer parce que ça semble plus rapide.
    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'X-Document-Source': servisDuCache ? 'cache' : 'genere',
      },
    })
  } catch (err) {
    console.error('PDF generation error:', err)
    return NextResponse.json({ error: err.message || 'Erreur PDF' }, { status: 500 })
  }
}