// app/cgu/page.js — Conditions générales d’utilisation (PUBLIQUES).
// Rédigé pour Batilis. ⚠️ À faire relire par un conseil juridique avant publication
// (comme les autres documents légaux). Identité éditrice = lib/legal.js.

import LegalShell from '../components/LegalShell'
import Link from 'next/link'
import { EDITEUR, MAJ_DATE, APP_URL } from '../lib/legal'

export const metadata = {
  title: 'Conditions d’utilisation — Batilis',
  description: 'Conditions générales d’utilisation de l’application Batilis.',
}

export default function CGU() {
  return (
    <LegalShell
      title="Conditions générales d’utilisation"
      maj={MAJ_DATE}
      autreLien={<Link href="/confidentialite" style={{ color: 'var(--ink-900)' }}>Politique de confidentialité</Link>}
    >
      <p>Les présentes conditions générales d’utilisation (« CGU ») régissent l’accès et l’utilisation de l’application <strong>Batilis</strong>, accessible à l’adresse <a href={APP_URL}>{APP_URL}</a> (« l’Application »). En créant un compte ou en utilisant l’Application, l’utilisateur accepte sans réserve les présentes CGU.</p>

      <h2>1. Éditeur</h2>
      <p>L’Application est éditée par {EDITEUR.nom} — {EDITEUR.formeJuridique}, {EDITEUR.adresse}, SIRET {EDITEUR.siret}. Contact : <a href={`mailto:${EDITEUR.contactEmail}`}>{EDITEUR.contactEmail}</a>. Hébergement : Vercel Inc. et Supabase (voir la <Link href="/confidentialite">politique de confidentialité</Link> pour le détail des sous-traitants techniques).</p>

      <h2>2. Objet de l’Application</h2>
      <p>Batilis est un outil de gestion destiné aux professionnels du courtage en travaux et de l’assistance à maîtrise d’ouvrage : suivi des chantiers, des devis et des artisans, génération de documents et de rapports de visite, facturation et suivi financier, espace de partage avec les clients finaux. L’Application est un outil de productivité : elle ne fournit aucun conseil juridique, financier ou d’assurance, et ne se substitue pas au jugement professionnel de l’utilisateur.</p>

      <h2>3. Accès et inscription</h2>
      <p>L’accès à l’Application est réservé aux professionnels disposant d’un compte, créé sur invitation. Chaque utilisateur s’engage à fournir des informations exactes et à les tenir à jour. Les identifiants sont personnels et confidentiels ; l’utilisateur est responsable de leur conservation et de toute activité effectuée depuis son compte.</p>

      <h2>4. Comptes et rôles</h2>
      <p>L’Application distingue plusieurs rôles (administrateur/franchisé, agent, client final), chacun disposant de droits d’accès spécifiques. L’attribution des rôles relève de l’organisation de l’utilisateur professionnel. Un compte peut être désactivé en cas de fin de la relation contractuelle ou de manquement aux présentes CGU.</p>

      <h2>5. Obligations de l’utilisateur</h2>
      <ul>
        <li>Utiliser l’Application conformément à sa destination et à la réglementation en vigueur ;</li>
        <li>Ne pas tenter d’accéder à des données ou espaces auxquels il n’est pas autorisé, ni de contourner les mesures de sécurité ;</li>
        <li>Ne pas perturber le fonctionnement de l’Application (tests d’intrusion non autorisés, injection, surcharge, etc.) ;</li>
        <li>Ne saisir que des données qu’il est en droit de traiter, et respecter ses propres obligations RGPD à l’égard de ses clients et artisans (voir article 8) ;</li>
        <li>Ne pas verser dans l’Application de contenu illicite, diffamatoire ou portant atteinte aux droits de tiers.</li>
      </ul>

      <h2>6. Disponibilité et maintenance</h2>
      <p>L’éditrice s’efforce d’assurer la disponibilité de l’Application mais ne peut garantir un fonctionnement ininterrompu. Des interruptions peuvent survenir pour maintenance, mise à jour ou en raison de causes indépendantes de sa volonté (notamment défaillance des hébergeurs ou services tiers). L’Application peut évoluer : des fonctionnalités peuvent être ajoutées, modifiées ou retirées.</p>

      <h2>7. Propriété intellectuelle</h2>
      <p>L’Application, sa structure, son code, ses interfaces et ses éléments graphiques sont la propriété de l’éditrice et sont protégés par le droit de la propriété intellectuelle. Les présentes CGU ne confèrent aucun droit de propriété sur l’Application, mais un simple droit d’usage personnel, non exclusif et non cessible, pour la durée de la relation contractuelle. Les données et documents saisis par l’utilisateur restent sa propriété.</p>

      <h2>8. Données personnelles</h2>
      <p>Le traitement des données personnelles des <strong>titulaires de comptes</strong> est décrit dans la <Link href="/confidentialite">politique de confidentialité</Link>, Batilis agissant alors comme responsable de traitement. Pour les données des <strong>clients finaux et artisans</strong> saisies par l’utilisateur professionnel, celui-ci est responsable de traitement et Batilis agit comme sous-traitant : ce traitement est encadré par un contrat de sous-traitance (DPA, article 28 du RGPD) mis à disposition dans l’Application.</p>

      <h2>9. Tarifs</h2>
      <p>Les conditions financières (redevances, parts, facturation du service) sont définies dans le contrat de service conclu séparément entre l’éditrice et l’utilisateur professionnel. Les présentes CGU ne valent pas offre tarifaire.</p>

      <h2>10. Responsabilité</h2>
      <p>L’Application est fournie « en l’état ». L’éditrice ne saurait être tenue responsable des dommages indirects, ni des conséquences des décisions prises par l’utilisateur sur la base des informations ou documents produits via l’Application. L’utilisateur demeure seul responsable de l’exactitude des données qu’il saisit, du respect de ses obligations professionnelles et réglementaires, et de la vérification des documents générés avant leur usage ou leur envoi. La responsabilité de l’éditrice, si elle était engagée, serait limitée au montant des sommes versées pour le service au cours des douze derniers mois.</p>

      <h2>11. Suspension et résiliation</h2>
      <p>L’éditrice peut suspendre ou clôturer un accès en cas de manquement grave aux présentes CGU, après information de l’utilisateur sauf urgence de sécurité. À la fin de la relation contractuelle, l’accès est désactivé et les données sont conservées puis supprimées ou anonymisées dans les conditions prévues par la politique de confidentialité.</p>

      <h2>12. Modification des CGU</h2>
      <p>Les présentes CGU peuvent être modifiées. La date de dernière mise à jour figure en tête de page ; les utilisateurs sont informés des modifications substantielles. La poursuite de l’utilisation vaut acceptation des CGU en vigueur.</p>

      <h2>13. Droit applicable et litiges</h2>
      <p>Les présentes CGU sont soumises au droit français. En cas de litige, et à défaut de résolution amiable, les tribunaux français compétents seront saisis conformément aux règles de droit commun.</p>
    </LegalShell>
  )
}
