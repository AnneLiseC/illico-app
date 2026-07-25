// app/confidentialite/page.js — Politique de confidentialité (PUBLIQUE).
// Page serveur (crawlable). Contenu = document fourni par l'éditrice ; les mentions
// variables (identité, durées) viennent de lib/legal.js.

import LegalShell from '../components/LegalShell'
import Link from 'next/link'
import { EDITEUR, MAJ_DATE, DUREES } from '../lib/legal'

export const metadata = {
  title: 'Politique de confidentialité — Batilis',
  description: 'Politique de confidentialité et protection des données personnelles de l\'application Batilis (RGPD).',
}

export default function Confidentialite() {
  return (
    <LegalShell
      title="Politique de confidentialité"
      maj={MAJ_DATE}
      autreLien={<Link href="/cgu" style={{ color: 'var(--ink-900)' }}>Conditions d’utilisation</Link>}
    >
      <p><strong>Éditrice de l’application :</strong> {EDITEUR.nom} — {EDITEUR.formeJuridique}, {EDITEUR.adresse}, SIRET {EDITEUR.siret}.<br />
        <strong>Contact protection des données :</strong> <a href={`mailto:${EDITEUR.contactEmail}`}>{EDITEUR.contactEmail}</a></p>

      <p>La présente politique est établie conformément au Règlement général sur la protection des données (Règlement (UE) 2016/679, dit « RGPD ») et à la loi n° 78-17 du 6 janvier 1978 relative à l’informatique, aux fichiers et aux libertés (dite « Loi Informatique et Libertés »), modifiée.</p>

      <h2>1. Objet et périmètre</h2>
      <p>Batilis est une application de gestion destinée aux professionnels du courtage et de l’assistance à maîtrise d’ouvrage dans le secteur de la rénovation (ci-après « les utilisateurs professionnels »). La présente politique décrit la manière dont Batilis, en tant que responsable de traitement, traite les données personnelles des utilisateurs professionnels eux-mêmes (titulaires de comptes) dans le cadre de la fourniture et de la facturation du service.</p>
      <p><strong>Répartition des rôles :</strong></p>
      <ul>
        <li>Pour les données des comptes utilisateurs et la facturation du service, Batilis est <strong>responsable de traitement</strong> — c’est l’objet de la présente politique.</li>
        <li>Pour les données des clients finaux et artisans saisies par les utilisateurs professionnels dans le cadre de leur propre activité, l’utilisateur professionnel (ou son organisation) est responsable de traitement, et Batilis agit comme <strong>sous-traitant</strong>. Ce traitement est encadré par un contrat de sous-traitance distinct (DPA).</li>
      </ul>

      <h2>2. Données traitées (en tant que responsable)</h2>
      <table>
        <thead><tr><th>Catégorie</th><th>Données concernées</th></tr></thead>
        <tbody>
          <tr><td>Identité</td><td>Nom, prénom, civilité</td></tr>
          <tr><td>Coordonnées</td><td>Adresse e-mail, numéro de téléphone</td></tr>
          <tr><td>Données de connexion</td><td>Adresse e-mail et mot de passe (chiffré/haché), dates de connexion — gérés par le service d’authentification Supabase</td></tr>
          <tr><td>Données contractuelles et financières</td><td>Coordonnées bancaires (RIB/IBAN via document justificatif), part/rémunération paramétrée, redevance mensuelle, dates de début de contrat</td></tr>
          <tr><td>Documents justificatifs</td><td>Extrait Kbis, RIB (fichiers stockés)</td></tr>
          <tr><td>Préférences</td><td>Paramètres de notification, rôle, statut d’accès</td></tr>
        </tbody>
      </table>
      <p>Aucune donnée relevant des catégories particulières (article 9 du RGPD : santé, opinions politiques, religion, etc.) n’est collectée intentionnellement.</p>

      <h2>3. Finalités et bases légales</h2>
      <table>
        <thead><tr><th>Finalité</th><th>Base légale (art. 6 RGPD)</th></tr></thead>
        <tbody>
          <tr><td>Création et gestion des comptes utilisateurs</td><td>Exécution du contrat (art. 6.1.b)</td></tr>
          <tr><td>Fourniture des fonctionnalités de l’application</td><td>Exécution du contrat (art. 6.1.b)</td></tr>
          <tr><td>Facturation du service et suivi des redevances</td><td>Exécution du contrat + obligation légale comptable (art. 6.1.b et 6.1.c)</td></tr>
          <tr><td>Gestion de la relation commerciale et support</td><td>Intérêt légitime (art. 6.1.f)</td></tr>
          <tr><td>Sécurité de l’application et prévention des accès frauduleux</td><td>Intérêt légitime (art. 6.1.f)</td></tr>
          <tr><td>Respect des obligations légales et comptables</td><td>Obligation légale (art. 6.1.c)</td></tr>
        </tbody>
      </table>

      <h2>4. Destinataires des données</h2>
      <p>Les données des utilisateurs professionnels sont accessibles à l’éditrice de Batilis, dans la stricte mesure nécessaire à la fourniture et à la facturation du service, ainsi qu’aux sous-traitants techniques listés à la section 6. Les données ne sont ni vendues, ni louées, ni cédées à des tiers à des fins commerciales.</p>

      <h2>5. Durées de conservation</h2>
      <table>
        <thead><tr><th>Donnée</th><th>Durée</th></tr></thead>
        <tbody>
          <tr><td>Compte utilisateur actif</td><td>Pendant toute la durée de la relation contractuelle</td></tr>
          <tr><td>Compte après résiliation</td><td>{DUREES.compteApresResiliation}</td></tr>
          <tr><td>Données de facturation</td><td>Conservées 10 ans au titre des obligations comptables et fiscales</td></tr>
          <tr><td>Documents justificatifs (Kbis, RIB)</td><td>Durée de la relation contractuelle + délai légal applicable</td></tr>
          <tr><td>Journaux de connexion</td><td>{DUREES.journauxConnexion}</td></tr>
        </tbody>
      </table>

      <h2>6. Hébergement et sous-traitants techniques</h2>
      <table>
        <thead><tr><th>Prestataire</th><th>Rôle</th><th>Localisation</th><th>Encadrement</th></tr></thead>
        <tbody>
          <tr><td>Supabase</td><td>Base de données, authentification, stockage de fichiers et envoi d’e-mails d’authentification</td><td>Union européenne (Irlande, région eu-west-1)</td><td>Données au repos dans l’UE</td></tr>
          <tr><td>Vercel</td><td>Hébergement et exécution de l’application</td><td>États-Unis (fonctions serveur) ; diffusion majoritairement depuis Paris</td><td>Transfert hors UE encadré par un DPA et les Clauses Contractuelles Types de la Commission européenne</td></tr>
          <tr><td>Anthropic (Claude)</td><td>Génération assistée de comptes-rendus et de courriers</td><td>Traitement via l’API du prestataire</td><td>Encadré par l’accord de traitement des données du prestataire ; option de non-conservation des données activable</td></tr>
          <tr><td>Google / Microsoft (le cas échéant)</td><td>Synchronisation de calendrier et de drive, à l’activation par l’utilisateur</td><td>Selon les services du prestataire</td><td>Encadré par les accords de traitement des prestataires ; jetons d’accès chiffrés au repos</td></tr>
        </tbody>
      </table>

      <h2>7. Sécurité</h2>
      <ul>
        <li><strong>Cloisonnement strict par organisation</strong> : chaque utilisateur n’accède qu’aux données de sa propre structure, via un mécanisme de sécurité au niveau de la base de données (Row-Level Security) appliqué sur l’ensemble des tables.</li>
        <li><strong>Chiffrement des secrets d’accès</strong> : les secrets permettant l’accès aux calendriers et drives connectés (mots de passe d’application CalDAV, jetons d’accès Google/Microsoft) sont chiffrés au repos (AES-256-GCM), protégés par le cloisonnement base de données et un accès restreint.</li>
        <li><strong>Authentification sécurisée</strong> : mots de passe hachés, gestion des accès par rôle.</li>
        <li><strong>Contrôle des accès</strong> : chaque compte dispose d’un rôle déterminant ses droits ; les comptes peuvent être désactivés.</li>
      </ul>

      <h2>8. Vos droits</h2>
      <p>Conformément au RGPD et à la Loi Informatique et Libertés, vous disposez des droits d’accès, de rectification, d’effacement (« droit à l’oubli »), de limitation, d’opposition, de portabilité, de retrait du consentement à tout moment, ainsi que du droit de définir des directives relatives au sort de vos données après votre décès (article 85 de la Loi Informatique et Libertés).</p>
      <p><strong>Pour exercer vos droits :</strong> adressez votre demande à <a href={`mailto:${EDITEUR.contactEmail}`}>{EDITEUR.contactEmail}</a>. Une pièce justificative d’identité peut être demandée en cas de doute raisonnable. Une réponse vous sera apportée dans un délai d’un mois (prolongeable de deux mois en cas de demande complexe).</p>
      <p><strong>Réclamation :</strong> si, après nous avoir contactés, vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la CNIL — 3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07 — <a href="https://www.cnil.fr" target="_blank" rel="noreferrer">www.cnil.fr</a>.</p>

      <h2>9. Cookies, traceurs et mesure d’audience</h2>
      <p>Batilis utilise des cookies strictement nécessaires à son fonctionnement (authentification, maintien de la session). Indispensables à la fourniture du service, ils ne requièrent pas de consentement préalable au sens de la Loi Informatique et Libertés.</p>
      <p>Batilis utilise également des outils de mesure d’audience et de performance technique fournis par Vercel (Analytics et Speed Insights), sans cookie de suivi et sur la base de données agrégées et anonymisées (pas d’identifiant persistant, pas de suivi individuel). À ce titre, ils relèvent des solutions exemptées de consentement selon les recommandations de la CNIL. Batilis ne dépose pas de cookies publicitaires ni de traceurs de profilage, et ne revend aucune donnée de navigation.</p>

      <h2>10. Délégué à la protection des données (DPO)</h2>
      <p>La désignation d’un DPO n’est pas obligatoire pour Batilis au regard de son activité (absence de traitement à grande échelle de données sensibles ou de suivi systématique à grande échelle). Le contact pour toute question relative aux données personnelles reste : <a href={`mailto:${EDITEUR.contactEmail}`}>{EDITEUR.contactEmail}</a>.</p>

      <h2>11. Modifications</h2>
      <p>Cette politique peut être mise à jour. La date de dernière mise à jour figure en tête de page. Les utilisateurs sont informés de toute modification substantielle ; un historique des versions est conservé.</p>
    </LegalShell>
  )
}
