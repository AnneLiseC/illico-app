# 07 — BOUSSOLE MULTI-TENANT BATILIS

> **État vivant du projet.** Lue par Claude (binôme) et Claude Code en tête de chaque session.
> Le détail historique (journal des commits, chantier finances) est dans `07_journal_multitenant.md`.

> Dernière mise à jour : 10/07/2026.
> Statut : Multi-agence COMPLET. Bloc A sécurité soldé. App multi-tenant fonctionnelle, cloisonnée, sécurisée. Acquis antérieurs : erreurs avalées soldé, famille AMO close, ménage infra (policies Storage versionnées + placeholder fermé). Sprint 16-18/06 : refonte finances COMPLÈTE, dossier de fin, comparateur de devis, statut staff CLOS, stepper corrigé, contrat auto-signé, PDF CR assaini. AUDIT SÉCURITÉ COMPLET (10/07) : série d'inventaires 01→07 + confrontation croisée (branche audit/inventaires, code figé 91e0db1). Cloisonnement prouvé sur les 2 couches (corps DEFINER + policies RLS lues verbatim). REVOKE 5 fonctions + DROP 2 backups appliqués. Sécurité soldée sans astérisque.

> **Depuis le 18/06 (à jour au 09/07)** :
> - **C7 espace client + RLS client — COMPLET (20-23/06)** : vues definer scopées, étanchéité inter-client prouvée, devis/PDF/CR/messages durcis.
> - **Messagerie réactivée + polish (23/06)** : messagerie centralisée remise en service (multi-tenant), fix timezone messages, feature édition de message 10 min.
> - **Accès client — CLÔTURÉ (24/06)** : invitation client (lien + mailto), page login client brandée, expiration d'accès (base +3 mois), désactivation J+14 (cron), réactivation. + fix emoji PDF CR.
> - **CALENDRIER étage 1 ✅ + étage 2 descendant COMPLET (24/06 → 01/07)** : scope tenant agenda, migration timestamptz UTC, vues client, cibles multi-agenda (`cibles_calendrier`), comptes_oauth multi-fournisseur, sync push Google ACTIVÉE EN RÉEL, iCloud CalDAV réel, lot 8 « Mes calendriers » (self-service connexion + gestion cibles). Outlook ABANDONNÉ (blocage tenant HEXARESO). 🟡 **SEUL RESTE = étage 3 : pull retour (Google/externe → BATILIS) + nettoyage 214 orphelins + sync/route.js refait.**
> - **SOFT DELETE agente (30/06-01/07)** : désactiver au lieu de supprimer (résout le blocage FK). Nettoyage des comptes test.
> - **TS — Travaux Supplémentaires COMPLET (01/07 + 09/07)** : TS-1 (cas AMO = re-ventilation, total inchangé) + TS-2 (cas courtage-only = échelonnement encaissement, lignes L1/L2). Écran + 3 PDF. Testé réel sur Jadras.
> **Business** : droit de commercialiser BATILIS confirmé (juridique OK, pas de non-concurrence), statut auto-entrepreneur validé (comptable). 1er client en vue = illiCO travaux Rodez (présentation faite/OK, proposition financière à partir du 20/07, prix fixé avec conseillère le 15/07).
---

## 0. CADRE

- **Objectif** : plateforme SaaS multi-tenant. Un franchisé externe teste sur SES données isolées, valide, fait de la pub.
- **Enjeu critique** : cloisonnement = ZÉRO faille. Une fuite entre franchises (potentiellement concurrentes) = mort du produit. Critère : « zéro faille », pas « peu de bugs ».
- **Méthode** : audit/plan AVANT code. Un changement à la fois. Test à l'écran ET en base avant merge. SQL en fichier `docs/sql/` appliqué main (jamais MCP), avec contrôle AVANT/APRÈS + rollback. Toute affirmation de schéma confrontée à `information_schema`/`pg_catalog`.

---

## 1. MODÈLE CIBLE — VERROUILLÉ

### Hiérarchie (3 niveaux)
`Société → Agence(s) → Utilisateurs`
- **Société** : entité juridique (`nom_societe`, SIREN/SIRET en text). Ex : CONSEIL TRAVAUX PROVENCE (CTP).
- **Agence** : point de vente / franchise locale. Ex : illiCO travaux Martigues.
- Une société peut détenir **plusieurs agences** (cas réel Aix : Aix + Pennes-Mirabeau).

### Rôles (2 niveaux, valeur base `admin`/`agente` — NE JAMAIS migrer la colonne `role`)
> ⚠️ `role = 'agente'` (féminin) est la valeur technique. L'affichage UI peut différer (texte d'interface).

| Rôle | Rattaché à | Voit |
|---|---|---|
| `admin` (franchisé) | sa **société** (`profiles.societe_id`) | TOUTES les agences de sa société |
| `agente` | son **agence** (`profiles.agence_id`) | SES dossiers de SON unique agence |

- **Anne-Lise (dev)** : AUCUN rôle applicatif privilégié, pas de super-admin dans l'UI. Accès INFRASTRUCTURE seulement (propriétaire projet Supabase). Administration plateforme via **secret** (Option B). Argument commercial : « dans l'app, je ne vois que ma franchise ».

### Cloisonnement des données
- **Racines `agence_id` en propre** : `dossiers`, `clients`. ⚠️ `artisans` est **société-wide** (`societe_id` seul, pas d'`agence_id` — MT7).
- **`profiles`** : `societe_id` (admin) + `agence_id` (rempli pour agente, **NULL pour admin** — D14).
- **`agences.societe_id`** : l'agence appartient à une société.
- **Filles héritent l'agence par JOIN** (pas de dénormalisation) :
  - via `dossier_id` → `dossiers` : devis_artisans, factures_artisans, photos, rendez_vous, comptes_rendus, suivi_financier, interventions_artisans, chantier_documents, chantier_fiches_techniques, messages.
  - via `agente_id` → `profiles` : factures_agente, redevances, objectifs_ca.
  - via `artisan_id` → `artisans.societe_id` : fiches_techniques, artisans_specialites.
  - via `user_id` → `profiles` : notifications, google_tokens (par user).

### Branding
- **PRODUIT = BATILIS** (navbar, login, titre, métadonnées).
- **Contenu COMMUN réseau illiCO** (non configurable) : slogan « Quand vous pensez travaux, pensez illiCO ! », « illiCO travaux » dans PDF/emails clients, « Équipe illiCO ».
- **Coordonnées DYNAMIQUES** : `societes` (nom_societe, siret, rcs) + `agences` (nom, ville, responsable, email, logo, adresse, code_postal, téléphone).

### Référence chantier
`AAAA-XX-NNN` (XX = typologie : CT courtage / AM AMO / ES estimo / MR / AU / SJ). Séquence **par agence** : `UNIQUE (agence_id, reference)` + NNN compté par agence+année (trigger `generer_reference_dossier` SECURITY DEFINER). Le `code` agence (`agences.code`, format LLNN) est interne, jamais affiché au client.

### Onboarding (flow cible, COMPLET — voir §3)
Anne-Lise invite (route protégée par secret) → lien email → set-password → écran « créez votre société » → formulaire crée société+1ère agence+profil admin (atomique) → dashboard. Double barrière : invitation + email `@illico-travaux.com`.

---

## 2. DÉCISIONS VERROUILLÉES (D1-D18 + onboarding)

- **D1.** Multi-tenant RÉEL en base partagée (pas d'instance séparée).
- **D2.** 3 niveaux Société→Agence→Users. Tenant data = agence.
- **D3.** Rôles `admin`(société)/`agente`(agence). Pas de migration colonne `role`.
- **D4.** Dev = accès infra seulement, pas de super-admin applicatif.
- **D5.** `agence_id` propre sur racines (dossiers, clients, profiles) ; héritage par JOIN ailleurs. ⚠️ `artisans` société-wide (pas d'agence_id, MT7).
- **D6.** Admin rattaché société, agente rattachée agence.
- **D7.** Produit BATILIS ; contenu réseau illiCO commun ; coordonnées agence dynamiques.
- **D8.** CR + Messages + Statistiques neutralisés pour le test.
- **D9.** Refonte RLS complète et unifiée (un seul pattern).
- **D10.** Login Google supprimé.
- **D11.** Onboarding : lien d'invitation nommé par Anne-Lise + validation `@illico-travaux.com`. Le franchisé crée société+1ère agence+mot de passe via le lien, puis ses agentes.
- **D12.** Référence chantier `AAAA-XX-NNN` (XX = typologie). `UNIQUE (agence_id, reference)`, NNN par agence. Code agence interne LLNN, jamais dans la référence client.
- **D13.** Storage cloisonné par agence — ✅ **FAIT** (L12, 06/06).
- **D14.** `profiles.agence_id` NULL pour admin, rempli pour agente. Détermination agence à la création précisée en D18.
- **D15.** Profils `client` (role='client', espace-client) portent `agence_id` = agence de leur client métier. Cloisonnement par identité (`profiles.client_id → clients.id`).
- **D16.** Bascule RLS (Phase 3) en UNE session, ordre fondations → racines → filles → transverses.
- **D17.** Trigger `redevances_montant_protege` protège aussi `agence_id` (fait en L5a-3).
- **D18.** Détermination `agence_id` à la création (`dossiers`/`clients` uniquement, PAS artisans société-wide) :
  - L'`agence_id` suit la **référente**, pas le créateur.
  - `clients` : agence de la référente. Agente → sa propre agence. Admin → agence de la référente choisie (si admin référente → règle admin).
  - `dossiers` : hérite de l'agence du client (`agence_id = client.agence_id`).
  - Règle admin : agence = vue active (onglet agence) ou sélecteur obligatoire (vue consolidée). Le sélecteur multi-agences = **L15 (post-test)** ; en mono-agence, déduction auto de l'unique agence.
- **D19**. rls_auto_enable (event trigger) active la RLS sur toute nouvelle table public → garantit « RLS partout » (nouvelle table = RLS on + 0 policy = deny-all). Ne pas le supprimer.
- **D20**. Sécurité d'onboarding_create_societe : elle vit dans la ROUTE, pas dans le corps (la fonction fait confiance à l'argument p_user_id). Invariant si refactor : p_user_id dérivé du JWT vérifié, jamais du body. Grant service_role-only à conserver.
- **D21**. artisans + filles (fiches_techniques, artisans_specialites) société-wide = visibles inter-agences (conforme D5). À ressortir au 1er franchisé multi-agences (question commerciale : agences voient leurs carnets mutuels).

**Assumé (audit 10/07, pas des bugs)** :
acompte 0 ⟹ commission 0 non codée dans finance.js (calcul = HT×taux inconditionnel ; garde-fou = confirm non bloquant à la saisie). Discipline de saisie, pas invariant. → remonte en P1 si un franchisé externe à saisie non contrôlée entre dans la boucle.
Conversion AMO↔courtage + suppression chantier = tout-staff (pas admin-only), volontaire.

### Décisions onboarding (07/06)
- **Admin plateforme = Option B** : pas de super-admin applicatif. Invitation via route protégée par secret + administration hors app cliente. Préserve le cloisonnement.
- **Onboarding self-service façon 1** : l'admin invité crée SA société à la 1ère connexion (pas de pré-création). Il n'a pas de profil tant que la société n'existe pas → écran dédié.
- **Atomicité** : fonction Postgres SECURITY DEFINER (transaction = tout-ou-rien natif), appelée par une route API.
- **`specialites`** = référentiel COMMUN tous franchisés (métiers bâtiment). Non cloisonné = VOLONTAIRE, pas une fuite.

---

## 3. OÙ ON EN EST

### ✅ FAIT (closes)
- **Phase 1** : rebranding BATILIS (L9), neutralisation Messagerie/Stats (L11), suppression Google login + fix création chantier sans client (L13), durcissements sécu (L17).
- **Phase 2** : tables `societes`/`agences` (MT1), seed CTP+Martigues + colonnes (MT2), backfill + NOT NULL (MT3), helpers `get_my_societe_id`/`get_my_agence_id` (MT4), patch INSERTs (L6-light), policies lecture fondations (MT5).
- **Phase 3 (bascule RLS)** : dénormalisation `societe_id` racines (MT6), RLS profiles/racines/finances (L5a), opérationnelles (L5b), transverses (L5c), référence chantier par agence (L8). Cloisonnement RLS complet et unifié.
- **Phase 4** : artisans société-wide (MT7), migration pages vers useAuth (L6), navbar nom agence dynamique (L7), dynamisation infos agence PDF/params/cron (L10 a/b/c complet), écrans saisie objectifs CA.
- **Phase 5** : fix reconnexion après invitation, page set-password (L14a).
- **Chantier finances (B)** : finance.js source unique correcte + tous les écrans rebranchés dessus (acomptes, filtres devis, commission, honoraires, Recap PDF mutualisé). Bugs réels corrigés (double comptage AMO, frais source unique, TVA travaux 10% vs frais 20%). Code mort finance.js nettoyé. Détail → journal.
- **Sécurité (bloc A, en grande partie)** : P0-9-bis (cloisonnement agente), get_my_role durci (MT4), **L12 Storage cloisonné par agence (06/06)**, bug unicité redevances corrigé, durcissement EXECUTE fonctions trigger, verrou champs profiles admin-managed.
- **Features 06/06** : mot de passe oublié, devis signé dans PDF suivi, page profil agente.
- **Onboarding L14b (07/06) — COMPLET** :
  - Validation domaine email staff `@illico-travaux.com` à l'invitation (helper `isAllowedStaffEmail`, exceptions via `STAFF_EMAIL_EXCEPTIONS`).
  - Lot 1 : UNIQUE (societe_id, code) agences. Lot 2 : génération code agence LLNN.
  - 3a : table `admin_invitations` (service_role-only) + route `/api/admin/invite-franchise` (secret).
  - 3b : `profileStatus` + `OnboardingGuard` + écran `/onboarding`.
  - 3c : fonction atomique `onboarding_create_societe` + route `/api/onboarding/create-societe` + formulaire.
  - **Parcours testé E2E réel** : société « TEST 1 » créée de bout en bout, code agence auto, invitation consommée.
- **Cloisonnement multi-société : VALIDÉ étanche bidirectionnel** (07/06). 2 sociétés réelles, RLS prouvée en base sur 22 tables (dont filles), 0 fuite dans les 2 sens.
- **SPRINT 16-18/06 (finances + chantier + dossier de fin)** : refonte finances COMPLÈTE (4 onglets, 3 vues compte de résultat CA généré, royalties réel corrigées, objectif agente RLS), dossier de fin (factures + RIB/KBIS + ZIP photos + PV réception), comparateur de devis, fiche technique depuis chantier, statut staff CLOS (calcStatut v2 + CHECK strict), stepper 5 étapes, contrat auto-signé, CR IA fiabilisé, PDF CR assaini. Détail → journal (#199 à #257).
- **✅ C7 — ESPACE CLIENT + RLS CLIENT — COMPLET (20-23/06)**. Vues SECURITY DEFINER scopées (mes_dossiers_client()), étanchéité inter-client prouvée. C7-1 devis acceptés, C7-3 PDF devis signé, C7-4 durcir CR (R1/R2/R3 + notes internes invisibles), C7-5 durcir messages (anti-usurpation + verrou colonnes). Détail → journal + §Reliquats.
- **✅ MESSAGERIE — RÉACTIVÉE + POLISH — COMPLET (23/06)**. Messagerie centralisée remise en service multi-tenant (#267), fix timezone messages UTC→local (#268), feature édition de message 10 min (#269+#270), badge messages navbar (#271). + fix police PDF italic (#265).
- **✅ ACCÈS CLIENT — CLÔTURÉ (24/06)**. Système complet : invitation (lien+mailto, #273), page /login-client brandée (#274), expiration d'accès 3 mois (colonnes + helper), application front+RLS (guard + bandeau J-21), désactivation J+14 (RPC + cron), réactivation. + fix emoji PDF CR (#272). Détail → §3-ter.
- **✅ CALENDRIER — ÉTAGE 1 + ÉTAGE 2 DESCENDANT — COMPLET (24/06→01/07)**. Socle (scope tenant agenda, timestamptz UTC, vues client, created_by) + sync DESCENDANTE (BATILIS→externe) : cibles multi-agenda (`cibles_calendrier`), lots 1-5 Google, ACTIVATION RÉELLE Google, comptes_oauth multi-fournisseur, iCloud CalDAV réel, lot 8 « Mes calendriers ». Outlook ABANDONNÉ (blocage tenant HEXARESO). 🟡 SEUL RESTE = étage 3 (pull retour → BATILIS). Détail → §3-ter.
- **✅ SOFT DELETE AGENTE — COMPLET (30/06-01/07, #300)**. Désactiver au lieu de supprimer (réversible), résout le blocage FK. Nettoyage comptes test. Détail → bloc A + §3-ter.
- **✅ TS — TRAVAUX SUPPLÉMENTAIRES — COMPLET (01/07 #301 + 09/07 #302/#303)**. TS-1 (cas AMO = re-ventilation courtage→AMO, total inchangé) + TS-2 (cas courtage-only = échelonnement encaissement, lignes L1/L2). finance.js additif non-régression prouvée, écran + 3 PDF. Testé réel Jadras. Détail → §3-ter.

### 🔜 RESTE À FAIRE — SYNTHÈSE (le détail par bloc suit plus bas)
> **Rien ne bloque l'ouverture à un franchisé côté sécurité/fonctionnel.** Ce qui reste :
> - 🟡 **Calendrier étage 3 (pull retour Google/externe → BATILIS)** + nettoyage 214 orphelins + sync/route.js refait — chantier dédié tête fraîche, ne bloque pas l'ouverture (le push descendant est fait et sûr).
> - 🔵 **Chiffrement des tokens OAuth Google** en base (iCloud déjà chiffré AES-256-GCM) — dette, lot dédié.
> - 🔵 **Dépendances externes** : leaked password protection (attend plan Pro Supabase), SMTP custom pour onboarding en volume.
> - 🔵 **Pricing / gating quota** : architecture actée, MONTANTS non validés terrain (sondage 5-6 franchisés + décision downgrade) — voir §MODÈLE PRICING.
> - 🟢 **Petits restes fonctionnels** : Messagerie AMO bug raison_sociale (si persiste), notif mail upload facture, réactivation Statistiques, idées futures. Voir bloc F.
> - 🟢 **Business (hors code)** : proposition financière Rodez (dès 20/07), RDV comptable avant 1er encaissement, sondage prix.

### 🔜 DÉTAIL PAR BLOC (historique + restes)

#### Bloc A — Sécurité — SOLDÉ (restants = dépendances externes)
> La vraie surface d'attaque avant ouverture franchisé est fermée. Ce qui reste est bloqué par une dépendance (plan Pro Supabase) ou de l'hygiène cosmétique. Le module calendrier a été REFAIT (étage 2 descendant, cibles multi-agenda + scope tenant + fix RLS confidentialité) → l'ancien garde-fou « pas de sync active » est LEVÉ pour le PUSH (Google + iCloud activés en réel). Seul l'étage 3 (pull) reste, mais il ne bloque pas l'ouverture (le push descendant est sûr et cloisonné).
##### ✅ Fait
- [x] **🔴 Purge Storage à la suppression SOLDÉE** (10/06, mergé `219720e`, branche fix/storage-purge-entites). Carte d'audit : chantier déjà purgé correctement (cr/ inclus, ordre OK), client sans objet (aucun préfixe clients/, FK NO ACTION bloque). 2 vrais gaps corrigés : (1) agente DELETE purge kbis_url/rib_url/factures_agente — ORDRE CRITIQUE corrigé après bug : purge APRÈS deleteUser réussi (sinon fichiers détruits alors que l'agente survit si deleteUser échoue) ; (2) artisan delete balaie artisans/{id}/fiches/ (scopé id exact). Prouvé E2E : agente cas échec (KBIS survit à l'échec, ×2 sur TEST AI + Manon réelles), artisan purge=0 + témoin LS TRAVAUX=20 intact. Reste (fonctionnel, pas dette) : flux RGPD orchestré « effacer client + ses dossiers + fichiers » en 1 action → backlog.
- [x] **Faille route /api/cr corrigée + PROUVÉE E2E** (10/06, mergé `fd2b2cd`). dossierId et docsPaths du body consommés en service_role sans contrôle → lecture cross-tenant + téléchargement arbitraire du bucket documents. Fix : appartenance reflétant la RLS (admin→societe_id, agente→agence_id), 404 uniforme ; docsPaths ceinture-bretelles (match exact Set contre chantier_documents du dossier + préfixe chantiers/{dossierId}/), 400 au 1er invalide. 8 tests E2E : T4 admin TEST1→dossier CTP 404 ; T5 uuid inexistant 404 corps IDENTIQUE (pas de fuite d'existence) ; T6 agente Marseille→dossier Montpellier 404 (amendement agence) ; T7/T8a/T8b/T9 paths hostiles 400 (T8b = bon préfixe absent table → match exact prouvé) ; contre-test positif Marie→son dossier Marseille 200.
- [x] **🔴 Audit transversal routes service_role SOLDÉ** (10/06). 12 routes cartographiées, pattern « id/path du body + service_role + pas de contrôle tenant » sur 4. Corrigées + prouvées E2E : cr (`fd2b2cd`), create-agente PATCH/DELETE (`ca64421`), pdf staff (`c844e60`). 4e (calendrier push/sync/event) → quarantaine. Routes JWT-dérivées confirmées sûres : create-agence, invite-franchise (secret), cron/relances (secret), onboarding/create-societe (self), auth/google (state HMAC). Surface service_role connue et fermée hors module calendrier (neutralisé par garde-fou).
  - [x] **create-agente PATCH/DELETE corrigé + PROUVÉ E2E** (10/06, mergé `ca64421`). Contrôle d'appartenance (societe_id du JWT) avant toute mutation, dans les deux handlers. DELETE : check société (404) AVANT deleteUser — ordre critique ; puis check role==='agente' (400) ; 404 uniforme cross-tenant. POST intact. Tests E2E : PATCH cross-tenant 404, DELETE cross-tenant 404 (cible TEST AI intacte en base après), PATCH same-tenant 200.
  - [x] **pdf branche staff corrigée + PROUVÉE E2E** (10/06, mergé `c844e60`). Contrôle d'appartenance staff (admin→societe_id, agente→agence_id, 404 uniforme) avant tout fetch/download lié + rattachement crId→dossierId (404 si CR d'un autre dossier). Branche client intacte. Paths Storage issus de la base scopée au dossier → contrôle dossier suffit. Tests E2E : (a) staff TEST1→dossier CTP 404 ; (b) dossier TEST1 + crId CTP 404 « CR non trouvé » ; (c) dossier TEST1 propre 200 PDF. c' (crId légitime TEST1) couvert par lecture de code (pas de CR sur dossiers TEST1).
- [x] **Audit des index UNIQUE reliques mono-tenant** (09/06). 38 index examinés : tous sains (PK sur id, ou portent societe_id/agence_id, ou uniques par nature : siret/user_id/email/specialites). Seul `objectifs_ca` était cassé → corrigé au 4c-1. ⚠️ `specialites_nom_key` global VOLONTAIREMENT (référentiel commun) — à repasser en `(societe_id, nom)` SI un jour les franchisés créent leurs propres spécialités.
- [x] **Validation finances multi-agence sur vraies données** (09/06). Agentes Marie (Marseille) + Manon (Montpellier) sur TEST 1 + redevances réparties (4500€/1300€). Scoping prouvé à l'écran : Consolidé 5800 / Marseille 4500 / Montpellier 1300, objectif par agence OK, badge « Filtré sur » OK. → Finances multi-agence validé.
- [x] **EXECUTE anon/PUBLIC sur fonctions : CLEAN** (10/06). 12 fonctions public, toutes ACL explicite (aucune proacl NULL = pas de défaut PUBLIC implicite), grantees = postgres/authenticated/service_role uniquement. Déjà durci au Lot 5 (revoke_execute_triggers.sql). Seul RPC appelé = onboarding_create_societe (service_role only). RIEN à révoquer. ⚠️ MAJ 10/07 : 5 fonctions ajoutées APRÈS (agenda_derive_tenant, cible_derive_societe, profile_client_derive_agence, messages_lock_columns, suivi_courtage_ts_upsert) avaient gardé le défaut PUBLIC/anon → REVOKE appliqué (docs/sql/revoke_execute_public_5fn.sql), vérifié anon/PUBLIC=false sur les 5. authenticated conservé sur la RPC.

- [x] **Surface ANON sur les TABLES soldée** (10/06). RLS active sur 29/29 tables (auto-garantie par l'event trigger rls_auto_enable, cf. §4), GRANT anon (défaut Supabase) neutralisé par la RLS. 24 tables sûres (policies TO authenticated → anon deny). 1 faille corrigée : policy INSERT notifications « Service role inserts notifications » était TO public WITH CHECK true (anon pouvait forger des notifs pour tout user_id) → re-scopée TO authenticated WITH CHECK (auth.uid()=user_id) via docs/sql/fix_notifications_insert_policy.sql. Prouvé : INSERT anon → 42501 RLS violation. service_role (cron) non affecté (bypass RLS). admin_invitations : 0 policy = deny total, voulu.
- [x] **Policies Storage versionnées (#5)** ✅ (15/06, f06bb0, complété par #7). docs/sql/storage_policies.sql = source de vérité. NB : l'export #5 initial avait omis les 2 policies DELETE (réparé en #7 → fichier complet à 8). 5 anciens fichiers obsolètes supprimés. Cloisonnement tenant confirmé solide (pas de sécurité par obscurité).
- [x] **Placeholder cross-société (#7)** ✅ (15/06, 0ee864c). Exemption .emptyFolderPlaceholder retirée des 6 policies Storage (scoping tenant désormais appliqué à tout chemin) — vérifié 8 policies a_exemption=false en base, T1 non-régression OK (lecture/upload/suppression docs intacts). Au passage : réparé l'omission #5 (storage_policies.sql avait 6/8 policies, les 2 DELETE manquaient → désormais complet à 8 sans exemption). Reste geste manuel cosmétique : supprimer le placeholder 0 octet via UI Storage (DELETE SQL bloqué par Supabase ; inerte car soumis au scoping normal).
- [x] **🔴 Suppression agente impossible si google_tokens/comptes_oauth existe → RÉSOLU par SOFT DELETE** (30/06-01/07, mergé 69b2e39). Bug : 7 FK vers profiles en NO ACTION bloquaient auth.admin.deleteUser (« Database error deleting user »). Choix produit = SOFT DELETE (désactiver au lieu de supprimer) pour préserver l'attribution des dossiers + l'historique comptable. Colonne profiles.actif (NOT NULL DEFAULT true). Route /api/agente-statut (ban/unban Supabase Auth ban_duration '876000h'|'none' + update actif). auth-context fetchProfile déconnecte (signOut) une session dont actif=false (double blocage : ban = nouvelles connexions, signOut = session en cours). UI parametres>Équipe Désactiver/Réactiver + badge. Filtres : chantiers/clients → actif=true (assignation) ; parametres+finances → toutes (historique). Testé E2E. NB : fix FK hard-delete (6 FK→SET NULL, factures→CASCADE) appliqué prod AVANT comme filet de sécurité. Comptes test TEST AI + TEST 2 AGENTE ensuite supprimés (reste 3 vraies agentes : Anne-Lise, Manon, Marie). ⚠️ PIÈGE : le dashboard Supabase ne propage PAS bien les cascades SET NULL → pour un vrai hard delete futur (RGPD), script admin.deleteUser + vérif cascades, PAS le dashboard.
- [x] **✅ Module calendrier REFAIT — quarantaine LEVÉE (24/06 → 01/07)**. L'ancien défaut structurel (CALENDAR_ID global mono-franchise) est corrigé : architecture CIBLES (`cibles_calendrier`, un RDV → un agenda précis via calendar_id + compte_oauth_id), scope tenant sur rendez_vous/interventions (RLS agence/société), comptes_oauth multi-fournisseur. Push (BATILIS → externe) : Google ACTIVÉ EN RÉEL + iCloud CalDAV réel. Le fix RLS confidentialité cibles (admin ne voit plus les cibles perso des agents) est appliqué. Les anciens garde-fous « ne pas activer la sync » sont donc LEVÉS pour le PUSH. 🟡 **RESTE = étage 3 (pull) seulement**, voir chantier calendrier ci-dessous.
- [x] Policy UPDATE bucket photos — ABANDONNÉ 18/06 : le remplacement de photo n'est pas un besoin.

##### 🔶 Restants — bloqués par dépendance ou refonte (PAS des trous exploitables avant ouverture)
- [ ] **Durcissements bloqués** : (c) leaked password protection → attend le plan Pro Supabase ; (d) captcha → optionnel. [(a) EXECUTE anon et (b) policy notifications INSERT : FAITS le 10/06, voir ci-dessus.]

#### Bloc B — Multi-agence réel (chantier en cours, découpé en 5 lots)
> **Principes verrouillés** : la « vue active » est un filtre d'AFFICHAGE (UX), PAS une frontière de sécurité — la RLS reste l'unique frontière (admin = toute sa société, il a le droit de tout voir). Défaut admin multi-agences = vue Consolidée (toutes agences). Agente = une seule agence, aucun sélecteur. **Garde-fou permanent** : une société à 1 agence (CTP/Marine) ne doit voir AUCUN changement à aucun lot. ⚠️ CTP reste mono-agence jusqu'à la fin du chantier ; le terrain de test multi-agence = société TEST 1 (2 agences : MA00 Marseille + MO00 Montpellier).

- [x] **Lot 1 — Création d'agence** ✅ FAIT (07/06, mergé `0ec94eb`). 
  Route `/api/create-agence` (service_role, `requireRole(['admin'])`, `societe_id` dérivé du JWT jamais du body) + modale dans paramètres + `chargerAgence` corrigé (`.single()` → liste `order('code')`) + affichage liste (société une fois, N sous-blocs agence) + bloc objectif d'agence masqué si ≥2 agences. `code` LLNN auto (trigger), non affiché. Sécurité `societe_id` prouvée par lecture du code (jamais lu du body). Testé : non-régression 1 agence, création 2e agence (TEST 1 : MO00 généré), 403 agente.
- [x] **Lot 2 — Vue active + navbar bi-zone** ✅ FAIT (07/06, mergé `c05f9c6`). 
  État `agences`/`agenceActive`/`setAgenceActive` dans AuthContext. `agenceActive` : `null` = Consolidé/pas de filtre (agente, admin mono, admin multi par défaut) ; uuid seulement si admin multi clique un onglet (= filtre d'affichage choisi, PAS l'agence de rattachement). Persistance localStorage `batilis.agenceActive.<user.id>`, validée contre la liste réelle au montage (pas de race, calcul après chargement agences), purgée au logout. Navbar bi-zone (onglets « Toutes les agences » + une par agence) rendue uniquement si `admin && agences.length>=2` ET navbar déployée ; clic change l'état sans naviguer. Sous-titre logo reflète la vue active en cas admin-multi seulement. AUCUN écran scopé (Lot 4). Testé : non-régression CTP (1 agence, navbar inchangée), bascule + persistance F5 + validation valeur bidon sur TEST 1, agente sans onglet.
- [x] **Lot 3a — Sélecteur d'agence (create-agente)** ✅ FAIT (08/06, mergé `f863076`). 
  Route `create-agente` : double comportement — `agence_id` du body validé contre `societe_id` du JWT (400 « Agence invalide » si étrangère, AVANT l'invite = pas d'orphelin auth) / absent → déduction `.order('code').limit(1)`. L'agence résolue alimente profil ET objectifs_ca. Modale : `<select>` si `agences>=2` (source `useAuth()`), défaut = `agenceActive` (modifiable), choix forcé si Consolidée. + `refreshAgences()` exposé par AuthContext (recharge la liste sans toucher `agenceActive`, appelé après création d'agence Lot 1). Garde-fou CTP : à 1 agence, pas de select, route déduit, inchangé. Testé : non-régression CTP, création ciblée TEST 1, pré-remplissage, refreshAgences (3e agence sans reload), sécurité agence étrangère.
- [x] **Lot 3b — Sélecteur d'agence (clients/nouveau)** ✅ FAIT (08/06, mergé `9d866af`). 
  Branche référente=admin : si ≥2 agences → `<select>` (source useAuth, défaut agenceActive, choix forcé si Consolidée) ; si 1 agence → déduction `.order('code')`. Référente=agente → agence de l'agente (inchangé). Insertion client direct sous RLS : double barrière préexistante (policy `clients_scope` WITH CHECK societe_id + trigger `derive_societe_id_from_agence`) + validation `agences.some()` côté client. Garde-fou CTP inchangé.
- [x] **Lot 4 — Scoping des écrans par `agenceActive`** ✅ FAIT (09/06). Pattern `useMemo` (null=tout, uuid=filtre). 4a dashboard/clients/chantiers, 4b planning, 4c finances complet.
  - [x] **4a — dashboard + clients + chantiers** ✅ FAIT (08/06, mergé `85ce8a2`). `agence_id` ajouté au select dashboard. Agrégats (CA, compteurs) sur données scopées. Dashboard reste « mes dossiers » (bug #8 = voulu) + filtré agence. Garde-fou CTP/agente (agenceActive null) inchangé. Testé : non-régression, bascule sans reload, cohérence agrégats.
  - [x] **4b — planning + widget RDV dashboard** ✅ FAIT (08/06, mergé `579d7d0`). RDV/interventions filtrés via dossier parent (`matchAgence` 3 cas, transverse `!dossier_id` toujours visible — 214/246 RDV sans dossier). Jalons chantier + stat « Chantiers actifs » + dropdowns création scopés via `dossiersScoped` (agence_id direct). Widget « RDV du jour » dashboard idem. Testé OK.
  - [x] **4c — finances** (FINI LE 09/06 ✅). Option B ciblée : scoper + assainir les calculs touchés. Découpé en sous-lots.
    - [x] **4c-1 — objectif d'agence scopé** ✅ FAIT (08/06, mergé `aff72fd`). `getObjectif('agence')` sensible à `agenceActive` (uuid → objectif de l'agence ; null → somme société). Branche `'agente'` intacte. + **migration SQL `docs/sql/l4c1_fix_index_objectif_agence.sql`** : index `objectifs_ca_agence_unique` corrigé `(annee,cible)` → `(annee,cible,agence_id)` — corrige un bug multi-tenant (l'ancien index n'autorisait qu'UN objectif d'agence par an pour TOUTE la base → bloquait tout 2e franchisé). Testé : valeurs par agence, somme Consolidé (350k), agence sans objectif = 0 (pas de fuite), non-régression CTP.
    - [x] **4c-2 — KPI + redevances** ✅ FAIT (09/06, mergé `87871e3`). `redevancesScoped` (useMemo) injecté dans `totalNetCTP` uniquement : agente → mesRedevances (inchangé) ; admin Consolidé → toutes ; admin vue agence → `r.agence_id === agenceActive`. Corrige B1 (CA net ne mélange plus les redevances des autres agences). `pctObjectif` désormais cohérent (numérateur 4c-2 + dénominateur 4c-1 même périmètre). Suivi NON touché (4c-3). Validé : non-régression CTP + scoping prouvé par code (pas de redevances sur TEST 1).    
    - [x] **4c-3 — Périmètre unique finances** ✅ FAIT (09/06, mergé `b25b0c4`). `scopedDossiers` filtre `agenceActive` en amont du pill (agence maître, pill raffine dedans) → corrige la dette 4c-2 (produits enfin scopés agence). `redevancesScoped` aligné sur le même double filtre (4 cas : agente / admin+tous / admin+moi / admin+agente). Pill agente filtré par agence active + réinit à 'tous' au changement de vue (anti-périmètre-vide). Modèle verrouillé : sélecteur d'agence = navbar uniquement ; un seul périmètre pilote KPI+F1/F2+Suivi+Synthèse. Validé : non-régression CTP + bascule TEST 1 ; pill/redevances par lecture de code (pas de données réparties sur TEST 1).
    - [x] **4c-4 — Scoping Suivi** ✅ FAIT (09/06, mergé `85b6143`). 5 usages `dossiers`→`scopedDossiers` (dont reduce apporteur l.1308) + 8 lignes `redevances`→`redevancesScoped`, en remplacements EXPLICITES (alias rejeté : shadowing trompeur sur du comptable). Grep de complétude : 0 occurrence nue restante dans le Suivi. Royalties inline suivent auto (via agrégats). Helper `libellePerimetre()` + badge « Filtré sur » (réutilisable 4c-5). Validé : non-régression CR CTP complet (mois + année).
    - [x] **4c-5 — Scoping Synthèse** ✅ FAIT (09/06, mergé `6ff525f`). `reelData` repointé `rowsReelAnneeEnCours`→`rowsReelScoped` (équivalence prouvée : même `agrégerParPaiement`, seule la liste diffère), global mort supprimé. `previData`/donut déjà scopés (4c-3). Badge indicateur (helper 4c-4). Synthèse = périmètre unique (B4 fermé). Validé non-régression CTP.
- [x] **Lot 5 — Paramètres multi-agences** ✅ (10/06). merge `3776655`
  - **5a édition agence** (mergé `ed41f57`) : route service_role /api/update-agence (PATCH), contrôle appartenance societe_id 404, whitelist stricte 7 champs. Prouvé en base.
  - **5b objectif par agence** (mergé `ea58771`+`dfac076`) : UI éditeur par agence (≥2) + chargement indexé par agence_id. Bug multi-agence trouvé au test (sauvegarderObjectif : select non scopé agence_id → faux ✓ sans écriture) → corrigé (select scopé + throw sur .error ; upsert écarté car index partiel non ciblable PostgREST 42P10). Prouvé en base. Cas agente + mono CTP non régressés.


#### Bloc B-bis — Facturation (reliquat fonctionnel, repris du 05)
##### ✅ Fait
- [x] **Colonne « Marine » en dur + KPI net à virer** ✅ (10/06). Libellé colonne total + RepartRow → « Société » (valeurs intactes, code mort nomFranchisee/adminRes nettoyé). KPI « Net à virer à l'agente » (F1−F2 trompeur) supprimé.
- [x] **Couples AMO legacy à dates incohérentes** ✅ (15/06). AM-002 + AM-009 rattrapés (acompte_amo.date ← courtage.date ; + montant courtage AM-002 ← acompte). Backup + transaction + COMMIT manuel sur avant/après. Préventif (rien ne lit cette date). NB : anomalie montant AM-002 traitée dans le même lot (groupée).
- [x] **Cases redevance cliquables (agente)** ✅ FERMÉ SANS CODE (14/06). Décision : le besoin n'existe pas. Dans le flux réel, c'est l'ADMIN qui constate les redevances reçues (il a déjà son chemin via le toggle F2 → upsertFactureMoisType synchronise redevances.statut). L'agente paie par virement, pas par clic — la grille redevances est de l'AFFICHAGE pour elle (consultation), pas un pilotage. Pas de route INSERT agente, pas de pré-création, pas de policy à ajouter. L'item décrivait un faux manque (hypothèse « les cases devraient être cliquables » invalidée par le flux métier). NB structure pour mémoire : redevances = 1 statut binaire en_attente/regle, INSERT admin-only, UPDATE agente(sa ligne)+admin(société), trigger protège montant en UPDATE seulement.
- [x] **Atomicité conversions AMO↔courtage (#3)** ✅ (15/06, 2d56011). 2 fonctions Postgres convertir_dossier_en_amo / _en_courtage (SECURITY INVOKER, patron K). Séquence multi-écritures rendue atomique. Montant/date/statut préservés au rename. Collision = rollback total. Famille AMO close (avec K + #4).
- [x] **Hygiène : dropper `factures_agente_backup_b7b`** ✅ 
- [x] L16 Facturation scopée/consolidée ✅ 18/06 (d3df28b) — sélecteur d'agente filtré par agence active (agentesScope) + reset agente hors périmètre. Consolidé = toutes. CTP mono-agence non régressé.
- [x] Vue agente du suivi financier ✅ SANS OBJET 18/06 — l'ancienne spec (net perso = gains − redevance − part apporteur dans le Suivi) est CADUQUE depuis la refonte CA généré. Découpage acté : Suivi (mode agent) = performance commerciale (CA généré vs objectif) ; Facturation (F1/F2) = cash perso (redevance + apporteur en F2, net = F1−F2). Bug d'accès mode CTP corrigé (mode agent forcé, toggle admin-only). Mettre le net perso dans le Suivi serait une régression (doublon Facturation + cassure alignement objectif). Résidu cosmétique « libellés 1ère personne » écarté volontairement (crPourCle partagé, complexité inutile).
- [x] Colonne « Net » facturation supprimée (solde F1−F2 indicatif, non relu) ✅ 18/06 (cafe6dd)
- [x] Timing remboursement apporteur F2 ✅ VÉRIFIÉ / DÉJÀ CORRECT 18/06 — l'apporteur F2 est bucketé sur date_paiement de l'échéance apporteur_agente/rembourse (= mois du remboursement réel ≈ facture Kiosque), PAS sur la date d'acompte. Donnée dédiée déjà en base (suivi_financier, type_echeance='apporteur_agente', statut_ctp='rembourse'), aucune colonne à ajouter. Réserve cosmétique non chiffrante : subit le décalage d'affichage +1 uniforme de la Facturation (montant/rattachement justes) — à juger à l'écran si besoin, pas un bug.
- [x] Chantier 2 — décalage M−1 vue admin propre ✅ SANS OBJET 18/06 — la prémisse (redevance en PRODUIT du Suivi CTP cohabitant avec l'activité propre non décalée) est CADUQUE depuis la refonte CA généré, qui a sorti la redevance du Suivi (→ Facturation). Aujourd'hui : Suivi CTP = une seule échelle (mois d'activité, redevance exclue, apporteur au mois de paiement) ; le seul décalage M+1 vit dans la Facturation, uniforme F1/F2 et déjà libellé « activité de {mois} ». Aucun écran ne mélange deux échelles. Toucher au bucketing redevance serait inutile et risqué (alimente F2 + grille).
- [x] Légende « mois d'activité » sur grille redevances (lève l'ambiguïté vs mois de facture du tableau F1/F2) ✅ 18/06 (cafe6dd)
- [x] Label F1 « courtage + AMO » → « Honoraires » ✅ 18/06 (cafe6dd)
- [x] Convention d'affichage asymétrique commissions/honoraires homogénéisée ✅ 18/06 (386ce8b) — colonne Honoraires (brut) ajoutée au tableau Réel/Prévi, Net inchangé.
- [x] Fiabilité génération CR (IA) ✅ 18/06 (fix/cr-join-notes, 3 lots) — mots collés corrigés (join '' → '\n\n', cause des « lansuite » = bug code, pas l'IA) ; numérotation retirée (CR = type+date) ; consigne orthographe (corrige la prose, préserve les noms propres) + temperature 0.3.  Lot 1 ✅ mots collés (join → \n\n, 1b00cbd). Lot 2 ✅ retrait numérotation (CR = type+date). Reste : Lot 3 consigne orthographe + temperature 0.3. ✅ 18/06 (bde261b) 
- [x] Accent prénom client (Jerome/Jérôme) ✅ 18/06 (abda085) — source de vérité = clients.prenom (fiche client). Le CR la lit déjà verbatim ; l'IA la ré-accentuait → consigne prompt étendue (nom+prénom client protégés). Probabiliste ; post-traitement déterministe seulement si récidive.

##### A FAIRE
- [⏸] 3a-bis — Alerte écart figé/live — EN ATTENTE DÉCISION MARINE (pas un blocage technique). Badge ⚠️ si le montant figé (au clic « Reçu ») diffère du live. À trancher AVANT tout code : le cas (activité d'un mois facturé qui bouge après figement) est-il assez fréquent pour justifier un filet ? Sans traçabilité des modifs post-figement, un badge seul = bruit non actionnable. → question à poser à Marine, pas un lot à coder en l'état.

#### Bloc C — Onboarding self-service (reste)
- [ ] **3d page stats plateforme** — reportée backlog (pas utile tant qu'un seul franchisé ; compteurs visibles via dashboard Supabase).
- [ ] **SMTP custom pour l'onboarding en prod** : le SMTP par défaut Supabase est bridé (rate limit ~quelques emails/h, rencontré au test 07/06). Nécessaire avant d'inviter de vrais franchisés en volume (Resend/SendGrid ou Microsoft Graph déjà utilisé pour les relances).

#### Bloc D — Bugs & dette (non bloquants)
##### ✅ FAIT (closes)
- [x] **Dynamisation des hardcodes CTP/Martigues** ✅ SOLDÉ (10/06). 5 sous-lots : 1 plomberie `b0cce09`, 2 libellés→Société `f0833fd`, 2bis fallbacks→— `59c0112`, 3 portail client `96c7362`, 4 CR `2a165b6`. Réserve restante : branding PDF sep_*.js (bloc D) — grep SANS exclusion lib/sep_ ce jour-là.  
  - [x] **Sous-lot 1 — plomberie** ✅ FAIT (09/06, mergé `b0cce09`). `societe:societes(id, nom_societe)` embarqué dans fetchProfile + exposé `societe` dans useAuth(). ⚠️ Colonne = `nom_societe` (pas `nom`). Sert surtout aux libellés d'identité (les libellés de rôle utilisent « Société » statique).
  - [x] **Sous-lot 2 — libellés de rôle → « Société »** ✅ FAIT (10/06, mergé `f0833fd`). 20 chaînes affichées sur 3 fichiers (finances 14, paramètres 4, chantiers 2). Zéro identifiant technique touché (isCTP, key:'ctp', totalNetCTP, SuiviCTPChart, sfSousOngletCTP intacts). Article « la/La » ajouté en prose (1749/1839/1849/1888/1894). Grep classé : catégorie « chaîne affichée résiduelle » VIDE. Toggle final : « Agence — Encaissements bruts » / « Société — Résultat net (charges incluses) ». ⚠️ 3 fallbacks 'CTP' (nom de PERSONNE : finances:161 nomFranchisee, chantiers:573/701 prenomAdmin) NON traités → sous-lot 2bis (audit des sites de rendu puis choix du fallback). ⚠️ Réserve sep_*.js : le grep excluait lib/sep_ — à l'audit branding PDF, grep SANS exclusion.
  - [x] **Sous-lot 2bis — fallbacks nom de personne** ✅ FAIT (10/06, mergé `59c0112`). 3 littéraux `'CTP'` → `'—'` (finances:161 nomFranchisee, chantiers:573/701 prenomAdmin). Tous cas B (libellés d'identification — rendus finances:887/1137, chantiers:2752). Aucun cas A (pas de phrase adressée). Grep `'CTP'` (avec quotes) = VIDE dans app/ hors _design. Cas C signalé : chantiers nomFranchisee (useState l.572 + setter l.701) setté mais jamais rendu = code mort → bloc D.
  - [x] **Sous-lot 3 — portail client** ✅ FAIT (10/06, mergé `96c7362`). espace-client:253 « illiCO travaux Martigues » → `{profile?.agence?.nom || 'illiCO travaux'}` (fallback = marque réseau, jamais le mauvais tenant). Embed `agence:agences(nom)` en piggyback sur le fetch profil (zéro requête en plus). Chemin RLS PROUVÉ en base : policy `agences_select_ma_societe` (authenticated) + `get_my_societe_id()` (SECURITY DEFINER, lit le profil de l'appelant) + profils clients avec societe_id renseigné. Grep « Martigues » espace-client = vide. ⚠️ Note : la policy donne au client la lecture de toutes les agences de sa société (noms seulement, anodin aujourd'hui) — à réévaluer si `agences` porte un jour des colonnes sensible
  - [x] **Sous-lot 4 — CR généré** ✅ FAIT (10/06, mergé `2a165b6`). route.js:34 « illiCO travaux Martigues » → `${agenceNom}` (= dossier.agence?.nom || 'illiCO travaux'). Embed agence:agences(nom) en piggyback sur le fetch dossier (déjà garanti autorisé par le garde-fou d'appartenance en amont). buildSystemPrompt(type) → (type, agenceNom). Prompt système intact au caractère près hors le nom ; l.38-40 « le courtier illiCO travaux » (marque réseau) non touchées. NB : le nom est dans le prompt système, pas forcément recopié dans le JSON de sortie → vérif déterministe = diff, test live = non-régression 200.
- [x] **Code mort chantiers/[id] nomFranchisee** ✅ (10/06, mergé `cf13a14`). useState + setter supprimés, setPrenomAdmin conservé (lu l.2752), 0 occurrence restante.
- [x] **redevance_debut à la création d'agente** ✅ (10/06, mergé `cf13a14`). Ajouté au body POST + insert profiles (colonne profiles.redevance_debut date, même que le PATCH). L'asymétrie création/édition est résolue : le champ est persisté dès le POST.
- [x] **Templates email FR (Reset Password + Invitation)** ✅ (10/06, dashboard Supabase, NON versionné). Corps + sujet en français, bouton stylé, ton BATILIS, signature « L'équipe BATILIS ». Variables {{ .ConfirmationURL }}/{{ .SiteURL }} préservées. ⚠️ Vit dans le dashboard, pas le repo — pas de trace git.
- [x] **Doublon factures_agente** ✅ (11/06). Cause : upsertFactureMoisType select-puis-insert sans garde DB + AUCUN index unique sur factures_agente → double-insert (Anne-Lise 2026-06). Fix : DELETE doublon + UNIQUE INDEX (agente_id, annee, mois, type_facture). SQL versionné. 
- [x] **Durcir upsertFactureMoisType** ✅ (11/06). Cause = double-clic toggle F2 non gardé + existence sur état mémoire. Fix : garde ré-entrance (useRef) + existence en base (4 clés) + .error/throw + rattrapage 23505 + UPDATE ciblé (anti-clobber PDF) + feedback erreur appelants. Sujet F2 (doublon + montant + durcissement) SOLDÉ.
- [x] **Réglage montant redevance par agente** ✅ (11/06). 
  Champ « Redevance mensuelle (HT) » (fixe mensuel) au formulaire agente + route create-agente POST/PATCH, saisissable création ET édition. Corrige « redevance juillet à 0 » (calcMois lit redevance_mensuelle_ht en live) 97ea172
- [x] **Garde-fou création profil client** ✅ (10/06). 
  Trigger BEFORE INSERT `profile_client_derive_agence_trg` (SECURITY DEFINER) : role='client' → dérive agence_id + societe_id depuis le client métier rattaché (profiles.client_id → clients) ; exception stricte si client_id manquant. + CHECK `profiles_client_agence_not_null` (role <> 'client' OR agence_id IS NOT NULL) = filet dur, survit au retrait du trigger. Cible role='client' uniquement (admin agence_id NULL préservé, vérifié). SQL versionné docs/sql/garde_fou_profil_client_agence.sql. Dérivation + CHECK + non-régression admin prouvés en base. NB découvert : aucun chemin applicatif ne crée de profil client (lien magique acté mais non construit) → garde-fou préventif, posé AVANT le futur flux espace-client.
- [x] **Boutons morts Finances** ✅ (11/06). 4 boutons décoratifs (CSV, ▼, Exporter le bilan, Saisir un règlement) supprimés + conteneurs vides. Aucun handler (jamais câblés).
- [x] Export CSV + bilan finances — ABANDONNÉ 18/06 : masqué volontairement, à construire seulement sur demande explicite future.
- [x] **CR markdown→rendu** ✅ (12/06). 
  Composant partagé MarkdownCR (client + agente, variant). Cause racine corrigée (join('\n\n') + template désindenté). 5 CR legacy migrés (SQL versionné, backup rollback). Filet renderer tolère un legacy non migré. Fallback notes_brutes retiré côté client (« CR en cours de rédaction »). Bonus : vue agente complète (aperçu strippé + dépliable) qui n'existait pas. f385f27
- [x] **comptes_rendus.pdf_path mort** ✅ (12/06, `b866d73`). Feature morte supprimée (colonne inexistante, 0 lecteur, uploads orphelins). CR reste texte + PDF à la volée.
- [x] **Erreurs avalées chantiers/[id] — non-💰 + dossiers** ✅ (12/06, Lot 2). Tout le fichier couvert (💰 Lot 1 + non-💰 + taux rollback + contrat_url).

- [x] **Branding PDF sep_*.js (#6)** ✅ CLOS SANS CODE (15/06). Les 9 lib/sep_*.js sont des images base64 (pages de séparation PDF), aucun texte paramétrable. Zéro branding en dur. Exclusion lib/sep_ aux sous-lots hardcodes était inoffensive.
- [x] **Bug statut chantier←devis** ✅ (12/06, ddfaf72). calcStatut : devis_a_modifier ⟸ a_modifier (enfin branché) OU tous refusés ; refusé isolé retombe en cascade ; hasR3 retiré (→ devis_en_attente). 2 items de fond posés en backlog : statut « en attente signature » manquant + réconciliation calculé/persisté.
- [x] **CR côté client temps réel (#8)** ✅ (15/06, 5f7e3cd). Realtime sur comptes_rendus (ajouté à la publication supabase_realtime + abonnement sur le channel client existant, event:'*' pour publier/dé-publier). CR apparaît sans refresh. Cloisonné RLS + filter dossier_id.
- [x] **Avancement client (#9)** ✅ (15/06, 92043cf). Barre morte retirée (colonne dossiers.avancement jamais alimentée, vestige _design ; gate >0 → jamais affichée). Stepper 4 étapes = seule progression client. Colonne orpheline en base (candidate DROP COLUMN futur, non urgent).
- [x] **DROP COLUMN dossiers.avancement** ✅ (15/06). Colonne orpheline supprimée (0 dépendance vérifiée : vue/fonction/index/route _design). Clôt définitivement #9.
- [x] **Types de RDV (#10)** ✅ (15/06, e5c6da0). 3 types ajoutés (suivi, reception, etude) au CHECK type_rdv + TYPE_CONFIG + select des 2 formulaires (planning + fiche chantier). Règles : les 3 exigent un dossier ; reception active l'artisan (comme R2) ; suivi/etude sans artisan. Nettoyage artisan_id au changement de type. Désengorge le 'autres' (était 72%). type_rdv et type_visite restent indépendants.
- [x] **Taux onChange→onBlur** ✅ (15/06, 92c2ce5). taux_courtage + honoraires_amo_taux : écriture DB au blur/Enter au lieu de par caractère. set() state gardé en onChange (recalcul live OK), persistTaux() factorisé, rollback préservé. apporteur_actif (toggle) non concerné.
- [x] **Source unique libellé suppression chantier** ✅ (15/06, 92c2ce5). Constante ENTITES_CHANTIER aux 2 endroits (divergence réelle CR/suivis fermée).
- [x] **prenomAdmin maybeSingle** ✅ (15/06, 92c2ce5). .order('prenom').limit(1) → ne casse plus si 2 admins. RLS cloisonne (pas de filtre societe_id ajouté).
- [x] **suiviAcompteAMO vestige mort** ✅ (15/06, 92c2ce5). Supprimé (0 usage).
- [x] **Code mort** finance.js restants ✅ 16/06 (b4d7ae2)
- [x] **L22 bug synchro Google Calendar (TDZ)** ✅ CORRIGÉ (lot 1 étage 2, feat/sync-tdz-fix bac38d7). Rename auth→oauthClient dans sync + event. Plus de plantage runtime. (Le fond « calendrier partagé entre agences » a été traité par la refonte étage 2 : cibles multi-agenda + scope tenant.)

##### A FAIRE
- [ ] **#8 dashboard admin scope** (à arbitrer selon scénario testeur).

#### Bloc E — Refonte UX vues finances SOLDÉ
> ✅ BLOC FINANCES SOLDÉ (18/06). Tout le codable est fait : compte de résultat CA généré (3 modes), RLS objectif agente durcie+testée, objectif vue Par année, barre objectif alignée CA généré, L16 facturation scopée, libellés (colonne Net, légende redevances, honoraires), colonne Honoraires, CR IA (3 lots). Items fermés sans objet (résolus par la refonte CA généré) : vue agente, décalage M−1, timing apporteur F2. SEUL RESTE : 3a-bis figé/live = en attente décision Marine (pas du code). → Finances ne contient plus aucun item codable ouvert.

- [x] Finances Lot 1 — renommage onglets ✅ 17/06 (1f153ae)
- [x] Finances Lot 2 — ménage + KPI + mémo (D4 D6 D7 D8 D9 D10 D11) ✅ 17/06 (0439a85)
- [x] Finances Lot 3a — style unifié + extraction composants ✅ 17/06 (c064f94)
- [x] Finances Lot 3b — fusion Synthèse→Suivi + nouvelle mise en page ✅ 17/06 (6b95794)
- [x] Finances Lot 3c — comptes de résultat 3 vues + tableaux Prévi/Réel refondus ✅ 17/06 (99291fc)
- [x] Finances Lot 4 — D3 royalties réel corrigées ✅ 17/06 (2a8ae4d)
- [x] D12 — renderAnnuel : extraction vers finance.js non applicable. comptePourCle dépend de l'état React (rowsReel, mapPreviMois, redevancesScoped, mode, isCTP) — couplage trop fort pour une lib a-temporelle par dossier. La logique temporelle appartient à la page. Clos 17/06.
- [x] l.228 Refonte 5 onglets finances — COMPLÈTE ✅ 17/06
- [x] l.172/175 Renommages/libellés finances — COMPLÈTE ✅ 17/06
- [x] Bug objectif agente (somme toutes agences) ✅ 18/06 (db506e3) — perso → fallback agence labellé → non défini.
- [x] Retrait badges F1/F2 onglets + Suivi → « Compte de résultat » + « Gains » → « Produits » ✅ 18/06 (e76d6b9)
- [x] Compte de résultat « CA généré » (3 modes unifiés) ✅ 18/06 (c2cf533) — formule CA = brut−royalty−apporteur total ; société −parts. KPI alignés (CA généré / Part franchisée). Bug royalty×2 société corrigé.
- [x] RLS objectifs_ca durcie + prouvée (4 policies, brèches b/c fermées, 5 tests SQL verts) ✅ 18/06
- [x] Lot 2 — Objectif perso agente éditable (RLS durcie + écran profil) ✅ 18/06 — l'agente fixe son objectif CA, last-write-wins avec l'admin (même ligne). Notif de changement = reportée (bloc notifs).
- [x] Objectif dans la vue « Par année » + barre alignée sur CA généré (mois + année, 3 modes) ✅ 18/06 (14346as) — KPI haut == barre mois == barre année, incohérence net/CA fermée.


##### Décisions verrouillées finances
- D1 : Renommer F1 Prévisionnel → Prévisionnel / F2 Réel → Réel
- D2 : Vue mois/année Réel = encaissements réels par date paiement
- D3 : Royalties réel = frais + honoraires + commissions (corrigé)
- D4 : KPI CA réel net admin only, retiré pour agente
- D5 : Style unifié tokens CSS, Tailwind supprimé
- D6 : agrégerParPaiement mémoïsé (useMemo)
- D7 : Variable morte chantiersAnneeEnCours supprimée
- D8 : Sur-fetch apporteur_affaires/nom retiré
- D9 : Année plancher dynamique (anneeMin depuis dossiers)
- D10 : DEFAULT_PART_AGENTE centralisé dans finance.js
- D11 : Typo \n → br corrigé
- D12 : Non applicable (voir ci-dessus)
- D13 : SyntheseView/FacturationAgentes/SuiviCTPChart extraits hors composant
- D14 : Cloisonnement transitif devis_artisans/suivi_financier via EXISTS dossiers.
        VIGILANCE : si dossiers_scope s'élargit, ces tables héritent de l'élargissement.
        À vérifier à chaque modification RLS dossiers.
- D15 : Onglet Synthèse supprimé, fusionné dans Suivi financier
- D16 : Vue "Par mois" supprimée dans Prévisionnel (pas de sens métier)
- D17 : Prévi par mois = date_signature_contrat, Réel par mois = date paiement réel
- D18 : scope reset à 'tous' en entrant sur Suivi/Facturation (handleTab)
- D19 : Répartition par chantier = Frais(brut)+Commissions(brut)+Honoraires(brut)−Royalties=Net. Réel=encaissé, Prévi=engagé (base actifs). Apporteur = split Société/Agente seulement, jamais le total.
- D20 : Royalty = 5% PAR ENCAISSEMENT, arrondie PAR COMPOSANT (méthode illiCO confirmée). NE JAMAIS recalculer sur un total (désaligne des factures illiCO). Convention assumée, pas une dette.
- D21 : royaltyPreviActifs (base actifs) ≠ c.royaltiesTotal (royalty hon sur signés) sur dossiers à devis non signés. La répartition par chantier utilise royaltyPreviActifs (reconcilie le Net) ; KPI CA prévi + Suivi CTP gardent c.royaltiesTotal (agrégat canonique). Bases différentes = volontaire.
- D22 : CA généré = Hon+Com+Frais(brut) − Royalties − Apporteur remboursé(TOTAL). agent/agence = CA ; société = CA − parts agentes. Redevance EXCLUE du compte de résultat (vit en Facturation). Apporteur TOTAL déduit dans les 3 modes. Net par chantier (répartition) ≠ CA généré (diffère de l'apporteur, voulu — libellés distincts).

##### 4 onglets finaux
Prévisionnel · Réel · Suivi financier · Facturation

#### Bloc E-bis — Dette technique / nommage / code mort (indépendant, faisable isolément)
- [x] **Formulaire devis inline mort** ✅ (12/06, `63b0cd9 `). Cluster mort autoréférent supprimé (7 symboles, −56 l.) après audit prouvant 0 lien vivant. DevisModal = seul chemin actif, intact. contrat_signe préservé (dupliqué dans saveDevisFromModal).
- [x] **Intégrations : masquer Supabase et Claude IA** ✅ (12/06). + Google Drive retiré (bouton mort). Reste 1 carte : Google Calendar (vraie intégration).
- [x] **Espace client : statuts internes masqués** ✅ (12/06). Badge « Dossier en préparation » + stepper 4 étapes (« Préparation » fond a_contacter/a_relancer). Côté staff (lib/dossiers.js) intact.
- [x] **Messages côté client : bulle corrigée** ✅ (12/06). Client = bleu à droite, agence = gris à gauche (styles étaient permutés).
- [x] **Renommage variables « Marine »** ✅ (fait le 05/06, `456f1d4`, ~32 occ. / 4 fichiers). isMarine→isAdmin, estChantierMarine→referentEstAdmin (basés rôle). prenomAdmin NON renommé (variable de personne légitime). Item avait survécu par erreur à la réorg du 11/06.
- [x] **Convention null redevance** ✅ (résolu de fait au 11/06, lot redevance). Règle déjà respectée : calcul → garde !=null ou ||0 ; affichage paramètre → « à paramétrer ». Aucun bug. (item décrivait l'état d'avant 97ea172). 
- [x] **Handlers qui avalent les erreurs** ✅ SOLDÉ (12/06). Toute l'app couverte hors quarantaine : chantiers/[id] complet (💰 Lot1 5efbe04 + non-💰/pdf_path/dossiers Lot2 49953e4), espace-client/planning/artisans (Lot3 6e7ad64), atomicité K (62086ec). Faux ✓ éliminés, maybeSingle capturés (anti-doublon), feedback client non technique, couple AMO atomique. RESTE hors scope : 🟢 lectures (priorité basse) ; module calendrier (quarantaine).
- [x] **K — atomicité majSuiviChantier** ✅ (12/06, 62086ec). Fonction Postgres suivi_toggle_honoraires (SECURITY INVOKER, upsert index partiel, atomique). Le couple courtage/acompte_amo est désormais tout-ou-rien (T5 prouvé : échec partiel → rollback total). Filet temporaire retiré. Cloisonnement RLS héritée (T6). DO UPDATE préserve montant_ttc.
- [x] **Audit code mort** finance.js repo-wide ✅ 16/06


#### Bloc F — En dernier : réactiver modules neutralisés
##### A FAIRE
- [ ] **Notif mail upload facture** : agente upload F1 → mail admin ; admin upload → mail agente + redevance cochée des deux côtés ? À cadrer (déclencheur, destinataire, contenu).
- [ ] **Intégration Google Drive** (piste future) : connecter les documents chantier à Drive. Carte retirée le 12/06 (bouton mort). À construire si besoin confirmé.
- [ ] **Idées futures** : `artisans.metier` texte libre → liste depuis `specialites` + `artisans_specialites` ; IA lecture attestations décennales → spécialités auto.
- [ ] **Chantiers : résumé en panneau latéral** sans quitter la liste.

##### ✅ FAIT
- [x] **Réactiver Messagerie** ✅ FAIT (23/06). Messagerie centralisée remise en service, adaptée au multi-tenant (RLS agence). Polish + fix timezone + édition 10 min (voir bloc D). Statistiques : reste à réactiver si besoin (pas prioritaire tant qu'un seul franchisé). NB : si le bug « Messagerie AMO aucun dossier affiché » (clients.raison_sociale) persiste quelque part, le traiter à l'usage — la réactivation principale est faite.
- [x] **Automatisme cochage redevance** ✅ FAIT. Statut « reçu » automatisé (lié à la saisie facture du mois).
- [x] **Bouton « Connecter » générique (Google Calendar)** ✅ FAIT (traité dans le lot 8 « Mes calendriers » : l'écran self-service de connexion des comptes/cibles remplace l'ancien bouton mort).
- [x] **Bug emoji ⚠️ dans le PDF de CR** ✅ FAIT (24/06). Emoji mal rendu (carré/tofu, Roboto sans glyphes emoji) corrigé. (+ fix police italic PDF au passage.)
- [x] **Page login client brandée** ✅ FAIT (24/06, tranche T2 du chantier accès client, 9ddedf6). Page /login-client à l'image BATILIS/illiCO (« Espace client »), distincte de l'entrée staff. Même signInWithPassword derrière (cloisonnement porté par role+guards+RLS).
- [x] **Feature édition de message (10 min)** ✅ FAIT (23/06). Chacun peut corriger son propre message dans les 10 min suivant l'envoi (client ET staff symétriquement). Trigger C7-5 assoupli (contenu mutable si auteur_id=uid ET now()-created_at < 10min) + UI bouton « modifier » + edited_at pour afficher « modifié ». Staff ne peut pas modifier un message client et inversement (verrou préservé).
- [x] **Bug affichage timezone** ✅ FAIT (23/06). La messagerie affichait created_at en UTC brut → conversion UTC→local FR côté front. Donnée en base restée correcte (UTC). (Vérifier ponctuellement que d'autres écrans affichant des dates localisent bien — CR, dates dossier, PDF — si un cas UTC brut réapparaît.)
- [x] Comparateur de devis dans les dossiers ✅ 17/06 (8faf611)
- [x] KPIs page chantier : montant prévu + réel ✅ 17/06 (3401841)
- [x] Restitution : factures artisans + RIB/KBIS franchisé ✅ 17/06 (6ef0cfd)
- [x] Dossier de fin — Lot 1 (factures + RIB/KBIS franchisé) ✅ 17/06 (6ef0cfd)
- [x] Dossier de fin — Lot 2 (ZIP photos côté client) ✅ 17/06 (aa3d8b6)
- [x] Dossier de fin — PV de réception ✅ 17/06 (a763a14)
- [x] Fiche technique créable depuis dossier chantier ✅ 17/06 (235ae45)
- [x] CR dans documents ✅ 16/06 (86f529c)
- [x] Modifier dossier → modal ✅ 16/06 (31a20c5)
- [x] Client nom sans « null » ✅ 16/06 (843eac6)
- [x] Double-clic chantier = ouvrir dossier ✅ 16/06 (f607ef7)
- [x] Statut chantier "en attente signature" — FAIT (calculé, cascade v2)
- [x] Réconciliation statut calculé vs persisté — FAIT staff (5 écrans + CHECK strict scellé). Reste espace-client (bloc dédié).
- [x] Contrat auto-signé ✅ 16/06 (044d464)
- [x] Factures honoraires restitution (catégorie dédiée + position correcte) ✅ 17/06 (9d8bdbc)
- [x] Bouton facture honoraires + badge FACT ✅ 17/06 (75f70a8)
- [x] KBIS franchisée dans paramètres ✅ 17/06 (f1e8545)


### Chantier statut STAFF — CLOS le 16/06
A→E mergés. calcStatut v2 = source unique, CHECK strict (NULL/annule/termine), éditeur manuel terminé/annulé/ré-ouvrir.
Reste hors staff : C7 espace-client + RLS client → BLOC ESPACE CLIENT dédié (lien magique → RLS → front). Reporté.

### Reliquats chantier statut (après edc21cf)
- [x] Espace client + RLS client (C7) ✅ COMPLET 23/06 — détail C7-1/3/4/5 ci-dessous (C7-2 RDV parké). NB : l'audit initial a montré que l'étanchéité inter-client était déjà solide (RLS scopée partout, storage privé, /api/pdf re-vérifie ownership) → C7 a consisté à OUVRIR proprement le fonctionnel manquant (vues definer à colonnes limitées) + DURCIR (CR, messages), pas à créer des policies client-read. Brique centrale réutilisée partout : mes_dossiers_client().
  - [x] C7-1 base SQL : vue client_devis_acceptes (devis acceptés + artisan) + mes_dossiers_client() ✅ 20/06 0bc32ae — étanchéité prouvée (7 tests, T2 inter-client OK, colonnes sensibles inatteignables). ⚠️ VUE SECURITY DEFINER : sécurité portée par mes_dossiers_client() (pas de RLS de secours) → ne JAMAIS modifier la vue/fonction sans relancer test_c7_vue_devis_client.sql. Advisor signale security_definer_view = attendu/assumé.
  - [x] C7-1 front ✅ 20/06 (0b2630a) — devis acceptés affichés (entreprises retenues) via la vue. T3 validé à l'écran. Stepper reste dégradé (hors périmètre, ne lit que les acceptés).
  - [⏸] C7-2 RDV (type+date) — EN ATTENTE refonte planning/types RDV. Bloqué par une taxonomie transitoire : les types RDV ont été refaits à la création (R1/R2/R3/Suivi/Récept./Étude/Autre/Intervention) MAIS le chantier planning n'a pas suivi, et 179 RDV legacy 'autres' jamais re-typés (tous dossier_id NULL → auto-exclus du scoping aujourd'hui, mais nullable = pas une garantie). Décision actée : ne PAS poser le flag visible_client sur une taxonomie instable. Audit C7-2 fait (vue nécessaire, scoping mes_dossiers_client() OK, stepper NON réparable par cette vue). À reprendre APRÈS la refonte calendrier/planning : mécanisme retenu = flag visible_client boolean DEFAULT false (fail-closed), pas allowlist de types. Le stepper client dégradé reste un sujet distinct.
  - [x] C7-3 PDF devis signé ✅ 21/06 (e1c1c09 base + 4b2c104 carte) — vue + a_devis_signe (étanchéité re-prouvée), /api/pdf type='devis' (ownership strict devisId∈dossier possédé + accepte, service_role, bucket fermé), carte cliquable front. 5/7 devis de A ont un PDF.
  - [x] C7-4 durcir CR ✅ 21/06 (009d104 vue + 4e18d8a front + 5805e18 realtime) — vue client_comptes_rendus (valide + type NOT IN r1/r2/r3, colonnes limitées sans notes_brutes/contenu_ia), étanchéité prouvée (8 tests), front basculé, policy table retirée (fail-closed prouvé table=0/vue=2), realtime CR nettoyé. Fuite R1/R2/R3+notes internes fermée.
  - [x] C7-5 durcir messages ✅ 23/06 (dad422d) — anti-usurpation auteur_role (insert WITH CHECK), policy UPDATE client (lu fonctionne), trigger verrou colonnes (lu/lu_agence seules mutables, contenu figé pour tous y compris staff). Testé 2 côtés.

- en_etude/devis_en_attente : phase précoce, BASSE dans la cascade (le R2 la dépasse)
- devis_a_modifier AVANT chantier_a_venir (un devis à retravailler prime sur un signé)
- chantier_a_venir = ≥1 devis accepte ET 0 recu (tout tranché). Discipline : refuser les devis non retenus.
- frais 'offerts' exclu de a_relancer (rien à relancer)
- Pipeline dashboard 6 buckets : À traiter / En étude / En attente signature / Chantier à venir / En chantier / Terminé (annule exclu)
- Stepper espace-client piloté par RDV (pas statuts devis fins — RLS client)

#### Optimisation BDD — dette d'échelle (PAS urgent, future-proofing)
- [x] **auth_rls_initplan (3×)** ✅ 17/06 (e5cd604) — 3 policies notifications encapsulées. Reste du schéma déjà encapsulé depuis MT/L5.
- [x] multiple_permissive_policies (51×) — déjà résolu par migrations antérieures, vérifié 17/06
- [x] unindexed_foreign_keys (29×) ✅ 16/06 (fa86b34) — advisor nettoyé


---

## 3-ter. CHANTIERS 24/06 → 09/07 (post-C7) — état pour reprise

### ✅ ACCÈS CLIENT — CLÔTURÉ 24/06 (5 tranches + fix sécu)
> Parti d'une « page login cosmétique », devenu un système complet d'accès client : invitation, connexion brandée, expiration d'accès (3 mois après clôture), désactivation J+14, réactivation.
- [x] T1 invitation client — bouton AMO-only sur fiche chantier, route invite-client (generateLink invite/recovery, sans envoi auto), mailto que le référent envoie de sa boîte (contourne blocage @illico). ✅ 203b48b
- [x] T2 page /login-client brandée BATILIS. ✅ 9ddedf6
- [x] T3 stockage expiration — colonnes date_cloture, acces_expire_le (base+3mois, base=date_fin_chantier sinon date_cloture), profiles.acces_actif. Stamp au « Marquer terminé ». Helper lib/expiration.js. ✅ 9a7f205
- [x] T4 application front+RLS — guard espace-client (écran expiré + bandeau J-21) ; chokepoint mes_dossiers_client() + condition expiration ; 4 policies routées ; mon_expiration_client() pour la date. Étanchéité prouvée. ✅ 7d3e91
- [x] T5 désactivation J+14 — RPC desactiver_acces_expires() (garde-fou multi-dossiers), cron bloc [8], écran réutilisé, réactivation au re-invite. ✅ f1e1a22
- [x] Fix sécu : REVOKE anon sur les 2 fonctions DEFINER (grant Supabase par défaut). ✅ f1e1a22

### ✅ CALENDRIER — étage 1 + étage 2 descendant COMPLETS (24/06 → 01/07)
> Architecture 3 étages (décidée 24/06) : étage 1 = socle (scope tenant + timestamptz UTC + vues client) ✅ ; étage 2 = sync DESCENDANTE (BATILIS → agendas externes) ✅ ; étage 3 = retour bidirectionnel (pull) ⏳ SEUL RESTE. Archi BRIQUES (libs par fournisseur googleapis/tsdav + colle maison), PAS d'API unifiée payante. Conflit = LAST-WRITE-WINS.
**ÉTAGE 1 (socle) — COMPLET 24/06** : scope tenant agenda (agence_id+societe_id sur rendez_vous/interventions + RLS + trigger agenda_derive_tenant, b3dbc2f — fuite inter-agences colmatée) ; date_heure → timestamptz UTC (edd3543, tout était en local Paris) ; vues client_rendez_vous + client_interventions (d188dd5+f9b571d) + front « Mon agenda » ; trigger dossier + sélecteur agence admin (06c67f6) ; created_by. date_heure_old conservé (filet, DROP plus tard).
**ÉTAGE 2 (descendant) — COMPLET** :
- Lot 1 fix TDZ (bac38d7). Lot 2 structure ciblage (`cibles_calendrier` agence XOR perso, 0557fdd) + seed cible Martigues + rétro-mapping 260 RDV/9 interv. Lot 3 sélecteurs cible+agence front. Lot 4 bascule push sur les cibles + scoping tenant (feat/sync-push-bascule) + retrait bouton « Synchroniser » → indicateur passif. Lot 5 lib unique app/lib/calendar/google.js + nettoyage summaries + bascule event/route.js sur les cibles (fix/calendar-lib-5a).
- **ACTIVATION RÉELLE Google (29/06)** : dry-run retiré, testé sur calendrier partagé Martigues (INSERT/UPDATE/DELETE). GOOGLE_CALENDAR_ID supprimé de Vercel (résidu mort).
- Lot 6a comptes_oauth (ex-google_tokens renommé, multi-fournisseur google/outlook/icloud, UNIQUE (user_id, fournisseur), d5da4a8). Lot 6b iCloud CalDAV RÉEL (crypto.js AES-256-GCM + icloud.js tsdav/ICS, testé create/update/delete, 7ec328a). 7-mapping (mapping.js partagé Google+iCloud).
- **Lot 8 « Mes calendriers » COMPLET (mergé f368318)** : écran self-service (composant partagé MesCalendriers.jsx) pour connecter comptes OAuth/iCloud + gérer cibles sans toucher la base. Placement role-aware (agente → /profil ; admin → /parametres>Intégrations). Badge multi-fournisseur, connexion/déconnexion iCloud, création/suppression cibles, cible par défaut (profiles.cible_calendrier_defaut_id), libellé éditable (cibles.agenda_nom). 🔴 FIX RLS CONFIDENTIALITÉ appliqué (admin voyait les cibles PERSO des agents → gaté sur agence_id IS NOT NULL).
- **OUTLOOK ABANDONNÉ (29/06)** : blocage organisationnel (compte @illico-travaux.com = tenant HEXARESO non contrôlé bloque le consentement app externe ; perso outlook.com sans tenant Azure refuse la création d'app). Mapping + dispatch prêts si tenant Azure dispo.
- **🟡 ÉTAGE 3 (bidirectionnel Google → BATILIS) COMPLET & ACTIF EN PROD (13/07)** :
  Sens Google → BATILIS opérationnel et automatique. Mergé sur main (dd56667).
  Décision de fond : LAST-WRITE-WINS SÉLECTIF (§2.2 spec) — une modif Google redescend, mais
  sélective : date/heure/durée écrasées ; type re-parsé ; artisan re-parsé (1 match sinon vide) ;
  DOSSIER mis à jour SEULEMENT si rattachement certain, sinon on GARDE l'existant (jamais casser un
  rattachement). Anti-écho par rendez_vous.google_etag (§2.4) : etag identique = notre reflet → no-op,
  pas de boucle. Doc de réf : SPEC_bidirectionnel_calendrier.md.

  Briques (toutes faites, testées en réel, mergées) :
  - B4 Parsing des events Google inconnus (parse-event.js) : type + dossier + artisan auto,
    ambiguïté → sans lien. RDV typé sans dossier RESTE typé (décision : on ne repasse pas en 'autres').
  - B5 Réécriture de trame dans Google (events.patch) pour un event typé+rattaché + anti-écho etag.
    Trame NON imposée si pas de dossier (garde le titre Google, ne perd pas le nom). Garde-fou :
    evt.etag absent → no-op (reconnus_sans_etag).
  - B6 Last-write-wins sélectif (ci-dessus). Garde etag NULL : les 85 RDV natifs (etag NULL) ne sont
    JAMAIS re-parsés → backfill etag seul (reconnus_etag_init). Prouvé par le code.
  - PLANCHER (cible_sync_state.sync_floor) : le pull ne démarre qu'au jour de la 1ʳᵉ sync, jamais
    d'historique. Posé auto à now() au 1er pull. Rend caduc le « nettoyage 214 orphelins ».
  - B7 Récurrents : canal séparé, events.list fenêtré [now ; now+180j], singleEvents:true,
    matérialise UNIQUEMENT les occurrences de séries (recurringEventId présent) — les ponctuels
    restent au canal incrémental. Pas de trame (n'éclate pas la série), pas de delete, pas de curseur.
    Testé : BNI ancien remonte seul (27 occ.), re-run 0 doublon.
  - B8 Cron « tous-tenants » (service_role, toutes cibles google actives de toutes sociétés,
    isolation d'erreur par cible). Auth Bearer CRON_SECRET.
    → 2 rythmes : incrémental 15 min via GITHUB ACTIONS (.github/workflows/pull-calendar.yml,
      Vercel Hobby ne fait pas le 15 min) ; récurrents 1×/jour 03:00 via VERCEL CRON (vercel.json).
    Secrets : CRON_SECRET (Vercel prod + GitHub repo, même valeur) + APP_BASE_URL (GitHub, url prod
    sans / final). Vercel Hobby = 2 crons quotidiens max → on est PILE à la limite (relances 08:00 +
    récurrents 03:00).

  SQL appliqués (prod) : etage3_lotA (cible_sync_state), etage3_lotC_check_status, etage3_sync_floor,
  etage3_B5_google_etag. Nettoyages : cleanup_rdv_test_B5, drop_backups (10/07).

  🔲 RESTE À FAIRE (étage 3) :
  - **B9 — Parité iCloud** (PROCHAIN). Même bidirectionnel côté CalDAV : pull via tsdav.syncCollection,
    404→delete, réappariement par URL CalDAV. iCloud n'aura jamais de webhook (polling cron only).
  - **Lot F — Nettoyage** : supprimer le vieux sync/route.js mort + le résidu GOOGLE_CALENDAR_ID
    (variable Vercel morte). Le « nettoyage 214 orphelins » est CLOS (plancher).
  - **Observabilité crons** : aucune alerte si un cron échoue aujourd'hui (relances tournait à vide
    sans que ce soit vu — car pas encore utilisé). À ajouter avant de dépendre du cron en prod.
  - **Dette** : tokens OAuth Google en CLAIR en base (iCloud chiffré AES-256-GCM, crypto.js existe →
    chiffrer Google aussi, lot dédié). date_heure_old à DROP.

  🔵 B10 — WEBHOOK GOOGLE (temps réel) — NOTÉ, PAS COMMENCÉ (après B9) :
  - Sync Google→BATILIS ~4s au lieu de 15 min. events.watch = ping « qqch a changé » → déclenche le
    pull incrémental existant. Ne REMPLACE PAS le cron (Google ne garantit pas 100% des notifs → cron
    15 min = filet de sécurité, modèle hybride).
  - Prérequis lourds : domaine vérifié Google Cloud, endpoint HTTPS, stockage channel_id + sync_token,
    et JOB DE RENOUVELLEMENT (canaux expirent ~1 semaine, sinon sync muette sans erreur). iCloud n'a
    pas de webhook.

  🔵 COUCHE 2 PARSING SUR HISTORIQUE — ABANDONNÉ. Le plancher supprime le besoin (on ne réimporte plus
  l'historique). Le parser (parse-event.js) est réutilisé par B4 pour les NOUVEAUX events. La branche
  feat/etage3-couche2-parseevent dort (code réutilisable).

### ✅ SOFT DELETE AGENTE + nettoyage comptes test (30/06-01/07)
Voir bloc A ci-dessus (item détaillé). Désactiver au lieu de supprimer, réversible, résout le blocage FK. 3 vraies agentes restantes.

### ✅ TS — TRAVAUX SUPPLÉMENTAIRES (finance.js) — COMPLET (01/07 + 09/07)
Règle (validée Marine) : devis dont `devis_artisans.date_signature > pivot` = TS. **Pivot** = `suivi_financier.date_paiement` de la ligne `honoraires_courtage` réglée. date_signature du DEVIS (pas du contrat). Seuls devis signés comptent. Comparaison STRICTE. Pas de pivot → aucun TS.
- **TS-1 — cas AMO** (mergé 227622f) = RE-VENTILATION, total INCHANGÉ : le courtage des devis TS bascule en AMO. finance.js additif (getPivotCourtage, sousTotalApresPivot, honorairesCore + {totalHTApres, totalTTCApres} défaut 0 = non-régression prouvée) + plumbing suiviFinancier → 3 PDF. Testé réel Jadras (courtage 8090,09→7664,26, total 17528,53 inchangé).
- **TS-2 — cas courtage-only** (mergé 52f181e + 4db5941, socle SQL appliqué) = ÉCHELONNEMENT de l'encaissement (pas un supplément au total). Total courtage = base × taux INCHANGÉ, ventilé en « courtage initial » (hors TS) + lignes « courtage TS » (type_echeance='honoraires_courtage_ts', cochables). Mécanique L1/L2 : un TS s'ajoute à la dernière ligne TS non-payée (recompute idempotent) sinon nouvelle ligne ; une ligne payée est close. RPC suivi_courtage_ts_upsert. Index unique partiel relâché pour ce type. Déclenchement AUTO à la signature (2 handlers). finance.js calculateCourtageTS (additif, non-régression prouvée). Garde-fou : dé-cochage du courtage initial bloqué tant qu'il y a des TS (sinon perte du pivot). Écran + 3 PDF (Suivi/Dossier avec statut, Recap sans). Testé réel, total identique. → **Feature TS COMPLÈTE.**

---

## 4. CONVENTIONS & RÉFÉRENCES TECHNIQUES

### Stack & identifiants
- Next.js / Supabase / Tailwind / Vercel. Repo `github.com/AnneLiseC/illico-app`. Projet Supabase `illico-app` (`tfqtzfyavitrcsgbuueq`).
- **Source de vérité CALCULS** : `app/lib/finance.js`.
- Société CTP : `ef2128ea-4660-4c74-ba17-6910be523efd`. Agence Martigues : `0fe5e7a1-4015-40cc-9854-e60d03b56ab9` (code MA00).
- Société de test (onboarding) « TEST 1 » : `65fad1cc-700d-4d1d-9524-ad972718bb39`, admin epfedu `d77de619-bfa1-4907-999c-51a9f74da2eb`. **Terrain de test MULTI-AGENCE : 3 agences** (MA00 « illiCO TEST » Marseille `426ca388` + MO00 « illCO travaux TEST 3 » Montpellier `8759fabb` + PA00 « AGENCE » Paris `9a2557db`).

### Acteurs de test
- Admin CTP (Marine) : `048e524e-1973-406d-8a41-620bbb8a6a14` (agence_id NULL).
- Compte onboarding test : `anne-lise.caillet@epfedu.fr` (exception STAFF_EMAIL_EXCEPTIONS).
- Exceptions domaine staff : `anne-lise.caillet@outlook.com,anne-lise.caillet@epfedu.fr` (définies dans Vercel Prod+Preview).

### Tables (métier)
artisans (société-wide), artisans_specialites, chantier_documents, chantier_fiches_techniques, clients, comptes_rendus, devis_artisans, dossiers, factures_agente, factures_artisans, fiches_techniques, **comptes_oauth** (ex-google_tokens, renommé lot 6a : multi-fournisseur google/outlook/icloud, UNIQUE (user_id, fournisseur)), interventions_artisans, messages, notifications, objectifs_ca, photos, profiles, redevances, rendez_vous, specialites, suivi_financier. + `admin_invitations` (onboarding, service_role-only). + `societes`, `agences`. + **`cibles_calendrier`** (calendrier étage 2 : un RDV → une cible = agenda externe précis, calendar_id + compte_oauth_id + agenda_nom, agence XOR perso). + `comparateur_simulations`, `comparateur_lignes`.
Colonnes ajoutées notables : `profiles.actif` (soft delete agente), `profiles.acces_actif` + `profiles.cible_calendrier_defaut_id`, `dossiers.date_cloture` + `acces_expire_le`, `devis_artisans.pv_path`, `rendez_vous/interventions.cible_id` + `agence_id`/`societe_id`, `messages.edited_at`. `suivi_financier.type_echeance` inclut `honoraires_courtage_ts` (TS-2). RPC ajoutées : `suivi_courtage_ts_upsert`, `desactiver_acces_expires`, `mon_expiration_client`, `mes_dossiers_client`.

### Leçons clés
- **SQL editor Supabase tourne en `authenticated` par défaut** → `RESET ROLE;` en tête de chaque bloc privilégié (DDL, tables protégées, REVOKE/GRANT, fonctions service_role-only).
- **Unicité d'une colonne** : vérifier `pg_indexes` ET `pg_constraint` (un CREATE UNIQUE INDEX manuel n'apparaît pas dans pg_constraint).
- **Tester après chaque MT** : le blocage NOT NULL/INSERTs (fin Phase 2) et le blocage RLS lecture agences (MT5) ont été révélés par le test, pas devinés.
- **Table service_role-only** : RLS activée + 0 policy + REVOKE anon/authenticated (service_role bypass).

---

## 5. CONSIGNES PROCESS (permanentes, en tête de CHAQUE lot)

1. **SYNC AVANT TOUT** : `git fetch origin && git checkout main && git pull origin main`, confirmer le HEAD, AVANT tout audit ou patch. Jamais de travail sur HEAD désynchronisé.
2. **BRANCHE NEUVE par lot** : ne jamais réutiliser une branche déjà mergée. Une branche = un lot.
3. **MCP = LECTURE SEULE stricte.** Tout SQL = fichier versionné `docs/sql/` appliqué manuellement (contrôle AVANT/APRÈS + rollback).
4. **Conception d'abord pour les gros lots d'archi** (pas audit-puis-code direct).
5. **Tests sécu = bidirectionnels.** SQL : appliquer + tester en base AVANT de committer le fichier.

---

## MODÈLE PRICING & QUOTAS — architecture actée (10/06), montants en hypothèse à valider. VU AVEC UN EXPERT. CA CONCERNE UN EXPERT MAINTENANT;

### Décision d'enforcement (ACTÉE, à coder — étape 1)
Gating par QUOTA, pas par autorisation manuelle. Le franchisé crée librement DANS son quota (autonome, Anne-Lise hors boucle) ; au-delà → refus + message d'upgrade. Ne JAMAIS reproduire « contactez Anne-Lise » (goulot manuel, ne facture/trace rien).
- Champs sur `societes` : plan + quotas (max_agences + logique agentes ci-dessous).
- `create-agence` (route service_role sécurisée) : vérifier quota agences AVANT création, sinon refus + message upgrade.
- `create-agente` (route service_role sécurisée) : vérifier quota agentes AVANT création. POST uniquement (PATCH/DELETE ne créent pas).
- Atout : la base compte déjà nativement (agences par societe_id, agentes par profiles role=agente) → source de vérité de facturation gratuite.

### Grille tarifaire — STRUCTURE actée, MONTANTS = hypothèse (NON validée terrain)
- **60€/mois par agence** + **50€/mois par agente**. Additif, CONSTANT, AUCUNE dégressivité, aucune agente incluse.
- Type A (1 agence, 3 agentes) = 60 + 150 = **210€/mois**.
- Type B (2 agences, 5 agentes) = 120 + 250 = **370€/mois**.
- Dégressivité REJETÉE (débat tranché 10/06) : les gros franchisés tirent PLUS de valeur du multi-agences → pas de remise au volume qui sous-paierait là où on apporte le plus. Benchmark franchise (Delightree) = prix par établissement à plat.
- → Conséquence quota CODE : prix additif simple (nb_agences × 60 + nb_agentes × 50), pas de notion de rang ni d'agente incluse → le modèle de souscription en base est un simple comptage, pas un calcul par rang.
- ⚠️ À TRANCHER avant de coder le gating : comportement au DOWNGRADE (société passant de 3 à 1 agente : blocage de création seul, ou désactivation des agentes en trop ?).
- ⚠️ 60/50 = hypothèse argumentée (ancre 150€, marge, coût de revient) mais NON validée terrain. Reste 1/3 du coût subi 150€/agente → marge à la hausse possible (50→60€ agente = +19% CA). À confronter au sondage avant de figer.

### Étude viabilité/prix — état
- [x] DROIT de commercialiser : OK, pas de clause non-concurrence (outils suivi/CRM autorisés).
- [x] Risque concurrence franchise : LEVÉ — leur logiciel obligatoire ne gère ni agentes ni suivi chantier réel ; 40/40 franchisés favorables ; leur API s'ouvre → BATILIS complémentaire (sur-couche), pas concurrent.
- [x] ANCRE : logiciel franchise = 150€/AGENTE/mois, COÛT SUBI obligatoire (franchisé → illiCO France). BATILIS = outil CHOISI, préféré, à 1/3 du prix → forte élasticité, comparaison mentale = 150€ pas 0.
- [x] Marché : ~150 franchisés, cible réaliste ~50.
- [x] Coût de revient CALCULÉ : API Claude (Haiku, ~0,014$/CR × 30 CR/mois) ≈ 0,40€/agente/mois. Infra (Supabase + Vercel) FIXE partagée, ~3-4€/franchisé à 50. Marge brute ~96-98%. Le prix N'EST PAS contraint par les coûts — vrai coût limitant = TEMPS d'Anne-Lise (support solo). Le prix doit financer la délégation.
- [x] SONDER 5-6 franchisés favorables avec prix CONCRET (« 60€/agence + 50€/agente, soit ~210€ pour ton agence type — OK ? »). Seul vrai inconnu restant. Teste aussi l'INTENTION D'ACHAT (≠ préférence produit). À faire avant de figer.
- [x] RDV COMPTABLE (prérequis bloquant) : passage en société, seuil micro, impact ARE, TVA, SASU/EURL, salaire vs dividendes.

### Prévisionnel chiffré (10/06) — grille 60/50, trajectoire 5→50 sur 2 ans
- CA état stable : 5 clients 14,5k€ | 10 : 29k€ | 25 : 72,6k€ | 50 : 145k€/an.
- 🔴 PASSAGE EN SOCIÉTÉ dès An1 : plafond micro-BIC services ~77,7k€ dépassé dès ~25 clients. RDV comptable AVANT 1er encaissement.
- Charges An2 (50 clients) : infra ~1,5k + API ~1k + Stripe ~2,9k + compta ~3k + outils ~1,2k ≈ 9,6k€ → marge avant rému ~135k€.
- Avec salaire ~45k net (coût chargé ~72k) : reste ~50k résultat avant IS. Vrai business à 50 clients.
- ⚠️ TRAVERSÉE : 5→~20 clients (An1) ne couvre PAS un salaire plein → garder AMO en parallèle / réserves jusqu'à ~25-30 clients. ~18 mois avant que ça nourrisse.
- ⚠️ PLAFOND SUPPORT SOLO ~20-25 clients : embaucher (résultat An2 le permet) ou plafonner. Ne pas descendre le socle sous 60€/agence ni l'agente sous 50€.

> NON dans ce top (et pourquoi) : gating quota (bloqué par décision downgrade + RDV comptable, ne pas figer une grille hypothétique) ; calendrier étage 3 (pull retour → BATILIS + nettoyage 214 orphelins, chantier dédié tête fraîche — l'étage 2 descendant EST fait) + chiffrement tokens Google ; optimisation BDD advisor (dette d'échelle, inutile au volume actuel).
> Hors-code prioritaires (rappel) : 🔴 RDV comptable, 🔴 sondage prix terrain.