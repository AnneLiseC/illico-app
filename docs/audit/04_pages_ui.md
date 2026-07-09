# Inventaire 04 — Pages & gating de rôle (collecte pure, code @ ref 91e0db1)

> **HEAD git courant : `48d1d92`** — code audité identique à la référence **`91e0db1`** de l'inventaire 01.
> Méthode : lecture des `app/**/page.js`, `app/layout.js`, `app/components/onboarding-guard.js`,
> `app/lib/auth-context.js`, `app/components/navbar.js`. Aucun document de pilotage consulté.
> 23 pages (hors `app/_design`). Description des guards TELS QU'ÉCRITS, sans jugement.

## Mécanisme de gating central

- **`app/layout.js`** enveloppe tout dans `<AuthProvider>` → `<OnboardingGuard>` → `<NavBar/>` + contenu.
- **`AuthProvider`** (`auth-context.js`) : écoute `supabase.auth.onAuthStateChange`, charge `profiles`
  (`fetchProfile`). Expose `{ user, profile, profileStatus ('loading'|'loaded'|'absent'), initialized, agences,
  agenceActive, ... }`. **Si `profile.actif === false` → `signOut()`** (déconnexion d'une session de compte
  désactivé). Le `role`, `societe_id`, `agence_id` viennent de `profiles`.
- **`OnboardingGuard`** : si `profileStatus === 'absent'` (connecté sans profil) et route non exemptée →
  `router.replace('/onboarding')`. Exemptes : `/onboarding`, `/login`, `/`, `/auth/*`, `/espace-client*`.
  Si `profileStatus === 'loaded'` et sur `/onboarding` → redirige vers `/espace-client` (client) ou `/dashboard`.
- **Guard par page** : chaque page (client component) refait en général `if (!user) router.push('/login')`.
  Le blocage fin par rôle est **variable** : certaines pages redirigent explicitement (parametres, profil,
  dashboard, espace-client), d'autres s'appuient sur la **RLS + filtres de requête** (un client qui forcerait
  l'URL d'une page staff voit des données vides, la navbar ne s'affiche pas pour lui).

## Entrées de navigation (`navbar.js`)

Navbar **masquée** sur `/`, `/login`, `/login-client`, `/espace-client*` (donc invisible pour un client).
Rendue seulement si `profile` présent.

| groupe | entrée | href | condition de rôle |
|---|---|---|---|
| Activité | Tableau de bord | `/dashboard` | tout staff |
| Activité | Chantiers | `/chantiers` | tout staff |
| Contacts | Clients | `/clients` | tout staff |
| Contacts | Artisans | `/artisans` | tout staff |
| Pilotage | Planning | `/planning` | tout staff |
| Pilotage | Finances | `/finances` | tout staff |
| Pilotage | Messagerie | `/messagerie` | tout staff (badge = messages client non lus) |
| Pilotage | Statistiques | `/statistiques` | tout staff |
| Système | Mon profil | `/profil` | **`agenteOnly`** |
| Système | Paramètres | `/parametres` | **`adminOnly`** |
| (bi-zone) | sélecteur Agences | — | admin avec **≥2 agences** |

> Non présentes dans la navbar : `/notifications` (liée depuis `app-header.js` — cloche), `/espace-client`
> (accueil client), `/login`, `/login-client`, `/onboarding`, `/auth/set-password`, `/profil` invisible pour admin/client, `/parametres` invisible pour agente/client.

---

## Pages STAFF (admin / agente)

| route | qui accède (guard cité) | actions notables & gating | API / RPC appelées | atteignabilité |
|---|---|---|---|---|
| `/dashboard` | `!user→/login` ; **`role==='client'→/espace-client`** | tableau de bord staff | — | navbar |
| `/chantiers` | `!user→/login` | `agente` : `query.eq('referente_id', profile.id)` ; `admin` : société (RLS) ; `isAdmin` flag | — | navbar |
| `/chantiers/nouveau` | `!user→/login` | création dossier | — | bouton depuis /chantiers, /clients |
| `/chantiers/[id]` | `!user→/login` | **convertir AMO⇄courtage + supprimer chantier = tout staff ayant accès** (gate = `typologie`, PAS `role`) ; messages `auteur_role = admin/agente` ; `isAdmin` sert au libellé | `/api/cr`, `/api/invite-client`, `/api/pdf`, `/api/google/calendar/{event,push}` ; RPC `convertir_dossier_en_amo`, `convertir_dossier_en_courtage`, `suivi_toggle_honoraires`, `suivi_courtage_ts_upsert` | lien depuis /chantiers |
| `/clients` | `!user→/login` | `agente` : `query.eq('referente', profile.id)` ; onglet « moi » = référent admin ; `isAdmin` | — | navbar |
| `/clients/nouveau` | `!user→/login` | `agente` s'auto-assigne ; `admin` choisit référent + agence (si ≥2) | — | bouton /clients |
| `/clients/[id]` | `!user→/login` | `admin` peut **réassigner le référent** (select role admin) | — | lien /clients |
| `/artisans` | `!user→/login` | liste artisans | — | navbar |
| `/artisans/nouveau` | `!user→/login` | création artisan | — | bouton /artisans |
| `/artisans/[id]` | `!user→/login` | **liste des devis visible si `role==='admin'`** | — | lien /artisans |
| `/planning` | `!user→/login` | `admin` + `agenceActive===null` : sélecteurs d'agence / cibles multi-agence ; agents visibles admin | `/api/auth/google`, `/api/google/calendar/{event,push}` | navbar |
| `/finances` | `!user→/login` | `agente` : `scope='moi'` verrouillé ; `admin` : choisit agente/agence, KPIs société | — | navbar |
| `/messagerie` | `!user→/login` | fil messages client↔staff ; `auteur_role = admin/agente` | — | navbar |
| `/notifications` | `!user→/login` | liste notifications ; `markAllRead` | — | **hors navbar** (cloche app-header) |
| `/profil` | `!user→/login` ; **`role==='client'→/espace-client`** | contenu **`role==='agente'`** (agence, historique redevance) ; bloc masqué si `role==='admin'` | — | navbar (**agenteOnly**) |
| `/parametres` | `!authProfile→/login` ; **`role!=='admin'→/dashboard`** (ADMIN ONLY explicite) | créer agence/agente, objectifs CA, désactiver agente | `/api/create-agence`, `/api/create-agente`, `/api/agente-statut`, `/api/update-agence`, `/api/cr` ; composant `MesCalendriers` → `/api/auth/google`, `/api/calendar/*` | navbar (**adminOnly**) |
| `/statistiques` | **AUCUN guard** (pas de `useAuth`) | **placeholder « Bientôt disponible »** — module neutralisé (lot L11), aucune donnée, aucune requête | — | navbar |

## Pages CLIENT (`role='client'`)

| route | qui accède (guard cité) | notes | API / RPC | atteignabilité |
|---|---|---|---|---|
| `/espace-client` | `!user→/login` ; **`role!=='client' \|\| !client_id → redirect`** ; **`acces_actif===false`** → écran désactivé | accueil client : dossiers via `mes_dossiers_client()` (RLS), messages, docs, RDV | `/api/pdf` ; RPC `mon_expiration_client` | redirect post-login (client) ; exempté OnboardingGuard |
| `/login-client` | redirige si déjà authentifié (`redirectByRole`) | connexion client (magic link / recovery) | — | URL directe (hors navbar) |

## Pages PUBLIQUES / AUTH

| route | comportement |
|---|---|
| `/` (racine) | **server** `redirect('/login')` |
| `/login` | connexion staff ; si déjà authentifié → `redirectByRole` (client→/espace-client, sinon /dashboard) |
| `/auth/set-password` | définition du mot de passe après invitation ; après succès → `/espace-client` (client) ou `/dashboard` |
| `/onboarding` | `profileStatus==='absent'` → formulaire création société (admin invité) ; `'loaded'` → redirige ; exempté OnboardingGuard (anti-boucle) |

---

## Séparation client / staff (résumé)

- **Un client** (`role='client'`) : n'a **pas** de navbar (masquée sur `/espace-client*`) ; `/dashboard` et
  `/profil` le renvoient vers `/espace-client` ; `/espace-client` exige `role==='client'`. Son périmètre de
  données est la RLS (`mes_dossiers_client()`, `clients_client_read`, `photos_client_read`, `messages_client_*`).
- **Le staff** (`admin`/`agente`) : navbar complète ; distinctions fines : `/parametres` admin-only (redirect
  explicite), `/profil` agente-only (navbar), édition référent / réassignation admin, liste devis artisan
  admin-only, scope finances agente verrouillé sur soi.
- **Zones où le gating repose sur la RLS plutôt qu'un redirect explicite** : la plupart des pages staff ne
  bloquent que `!user`. Un `client` qui forcerait l'URL `/chantiers`, `/clients`, `/finances`, `/planning`…
  passerait le guard `!user` mais obtiendrait des données vides (RLS staff-scope) et sans navbar.
  `/statistiques` n'a aucun guard mais ne rend qu'un placeholder statique.

---

## MÉTA — ce que cette méthode ne voit PAS

1. **Rendu réel / exécution** : les guards sont lus, pas exercés. Un flash de contenu avant redirection,
   une race `initialized/profileStatus`, un cas limite de redirection ne sont pas prouvés par lecture.
2. **RLS = seconde barrière invisible ici** : ce fichier décrit le gating **UI** ; la vraie protection des
   données est la RLS (inventaire 02). Une page « accessible » peut ne rien afficher grâce à la RLS.
3. **Conditions d'affichage profondes** : de nombreux boutons/sections ont des conditions imbriquées
   (`agenceActive`, `typologie`, statut dossier) non toutes reproduites ; seules les gates de rôle notables
   le sont.
4. **Composants partagés** : la logique dans `app/components/*` (navbar, MesCalendriers, app-header, modales)
   n'est décrite que par ses points d'usage.
5. **Liens dynamiques** : l'atteignabilité est établie par grep de `href`/`router.push` statiques ; un lien
   construit dynamiquement pourrait échapper au grep (« hors navbar » ≠ « inatteignable »).
6. **État `91e0db1`** : une page ajoutée/modifiée sur une branche non mergée n'est pas ici.

*Fin de l'inventaire 04. Collecte brute du gating UI, sans confrontation documentaire.*
