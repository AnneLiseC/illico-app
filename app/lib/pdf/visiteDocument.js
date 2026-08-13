// app/lib/pdf/visiteDocument.js
// Générateur PDF d'une VISITE de chantier (nouveau système « actions / levée de réserve »,
// Lot 3-1). Mise en page par défaut : en-tête, remarques générales, puis par lot ; chaque
// action = statut (pastille couleur + date), titre, texte, photos, checklist.
// buildVisiteDocument({ dossier, visite, generales, parLot, logo }) → élément @react-pdf.
// Registration des polices (fonts.js) et renderToBuffer à la charge de l'appelant.

import React from 'react'
import { Document, Page, Text, View, Image as PdfImage, StyleSheet } from '@react-pdf/renderer'
import { formatNomClient } from '../clients.js'

const BLEU = '#00578e'

// 16 statuts (mêmes clés que la table `actions`) → libellé + couleur + phrase datée.
const STATUTS = {
  en_cours: { l: 'En cours', c: '#dc2626', p: 'Créée le' },
  date_limite: { l: 'Date limite', c: '#dc2626', p: 'À réaliser avant le' },
  urgent: { l: 'Urgent', c: '#dc2626', p: 'Urgent depuis le' },
  refuse: { l: 'Refusé', c: '#dc2626', p: 'Refusé le' },
  en_retard: { l: 'En retard', c: '#dc2626', p: 'En retard depuis le' },
  rappel: { l: 'Rappel', c: '#dc2626', p: 'Rappel du' },
  en_attente: { l: 'En attente', c: '#d97706', p: 'En attente depuis le' },
  a_surveiller: { l: 'À surveiller', c: '#d97706', p: 'À surveiller depuis le' },
  programme: { l: 'Programmé', c: '#2563eb', p: 'Programmé le' },
  a_programmer: { l: 'À programmer', c: '#2563eb', p: 'À programmer pour le' },
  information: { l: 'Information', c: '#2563eb', p: 'Info du' },
  quitus_transmis: { l: 'Quitus transmis', c: '#16a34a', p: 'Quitus transmis le' },
  garder_memoire: { l: 'Garder pour mémoire', c: '#16a34a', p: 'Noté le' },
  constate: { l: 'Constaté', c: '#16a34a', p: 'Constaté le' },
  acte: { l: 'Acté', c: '#16a34a', p: 'Acté le' },
  cloture: { l: 'Clôturé', c: '#16a34a', p: 'Clôturé le' },
}
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : ''

const S = StyleSheet.create({
  page: { padding: 40, paddingBottom: 60, fontFamily: 'Roboto', fontSize: 9, backgroundColor: '#ffffff' },
  logoImg: { width: 120, height: 48, marginBottom: 12 },
  titleBlock: { marginBottom: 16, borderBottomWidth: 2, borderBottomColor: BLEU, paddingBottom: 10 },
  mainTitle: { fontSize: 16, fontFamily: 'Roboto-Bold', color: BLEU, marginBottom: 3 },
  sub: { fontSize: 9, color: '#374151', marginBottom: 1 },
  emis: { fontSize: 8.5, color: '#6b7280' },
  secHeader: { fontSize: 11, fontFamily: 'Roboto-Bold', color: BLEU, marginTop: 12, marginBottom: 6, borderBottomWidth: 1.2, borderBottomColor: BLEU, paddingBottom: 3 },
  lotHeader: { fontSize: 10, fontFamily: 'Roboto-Bold', color: '#111827', marginTop: 8, marginBottom: 4, backgroundColor: '#f3f4f6', padding: 4 },
  action: { marginBottom: 8, borderLeftWidth: 3, paddingLeft: 8, paddingVertical: 2 },
  actionHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  num: { fontSize: 8.5, fontFamily: 'Roboto-Bold', color: '#6b7280', marginRight: 6 },
  statut: { fontSize: 8.5, fontFamily: 'Roboto-Bold', marginRight: 6 },
  statutDate: { fontSize: 8, color: '#6b7280' },
  titre: { fontSize: 9.5, fontFamily: 'Roboto-Bold', color: '#111827', marginBottom: 1 },
  texte: { fontSize: 9, color: '#1f2937', lineHeight: 1.5, marginBottom: 3 },
  photosRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 3 },
  photo: { width: 120, height: 90, objectFit: 'cover', marginRight: 6, marginBottom: 6, borderRadius: 3 },
  checkRow: { flexDirection: 'row', marginBottom: 1 },
  checkBox: { fontSize: 8.5, marginRight: 4 },
  checkTxt: { fontSize: 8.5, color: '#374151', flex: 1 },
  vide: { fontSize: 8.5, color: '#9ca3af', fontStyle: 'italic', marginBottom: 4 },
  footer: { position: 'absolute', bottom: 22, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 5 },
  footerTxt: { fontSize: 7.5, color: '#6b7280' },
})

const CLOTURANTS = new Set(['cloture', 'quitus_transmis'])

function ActionBlock(action, opts) {
  const st = STATUTS[action.statut] || STATUTS.en_cours
  const barre = opts.barrerCloturees && CLOTURANTS.has(action.statut)
  const txtStyle = barre ? [S.texte, { textDecoration: 'line-through', color: '#9ca3af' }] : S.texte
  const titreStyle = barre ? [S.titre, { textDecoration: 'line-through', color: '#9ca3af' }] : S.titre
  return React.createElement(View, { style: [S.action, { borderLeftColor: st.c }], wrap: false, key: action.id },
    React.createElement(View, { style: S.actionHead },
      React.createElement(Text, { style: S.num }, action.numero || ''),
      React.createElement(Text, { style: [S.statut, { color: st.c }] }, st.l),
      React.createElement(Text, { style: S.statutDate }, `${st.p} ${fmtDate(action.statut_date)}`),
    ),
    action.titre ? React.createElement(Text, { style: titreStyle }, action.titre) : null,
    action.texte ? React.createElement(Text, { style: txtStyle }, action.texte) : null,
    (opts.photos && action.photosB64 && action.photosB64.length)
      ? React.createElement(View, { style: S.photosRow }, action.photosB64.map((src, i) => React.createElement(PdfImage, { key: i, src, style: S.photo })))
      : null,
    (opts.checklist && action.checklist && action.checklist.length)
      ? React.createElement(View, {}, action.checklist.map((it, i) => React.createElement(View, { key: i, style: S.checkRow },
          React.createElement(Text, { style: [S.checkBox, { color: it.checked ? '#16a34a' : '#9ca3af' }] }, it.checked ? '[x]' : '[ ]'),
          React.createElement(Text, { style: S.checkTxt }, it.label),
        )))
      : null,
  )
}

// opts : { generales, parLot, photos, checklist, barrerCloturees } (chapitres à afficher).
export function buildVisiteDocument({ dossier, visite, generales = [], parLot = [], logo, opts = {} }) {
  const O = { generales: true, parLot: true, photos: true, checklist: true, barrerCloturees: false, ...opts }
  const client = dossier?.client
  const nomClient = formatNomClient(client, { civilite: true, withRepresentant: true })
  const ref = dossier?.referente
  const agence = dossier?.agence?.nom || ''
  const dateVisite = visite?.date_visite ? new Date(visite.date_visite).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

  return React.createElement(Document, {},
    React.createElement(Page, { size: 'A4', style: S.page },
      logo ? React.createElement(PdfImage, { src: logo, style: S.logoImg }) : null,
      React.createElement(View, { style: S.titleBlock },
        React.createElement(Text, { style: S.mainTitle }, `COMPTE-RENDU DE VISITE ${visite?.numero_visite || ''}`.trim()),
        nomClient ? React.createElement(Text, { style: S.sub }, nomClient) : null,
        client?.adresse ? React.createElement(Text, { style: S.sub }, client.adresse) : null,
        React.createElement(Text, { style: S.emis }, `${dateVisite ? 'Visite du ' + dateVisite : ''}${ref ? '   ·   ' + ref.prenom + ' ' + ref.nom : ''}`),
      ),

      O.generales ? React.createElement(Text, { style: S.secHeader }, 'Remarques générales') : null,
      O.generales ? (generales.length ? generales.map(a => ActionBlock(a, O)) : React.createElement(Text, { style: S.vide }, 'Aucune remarque générale.')) : null,

      O.parLot ? React.createElement(Text, { style: S.secHeader }, 'Par lot / artisan') : null,
      O.parLot ? (parLot.length
        ? parLot.map((grp, i) => React.createElement(View, { key: i },
            React.createElement(Text, { style: S.lotHeader }, grp.lotNom || 'Sans lot'),
            grp.actions.map(a => ActionBlock(a, O)),
          ))
        : React.createElement(Text, { style: S.vide }, 'Aucune remarque par lot.')) : null,

      React.createElement(View, { style: S.footer, fixed: true },
        React.createElement(Text, { style: S.footerTxt }, agence || 'illiCO travaux'),
        React.createElement(Text, { style: S.footerTxt, render: ({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}` }),
      ),
    ),
  )
}
