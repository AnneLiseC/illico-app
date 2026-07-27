// app/page.js
// Page d'accueil PUBLIQUE (racine /). Rendue côté serveur, sans authentification,
// donc crawlable par les robots (dont la validation OAuth de Google). Elle explique
// l'objet de l'application et affiche le nom exact « Batilis » — deux exigences de
// l'écran de consentement Google. La navbar est masquée sur '/' (cf. navbar.js) et la
// route est exemptée du guard onboarding (cf. onboarding-guard.js).
import Link from 'next/link'
import { EDITEUR } from './lib/legal'

export const metadata = {
  title: 'Batilis — Gestion pour courtiers et AMO en travaux',
  description:
    "Batilis est la plateforme de gestion pour les courtiers et assistants à maîtrise d'ouvrage en travaux : suivi des chantiers, artisans, devis, planning, finances et espace client.",
}

const FEATURES = [
  { t: 'Chantiers', d: "Centralisez chaque dossier : étapes, documents, devis, rapports de visite et photos au même endroit." },
  { t: 'Artisans & clients', d: 'Gérez vos contacts, vos artisans partenaires et le suivi de chaque particulier accompagné.' },
  { t: 'Devis & documents', d: "Générez récapitulatifs, suivis de règlement et dossiers de chantier en PDF, prêts à envoyer." },
  { t: 'Planning', d: 'Organisez visites techniques, rendez-vous et jalons de chantier dans un agenda unifié.' },
  { t: 'Finances', d: 'Suivez commissions, redevances et facturation, avec un compte de résultat toujours à jour.' },
  { t: 'Espace client', d: 'Offrez à chaque client un espace sécurisé pour suivre son projet, ses documents et échanger avec vous.' },
]

export default function Home() {
  return (
    <main style={{ minHeight: '100vh', background: '#fff', color: 'var(--ink-900)' }}>

      {/* ── Barre haute ── */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 28px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/logo_VF.png" alt="Logo Batilis" width={40} height={40} style={{ borderRadius: 10, display: 'block' }} />
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em' }}>Batilis</span>
        </div>
        <Link href="/login" style={{ background: 'var(--brand-700)', color: '#fff', textDecoration: 'none', padding: '10px 18px', borderRadius: 9, fontSize: 14, fontWeight: 700 }}>
          Se connecter
        </Link>
      </header>

      {/* ── Hero ── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '56px 28px 40px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--brand-700)', marginBottom: 16 }}>
          Espace pilotage agence
        </div>
        <h1 style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.12, margin: 0, maxWidth: 760 }}>
          Batilis — pilotez votre activité de courtage et d&apos;assistance à maîtrise d&apos;ouvrage en travaux.
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--ink-600)', marginTop: 20, maxWidth: 680 }}>
          Batilis réunit le suivi de vos chantiers, la gestion de vos artisans et clients, les devis,
          le planning, les finances et un espace client dédié — dans une seule application web, pensée
          pour les courtières et courtiers en travaux et les assistants à maîtrise d&apos;ouvrage (AMO).
        </p>
        <div style={{ marginTop: 28 }}>
          <Link href="/login" style={{ background: 'var(--brand-700)', color: '#fff', textDecoration: 'none', padding: '13px 24px', borderRadius: 10, fontSize: 15, fontWeight: 700, display: 'inline-block' }}>
            Accéder à mon espace →
          </Link>
        </div>
      </section>

      {/* ── Fonctionnalités ── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 28px 48px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
          {FEATURES.map((f) => (
            <div key={f.t} style={{ border: '1px solid var(--ink-100)', borderRadius: 14, padding: '22px 22px' }}>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>{f.t}</div>
              <div style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--ink-600)' }}>{f.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Intégrations (justifie l'accès Google Drive / Microsoft auprès du relecteur OAuth) ── */}
      <section style={{ background: 'var(--brand-50)', borderTop: '1px solid var(--ink-100)', borderBottom: '1px solid var(--ink-100)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 28px' }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em', margin: '0 0 12px' }}>
            Connecté à vos outils
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink-700)', maxWidth: 760, margin: 0 }}>
            Avec votre autorisation, Batilis se connecte à votre <strong>Google Drive</strong> ou à votre
            <strong> Microsoft OneDrive</strong> pour classer automatiquement les documents de chantier —
            devis, rapports de visite et photos — dans une arborescence de dossiers dédiée à chaque client
            et chaque chantier. Vos fichiers restent chez vous, dans votre propre espace de stockage ;
            Batilis n&apos;y accède que pour y déposer et organiser les documents que vous générez dans
            l&apos;application. Vous pouvez révoquer cet accès à tout moment.
          </p>
        </div>
      </section>

      {/* ── Pied de page ── */}
      <footer style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 28px 48px', fontSize: 13, color: 'var(--ink-500)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            © {new Date().getFullYear()} Batilis · {EDITEUR.nom} · {EDITEUR.formeJuridique} · SIRET {EDITEUR.siret}
            <br />
            {EDITEUR.adresse} · <a href={`mailto:${EDITEUR.contactEmail}`} style={{ color: 'var(--ink-600)' }}>{EDITEUR.contactEmail}</a>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Link href="/confidentialite" style={{ color: 'var(--ink-700)' }}>Confidentialité</Link>
            <Link href="/cgu" style={{ color: 'var(--ink-700)' }}>Conditions d&apos;utilisation</Link>
          </div>
        </div>
      </footer>

    </main>
  )
}
