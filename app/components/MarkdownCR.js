'use client'

// Rendu markdown simplifié des comptes-rendus : titres `## N. Titre`,
// listes `- ` / `– `, `**gras**`, paragraphes.
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

export default function MarkdownCR({ text, variant = 'client' }) {
  if (!text) return null
  const S = STYLES[variant] || STYLES.client
  // Filet legacy : titre ## collé en milieu de ligne (CR antérieurs au fix d'assemblage).
  const lines = text.replace(/([^\n])(## \d+\.)/g, '$1\n\n$2').split('\n')
  const els = []
  let listItems = []
  const flushList = () => {
    if (!listItems.length) return
    els.push(<ul key={`l${els.length}`} {...S.ul}>{listItems.map((it, i) => <li key={i} {...S.li}>{renderInline(it)}</li>)}</ul>)
    listItems = []
  }
  lines.forEach((line, i) => {
    const h = line.match(/^## +(?:\d+\.\s*)?(.+)/)
    if (h) { flushList(); els.push(<p key={i} {...S.titre}>{h[1].trim()}</p>); return }
    if (line.match(/^[-–] /)) { listItems.push(line.slice(2)); return }
    if (!line.trim()) { flushList(); return }
    flushList()
    els.push(<p key={i} {...S.p}>{renderInline(line)}</p>)
  })
  flushList()
  return els
}
