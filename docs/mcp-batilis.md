# Connecteur MCP « BATILIS » (lecture seule) — claude.ai

> Créé le 26/10/2026. Statut : **code livré, NON activé**. Voir l'ordre d'activation (§5).
> Fichier vivant : toute évolution du connecteur se reporte ici.

Le connecteur permet à Claude (claude.ai, connecteur personnalisé) de **lire** les dossiers
BATILIS de la personne connectée — et uniquement les siens — pour l'aider à les gérer.
Il n'écrit rien. Chaque lecture passe par la RLS existante, avec le jeton de la personne.

---

## 1. Architecture

```
claude.ai ──(1) POST /api/mcp sans jeton──────────────▶ 401 + WWW-Authenticate (resource_metadata)
          ──(2) GET /.well-known/oauth-protected-resource/api/mcp ─▶ authorization_servers = Supabase /auth/v1
          ──(3) OAuth 2.1 + PKCE ─▶ Supabase Auth (serveur OAuth, BETA)
                                       └─▶ /oauth/consent (page BATILIS) : Autoriser / Refuser
          ──(4) POST /api/mcp + jeton OAuth ─▶ auth.js : client_id = MCP_OAUTH_CLIENT_ID ?
                                                         getUser(jeton) ? rôle admin|agente ? actif ?
                                               └─▶ client Supabase (clé PUBLIQUE + jeton) ─▶ PostgREST ─▶ RLS
```

| Fichier | Rôle |
|---|---|
| `app/api/mcp/route.js` | Serveur MCP. Streamable HTTP **sans état**, réponses JSON, POST seul (GET/DELETE → 405). |
| `app/lib/mcp/auth.js` | Validation du jeton, filtre rôle + profil actif, client Supabase au jeton de l'utilisatrice. |
| `app/lib/mcp/serveur.js` | Déclaration des 9 outils (schémas zod, annotation `readOnlyHint`). |
| `app/lib/mcp/outils.js` | Lectures et mise en forme. Aucun calcul : `finance.js`, `calcStatut`, `formatNomClient`, `libelleStatut`. |
| `app/lib/mcp/metadonnees.js` + `app/.well-known/oauth-protected-resource/**/route.js` | Métadonnées RFC 9728 (racine + chemin `/api/mcp`). |
| `app/oauth/consent/page.js` | Page de consentement (Autoriser / Refuser). |
| `app/lib/oauth-consentement.js` | Rôles autorisés, chemin de consentement, filtre du `?next=` de `/login`. |
| `app/lib/jeton-oauth.js` | Reconnaît un jeton OAuth (claim `client_id`) — refusé sur toutes les routes `/api/*`. |
| `docs/sql/mcp_lecture_seule_oauth.sql` | Politiques RESTRICTIVES : aucune écriture avec un jeton OAuth (public + Storage). |

Choix techniques :
- **SDK officiel** `@modelcontextprotocol/sdk` 1.32.2 (épinglé), `WebStandardStreamableHTTPServerTransport`,
  mode sans état (un serveur + un transport par requête). Pas `mcp-handler` : sa v2 vise la spec
  2026-07-28 alors que claude.ai annonce jusqu'à 2025-11-25 ; produit « Labs ».
- **Validation du jeton** : `auth.getUser(jeton)` (fonctionne avec clés JWT HS256 ou asymétriques,
  et vérifie que la session n'est pas révoquée), puis contrôle du claim `client_id`.
- **Scope demandé** : `email` uniquement (`openid` exige des clés JWT asymétriques).

---

## 2. Outils

Tous en lecture seule. JSON compact, clés en français, montants en euros avec HT et TTC explicites.
Un dossier hors périmètre renvoie **exactement** le même message qu'un dossier inexistant :
« Dossier introuvable. ». Les références ne sont uniques que **par agence** : si plusieurs dossiers
visibles portent la même référence, l'outil liste les codes agence et demande le paramètre `agence`.

| Outil | Paramètres | Renvoie | Exclu volontairement |
|---|---|---|---|
| `mes_dossiers` | `statut?`, `typologie?`, `inclure_archives=false`, `recherche?` | référence, agence, client, typologie, statut calculé, adresse, dates clés (200 max) | coordonnées client, taux |
| `lire_dossier` | `reference`, `agence?`, `avec_coordonnees=false` | fiche, référente, client, contrat, frais, taux (fraction), dates | email/téléphone sauf demande, `part_agente`, ids Google, `contrat_url` |
| `devis_du_dossier` | `reference`, `agence?` | entreprise, n°, statut, HT/TTC, acompte, dates, `hors_honoraires` | chemins PDF, commission artisan, cache IA |
| `finances_du_dossier` | `reference`, `agence?` | échéances + synthèse `calculateDossierFinance` (courtage, solde AMO, prévisionnel, frais, hors honoraires) | royalties, parts agente/admin, gains, apporteur (dont échéances `apporteur_agente`), `statut_ctp` |
| `rendez_vous` | `reference?`, `du`, `au` (défaut : aujourd'hui → +30 j, 92 j max) | titre, type, début (heure de Paris), durée, adresse, dossier, client, artisans conviés | ids Google, agenda cible |
| `comptes_rendus` | `reference`, `agence?`, `nombre=1` (5 max) | rapports de visite **validés**, dernière version, texte final | notes brutes, texte IA, photos |
| `interventions` | `reference`, `agence?` | interventions artisans + lots (dates, avancement) | ids Google |
| `actions_ouvertes` | `reference?`, `agence?` | actions non archivées, statut ∉ {clôturé, quitus transmis, acté} | journal |
| `attestations_artisans` | `reference`, `agence?` | décennale + qualification : expiration, alerte (expirée / expire sous 30 j / absente), dernier document | RIB, Kbis, chemins de fichiers |

**Finances — lecture des chiffres.** `courtage` et `solde_amo` sont deux composantes calculées par
`finance.js`. À l'écran du dossier : honoraires courtage = `courtage.ttc` ; honoraires AMO =
`courtage.ttc + solde_amo.ttc` (la somme est faite à l'écran, l'outil ne la recalcule pas).
Le HT des travaux signés n'est pas exposé par `finance.js` : l'outil ne le renvoie pas (pas de
recalcul hors `finance.js`).

---

## 3. Sécurité — les couches

1. **Lecture seule par construction** : aucun outil n'appelle `insert`, `update`, `upsert`, `delete`,
   `rpc` ni Storage (vérifié par test sur tout le code MCP).
2. **Jamais la `service_role`** dans le serveur MCP ni dans aucun module qu'il importe : client
   Supabase créé avec la clé publique + le jeton de l'utilisatrice → RLS appliquée telle quelle
   (test « arbre de modules », qui suit tous les imports).
3. **Jeton pour NOTRE client uniquement** : claim `client_id` = `MCP_OAUTH_CLIENT_ID`. Supabase émet
   `aud = "authenticated"` sans liaison à la ressource (RFC 8707 non documenté) ; ce contrôle la
   remplace. Un jeton de session de l'app, ou d'un autre client OAuth, est refusé (401).
4. **Rôle et profil actif revérifiés à CHAQUE appel** : `admin` ou `agente`, `profiles.actif = true`.
   La RLS ne regarde pas `actif` : ce filtre est indispensable. Compte `client` ou désactivé → 403
   avec message explicite.
5. **La base refuse toute écriture faite avec un jeton OAuth** (LOT A, `docs/sql/mcp_lecture_seule_oauth.sql`) :
   politiques RESTRICTIVES INSERT/UPDATE/DELETE sur les 49 tables `public` et sur `storage.objects`.
6. **Les routes `/api/*` refusent tout jeton OAuth** (LOT A, `app/lib/api-auth.js`,
   `app/api/onboarding/create-societe/route.js`) : elles écrivent en `service_role`, la RLS ne les
   protège pas. Un test recense automatiquement tout futur `auth.getUser(jeton)` serveur.
7. **Consentement** : seuls `admin`/`agente` actifs voient « Autoriser ». `/login?next=` n'accepte
   qu'un retour vers `/oauth/consent?authorization_id=…` (domaine externe, `//domaine`, URL encodée,
   `javascript:` : refusés, testés).

**Autres chemins d'écriture vérifiés (26/10, lecture seule) :**
- **Edge Functions** : aucune dans le projet (vérification d'Anne-Lise) — pas de chemin
  d'écriture hors PostgREST / Storage / routes `/api/*`.
- **Fonctions SECURITY DEFINER qui écrivent** : les 5 fonctions concernées ne sont exécutables
  que par `postgres` et `service_role` (vérification d'Anne-Lise, cohérente avec l'audit :
  `has_function_privilege('authenticated', …)` = false pour toutes). Un jeton OAuth ne peut donc
  pas les appeler par `/rest/v1/rpc`. Les fonctions RPC qui écrivent ET sont appelables par
  `authenticated` sont toutes SECURITY INVOKER : elles passent par les politiques restrictives.

**Ce que le SQL ne couvre pas : l'API Auth.** Avec un jeton OAuth, `PUT /auth/v1/user` peut tenter
de changer l'email, le mot de passe ou les métadonnées de la personne. Aucune politique SQL ne peut
l'empêcher. Les métadonnées ne servent à aucune règle de sécurité (vérifié : aucune fonction ni
politique ne lit `user_metadata`), mais l'email et le mot de passe, si. → test T6.

> ⛔ **RÈGLE D'ABANDON.** Si le test T6 montre qu'un jeton OAuth peut changer l'email ou le mot de
> passe **sans confirmation** (sans lien envoyé à l'ancienne adresse, sans mot de passe actuel ni
> code de ré-authentification), le serveur OAuth est **désactivé** dans le dashboard Supabase et le
> connecteur est **abandonné**.

---

## 4. Ce qui est refusé, et avec quel message

| Cas | Réponse |
|---|---|
| Pas de jeton | 401 `invalid_token` + `WWW-Authenticate: Bearer … resource_metadata=…` → Claude lance la connexion |
| Jeton expiré / invalide / révoqué | 401 « Jeton invalide ou expiré : reconnectez le connecteur BATILIS. » |
| Jeton de session de l'app, ou d'un autre client OAuth | 401 « Jeton non émis pour le connecteur BATILIS. » |
| `MCP_OAUTH_CLIENT_ID` absent | 503 « Connecteur BATILIS non configuré » (fail-closed) |
| Compte `client` | 403 « Accès refusé : le connecteur BATILIS est réservé aux comptes admin et agente. » |
| Compte désactivé | 403 « Accès refusé : ce compte BATILIS est désactivé. » |
| Dossier inexistant OU d'un autre tenant | « Dossier introuvable. » (identique) |
| Jeton OAuth sur une route `/api/*` | 403 « Accès refusé : jeton d'application tierce non accepté sur cette route » |

---

## 5. Activation — dans cet ordre, sans en sauter

> ⛔ **Ne pas activer le serveur OAuth avant le déploiement du LOT A et l'application du SQL.**

**LOT A** (seul, avant tout le reste)
1. Merger le LOT A (garde-fou `api-auth.js` + `create-societe` + SQL versionné).
2. **Avant le SQL**, vérifier en production les parcours qui passent par les routes `/api/*`
   touchées par le LOT A (connectée en agente, puis en admin) :
   - connexion, puis ouverture d'un dossier ;
   - génération d'un rapport de visite (CR) par l'IA ;
   - dépôt d'un document sur un dossier ;
   - agenda : création d'un RDV et son envoi vers le calendrier connecté ;
   - Drive : synchronisation d'un dossier / envoi d'un document ;
   - **le lendemain** : vérifier que le cron de relances (8 h UTC) est bien passé
     (journaux Vercel de `/api/cron/relances`, ou `/api/sante` avec le secret des crons).
     Les crons s'authentifient par `CRON_SECRET`, pas par un JWT : ils ne devraient pas être
     touchés, mais on le constate au lieu de le supposer.
   Un 403 « jeton d'application tierce non accepté » sur l'un de ces parcours = régression du
   LOT A : s'arrêter et me l'envoyer.
3. SQL editor : appliquer `docs/sql/mcp_lecture_seule_oauth.sql` partie par partie.
   ⚠️ Le SQL editor ne garde pas une transaction ouverte d'une exécution à l'autre : la
   **PARTIE 1 (BEGIN … COMMIT)** et la **PARTIE 3 (BEGIN … ROLLBACK)** doivent chacune être
   sélectionnées et exécutées **en UNE seule fois**, du BEGIN à la dernière ligne incluse.
   PARTIE 0 (attendu 0/0/0), PARTIE 1, PARTIE 2 (attendu `tables_non_couvertes = 0`,
   `politiques_oauth_storage = 3`), PARTIE 3 (toutes les lignes `OK`).
   Si **T7b** (« app : INSERT storage accepté ») échoue, m'envoyer le message d'erreur exact
   avant de conclure : Supabase peut protéger `storage.objects` contre les insertions SQL
   directes, auquel cas l'échec viendrait de cette protection et non des politiques.
4. Revérifier l'app en production (une écriture agente, un dépôt de document).

**LOT B**
5. Merger le LOT B (serveur MCP, page de consentement, `?next=` de `/login`).
6. Dashboard Supabase — vérifications préalables :
   - **Authentication → Hooks** : aucun « Custom Access Token Hook » actif (sinon, me le signaler :
     il s'exécute aussi pour les jetons OAuth).
   - **Project Settings → JWT Keys** : noter « Legacy HS256 » ou clés asymétriques (n'empêche rien,
     `openid` n'est pas demandé).
   - **Authentication → URL Configuration** : Site URL = `https://www.batilis-app.fr`. La page de
     consentement ne fonctionne donc qu'en **production** (pas sur une preview Vercel).
   - **Authentication → Sign In / Providers → Email** (`/dashboard/project/_/auth/providers?provider=Email`) :
     réglages du changement d'email et de mot de passe — voir T6 **avant** d'aller plus loin.
7. **Authentication → OAuth Server** : activer ; **Authorization Path** = `/oauth/consent` ;
   **Dynamic client registration** = **désactivé**.
8. **Authentication → OAuth Apps → Add a new client** : type **Public**, nom « Claude »,
   redirect URI `https://claude.ai/api/mcp/auth_callback`. Copier le **client_id**.
9. **Vercel → Settings → Environment Variables** (Production) : `MCP_OAUTH_CLIENT_ID` = ce client_id.
   Redéployer.
10. Vérifier la discovery : ouvrir
   `https://tfqtzfyavitrcsgbuueq.supabase.co/.well-known/oauth-authorization-server/auth/v1`
   (doit lister `code_challenge_methods_supported: ["S256"]`) et
   `https://www.batilis-app.fr/.well-known/oauth-protected-resource/api/mcp`.
11. **Vercel → Deployment Protection** : ne doit pas protéger le domaine de production.

**Ajout du connecteur dans claude.ai**
12. Paramètres → Connecteurs → **Ajouter un connecteur personnalisé**.
    URL : `https://www.batilis-app.fr/api/mcp` (avec `www`, exactement : le champ `resource` doit
    être identique). **Advanced settings** → « Use your own OAuth client » → Client ID = le
    client_id de l'étape 8, **pas de secret** (client public, PKCE).
    Doc : https://claude.com/docs/connectors/building/authentication
13. Se connecter : claude.ai ouvre la page de connexion BATILIS puis la page de consentement →
    **Autoriser**.

---

## 6. Révoquer un accès

| Besoin | Geste | Effet |
|---|---|---|
| Une personne, immédiatement | Désactiver son compte (Paramètres → agente → Désactiver, ou `profiles.actif = false`) | Le MCP refuse dès l'appel suivant (contrôle à chaque appel). |
| Une personne arrête d'utiliser Claude | claude.ai → Connecteurs → BATILIS → Déconnecter | Claude cesse d'appeler le connecteur. L'autorisation reste enregistrée côté Supabase : pour la couper aussi, utiliser une des lignes ci-dessous. |
| Tout le monde, immédiatement | Supprimer `MCP_OAUTH_CLIENT_ID` dans Vercel et redéployer | Toutes les requêtes MCP → 503. |
| Tout le monde, définitivement | Dashboard → Authentication → OAuth Apps : supprimer le client « Claude » ; puis OAuth Server : désactiver | Plus aucun jeton émis ni rafraîchi. |

Les jetons d'accès déjà émis restent valides jusqu'à leur expiration côté Supabase, mais le MCP
rappelle `auth.getUser` à chaque requête (session révoquée → refus) et la base refuse toute écriture.

---

## 7. Plan de test manuel

Préalable : LOT A appliqué (SQL PARTIE 3 tout `OK`), LOT B déployé, connecteur ajouté.

**Obtenir un jeton OAuth de test (pour T4, T4b, T6).** Le jeton du connecteur reste chez Claude,
invisible. On en fabrique un avec un client OAuth DE TEST, supprimé après les tests :
1. Dashboard → Authentication → OAuth Apps → Add a new client : type **Public**, nom « Test T4-T6 »,
   redirect URI `http://localhost:8765/callback` (aucun serveur n'y répond : c'est voulu, le code
   reste lisible dans la barre d'adresse). Noter son client_id (= `CLIENT_TEST` ci-dessous).
2. Dans un terminal, générer la paire PKCE :
   `node -e "const c=require('crypto');const v=c.randomBytes(32).toString('base64url');console.log('verifier='+v);console.log('challenge='+c.createHash('sha256').update(v).digest('base64url'))"`
3. Ouvrir dans le navigateur où vous êtes connectée à BATILIS :
   `https://tfqtzfyavitrcsgbuueq.supabase.co/auth/v1/oauth/authorize?response_type=code&client_id=CLIENT_TEST&redirect_uri=http://localhost:8765/callback&code_challenge=CHALLENGE&code_challenge_method=S256&scope=email`
   → page de consentement BATILIS → Autoriser → le navigateur échoue sur `localhost:8765/callback?code=…` : copier le `code`.
4. Échanger le code (moins de 10 minutes) :
   `curl -X POST https://tfqtzfyavitrcsgbuueq.supabase.co/auth/v1/oauth/token -H "Content-Type: application/x-www-form-urlencoded" -d "grant_type=authorization_code&code=CODE&redirect_uri=http://localhost:8765/callback&client_id=CLIENT_TEST&code_verifier=VERIFIER"`
   → `access_token` = le jeton OAuth (il porte `client_id` = CLIENT_TEST : la base et les routes
   `/api/*` le traitent comme n'importe quel jeton OAuth ; le serveur MCP, lui, le refuse — c'est voulu).
5. Après T4/T4b/T6 : supprimer le client « Test T4-T6 » dans OAuth Apps.
Doc des endpoints : https://supabase.com/docs/guides/auth/oauth-server/oauth-flows

| # | Action | Résultat attendu |
|---|---|---|
| T1 | Connectée en Anne-Lise (agente CTP), demander à Claude « liste mes dossiers » (`mes_dossiers`) | Exactement les dossiers de l'écran Chantiers d'Anne-Lise (non archivés), aucun autre. Comparer le nombre. |
| T2 | Déconnecter le connecteur, se reconnecter avec le compte agente de test de RÉNOV CONSEIL, `mes_dossiers` | Seulement les dossiers de cette agente (Paris 15), aucun dossier CTP. |
| T3a | En Anne-Lise : `lire_dossier` sur `2026-MR-011` (dossier RÉNOV, inexistant chez CTP) | « Dossier introuvable. » |
| T3b | En Anne-Lise : `lire_dossier` sur `2026-AM-001` (référence portée par CTP **et** RÉNOV) | Le dossier CTP, jamais celui de RÉNOV (vérifier client et adresse). |
| T3c | En Anne-Lise : `lire_dossier` sur `2026-CT-005` (dossier CTP de l'admin, archivé, ET dossier RÉNOV) | « Dossier introuvable. » (ni celui de l'admin, ni celui de RÉNOV). Connectée en admin CTP : le dossier CTP. |
| T4 | Tentative d'écriture directe sur l'API REST avec le jeton OAuth de test (procédure ci-dessus) : `curl -X PATCH "https://tfqtzfyavitrcsgbuueq.supabase.co/rest/v1/dossiers?reference=eq.2026-AM-043" -H "apikey: <clé anon>" -H "Authorization: Bearer <jeton OAuth>" -H "Content-Type: application/json" -H "Prefer: return=representation" -d '{"description":"test"}'` | Réponse `[]` (0 ligne modifiée). Le même appel en `POST /rest/v1/lots` → 403 `new row violates row-level security policy`. Vérifier en base que la description n'a pas changé. |
| T4b | Même jeton OAuth sur une route de l'app : `curl https://www.batilis-app.fr/api/calendar/list?compte_oauth_id=x -H "Authorization: Bearer <jeton OAuth>"` | 403 « jeton d'application tierce non accepté ». |
| T5 | `finances_du_dossier` sur **2026-AM-043** puis **2026-AM-032**, comparer à l'écran du dossier (bandeau honoraires + onglet suivi financier) | Au centime : honoraires courtage = `courtage.ttc` ; honoraires AMO (2026-AM-032) = `courtage.ttc + solde_amo.ttc` ; prévisionnel idem ; chaque échéance identique. |
| T6 | **API Auth.** Avec le jeton OAuth : `curl -X PUT https://tfqtzfyavitrcsgbuueq.supabase.co/auth/v1/user -H "apikey: <clé anon>" -H "Authorization: Bearer <jeton OAuth>" -H "Content-Type: application/json" -d '{"email":"<adresse de test à vous>"}'` puis la même chose avec `{"password":"<mot de passe de test>"}` | **Email** : aucun changement effectif tant que la confirmation n'est pas cliquée — un lien doit partir vers l'ANCIENNE ET la nouvelle adresse (réglage « Secure email change »). **Mot de passe** : refusé (mot de passe actuel ou code de ré-authentification exigé). Sinon → **règle d'abandon (§3)**. |
| T7 | Désactiver temporairement l'agente de test, appeler un outil | 403 « ce compte BATILIS est désactivé ». Réactiver. |
| T8 | Tenter de connecter le connecteur avec un compte **client** | Page de consentement : message « réservé aux comptes admin et agente », seul « Refuser » proposé. |

**Réglages à vérifier pour T6** — dashboard Supabase, **Authentication → Sign In / Providers → Email**
(lien de la doc : `/dashboard/project/_/auth/providers?provider=Email`,
https://supabase.com/docs/guides/auth/password-security) :
- **Secure password change / « Require reauthentication when changing password »** : doc Supabase —
  *« Users will need to be recently logged in to change their password without requiring
  reauthentication. (A user is considered recently logged in if the session was created within the
  last 24 hours.) »* ⚠️ Une session OAuth **vient** d'être créée : ce réglage seul **ne bloque pas**
  un changement de mot de passe dans les 24 h qui suivent le consentement.
- **« Require current password when changing password »** : doc Supabase — *« the password change
  request will validate that the current password is correct before updating the user's password »*.
  C'est ce réglage qui ferme le trou. ⚠️ À tester **avant** de conclure : la page
  `/auth/set-password` (invitation, mot de passe oublié) appelle `updateUser({ password })` sans
  mot de passe actuel ; la doc ne dit pas si ce réglage la bloque. Tester une invitation et un
  « mot de passe oublié » après l'avoir activé.
- **Secure email change** : je n'ai pas trouvé sa définition dans la documentation que j'ai pu lire
  depuis la session (supabase.com bloqué par le proxy). Le repérer dans la même page du dashboard et
  vérifier son effet par T6 — c'est le test qui fait foi.

---

## 8. Limites connues

- **Serveur OAuth Supabase en BETA** ; enregistrement de client « Use your own OAuth client » côté
  claude.ai non testé de bout en bout depuis le développement.
- **Pas de liaison d'audience** (RFC 8707) côté Supabase : compensée par le contrôle `client_id`
  et l'enregistrement dynamique désactivé.
- Paramètre `resource` envoyé par Claude : la doc Supabase ne dit pas s'il est accepté ou ignoré.
  Premier point à observer à la connexion.
- **Nouvelle table** créée après le SQL : n'a pas les politiques restrictives → ré-exécuter la
  PARTIE 1 (idempotente). La PARTIE 2 détecte l'oubli.
- Statuts d'action « fermés » dupliqués de `CRVisitesPanel.jsx` (composant client non importable).
- Une agente voit aussi les RDV et interventions **sans propriétaire** de son agence : c'est la RLS
  actuelle (`rendez_vous_scope`), le connecteur la reproduit.

## 9. Sources

- Supabase OAuth 2.1 Server : https://supabase.com/docs/guides/auth/oauth-server/getting-started ·
  https://supabase.com/docs/guides/auth/oauth-server/oauth-flows ·
  https://supabase.com/docs/guides/auth/oauth-server/token-security ·
  https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication
- supabase-js : https://supabase.com/docs/reference/javascript/oauth-server-getauthorizationdetails
- Sécurité des mots de passe : https://supabase.com/docs/guides/auth/password-security
- Spec MCP (autorisation, transports) : https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization ·
  https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- SDK : https://github.com/modelcontextprotocol/typescript-sdk (npm `@modelcontextprotocol/sdk` 1.32.2)
- Connecteurs claude.ai : https://claude.com/docs/connectors/building/authentication
