'use client'

// Rendu markdown simplifié des comptes-rendus : titres `## N. Titre`,
// listes `- ` / `– `, `**gras**`, tableaux `| a | b |`, paragraphes.
// Parsing extrait tel quel de espace-client/page.js ; styles par variante :
// 'client' = classes Tailwind de l'espace client, 'staff' = cartes agente/admin.

const STYLES = {
  client: {
    titre: { className: 'font-bold text-blue-900 text-sm mt-4 mb-1 pb-1 border-b border-gray-100' },
    ul:    { className: 'list-disc list-inside space-y-1 ml-2 mb-3' },
    li:    { className: 'text-sm text-gray-700' },
    p:     { className: 'text-sm text-gray-700 mb-2 leading-relaxed' },
  },
  staff: {
    titre: { style: { fontWeight: 700, color: 'var(--ink-900)', fontSize: 13, margin: '14px 0 4px', paddingBottom: 4, borderBottom: '1px solid var(--ink-100)' } },
    ul:    { style: { listStyleType: 'disc', listStylePosition: 'inside', margin: '0 0 10px 8px', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 } },
    li:    { style: { fontSize: 13, color: 'var(--ink-700)', lineHeight: 1.55 } },
    p:     { style: { fontSize: 13, color: 'var(--ink-700)', margin: '0 0 8px', lineHeight: 1.55 } },
  },
}

const renderInline = (text) => {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return parts.map((part, i) => i % 2 === 1 ? <strong key={i}>{part}</strong> : part)
}

// Une ligne de tableau markdown : « | a | b | » → ['a', 'b'] (bords vides retirés).
const splitRow = (line) => {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map(c => c.trim())
}
const isTableRow = (line) => /\|/.test(line) && /^\s*\|?.*\|/.test(line.trim())
// Ligne de séparation d'entête : « | --- | :--: | » (tirets, deux-points, pipes).
const isTableSep = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)

export default function MarkdownCR({ text, variant = 'client' }) {
  if (!text) return null
  const S = STYLES[variant] || STYLES.client
  const staff = variant === 'staff'
  // Filet legacy : titre ## collé en milieu de ligne (CR antérieurs au fix d'assemblage).
  const lines = text.replace(/([^\n])(## \d+\.)/g, '$1\n\n$2').split('\n')
  const els = []
  let listItems = []
  const flushList = () => {
    if (!listItems.length) return
    els.push(<ul key={`l${els.length}`} {...S.ul}>{listItems.map((it, i) => <li key={i} {...S.li}>{renderInline(it)}</li>)}</ul>)
    listItems = []
  }

  const tableStyle = staff
    ? { width: '100%', borderCollapse: 'collapse', margin: '4px 0 12px', fontSize: 12.5 }
    : undefined
  const thStyle = staff
    ? { textAlign: 'left', padding: '6px 10px', background: 'var(--brand-50)', color: 'var(--brand-800)', fontWeight: 700, border: '1px solid var(--ink-200)', fontSize: 12 }
    : undefined
  const tdStyle = staff
    ? { padding: '6px 10px', border: '1px solid var(--ink-100)', color: 'var(--ink-700)', verticalAlign: 'top' }
    : undefined
  const tableCls = staff ? undefined : 'w-full border-collapse my-2 text-sm'
  const thCls = staff ? undefined : 'text-left px-2 py-1 bg-blue-50 text-blue-900 font-bold border border-gray-200'
  const tdCls = staff ? undefined : 'px-2 py-1 border border-gray-100 text-gray-700 align-top'

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Tableau : ligne pipe suivie d'une ligne de séparation → on avale tout le bloc.
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flushList()
      const header = splitRow(line)
      const rows = []
      let j = i + 2
      while (j < lines.length && isTableRow(lines[j]) && !isTableSep(lines[j])) {
        rows.push(splitRow(lines[j]))
        j++
      }
      els.push(
        <table key={`t${els.length}`} {...(staff ? { style: tableStyle } : { className: tableCls })}>
          <thead>
            <tr>{header.map((h, k) => <th key={k} {...(staff ? { style: thStyle } : { className: thCls })}>{renderInline(h)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {header.map((_, ci) => <td key={ci} {...(staff ? { style: tdStyle } : { className: tdCls })}>{renderInline(r[ci] || '')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )
      i = j - 1
      continue
    }
    const h = line.match(/^## +(?:\d+\.\s*)?(.+)/)
    if (h) { flushList(); els.push(<p key={i} {...S.titre}>{h[1].trim()}</p>); continue }
    if (line.match(/^[-–] /)) { listItems.push(line.slice(2)); continue }
    if (!line.trim()) { flushList(); continue }
    flushList()
    els.push(<p key={i} {...S.p}>{renderInline(line)}</p>)
  }
  flushList()
  return els
}
