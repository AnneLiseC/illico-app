# 07 — SPRINT MULTI-TENANT BATILIS

> Boussole du sprint. Lue par Claude (binôme) et Claude Code à chaque session.
> Créé le 28/05/2026. Statut : **PLAN PRÊT** (audits 1/2/3 ✅, plan d'exécution 6 phases ✅). Prochaine étape : exécution Phase 1.

---

## 0. CADRE

- **Objectif** : transformer l'app mono-agence en plateforme SaaS multi-tenant. Un franchisé externe doit tester sur SES données isolées, valider, et faire de la pub.
- **Deadline** : 2 à 3 semaines (échéance ~mi-juin 2026). Tendue, sans gras.
- **Enjeu critique** : cloisonnement = ZÉRO faille. Une fuite de données entre franchises (potentiellement concurrentes) = mort du produit. Sur la sécurité, le critère n'est pas « peu de bugs » mais « zéro faille ».
- **Méthode** : audit/plan AVANT code. Un changement à la fois. Test à l'écran ET en base avant merge. SQL en fichier `docs/sql/` appliqué main (jamais MCP), avec contrôle AVANT/APRÈS + rollback. Toute affirmation de schéma confrontée à `information_schema`/`pg_catalog` (leçon `comptes_rendus.pdf_path`).

---

## 1. MODÈLE CIBLE — VERROUILLÉ

### 1.1 Produit
- Nom = **BATILIS** (remplace tout branding illiCO dans navbar, login, titre, métadonnées — pour toutes les agences).
- Seules des agences **illiCO** utilisent l'app → le contenu réseau illiCO reste commun (voir 1.5).

### 1.2 Hiérarchie — 3 niveaux
```
Société  →  Agence(s)  →  Utilisateurs
```
- **Société** : entité juridique (raison sociale, SIRET). Ex : CONSEIL TRAVAUX PROVENCE (CTP), SIRET 948 096 888.
- **Agence** : le point de vente / la franchise locale. Ex : « Agence de Martigues » (illiCO travaux Martigues).
- **Une société peut détenir PLUSIEURS agences** (cas réel : franchisé d'Aix-en-Provence possède Aix + Pennes-Mirabeau).

### 1.3 Rôles applicatifs — 2 niveaux (on garde `admin`/`agent`, pas de migration de la colonne `role`)
| Rôle | Rattaché à | Voit |
|---|---|---|
| `admin` (franchisé) | sa **société** (`profiles.societe_id`) | TOUTES les agences de sa société |
| `agent` | son **agence** (`profiles.agence_id`) | SES dossiers (clients/chantiers) de SON unique agence |

- Un franchisé n'est JAMAIS « juste dans une agence » — il gère tout ce qu'il possède.
- Un agent est TOUJOURS dans une seule agence.
- **Anne-Lise (dev)** : AUCUN rôle applicatif privilégié. Pas de super-admin dans l'UI. Accès INFRASTRUCTURE uniquement (propriétaire projet Supabase → SQL/logs pour débug), encadré par déontologie + clause confidentialité CGU (à terme). Emprunte le compte Marine (avec accord) pour la vue admin. Argument commercial : « dans l'app, je ne vois que ma franchise ».

### 1.4 Cloisonnement des données
- **Tables racines portent `agence_id` en propre** : `dossiers`, `clients`, `artisans`.
- **`profiles`** porte `societe_id` (pour admin) ET `agence_id` (rempli pour agent, **NULL pour admin** cf D14).
- **`agences.societe_id`** (l'agence appartient à une société).
- **Tables filles héritent l'agence par JOIN** (pas de dénormalisation) :
  - via `dossier_id` → `dossiers.agence_id` : `devis_artisans`, `factures_artisans`, `photos`, `rendez_vous`, `comptes_rendus`, `suivi_financier`, `interventions_artisans`, `chantier_documents`, `chantier_fiches_techniques`, `messages`.
  - via `agente_id` → `profiles.agence_id` : `factures_agente`, `redevances`, `objectifs_ca`.
  - via `artisan_id` → `artisans.agence_id` : `fiches_techniques`, `artisans_specialites`.
  - via `user_id` → `profiles` : `notifications`, `google_tokens` (cloisonnement par user, pas par agence — cf. Cas 5).

### 1.5 Branding — distinction clé
- **PRODUIT = BATILIS** : navbar, login, titre, métadonnées → BATILIS partout.
- **Contenu COMMUN réseau illiCO** (semi-fixe, NON configurable) :
  - Slogan « Quand vous pensez travaux, pensez illiCO ! » (identique toutes agences).
  - Marque « illiCO travaux » dans PDF/emails clients, header espace-client, « Équipe illiCO ».
- **Coordonnées DYNAMIQUES** (fin du hardcode CLAUDE.md §3) :
  - portées par `societes` : raison sociale, SIRET.
  - portées par `agences` : nom agence, ville, nom responsable (ex « Marine MICHELANGELI »), email, logo, adresse, téléphone.
  - Les valeurs actuelles de Marine (en dur dans `parametres/page.js:276-283` + `restitution.js:39`) deviennent la config de SA société/agence.
- **Login** : placeholder `nom.prenom@illico-travaux.com` conservé (tous les users sont illiCO).

### 1.6 Navbar
- **Mono-agence** (ex Marine) : navbar actuelle inchangée, rien de spécial.
- **Multi-agences** (ex Aix) : deux zones —
  - **Haut** : onglets par agence (Agence N, Agence N+1...), chacun scopé à son agence. Dynamiques selon nb d'agences.
  - **Séparateur**.
  - **Bas** : nav consolidée « toutes agences » : Tableau de bord, Chantiers, Clients, Artisans, Planning, Finances, Messagerie, Statistiques — chacun avec le tri franchisé/agents existant.

### 1.7 Facturation
- Par agence sur les onglets agence.
- **Consolidée** sur la vue « toutes agences » (somme des agences de la société). Implique un paramètre de scope (agence unique vs ensemble société) passé aux calculs.

### 1.8 Artisans
- Par agence pour l'instant (`agence_id`). Partagé-société = évolution future.

### 1.9 Onboarding (inscription) — flow cible VERROUILLÉ
1. **Anne-Lise envoie un lien d'invitation nommé** (par email) à chaque nouveau franchisé. Contrôle à l'entrée — pas d'inscription libre.
2. **Double barrière** : il faut le lien ET une adresse `@illico-travaux.com` (validée à la création). Confirmé : TOUS les franchisés illiCO ont une adresse `@illico-travaux.com` (domaine universel du réseau).
3. Via le lien, le franchisé crée : **société + sa première agence + son mot de passe** (compte admin créé dans la foulée).
4. Une fois connecté, il ajoute ses **autres agences**.
5. Puis il ajoute ses **agentes**, chacune rattachée à une agence précise (formulaire « + nouvelle agente » avec sélecteur d'agence si plusieurs ; `/api/create-agente` à adapter pour la notion d'agence).

Mécanisme : réutilise `inviteUserByEmail` (déjà en place pour les agentes), étendu pour créer une société.

⚠️ **Découpage test vs post-test** : pour le TEST, seul le **fix #1 reconnexion après invitation** (page set-password, lot L14a) est dans le périmètre — Anne-Lise prépare le compte du franchisé testeur en amont. Le **self-service complet** (création société + ajout agence + sélecteur agente, lot L14b) est **reporté post-test**. Cf. plan §5.3/5.4.

### 1.10 Référence de chantier — séquence par agence
Aujourd'hui : référence générée séquentiellement AU GLOBAL sur l'année (`chantiers/nouveau/page.js:56-74`, format `AAAA-CT-NNN`). En multi-agences, deux agences génèreraient des numéros qui se télescopent. → La séquence doit devenir **par agence** (probablement avec préfixe d'agence). Changement fonctionnel réel.

### 1.11 Storage (fichiers) — cloisonnement
Fichiers rangés `chantiers/{dossier_id}/...` dans buckets `documents` et `photos`. Policies Storage NON versionnées (dette).
- **Décision D13** : préfixage par agence + policies cloisonnées + migration → **REPORTÉ post-test** (lot L12, Phase 6), AVANT ouverture multi-franchise réelle.
- Risque résiduel pour le test : un `dossier_id` peut fuiter par copie d'URL depuis un autre compte. En test contrôlé à 1 agence, risque théorique assumé. **Dette sécurité prioritaire** dès la fin du test.

### 1.12 Pour le test — modules NEUTRALISÉS (« bientôt disponible »)
- **Comptes-rendus**, **Messagerie**, **Statistiques**.
- Pas besoin de les rendre multi-tenant parfaitement. Juste neutraliser proprement : ni plantage, ni fuite.

---

## 2. SYNTHÈSE AUDIT 1 — ÉTAT FONCTIONNEL (✅ fait)

22 pages auditées. Détail complet dans l'historique de conversation.

### Bugs bloquants 🔴 (empêchent un nouvel utilisateur)
- **#1 Reconnexion après invitation impossible** (PRIORITAIRE). `/api/create-agente` fait `inviteUserByEmail` (OTP) mais AUCUNE page « définir mot de passe » → l'agente connectée 1 fois ne peut jamais revenir (`otp_expired`). Contournement actuel = mot de passe défini main dans Supabase. Fix : route `/auth/set-password` + `redirectTo` dessus + `updateUser({password})`.
- **#2 Création chantier sans client** : insert avec `client_id:null` possible (`chantiers/nouveau/page.js:86-94`), pas de validation bloquante.
- **#26 P0-9-bis sécurité** : 7 tables opérationnelles non cloisonnées par agente (voir audit 2). CRITIQUE en multi-agences.

### Décisions Anne-Lise sur l'audit 1
- Login Google → SUPPRIMER le bouton (pas câbler).
- Devis TTC sans HT (#3) → PAS un bug (impossible par design). Retiré.
- Planning « Autre_RDV » → hors sprint (visualisation OK).
- Paramètres : ajout d'agence → feature multi-tenant à créer.
- **Bug statut chantier←devis** : un devis « refusé » affiche « devis à modifier » au niveau chantier ; devrait s'afficher SSI un devis est « à modifier ». Mauvaise dérivation. À corriger (hors sprint critique).
- **Barres de progression** (chantier, clients) restent grises (colonne `dossiers.avancement` jamais alimentée). STAND-BY (affichage, non bloquant).
- Branding : 94 occurrences illiCO / 22 fichiers. ~50 à rebrander (UI/PDF/email/prompts), ~44 à NE PAS toucher (clés base `statut_illico`/`date_reglement_illico`/`acomptes_illico` + tags Google Calendar `[illico-int:]`/`[illico-rdv:]` qui casseraient base+sync).

### Autres bugs ⚠️ notés
#5 route `/clients/[id]/modifier` 404 · #8 dashboard admin ne voit que ses propres dossiers · #16 infos agence en dur dans `/parametres` · #29 fallback « Marine MICHELANGELI » en dur `api/pdf/restitution.js:39` · #25 sécu RLS (`get_my_role` exposée anon, notifications INSERT WITH CHECK true).

---

## 3. SYNTHÈSE AUDIT 2 — DONNÉES & SÉCURITÉ (✅ fait, vérifié en base)

### 3.1 Tables réelles : 23 (confirmé `information_schema`) — dont 1 backup à dropper (22 tables métier)
artisans, artisans_specialites, chantier_documents, chantier_fiches_techniques, clients, comptes_rendus, devis_artisans, dossiers, factures_agente, **factures_agente_backup_b7b** (backup à dropper), factures_artisans, fiches_techniques, google_tokens, interventions_artisans, messages, notifications, objectifs_ca, photos, profiles, redevances, rendez_vous, specialites, suivi_financier.
- `artisan_documents` et `apporteurs` **n'existent PAS** (apporteur géré par colonnes sur `dossiers` : `apporteur_actif`).

### 3.2 `get_my_role()` — corps réel confirmé
```sql
select role from profiles where id = auth.uid()
```
- `SECURITY DEFINER = true`.
- **FAILLE** : EXECUTE accordé à `PUBLIC, anon, authenticated, service_role`. À durcir (retirer anon/public). Le multi-tenant créera probablement `get_my_societe_id()` / `get_my_agence_id()` sur le même modèle → corriger les faiblesses au même moment.

### 3.3 Rattachement par table (vérifié)
- **Racines (portent leur clé propre)** : `dossiers.referente_id`→profiles ; `clients.referente`→profiles (⚠️ nommage SANS `_id`) ; `factures_agente.agente_id` ; `redevances.agente_id` ; `objectifs_ca.agente_id` (nullable).
- **Via `dossier_id`** : devis_artisans, factures_artisans, suivi_financier, rendez_vous (nullable), interventions_artisans, photos, comptes_rendus, chantier_documents, chantier_fiches_techniques, messages.
- **Partagé (pas de rattachement agente)** : artisans, fiches_techniques.
- `dossiers.avancement` = colonne `integer NOT NULL default 0` (stockée, jamais recalculée → barres grises).
- **Aucune notion agence/societe n'existe** (C.3 = 0 ligne). `profiles` n'a PAS `agence_id`/`societe_id`/`taux_1`/`taux_2`. On part de zéro (propre).
- Curiosité sans impact : `messages.lu_agence` (flag de lecture, rien à voir avec tenant).

### 3.4 RLS actuelles = PATCHWORK de 3 générations (à unifier)
1. **P0-9 propre** (`get_my_role()` + ownership) : dossiers, devis_artisans, factures_artisans, suivi_financier, factures_agente, redevances. ✅ cloisonnées.
2. **Ancienne par rôle seul** (`role IN ('admin','agente')` → toute agente voit tout) : rendez_vous, interventions_artisans, photos, comptes_rendus, chantier_documents, chantier_fiches_techniques, clients, artisans, fiches_techniques, specialites, artisans_specialites, objectifs_ca, messages (côté staff). ❌ = trou P0-9-bis.
3. **Styles mélangés** : `get_my_role()` vs `EXISTS(SELECT FROM profiles...)` vs `auth.uid() IN (SELECT...)`. 3 façons d'écrire la même chose → à unifier.
- **Conséquence** : la refonte RLS multi-agences = TOUTES les policies de TOUTES les tables réécrites en un pattern unique (rôle + société/agence + ownership). Gros morceau, cœur du risque.

### 3.5 FK (vérifié `pg_constraint`)
- **12 FK enfants de `dossiers`** : 10 en CASCADE (devis_artisans, factures_artisans, suivi_financier, rendez_vous, interventions_artisans, photos, comptes_rendus, chantier_documents, chantier_fiches_techniques, messages) ; `factures_agente.dossier_id` = NO ACTION ; `notifications.dossier_id` = SET NULL.
- `profiles.id`→auth.users CASCADE ; `profiles.client_id`→clients SET NULL.
- `clients.referente`→profiles NO ACTION ; FK agente partout NO ACTION ; `google_tokens.user_id`/`notifications.user_id`/`objectifs_ca.agente_id`→profiles CASCADE.
- **Aucune FK vers agences/societes** (à créer).

### 3.6 `profiles` — structure réelle
id, nom, prenom, email, role, created_at, client_id, telephone, part_agente_defaut (0.5), frais_part_agente_defaut (0.5), kbis_url, parts_agente_disponibles (ARRAY), redevance_debut, rib_url, notif_prefs (jsonb), notif_canal_inapp/email/sms, redevance_mensuelle_ht.
→ **À AJOUTER** : `agence_id`, `societe_id`.

---

## 4. DÉCISIONS VERROUILLÉES (références rapides)

- D1. Multi-tenant RÉEL en base partagée (pas instance séparée). Choix assumé malgré le risque/délai.
- D2. 3 niveaux Société→Agence→Users. Tenant data = agence.
- D3. Rôles `admin`(société)/`agent`(agence). Pas de migration colonne `role`.
- D4. Dev = accès infra seulement, pas de super-admin applicatif.
- D5. `agence_id` propre sur racines (dossiers, clients, artisans, profiles) ; héritage par JOIN ailleurs (dette perf assumée, optim post-lancement).
- D6. Admin rattaché société, agent rattaché agence.
- D7. Produit BATILIS ; contenu réseau illiCO commun ; coordonnées agence dynamiques.
- D8. CR + Messages + Statistiques neutralisés pour le test.
- D9. Refonte RLS complète et unifiée (un seul pattern).
- D10. Login Google supprimé.
- D11. Onboarding : lien d'invitation nommé (par email) envoyé par Anne-Lise + validation `@illico-travaux.com`. Le franchisé crée société+1ère agence+mot de passe via le lien, puis ajoute agences et agentes (rattachées à une agence). Réutilise `inviteUserByEmail` + résout fix #1.
- D12. Référence chantier → séquence par agence (préfixe agence).
- D13. Storage cloisonné par agence (policies à versionner) — sécurité critique. **REPORTÉ post-test** (dette sécurité prioritaire, AVANT ouverture multi-franchise réelle). Risque assumé pour le test contrôlé : un `dossier_id` pourrait fuiter par copie d'URL, mais en test à 1 agence le risque est théorique.
- D14. `profiles.agence_id` = NULL pour admin (rattaché société via `societe_id`), rempli pour agent. L'admin a SES PROPRES dossiers sur toutes ses agences. À la création d'un dossier/client : `agence_id` déduit de `profiles.agence_id` pour un agent ; **choisi** par l'admin (trivial/auto si 1 seule agence). → `profiles.agence_id` NOT NULL impossible globalement (NULL pour admin).
- D15. Profils `client` portent `agence_id` = l'agence de l'agent/admin qui les a créés.
- D16. Phase 3 (bascule RLS) : tout dans UNE seule session, ordre fondations → racines → filles → transverses. Test à la fin de chaque paquet (L5a/b/c), mais PAS d'arrêt sur plusieurs jours entre les paquets (sinon fenêtre d'incohérence dossiers/filles).
- D17. Patch trigger `redevances_montant_protege` : ajouter `NEW.agence_id := OLD.agence_id;` (CREATE OR REPLACE, garder SECURITY DEFINER + search_path). À inclure dans L5a, sinon l'agente pourrait réaffecter sa redevance à une autre agence.

---

## 5. PLAN D'EXÉCUTION (issu de l'audit 3)

> Plan issu de l'audit 3 (v2, ancré sur ce doc). Lots L1-L21. Effort : S≈½j, M≈1j, L≈2j, XL≈3-5j.

### 5.1 Schéma des nouvelles tables (audit 3 §A.1)
**`societes`** (minimal, D7) : `id` uuid PK · `raison_sociale` text NOT NULL · `siret` text (UNIQUE partiel) · `rcs` text · `created_at`/`updated_at` timestamptz.
**`agences`** : `id` uuid PK · `societe_id` uuid NOT NULL FK→societes RESTRICT · `nom` text NOT NULL · `ville` text NOT NULL · `code` text NOT NULL (préfixe réf chantier, UNIQUE par société) · `responsable_nom` text (PAS de FK, évite circularité) · `email` · `logo_path` · `adresse` · `telephone` · `created_at`/`updated_at`.
**Colonnes ajoutées** : `profiles.societe_id` (FK RESTRICT) + `profiles.agence_id` (FK RESTRICT, NULL pour admin cf D14) ; `dossiers.agence_id` + `clients.agence_id` + `artisans.agence_id` (FK RESTRICT, NOT NULL cible).
Seed : société CTP (SIRET 948 096 888) + agence Martigues (code `MTG`, responsable « Marine MICHELANGELI », tel/adresse depuis `parametres/page.js:276-283`).

### 5.2 Pattern RLS unifié (audit 3 §B.1)
Une policy `<table>_scope` par table, `FOR ALL TO authenticated`, enveloppant `(SELECT auth.uid())`/`(SELECT get_my_role())` (résout `auth_rls_initplan`). Branches : admin (`agence_id IN agences de get_my_societe_id()`) · agent (`referente_id = uid AND agence_id = get_my_agence_id()`) · client (préservé). Helpers `get_my_societe_id()`/`get_my_agence_id()` SECURITY DEFINER + REVOKE anon/public (+ même REVOKE sur `get_my_role()`).
6 cas : (1) racine `agence_id` · (2) fille via `dossier_id` EXISTS dossiers · (2-bis) rendez_vous nullable · (3) via `agente_id` · (4) via `artisan_id` · (5) notifications/google_tokens par user · (6) societes/agences.

### 5.3 PLAN D'EXÉCUTION — 6 phases (audit 3 §D.2, ordre sûr)

**Méthode test (rappel) : code applicatif → branche/preview/merge ; SQL/RLS → fichier `docs/sql/` avec rollback écrit → application main en fenêtre creuse → contrôle AVANT/requête/APRÈS → rollback si KO.**

**PHASE 1 — Préparatoires indépendants (2-3j, sans risque base)**
- [x] L9 Rebranding BATILIS — ✅ FAIT (PR `claude/L9-rebranding-batilis`, mergé). 11 changements / 5 fichiers : 8 textes (layout, navbar ×2, app-header, login ×3, parametres) + 3 logo marks `iC`→`Ba`. Vérif négative validée : PDF/espace-client/notifs affichent toujours illiCO légitime. « Martigues » résiduel laissé pour L10.
- [x] L11 Neutralisation Messagerie + Statistiques — ✅ FAIT (`claude/L11-neutralisation`, mergé `f12420a`). CR NON neutralisés (gardés, fonctionnent). 2 pages → placeholder « Bientôt disponible » (Server Components statiques). Realtime coupé physiquement (2 channels supprimés), Chart.js retiré, fetch supprimés. Commentaire traçabilité en tête → code complet à `3dbd6f1`. Vérif négative : CR toujours OK dans fiche chantier + espace-client.
- [x] L13 Suppression bouton Google login + fix #2 création chantier sans client — ✅ FAIT (`claude/L13-creation-chantier`, mergé `3dbd6f1`). 13a : bouton Google + séparateur « ou » retirés, faux lien invitation neutralisé (texte « franchisé(e) » conservé). 13b : composant `ModaleChoixClient` (modale « pour quel client ? » sur les 2 boutons « + nouveau chantier » liste+dashboard) + guard sur `/chantiers/nouveau` (sans `?client=` → redirige `/chantiers?nouveau=1` qui rouvre la modale) → `client_id:null` structurellement impossible. Fix : filtre `.eq('referente', profile.id)` pour agente dans la modale (aligné sur `/clients`, seul rempart tant que RLS clients permissive — sera nettoyé en L5c).
- [ ] L17 Durcissements sécu annexes (leaked password Auth + policy Storage `photos` UPDATE). ⚠️ Vérifier d'abord en base que le bucket `photos` manque bien sa policy UPDATE (hypothèse audit 2 non confirmée) avant d'ajouter une policy inutile.
- *État sûr fin P1 : app BATILIS-brandée, modules sensibles neutralisés, pas encore de multi-tenant.*

**PHASE 2 — Schéma & data (½-1j, fenêtre maintenance courte)** — `docs/sql/MT1_*` + `MT2_helpers.sql`
- [ ] L1 CREATE `societes` + `agences` (RLS activée, fermée par défaut).
- [ ] L2 Seeding CTP+Martigues + ALTER ADD COLUMN nullable (profiles ×2, dossiers, clients, artisans).
- [ ] L3 Backfill (profiles societe_id + agence_id si agent ; dossiers/clients/artisans) → contrôle « 0 ligne sans agence_id » → SET NOT NULL (sauf `profiles.agence_id` qui reste nullable pour admin, D14).
- [ ] L4 Helpers `get_my_societe_id`/`get_my_agence_id` + REVOKE anon/public sur les 3 helpers.
- *État sûr fin P2 : colonnes remplies, RLS pas encore basculée → Marine voit comme avant. Vérifier 0 insertion échouée pendant la fenêtre.*

**PHASE 3 — Bascule RLS (2-3j +1j tampon, CRITIQUE, UNE session, ordre strict D16)** — `docs/sql/MT3a/b/c`
Ordre intra-phase : **fondations (societes, agences, profiles) → racines (dossiers, clients, artisans) → filles → transverses.**
- [ ] L5a [fondations + racines + finances] societes/agences/profiles puis dossiers/clients/artisans puis devis_artisans/factures_artisans/suivi_financier/factures_agente/redevances. **+ patch trigger `redevances_montant_protege` (D17).** Test : Marine admin voit tout, Anne-Lise agente voit ses dossiers, KPI finances inchangés au centime.
- [ ] L5b [opérationnelles P0-9-bis] rendez_vous, interventions_artisans, photos, comptes_rendus, chantier_documents, chantier_fiches_techniques. Test : cloisonnement croisé en base.
- [ ] L5c [reste + transverses] messages (5 policies P0-2), objectifs_ca, notifications (INSERT resserré), fiches_techniques, specialites, artisans_specialites, google_tokens. Test.
- [ ] L8 Référence chantier par agence (D12, préfixe `code` agence, atomicité concurrence).
- *État sûr fin P3 : multi-tenant cloisonné, prouvé par « Marine voit les siens / Anne-Lise les siens » croisé en base.*

**PHASE 4 — Adaptation applicative légère (1-2j)**
- [ ] L6 AuthProvider + requireUser élargis (charger `agence_id`/`societe_id`).
- [ ] L7 Navbar mono-agence (header BATILIS + nom agence depuis table).
- [ ] L10 Info agence dynamique (parametres + PDFs `route.js`/`restitution.js` dont fallback « Marine MICHELANGELI » l.39 + cron relances).
- *État sûr fin P4 : prêt pour test utilisateur (mono-agence).*

**PHASE 5 — Fix invitation (1-2j, BLOQUANT minimal)**
- [ ] L14a Fix #1 reconnexion : route `/auth/set-password` + `redirectTo` + `updateUser({password})`. Test : inviter, recevoir mail, définir mdp, déconnexion, reconnexion OK.
- *État sûr fin P5 : un nouvel utilisateur peut s'authentifier durablement. PRÊT POUR LE TEST.*

### 5.4 REPORTABLE POST-TEST (Phase 6)
- [ ] **Réactiver Messagerie + Statistiques** : code complet conservé à `3dbd6f1` (neutralisés en L11). À restaurer et adapter au multi-tenant (RLS agence sur messages, scope agence sur stats).
- [ ] L12 Storage cloisonné par agence + migration fichiers + policies versionnées (**dette sécu prioritaire, AVANT ouverture multi-franchise réelle**, D13).
- [ ] L14b Reste onboarding : flow création société + ajout 2e agence + sélecteur agence dans `/api/create-agente`.
- [ ] L15 Navbar bi-zone + sélecteur multi-agences.
- [ ] L16 Facturation scopée/consolidée multi-agences.
- [ ] L18 Bug ajout intervention · L19 Bug molette nombres · L20 Route `/clients/[id]/modifier` 404 · L21 DROP `factures_agente_backup_b7b`.
- [ ] Optim perf RLS (wrapping fait en L5 ; dénormalisation/claim JWT si besoin).
- [ ] #8 dashboard admin scope (à arbitrer selon scénario testeur).

### 5.5 VERDICT DÉLAI
- **2 semaines** : tendu, faisable SI Phase 6 strictement reportée ET L5a sans régression. Pas de marge. (Le report de L12 hors fenêtre — D13 — est le levier qui rend ça respirable.)
- **3 semaines** : confortable, absorbe une régression L5a + permet 1 lot de Phase 6.
- **Risque #1 = L5a** (RLS finances + trigger). Mitigation : fichier SQL unique avec rollback complet + smoke test (« Marine voit X dossiers, somme F1 inchangée »).

---

## 6. AVANCEMENT

| Date | Étape | Statut |
|---|---|---|
| 28/05 | Cadrage modèle cible (D1-D17) | ✅ verrouillé |
| 28/05 | Audit 1 (fonctionnel) | ✅ |
| 28/05 | Audit 2 (données & sécurité) | ✅ vérifié en base |
| 28/05 | Audit 3 (ampleur/chiffrage/séquençage) | ✅ |
| 28/05 | Plan d'exécution 6 phases (L1-L21) | ✅ |
| 28/05 | **L9 Rebranding BATILIS** | ✅ mergé |
| 28/05 | **L13 Création chantier sans client + login** | ✅ mergé `3dbd6f1` |
| 28/05 | **L11 Neutralisation Msg + Stats** | ✅ mergé `f12420a` |
| — | Phase 1 : reste L17 | ⏳ en cours |

**Prochaine action** : L17 (durcissements sécu annexes — protection mots de passe compromis Auth + policy Storage `photos` UPDATE). ⚠️ VÉRIFIER D'ABORD l'état réel (la policy `photos` UPDATE manque-t-elle vraiment ? la protection Auth est-elle vraiment off ?) AVANT de corriger — ne pas patcher une hypothèse. Après L17 → Phase 1 bouclée, passage Phase 2 (schéma multi-tenant).
