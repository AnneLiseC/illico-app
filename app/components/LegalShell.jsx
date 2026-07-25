// app/components/LegalShell.jsx
// Coquille visuelle des pages légales PUBLIQUES (/confidentialite, /cgu). Composant
// SERVEUR (aucun hook) → le contenu est dans le HTML initial, donc crawlable par Google
// (important : Google vérifie l'existence réelle de ces pages lors de la validation OAuth).

import Link from 'next/link'

export default function LegalShell({ title, maj, children, autreLien }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f6f8fa', padding: '40px 20px' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: '#00578e', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800 }}>Ba</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>Batilis</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '32px 34px' }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827', margin: '0 0 4px' }}>{title}</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 22px' }}>Dernière mise à jour : {maj}</p>
          <div className="legal-content">{children}</div>
        </div>
        <div style={{ display: 'flex', gap: 18, justifyContent: 'center', flexWrap: 'wrap', marginTop: 20, fontSize: 13 }}>
          {autreLien}
          <Link href="/login" style={{ color: 'var(--ink-900)' }}>Retour à la connexion</Link>
        </div>
      </div>
    </div>
  )
}
