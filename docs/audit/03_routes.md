# Inventaire 03 — Routes API (collecte pure, code @ ref 91e0db1)

> **HEAD git courant : `48d1d92`** — code audité identique à la référence **`91e0db1`** de l'inventaire 01
> (tip = 91e0db1 + commits docs/audit uniquement). Vérifié : `git diff 91e0db1..HEAD` hors `docs/audit` = vide.
> Méthode : lecture du code `app/api/**/route.js`. Aucun document de pilotage consulté.
> 18 fichiers de route. Description de ce que le code FAIT, sans jugement.

## Helpers d'authentification (`app/lib/api-auth.js`)

- **`requireUser(request)`** : extrait le JWT `Authorization: Bearer <token>`, le valide via
  `supabaseAdmin.auth.getUser(token)` (client **service_role**), charge `profiles`
  (`id, role, client_id, prenom, nom, email, agence_id, societe_id`). Retourne `{user, profile}` ou `{error}` (401/403).
- **`requireRole(request, roles)`** : `requireUser` + vérifie `profile.role ∈ roles` (sinon 403).
- Le **tenant** (`societe_id`/`agence_id`) provient TOUJOURS de `profile` (chargé depuis la base via l'id du JWT),
  jamais du body.

## Tableau de synthèse

| route | méthodes | client Supabase | auth | scoping tenant | externes | front |
|---|---|---|---|---|---|---|
| `admin/invite-franchise` | POST | service_role | secret `Bearer ADMIN_INVITE_SECRET` | — (crée société admin) | Supabase `auth.admin.inviteUserByEmail` | non (manuel) |
| `agente-statut` | POST | service_role | `requireRole(['admin'])` | cible.societe_id == admin.societe_id (JWT) | `auth.admin.updateUserById` (ban) | parametres |
| `auth/google` | POST | — (aucun) | `requireRole(['admin','agente'])` | state HMAC = user.id (JWT) | Google OAuth (URL) | MesCalendriers, planning |
| `auth/google/callback` | GET | service_role | **HMAC state** (pas de requireUser) | user_id issu du state signé | Google OAuth (getToken) | non (redirect) |
| `calendar/account/disconnect` | POST | anon + JWT appelant (**RLS**) | `requireUser` | RLS `comptes_oauth_own` | — | MesCalendriers |
| `calendar/icloud/connect` | POST | anon + JWT (**RLS**) | `requireUser` | RLS `comptes_oauth_own` (user_id=auth.uid) | CalDAV (tsdav) valid. | MesCalendriers |
| `calendar/list` | GET | anon + JWT (**RLS**) | `requireUser` | RLS `comptes_oauth_own` | Google API / CalDAV (list) | MesCalendriers |
| `cr` | POST | service_role | `requireRole(['admin','agente'])` | dossier: admin=société / agente=agence | **Claude API** (api.anthropic.com) | chantiers/[id], parametres |
| `create-agence` | POST | service_role | `requireRole(['admin'])` | societe_id du JWT (jamais body) | — | parametres |
| `create-agente` | POST, PATCH | service_role | `requireRole(['admin'])` | societe_id JWT ; agence_id validé | `auth.admin.inviteUserByEmail` | parametres |
| `cron/relances` | GET | service_role | `Bearer CRON_SECRET` | — (scan global) | email (STUBBÉ/désactivé) | non (Vercel cron) |
| `google/calendar/event` | DELETE | anon + JWT (**RLS**) | `requireUser` | RLS + tokens de la cible | Google API (delete event) | chantiers/[id], planning |
| `google/calendar/push` | POST | anon+JWT (**RLS**) **+ service_role** | `requireUser` | RLS lecture ; service_role lit tokens cible | Google API (push) | chantiers/[id], planning |
| `google/calendar/sync` | POST, GET | service_role | `requireUser` | `.eq('user_id', userId)` (JWT) | Google OAuth refresh + sync | **non trouvé** (orphelin ?) |
| `invite-client` | POST | service_role | `requireRole(['admin','agente'])` | dossier: admin=société / agente=referente | `auth.admin.generateLink` (SANS email) | chantiers/[id] |
| `onboarding/create-societe` | POST | service_role | JWT léger (`getUser`, sans profil) | p_user_id du JWT (jamais body) | RPC `onboarding_create_societe` | onboarding |
| `pdf` | POST | service_role | `requireUser` (client/admin/agente) | dossier: client=client_id / admin=société / agente=agence ; crId+devisId re-vérifiés | `ical` (lib) + rendu PDF | chantiers/[id], espace-client |
| `update-agence` | PATCH | service_role | `requireRole(['admin'])` | agence.societe_id == admin.societe_id | — | parametres |

---

## Détail par route

### `admin/invite-franchise` — POST
- **Client** : service_role. **Auth** : `authorization === "Bearer ${ADMIN_INVITE_SECRET}"` (pas d'utilisateur ; barrière secret, pattern CRON_SECRET). **Body** : `email`, `invited_by`.
- Valide domaine `@illico-travaux.com` (`isAllowedStaffEmail`), anti-doublon (`admin_invitations` en_attente/consommee + `profiles` admin même email), `auth.admin.inviteUserByEmail` (crée `auth.users` + email d'invitation Supabase), insert `admin_invitations` (TTL 7j), rollback `deleteUser` si insert échoue.
- **Scoping** : sans objet (route d'amorçage tenant). **Front** : non (appelée manuellement, secret).

### `agente-statut` — POST
- service_role. `requireRole(['admin'])`. **Body** : `id`, `actif` (bool).
- **Contrôle** : cible `profiles.societe_id === admin.societe_id` (404 uniforme) ET `role==='agente'`. Puis `auth.admin.updateUserById` (ban `876000h` / `none`) + `profiles.actif`. **Front** : parametres.

### `auth/google` — POST
- Aucun client Supabase. `requireRole(['admin','agente'])`. **Body** : aucun.
- Construit un `state` **HMAC-SHA256** (`GOOGLE_OAUTH_STATE_SECRET`) encodant `user.id`, renvoie l'URL OAuth Google (`scope calendar`). **Front** : MesCalendriers, planning.

### `auth/google/callback` — GET
- service_role. **Auth = vérification HMAC du `state`** (pas de `requireUser` : l'appelant est le redirect Google). **Params** : `code`, `state`, `error`.
- `verifySignedState(state)` → `userId` ; échange `code`→tokens (`getToken`) ; upsert `comptes_oauth` (`user_id` du state). **Front** : non (cible de redirection OAuth).

### `calendar/account/disconnect` — POST
- **anon + JWT appelant** (RLS active). `requireUser`. **Body** : `compte_oauth_id`.
- Supprime la ligne `comptes_oauth` via le client user → RLS `comptes_oauth_own` garantit qu'il s'agit d'un compte du user. `cibles_calendrier.compte_oauth_id` = ON DELETE SET NULL. **Front** : MesCalendriers.

### `calendar/icloud/connect` — POST
- anon + JWT (RLS). `requireUser`. **Body** : `appleId`, `appPassword`.
- Valide via **CalDAV** (tsdav) ; upsert `comptes_oauth` (`user_id=auth.uid`, `caldav_password` chiffré via `encrypt`), `onConflict (user_id, fournisseur)`. **Front** : MesCalendriers.

### `calendar/list` — GET
- anon + JWT (RLS). `requireUser`. **Params** : `compte_oauth_id`.
- Lecture `comptes_oauth` (RLS `comptes_oauth_own` → seuls les comptes du user) ; liste les agendas via **Google API** ou **CalDAV** selon `fournisseur`. **Front** : MesCalendriers.

### `cr` — POST
- service_role. `requireRole(['admin','agente'])`. **Body** : `dossierId`, `typeVisite`, `dateVisite`, `intervenants`, `notesBrutes`, `imagesBase64`, `docsPaths`.
- **Contrôle** : dossier admin=société / agente=agence (404 uniforme). Charge photos (dossier + préfixe Storage `chantiers/{id}/`). Appelle **Claude API** (`https://api.anthropic.com/v1/messages`, `ANTHROPIC_API_KEY`) pour générer le CR. **Front** : chantiers/[id], parametres.

### `create-agence` — POST
- service_role. `requireRole(['admin'])`. **Body** : `nom, ville, adresse, code_postal, telephone, email, responsable_nom`.
- Insert `agences` avec `societe_id = auth.profile.societe_id` (**jamais du body**) ; `code` généré par trigger. **Front** : parametres.

### `create-agente` — POST / PATCH
- service_role. `requireRole(['admin'])`.
- **POST** body : `prenom, nom, email, telephone, redevance_debut, redevance_mensuelle_ht, part_agente_defaut, frais_part_agente_defaut, parts_agente_disponibles, objectif, agence_id`. Valide domaine staff ; `agence_id` (si fourni) validé `eq('societe_id', JWT)` sinon déduit l'unique agence ; `inviteUserByEmail` + insert `profiles` (societe_id du JWT, agence_id résolu) + insert `objectifs_ca` (non bloquant) ; rollback `deleteUser`.
- **PATCH** body : `id` + champs (whitelist explicite). Contrôle cible `societe_id === admin.societe_id` (404). **Hard delete RETIRÉ** (remplacé par agente-statut). **Front** : parametres.

### `cron/relances` — GET
- service_role. **Auth** : `Bearer CRON_SECRET` (`process.env.CRON_SECRET`). Déclencheur **Vercel Cron** (vercel.json, 08h UTC). **Scan global** (7 automatisations de relance). **Envoi mail actuellement STUBBÉ** (`sendEmail` = no-op, TODO HEXAOM). **Front** : non.

### `google/calendar/event` — DELETE
- anon + JWT (RLS) + lib `app/lib/calendar/google.js`. `requireUser`. **Body** : identifiants d'événement/cible.
- Supprime l'événement Google via les tokens de la **cible** (bascule cibles, lot 5c). **Front** : chantiers/[id], planning.

### `google/calendar/push` — POST
- **Deux clients** : anon+JWT (lecture RLS) **et service_role** (`supabaseAdmin`, pour lire les tokens `comptes_oauth` du **détenteur de la cible**, potentiellement un autre user de l'agence). `requireUser`. **Body** : ids RDV/interventions.
- Pousse vers le calendrier de la cible (`cible_id`→`compte_oauth_id`) avec les tokens du détenteur ; skip si compte OAuth absent/sans refresh_token. **Front** : chantiers/[id], planning.

### `google/calendar/sync` — POST / GET
- service_role. `requireUser`. Scoping explicite `.eq('user_id', userId).eq('fournisseur','google')`. Refresh du token OAuth (setCredentials + persistance du nouvel access_token) puis synchro. **Front** : **non trouvé** par grep dans `app/**` (hors api) — possible route orpheline, ou déclenchée hors page (lib/manuel). À vérifier.

### `invite-client` — POST
- service_role. `requireRole(['admin','agente'])`. **Body** : `dossierId`.
- **Contrôle** : dossier admin=société / agente=`referente_id===user.id` (404). Lit le client du dossier ; idempotence via `profiles` (client_id+role='client') ; `generateLink` type `invite` (nouveau) ou `recovery` (existant, + réactive `acces_actif`) — **n'envoie PAS l'email**, renvoie `action_link` au front. Insert `profiles` client (societe_id/agence_id du dossier) + rollback. **Front** : chantiers/[id].

### `onboarding/create-societe` — POST
- service_role. **Auth JWT légère** : `getUser(token)` sans exiger de profil (le user en onboarding n'en a pas). **Body** : `nom_societe, siret, rcs, agence_nom, agence_ville, agence_adresse, agence_cp, agence_tel, nom, prenom, telephone`.
- `p_user_id = userData.user.id` (**du JWT, pas du body**) ; délègue à la RPC `onboarding_create_societe` (création atomique société + agence + profil admin + consommation invitation) ; traduit `INVITATION_INVALIDE / PROFIL_EXISTANT / USER_INTROUVABLE`. **Front** : onboarding.

### `pdf` — POST
- service_role. `requireUser` (accepte **client, admin, agente**). **Body** : `dossierId, type, crId, devisId`.
- **Contrôle par rôle** : `client` → `dossier.client_id === profile.client_id` (403) ; `admin` → société ; `agente` → agence (404 uniforme). `crId` re-vérifié `crData.dossier_id === dossierId` ; `devisId` re-vérifié dans le dossier. Types : `recapitulatif_prev` (Recap_Financier), `recapitulatif` (Suivi_Financier), `dossier_suivi` (DossierSuivi), `cr`, `devis`. Charge suivi_financier/factures/photos/etc. en service_role. **Front** : chantiers/[id], espace-client.

### `update-agence` — PATCH
- service_role. `requireRole(['admin'])`. **Body** : `agence_id` + `nom, ville, adresse, code_postal, telephone, email, responsable_nom`.
- **Contrôle** : `agence.societe_id === admin.societe_id` (404). Whitelist STRICTE (jamais `code`, `societe_id`, `id`, `created_at`, pas de spread body). **Front** : parametres.

---

## Routes cron / déclenchées par secret (récap)

| route | déclencheur | secret |
|---|---|---|
| `cron/relances` (GET) | Vercel Cron (vercel.json, ~08h UTC) | `CRON_SECRET` (Bearer) |
| `admin/invite-franchise` (POST) | appel manuel (hors app) | `ADMIN_INVITE_SECRET` (Bearer) |
| `auth/google/callback` (GET) | redirection OAuth Google | signature **HMAC** du `state` (`GOOGLE_OAUTH_STATE_SECRET`) |

## Observation transverse sur le scoping

Sur les **10 routes service_role** consommant un id du body (`dossierId`, `agence_id`, `id` cible, `crId`, `devisId`) :
**aucune ne fait confiance à cet id sans contrôle d'appartenance**. Le tenant (`societe_id`/`agence_id`) est
toujours pris sur le JWT (`auth.profile`), et l'id du body est systématiquement validé contre le tenant de
l'appelant (souvent avec un 404 uniforme pour ne pas divulguer l'existence cross-tenant). Le cas
« id du body + service_role sans contrôle » n'a **pas** été rencontré dans cette collecte.

---

## MÉTA — ce que cette méthode ne voit PAS

1. **Comportement à l'exécution** : les contrôles sont lus dans le code, pas exercés ; une faille logique
   subtile (ex. condition inversée dans un cas limite) n'est pas prouvée par simple lecture.
2. **Middleware / config** : `middleware.js`, `vercel.json` (crons, headers), variables d'environnement réelles,
   et la configuration CORS/edge ne sont pas inventoriés ici (hors périmètre route.js).
3. **Appelants hors `app/**`** : un appel depuis un script, un service externe, un webhook ou un test n'est pas
   capté par le grep front ; « non trouvé » ≠ « jamais appelée ».
4. **Chaîne des libs** : la logique déléguée à `app/lib/calendar/*`, `app/lib/email*`, `app/lib/pdf/*` n'est
   décrite que par son point d'appel, pas dérobée en profondeur.
5. **Secrets/env** : la présence et la valeur réelle des secrets (`*_SECRET`, `*_API_KEY`, service_role) ne sont
   pas vérifiées ; on constate seulement leur usage dans le code.
6. **Versions/branches** : décrit l'état `91e0db1` ; une route ajoutée/modifiée sur une branche non mergée n'est pas ici.

*Fin de l'inventaire 03. Collecte brute du code des routes, sans confrontation documentaire.*
