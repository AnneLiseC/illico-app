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
> 📍 **État au 29/05** (annoté en cours de Phase 3) : profiles + racines (dossiers/clients/artisans) + finances = ✅ refaits (L5a). Restent L5b (opérationnelles) + L5c (transverses). Détail par catégorie ci-dessous.

1. **P0-9 propre** (`get_my_role()` + ownership) : dossiers, devis_artisans, factures_artisans, suivi_financier, factures_agente, redevances. ✅ **Toutes refaites en L5a-2/L5a-3** (cloisonnement société/agence ajouté au-dessus de l'ownership).
2. **Ancienne par rôle seul** (`role IN ('admin','agente')` → toute agente voit tout) : ❌ = trou P0-9-bis. État :
   - clients, artisans → ✅ **faits (L5a-2)** (trou « agente voit tout » fermé).
   - rendez_vous, interventions_artisans, photos, comptes_rendus, chantier_documents, chantier_fiches_techniques → ⏳ **L5b** (pas encore faits).
   - fiches_techniques, specialites, artisans_specialites, objectifs_ca, messages → ⏳ **L5c** (pas encore faits).
3. **Styles mélangés** : `get_my_role()` vs `EXISTS(SELECT FROM profiles...)` vs `auth.uid() IN (SELECT...)`. 3 façons d'écrire la même chose → unification en cours (finalisée avec L5b + L5c, puis simplifiée par MT6 qui remplace les sous-SELECT agences par `societe_id` direct sur les racines).
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
- D5. `agence_id` propre sur racines (dossiers, clients, artisans, profiles) ; héritage par JOIN ailleurs (dette perf assumée, optim post-lancement).
- D6. Admin rattaché société, agent rattaché agence.
- D7. Produit BATILIS ; contenu réseau illiCO commun ; coordonnées agence dynamiques.
- D8. CR + Messages + Statistiques neutralisés pour le test.
- D9. Refonte RLS complète et unifiée (un seul pattern).
- D10. Login Google supprimé.
- D11. Onboarding : lien d'invitation nommé (par email) envoyé par Anne-Lise + validation `@illico-travaux.com`. Le franchisé crée société+1ère agence+mot de passe via le lien, puis ajoute agences et agentes (rattachées à une agence). Réutilise `inviteUserByEmail` + résout fix #1.
- D12. Référence chantier : la chaîne stockée reste `AAAA-XX-NNN` lisible (X X = suffixe typologie auto : `CT`=courtage / `AM`=AMO / `ES`=estimo, généré depuis `dossiers.typologie`). Cloisonnement par `UNIQUE (agence_id, reference)` + séquence NNN comptée **par agence**. Le `code` agence est un identifiant **interne** (colonne `agences.code`) qui n'apparaît PAS dans la référence affichée au client (UX propre, pas de préfixe parasite sur les PDFs). À la création de futures agences (L14b), le code se génère auto à partir des 3 premières lettres de la ville (ex. Martigues→`MAR`/`MTG`) avec incrément en cas de collision dans la même société (`MA1`, `MA2`...).
- D13. Storage cloisonné par agence (policies à versionner) — sécurité critique. **REPORTÉ post-test** (dette sécurité prioritaire, AVANT ouverture multi-franchise réelle). Risque assumé pour le test contrôlé : un `dossier_id` pourrait fuiter par copie d'URL, mais en test à 1 agence le risque est théorique.
- D14. `profiles.agence_id` = NULL pour admin (rattaché société via `societe_id`), rempli pour agent. L'admin a SES PROPRES dossiers sur toutes ses agences. → `profiles.agence_id` NOT NULL impossible globalement (NULL pour admin). **La règle de détermination de l'`agence_id` à la création d'un dossier/client/artisan est précisée en D18.**
- D15. Profils `client` (table `profiles`, role='client' = comptes espace-client, à distinguer de la table métier `clients`) portent `agence_id` = l'agence du client métier qu'ils représentent (donc l'agence de la référente de ce client, cohérent avec D18). Cloisonnement de ce que voit un compte client : par identité (`profiles.client_id → clients.id`), pas par agence.
- D16. Phase 3 (bascule RLS) : tout dans UNE seule session, ordre fondations → racines → filles → transverses. Test à la fin de chaque paquet (L5a/b/c), mais PAS d'arrêt sur plusieurs jours entre les paquets (sinon fenêtre d'incohérence dossiers/filles).
- D17. Patch trigger `redevances_montant_protege` : ajouter `NEW.agence_id := OLD.agence_id;` (CREATE OR REPLACE, garder SECURITY DEFINER + search_path). À inclure dans L5a-3 (avec les policies finances), sinon l'agente pourrait réaffecter sa redevance à une autre agence. ✅ **Confirmé pertinent** : `redevances.agence_id` est ajouté par la migration L5a-3-mig (préparation multi-agence). Le trigger actuel protège déjà `montant_ht`/`agente_id`/`mois`/`annee` pour une non-admin → on ajoute `agence_id` à cette liste.
- D18. **Détermination de l'`agence_id` à la création de `dossiers` / `clients` / `artisans`** (règle tranchée, implémentation par horizon) :
  - **Principe** : l'`agence_id` suit la **référente** de l'entité, PAS le créateur (sinon une référente d'une autre agence ne verrait pas son propre dossier après cloisonnement RLS).
  - **`clients`** : `agence_id` = agence de la `referente` sélectionnée. Une **agente** crée toujours pour elle-même (ne peut PAS désigner une autre référente — règle métier confirmée) → `agence_id = profile.agence_id`. Un **admin** choisit la référente via le sélecteur (qui propose les agentes ET l'admin elle-même) : si référente = agente → agence de cette agente ; si référente = admin (agence_id NULL) → voir règle admin ci-dessous.
  - **`dossiers`** : un chantier est toujours créé pour un client (L13b). Il **hérite de l'agence du client** : `agence_id = client.agence_id`. (Cohérent : référente du dossier = `client.referente_id` = référente du client = même agence.) Pas de sélecteur de référente dans le formulaire chantier.
  - **`artisans`** : pas de notion de référente (prestataire). `agence_id` = agence du créateur (agente → son agence ; admin → règle admin ci-dessous).
  - **Règle admin (référente = admin, ou création artisan par admin)** : l'agence dépend de la **vue active** dans l'app. (a) Admin dans la vue d'une agence précise (onglet) → agence active. (b) Admin dans la vue consolidée « toutes agences » → **doit sélectionner une agence** (sélecteur obligatoire à la création).
  - **Implémentation par horizon** : la notion de « vue active » + le sélecteur d'agence relèvent de la navbar bi-zone multi-agences (**L15, post-test**). **Pour le test (mono-agence)** : il n'y a qu'une agence, donc tous les cas admin se résolvent automatiquement à l'unique agence de sa société (`SELECT id FROM agences WHERE societe_id = admin.societe_id LIMIT 1`) — pas de sélecteur à afficher. La règle complète est définie ; seul le cas multi-agences (sélecteur en vue consolidée) est implémenté plus tard en L15.
  - Extensible : si une agente devait un jour appartenir à plusieurs agences (rare, sur demande), même principe que l'admin (vue totale + sélection).

---

## 5. PLAN D'EXÉCUTION (issu de l'audit 3)

> Plan issu de l'audit 3 (v2, ancré sur ce doc). Lots L1-L21. Effort : S≈½j, M≈1j, L≈2j, XL≈3-5j.

### 5.1 Schéma des nouvelles tables (audit 3 §A.1)
**`societes`** (minimal, D7) : `id` uuid PK · `nom_societe` text NOT NULL · `siret` text (stocke un SIREN 9 ch. ou SIRET 14 ch., UNIQUE partiel quand renseigné) · `rcs` text · `created_at`/`updated_at` timestamptz.
**`agences`** : `id` uuid PK · `societe_id` uuid NOT NULL FK→societes RESTRICT · `nom` text NOT NULL · `ville` text NOT NULL · `code` text NOT NULL (identifiant **interne** d'agence, UNIQUE par société — sert au cloisonnement de séquence et à des regroupements internes ; PAS affiché dans la référence chantier client, cf D12) · `responsable_nom` text (PAS de FK, évite circularité) · `email` · `logo_path` · `adresse` · `telephone` · `created_at`/`updated_at`.
**Colonnes ajoutées** : `profiles.societe_id` (FK RESTRICT) + `profiles.agence_id` (FK RESTRICT, NULL pour admin cf D14) ; `dossiers.agence_id` + `clients.agence_id` + `artisans.agence_id` (FK RESTRICT, NOT NULL cible).
Seed initial (MT2) : société CTP (SIREN 9 ch. `948096888` stocké en text dans `siret`), `nom_societe = 'CONSEIL TRAVAUX PROVENCE'` ; agence Martigues : `nom = 'illiCO travaux Martigues'`, `ville = 'Martigues'`, `code = 'MTG'`, `responsable_nom = 'Marine MICHELANGELI'`, coordonnées (email/adresse/téléphone) laissées NULL (à remplir en L10 dynamisation info agence).

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
- [x] L17 Durcissements sécu annexes — ✅ TRAITÉ (vérifié en base avant toute action, conformément à la règle anti-hypothèse). Bilan : (1) **Policy UPDATE `photos`** → ABANDONNÉ : l'absence de policy UPDATE est confirmée (4 policies : DELETE/INSERT/SELECT×2, pas d'UPDATE) MAIS c'est théorique — Anne-Lise uploade avec noms uniques (pas de remplacement/upsert), donc aucun bug réel, on n'ajoute pas de policy inutile. (2) **`notifications` INSERT `WITH CHECK (true)`** → confirmé permissif (`roles {public}`), RENVOYÉ À L5c (réécrire la policy proprement avec la refonte RLS, pas de patch isolé). (3) **Leaked password protection** → confirmé désactivé, mais RÉSERVÉ AU PLAN PRO (projet en plan gratuit, toggle bloqué) → reporté « avant ouverture réelle » (naturellement couplé au passage Pro). (4) **Captcha** → laissé OFF volontairement (hors périmètre, inutile pour onboarding sur invitation fermée sans inscription publique).
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
  - **Bug CTP = AFFICHAGE confirmé** (pas RLS) : onglets « Agence - encaissements bruts » / « CTP - Résultat net » visibles côté agente alors que la RLS cloisonne déjà au niveau base. → à masquer côté code pour le rôle agente (lot séparé, après MT6).
- [ ] **MT6 — dénormalisation `societe_id` (amélioration de fond, AVANT L5b)** : ajouter `societe_id` en dur sur les RACINES (`dossiers`, `clients`, `artisans`, `redevances`) — PAS sur les filles (elles restent cloisonnées via `EXISTS dossiers`, lookup PK rapide). Raison : le cloisonnement multi-SOCIÉTÉ est l'enjeu sécu n°1 à ~50 franchisés ; `societe_id` est une propriété immuable (société A ≠ société B, un dossier ne change pas de société). Comparaison directe `societe_id = get_my_societe_id()` au lieu du sous-SELECT `agence_id IN (SELECT...FROM agences...)` → plus rapide + plus juste sémantiquement. Étapes : (1) ADD COLUMN nullable + backfill depuis `agence_id → agences.societe_id` + SET NOT NULL (pattern MT3) ; (2) **trigger de cohérence** dérivant `societe_id := agence.societe_id` à l'INSERT/UPDATE (ne pas dépendre du code applicatif) ; (3) **réécrire** les policies L5a-1/L5a-2/L5a-3 pour utiliser `societe_id = get_my_societe_id()`. Découverte tardive (MT2 n'avait ajouté qu'`agence_id`) — assumée, comme L6-light/MT5.
- [ ] L5b [opérationnelles P0-9-bis] rendez_vous, interventions_artisans, photos, comptes_rendus, chantier_documents, chantier_fiches_techniques. Test : cloisonnement croisé en base.
- [ ] L5c [reste + transverses] messages (5 policies P0-2), objectifs_ca, notifications (INSERT resserré), fiches_techniques, specialites, artisans_specialites, google_tokens. Test.
- [ ] L8 Référence chantier par agence (D12) : ajouter `UNIQUE (agence_id, reference)` sur `dossiers` ; refondre la génération dans `chantiers/nouveau/page.js` (et tout endroit similaire) pour que la séquence NNN soit **comptée par agence** (`WHERE agence_id = ?`), pas globalement. Garder le format affiché `AAAA-XX-NNN` (X X = suffixe typologie auto, déjà géré). Atomicité : utiliser `SELECT FOR UPDATE` ou contrainte UNIQUE + retry pour gérer la concurrence. ⚠️ Vérifier en lecture d'abord comment les suffixes `CT`/`AM`/`ES` sont générés aujourd'hui (mapping `typologie`→suffixe), pour préserver la logique.
- *État sûr fin P3 : multi-tenant cloisonné, prouvé par « Marine voit les siens / Anne-Lise les siens » croisé en base.*

**PHASE 4 — Adaptation applicative légère (1-2j)**
- [ ] L6 AuthProvider + requireUser élargis (charger `agence_id`/`societe_id` dans le contexte global d'auth). ⚠️ **Partie INSERTs déjà faite en L6-light (Phase 2-bis)** — L6 ne traite donc que ce qui n'a pas été couvert : enrichir le contexte d'auth pour exposer `agence_id`/`societe_id` partout, utiliser ce contexte au lieu de re-déduire l'agence à chaque INSERT (nettoyage de la dette technique laissée par L6-light qui peut faire des `SELECT FROM agences` ponctuels).
- [ ] L7 Navbar mono-agence (header BATILIS + nom agence depuis table).
- [ ] L10 Info agence dynamique (parametres + PDFs `route.js`/`restitution.js` dont fallback « Marine MICHELANGELI » l.39 + cron relances).
- *État sûr fin P4 : prêt pour test utilisateur (mono-agence).*

**PHASE 5 — Fix invitation (1-2j, BLOQUANT minimal)**
- [ ] L14a Fix #1 reconnexion : route `/auth/set-password` + `redirectTo` + `updateUser({password})`. Test : inviter, recevoir mail, définir mdp, déconnexion, reconnexion OK.
- *État sûr fin P5 : un nouvel utilisateur peut s'authentifier durablement. PRÊT POUR LE TEST.*

### 5.4 REPORTABLE POST-TEST (Phase 6)
- [ ] **Réactiver Messagerie + Statistiques** : code complet conservé à `3dbd6f1` (neutralisés en L11). À restaurer et adapter au multi-tenant (RLS agence sur messages, scope agence sur stats).
- [ ] L12 Storage cloisonné par agence + migration fichiers + policies versionnées (**dette sécu prioritaire, AVANT ouverture multi-franchise réelle**, D13).
- [ ] L14b Reste onboarding : flow création société + ajout 2e agence + sélecteur agence dans `/api/create-agente`. À la création d'une agence : **génération auto du `code`** depuis les 3 premières lettres de la ville en majuscules (ex. Martigues→`MAR`) ; en cas de collision avec une agence existante de la même société (contrainte `UNIQUE (societe_id, code)`), incrémenter `MA1`, `MA2`... Le code n'est PAS demandé au franchisé (transparent côté UX), sauf cas extrême où on lui ferait valider la suggestion en cas d'ambiguïté.
- [ ] L15 Navbar bi-zone + sélecteur multi-agences. Inclut la **notion de « vue active »** pour l'admin (onglet agence précise vs vue consolidée « toutes agences »). **Implémente le cas multi-agences de D18** : quand l'admin crée un dossier/client/artisan depuis la vue consolidée (pas d'agence active), afficher un **sélecteur d'agence obligatoire** ; depuis la vue d'une agence précise, l'agence active est utilisée automatiquement. (En mono-agence, ce cas ne se présentait pas — l'unique agence était déduite, cf. L6-light.)
- [ ] L16 Facturation scopée/consolidée multi-agences.
- [ ] L18 Bug ajout intervention · L19 Bug molette nombres · L20 Route `/clients/[id]/modifier` 404 · L21 DROP `factures_agente_backup_b7b`.
- [ ] Optim perf RLS (wrapping fait en L5 ; dénormalisation/claim JWT si besoin).
- [ ] #8 dashboard admin scope (à arbitrer selon scénario testeur).
- [ ] **Durcissements sécu « avant ouverture réelle »** (vérifiés en L17) : (a) activer leaked password protection (nécessite plan Supabase Pro) ; (b) durcir policy INSERT `notifications` (`WITH CHECK (true)` → restreindre, à faire en L5c) ; (c) captcha auth (optionnel, seulement si inscription publique un jour — pas le modèle actuel).

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
| — | **MT6 — dénormalisation `societe_id` sur racines** (amélioration de fond, AVANT L5b) | ⏳ prochaine action |
| — | L5b + L5c + L8 | ⏳ après |

**Prochaine action** : **MT6 — dénormalisation `societe_id` sur les racines** (`dossiers`, `clients`, `artisans`, `redevances`). Décidée en cours de L5a-3 : enjeu sécu n°1 du multi-SOCIÉTÉ à ~50 franchisés ; `societe_id` immuable → comparaison directe `societe_id = get_my_societe_id()` plus rapide + plus juste que le sous-SELECT `agence_id IN (SELECT...FROM agences...)`. Étapes : (1) audit colonnes (confirmer agence_id présent partout, état RLS courant) ; (2) ADD `societe_id` nullable + backfill (`agence_id → agences.societe_id`) + SET NOT NULL (pattern MT3) ; (3) **trigger de cohérence** dérivant `societe_id := agence.societe_id` à INSERT/UPDATE (indépendant du code) ; (4) **réécrire** les policies L5a-1/L5a-2/L5a-3 pour utiliser `societe_id = get_my_societe_id()` ; (5) re-test complet (login, cloisonnement admin/agente, finances, création). Filles NON concernées (restent en `EXISTS dossiers`, lookup PK rapide). Méthode : table par table, contrôle avant/après + rollback.

Puis : **lot code « masquer onglets Agence/CTP côté agente »** (bug CTP = affichage confirmé). Puis L5b (opérationnelles : rendez_vous, interventions_artisans, photos, comptes_rendus, chantier_documents, chantier_fiches_techniques — ⚠️ sujet **calendrier Google partagé entre agences** = fuite potentielle à creuser), L5c (transverses), L8 (référence chantier par agence).

**Note de méthode** : la découverte du blocage NOT NULL/INSERTs en fin de Phase 2 confirme la valeur du protocole « tester après chaque MT ». Si on avait enchaîné directement Phase 3 sans test post-MT3, on aurait découvert le bug en plein milieu des RLS (bien pire à diagnostiquer). Erreur de planification partagée (binôme), détectée à temps par la méthode. Idem MT5 : le blocage RLS lecture `agences` a été révélé par le test des 9 chemins, pas deviné.