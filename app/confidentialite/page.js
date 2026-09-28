// app/confidentialite/page.js — Politique de confidentialité (PUBLIQUE).
// Page serveur (crawlable). Contenu aligné sur le document source « Politique de
// confidentialité Batilis » (version 24/09/2026) ; identité éditrice = lib/legal.js.

import LegalShell from '../components/LegalShell'
import Link from 'next/link'
import { EDITEUR, MAJ_CONF, DUREES } from '../lib/legal'

export const metadata = {
  title: 'Politique de confidentialité — Batilis',
  description: 'Politique de confidentialité et protection des données personnelles de l\'application Batilis (RGPD).',
}

export default function Confidentialite() {
  return (
    <LegalShell
      title="Politique de confidentialité"
      maj={MAJ_CONF}
      autreLien={<Link href="/cgu" style={{ color: 'var(--ink-900)' }}>Conditions d’utilisation</Link>}
    >
      <p><strong>Éditrice de l’application :</strong> {EDITEUR.nom} — {EDITEUR.formeJuridique}, {EDITEUR.adresse}, SIRET {EDITEUR.siret}.<br />
        <strong>Contact protection des données :</strong> <a href={`mailto:${EDITEUR.contactEmail}`}>{EDITEUR.contactEmail}</a></p>

      <p>La présente politique est établie conformément au Règlement général sur la protection des données (Règlement (UE) 2016/679, dit « RGPD ») et à la loi n° 78-17 du 6 janvier 1978 relative à l’informatique, aux fichiers et aux libertés (dite « Loi Informatique et Libertés »), modifiée.</p>

      <h2>1. Objet et périmètre</h2>
      <p>Batilis est une application de gestion destinée aux professionnels du courtage et de l’assistance à maîtrise d’ouvrage dans le secteur de la rénovation. La présente politique décrit la manière dont Batilis, en tant que responsable de traitement, traite les données des utilisateurs professionnels eux-mêmes (titulaires de comptes), pour la fourniture et la facturation du service.</p>
      <p>Elle ne couvre pas les données des clients finaux et des artisans saisies par ces professionnels dans le cadre de leur propre activité : sur celles-ci, le professionnel est responsable de traitement et Batilis agit comme <strong>sous-traitant</strong>, dans les conditions d’un contrat de sous-traitance distinct (DPA).</p>

      <h2>2. Données traitées</h2>
      <table>
        <thead><tr><th>Catégorie</th><th>Données concernées</th></tr></thead>
        <tbody>
          <tr><td>Identité</td><td>Nom, prénom, civilité</td></tr>
          <tr><td>Coordonnées</td><td>Adresse e-mail, numéro de téléphone</td></tr>
          <tr><td>Données de connexion</td><td>Adresse e-mail, mot de passe et dates de connexion, intégralement gérés par le service d’authentification Supabase Auth. Aucun mot de passe de compte n’est stocké ni manipulé par l’application, et aucun n’atteint une route serveur.</td></tr>
          <tr><td>Données contractuelles et financières</td><td>Part ou rémunération paramétrée, redevance mensuelle, dates de début de contrat.</td></tr>
          <tr><td>Coordonnées bancaires de l’abonnement</td><td>Aucune. Le mandat de prélèvement est signé directement chez le prestataire de paiement (section 6), seul détenteur de l’IBAN.</td></tr>
          <tr><td>Documents justificatifs</td><td>Extrait Kbis et relevé d’identité bancaire déposés par le professionnel. Ce RIB sert à une tout autre fin que l’abonnement : il est joint aux documents que le professionnel remet à ses propres clients, pour que ceux-ci le règlent.</td></tr>
          <tr><td>Préférences</td><td>Paramètres de notification, rôle, statut d’accès</td></tr>
        </tbody>
      </table>
      <p>Aucune donnée relevant des catégories particulières (article 9 du RGPD) n’est collectée intentionnellement.</p>

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

      <h2>4. Destinataires</h2>
      <p>Les données sont accessibles à l’éditrice, dans la stricte mesure nécessaire à la fourniture et à la facturation du service, et aux prestataires listés à la section 6. Elles ne sont ni vendues, ni louées, ni cédées à des tiers à des fins commerciales, et ne servent à l’entraînement d’aucun modèle d’intelligence artificielle.</p>

      <h2>5. Durées de conservation</h2>
      <table>
        <thead><tr><th>Donnée</th><th>Durée de conservation</th></tr></thead>
        <tbody>
          <tr><td>Compte utilisateur actif</td><td>Durée de la relation contractuelle</td></tr>
          <tr><td>Compte après résiliation</td><td>{DUREES.compteApresResiliation}</td></tr>
          <tr><td>Données de facturation</td><td>10 ans à compter de la clôture de l’exercice, au titre des obligations comptables (article L. 123-22 du code de commerce)</td></tr>
          <tr><td>Documents justificatifs (Kbis, RIB déposé)</td><td>Durée de la relation, puis 10 ans pour les pièces rattachées à une facture</td></tr>
          <tr><td>Mandat de prélèvement et coordonnées bancaires</td><td>Non conservés par Batilis. Détenus par le prestataire de paiement, qui applique ses propres durées, non publiées.</td></tr>
          <tr><td>Journaux de connexion et journaux techniques</td><td>Batilis ne tient pas de journal qui lui soit propre. Les journaux d’authentification et d’exécution sont conservés par les hébergeurs selon le plan souscrit, sans exploitation au-delà du diagnostic technique. Objectif retenu : ne pas dépasser 6 mois.</td></tr>
          <tr><td>Sauvegardes de la base de données</td><td>7 jours glissants chez l’hébergeur, effacées par rotation</td></tr>
        </tbody>
      </table>

      <h2>6. Hébergement et prestataires</h2>
      <table>
        <thead><tr><th>Prestataire</th><th>Rôle</th><th>Localisation des données</th><th>Encadrement</th></tr></thead>
        <tbody>
          <tr><td>Supabase</td><td>Base de données, authentification, stockage des fichiers</td><td>Union européenne — Irlande (eu-west-1)</td><td>Sous-traitant. Données au repos dans l’UE ; accord de traitement applicable de plein droit</td></tr>
          <tr><td>Vercel</td><td>Hébergement et exécution de l’application</td><td>Exécution en France (cdg1) ; société de droit américain</td><td>Sous-traitant. Accord de traitement de plein droit avec Clauses Contractuelles Types ; certification EU-U.S. Data Privacy Framework</td></tr>
          <tr><td>Resend</td><td>Envoi des e-mails émis par l’application</td><td>États-Unis pour le traitement principal</td><td>Sous-traitant. Accord de traitement de plein droit avec Clauses Contractuelles Types</td></tr>
          <tr><td>Anthropic (Claude)</td><td>Génération assistée de comptes rendus, courriers et suggestions (actions, lots), extraction de données</td><td>API du prestataire ; société de droit américain</td><td>Sous-traitant. Accord de traitement de plein droit ; aucune utilisation pour l’entraînement de modèles ; non-conservation en cours de demande</td></tr>
          <tr><td>Deepgram</td><td>Transcription des enregistrements audio de visite</td><td>Union européenne — point d’accès régional, sans redirection hors région</td><td>Sous-traitant. Requêtes émises avec exclusion du programme d’amélioration des modèles : aucune conservation de l’audio ni du transcrit, aucun entraînement ; métadonnées d’usage 90 jours. Accord de traitement à formaliser</td></tr>
          <tr><td>GoCardless</td><td>Signature du mandat et prélèvement de l’abonnement Batilis. N’a accès à aucune donnée des clients finaux ni des artisans du professionnel</td><td>GoCardless SAS, Paris, pour le contrat ; données traitées majoritairement au Royaume-Uni</td><td>Responsable de traitement distinct, et non sous-traitant. Transfert couvert par la décision d’adéquation en faveur du Royaume-Uni, renouvelée le 21/12/2025</td></tr>
          <tr><td>Microsoft (le cas échéant)</td><td>OneDrive, calendrier Outlook, envoi d’e-mails en repli</td><td>Union européenne / États-Unis selon le service</td><td>Sous-traitant. Data Protection Addendum applicable de plein droit ; jetons chiffrés au repos</td></tr>
          <tr><td>Google (le cas échéant)</td><td>Calendrier, rangement de documents (Drive)</td><td>Services Google</td><td>Sous-traitant. Accès accordé par l’utilisateur au moyen de son propre compte ; jetons chiffrés au repos</td></tr>
          <tr><td>Apple / iCloud (le cas échéant)</td><td>Synchronisation de calendrier</td><td>Services Apple</td><td>Sous-traitant. Mot de passe d’application généré et révocable par l’utilisateur, chiffré au repos</td></tr>
        </tbody>
      </table>
      <p><strong>Transfert hors Union européenne.</strong> Le stockage — base, authentification, documents et photos — a lieu en Irlande, et l’exécution de l’application est configurée en France. Les transferts hors UE se limitent à l’envoi des e-mails, à l’assistance à la rédaction, à l’encaissement de l’abonnement (Royaume-Uni, sous décision d’adéquation) et aux services Microsoft, Google ou Apple que l’utilisateur choisit de connecter. La transcription des enregistrements audio n’en fait pas partie : elle emprunte le point d’accès européen du prestataire. Vercel étant une société de droit américain, ses journaux d’exécution peuvent donner lieu à un accès depuis les États-Unis. Ces transferts sont encadrés par les Clauses Contractuelles Types et, pour Vercel, par sa certification EU-U.S. Data Privacy Framework.</p>

      <h2>7. Sécurité</h2>
      <ul>
        <li><strong>Cloisonnement par organisation.</strong> Chaque utilisateur n’accède qu’aux données de sa propre structure, par un mécanisme de sécurité au niveau de la base (Row-Level Security) activé sur l’ensemble des tables. Les vues de l’espace client portent un filtre équivalent, restreignant chaque client à ses seuls dossiers.</li>
        <li><strong>Authentification déléguée.</strong> Aucun mot de passe de compte n’est stocké ni manipulé par l’application, et aucun n’atteint une route serveur : connexion et changement de mot de passe s’effectuent directement entre le navigateur et le service d’authentification.</li>
        <li><strong>Chiffrement des secrets d’accès.</strong> Les secrets des services connectés — mot de passe d’application iCloud, jetons Google et Microsoft, jetons d’envoi d’e-mail — sont chiffrés au repos en AES-256-GCM avec rotation de clés ; les clés ne sont jamais stockées en base. Le mot de passe d’application iCloud transite une seule fois par le serveur pour valider la connexion, n’est ni journalisé ni renvoyé au navigateur, et reste révocable depuis le compte Apple.</li>
        <li><strong>Contrôle des accès.</strong> Le rôle de chaque compte est vérifié côté serveur à chaque requête, jamais depuis le navigateur ; la désactivation d’un compte interrompt immédiatement sa session.</li>
        <li><strong>Stockage des fichiers.</strong> Espaces de stockage privés, aucune URL permanente : les fichiers ne sont accessibles que par des liens signés à durée limitée.</li>
      </ul>

      <h2>8. Vos droits</h2>
      <p>Conformément au RGPD et à la Loi Informatique et Libertés, chaque personne concernée dispose des droits d’accès, de rectification, d’effacement, de limitation, d’opposition (pour des raisons tenant à sa situation particulière), de portabilité, et de retrait du consentement à tout moment lorsque le traitement est fondé sur le consentement, ainsi que du droit de définir des directives relatives au sort de ses données après son décès (article 85 de la Loi Informatique et Libertés).</p>
      <p><strong>Comment exercer vos droits :</strong> adressez votre demande à <a href={`mailto:${EDITEUR.contactEmail}`}>{EDITEUR.contactEmail}</a>. Une pièce justificative d’identité peut être demandée en cas de doute raisonnable. Une réponse vous sera apportée dans un délai d’un mois, prolongeable de deux mois en cas de demande complexe.</p>
      <p><strong>Réclamation :</strong> si vous estimez, après nous avoir contactés, que vos droits ne sont pas respectés, vous pouvez saisir la CNIL — 3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07 — <a href="https://www.cnil.fr" target="_blank" rel="noreferrer">www.cnil.fr</a>.</p>

      <h2>9. Cookies et traceurs</h2>
      <p>Batilis utilise uniquement des cookies strictement nécessaires à son fonctionnement, destinés à l’authentification et au maintien de la session. Indispensables à la fourniture du service expressément demandé, ils ne requièrent pas de consentement préalable.</p>
      <p>Aucun outil de mesure d’audience, aucun traceur publicitaire, aucun outil de profilage commercial. Aucun script de mesure n’est chargé, aucune donnée de navigation n’est revendue. Si un tel outil venait à être mis en place, la présente politique serait mise à jour avant sa mise en service.</p>

      <h2>10. Délégué à la protection des données (DPO)</h2>
      <p>La désignation d’un délégué à la protection des données n’est pas obligatoire au regard de l’activité de Batilis (absence de traitement à grande échelle de données sensibles et de suivi systématique à grande échelle). Le contact pour toute question relative aux données personnelles reste : <a href={`mailto:${EDITEUR.contactEmail}`}>{EDITEUR.contactEmail}</a>. Cette appréciation sera réévaluée si l’activité évolue.</p>

      <h2>11. Modifications</h2>
      <p>Cette politique peut être mise à jour. La date de dernière mise à jour figure en tête de page. Les utilisateurs sont informés de toute modification substantielle ; un historique des versions est conservé.</p>
    </LegalShell>
  )
}
