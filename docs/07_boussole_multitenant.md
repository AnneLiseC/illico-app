# 07 — BOUSSOLE MULTI-TENANT BATILIS

> **État vivant du projet.** Lue par Claude (binôme) et Claude Code en tête de chaque session.
> Le détail historique (journal des commits, chantier finances) est dans `07_journal_multitenant.md`.
> Dernière mise à jour : 07/06/2026.
> **Statut : onboarding L14b complet + cloisonnement prouvé. Chantier MULTI-AGENCE en cours — Lots 1-2 FAITS (création d'agence + vue active/navbar bi-zone).** Phases 1-5 closes, app multi-tenant fonctionnelle et cloisonnée.

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

### 🔜 RESTE À FAIRE

#### Bloc A — Sécurité (avant ouverture multi-franchise réelle) — quasi soldé
- [ ] **🔴 Purge Storage automatique à la suppression** (dette bloquante en multi-agences). Cascade DB supprime les lignes, pas les fichiers Storage → purge applicative à rendre systématique (suppression chantier OK sauf `cr/` ; suppression client à construire ; SQL directs jamais purgés). Constat 02/06 : 21 orphelins nettoyés à la main.
- [ ] **Durcissements restants** (hygiène, faible gravité) : (a) EXECUTE anon/PUBLIC encore sur certaines fonctions trigger ; (b) policy INSERT `notifications` `WITH CHECK(true)` → resserrer avec Messagerie (bloc F) ; (c) leaked password protection (plan Pro) ; (d) captcha (optionnel).
- [ ] **Storage placeholder `factures_agente/.emptyFolderPlaceholder` visible cross-société** (07/06) — hygiène, PAS une fuite (0 octet). Restreindre/supprimer ces placeholders.
- [x] **Audit des index UNIQUE reliques mono-tenant** ✅ FAIT (09/06). 38 index examinés : tous sains (PK sur id, ou portent societe_id/agence_id, ou uniques par nature : siret/user_id/email/specialites). Seul `objectifs_ca` était cassé → corrigé au 4c-1. Aucune autre correction nécessaire. ⚠️ Note : `specialites_nom_key` est global VOLONTAIREMENT (référentiel commun) — à repasser en `(societe_id, nom)` SI un jour les franchisés créent leurs propres spécialités.
- [x] **Validation finances multi-agence sur vraies données** ✅ FAIT (09/06). Agentes Marie (Marseille) + Manon (Montpellier) créées sur TEST 1 + redevances réparties (Marseille 4500€, Montpellier 1300€). Scoping prouvé à l'écran : Consolidé 5800 / Marseille 4500 / Montpellier 1300, objectif par agence correct, badge « Filtré sur » OK. Montants déjà prouvés par non-régression CTP. → Finances multi-agence validé.

#### Bloc B — Multi-agence réel (chantier en cours, découpé en 5 lots)
> **Principes verrouillés** : la « vue active » est un filtre d'AFFICHAGE (UX), PAS une frontière de sécurité — la RLS reste l'unique frontière (admin = toute sa société, il a le droit de tout voir). Défaut admin multi-agences = vue Consolidée (toutes agences). Agente = une seule agence, aucun sélecteur. **Garde-fou permanent** : une société à 1 agence (CTP/Marine) ne doit voir AUCUN changement à aucun lot. ⚠️ CTP reste mono-agence jusqu'à la fin du chantier ; le terrain de test multi-agence = société TEST 1 (2 agences : MA00 Marseille + MO00 Montpellier).

- [x] **Lot 1 — Création d'agence** ✅ FAIT (07/06, mergé `0ec94eb`). Route `/api/create-agence` (service_role, `requireRole(['admin'])`, `societe_id` dérivé du JWT jamais du body) + modale dans paramètres + `chargerAgence` corrigé (`.single()` → liste `order('code')`) + affichage liste (société une fois, N sous-blocs agence) + bloc objectif d'agence masqué si ≥2 agences. `code` LLNN auto (trigger), non affiché. Sécurité `societe_id` prouvée par lecture du code (jamais lu du body). Testé : non-régression 1 agence, création 2e agence (TEST 1 : MO00 généré), 403 agente.
- [x] **Lot 2 — Vue active + navbar bi-zone** ✅ FAIT (07/06, mergé `c05f9c6`). État `agences`/`agenceActive`/`setAgenceActive` dans AuthContext. `agenceActive` : `null` = Consolidé/pas de filtre (agente, admin mono, admin multi par défaut) ; uuid seulement si admin multi clique un onglet (= filtre d'affichage choisi, PAS l'agence de rattachement). Persistance localStorage `batilis.agenceActive.<user.id>`, validée contre la liste réelle au montage (pas de race, calcul après chargement agences), purgée au logout. Navbar bi-zone (onglets « Toutes les agences » + une par agence) rendue uniquement si `admin && agences.length>=2` ET navbar déployée ; clic change l'état sans naviguer. Sous-titre logo reflète la vue active en cas admin-multi seulement. AUCUN écran scopé (Lot 4). Testé : non-régression CTP (1 agence, navbar inchangée), bascule + persistance F5 + validation valeur bidon sur TEST 1, agente sans onglet.
- [x] **Lot 3a — Sélecteur d'agence (create-agente)** ✅ FAIT (08/06, mergé `f863076`). Route `create-agente` : double comportement — `agence_id` du body validé contre `societe_id` du JWT (400 « Agence invalide » si étrangère, AVANT l'invite = pas d'orphelin auth) / absent → déduction `.order('code').limit(1)`. L'agence résolue alimente profil ET objectifs_ca. Modale : `<select>` si `agences>=2` (source `useAuth()`), défaut = `agenceActive` (modifiable), choix forcé si Consolidée. + `refreshAgences()` exposé par AuthContext (recharge la liste sans toucher `agenceActive`, appelé après création d'agence Lot 1). Garde-fou CTP : à 1 agence, pas de select, route déduit, inchangé. Testé : non-régression CTP, création ciblée TEST 1, pré-remplissage, refreshAgences (3e agence sans reload), sécurité agence étrangère.
- [x] **Lot 3b — Sélecteur d'agence (clients/nouveau)** ✅ FAIT (08/06, mergé `9d866af`). Branche référente=admin : si ≥2 agences → `<select>` (source useAuth, défaut agenceActive, choix forcé si Consolidée) ; si 1 agence → déduction `.order('code')`.Q  AAAAAAA Référente=agente → agence de l'agente (inchangé). Insertion client direct sous RLS : double barrière préexistante (policy `clients_scope` WITH CHECK societe_id + trigger `derive_societe_id_from_agence`) + validation `agences.some()` côté client. Garde-fou CTP inchangé.
- [x] **Lot 4 — Scoping des écrans par `agenceActive`** ✅ FAIT (09/06). Pattern `useMemo` (null=tout, uuid=filtre). 4a dashboard/clients/chantiers, 4b planning, 4c finances complet.
  - [x] **4a — dashboard + clients + chantiers** ✅ FAIT (08/06, mergé `85ce8a2`). `agence_id` ajouté au select dashboard. Agrégats (CA, compteurs) sur données scopées. Dashboard reste « mes dossiers » (bug #8 = voulu) + filtré agence. Garde-fou CTP/agente (agenceActive null) inchangé. Testé : non-régression, bascule sans reload, cohérence agrégats.
  - [x] **4b — planning + widget RDV dashboard** ✅ FAIT (08/06, mergé `579d7d0`). RDV/interventions filtrés via dossier parent (`matchAgence` 3 cas, transverse `!dossier_id` toujours visible — 214/246 RDV sans dossier). Jalons chantier + stat « Chantiers actifs » + dropdowns création scopés via `dossiersScoped` (agence_id direct). Widget « RDV du jour » dashboard idem. Testé OK.
  - [x] **4c — finances** (FINI LE 09/06 ✅). Option B ciblée : scoper + assainir les calculs touchés. Découpé en sous-lots.
    - [x] **4c-1 — objectif d'agence scopé** ✅ FAIT (08/06, mergé `aff72fd`). `getObjectif('agence')` sensible à `agenceActive` (uuid → objectif de l'agence ; null → somme société). Branche `'agente'` intacte. + **migration SQL `docs/sql/l4c1_fix_index_objectif_agence.sql`** : index `objectifs_ca_agence_unique` corrigé `(annee,cible)` → `(annee,cible,agence_id)` — corrige un bug multi-tenant (l'ancien index n'autorisait qu'UN objectif d'agence par an pour TOUTE la base → bloquait tout 2e franchisé). Testé : valeurs par agence, somme Consolidé (350k), agence sans objectif = 0 (pas de fuite), non-régression CTP.
    - [x] **4c-2 — KPI + redevances** ✅ FAIT (09/06, mergé `87871e3`). `redevancesScoped` (useMemo) injecté dans `totalNetCTP` uniquement : agente → mesRedevances (inchangé) ; admin Consolidé → toutes ; admin vue agence → `r.agence_id === agenceActive`. Corrige B1 (CA net ne mélange plus les redevances des autres agences). `pctObjectif` désormais cohérent (numérateur 4c-2 + dénominateur 4c-1 même périmètre). Suivi NON touché (4c-3). Validé : non-régression CTP + scoping prouvé par code (pas de redevances sur TEST 1).    
    - [x] **4c-3 — Périmètre unique finances** ✅ FAIT (09/06, mergé `b25b0c4`). `scopedDossiers` filtre `agenceActive` en amont du pill (agence maître, pill raffine dedans) → corrige la dette 4c-2 (produits enfin scopés agence). `redevancesScoped` aligné sur le même double filtre (4 cas : agente / admin+tous / admin+moi / admin+agente). Pill agente filtré par agence active + réinit à 'tous' au changement de vue (anti-périmètre-vide). Modèle verrouillé : sélecteur d'agence = navbar uniquement ; un seul périmètre pilote KPI+F1/F2+Suivi+Synthèse. Validé : non-régression CTP + bascule TEST 1 ; pill/redevances par lecture de code (pas de données réparties sur TEST 1).
    - [x] **4c-4 — Scoping Suivi** ✅ FAIT (09/06, mergé `85b6143`). 5 usages `dossiers`→`scopedDossiers` (dont reduce apporteur l.1308) + 8 lignes `redevances`→`redevancesScoped`, en remplacements EXPLICITES (alias rejeté : shadowing trompeur sur du comptable). Grep de complétude : 0 occurrence nue restante dans le Suivi. Royalties inline suivent auto (via agrégats). Helper `libellePerimetre()` + badge « Filtré sur » (réutilisable 4c-5). Validé : non-régression CR CTP complet (mois + année).
    - [x] **4c-5 — Scoping Synthèse** ✅ FAIT (09/06, mergé `6ff525f`). `reelData` repointé `rowsReelAnneeEnCours`→`rowsReelScoped` (équivalence prouvée : même `agrégerParPaiement`, seule la liste diffère), global mort supprimé. `previData`/donut déjà scopés (4c-3). Badge indicateur (helper 4c-4). Synthèse = périmètre unique (B4 fermé). Validé non-régression CTP.

- [ ] **Lot 5 — Paramètres multi-agences** : édition de chaque agence (aujourd'hui lecture seule), gestion fine. + le vrai « objectif par agence » (qui attend l'agence active du Lot 2). Assez isolé, peut venir tôt ou tard.

#### Bloc B-bis — Facturation
- [ ] **L16 Facturation scopée/consolidée** (par agence sur onglets agence ; somme société sur vue consolidée). Lié au Lot 4 finances.

#### Bloc C — Onboarding self-service (reste)
- [ ] **3d page stats plateforme** — reportée backlog (pas utile tant qu'un seul franchisé ; compteurs visibles via dashboard Supabase).
- [ ] **SMTP custom pour l'onboarding en prod** : le SMTP par défaut Supabase est bridé (rate limit ~quelques emails/h, rencontré au test 07/06). Nécessaire avant d'inviter de vrais franchisés en volume (Resend/SendGrid ou Microsoft Graph déjà utilisé pour les relances).

#### Bloc D — Bugs & dette (non bloquants)
- [ ] **Boutons morts Finances** : « Saisir un règlement », « Exporter le bilan », export CSV rendus sans `onClick`. Câbler ou masquer.
- [ ] **`redevance_debut` ignoré à la création d'agente** : champ pas dans le body POST `/api/create-agente` (seule l'édition le persiste).
- [ ] **L18 bug ajout intervention** : ⚠️ audit d'abord, STOP si lié à la sync Google Calendar.
- [ ] **L22 bug synchro Google Calendar** : `Cannot access 'n' before initialization` (TDZ — `const auth` l.143 shadow l.128 dans `api/google/calendar/sync/route.js`). Fix : renommer le 2e `auth` en `oauthClient`. ⚠️ Lié au calendrier Google partagé entre agences (fuite multi-tenant à creuser).
- [ ] **Types de RDV incomplets** : `TYPE_CONFIG` n'expose que 4 types (R1/R2/R3 + autres), manquent suivi/réception/Étude/Pro-Perso. Audit des types voulus d'abord.
- [~] **Dynamisation des hardcodes CTP/Martigues** (EN COURS). Audit fait (09/06) : ~24 occurrences à traiter, distinction rôle (« CTP »=structure → terme « Société » statique) vs identité (nom franchisé → agence.nom/nom_societe). Emails propres (0 hardcode). Réserve : vérifier branding figé dans les PDF sep_*.js base64.
    - [x] **Sous-lot 1 — plomberie** ✅ FAIT (09/06, mergé `b0cce09`). `societe:societes(id, nom_societe)` embarqué dans fetchProfile + exposé `societe` dans useAuth(). ⚠️ Colonne = `nom_societe` (pas `nom`). Sert surtout aux libellés d'identité (les libellés de rôle utilisent « Société » statique).
    - [ ] **Sous-lot 2 — libellés de rôle → « Société »** : ~18 libellés finances/paramètres/chantiers. Statique, pas de nom dynamique.
    - [ ] **Sous-lot 3 — portail client** (espace-client:253) → agence.nom. Client-facing.
    - [ ] **Sous-lot 4 — CR généré** (cr/route.js:34) → agence.nom dans buildSystemPrompt. Sensible (document).
- [ ] **Template email Reset Password en français** (Supabase dashboard, déclaratif).
- [ ] **Code mort finance.js 🟠 restants** : devis.statut/montantTTC, apporteur.lines[].* — grep non concluant ou lines itéré dynamiquement. Relecture site par site requise. Pas prioritaire.
- [ ] **Idées futures** : `artisans.metier` texte libre → liste depuis `specialites` + `artisans_specialites` ; IA lecture attestations décennales → spécialités auto.
- [ ] **#8 dashboard admin scope** (à arbitrer selon scénario testeur).
- [ ] **`espace-client/page.js:253`** « illiCO travaux Martigues » : reporté avec le dev espace-client.

#### Bloc E — Refonte UX vues finances (post-test, à froid)
- [ ] **Refonte des 5 onglets finances** (F1/F2/Synthèse/Suivi/Facturation se chevauchent).
  - Objectif affiché par périmètre (incohérence assumée : agente voit objectif AGENCE). Cible : objectif qui suit rôle ET périmètre.
  - Vue « compte de résultat agente » (produits − charges = net réel agente).
  - Barre objectif MENSUEL agence à 0 (le numérateur ne tape pas le bon calcul ; `o.mois` colonne inexistante → décision produit : objectif mensuel = annuel/12 ?).

#### Bloc F — En dernier : réactiver modules neutralisés
- [ ] **Réactiver Messagerie + Statistiques** (code conservé à `3dbd6f1`). Adapter au multi-tenant (RLS agence messages, scope agence stats). + resserrer policy INSERT `notifications` ici.

---

## 4. CONVENTIONS & RÉFÉRENCES TECHNIQUES

### Stack & identifiants
- Next.js / Supabase / Tailwind / Vercel. Repo `github.com/AnneLiseC/illico-app`. Projet Supabase `illico-app` (`tfqtzfyavitrcsgbuueq`).
- **Source de vérité CALCULS** : `app/lib/finance.js`.
- Société CTP : `ef2128ea-4660-4c74-ba17-6910be523efd`. Agence Martigues : `0fe5e7a1-4015-40cc-9854-e60d03b56ab9` (code MA00).
- Société de test (onboarding) « TEST 1 » : `65fad1cc-700d-4d1d-9524-ad972718bb39`, admin epfedu `d77de619-bfa1-4907-999c-51a9f74da2eb`. **Terrain de test MULTI-AGENCE : 2 agences** (MA00 « illiCO TEST » Marseille `426ca388` + MO00 « illCO travaux TEST 3 » Montpellier `8759fabb`).

### Acteurs de test
- Admin CTP (Marine) : `048e524e-1973-406d-8a41-620bbb8a6a14` (agence_id NULL).
- Compte onboarding test : `anne-lise.caillet@epfedu.fr` (exception STAFF_EMAIL_EXCEPTIONS).
- Exceptions domaine staff : `anne-lise.caillet@outlook.com,anne-lise.caillet@epfedu.fr` (définies dans Vercel Prod+Preview).

### Tables (22 métier)
artisans (société-wide), artisans_specialites, chantier_documents, chantier_fiches_techniques, clients, comptes_rendus, devis_artisans, dossiers, factures_agente, factures_artisans, fiches_techniques, google_tokens, interventions_artisans, messages, notifications, objectifs_ca, photos, profiles, redevances, rendez_vous, specialites, suivi_financier. + `admin_invitations` (onboarding, service_role-only). + `societes`, `agences`.

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

## 6. PROCHAINE ACTION

**Chantier multi-agence, Lot 2 — Vue active + navbar bi-zone.** C'est le morceau le plus architectural : créer de zéro l'état « dans quelle agence je suis » (inexistant aujourd'hui) + la navbar bi-zone. Commencer par une CONCEPTION (où vit l'état, comment il persiste, comment la navbar bascule, garde-fou « invisible si 1 agence ») avant tout code. Tester sur TEST 1 (2 agences) ET sur CTP (1 agence = aucun changement visible).