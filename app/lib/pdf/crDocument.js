// app/lib/pdf/crDocument.js
// Générateur du document PDF « Compte-rendu » — EXTRAIT VERBATIM de app/api/pdf/route.js
// pour être réutilisable (route /api/pdf ET miroir OneDrive /api/drive/push-cr). Aucun
// changement de rendu : même fonction, même styles.
//
// buildCRDocument({ dossier, cr, sections, logo, photos }) → élément @react-pdf.
// La registration des polices (fonts.js) et le rendu (renderToBuffer) restent à la
// charge de l'appelant.

import React from 'react'
import { Document, Page, Text, View, Image as PdfImage, StyleSheet } from '@react-pdf/renderer'
import { formatNomClient } from '../clients.js'

const BLEU = '#00578e'

export function buildCRDocument({ dossier, cr, sections, logo, photos }) {
  const client = dossier.client
  const nomClient = formatNomClient(client, { civilite: true, withRepresentant: true })
  const ref = dossier.referente
  const nomRef = ref ? (ref.prenom + ' ' + ref.nom) : ''

  const TITRES = {
    r1: 'RAPPORT DE PREMIÈRE VISITE',
    r2: 'RAPPORT DE VISITE TECHNIQUE',
    r3: 'RAPPORT DE PRÉSENTATION DES DEVIS',
    suivi: 'RAPPORT DE SUIVI DE CHANTIER',
    reception: 'RAPPORT DE RÉCEPTION DE CHANTIER',
  }
  const titre = TITRES[cr.type_visite] || 'RAPPORT DE VISITE'
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

  // Tableaux markdown pipe : « | a | b | » + ligne de séparation « | --- | --- | ».
  const splitRow = (line) => {
    let s = line.trim()
    if (s.startsWith('|')) s = s.slice(1)
    if (s.endsWith('|')) s = s.slice(0, -1)
    return s.split('|').map(c => c.trim())
  }
  const isTableRow = (line) => /\|/.test(line) && line.trim().length > 0
  const isTableSep = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)
  const renderMdTable = (header, rows, key) => {
    const thStyle = { color: '#ffffff', fontSize: 8.5, fontFamily: 'Roboto-Bold', flex: 1, paddingHorizontal: 4 }
    const tdStyle = { fontSize: 8.5, color: '#1f2937', flex: 1, paddingHorizontal: 4 }
    return React.createElement(View, { key, style: { marginBottom: 8, marginTop: 4 }, wrap: true },
      React.createElement(View, { style: { flexDirection: 'row', backgroundColor: BLEU, paddingVertical: 4 } },
        ...header.map((h, i) => React.createElement(Text, { key: i, style: thStyle }, h)),
      ),
      ...rows.map((r, ri) =>
        React.createElement(View, { key: ri, style: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: ri % 2 === 0 ? '#f9fafb' : '#ffffff' } },
          ...header.map((_, ci) => React.createElement(Text, { key: ci, style: tdStyle }, inlineEl(r[ci] || ''))),
        )
      )
    )
  }

  const renderContent = (contenu, secTitre) => {
    if (!contenu) return { blocks: [], firstGroupable: true }
    const lines = contenu.split('\n').filter(l => l !== undefined)
    const isIdent = /identification/i.test(secTitre || '')
    const isPlanning = /planning/i.test(secTitre || '')
    const hasMdTable = lines.some((l, i) => isTableRow(l) && lines[i + 1] && isTableSep(lines[i + 1]))
    const kvLines = lines.filter(l => l.trim()).map(l => {
      const m = l.match(/^\*\*(.+?)\s*:\*\*\s*(.*)/) || l.match(/^\*\*(.+?):\s*\*\*(.*)/)
      return m ? [m[1].trim(), m[2].trim()] : null
    })
    const allKV = kvLines.length > 0 && kvLines.every(Boolean)
    // Les tableaux markdown priment sur le rendu clé/valeur automatique.
    if (!hasMdTable && isIdent && allKV) return { blocks: [renderKVTable(kvLines, 'Champ', 'Information', true)], firstGroupable: true }
    if (!hasMdTable && isPlanning && allKV) return { blocks: [renderKVTable(kvLines, 'Date', 'Interventions prévues')], firstGroupable: false }

    const blocks = []
    let listItems = []
    const flushList = () => {
      if (!listItems.length) return
      listItems.forEach(item =>
        blocks.push(React.createElement(View, { key: 'li' + blocks.length, style: CRS.listRow, wrap: false },
          React.createElement(Text, { style: CRS.listBullet }, '–'),
          React.createElement(Text, { style: CRS.listText }, inlineEl(item)),
        ))
      )
      listItems = []
    }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // Bloc tableau markdown : ligne pipe + ligne de séparation → avalé en entier.
      if (isTableRow(line) && lines[i + 1] && isTableSep(lines[i + 1])) {
        flushList()
        const header = splitRow(line)
        const rows = []
        let j = i + 2
        while (j < lines.length && isTableRow(lines[j]) && !isTableSep(lines[j])) {
          rows.push(splitRow(lines[j]))
          j++
        }
        blocks.push(renderMdTable(header, rows, 'tbl' + i))
        i = j - 1
        continue
      }
      const bullet = line.match(/^[-–]\s+(.+)/)
      if (bullet) { listItems.push(bullet[1]); continue }
      if (!line.trim()) { flushList(); continue }
      flushList()
      const subhead = line.match(/^\*\*(.+?)\s*:\*\*\s*$/) || line.match(/^\*\*(.+?):\s*\*\*\s*$/)
      if (subhead) {
        blocks.push(React.createElement(Text, { key: i, style: { fontSize: 9, fontFamily: 'Roboto-Bold', color: '#1f2937', marginTop: 6, marginBottom: 3 } }, subhead[1].trim() + ' :'))
        continue
      }
      blocks.push(React.createElement(Text, { key: i, style: CRS.para }, inlineEl(line.trim())))
    }
    flushList()
    return { blocks, firstGroupable: true }
  }

  const mkFooter = () => React.createElement(View, { style: CRS.footer, fixed: true },
    React.createElement(Text, { style: CRS.footerTxt }, 'Document établi le ' + dateEmis + ' – Chantier ' + nomClient),
    React.createElement(Text, { style: CRS.footerTxt }, nomRef + (dossier.agence?.nom ? ' – ' + dossier.agence.nom : '')),
    React.createElement(Text, { style: CRS.footerTxt, render: ({ pageNumber, totalPages }) => pageNumber + ' / ' + totalPages }),
  )

  const contentPage = React.createElement(Page, { size: 'A4', style: CRS.page },
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
        const outerStyle = i === 0 ? undefined : { marginTop: 14 }
        if (blocks.length && firstGroupable) {
          return React.createElement(View, { key: i, style: outerStyle },
            React.createElement(View, { key: 'g', wrap: false }, ...enTete, blocks[0]),
            ...blocks.slice(1),
          )
        }
        return React.createElement(View, { key: i, style: outerStyle },
          React.createElement(View, { key: 'g', minPresenceAhead: 60 }, ...enTete),
          ...blocks,
        )
      }),
      mkFooter(),
    )

  const photosOk = (photos || []).filter(p => p.base64)
  const photoPages = []
  for (let i = 0; i < photosOk.length; i += 2) {
    const chunk = photosOk.slice(i, i + 2)
    photoPages.push(
      React.createElement(Page, { key: `crphoto-${i}`, size: 'A4', style: CRS.page },
        logo && React.createElement(PdfImage, { src: logo, style: CRS.logoImg }),
        React.createElement(View, { style: CRS.titleBlock },
          React.createElement(Text, { style: CRS.mainTitle }, 'Photos'),
        ),
        React.createElement(View, { style: { flexDirection: 'column', flex: 1, justifyContent: 'flex-start', paddingBottom: 40 } },
          ...chunk.map(ph =>
            // Hauteur BORNÉE (pas de height:'100%' → sinon la 1re image déborde et
            // repousse la 2e sur une autre page). ~2 photos par page A4.
            React.createElement(View, { key: ph.path, style: { marginVertical: 4, alignItems: 'center' } },
              React.createElement(PdfImage, { src: ph.base64, style: { maxWidth: '100%', maxHeight: 300, objectFit: 'contain' } }),
            )
          ),
        ),
        mkFooter(),
      )
    )
  }

  return React.createElement(Document, null, contentPage, ...photoPages)
}
