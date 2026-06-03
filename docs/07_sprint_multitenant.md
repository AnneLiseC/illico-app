# 07 — SPRINT MULTI-TENANT BATILIS

> Boussole du sprint. Lue par Claude (binôme) et Claude Code à chaque session.
> Créé le 28/05/2026. Statut : **PHASES 1-5 CLOSES** (app prête pour test mono-agence). En cours : **Chantier finances (B)** — assainir finance.js puis rebrancher les écrans dessus (voir section dédiée avant §6). En attente derrière : nettoyage données test + TEST UTILISATEUR, puis Phase 6 post-test (bloc A sécurité/L12 en tête).

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
- **Société** : entité juridique (nom société, SIREN/SIRET). Ex : CONSEIL TRAVAUX PROVENCE (CTP), SIREN 948 096 888 (9 chiffres, pas un SIRET 14 ch.).
- **Agence** : le point de vente / la franchise locale. Ex : « Agence de Martigues » (illiCO travaux Martigues).
- **Une société peut détenir PLUSIEURS agences** (cas réel : franchisé d'Aix-en-Provence possède Aix + Pennes-Mirabeau).

### 1.3 Rôles applicatifs — 2 niveaux (on garde `admin`/`agente`, pas de migration de la colonne `role`)
> ⚠️ Valeur technique en base : `role = 'agente'` (féminin — équipe Martigues 100% féminine au moment du choix). L'**affichage UI** peut être au masculin (« Agent ») ou neutre : c'est du texte d'interface, distinct de la valeur stockée. Ne JAMAIS changer la valeur `'agente'` en base (tout le code + les policies RLS s'en servent).

| Rôle | Rattaché à | Voit |
|---|---|---|
| `admin` (franchisé) | sa **société** (`profiles.societe_id`) | TOUTES les agences de sa société |
| `agente` | son **agence** (`profiles.agence_id`) | SES dossiers (clients/chantiers) de SON unique agence |

- Un franchisé n'est JAMAIS « juste dans une agence » — il gère tout ce qu'il possède.
- Une agente est TOUJOURS dans une seule agence.
- **Anne-Lise (dev)** : AUCUN rôle applicatif privilégié. Pas de super-admin dans l'UI. Accès INFRASTRUCTURE uniquement (propriétaire projet Supabase → SQL/logs pour débug), encadré par déontologie + clause confidentialité CGU (à terme). Emprunte le compte Marine (avec accord) pour la vue admin. Argument commercial : « dans l'app, je ne vois que ma franchise ».

### 1.4 Cloisonnement des données
- **Tables racines portent `agence_id` en propre** : `dossiers`, `clients`. ⚠️ `artisans` portait aussi `agence_id` (MT6) mais il a été **RETIRÉ par MT7** (31/05) : un artisan est société-wide, rattaché à `societe_id` seul.
- **`profiles`** porte `societe_id` (pour admin) ET `agence_id` (rempli pour agent, **NULL pour admin** cf D14).
- **`agences.societe_id`** (l'agence appartient à une société).
- **Tables filles héritent l'agence par JOIN** (pas de dénormalisation) :
  - via `dossier_id` → `dossiers.agence_id` : `devis_artisans`, `factures_artisans`, `photos`, `rendez_vous`, `comptes_rendus`, `suivi_financier`, `interventions_artisans`, `chantier_documents`, `chantier_fiches_techniques`, `messages`.
  - via `agente_id` → `profiles.agence_id` : `factures_agente`, `redevances`, `objectifs_ca`.
  - via `artisan_id` → `artisans.societe_id` : `fiches_techniques`, `artisans_specialites` (suivent l'artisan, qui est société-wide depuis MT7 — plus d'agence_id intermédiaire).
  - via `user_id` → `profiles` : `notifications`, `google_tokens` (cloisonnement par user, pas par agence — cf. Cas 5).

### 1.5 Branding — distinction clé
- **PRODUIT = BATILIS** : navbar, login, titre, métadonnées → BATILIS partout.
- **Contenu COMMUN réseau illiCO** (semi-fixe, NON configurable) :
  - Slogan « Quand vous pensez travaux, pensez illiCO ! » (identique toutes agences).
  - Marque « illiCO travaux » dans PDF/emails clients, header espace-client, « Équipe illiCO ».
- **Coordonnées DYNAMIQUES** (fin du hardcode CLAUDE.md §3) :
  - portées par `societes` : `nom_societe`, SIREN ou SIRET (colonne `siret` text).
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
- **#26 P0-9-bis sécurité** : ✅ **EN FAIT FERMÉ** (vérifié en base 01/06 par audit 4 — simulation d'identité RLS). Les 7 tables opérationnelles SONT cloisonnées par agente : le `EXISTS dossiers` des policies filles s'exécute sous la RLS de `dossiers`, donc une agente ne voit que les filles de SES dossiers (preuve : 100 photos visibles sur 209, 9 dossiers sur 23). Le test empirique d'origine (Doc 5) datait d'AVANT L5a-2/L5b. Plus un trou. ⚠️ Nuance : cloisonnement à une seule couche (hérité de `dossiers_scope`) — robuste tant que `dossiers` n'a pas de régression.

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
> 📍 **État au 29/05** (annoté en cours de Phase 3) : profiles + racines (dossiers/clients/artisans) + finances = ✅ refaits (L5a). Restent L5b (opérationnelles) + L5c (transverses). Détail par catégorie ci-dessous.

1. **P0-9 propre** (`get_my_role()` + ownership) : dossiers, devis_artisans, factures_artisans, suivi_financier, factures_agente, redevances. ✅ **Toutes refaites en L5a-2/L5a-3** (cloisonnement société/agence ajouté au-dessus de l'ownership).
2. **Ancienne par rôle seul** (`role IN ('admin','agente')` → toute agente voit tout) : ❌ = trou P0-9-bis. État :
   - clients, artisans → ✅ **faits (L5a-2)** (trou « agente voit tout » fermé).
   - rendez_vous, interventions_artisans, photos, comptes_rendus, chantier_documents, chantier_fiches_techniques → ✅ **faits (L5b)** (staff via EXISTS dossiers ; branches client lecture seule sur CR + photos).
   - fiches_techniques, specialites, artisans_specialites, objectifs_ca, messages → ✅ **faits (L5c)** (+ objectifs_ca a nécessité une migration agence_id/societe_id pour cloisonner l'objectif d'agence).
3. **Styles mélangés** : `get_my_role()` vs `EXISTS(SELECT FROM profiles...)` vs `auth.uid() IN (SELECT...)`. 3 façons d'écrire la même chose → unification en cours (finalisée avec L5b + L5c). ✅ Racines déjà simplifiées par MT6 (sous-SELECT agences remplacé par `societe_id = get_my_societe_id()` direct).
- **Conséquence** : la refonte RLS multi-agences = TOUTES les policies de TOUTES les tables réécrites en un pattern unique (rôle + société/agence + ownership). Gros morceau, cœur du risque. **~11 tables restent à cloisonner (L5b + L5c).**

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
- D5. `agence_id` propre sur racines (dossiers, clients, profiles) ; héritage par JOIN ailleurs (dette perf assumée, optim post-lancement). ⚠️ `artisans` n'a PAS d'agence_id (société-wide, MT7) — rattaché société directement.
- D6. Admin rattaché société, agent rattaché agence.
- D7. Produit BATILIS ; contenu réseau illiCO commun ; coordonnées agence dynamiques.
- D8. CR + Messages + Statistiques neutralisés pour le test.
- D9. Refonte RLS complète et unifiée (un seul pattern).
- D10. Login Google supprimé.
- D11. Onboarding : lien d'invitation nommé (par email) envoyé par Anne-Lise + validation `@illico-travaux.com`. Le franchisé crée société+1ère agence+mot de passe via le lien, puis ajoute agences et agentes (rattachées à une agence). Réutilise `inviteUserByEmail` + résout fix #1.
- D12. Référence chantier : la chaîne stockée reste `AAAA-XX-NNN` lisible (X X = suffixe typologie auto : `CT`=courtage / `AM`=AMO / `ES`=estimo, généré depuis `dossiers.typologie`). Cloisonnement par `UNIQUE (agence_id, reference)` + séquence NNN comptée **par agence**. Le `code` agence est un identifiant **interne** (colonne `agences.code`) qui n'apparaît PAS dans la référence affichée au client (UX propre, pas de préfixe parasite sur les PDFs). À la création de futures agences (L14b), le code se génère auto à partir des 3 premières lettres de la ville (ex. Martigues→`MAR`/`MTG`) avec incrément en cas de collision dans la même société (`MA1`, `MA2`...).
- D13. Storage cloisonné par agence (policies à versionner) — sécurité critique. **REPORTÉ post-test** (dette sécurité prioritaire, AVANT ouverture multi-franchise réelle). Risque assumé pour le test contrôlé : un `dossier_id` pourrait fuiter par copie d'URL, mais en test à 1 agence le risque est théorique.
- D14. `profiles.agence_id` = NULL pour admin (rattaché société via `societe_id`), rempli pour agent. L'admin a SES PROPRES dossiers sur toutes ses agences. → `profiles.agence_id` NOT NULL impossible globalement (NULL pour admin). **La règle de détermination de l'`agence_id` à la création d'un dossier/client est précisée en D18.** (Les artisans n'ont plus d'agence_id depuis MT7 — société-wide.)
- D15. Profils `client` (table `profiles`, role='client' = comptes espace-client, à distinguer de la table métier `clients`) portent `agence_id` = l'agence du client métier qu'ils représentent (donc l'agence de la référente de ce client, cohérent avec D18). Cloisonnement de ce que voit un compte client : par identité (`profiles.client_id → clients.id`), pas par agence.
- D16. Phase 3 (bascule RLS) : tout dans UNE seule session, ordre fondations → racines → filles → transverses. Test à la fin de chaque paquet (L5a/b/c), mais PAS d'arrêt sur plusieurs jours entre les paquets (sinon fenêtre d'incohérence dossiers/filles).
- D17. Patch trigger `redevances_montant_protege` : ajouter `NEW.agence_id := OLD.agence_id;` (CREATE OR REPLACE, garder SECURITY DEFINER + search_path). À inclure dans L5a-3 (avec les policies finances), sinon l'agente pourrait réaffecter sa redevance à une autre agence. ✅ **Confirmé pertinent** : `redevances.agence_id` est ajouté par la migration L5a-3-mig (préparation multi-agence). Le trigger actuel protège déjà `montant_ht`/`agente_id`/`mois`/`annee` pour une non-admin → on ajoute `agence_id` à cette liste.
- D18. **Détermination de l'`agence_id` à la création de `dossiers` / `clients`** (règle tranchée, implémentation par horizon). ⚠️ `artisans` ne fait PLUS partie de cette règle depuis MT7 (société-wide, pas d'agence_id) :
  - **Principe** : l'`agence_id` suit la **référente** de l'entité, PAS le créateur (sinon une référente d'une autre agence ne verrait pas son propre dossier après cloisonnement RLS).
  - **`clients`** : `agence_id` = agence de la `referente` sélectionnée. Une **agente** crée toujours pour elle-même (ne peut PAS désigner une autre référente — règle métier confirmée) → `agence_id = profile.agence_id`. Un **admin** choisit la référente via le sélecteur (qui propose les agentes ET l'admin elle-même) : si référente = agente → agence de cette agente ; si référente = admin (agence_id NULL) → voir règle admin ci-dessous.
  - **`dossiers`** : un chantier est toujours créé pour un client (L13b). Il **hérite de l'agence du client** : `agence_id = client.agence_id`. (Cohérent : référente du dossier = `client.referente_id` = référente du client = même agence.) Pas de sélecteur de référente dans le formulaire chantier.
  - **`artisans`** : ⚠️ **CORRIGÉ par MT7 (31/05)** — un artisan est **société-wide** (mutualisé entre toutes les agences d'une société), il n'a PLUS de `agence_id` (colonne retirée). Rattachement = `societe_id` uniquement (fourni directement à l'INSERT depuis le profil du créateur). Pas de notion de référente, pas d'agence, donc **hors de la règle admin/sélecteur d'agence** ci-dessous.
  - **Règle admin (référente = admin)** — concerne **dossiers et clients uniquement** (PAS artisans) : l'agence dépend de la **vue active** dans l'app. (a) Admin dans la vue d'une agence précise (onglet) → agence active. (b) Admin dans la vue consolidée « toutes agences » → **doit sélectionner une agence** (sélecteur obligatoire à la création).
  - **Implémentation par horizon** : la notion de « vue active » + le sélecteur d'agence relèvent de la navbar bi-zone multi-agences (**L15, post-test**). **Pour le test (mono-agence)** : il n'y a qu'une agence, donc tous les cas admin (dossier/client) se résolvent automatiquement à l'unique agence de sa société (`SELECT id FROM agences WHERE societe_id = admin.societe_id LIMIT 1`) — pas de sélecteur à afficher. La règle complète est définie ; seul le cas multi-agences (sélecteur en vue consolidée) est implémenté plus tard en L15.
  - Extensible : si une agente devait un jour appartenir à plusieurs agences (rare, sur demande), même principe que l'admin (vue totale + sélection).

---

## 5. PLAN D'EXÉCUTION (issu de l'audit 3)

> Plan issu de l'audit 3 (v2, ancré sur ce doc). Lots L1-L21. Effort : S≈½j, M≈1j, L≈2j, XL≈3-5j.

### 5.1 Schéma des nouvelles tables (audit 3 §A.1)
**`societes`** (minimal, D7) : `id` uuid PK · `nom_societe` text NOT NULL · `siret` text (stocke un SIREN 9 ch. ou SIRET 14 ch., UNIQUE partiel quand renseigné) · `rcs` text · `created_at`/`updated_at` timestamptz.
**`agences`** : `id` uuid PK · `societe_id` uuid NOT NULL FK→societes RESTRICT · `nom` text NOT NULL · `ville` text NOT NULL · `code` text NOT NULL (identifiant **interne** d'agence, UNIQUE par société — sert au cloisonnement de séquence et à des regroupements internes ; PAS affiché dans la référence chantier client, cf D12) · `responsable_nom` text (PAS de FK, évite circularité) · `email` · `logo_path` · `adresse` · `telephone` · `created_at`/`updated_at`.
**Colonnes ajoutées** : `profiles.societe_id` (FK RESTRICT) + `profiles.agence_id` (FK RESTRICT, NULL pour admin cf D14) ; `dossiers.agence_id` + `clients.agence_id` + `artisans.agence_id` (FK RESTRICT, NOT NULL cible). ⚠️ `artisans.agence_id` a été **RETIRÉ ensuite par MT7** (31/05) : artisan société-wide, rattaché à `societe_id` seul.
Seed initial (MT2) : société CTP (SIREN 9 ch. `948096888` stocké en text dans `siret`), `nom_societe = 'CONSEIL TRAVAUX PROVENCE'` ; agence Martigues : `nom = 'illiCO travaux Martigues'`, `ville = 'Martigues'`, `code = 'MAR'` (corrigé de `MTG`→`MAR` le 31/05 pour suivre la règle « 3 premières lettres de la ville »), `responsable_nom = 'Marine MICHELANGELI'`, coordonnées (email/adresse/téléphone) laissées NULL (à remplir en L10 dynamisation info agence). 
Contrainte `UNIQUE (societe_id, code)` ✅ **DÉJÀ POSÉE** (`agences_code_par_societe_uniq`, confirmé audit cohérence 01/06) — le doc disait à tort « à poser en L14b ».

### 5.2 Pattern RLS unifié (audit 3 §B.1)
Une policy `<table>_scope` par table, `FOR ALL TO authenticated`, enveloppant `(SELECT auth.uid())`/`(SELECT get_my_role())` (résout `auth_rls_initplan`). Branches : admin (`agence_id IN agences de get_my_societe_id()`) · agent (`referente_id = uid AND agence_id = get_my_agence_id()`) · client (préservé). Helpers `get_my_societe_id()`/`get_my_agence_id()` SECURITY DEFINER + REVOKE anon/public (+ même REVOKE sur `get_my_role()`).
6 cas : (1) racine `agence_id` · (2) fille via `dossier_id` EXISTS dossiers · (2-bis) rendez_vous nullable · (3) via `agente_id` · (4) via `artisan_id` · (5) notifications/google_tokens par user · (6) societes/agences.
Note Cas 6 : les policies de **lecture** societes/agences sont déjà posées (MT5, Phase 2-bis). En L5a, vérifier leur présence avant d'en recréer (éviter les doublons). La question de l'**écriture** sur ces 2 tables (qui ? quand ?) reste à trancher en Phase 3 ou à l'onboarding L14b.

### 5.3 PLAN D'EXÉCUTION — 6 phases (audit 3 §D.2, ordre sûr)

**Méthode test (rappel) : code applicatif → branche/preview/merge ; SQL/RLS → fichier `docs/sql/` avec rollback écrit → application main en fenêtre creuse → contrôle AVANT/requête/APRÈS → rollback si KO.**

**PHASE 1 — Préparatoires indépendants (2-3j, sans risque base)**
- [x] L9 Rebranding BATILIS — ✅ FAIT (PR `claude/L9-rebranding-batilis`, mergé). 11 changements / 5 fichiers : 8 textes (layout, navbar ×2, app-header, login ×3, parametres) + 3 logo marks `iC`→`Ba`. Vérif négative validée : PDF/espace-client/notifs affichent toujours illiCO légitime. « Martigues » résiduel laissé pour L10.
- [x] L11 Neutralisation Messagerie + Statistiques — ✅ FAIT (`claude/L11-neutralisation`, mergé `f12420a`). CR NON neutralisés (gardés, fonctionnent). 2 pages → placeholder « Bientôt disponible » (Server Components statiques). Realtime coupé physiquement (2 channels supprimés), Chart.js retiré, fetch supprimés. Commentaire traçabilité en tête → code complet à `3dbd6f1`. Vérif négative : CR toujours OK dans fiche chantier + espace-client.
- [x] L13 Suppression bouton Google login + fix #2 création chantier sans client — ✅ FAIT (`claude/L13-creation-chantier`, mergé `3dbd6f1`). 13a : bouton Google + séparateur « ou » retirés, faux lien invitation neutralisé (texte « franchisé(e) » conservé). 13b : composant `ModaleChoixClient` (modale « pour quel client ? » sur les 2 boutons « + nouveau chantier » liste+dashboard) + guard sur `/chantiers/nouveau` (sans `?client=` → redirige `/chantiers?nouveau=1` qui rouvre la modale) → `client_id:null` structurellement impossible. Fix : filtre `.eq('referente', profile.id)` pour agente dans la modale (aligné sur `/clients`, seul rempart tant que RLS clients permissive — sera nettoyé en L5c).
- [x] L17 Durcissements sécu annexes — ✅ TRAITÉ (vérifié en base avant toute action, conformément à la règle anti-hypothèse). Bilan : (1) **Policy UPDATE `photos`** → ABANDONNÉ : l'absence de policy UPDATE est confirmée (4 policies : DELETE/INSERT/SELECT×2, pas d'UPDATE) MAIS c'est théorique — Anne-Lise uploade avec noms uniques (pas de remplacement/upsert), donc aucun bug réel, on n'ajoute pas de policy inutile. (2) **`notifications` INSERT `WITH CHECK (true)`** → confirmé permissif (`roles {public}`). Initialement prévu pour L5c, finalement **REPORTÉ EN PHASE 6** (traité avec la réactivation Messagerie, car les notifs y sont liées). Trou mineur assumé temporairement (créer une fausse notif n'expose pas de données sensibles). (3) **Leaked password protection** → confirmé désactivé, mais RÉSERVÉ AU PLAN PRO (projet en plan gratuit, toggle bloqué) → reporté « avant ouverture réelle » (naturellement couplé au passage Pro). (4) **Captcha** → laissé OFF volontairement (hors périmètre, inutile pour onboarding sur invitation fermée sans inscription publique).
- *État sûr fin P1 : app BATILIS-brandée, modules sensibles neutralisés, pas encore de multi-tenant. **PHASE 1 BOUCLÉE.***

**PHASE 2 — Schéma & data (½-1j, fenêtre maintenance courte)** — `docs/sql/MT1_*` + `MT2_helpers.sql`
- [x] L1 CREATE `societes` + `agences` (RLS activée, fermée par défaut) — ✅ appliqué main, MT1.
- [x] L2 Seeding CTP+Martigues + ALTER ADD COLUMN nullable (profiles ×2, dossiers, clients, artisans) — ✅ appliqué main, MT2 (commit `967a29c`).
- [x] L3 Backfill (profiles societe_id + agence_id si agent ; dossiers/clients/artisans) → contrôle « 0 ligne sans agence_id » → SET NOT NULL (sauf `profiles.agence_id` qui reste nullable pour admin, D14) — ✅ appliqué main, MT3. 102 lignes backfillées (5 profiles, 21 dossiers, 23 clients, 53 artisans). NOT NULL posé sur 4 colonnes.
- [x] L4 Helpers `get_my_societe_id`/`get_my_agence_id` + REVOKE anon/public sur les 3 helpers — ✅ appliqué main, MT4. Helpers calqués sur `get_my_role` (LANGUAGE sql STABLE SECURITY DEFINER search_path 'public'). EXECUTE durci : `authenticated, postgres, service_role` uniquement, plus de `anon`/`PUBLIC`.
- *État réel fin P2* : ✅ schéma multi-tenant intègre côté données, mais ⚠️ **app cassée en CRÉATION** : les NOT NULL bloquent tout INSERT qui ne fournit pas `agence_id` (constaté : création chantier/client/artisan plantent). Consultation et UPDATE marchent normalement. → **L6-light intercalé** ci-dessous pour débloquer avant Phase 3.

**PHASE 2-bis — L6-light (intercalé, non prévu initialement)**
Découverte post-MT3 : poser NOT NULL `agence_id` sans adapter le code applicatif des INSERTs bloque les créations immédiatement (ce n'avait pas été anticipé dans le plan initial — le scénario « 0 insertion échouée » de l'état sûr P2 était trop optimiste). On anticipe donc la **partie INSERT** de L6 (Phase 4) AVANT la Phase 3, pour garder l'app utilisable pendant la bascule RLS.
- [x] **L6-light** ✅ (commit `c385bf7`, branche `claude/L6-light-inserts`) Patch des INSERTs sur `dossiers` / `clients` / `artisans` (+ `profiles` via `api/create-agente`) pour fournir `agence_id` / `societe_id`. Règles **par entité conformes à D18** :
  - **`dossiers`** : `agence_id = client.agence_id` (hérite de l'agence du client). SELECT client via `select('*')` couvre déjà `agence_id`.
  - **`clients`** : `agence_id` = agence de la `referente` sélectionnée. Agente → `profile.agence_id` (fallback ceinture+bretelles : si `role==='agente'`, prend directement `profile.agence_id` sans dépendre de `form.referente`). Admin → référente agente : son agence ; référente admin : unique agence de sa société. Liste profils élargie avec `agence_id`.
  - **`artisans`** : `effectiveAgenceId` calculé au chargement (agente → `profile.agence_id` ; admin → unique agence société).
  - **`api/create-agente` (profiles)** : `societe_id` + `agence_id` de l'admin. `requireUser` (`lib/api-auth.js`) élargi à `agence_id, societe_id` (retourne `{user, profile}`, confirmé l.46). Rollback Auth si agence introuvable.
  - Garde-fou null sur chaque INSERT. Duplication locale assumée (§7) — L6 plein centralisera dans l'AuthProvider en Phase 4. Testé : 9 chemins (agente + admin) OK ; vérifs cohérence D18 en base = 0 (dossier hérite client, client = agence référente agente, 0 NULL).
- [x] **MT5 — policies de LECTURE fondations** ✅ (appliqué main ; fichier `docs/sql/MT5_policies_lecture_fondations.sql`) Découverte au test L6-light : chemins admin (créer client en se désignant référente / créer artisan) plantaient car `societes`/`agences` avaient RLS activée mais 0 policy (MT1 « fermées par défaut ») → le code client (rôle `authenticated`) ne pouvait pas lire `agences` pour déduire l'unique agence. Créé 2 policies `FOR SELECT TO authenticated` : `agences_select_ma_societe` USING (`societe_id = get_my_societe_id()`) + `societes_select_la_mienne` USING (`id = get_my_societe_id()`). Lecture posée en avance (brique du Cas 6, §5.2). ⚠️ En Phase 3 (L5a), vérifier la présence de ces 2 policies SELECT avant d'en recréer (éviter doublons) ; la question de l'écriture sur ces tables reste à trancher en Phase 3 ou L14b.
- *État sûr fin P2-bis : ✅ Phase 2 réellement bouclée, app fonctionnelle (création + consultation), fondations lisibles. Prête pour Phase 3.*

**PHASE 3 — Bascule RLS (2-3j +1j tampon, CRITIQUE, UNE session, ordre strict D16)** — `docs/sql/MT3a/b/c`
Ordre intra-phase : **fondations (societes, agences, profiles) → racines (dossiers, clients, artisans) → filles → transverses.**
- L5a [fondations + racines + finances] — décomposé en 3 sous-lots :
  - [x] **L5a-1** fondations : profiles (policies SELECT/INSERT/UPDATE cloisonnées société + trigger `profiles_protege_identite` figeant role/societe_id, souple en SQL direct). societes/agences déjà couverts en lecture par MT5. ✅ appliqué main + testé (login, visibilité admin/agente, cloisonnement). Fichier `docs/sql/L5a-1_rls_profiles.sql`.
  - [x] **L5a-2** racines : dossiers (agente=ses dossiers via referente_id + agence ; admin=société ; client=identité), clients (idem via `referente` SANS _id ; **trou « agente voyait tous les clients » fermé**), artisans (annuaire commun société ; société B exclue). ✅ appliqué main + testé (admin voit tout, agente cloisonnée, création OK). Fichier `docs/sql/L5a-2_rls_racines.sql`.
  - [x] **L5a-3** finances : devis_artisans, factures_artisans, suivi_financier (via `EXISTS dossiers`, approche 1 validée par test : la fille suit la visibilité du parent), factures_agente (par agente_id), redevances (par agente_id ; SELECT/UPDATE admin société + agente / INSERT/DELETE admin-only). **+ trigger D17 patché** (`NEW.agence_id := OLD.agence_id`). **+ L6-light-bis** (commit `0ae9c9c`) : upsert redevance dans `finances/page.js` câblé pour fournir `agence_id` (= agence de l'agente cible) + garde-fou si agence indéterminée. ✅ appliqué main + testé (KPI admin OK, agente cloisonnée, statut payé F2→redevance OK, agence_id correct en base). Fichiers `docs/sql/L5a-3-mig_*.sql` + `L5a-3-rls_finances.sql`.
  - **Bug CTP = AFFICHAGE confirmé** (pas RLS) : onglets « Agence - encaissements bruts » / « CTP - Résultat net » visibles côté agente alors que la RLS cloisonne déjà au niveau base. → ✅ **FAIT (31/05, branche `claude/laughing-mccarthy-oYec4`)** : ce ne sont pas des onglets principaux mais un `PillToggle` (agence/ctp) dans l'onglet « 📈 Suivi financier ». Patch `finances/page.js` : `PillToggle` rendu seulement si `isMarine` ; pour l'agente `renderSuiviFinancier('agence')` forcé en dur (indépendant du défaut `suiviMode='ctp'`). Agente → mode agence (produits bruts scopés RLS) sans toggle ; admin → inchangé. Testé Vercel (agente : pas de toggle, vue brut cohérente ; admin : toggle intact). ⚠️ Incohérence objectif assumée (voir refonte finances post-test). ⚠️ Le Suivi financier n'a AUCUN scope JS (travaille sur `dossiers` brut) → cloisonnement agente 100% RLS — confirmé cohérent au test (l'agente voit le brut avant division des parts).
- [x] **MT6 — dénormalisation `societe_id` sur racines** ✅ FAIT (fichiers `docs/sql/MT6_societe_id_racines.sql` commit `5b1abb5` + `MT6-3_policies_societe_id.sql` commit `ae79b3b`). (1) ADD `societe_id` NOT NULL sur dossiers/clients/artisans/redevances + backfill 100% (pattern MT3) ; (2) trigger générique `derive_societe_id_from_agence` (1 fonction, 4 triggers BEFORE INSERT/UPDATE) : dérive à l'INSERT, **garantit l'immuabilité société à l'UPDATE** (RAISE si changement de société via l'app ; souple en SQL direct via `auth.uid() IS NOT NULL`) ; (3) policies des 4 racines basculées : branche admin `agence_id IN (SELECT...agences...)` → `societe_id = get_my_societe_id()` (branche agente inchangée = `referente(_id)+agence_id`, défense en profondeur niveau agence). Filles NON touchées (EXISTS dossiers). Testé table par table (lecture admin/agente + création admin + statut payé + bascule F2→redevance). Ordre trigger BEFORE → WITH CHECK validé (INSERT redevance passe).
- [x] **L5a-3-fix** (trou client filles finances) ✅ : `devis_artisans`/`factures_artisans`/`suivi_financier` étaient en `EXISTS dossiers` PUR → un client matchait via `dossiers_client_read` et pouvait lire les données financières internes. Ajouté `get_my_role() IN ('admin','agente') AND` → STAFF ONLY. (Le client ne voit PAS les données financières ; il verra les PDF devis signés/factures via espace-client plus tard.) Fichier `docs/sql/L5a-3-fix_filles_finances_staff.sql` (commit `70a6945`).
- [x] **L5b** [opérationnelles] ✅ FAIT (fichier `docs/sql/L5b_rls_operationnelles.sql`). 6 filles de dossiers, pattern STAFF ONLY `get_my_role() IN ('admin','agente') AND EXISTS dossiers` :
  - rendez_vous, interventions_artisans, chantier_fiches_techniques, chantier_documents → staff only.
  - comptes_rendus, photos → staff `_scope` + branche CLIENT `_client_read` (FOR SELECT, lecture seule, préservée pour espace-client futur).
  - photos : 5 policies empilées (3 générations) nettoyées → 2 policies propres.
  - ⚠️ chantier_documents : branche client (PDF devis signés/factures) REPORTÉE au développement espace-client.
  - Testé table par table (affichage + création/édition staff). Branches client non testables (espace-client non câblé) mais posées.
- [x] **L5c** [reste + transverses] ✅ FAIT (fichiers `docs/sql/L5c_rls_transverses.sql` + `L5c-B-fix_objectifs_ca.sql`). 6 tables, 4 patterns :
  - **google_tokens** → par user (`user_id = auth.uid()`, → authenticated).
  - **objectifs_ca** → ⚠️ **régression détectée et corrigée** : la 1re policy (par agente_id) cachait l'objectif d'AGENCE (`cible='agence'`, agente_id NULL) → KPI "Objectif" à 0. Fix (L5c-B-fix) : migration ADD `agence_id` + `societe_id` (backfill : cible='agente'→agence de l'agente ; cible='agence'→Martigues) + trigger `derive_societe_id_from_agence` + NOT NULL. Policy : agente voit son objectif perso (cible='agente' AND agente_id=moi) + l'objectif de SON agence (cible='agence' AND agence_id=mon agence), PAS les objectifs perso des autres ; admin voit toute sa société (societe_id). Multi-agence : total société = somme des objectifs d'agence. ⚠️ Dépendance future : écran de saisie objectifs (Phase 4) devra fournir agence_id.
  - **specialites** → catalogue GLOBAL : `specialites_read` (SELECT staff) seule, **écriture verrouillée** (pas de policy INSERT/UPDATE/DELETE → SQL direct only). Table vide.
  - **artisans_specialites** → via EXISTS artisans (suit l'artisan). Table vide.
  - **fiches_techniques** → via EXISTS artisans (liées à un artisan, 22 lignes, testé OK).
  - **messages** → staff EXISTS dossiers + client lecture (SELECT) + client écriture (INSERT, auteur_id=lui). Messagerie neutralisée (L11) → policies posées, non testables UI, fiche chantier charge sans erreur (non-régression OK).
  - ⚠️ **notifications NON traitée** → reportée Phase 6 (avec réactivation Messagerie). Trou INSERT `WITH CHECK(true)` assumé temporairement (mineur).
- [x] **L8** Référence chantier par agence (D12) ✅ FAIT (fichier `docs/sql/L8_reference_par_agence.sql` commit `d625aee` + patch code `cca9811` branche `claude/L8-trigger-reference`). Génération DÉPLACÉE CÔTÉ BASE :
  - **L8-1** : `dossiers_reference_key UNIQUE (reference)` (globale) → `dossiers_agence_reference_key UNIQUE (agence_id, reference)` (par agence). 0 doublon préalable.
  - **L8-2** : fonction `generer_reference_dossier()` SECURITY DEFINER (bypasse RLS → compte TOUS les dossiers de l'agence) + trigger BEFORE INSERT `dossiers_generer_reference`. Logique : si reference NULL → `AAAA-XX-NNN` où AAAA = année côté base (`now()`), XX = suffixe via CASE sur typologie (CT/AM/ES/MR/AU/SJ, fallback XX), NNN = `max(NNN)+1` par AGENCE + ANNÉE, **toutes typologies confondues** (numéro continu). CAST robuste (`~ '^[0-9]+$'`) contre références malformées. Référence FIGÉE (ne régénère jamais sur UPDATE).
  - **Patch code** : `genererReference` JS supprimée de `chantiers/nouveau/page.js` (count(*) sous RLS → cassé pour multi-agente), `reference` retirée de l'INSERT (le trigger génère), `.select()` conservé.
  - Corrige 3 bugs de l'ancien système : count(*) sous RLS (collisions entre agentes), count+1 (réutilisation après suppression), pas d'atomicité (UNIQUE = filet). Atomicité concurrence même agence = UNIQUE (volume faible, pas de locking).
  - Testé : INSERT SQL (ROLLBACK) → `2026-CT-023` ✅ ; création réelle dans l'app (AMO) → `2026-AM-023` ✅ (compteur continu 022→023, suffixe AM, agence/societe remplis).
- *État sûr fin P3 : multi-tenant cloisonné, prouvé par « Marine voit les siens / Anne-Lise les siens » croisé en base.*

**PHASE 4 — Adaptation applicative légère (1-2j)**
- [x] **MT7 — artisans société-wide (correction de modèle)** ✅ FAIT (31/05 ; SQL `docs/sql/MT7_artisans_societe_wide.sql` commit `15161ed` ; patch code commit `072ccd7`). Découvert en préparant L6 : `artisans.agence_id` (NOT NULL, ajouté par MT6 par uniformisation excessive) contredisait le modèle métier « un artisan est mutualisé au niveau SOCIÉTÉ, pas rattaché à une agence ». Incohérence invisible en mono-agence mais fausse en multi-agence (un artisan société-wide ne doit pas porter une agence précise). Correction (option : retirer agence_id) :
  - **Code d'abord** (`artisans/nouveau`, commit `072ccd7`) : fournit `societe_id` directement à l'INSERT, retire `agence_id` + le calcul `effectiveAgenceId` + le `SELECT FROM agences limit(1)` (dette L6-light qui disparaît).
  - **Base ensuite** (commit `15161ed`) : retrait du trigger `artisans_derive_societe` (la fonction `derive_societe_id_from_agence` RESTE, partagée par 4 autres tables : clients, dossiers, redevances, objectifs_ca) + DROP FK `artisans_agence_id_fkey` + DROP index + DROP COLUMN `agence_id`.
  - RLS `artisans_scope` (par `societe_id`) inchangée. Séquence code→base (dimanche, 0 trafic, micro-fenêtre sans risque). Testé : création artisan OK, societe_id rempli, plus de notion d'agence.
  - ⚠️ Conséquence : `clients/nouveau` garde encore son `SELECT agences limit(1)` (un client EST rattaché à une agence via la référente, D18 — logique légitime, pas une dette à supprimer comme artisans ; sera traité avec le sélecteur multi-agence L15).
- [x] **L6** (périmètre réduit) ✅ FAIT (31/05, commit `8d98a44`). AuthProvider + requireUser : socle déjà en place (auth-context expose `profile` complet via `useAuth()` ; requireUser élargi en L6-light). **Migré 2 pages « propres »** vers `useAuth()` (re-fetch `from('profiles').select('*').eq('id',user.id)` supprimé) : `artisans/nouveau` (usage societe_id) + `clients/nouveau` (profil courant uniquement). Guard timing `initialized`/`profile` + loader (pattern dashboard). Pour clients/nouveau : fetch des référentes (profil d'autrui), déduction admin→agence (`SELECT agences limit(1)`) et `handleSubmit` GARDÉS intacts. Testé (artisans création OK ; clients agente présélectionnée + création ; clients admin sélecteur référente + création).
  - 📝 **Dette résiduelle ASSUMÉE** (re-fetch fonctionnel, migration risquée pour gain marginal — NON migré) : `chantiers/nouveau` (profil pré-remplit le form), `chantiers/[id]` (profData pilote un Promise.all conditionnel, page critique), `espace-client` (route lien magique, useAuth pas garanti monté). À migrer seulement si on retouche ces pages pour autre chose.
  - ⚠️ Note process : Claude Code a réutilisé une branche déjà mergée (`claude/keen-cori-Z79kg`) au lieu d'une neuve → confus pour l'historique. CONSIGNE pour la suite : exiger une branche NEUVE par lot.
- [x] **L7** Navbar mono-agence ✅ FAIT (31/05, commits `96e8872` + `f3ecef0`, mergé `10734ca`). **Audit e149c06** : BATILIS (rebranding L9) déjà fait, en dur = OK (nom produit). Nom d'agence « Martigues » était EN DUR dans `navbar.js:149`. **Réalisé** :
  - **AuthProvider enrichi** (`auth-context.js`) : charge UNE FOIS `displayAgenceName` (agente/`agence_id` non NULL → `agences.nom` ; admin/`agence_id` NULL → `societes.nom_societe` — colonne vérifiée en base) et l'expose via `useAuth()`. Reset au logout, erreur réseau silencieuse.
  - **navbar** : « Martigues » dur → `displayAgenceName`. Puis prénom redondant retiré du header (identité déjà affichée en bas de navbar). Fallback espace insécable pendant chargement (pas de saut layout ni « undefined »).
  - Périmètre strict : seuls `auth-context.js` + `navbar.js`. Testé : agente → « illiCO travaux Martigues » ; admin → « CONSEIL TRAVAUX PROVENCE ».
  - ✅ **Multi-agence-ready** : admin→société (pas de déduction « unique agence ») ; `displayAgenceName` réutilisable par L10 (UI).
- [ ] **L10 (regroupe tous les noms/infos d'agence en dur hors navbar)** — cadrage 31/05. ✅ **Données déjà en base** (UPDATE fait, commit `b48d4b7`) : société `nom_societe`/`siret` 14ch/`rcs` + agence `nom`/`adresse`/`telephone`. **DÉCOUPAGE EN 3 SOUS-LOTS SÉQUENTIELS** (pas un gros patch fourre-tout — chaque sous-lot = 1 branche + 1 test) :
  - **L10-a (facile, gros gain)** ✅ FAIT (31/05, branche `claude/L10a-params-login` → `399afc9`, mergé `23b4d97` ; + SQL `docs/sql/L10a_adresse_decomposee.sql` mergé séparément `8896618`). `parametres/page.js` bloc Agence dynamisé (raison sociale/SIRET/RCS depuis `societes` ; franchise/adresse/CP/ville/tél depuis `agences` ; fetch dédié `chargerAgence` au montage, page admin authentifiée via useAuth ; lecture seule + message contact conservés ; fallback « — »). Texte « Modifiable dans Sécurité via Supabase Auth » retiré du bloc Profil. `login/page.js:61` : « Martigues » → « Gestion travaux » (neutre, multi-tenant). **+ Adresse DÉCOMPOSÉE (Option 2)** : migration `agences ADD COLUMN code_postal` + UPDATE Martigues (adresse=« 22 RUE RAMADE » rue seule, code_postal=« 13500 », ville=« Martigues » déjà là) ; affichage en 3 lignes distinctes (Rue / Code postal / Ville). Raison : la ville doit être une donnée saisie à part (elle alimente la génération du code agence) — impossible à déduire d'une adresse en texte libre. ⚠️ Bug rencontré : 1er patch utilisait `setSociete`/`societe` sans `useState` (Edit échoué silencieusement) → crash « setSociete is not defined », réparé en `399afc9`. ⚠️ Note process : le SQL a été commité seul sur main (`8896618`) pendant que le code était sur branche → 2 « L10a » divergents ; main restait sain (ancien code en dur fonctionnel). Pour la suite : garder SQL + code du même lot ensemble (ou merger le SQL après validation du code). Testé : page params s'ouvre, valeurs CTP correctes, adresse 3 lignes, login neutre, texte profil retiré.
  - **L10-b (moyen, isolé)** ✅ FAIT (31/05, branche `claude/L10b-cron-relances` → `5d1ab4b`, mergé `ff4b678`). Audit `d695499` (cron = 7 boucles, service_role, signatures centralisées à 90% via `signatureHtml(referente)`). Réalisé :
    - **Boucles « par dossier » (cible boucle 3 acompte)** : `select` élargi `dossiers(..., agences(ville))` ; `agenceVille` (l.250) vient de `dossier.agences.ville` au lieu de `process.env.AGENCY_CITY || 'Martigues'` (dépendance `AGENCY_CITY` supprimée) ; fallback propre si null (pas de ` – ` orphelin, pas de `.toUpperCase()` sur undefined).
    - **Boucle 6 (décennale artisan, société-wide)** : helper `chargerSociete(societeId)` avec **cache par société** → récupère l'admin (`profiles role=admin, societe_id`, via `maybeSingle()` pour ne pas planter si 0 admin) + les villes des agences. `from: admin.email` ajouté. Signature = « L'équipe illiCO travaux » + villes jointes par " - " (mono-agence → « …Martigues »). Fetch protégé (try/catch séparé) → cron ne plante pas si échec.
    - Fallback `signatureHtml` l.54 laissé (dynamiser = threader un param dans 5 appelants pour un cas rare, disproportionné).
    - ⚠️ **NON testé fonctionnellement** : l'envoi d'emails n'est PAS branché dans l'app (fonction prévue « à la mise en réel », pas en test web) → le cron n'envoie rien aujourd'hui. Validé par build Vercel + relecture diff. Le patch sera correct le jour où l'envoi sera activé. (Rétrospective : ce lot n'était pas strictement nécessaire pour le test ; fait et propre, gardé.)
    - 📝 **À revoir en L15** : format d'affichage de la liste de villes en multi-agences (liste à rallonge à valider visuellement).
  - **L10-c (lourd) — TRI ÉDITORIAL TRANCHÉ avec Anne-Lise (31/05, audit `8663a06`). Découpé en c1 (route.js, simple) ✅ FAIT + c2 (restitution.js, threading lourd) à faire.**
    - **À DYNAMISER** (nom agence/société locale via `dossier.agence_id → agences/societes`) : `route.js` header l.146, footer l.319, footer CR l.456 ; `restitution.js` footer l.110, page de garde raison sociale l.269 (`societes.nom_societe`) + adresse l.270 (`agences.adresse`) + CP/ville l.271 (`agences.code_postal`+`ville`).
    - **Référent (nom + téléphone) = TOUJOURS rempli** (obligatoire) → afficher directement `ref.prenom/nom` et `ref.telephone`. Les valeurs EN DUR « Marine MICHELANGELI » (restitution.js l.39, route.js l.340 fallback nomRef) et « 06 59 81 06 81 » (restitution.js l.35-36) sont du **code mort** (jamais atteint car référent toujours présent) → remplacer par neutre/retirer. Pas de fallback admin/société nécessaire (le cas « pas de référent » n'existe pas sur un dossier de restitution).
    - **GARDER EN DUR (branding franchiseur)** : « Honoraires illiCO travaux » (route.js 256/269/286 ; restitution.js 418/422/435/858), slogan « Quand vous pensez travaux, pensez illiCO ! » (restitution.js 111), commentaires de code (non rendus).
    - **NE PAS TOUCHER (décision Anne-Lise)** : « illiCO travaux » des lignes **frais de consultation** (route.js 178/188 ; restitution.js 132/374/802) → reste générique « illiCO travaux » (PAS le nom d'agence).
    - **Prompt IA** (restitution.js 535, « assistant pour illiCO travaux ») → laissé tel quel (non affiché au client, instruction interne).
    - **Technique** : `route.js` ✅ **FAIT** (commit `3ad345c`, mergé `7d7bd20`) — dossier chargé enrichi avec `agence:agences!dossiers_agence_id_fkey(nom,ville,adresse,code_postal,telephone, societe:societes(nom_societe,siret,rcs))` (société chargée d'avance pour c2) ; dynamisé header l.146 + footer l.319 + footer CR l.456 (`dossier.agence?.nom`, fallback chaîne vide) ; fallback mort l.340 → `''` ; frais conso + honoraires intacts ; testé (récap + CR). **`restitution.js` ✅ FAIT (L10-c2)** : (A, commit `95915d4`) les **7 `Ftr`** dynamisés (`agenceNom`, dont 2 dans `buildR3ContentPDF` qui s'est avéré VIVANT via `buildDossierSuivi` pré-signature — pas mort comme cru au départ) + `makeCoverPage` (raison sociale « Société {nom_societe} » + adresse + CP/ville depuis `dossier.agence`) + fallbacks `getNomRef`→`''`, `getTelReferente`→`ref?.telephone || dossier.agence?.telephone || ''` ; le dossier était déjà enrichi par c1 (pas de refetch). (B, commit `4a83e91`) **suppression code mort** : `buildDossierRestitution` + `buildDossierR3` (233 lignes, exportées jamais appelées, vérifié sur tout le repo) ; `buildR3ContentPDF` CONSERVÉ (partagé avec le vivant) ainsi que tous les helpers (aucun exclusif au code mort) ; intégrité vérifiée (accolades 540/540, 0 référence résiduelle). Testé : PDF `DossierSuivi_2026-AM-001` se génère, nom agence dynamique. **→ L10 COMPLET** (navbar L7 + params/login L10-a + cron L10-b + PDF route+restitution L10-c).
  - 📝 **`espace-client/page.js:253`** (« illiCO travaux Martigues ») : **REPORTÉ après le fix connexion** (L14a). Dépend du développement espace-client (route lien magique, pas câblé pour le test, RLS client→agences à vérifier). Pas dans le périmètre du test.
  - ⚠️ **HORS L10 → L14b** : auto-remplissage SIRET→raison sociale/RCS via API État (inutile pour le test, CTP en dur ici).
- [x] **Écrans de saisie des objectifs de CA** (gestion `objectifs_ca`) — ✅ **FAIT** (01/06, branche `claude/L-objectifs-saisie`, mergé `4cc2a6`). Cadrage initial sur audit lecture seule `1d3cc91`.
  - **Grain = ANNUEL** (`annee`, PAS de `mois`). Un objectif = un montant par année. UI = un seul champ, jamais douze.
  - **Policy `objectifs_ca_scope`** (cmd ALL, USING = WITH CHECK) : la branche admin (`get_my_role()='admin' AND societe_id = get_my_societe_id()`) ne teste NI `cible` NI `agente_id` → l'admin peut écrire l'objectif de **n'importe quelle agente de sa société** ET l'objectif d'agence. **Seule condition réelle : fournir `agence_id`** à l'INSERT (le trigger `derive_societe_id_from_agence` en dérive `societe_id`, qui satisfait le WITH CHECK). `agence_id` absent → échec (NOT NULL + WITH CHECK). Pas de 403 silencieux à craindre tant que `agence_id` est fourni.
  - **Unicité** : `(annee, cible)` si `agente_id` NULL ; `(annee, cible, agente_id)` sinon. `agence_id` **n'entre PAS** dans la clé (mono-agence OK ; à revoir L15).
  - **CENTRALISATION** : toute la saisie passe dans **`parametres` / volet « Équipe & agentes »**. `finances` devient **lecture seule** (`getObjectif` conservé ; `sauvegarderObjectif` + `ObjectifBar canEdit={isMarine}` retirés de finances et remontés dans paramètres). Une seule surface d'écriture.
  - **BUG réparé au passage** : `sauvegarderObjectif` (finances) faisait un INSERT `{annee, cible, agente_id, montant}` **SANS `agence_id`** → cassé même pour l'objectif d'agence (NOT NULL). Réparé par le déplacement (ajout `agence_id`). Aucune saisie d'objectif ne fonctionne aujourd'hui via l'UI, agence comprise.
  - **Objectif d'AGENCE** : champ dans le volet « Équipe & agentes ». `cible='agence'`, `agente_id` NULL, `agence_id` = unique agence de la société (déduite, mono-agence).
  - **Objectif d'AGENTE — édition** : champ dans la modale **Modifier**, en bas (après « Répartition frais de consultation »). Écriture **côté client** : `cible='agente'`, `agente_id = agenteEditee.id`, `agence_id = agenteEditee.agence_id` (dispo en state via `select('*')`). Pré-rempli avec l'objectif existant.
  - **Objectif d'AGENTE — création** : champ dans la modale **Nouvelle agente**, en bas. L'agence de l'agente est attribuée **côté serveur** (le client ne la connaît pas à la création) → le montant **transite par `POST /api/create-agente`**, qui insère la ligne `objectifs_ca` **après** la création du profil, avec l'`agence_id` qu'il vient d'attribuer à l'agente. **Échec partiel = TOLÉRANCE** : si l'objectif échoue, l'agente reste créée, objectif à 0 réglable en édition (filet, pas la cible — le but est que l'insert réussisse). Pas de rollback Auth pour un objectif raté.
  - **MULTI-AGENCE-READY par construction** : l'objectif suit l'agence de l'agente (lue depuis le profil créé, pas une source séparée). Le jour de **L15**, le sélecteur d'agence alimentera la création du profil → l'objectif héritera de cette agence sans retouche. ⚠️ **Le sélecteur d'agence dans la modale Nouvelle agente reste L15 (post-test, HORS de ce lot).** En mono-agence : aucun sélecteur, agence déduite serveur.
  - **HORS LOT — noté, NE PAS traiter ici** (relève de la refonte finances/affichage post-test, §5.4) : (a) `dashboard/page.js` lit `o.mois` — colonne **inexistante** → le graphe mensuel d'objectif est toujours vide ; (b) **à confirmer** : une division par 12 d'un objectif annuel quelque part dans le code dashboard. Deux bugs distincts, préexistants, à régler avec la refonte affichage. Ne pas ouvrir le dashboard dans ce lot.
- *État sûr fin P4 : prêt pour test utilisateur (mono-agence).*

**PHASE 5 — Fix invitation (1-2j, BLOQUANT minimal)**
- [x] L14a Fix #1 reconnexion ✅ **FAIT** (01/06, branche `claude/L14a-set-password`, mergé `a9dc8b4`). Page `app/auth/set-password/page.js` (client) : attend la session posée par le lien invite (flow **implicit** confirmé — `detectSessionInUrl` par défaut, PAS de `exchangeCodeForSession` ni `verifyOtp` nécessaire), puis `updateUser({password})` (validation ≥8 + confirmation, calque `parametres`), redirige `/dashboard`. Garde-fou timeout 4 s → écran « lien invalide/expiré » si pas de session. `create-agente` : `redirectTo` `/login` → `/auth/set-password` (1 ligne). **Testé bout en bout sur prod** : invitation → formulaire → définition mdp → déconnexion → **reconnexion email+mdp réussie** (le bug d'origine est levé). Prérequis infra : `NEXT_PUBLIC_APP_URL` créée dans Vercel (était absente → `redirectTo` valait `undefined/...` et retombait sur Site URL) ; Redirect URLs Supabase couvertes par wildcards `/**`.
- *État sûr fin P5 : un nouvel utilisateur peut s'authentifier durablement. ✅ **PRÊT POUR LE TEST.***

### 5.4 PHASE 6 — POST-TEST (reportable)

> Réorganisée le 01/06 par priorité. Règle d'or : **ne JAMAIS ouvrir l'app à une 2ᵉ franchise réelle avant d'avoir soldé le bloc A (sécurité)** — une fuite de données entre franchises concurrentes = mort du produit (cf. §0). Les blocs B/C/E/F suivent selon les retours du test et la demande réelle.

#### 🔧 FENÊTRE PRÉ-TEST EN COURS (~1,5 semaine avant le test utilisateur)
> Bugs/manques VISIBLES par le testeur, traités maintenant. Sécurité multi-franchise (bloc A), multi-agence UI (B) et onboarding (C) NE sont PAS dans cette fenêtre (hors scope d'un test mono-agence).
- [x] **L20 — navigation du menu client cassée** ✅ FAIT (01/06). 2 bugs du menu « ⋮ » de la carte client corrigés.
  - **(1) Bouton « Modifier » → 404** : pointait vers `/clients/[id]/modifier` (route inexistante). L'édition est en réalité un MODE de page sur `/clients/[id]` (`setMode('edition')`). Fix : le menu pointe désormais vers `/clients/[id]?edit=list` ; la fiche lit `?edit=list` (`useSearchParams`, wrappé dans Suspense comme `/chantiers`) et ouvre le mode édition au montage (useEffect dédié, pas de reboucle). `handleSave` : si `edit=list` → retour `/clients` après enregistrement ; sinon `setMode('vue')` inchangé (édition depuis la fiche → on reste).
  - **(2) « Voir les dossiers » → liste globale** : pointait vers `/chantiers?client=` (param ignoré par `/chantiers`). Fix via `client.dossiers` (ids déjà chargés) : 0 dossier → entrée masquée ; 1 → `/chantiers/[id]` (libellé au singulier « Voir le dossier ») ; N → `/clients/[id]` (fiche client qui liste ses dossiers).
  - NB : la page `/clients/[id]/modifier` n'existait pas ; l'édition se fait par mode sur la fiche. Seul le menu était en cause (bug de routage, pas de page manquante).
- [ ] **Boutons morts dans Finances (NOUVEAU, audit 01/06).** « 🪙 Saisir un règlement », « 📄 Exporter le bilan », export CSV (finances l.877, 1884-85) sont rendus SANS `onClick` → visibles mais sans effet. Soit les câbler, soit les masquer (à décider). Visible par le testeur.
- [ ] **`chargerTout` (finances) avale toutes les erreurs (NOUVEAU, audit 01/06).** Aucun `error` traité (l.187-218) → si une requête échoue, écran financier à 0 € SILENCIEUX (pas de message). À sécuriser (afficher une erreur au lieu de chiffres faux à 0).
- [ ] **`redevance_debut` ignoré à la création d'agente (NOUVEAU, audit 01/06).** Le champ saisi à la création n'est PAS dans le body POST `/api/create-agente` → seule l'édition le persiste. À brancher.
- [ ] **Suppression client (cascade totale + confirmation obligatoire).** Bouton « Supprimer » dans le menu client (capture 1, absent aujourd'hui), pop-up de confirmation comme la suppression de chantier. **Décision (01/06) : cascade TOTALE** — supprimer le client supprime tous ses dossiers et tout ce qui pend dessous (devis, factures, photos, CR, RDV, messages, fichiers Storage). ⚠️ **Pop-up EXPLICITE** sur ce qui est détruit (« supprimera aussi ses N dossiers et tous les documents liés, action irréversible »), pas un « Confirmer ? » générique. **Réutilise la mécanique P0-11** (FK `ON DELETE CASCADE` + nettoyage Storage exhaustif des 2 buckets). ⚠️ **Audit d'abord** : confirmer en base que la FK `dossiers.client_id → clients` est bien `ON DELETE CASCADE` (sinon le DELETE client plantera sur violation FK) ; recenser tous les chemins Storage à purger au niveau client (= union des chemins de tous ses dossiers).
- [ ] **L18 — bug ajout intervention.** ⚠️ **Audit d'abord** (le doc ne détaille pas la nature du bug : l'ajout plante ? n'enregistre pas ? doublonne ?). ⚠️ **STOP si l'audit révèle que c'est lié à la sync Google Calendar** (cf. P0-10 doublons interventions / L22) → Anne-Lise a écarté le sujet Google pour cette fenêtre.

---

#### A. SÉCURITÉ — AVANT OUVERTURE MULTI-FRANCHISE RÉELLE (ligne rouge, bloquant)
> Tant que A n'est pas soldé, l'app reste « testable » mais PAS « ouvrable » à une 2ᵉ franchise. C'est la frontière entre le test et la prod multi-tenant. **Réduit le 01/06 après audit 4** : P0-9-bis et `get_my_role anon` sont déjà faits (vérifiés en base) ; il reste L12 (storage) + le bug d'unicité redevances + 2 points d'hygiène.
- [ ] **🔴 Purge Storage automatique à la suppression (dette qui devient bloquante en multi-agences).** La cascade DB (FK ON DELETE CASCADE) supprime les LIGNES mais PAS les fichiers Storage (Postgres ne sait pas) — c'est au code applicatif d'appeler `.remove()` explicitement. État : suppression chantier purge le Storage depuis P0-11 SAUF le dossier `cr/` (tracé) ; suppression client pas encore construite (devra purger le Storage de tous les dossiers du client) ; suppressions SQL directes ne purgent jamais (orphelins garantis). À l'échelle multi-agences, le nettoyage manuel n'est PAS tenable → rendre la purge Storage systématique et fiable. À traiter après le bloc A. (Constat 02/06 : 21 orphelins nettoyés à la main, ne pas reproduire.)
- [ ] **L12 Storage cloisonné par agence** (dette sécu prioritaire, D13) — **LE point bloquant n°1**. Confirmé en base (audit 4) : les 7 policies `storage.objects` filtrent UNIQUEMENT sur le rôle, JAMAIS sur dossier/agence/société → tout staff lit/écrit/supprime tout fichier des buckets `documents` et `photos`. Pire : `client_read_photos` laisse TOUT client lire N'IMPORTE QUELLE photo (aucune vérif d'appartenance ; inactif tant que l'espace-client n'est pas câblé, mais béant dès son ouverture). À faire : préfixage/policies par agence + migration fichiers + versionner les policies dans le repo.
- [x] **🔴 BUG UNICITÉ REDEVANCES — ✅ FAIT (02/06).** Reproduit en prod (TEST AI + Anne-Lise, même mois → « duplicate key redevances_mois_annee_key »). État réel constaté : la bonne protection `redevances_agente_annee_mois_unique` existait déjà sous forme d'INDEX UNIQUE `(agente_id, annee, mois)` (invisible à une requête `pg_constraint`, d'où la confusion de l'audit) ; il ne restait qu'à dropper l'ancienne contrainte buggy `redevances_mois_annee_key UNIQUE (mois, annee)`. `DROP CONSTRAINT` appliqué (SQL versionné `docs/sql/A1_redevances_drop_ancienne_contrainte.sql`), 0 doublon préalable vérifié. **Testé en prod : deux agentes ont désormais leur redevance le même mois (juin 2026) sans collision.** Bloquant multi-agente levé.
- [ ] **Durcissements restants** (hygiène, faible gravité) : (a) EXECUTE `anon`/`PUBLIC` encore présent sur les 4 fonctions trigger (`derive_societe_id_from_agence`, `generer_reference_dossier`, `profiles_protege_identite`, `redevances_montant_protege`) — les 3 helpers ont été durcis en MT4, pas elles ; risque faible (triggers non appelables utilement hors contexte) mais incohérent. (b) policy INSERT `notifications` `WITH CHECK (true)` {public} → resserrer avec la réactivation Messagerie (bloc F). (c) leaked password protection (plan Pro). (d) captcha (optionnel).
> ✅ **DÉJÀ FAIT (vérifié audit 4, retirés du bloc A)** : P0-9-bis (7 tables opérationnelles cloisonnées par agente) ; `get_my_role()` n'est plus exposée à `anon`/`public` (MT4).

#### B. MULTI-AGENCE RÉEL (ce qui rend le multi-agence utilisable, pas juste cloisonné en base)
> Le cloisonnement multi-agence existe DÉJÀ en base (RLS, `agence_id` partout, L8 référence par agence). Il manque l'UI pour qu'un franchisé à plusieurs agences puisse s'en servir.
- [ ] **L15 Navbar bi-zone + sélecteur multi-agences.** Inclut la **notion de « vue active »** pour l'admin (onglet agence précise vs vue consolidée « toutes agences »). **Implémente le cas multi-agences de D18** : quand l'admin crée un **dossier ou un client** (entités rattachées à une AGENCE) depuis la vue consolidée (pas d'agence active), afficher un **sélecteur d'agence obligatoire** ; depuis la vue d'une agence précise, l'agence active est utilisée automatiquement. ⚠️ **Les artisans NE sont PAS concernés** (société-wide depuis MT7, pas d'agence_id) → aucun sélecteur d'agence à leur création. (En mono-agence, le cas dossier/client ne se présentait pas — l'unique agence était déduite, cf. L6-light.) NB : l'objectif d'agente (saisi en Phase 4) est déjà multi-agence-ready ; le sélecteur d'agence à la création d'agente est ici (L15).⚠️ **3 déductions « unique agence » à reprendre ici** (audit cohérence 01/06) : `api/create-agente:42`, `parametres:67` (chargerAgence), `clients/nouveau:76` — toutes `SELECT agences … limit(1)`, légitimes en mono-agence, FAUSSES dès 2 agences. (`cron/relances` et `auth-context` OK, pas concernés.)
- [ ] **L16 Facturation scopée/consolidée multi-agences** (par agence sur les onglets agence ; somme société sur la vue consolidée — paramètre de scope passé aux calculs).

#### C. ONBOARDING SELF-SERVICE (pour ne plus préparer chaque compte à la main)
- [ ] **L14b Reste onboarding** : flow création société + ajout 2ᵉ agence + sélecteur agence dans `/api/create-agente`. **contrainte UNIQUE** (societe_id, code) déjà posée en base. À la création d'une agence : **génération auto du `code`** depuis les 3 premières lettres de la ville en majuscules (ex. Martigues→`MAR`) ; collision dans la même société → 3e lettre remplacée par un chiffre incrémental (`MA1`, `MA2`...). Code non demandé au franchisé (transparent, jamais affiché).
  - **Sous-chantier : formulaire de création d'agence** — adresse en 3 champs SÉPARÉS : rue (`agences.adresse`), code postal (`agences.code_postal`), ville (`agences.ville`). ⚠️ La **ville** est saisie explicitement (alimente la génération du code agence). Colonne `code_postal` déjà créée en L10-a.
  - **Sous-chantier : auto-remplissage infos légales via API État** (feature à concevoir). Saisie du **SIRET** → récupération auto **raison sociale + RCS** (API Recherche d'entreprises data.gouv / Sirene INSEE / INPI). Champs auto-remplis verrouillés ; modif ultérieure → « contactez Anne-Lise à anne-lise.caillet@outlook.com ». NE se déduit PAS du SIRET (à saisir main) : adresse + téléphone agence + libellé franchise (`agences.nom`). Répartition : infos légales = `societes` ; adresse/tél/libellé = `agences`.

#### D. BUGS & DETTE (non bloquants, selon retours test)
- [ ] **🔴 PRIORITAIRE À AUDITER — recalculs financiers hors `finance.js` (NOUVEAU, audit fonctionnel 01/06).** `chantiers/[id]` ET `finances/page.js` recalculent des montants EN DUR au lieu de passer par `finance.js` : TVA `/1.2` et `/1.1`, courtage `0.06`, AMO `9` et `+0.09` (chantiers/[id] l.1592-1595, 3123, 3159), royalties `0.05` + TVA `1.1` (finances l.349-350, 1172, 1183, 1245). ⚠️ Certains calculent sur le **TTC** alors que finance.js calcule sur le **HT** → risque de divergence (deux chiffres différents pour le même montant). Viole CLAUDE.md §3 (« finance.js source unique », « zéro hardcode »). **C'est potentiellement le sujet le plus structurant de l'app.** ⚠️ AUDIT CIBLÉ DÉDIÉ AVANT toute correction : déterminer si les recalculs produisent des chiffres FAUX ou tombent juste par coïncidence ; cartographier chaque recalcul vs son équivalent finance.js ; ne PAS toucher aux calculs sans cadrage (risque de régression). Chantier à part entière.
- [ ] **L22 Bug synchro Google Calendar** (préexistant, identifié 29/05) : clic sur « Google » (déjà connecté) → erreur JS `Cannot access 'n' before initialization`, impossible de relancer la synchro. Les RDV s'enregistrent dans l'app (table `rendez_vous` OK) mais ne partent pas vers Google. Erreur de code (variable avant init), PAS RLS. ⚠️ Lié au sujet calendrier Google PARTAGÉ entre agences = fuite multi-tenant à creuser. (Écarté de la fenêtre pré-test actuelle.) ⚠️ **Root cause précise confirmée (audit 01/06)** : dans `api/google/calendar/sync/route.js`, `const auth` l.143 (client OAuth, dans le `try`) SHADOW le `const auth` l.128 (utilisateur) ; la l.131 `auth.user.id` lit le `auth` du bloc en zone morte temporelle (TDZ) → minifié `auth`→`n` = « Cannot access 'n' before initialization ». `POST /sync` plante systématiquement à l'entrée du `try`. Fix net : renommer le 2ᵉ `auth` en `oauthClient`. (Bug de code pur, pas RLS.)
- [ ] **Types de RDV incomplets (NOUVEAU, audit fonctionnel 01/06) — vrai manque à traiter.** `TYPE_CONFIG` (planning) n'expose que 4 types (R1/R2/R3 + `autres`) alors que le doc 03 + l'usage réel d'Anne-Lise en exigent davantage (manquent suivi, réception, Étude/Conception, Pro/Perso). Conséquence : un RDV sans dossier n'est possible que via `autres` (le « R1 sans dossier » du flux est impossible — chantier exigé). ⚠️ L'audit 1 l'avait écarté « hors sprint » → **décision révisée 01/06 : c'est un vrai manque, à traiter**, mais après AUDIT (recenser les types réellement voulus par Anne-Lise vs `TYPE_CONFIG`, l'impact sur la création/édition de RDV et la modale).
- [ ] L19 Bug molette nombres · 
- [ ] L21 DROP `factures_agente_backup_b7b` ·
- [ ] #8 dashboard admin scope (à arbitrer selon scénario testeur).
- [ ] **`dossiers.client_id → clients` = NO ACTION** (vérifié audit 4, pas CASCADE). La future « suppression client en cascade » (fenêtre pré-test) **plantera** tant que ce FK n'est pas passé en CASCADE (ou géré applicativement). À régler AVANT ce lot.
- [ ] **Trigger non documenté `dossier_inherit_referente`** (`set_dossier_referente_from_client`, BEFORE INSERT sur dossiers, remplit `referente_id` depuis `clients.referente` si NULL) — découvert audit 4, cohérent avec D18 mais jamais tracé. Seule de ces fonctions SANS `SECURITY DEFINER`/`search_path` fixé. Inoffensif (lecture d'une colonne), à harmoniser pour cohérence.
- [ ] **`partenaire_taux` absent sur l'artisan (NOUVEAU, audit 01/06, à arbitrer vs doc 04).** Aucun taux de commission partenaire stocké sur la fiche artisan ; la commission vit sur `devis_artisans.commission_pourcentage`. À arbitrer : est-ce un manque ou un choix de modèle ?
- [ ] **Petite dette code (audit 01/06)** : `clients/[id]` référence `d.objet` (colonne inexistante → bloc jamais rendu, l.371) ; dossier Storage `chantiers/{id}/cr/` non purgé à la suppression de chantier ; uploads Storage silencieux en cas d'échec (artisans/nouveau + chantiers) ; `redirectByRole` défini mais inutilisé (login). Nom+email d'Anne-Lise en dur dans Paramètres (l.355, dette multi-franchise, même famille que isMarine).
- [x] **`objectifs_ca` unicité CONFIRMÉE** (audit cohérence 01/06) : 2 index partiels — `(annee,cible) WHERE agente_id IS NULL` + `(annee,cible,agente_id) WHERE agente_id IS NOT NULL`. Conforme. Plus rien à faire.
- [ ] **Code mort `finance.js` recensé (audit cohérence 01/06, Lot E).** ~35 clés retournées par `calculateDossierFinance`/`calculateDevisFinance` ne sont lues NULLE PART hors finance.js (détail : devis `partenaire/paiementDirect/montantHT/montantTTC/comTTC` ; dossier `honoraires.*`, `honorairesPrevi.*`, `gains.bruts/nets/brutsPrevi.*`, `apporteur.lines[].*`, `royalties.*`...). + 4 clés « à confirmer » (internes). ⚠️ Nettoyage PRUDENT (chaînes internes partiellement vivantes) — re-vérifier call-sites avant toute suppression. Recensement seulement.
- [ ] **Hardcode « Martigues » dans le prompt CR (NOUVEAU, audit cohérence 01/06).** `api/cr/route.js:34` : le prompt IA de génération des comptes-rendus contient en dur « pour illiCO travaux Martigues, agence de courtage… ». L10 a couvert PDF/params/cron/navbar mais PAS ce prompt → une autre agence aurait ses CR générés mentionnant Martigues. Dette multi-tenant, même famille que L10. À dynamiser (nom agence depuis le dossier).
- [ ] **Audit code mort `lib/finance.js` repo-wide** (grep de chaque clé retournée, distinguer mort réel vs vivant ailleurs que `page.js`). Voir Doc 5 Lot E.
- [ ] **Renommage variables trompeuses basées sur « Marine »** (`isMarine`, `estChantierMarine`) → `isAdmin`/`referentEstAdmin` (comportement correct, nom piégé pour un 2ᵉ admin). Voir Doc 5 Lot E.
- [ ] **« Mot de passe oublié » sur login** (mode `forgot` non câblé ; flux *recovery* distinct du lien *invite* de L14a ; réutilisera `/auth/set-password` ou une jumelle). Voir Doc 5. Contournement en attendant : reset manuel Supabase Auth → Users.
- [ ] **Besoin métier : devis signé dans le PDF de suivi.** Le `DossierSuivi` intègre les devis NON signés ; quand un devis est signé, ce devrait être la version signée. Préexistant (constaté 01/06 en testant L10-c2, PAS lié à L10). Audit nécessaire (comment l'app distingue signé/non signé ; où la sélection se fait dans `buildDossierSuivi`).
- [ ] Optim perf RLS (wrapping fait en L5 ; dénormalisation/claim JWT si besoin).
- [ ] **Idées fonctionnelles futures** : (1) remplacer `artisans.metier` (texte libre) par une liste déroulante alimentée par `specialites` (table vide, jamais branchée) + `artisans_specialites` ; (2) feature IA : lire les attestations décennales pour déduire auto les spécialités des artisans. À concevoir séparément. `specialites` est posée en L5c comme catalogue global verrouillé, prête si utilisée.

#### E. REFONTE UX VUES FINANCES (post-test, à froid)
- [ ] **Refonte des 5 onglets finances** (F1 Prévisionnel, F2 Réel, Synthèse, 📈 Suivi financier, Facturation agentes) qui se chevauchent sur les mêmes données F1/F2 sous des angles différents (redondance Suivi/Synthèse/F1/F2). À revoir APRÈS le test (le testeur pointera peut-être lui-même la confusion). Ne pas mélanger avec le bug d'affichage CTP (déjà traité).
  - **Sous-chantier : objectif affiché par périmètre (bug connu, INCOHÉRENCE ASSUMÉE).** L'agente voit le Suivi financier en mode `agence` avec SES produits bruts (petits) comparés à l'objectif AGENCE (200000) → barre incohérente (~4%). Livré en l'état (pas un trou de sécurité). `getObjectif('agence')` figé en dur à 4 endroits. **Cible (Niveau 2)** : objectif qui suit rôle ET périmètre — agente → son objectif perso ; admin vue « toutes » → objectif agence ; admin vue « moi »/« agente X » → objectif de cette personne (suit le state `scope`). ⚠️ Gérer « agente sans objectif perso saisi » (getObjectif renvoie 0 → % absurde) : fallback à définir. Prend son sens avec le multi-agentes (B/L15).
  - **Sous-chantier : vue « compte de résultat agente »** (nouvelle vue). Aujourd'hui 2 modes : `agence` (produits bruts, charges=0) et `ctp` (résultat net franchise, admin-only). Manque une **3ᵉ vue côté AGENTE** : ses produits (frais conso + commissions + honoraires + sa part) MOINS ses charges = son net réel. Charges = (a) redevances à payer (`redevances` filtrée sur elle) ; (b) sa part du remboursement apporteur (l'admin paie l'apporteur, l'agente rembourse SA part — pas le coût total). Graphique mois/an comme les autres modes. Le Suivi financier n'utilise PAS `factures_agente` (F1/F2) — il agrège `dossiers`+`suivi_financier`+`devis_artisans`+`redevances` via `finance.js`.
  - **Sous-chantier : barre objectif MENSUEL agence à 0** (préexistant, constaté 01/06 — voir Doc 5). Le dénominateur est bon (`getObjectif('agence')/12`), c'est le numérateur (réel du mois) passé à l'`ObjectifBar` mensuelle qui ne tape pas sur le bon calcul. À reprendre ici.

#### F. EN DERNIER — RÉACTIVER LES MODULES NEUTRALISÉS
- [ ] **Réactiver Messagerie + Statistiques** : code complet conservé à `3dbd6f1` (neutralisés en L11). À restaurer et adapter au multi-tenant (RLS agence sur messages, scope agence sur stats). **+ resserrer policy INSERT `notifications`** ici (les notifs sont liées à la messagerie ; auditer d'abord qui crée les notifs). NB : trou mineur assumé jusque-là (créer une fausse notif n'expose pas de données). **Explicitement en dernier (décision 01/06).**

### 5.5 VERDICT DÉLAI
- **2 semaines** : tendu, faisable SI Phase 6 strictement reportée ET L5a sans régression. Pas de marge. (Le report de L12 hors fenêtre — D13 — est le levier qui rend ça respirable.)
- **3 semaines** : confortable, absorbe une régression L5a + permet 1 lot de Phase 6.
- **Risque #1 = L5a** (RLS finances + trigger). Mitigation : fichier SQL unique avec rollback complet + smoke test (« Marine voit X dossiers, somme F1 inchangée »).

## CHANTIER FINANCES (B) — assainir finance.js + rebrancher les écrans

> Déclenché par le besoin d'un comparateur de variantes de devis (présenter des scénarios au client). Constat : impossible de le construire sur des calculs faux/divergents → décision (assumée) de TOUT assainir d'abord. Deux phases : (1) rendre finance.js juste et complet ✅ FAIT ; (2) rebrancher les écrans dessus (en cours).

### Phase 1 — finance.js juste et complet ✅ TERMINÉE (02/06)
finance.js est désormais la SOURCE unique correcte. Corrections successives :
- ✅ Base honoraires : devis 0% (paiement direct) étaient exclus à tort → filtre `commission > 0` retiré de `getSignedTotals` (commit `ce97937`).
- ✅ Double taux : courtage/AMO en standard (6%/9% constantes) + remisé, exposés en TTC, réel ET prévi. Constantes `COURTAGE_STANDARD=0.06`, `AMO_STANDARD=0.09`.
- ✅ Déduction frais remboursés : plein montant TTC retiré du COURTAGE calculé (pas de la base, pas l'AMO), condition `frais_statut='rembourse'` seul. Doublon statut `rembourse_apres_signature`→`rembourse` nettoyé (commit `81326ca`).
- ✅ Acomptes : montant + mode + `acomptePct` + `solde` par devis, totaux `totalSignes`/`totalActifs`, sentinel -1/0 géré nativement.
- ✅ Périmètre devis : `getActiveDevis` = liste blanche `recu/accepte/a_modifier` (exclut en_attente). Définition UNIQUE de « signé » : `getSignedDevis` + flag `.signed` excluent `a_modifier` même avec date_signature.
- ✅ Totaux signés : déjà exposés (`f.honoraires.totalDevisHTSignes/TTCSignes`) — faux manque.

### Phase 2 — REBRANCHER les écrans sur finance.js (EN COURS)
Les écrans recalculent encore en dur → divergences. À faire écran par écran, testé.

**chantiers/[id]/page.js (4858 lignes) — rebranchement progressif par zones :**
- [x] **Étape 1 — Acomptes ✅ (03/06).** Les 6 sites d'acompte → `calculateDevisFinance().acompte`. Helper incomplet `montantAcompte` (sans cas -1) supprimé. `solde` ajouté à finance.js. `soldeExpected` conserve l'override par facture réelle. Testé Guerteau : montants inchangés, préremplissage facture OK, acompte fixe OK. Branche `feat/rebranch-acomptes-chantier`.
- [x] **Étape 2 — Filtres devis ✅ (03/06).** 3 filtres (devisSignes, devisRecus, commission prévue) → `getSignedDevis`/`getActiveDevis`. Exigence `&& montant_ttc` abandonnée. Corrige bug latent en_attente. Effet nul sur données actuelles (test 48 devis/17 dossiers, ensembles identiques). Mergé `d9df59f`.
- [x] **Étape 3 — Totaux signés : RIEN À FAIRE ✅ (03/06).** Déjà exposés par finance.js (faux manque de l'audit). Branche supprimée, aucun commit.
- [x] **Étape 4 — Commission ✅ (03/06).** 3 calculs (l.2087, 2668, 3288) → `calculateCommissionsFinance`/`calculateDevisFinance().comHT`. Affichage pur, neutre (écart sub-centime). Mergé.
- [x] **Étapes 5+6+7 — Honoraires + Récap + Persistance ✅ (03/06, mergé `ea73a41`).** Rebranché en UN lot (inséparables) :
  - **Honoraires** (l.1591-1603) → `finDossier.honoraires/honorairesPrevi.{courtage,soldeAmo}.ttc`. Modèle frais = finance (plein montant déduit du courtage si `frais_statut='rembourse'`). `baseCourtageHTTC` + `fraisHT` locaux supprimés (orphelins). Base section honoraires → `finDossier.honorairesPrevi.totalDevisTTCRecus`.
  - **Récap standard « 15% »** (l.3123/3159) → `finDossier.honoraires(Previ).standard.totalTTC` (6/9 PUR). Libellé « 15% » désormais honnête. Total chantier recomposé.
  - **Note « dont frais consultation déduits : −X »** ajoutée (pas copiée — la mention Récap était une addition, pas une déduction) aux 2 endroits où « taux × base » côtoie un gras net de frais (bloc courtage + en-tête AMO), condition `frais_statut='rembourse'`.
  - **ZONE 7 (persistance) gratuite + VALIDÉE en prod** : `majSuiviChantier` lit les variables rebranchées → persiste automatiquement la valeur finance. Prouvé sur Jadras : clic toggle honoraires → ligne créée avec `montant_ttc=7 802,92` (= valeur finance, pas ancien calcul). Effet de bord AMO (courtage→acompte_amo) confirmé, montant correct.
  - Chiffres changés (vérifiés node + prod) : Eppinger standard 10 635,83→11 078,99 (vrai 15%) ; Cossanteli courtage prévi −300 ; Leulier −550 (frais remboursés déduits). Tout le reste neutre.
  - Test : KPI + section + Récap prévi/signé + note déduction + persistance, tous validés sur Eppinger/Cossanteli/Leulier/Stevan. Branche `feat/rebranch-honoraires-recap-chantier`.

**Cadrage du gros lot 5+6+7 (audit complet 03/06) :**
- **Chaîne** : `devisSignes`/`devisRecus` (✅ rebranchés) → honoraires en dur (l.1591-1603) → Récap (l.3108-3164) → `majSuiviChantier` PERSISTE en base (l.3327, 3342). Inséparables : rebrancher 5 propage dans 6 et 7.
- **ZONE 5 (honoraires)** : `f.honoraires.courtage/soldeAmo.ttc` (signé), `f.honorairesPrevi.*` (prévi). Modèle frais finance = plein montant. **Change 2 dossiers à frais remboursés** : Cossanteli −300€, Leulier −550€ (courtage prévi). Reste neutre (`frais_deduits=false` partout).
- **ZONE 6 (standard Récap)** : aujourd'hui hybride `base × (taux_courtage_réel + 0.09)` → libellé « 15% » menteur (vaut 14,4% sur Eppinger). **DÉCISION MÉTIER TRANCHÉE (03/06) : standard = 6%/9% PUR (15% catalogue illiCO)** → utiliser `f.honoraires.standard.totalTTC`. Change le « standard 15% » des dossiers à taux≠6% (Eppinger : 10 635,83 faux → 11 078,99 vrai). « Total chantier » composite = MANQUANT dans finance.js (à recomposer côté écran).
- **🔴 ZONE 7 (persistance — le point dangereux)** : `majSuiviChantier` écrit `suivi_financier.montant_ttc`, RELU par `finances/page.js:349` → `honReel` = **honoraires RÉELS facturés de l'agente** (argent réel, pas cosmétique), ET par `calculerAvancement` → % avancement. **Bon point : déclenché UNIQUEMENT sur clic (onToggle), JAMAIS au render** → ouvrir un dossier ne réécrit rien. `montant_ttc` figé au 1er insert (jamais ré-updaté).
- **🔴 MIGRATION DE DONNÉES NÉCESSAIRE** : 10 lignes `suivi_financier` existent avec `montant_ttc` ancien modèle (certaines RÉGLÉES → pèsent sur gains + avancement). Resteront figées/fausses (dossiers rembourse + taux≠6%) sauf UPDATE explicite. NE PAS migrer en aveugle (lignes réglées = historique). À cadrer : recalculer via finance.js, comparer, décider — priorité Cossanteli/Leulier (rembourse) + Eppinger/Delbove (taux≠6%).
- **Dette préexistante repérée** : `finances/page.js:349` reconstitue le HT via `/1.1` au lieu de `/1.2` (incohérent). Hors périmètre immédiat.
- **Ordre** : Étape 4 (commission, neutre) → puis 5+6+7 ENSEMBLE (change argent réel + persistance + migration → session dédiée, tête reposée).

**Autres écrans (après chantiers/[id]) :**
- [ ] **Rebrancher le Recap PDF** sur finance.js. ⚠️ Document CLIENT. Le rebranchement AJOUTERA l'affichage courtage standard+remise (le Recap ne montre la remise que sur l'AMO aujourd'hui). ⚠️ `acomptes.totalActifs` (recu+accepte+a_modifier) ≠ Recap preview (recu+accepte) → recomposer depuis la liste filtrée ou ajouter un total dédié.
- [ ] **Bug préexistant : prévisionnel page finance** (devis non signés invisibles, `finances/page.js:254` filtre `!== refuse` en dur). Pas une régression de nous. À auditer/rebrancher.
- [x] **dashboard:129 ✅ (03/06).** Filtre devis → `getActiveDevis`. Le dashboard était déjà branché sur finance.js (tous les montants via fin.*/dvFin.netCom) ; seul ce filtre restait. Neutre. Mergé.
  - 📝 Dettes mineures LAISSÉES (volontairement, neutres) : (a) défaut `part_agente` l.101 duplique `getPartAgente` (valeurs identiques, touche normDossier = risqué pour gain nul) ; (b) bug `o.mois` — `objectifs_ca` n'a PAS de colonne `mois` → graphe/KPI objectif MENSUEL plat à 0 (l.254/264) ; l'objectif ANNUEL (l.258/321) est correct. Décision produit requise : objectif mensuel = annuel/12 ? ou vraie saisie mensuelle ? → à traiter avec refonte finances/objectifs (bloc E).

### Dettes liées au chantier finances
- [ ] **Dette `frais_deduits`** : champ encore lu à `finance.js:94` (frais en tant que GAIN — sémantique distincte de la déduction courtage, ne PAS confondre) + affichages (totaux chantier, conditions PDF) + la case UI « Remboursés — déduits du courtage ». Une fois TOUT migré sur `frais_statut`, supprimer la case + la colonne. **Question métier en attente** : frais remboursés ⟹ automatiquement « ne compte pas comme gain » (l.94) ? ou décision séparée ?
- [ ] **Dette désynchro `suivi_financier` frais ↔ dossiers.frais_statut** (découverte 03/06). Les lignes `suivi_financier` de type `frais_consultation` portent un `statut_client` désynchronisé de la VRAIE source `dossiers.frais_statut` (que l'app lit pour l'affichage). Inerte aujourd'hui (montant NULL, statut non lu), mais PIÈGE pour les audits (a fait croire que des frais réglés étaient « en attente »). Concernés : Souchon, Carmona, Gergaud (frais réellement réglés via frais_statut, ligne suivi_financier en_attente). À assainir un jour (supprimer ces lignes doublons inertes, ou synchroniser), pas urgent.
- [ ] **⚠️ Statut DEVIS** (recu/accepte/refuse/a_modifier/en_attente) **≠ statut DOSSIER** (devis_en_attente/… préfixés `devis_`) — ne pas confondre lors des corrections de filtres.
- [ ] **Dette comportement : décocher un toggle de règlement ne supprime PAS la ligne `suivi_financier`** (découvert 03/06). `majSuiviChantier`/`upsertOne` créent la ligne au 1er clic (INSERT avec `montant_ttc`) ; décocher repasse juste `statut_client='en_attente'`, la ligne et son montant figé RESTENT. Conséquence : chaque manipulation de toggle (test, exploration) laisse un résidu non réglé (montant figé qui fausse l'avancement si non-NULL, inerte si NULL). Génère des parasites en continu. ⚠️ Le testeur utilisateur en créera aussi. À traiter : soit supprimer la ligne quand on décoche la dernière échéance d'un type, soit ne créer la ligne qu'au règlement réel. Non bloquant mais pollue.
- [ ] **Migration `suivi_financier.montant_ttc` déjà persistés** (audité, sujet distinct) : impact réel ~5€ (Eppinger acompte_amo réglée, dérive devis). Les lignes figées ne se réécrivent pas (montant_ttc INSERT-only). À décider : laisser (impact négligeable) ou rafraîchir au cas par cas. Faible priorité.

### Objectif final du chantier
Une fois finance.js source unique partout : construire le **comparateur de variantes de devis** (besoin initial) — sélection de devis + surcharge montant/taux + export PDF d'une variante. Sur base saine.


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
| 28/05 | **L17 Durcissements (vérifiés/dégonflés)** | ✅ traité |
| 28/05 | **PHASE 1 COMPLÈTE** | ✅✅ |
| 28/05 | Phase 2 — SQL versionnés `docs/sql/MT1-MT4` (commit `f905c2b`) | ✅ |
| 28/05 | **L1 — MT1 tables societes/agences créées + RLS fermée** | ✅ appliqué main |
| 28/05 | **L2 — MT2 seed CTP+Martigues + colonnes nullable** | ✅ appliqué main |
| 28/05 | **L3 — MT3 backfill 102 lignes + NOT NULL** | ✅ appliqué main |
| 28/05 | **L4 — MT4 helpers + REVOKE anon/PUBLIC** | ✅ appliqué main |
| 28/05 | **PHASE 2 COMPLÈTE (côté schéma)** | ✅✅ |
| 28/05 | Découverte : NOT NULL casse les INSERTs sans `agence_id` | ⚠️ acté, plan ajusté |
| 28/05 | **L6-light** (Phase 2-bis) : patch INSERTs + `api/create-agente` (commit `c385bf7`) | ✅ testé 9 chemins |
| 28/05 | **MT5** : policies lecture `societes`/`agences` (débloque admin) | ✅ appliqué main |
| 28/05 | **PHASE 2 RÉELLEMENT BOUCLÉE — app fonctionnelle** | ✅✅✅ |
| 29/05 | Correction donnée Marine : `2026-AM-021` rattaché à LEULIER Laura (UPDATE encadré, client_id était NULL) | ✅ fait |
| 29/05 | **Phase 3 démarrée** — audit RLS complet (patchwork 3 générations confirmé) | ✅ |
| 29/05 | **L5a-1-prep** (code) : lectures profiles compatibles policy stricte (commit `ddaa334`) | ✅ mergé |
| 29/05 | **L5a-1a** : policies profiles (SELECT cloisonné société, agente=soi / admin=sa société) | ✅ appliqué main |
| 29/05 | **L5a-1b** : trigger `profiles_protege_identite` (role+societe_id figés via app, souple en SQL direct) | ✅ appliqué main |
| 29/05 | **L5a-2** : RLS racines — dossiers (référente+agence), clients (référente+agence, trou « agente voit tous clients » fermé), artisans (annuaire société) | ✅ appliqué main, testé |
| 29/05 | **L5a-3-mig** : migration `redevances.agence_id` (ADD+backfill+NOT NULL, prépa multi-agence) | ✅ appliqué main |
| 29/05 | **L5a-3-rls** : RLS finances (5 tables : filles via EXISTS dossiers, factures_agente + redevances par agente_id) + trigger D17 patché + L6-light-bis (upsert redevance câblé agence_id, commit `0ae9c9c`) | ✅ appliqué main, testé |
| 29/05 | **L5a COMPLET** (fondations + racines + finances) — bug CTP identifié = affichage (lot code séparé) | ✅✅ |
| 29/05 | **MT6** : dénormalisation `societe_id` sur 4 racines (colonne+backfill+NOT NULL, trigger générique immuabilité société, policies basculées sur societe_id) | ✅ appliqué main, testé table par table |
| 29/05 | Nettoyage données test : 6 clients + 4 dossiers test supprimés (audit enfants 0, transaction encadrée). Base = 19 clients / 20 dossiers, que du réel | ✅ |
| 29/05 | **L5a-3-fix** : trou client filles finances fermé (devis/factures_artisans/suivi → staff only) | ✅ appliqué main |
| 29/05 | **L5b** : RLS 6 tables opérationnelles (staff via EXISTS dossiers ; branches client lecture seule sur comptes_rendus + photos ; photos nettoyé de 5→2 policies) | ✅ appliqué main, testé |
| 29/05 | **L5c** : RLS transverses (google_tokens par user, specialites catalogue global verrouillé, artisans_specialites + fiches_techniques via EXISTS artisans, messages staff+client) | ✅ appliqué main, testé |
| 29/05 | **L5c-B-fix** : régression objectif d'agence détectée (KPI à 0) → migration objectifs_ca (agence_id+societe_id) + policy à 3 branches (agente: perso+agence ; admin: société) | ✅ appliqué main, testé |
| 31/05 | **L8** : référence chantier par agence — UNIQUE (agence_id, reference) + fonction/trigger SECURITY DEFINER (génération côté base, max+1 par agence+année, bypass RLS) + patch code (suppression genererReference JS) | ✅ appliqué main + branche code, testé (création AMO → 2026-AM-023) |
| 31/05 | **Lot code masquage toggle CTP côté agente** (bug affichage) — `PillToggle` admin-only, agente forcée mode `agence` | ✅ branche `claude/laughing-mccarthy-oYec4`, testé Vercel |
| 31/05 | **PHASE 3 COMPLÈTE** (hors notifications reportée Phase 6) → place à la Phase 4 | ✅✅✅ |
| 31/05 | **MT7** : artisans société-wide — retrait de `agence_id` (trigger artisans + FK + index + colonne) + code fournit societe_id direct. Correction modèle multi-agence | ✅ code `072ccd7` + base `15161ed`, testé |
| 31/05 | **L6** (réduit) : `artisans/nouveau` + `clients/nouveau` lisent le profil via `useAuth()` (re-fetch supprimé). 3 autres pages en dette assumée | ✅ commit `8d98a44`, testé Vercel |
| 31/05 | **L7** : navbar nom d'agence/société dynamique (enrichissement `useAuth()` → `displayAgenceName`) + prénom redondant retiré | ✅ commits `96e8872`+`f3ecef0`, mergé `10734ca`, testé |
| 31/05 | **UPDATE valeurs CTP** en base (societes nom/siret 14ch/rcs + agences adresse/tél) | ✅ commit doc `b48d4b7` |
| 31/05 | **L10-a** : params bloc Agence dynamique + login neutre + texte profil retiré + adresse décomposée (SQL `code_postal` `8896618` + code `399afc9`) | ✅ mergé `23b4d97`, testé |
| 31/05 | **L10-b** : cron relances — villes d'agence dynamiques (boucle acompte) + décennale signée par admin société + villes. ⚠️ emails non branchés → validé build+diff | ✅ `5d1ab4b`, mergé `ff4b678` |
| 31/05 | **[HORS SPRINT — demande Marine] Modals de saisie : plus de fermeture au clic extérieur** (DevisModal puis 5 autres : ModalShell interventions/CR, agente créer/suppression, RDV planning, ModaleChoixClient). Retrait handler overlay + stopPropagation. Échap ModalShell conservé. Visionneuses/quick menu volontairement NON touchés. | ✅ `9d70cb3` (devis) + `77d2202`→`dde285a` (reste), testé |
| 31/05 | **L10-c1** : PDF `route.js` — nom d'agence dynamique (header + footer récap + footer CR), dossier enrichi agence+société. Frais conso/honoraires intacts | ✅ `3ad345c`, mergé `7d7bd20`, testé (récap+CR) |
| 01/06 | **L10-c2** : PDF `restitution.js` — (A) 7 `Ftr` + `makeCoverPage` dynamiques (`95915d4`) ; (B) suppression code mort buildDossierRestitution/R3, 233 lignes (`4a83e91`). **→ L10 COMPLET** | ✅ testé (DossierSuivi) |
| 01/06 | **Écrans saisie objectifs CA** : finances → lecture seule (suppr. `sauvegarderObjectif`, 2 `ObjectifBar` en `canEdit=false`) ; saisie centralisée dans paramètres (objectif agence volet Équipe + objectif agente en édition, helper client avec `agence_id`) ; insert objectif agente à la création via `api/create-agente` (agence résolue = unique agence société, tolérance échec partiel). Bug `sauvegarderObjectif` sans `agence_id` réparé au passage. Testé en base (ligne agente cible OK : montant/agence_id/societe_id corrects). **→ PHASE 4 COMPLÈTE** | ✅ mergé `4cc2a6` |
| 01/06 | **L14a — fix reconnexion après invitation** : page `/auth/set-password` (flow implicit, session auto + `updateUser`) + `redirectTo` corrigé dans `create-agente`. Prérequis `NEXT_PUBLIC_APP_URL` créée dans Vercel. Testé prod bout en bout (invitation → mdp → reconnexion OK). **→ PHASE 5 COMPLÈTE — PRÊT POUR LE TEST UTILISATEUR** | ✅ mergé `a9dc8b4` |
| 01/06 | **L20** : fix navigation menu client — Modifier (404 → `/clients/[id]?edit=list` ouvrant le mode édition) + Voir les dossiers (0 masqué / 1 → dossier / N → fiche client) | ✅ FAIT |
| 01/06 | **Audit 4 (sécurité) + Audit fonctionnel** post-phases — état réel vérifié. Sécurité : P0-9-bis fermé, get_my_role durci, L12 + bug unicité redevances confirmés bloquants. Fonctionnel : aucun bloqueur dur nouveau (login/création/paramètres OK) ; découvertes = recalculs hors finance.js (prioritaire), types RDV incomplets, bug Google TDZ, boutons morts finances | ✅ audits lecture seule, rien modifié |
| 01/06 | **Audit cohérence & dette** (3ᵉ audit post-phases) — doc 02 périmé (features CDC jamais construites : double honoraire AMO, raison_sociale, taux_1/2, artisan_documents) ; bug redevances réduit à 1 DROP (bonne contrainte déjà là) ; UNIQUE agences déjà posée ; objectifs_ca unicité confirmée ; hardcode prompt CR Martigues (nouveau) ; finance.js ~35 clés mortes recensées | ✅ lecture seule |
| 02/06 | **Bloc A — bug unicité redevances ✅** : DROP de l'ancienne contrainte `(mois, annee)`, la bonne `(agente_id, annee, mois)` existait déjà en index. Testé prod (2 agentes même mois OK). SQL versionné A1 | ✅ appliqué main |
| 02/06 | **Bloc A — nettoyage orphelins Storage** : 21 fichiers résiduels supprimés (3 dossiers + 2 artisans supprimés dont le ménage Storage avait été manqué ; 0 référence vivante vérifiée sur 7 tables). Buckets propres avant L12 | ✅ fait via interface Storage |
| 02/06 | **Chantier finances (B) — étape 1 : base honoraires corrigée.** Bug `finance.js:76` (`getSignedTotals` filtrait `commission_pourcentage > 0`, excluant à tort les devis 0% de la base honoraires, contraire doc 04 l.41). Filtre retiré (1 ligne). Prouvé sur 2026-AM-002 : honoraires 6 895,27 → 7 623,21 € ; commissions/apporteur inchangés ; dossier sans 0% non régressé. Branche `fix/honoraires-base-devis-0pct` | ✅ mergé |
| 02/06 | **Chantier finances (B) — finance.js complété : acomptes + périmètre devis.** (1) Acomptes artisans calculés dans finance.js (montant + mode + totalSignes/totalActifs), gestion native sentinel -1/0. (2) `getActiveDevis` corrigé en liste blanche (recu/accepte/a_modifier) → exclut en_attente du prévisionnel. (3) Définition UNIQUE de « signé » : `getSignedDevis` + flag `.signed` excluent a_modifier même avec date_signature (cas client qui revient sur un devis signé). Impact réel vérifié : Jadras (honoraires réels −15 298 € base, devis a_modifier sortis du réel, statut confirmé correct), en_attente 0 € d'impact. | ✅ mergé |
| 03/06 | **Finances (B) Étape 1 — Acomptes rebranchés** : 6 sites de chantiers/[id] → `calculateDevisFinance().acompte`, helper `montantAcompte` supprimé, `solde` ajouté à finance.js. Testé Guerteau | ✅ mergé |
| 03/06 | **Finances (B) Étape 2 — Filtres devis rebranchés** : 3 filtres → `getSignedDevis`/`getActiveDevis`, bug latent en_attente corrigé, effet nul (test 48 devis). Mergé `d9df59f` | ✅ mergé |
| 03/06 | **Audit zones 4-5-6-7** (rebranchement chantiers/[id]) : ZONE 7 persistance = argent réel (relu par honReel) mais déclenchée sur clic seulement ; 5+6+7 inséparables ; migration 10 lignes suivi_financier nécessaire ; décision ZONE 6 = standard 6/9 pur | ✅ lecture seule |
| 03/06 | **Finances (B) Étape 4 — Commission rebranchée** : 3 calculs de commission de chantiers/[id] (Commission prévue HT l.2087, par devis l.2668, échéance l.3288) → `calculateCommissionsFinance().comHT` / `calculateDevisFinance().comHT`. Affichage pur. Neutre (écart sub-centime d'arrondi). Réutilise finAc/finDv (DRY). Branche `feat/rebranch-commission-chantier` | ✅ mergé |
| 03/06 | **Finances (B) — préalables gros lot 5+6+7 terminés (audits + ménage data).** (1) Photo `suivi_financier` : AUCUNE migration de modèle nécessaire — les lignes persistées utilisent déjà les taux réels du dossier (le 0.09 hybride n'est jamais persisté, seulement affiché) et aucun dossier `frais_statut='rembourse'` n'a de ligne ; impact réel d'un rebranchement ≈ 5€ (Eppinger, ligne réglée intouchée). (2) Élucidation contradiction écran/base : la ligne frais s'affiche d'après `dossiers.frais_statut`, PAS `suivi_financier.statut_client`. (3) Ménage : 4 résidus de clics test Jadras supprimés (acompte_amo 310,50 périmé + honoraires_courtage/solde_amo/acompte_artisan L Habitat, tous NULL/en_attente). SQL versionné `CLEAN_jadras_residus_toggle.sql`, DELETE par id + rollback, contrôle avant/après OK. | ✅ appliqué main |
| 03/06 | **Finances (B) Étapes 5+6+7 — Honoraires + Récap + Persistance** (LE gros lot) : honoraires rebranchés sur finDossier (modèle frais finance), standard Récap = 6/9 pur (Eppinger 10635→11079), note « frais déduits » sur dossiers rembourse, base section sur finance, orphelins baseCourtageHTTC/fraisHT supprimés. ZONE 7 persistance VALIDÉE prod (Jadras : toggle persiste montant finance 7802,92). Mergé `ea73a41` | ✅ mergé |
| 03/06 | **Finances (B) — dashboard rebranché** : filtre devis l.129 (`!== refuse`) → `getActiveDevis`. Dashboard était déjà sur finance.js pour tous les montants (fin.*, dvFin.netCom) ; seul ce filtre restait en dur. Neutre (le seul en_attente a netCom=0 ET non débloqué). Branche `feat/rebranch-filtre-dashboard` | ✅ mergé |

⚠️ **CONSIGNES PROCESS CLAUDE CODE (permanentes, à rappeler en tête de CHAQUE lot)** :
1. **SYNC AVANT TOUT** : Anne-Lise merge côté GitHub → la copie locale de Claude Code est en retard. Au début de chaque session/lot, Claude Code DOIT `git fetch origin && git checkout main && git pull origin main`, puis confirmer le HEAD, AVANT tout audit ou patch. Ne jamais auditer/coder sur un HEAD désynchronisé (risque : travailler sur du code périmé, ex. sans L6).
2. **BRANCHE NEUVE par lot** : ne jamais réutiliser une branche déjà mergée (brouille l'historique). Une branche = un lot.

**Prochaine action** : **TEST UTILISATEUR** (franchisé testeur, mono-agence). Phases 1 à 5 closes — l'app est BATILIS-brandée, multi-tenant cloisonné, fonctionnelle en création/consultation, infos d'agence dynamiques, objectifs CA saisissables, et un nouvel utilisateur peut définir son mot de passe et se reconnecter durablement (L14a validé en prod). ⚠️ **AVANT le test : nettoyer les données test** (via les modales de l'app, pas SQL brut, pour ne pas laisser d'orphelins Auth) — agente « TEST TEST » + sa ligne objectif, agente jetable créée pour tester L14a, artisan « TETS », dossier « 2026-AM-023 ». Tout report (Messagerie/Stats, storage cloisonné L12, onboarding self-service L14b, navbar multi-agences L15, etc.) reste en **Phase 6, post-test**.

**Note de méthode** : la découverte du blocage NOT NULL/INSERTs en fin de Phase 2 confirme la valeur du protocole « tester après chaque MT ». Si on avait enchaîné directement Phase 3 sans test post-MT3, on aurait découvert le bug en plein milieu des RLS (bien pire à diagnostiquer). Erreur de planification partagée (binôme), détectée à temps par la méthode. Idem MT5 : le blocage RLS lecture `agences` a été révélé par le test des 9 chemins, pas deviné.