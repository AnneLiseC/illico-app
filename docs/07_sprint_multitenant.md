# 07 — SPRINT MULTI-TENANT BATILIS

> Boussole du sprint. Lue par Claude (binôme) et Claude Code à chaque session.
> Créé le 28/05/2026. Statut : **AUDITS EN COURS** (audit 1 ✅, audit 2 ✅, audit 3 à faire).

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
- **Tables racines portent `agence_id` en propre** : `dossiers`, `clients`, `artisans`, `profiles`.
- **`agences.societe_id`** (l'agence appartient à une société).
- **Tables filles héritent l'agence par JOIN** (pas de dénormalisation) :
  - via `dossier_id` → `dossiers.agence_id` : `devis_artisans`, `factures_artisans`, `photos`, `rendez_vous`, `comptes_rendus`, `suivi_financier`, `interventions_artisans`, `chantier_documents`, `chantier_fiches_techniques`, `messages`.
  - via `agente_id` → `profiles.agence_id` : `factures_agente`, `redevances`, `objectifs_ca`.
  - via `artisan_id` → `artisans.agence_id` : `fiches_techniques`, `artisans_specialites` (à confirmer audit 3).
  - via `user_id` → `profiles.agence_id` : `notifications`, `google_tokens`.

### 1.5 Branding — distinction clé
- **PRODUIT = BATILIS** : navbar, login, titre, métadonnées → BATILIS partout.
- **Contenu COMMUN réseau illiCO** (semi-fixe, NON configurable) :
  - Slogan « Quand vous pensez travaux, pensez illiCO ! » (identique toutes agences).
  - Marque « illiCO travaux » dans PDF/emails clients, header espace-client, « Équipe illiCO ».
- **Coordonnées DYNAMIQUES par agence** (table `agences`, fin du hardcode CLAUDE.md §3) :
  - nom agence, nom responsable (ex « Marine MICHELANGELI »), email, logo, raison sociale société, SIRET, ville.
  - Les valeurs actuelles de Marine deviennent la config de SON agence.
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

Mécanisme : réutilise `inviteUserByEmail` (déjà en place pour les agentes), étendu pour créer une société. Résout en même temps le fix #1 (page set-password). Un seul flow d'invitation, réutilisé pour franchisé ET agentes.

### 1.10 Référence de chantier — séquence par agence
Aujourd'hui : référence générée séquentiellement AU GLOBAL sur l'année (`chantiers/nouveau/page.js:56-74`, format `AAAA-CT-NNN`). En multi-agences, deux agences génèreraient des numéros qui se télescopent. → La séquence doit devenir **par agence** (probablement avec préfixe d'agence). Changement fonctionnel réel.

### 1.11 Storage (fichiers) — cloisonnement
Fichiers rangés `chantiers/{dossier_id}/...` dans buckets `documents` et `photos`. Policies Storage NON versionnées (dette).
- À trancher (audit 3) : préfixer par agence (`{agence_id}/chantiers/...`) ou `dossier_id` suffit-il ?
- **CRITIQUE** : les policies Storage doivent cloisonner par agence. Sinon une agente accède aux fichiers d'une autre agence par URL directe, même avec RLS tables correcte. La sécurité données ne vaut rien si les fichiers fuient.

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

### 3.1 Tables réelles : 23 (confirmé `information_schema`)
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
- D13. Storage cloisonné par agence (policies à versionner) — sécurité critique.

---

## 5. TÂCHES PRIORISÉES — À COMPLÉTER APRÈS AUDIT 3

> L'audit 3 (ampleur/chiffrage) remplira le détail. Structure provisoire ci-dessous.

### 🔴 BLOQUANT TEST (incompressible)
- [ ] Tables `societes` + `agences` (avec `societe_id`).
- [ ] `agence_id`/`societe_id` sur `profiles` + `agence_id` sur racines (dossiers, clients, artisans).
- [ ] Migration données existantes → société CTP + agence Martigues (rattacher tout).
- [ ] Refonte RLS double cloisonnement (admin société / agent agence) — TOUTES tables, pattern unifié.
- [ ] **Storage : policies cloisonnées par agence** (sécurité critique — fichiers ne doivent pas fuir par URL directe). Versionner les policies.
- [ ] Fix #1 reconnexion après invitation (route set-password) — prérequis onboarding.
- [ ] Fix #2 création chantier sans client.
- [ ] Cloisonnement P0-9-bis (7 tables opérationnelles) intégré à la refonte RLS.
- [ ] **Référence chantier séquentielle PAR AGENCE** (sinon télescopage des numéros entre agences).
- [ ] **Onboarding** (cf. 1.9 — décision verrouillée) : flow d'invitation nommé par email + validation `@illico-travaux.com` (PAS de page d'inscription publique). Via le lien : création société + 1ère agence + mot de passe. Puis dans Paramètres : ajout d'autres agences + ajout agentes avec sélecteur d'agence. Adapter `/api/create-agente` (notion d'agence) + étendre `inviteUserByEmail` pour créer une société.
- [ ] Rebranding BATILIS (~50 occurrences / 17 fichiers). Gros des occurrences client = `api/pdf/restitution.js` (13) + `api/pdf/route.js` (10) — y inclure le fallback « Marine MICHELANGELI » en dur (`restitution.js:39`) → dynamique via agence. NE PAS toucher : clés base (`statut_illico`, `date_reglement_illico`, `acomptes_illico`) + tags Google Calendar (`[illico-int:]`, `[illico-rdv:]`).
- [ ] Neutralisation propre CR / Messages / Statistiques.
- [ ] Durcir `get_my_role()` (retirer anon/public) + futures fonctions tenant. ⚠️ le trigger `redevances_montant_protege` dépend de `get_my_role()` (dépendance plpgsql invisible — cf. piège DROP montant_ttc). Vérifier avant tout changement.

### 🔴/🟠 À ARBITRER
- [ ] **#8 dashboard admin ne voit que ses propres dossiers** : si le testeur a des agents → 🔴 (mauvaise 1ère impression au login). S'il teste seul d'abord → 🟠. **À décider selon le scénario du test.**

### 🟠 IMPORTANT (impression / robustesse)
- [ ] **Durcissements sécurité annexes** (avant ouverture externe) : `notifications` INSERT `WITH CHECK (true)` à resserrer ; bucket Storage `photos` sans policy UPDATE (même bug que `factures_agente` corrigé récemment) ; protection « mots de passe compromis » désactivée dans Supabase Auth.
- [ ] Bug ajout intervention (signalé, dans Doc 5).
- [ ] Bug molette sur quasi toutes les entrées de nombres (décision archi : composant `NumberInput` / hook global / fix local).
- [ ] Infos agence en dur → table agences (#16, #29).
- [ ] Route `/clients/[id]/modifier` 404 (#5).

### 🟢 PEUT ATTENDRE (post-test)
- [ ] Barres de progression grises (alimenter `avancement`).
- [ ] Bug statut devis refusé → « à modifier ».
- [ ] Optim perf RLS (dénormalisation ou claim JWT).
- [ ] Vue agente du suivi financier, KPI « Net à virer », colonne « Marine » en dur, détails facturation par chantier/apporteur.
- [ ] Renommage `isMarine`/`estChantierMarine`. Formulaire devis inline mort. Audit `lib/finance.js`.
- [ ] Sujet CR-PDF (table sans colonne PDF, code `l.1334` latent).
- [ ] Drop `factures_agente_backup_b7b`. Source unique libellé suppression chantier.

---

## 6. AVANCEMENT

| Date | Étape | Statut |
|---|---|---|
| 28/05 | Cadrage modèle cible | ✅ verrouillé |
| 28/05 | Audit 1 (fonctionnel) | ✅ |
| 28/05 | Audit 2 (données & sécurité) | ✅ vérifié en base |
| — | Audit 3 (ampleur/chiffrage) | ⏳ à faire |
| — | Plan séquencé + exécution | ⏳ |

**Prochaine action** : lancer l'audit 3 (recensement exhaustif des changements + chiffrage + plan de séquençage sans casser la prod ni ouvrir de faille temporaire).