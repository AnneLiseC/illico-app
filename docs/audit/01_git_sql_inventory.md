# Inventaire 01 — Git + SQL (collecte pure, sans confrontation aux docs)

> **HEAD de référence : `91e0db1`** (`91e0db1 doc à jour pour prompt`)
> Ce hash doit être IDENTIQUE pour les 4 inventaires suivants (02→05).
> Méthode : lecture seule. Aucun document de pilotage (boussole, journal, VALIDE_*) consulté.
> MCP Supabase = SELECT uniquement, aucune écriture. Dernière date de commit main : 2026-07-09.

Ce document décrit **l'état réel** du dépôt et de la base, sans jugement d'importance et
sans référence à aucune documentation. La confrontation aux docs est hors périmètre (phase ultérieure).

---

## PARTIE A — HISTORIQUE GIT

### A.1 — Périmètre chiffré (prouvé)

| Mesure | Commande | Valeur |
|---|---|---|
| Commits sur `main` | `git log --oneline main` | 446 |
| Commits toutes branches | `git log --oneline --all` | 449 |
| Commits de merge (PR) sur main | `grep -c "Merge pull request\|Merge branch"` | 170 |
| Commits directs (non-merge) sur main | `git log --no-merges main` | 279 |
| Branches distantes | `git branch -r` | 35 |

### A.2 — Branches (git branch -a)

```
  claude/supabase-github-connect-pn5z4u
  feat/ts2-courtage-ts
  feat/ts2-pdf
* main
  remotes/origin/claude/supabase-github-connect-pn5z4u
  remotes/origin/data/repare-rdv-autres-titre
  remotes/origin/feat/agenda-client-front
  remotes/origin/feat/agenda-client-views
  remotes/origin/feat/agenda-date-utc
  remotes/origin/feat/agenda-scope-tenant
  remotes/origin/feat/comptes-oauth-6a
  remotes/origin/feat/desactivation-j14
  remotes/origin/feat/dispatch-fournisseur-6b1
  remotes/origin/feat/expiration-acces
  remotes/origin/feat/expiration-guard
  remotes/origin/feat/fix-delete-agente
  remotes/origin/feat/invite-client
  remotes/origin/feat/login-client
  remotes/origin/feat/mes-calendriers-lot8
  remotes/origin/feat/outlook-lot7
  remotes/origin/feat/planning-agence-conditionnel
  remotes/origin/feat/socle-agenda-suite
  remotes/origin/feat/soft-delete-agente
  remotes/origin/feat/sync-ciblage-structure
  remotes/origin/feat/sync-cible-front-planning
  remotes/origin/feat/sync-push-bascule
  remotes/origin/feat/sync-tdz-fix
  remotes/origin/feat/ts1-reventilation-amo
  remotes/origin/feat/ts2-courtage-ts
  remotes/origin/feat/ts2-pdf
  remotes/origin/fix/affichage-titre-autres
  remotes/origin/fix/calendar-lib-5a
  remotes/origin/fix/cr-pdf-liste-insecable
  remotes/origin/fix/cr-pdf-orphelin-pagevide
  remotes/origin/fix/cr-pdf-pagination
  remotes/origin/fix/emoji-pdf-cr
  remotes/origin/fix/modale-rdv
  remotes/origin/fix/planning-date-tz
  remotes/origin/main
```

**Branches distantes NON mergées dans `origin/main` (travail en avance / orphelin) :**

- `origin/feat/dispatch-fournisseur-6b1` — 1 commit(s) en avance sur main :
    - 7051245 ok docs
- `origin/feat/fix-delete-agente` — 2 commit(s) en avance sur main :
    - 3b2bc5f feat(ux): avertir que les documents de l'agente seront supprimés à la suppression
    - 321d233 chore(sql): fix « Database error deleting user » à la suppression d'agente (manuel)

> Les branches locales `feat/ts2-courtage-ts`, `feat/ts2-pdf`, `claude/supabase-github-connect-pn5z4u`
> n'ont aucun commit en avance sur `origin/main` (mergées ou identiques).

### A.3 — Fichiers réécrits en masse / bulk (ANGLE MORT de la lecture git)

Fichiers dont le contenu est massif et sans historique fin (ajoutés/régénérés en bloc) — leur
diff ligne-à-ligne n'est pas informatif :

- **Blobs base64 (PDF encodés en `export const … = "JVBER…"`)** — 9 fichiers :
    - app/lib/sep_descriptif.js
    - app/lib/sep_devis.js
    - app/lib/sep_illustrations.js
    - app/lib/sep_kbis.js
    - app/lib/sep_page_garde.js
    - app/lib/sep_planning.js
    - app/lib/sep_qualification.js
    - app/lib/sep_recap.js
    - app/lib/sep_refs.js
- **Templates PDF binaires suivis comme fichiers** (app/lib/*.pdf) :
    - app/lib/1 Page de garde.pdf
    - app/lib/2 Descriptif du projet.pdf
    - app/lib/3 Illustrations et vues 3D.pdf
    - "app/lib/4 R\303\251capitulatif financier.pdf"
    - app/lib/5 Devis, factures.pdf
    - app/lib/6 Planning provisoire indicatif.pdf
    - "app/lib/7 R\303\251ferences Produits.pdf"
    - app/lib/8 Kbis - Assurances.pdf
    - app/lib/9 Qualification.pdf
- **Polices binaires** : public/fonts/Roboto-Bold.ttf,public/fonts/Roboto-Italic.ttf public/fonts/Roboto-Regular.ttf
- **`package-lock.json`** (8376 lignes, auto-généré npm).
- **Plus gros fichier source éditable** : `app/chantiers/[id]/page.js` (5753 lignes) — un seul fichier concentrant une grande part de la logique chantier.

Les commits les plus volumineux (`git log --shortstat`) atteignent ~48 000 lignes : ce sont
ces ajouts bulk (blobs, PDF, fonts, lock).

### A.4 — Log COMPLET de main (récent → ancien, non tronqué : 446 commits)

```
91e0db1 doc à jour pour prompt
b7fa6e5 doc a jour
4db5941 Merge pull request #303 from AnneLiseC/feat/ts2-pdf
fca4ff9 feat(ts2c/pdf): ventilation courtage initial / TS dans Suivi_Financier & Recap_Financier
52f181e Merge pull request #302 from AnneLiseC/feat/ts2-courtage-ts
52236c4 fix(ts2): verrou anti-décochage du courtage initial tant qu'il y a des TS
5b2d711 feat(ts2): courtage TS — calcul (finance.js additif) + déclenchement + affichage
1d54ebe feat(ts2/sql): socle structurel courtage TS (non appliqué)
ae8f403 Merge branch 'main' of https://github.com/AnneLiseC/illico-app
227622f Merge pull request #301 from AnneLiseC/feat/ts1-reventilation-amo
ae7fc39 correction logo
05f8308 fix(pdf): TS-1 — appliquer la re-ventilation au Recap_Financier standalone
7fbe14b fix(pdf): TS-1 — faire remonter suivi_financier jusqu'à RecapHonoraires (pivot)
668c29c feat(finance): TS-1 — re-ventilation courtage→AMO des devis signés après le pivot (cas AMO)
69b2e39 Merge pull request #300 from AnneLiseC/feat/soft-delete-agente
3e8b391 feat(agente): soft delete (désactiver/réactiver) au lieu de supprimer
3453cb2 Merge pull request #299 from AnneLiseC/feat/planning-agence-conditionnel
dd58952 fix(planning): ne plus afficher le code agence dans les modales
463f105 feat(planning): select agence conditionnel dans les modales RDV/intervention
f368318 Merge pull request #298 from AnneLiseC/feat/mes-calendriers-lot8
5d29af6 feat(calendar): sélecteur d'agence conditionnel à la création de cible (ajust 8)
8d0582e feat(calendar): cible par défaut (lot 8e — clôt le lot 8)
88834d6 feat(calendar): monter MesCalendriers dans parametres admin (Placement-2)
b31552b refactor(calendar): extraire <MesCalendriers/> de profil (Placement-1)
288cf4f feat(calendar): nom d'agenda stocké + libellé éditable (lot 8f)
d13e454 chore(sql): RLS cibles_calendrier — fix fuite des cibles perso (manuel)
b34742c feat(calendar): création/suppression de cibles dans Mes calendriers (lot 8d)
d80ccae fix(calendar): afficher l'erreur de connexion iCloud DANS le formulaire (lot 8c)
584844d feat(calendar): connexion iCloud front + déconnexion compte (lot 8c)
e9cd65e feat(calendar): écran « Mes calendriers » lecture + badge multi-fournisseur (lot 8b)
6464009 feat(calendar): route GET /api/calendar/list — agendas d'un compte (lot 8a)
248d797 Merge pull request #297 from AnneLiseC/feat/outlook-lot7
46e0d0b refactor(calendar): mapping métier partagé google/icloud (lot 7-mapping)
fb62451 Merge branch 'main' of https://github.com/AnneLiseC/illico-app
f5f8e92 journal
7ec328a Merge pull request #296 from AnneLiseC/feat/dispatch-fournisseur-6b1
35ac7a7 chore(sql): comptes_oauth.access_token nullable pour iCloud (lot 6b-3)
78576c5 feat(calendar): client iCloud CalDAV + ICS + chiffrement (lot 6b-2)
09f3b10 refactor(calendar): couche de dispatch par fournisseur (lot 6b-1)
d5da4a8 Merge pull request #295 from AnneLiseC/feat/comptes-oauth-6a
534ed7a feat(sync): généralise google_tokens -> comptes_oauth (lot 6a, structure)
b05f083 Merge pull request #294 from AnneLiseC/fix/calendar-lib-5a
4caedea feat(sync): bascule event (DELETE Google) sur les cibles via la lib (lot 5c)
3513786 style(sync): nettoie les 3 quirks de format des summaries Google (lot 5b)
d320ba0 refactor(sync): extrait les helpers Google de push vers app/lib/calendar/google.js (lot 5a)
a845d0f Merge pull request #293 from AnneLiseC/fix/cr-pdf-orphelin-pagevide
b55c373 fix(pdf): titre de section orphelin + page vide finale dans les CR
f15c728 Merge pull request #292 from AnneLiseC/fix/cr-pdf-liste-insecable
3520739 fix(pdf): puce de liste insécable de son texte dans les CR
917c10d Merge pull request #291 from AnneLiseC/fix/cr-pdf-pagination
fb6ef3f fix(pdf): pagination des CR longs — supprime le chevauchement page 1
eb64292 Merge pull request #290 from AnneLiseC/data/repare-rdv-autres-titre
aae1168 Merge pull request #289 from AnneLiseC/fix/affichage-titre-autres
fcf5912 fix(planning): retire le préfixe « Autre · » des RDV 'autres' + titre dans l'agenda 30j
2635ef0 docs(sql): mini-lot data — réparation des 175 RDV 'autres' au titre piégé dans notes
f0bdc2f Merge pull request #288 from AnneLiseC/feat/sync-push-bascule
b82e966 fix(sync): scoping tenant de la route push (gate RLS authentifiée, lot 4b)
374dce6 feat(sync): câble le push en fiche chantier + retire le bouton sync (lot 4c)
e2da89e feat(sync): bascule push sur les cibles + mode dry-run (lot 4a)
38423f4 Merge pull request #287 from AnneLiseC/fix/modale-rdv
8bd2e2d fix(chantiers): artisans réception filtrés par devis accepté (lot 3b)
ebc8d3b fix(planning): sélecteur chantier persistant + artisans filtrés par devis accepté
d717cad Merge pull request #286 from AnneLiseC/fix/planning-date-tz
7156694 fix(planning): rebranche la conversion Paris<->UTC perdue au merge b6c5ab2
ee4e0dd Merge pull request #285 from AnneLiseC/feat/sync-cible-front-planning
188365b feat(chantiers): sélecteur de calendrier (cible) dans les modales RDV + intervention
9cf68a2 feat(sync): sélecteur de calendrier (cible) + agence étendu sur planning (lot 3a)
0557fdd Merge pull request #284 from AnneLiseC/feat/sync-ciblage-structure
5294b23 feat(sync): seed cible Martigues + défaut agentes + rétro-mapping (lot 2c)
031f376 feat(sync): colonnes de liaison ciblage (lot 2b)
7c6b61a fix(sync): grant _res/_ctx à service_role dans les tests cibles (lot 2a)
b90eed3 feat(sync): table cibles_calendrier + trigger société + RLS (lot 2a)
bac38d7 Merge pull request #283 from AnneLiseC/feat/sync-tdz-fix
7251422 fix(google): TDZ "Cannot access auth before initialization" (sync + event)
06c67f6 Merge pull request #282 from AnneLiseC/feat/socle-agenda-suite
b6c5ab2 Merge branch 'main' into feat/socle-agenda-suite
12e8519 feat(agenda): created_by sur rendez_vous + interventions_artisans
6c08664 feat(agenda): sélecteur agence admin + agence dérivée du dossier (front)
f7c3434 feat(agenda): trigger dérive l'agence du dossier en priorité
f9b571d Merge pull request #281 from AnneLiseC/feat/agenda-client-front
7cedf4b feat(espace-client): section agenda (RDV + interventions visibles)
d188dd5 Merge pull request #280 from AnneLiseC/feat/agenda-client-views
fdcbc54 fix(agenda): vues client — restreindre authenticated à SELECT seul
ee37030 feat(agenda): vues client_rendez_vous + client_interventions
edd3543 Merge pull request #279 from AnneLiseC/feat/agenda-date-utc
7ed7d47 feat(agenda): sync/route — envoyer l'instant ISO complet à Google (cohérence push)
9c16b3d feat(agenda): push sync — envoyer l'instant ISO complet à Google
83a7d3f feat(agenda): front écriture RDV fiche chantier — saisie Paris -> instant UTC
0a245f6 feat(agenda): front écriture — saisie Paris -> instant UTC pour date_heure
e16d498 fix(agenda): FullCalendar en Europe/Paris via plugin luxon3
3654134 feat(agenda): front lecture — afficher date_heure en Europe/Paris
69b8ea1 feat(agenda): script migration date_heure -> timestamptz UTC
b3dbc2f Merge pull request #278 from AnneLiseC/feat/agenda-scope-tenant
e75d106 test(agenda): ajout T7 cloisonnement inter-agences même société
7c0e50a feat(agenda): SQL scope tenant rendez_vous + interventions_artisans
f1e1a22 Merge pull request #277 from AnneLiseC/feat/desactivation-j14
45d8c2f feat(tr5-front): guard acces_actif + réactivation au re-invite
c708121 feat(tr5-cron): bloc désactivation accès J+14 dans le cron relances
357a0b3 fix(tr4b-sql): REVOKE EXECUTE FROM anon sur mon_expiration_client()
60a309d fix(tr5-sql): REVOKE EXECUTE FROM anon sur desactiver_acces_expires()
c5d4c04 feat(tr5-sql): RPC desactiver_acces_expires() (désactivation compte J+14)
e7d3e91 Merge pull request #276 from AnneLiseC/feat/expiration-guard
5e7bacf feat(tr4b-front): guard expiration via RPC mon_expiration_client()
5aa14e1 feat(tr4b-sql): durcir le cloisonnement client avec l'expiration (chokepoint)
88b56b6 feat(tr4a): guard front expiration espace client (écran expiré + bandeau J-21)
9a7f205 Merge pull request #275 from AnneLiseC/feat/expiration-acces
afbb1dd feat(tr3): stockage + calcul de l'expiration d'accès client
9ddedf6 Merge pull request #274 from AnneLiseC/feat/login-client
923940b feat(login-client): page de connexion client brandée BATILIS
203b48b Merge pull request #273 from AnneLiseC/feat/invite-client
e415c1b feat(invite-client): bouton AMO-only + wording mail distinct (invité vs renvoi)
95c7530 feat(invite-client): invitation client via generateLink + brouillon mailto
8ff2aa5 Merge pull request #272 from AnneLiseC/fix/emoji-pdf-cr
44ab10c fix(pdf): retirer les emojis du PDF de CR (tofu Roboto) + consigne prompt IA
5bcdc3b Merge pull request #271 from AnneLiseC/feat/navbar-badge-messages
c5121c3 feat(navbar): pastille messages client non lus sur l'onglet Messagerie
d2fe080 Merge pull request #270 from AnneLiseC/feat/messagerie-edition-ui-repli
efb760b feat(lot3 B2+C): édition message — réplication chantiers/[id] + espace-client
67a0131 feat(lot3 B1): édition en place d'un message dans la messagerie centralisée
33bbb81 Merge pull request #269 from AnneLiseC/feat/messagerie-edition
2b0030b fix(lot3): trigger messages — garde NULL-safe auth.uid() (vrai fail-closed)
688d204 feat(lot3): SQL édition message <10min — trigger assoupli + edited_at + policy
65308ce Merge pull request #268 from AnneLiseC/fix/timezone-messages
aca30b8 fix(timezone): helper lib/dates.js + heures de message en Europe/Paris
272acca Merge pull request #267 from AnneLiseC/feat/messagerie-reactivation
381bc3d feat(messagerie): exclure les archivés + trier les conversations par dernier message
ce621fb feat(messagerie): polish fil — nom client/référent, scroll borné, tri par date
6e4b33b feat(messagerie): réactiver la page centralisée staff + fix raison_sociale
7f36e0c Merge branch 'main' of https://github.com/AnneLiseC/illico-app
4f057e6 docs a jour 23/07 19h
dad422d Merge pull request #266 from AnneLiseC/feat/c7-messages-durcir
a0eeba1 feat(c7): messages — trigger BEFORE UPDATE verrou colonnes (lu/lu_agence seules)
fa4d9f8 feat(c7): messages — policy UPDATE client (marquage lu)
2d26316 feat(c7): messages — figer auteur_role='client' à l'insert client (anti-usurpation)
40ba86b Merge pull request #265 from AnneLiseC/fix/pdf-roboto-italic
e67123f fix(pdf): enregistrer Roboto italic comme variante de la famille Roboto
5805e18 Merge pull request #264 from AnneLiseC/feat/c7-cr-realtime
00a2c13 feat(c7): retirer l'abonnement realtime CR (table fail-closed)
4e18d8a Merge pull request #263 from AnneLiseC/feat/c7-cr-vue-client
d62ee83 feat(c7): retrait de la policy comptes_rendus_client_read (table fail-closed)
ef2d914 feat(c7): espace client lit les CR via la vue client_comptes_rendus
597e073 test(c7): test d'étanchéité de la vue client_comptes_rendus
009d104 Merge pull request #262 from AnneLiseC/feat/c7-cr-vue-client
ac34bf2 feat(c7): vue client_comptes_rendus (CR visibles client, colonnes limitées)
4b2c104 Merge pull request #261 from AnneLiseC/feat/c7-devis-front-carte
7223bf3 feat(c7): carte cliquable « voir le devis » dans l'espace client
e1c1c09 Merge pull request #260 from AnneLiseC/feat/c7-devis-pdf
4f0ba5d feat(c7): servir le PDF du devis signé au client via /api/pdf (type='devis')
7d1b2df test(c7): T7 — vérifier a_devis_signe (cohérence + chemin caché)
1a647f0 feat(c7): ajouter a_devis_signe à la vue client_devis_acceptes
0b2630a Merge pull request #259 from AnneLiseC/feat/c7-devis-front
b0cd9f7 feat(c7): afficher les devis acceptés dans l'espace client via la vue
0bc32ae Merge pull request #258 from AnneLiseC/feat/c7-vue-devis-client
9b760f0 test(c7): adapter le test d'étanchéité en Option 1 (sans profil B)
6981bc7 test(c7): test d'étanchéité inter-client de client_devis_acceptes
f49e1e9 fix(c7): resserrer authenticated à SELECT seul sur client_devis_acceptes
0f0aa0a refactor(c7): extraire le scoping client dans mes_dossiers_client()
52e2fe4 feat(c7): vue client_devis_acceptes (devis acceptés + artisan, scopée client)
b3eb054 Merge branch 'main' of https://github.com/AnneLiseC/illico-app
83c2405 Doc a jour 18/09
abda085 Merge pull request #257 from AnneLiseC/fix/cr-prenom-client
e67d3d6 fix(cr): préserver le nom et prénom du client à la génération
bde261b Merge pull request #256 from AnneLiseC/fix/cr-join-notes
4abbda7 feat(cr): consigne orthographe + température 0.3
5f02761 feat(cr): retirer la numérotation des comptes-rendus
1b00cbd fix(cr): séparer notes tapées et vocales par un paragraphe (mots collés)
d3df28b Merge pull request #255 from AnneLiseC/feat/finances-l16-facturation-scope
a0823ad feat(finances): L16 — Facturation scopée par agence active
386ce8b Merge pull request #254 from AnneLiseC/feat/finances-colonne-honoraires
cd59472 feat(finances): colonne Honoraires dans le tableau Réel/Prévi
cafe6dd Merge pull request #253 from AnneLiseC/feat/finances-libelles-vague1
a7fc602 feat(finances): libellés vague 1 (colonne Net, légende redevances, label honoraires)
14346ad Merge pull request #252 from AnneLiseC/feat/finances-objectif-ca-genere
9fe9016 feat(finances): barre objectif sur CA généré (mois + année, 3 modes)
7b97382 doc corrigé 18/06
eda1649 Merge branch 'main' of https://github.com/AnneLiseC/illico-app
6423b52 doc a jour finance ok
c608a4e Merge pull request #251 from AnneLiseC/feat/objectif-agente-front
f42ecbd feat(profil): objectif annuel éditable par l'agente
2013b2c Merge pull request #250 from AnneLiseC/chore/objectifs-ca-rls-test
0e2b18d docs(sql): test RLS objectifs_ca (script de vérif, non appliqué)
066e4ba Merge pull request #249 from AnneLiseC/chore/objectifs-ca-rls-durcissement
d6397b1 docs(sql): durcissement RLS objectifs_ca (script non appliqué)
062385e Merge pull request #248 from AnneLiseC/feat/finances-nettoyage
cc2fa6e chore(finances): commentaires à jour + annotation prop morte ObjectifBar
c2cf533 Merge pull request #247 from AnneLiseC/feat/finances-ca-genere
c0df6de feat(finances): compte de résultat « CA généré » (3 modes)
e76d6b9 Merge pull request #246 from AnneLiseC/feat/finances-renommages
aed69ec refactor(finances): renommages d'affichage des onglets et du compte de résultat
db506e3 Merge pull request #245 from AnneLiseC/feat/objectif-agente-scope
592c31e fix(finances): objectif de comparaison scopé pour l'agente
53dbf13 Merge pull request #244 from AnneLiseC/feat/finances-repartition-brut-reel
b3a875d feat(finances): répartition par chantier en brut + réel encaissé
e32a9c8 Merge pull request #243 from AnneLiseC/claude/hopeful-babbage-dajunl
b9e21fe fix(pdf): nom de fichier CR avec le nom de famille seul (sans prénom)
9addd10 fix(pdf): graisse Roboto correcte + nom de fichier CR (DATE_CR_NOM CLIENT)
ff81945 Merge pull request #242 from AnneLiseC/claude/hopeful-babbage-dajunl
6abee1d fix(pdf): polices Roboto Unicode pour corriger les glyphes parasites
bb6fb2a Merge pull request #241 from AnneLiseC/chore/model-sonnet-4-6
e584f9c chore: modèle Claude → claude-sonnet-4-6 (app/api/cr/route.js)
c6e032e Merge branch 'main' of https://github.com/AnneLiseC/illico-app
fafb045 refonte finance ok
2a8ae4d Merge pull request #240 from AnneLiseC/fix/finances-royalties-reel
0a998f1 fix(finances) royalties réel : inclure frais + honoraires, pas seulement commissions
99291fc Merge pull request #239 from AnneLiseC/refonte/finances-lot3c-comptes
44dc324 refonte(finances) Suivi : donuts seuls, graphe Gains/Charges annuel, ordre ASC, libellé Reversements
c26c719 refonte(finances) lot3c suite: libellés, vue Prévi sans 'Par mois', drill année Réel
2c417c0 refonte(finances) onglets : reset du scope à 'tous' vers Suivi/Facturation
89b03bd refonte(finances) Suivi vue mois : détail déplié en Réel uniquement
6bbee36 refonte(finances) lot3c: comptes Suivi (Agence/Agent/Société) + colonnes périodes
6b95794 Merge pull request #238 from AnneLiseC/refonte/finances-lot3b-suivi-fusion
e3b7fa6 refonte(finances) Suivi vue Mois: graphe Gains/Charges après le tableau
c7d1ac1 refonte(finances) Suivi: retirer "Filtré sur" + réordonner (compte de résultat avant graphes)
9cf1373 refonte(finances) D15: filtrer graphes + donuts du Suivi par année sélectionnée
5506d26 refonte(finances) D15 fix2: toggle admin, libellés, deux donuts réel/prévi
f25cf1b refonte(finances) D15 fix: mode 'agent', mono-agence='ctp', donut Honoraires par typologie
2d8785e refonte(finances) D15: fusionner Synthèse dans Suivi financier
c064f94 Merge pull request #237 from AnneLiseC/refonte/finances-lot3a-style
1fb9b4e refonte(finances) D5: unifier le style sur tokens CSS (suppression Tailwind)
f2b0d14 refonte(finances) D13: extraire SuiviCTPChart, SyntheseView, FacturationAgentes
0439a85 Merge pull request #236 from AnneLiseC/refonte/finances-lot2-menage
8d018dc refonte(finances): KPI 'CA réel net' rendu admin-only (retiré en vue agente)
dfb4eaf refonte(finances): lot2 ménage — 7 corrections localisées
1f153ae Merge pull request #235 from AnneLiseC/refonte/finances-lot1-renommage
0849523 refonte(finances): renommer onglets 'F1 Prévisionnel'→'Prévisionnel', 'F2 Réel'→'Réel'
8faf611 Merge pull request #234 from AnneLiseC/feat/comparateur-devis-sql
c13b3ed feat(comparateur): onglet Comparateur de devis (simulations)
5b53d4b feat(comparateur): schéma SQL simulations + lignes (tables, RLS, index)
4ecce6f Merge pull request #233 from AnneLiseC/fix/stepper-5-etapes
f6fda5b fix(chantier): stepper 5 étapes monotone (étape Signature sur devis tranchés)
f801a55 Merge branch 'main' of https://github.com/AnneLiseC/illico-app
986896c DOC A JOUR 17:07
3401841 Merge pull request #232 from AnneLiseC/feat/kpi-montant-prevu-reel
203e908 feat(chantier): KPIs Montant prévu + Montant réel (retrait Frais consultation TTC)
235ae45 Merge pull request #231 from AnneLiseC/feat/creer-fiche-tech-depuis-chantier
ca7f57f feat(chantier): créer une fiche technique depuis la fiche chantier
a763a14 Merge pull request #230 from AnneLiseC/feat/pv-reception
32c941e feat(pv): PV de réception par devis (fiche + restitution)
f1e8545 Merge pull request #229 from AnneLiseC/feat/kbis-franchisee-parametres
0ecd370 feat(parametres): bloc KBIS franchisée dans l'onglet RIB & Kbis
75f70a8 Merge pull request #228 from AnneLiseC/feat/bouton-facture-honoraire
d9a8321 feat(documents): bouton dédié facture honoraires + badge FACT
9d8bdbc Merge pull request #227 from AnneLiseC/feat/facture-honoraire-restitution
5e54939 feat(restitution): factures honoraires CTP→client dans le bloc Factures
aa3d8b6 Merge pull request #226 from AnneLiseC/feat/zip-photos
3ffbf24 feat(chantier): bouton ZIP photos sur la fiche chantier (staff)
6ef0cfd Merge pull request #225 from AnneLiseC/feat/restitution-factures-rib-kbis
0f5c083 feat(restitution): factures artisans (pdf_path) + RIB/KBIS franchisé dans le dossier de suivi
e5cd604 Merge pull request #224 from AnneLiseC/perf/rls-initplan
b8b8c27 perf(rls): encapsuler auth.uid() en (select auth.uid()) sur notifications
044d464 Merge pull request #223 from AnneLiseC/feat/contrat-auto-signe
c8a2d7b feat(contrat): auto-signature du mandat à l'upload du PDF (et décochage au retrait)
1382cf5 doc à jour
f607ef7 Merge pull request #222 from AnneLiseC/feat/dblclick-ouvrir-dossier
82bc873 feat(chantiers): double-clic sur une ligne ouvre le dossier
31a20c5 Merge pull request #221 from AnneLiseC/fix/modifier-dossier-modal
4d8f857 fix(chantier): édition dossier en modale (Modifier accessible depuis tout onglet)
86f529c Merge pull request #220 from AnneLiseC/chore/retro-cat-cr
a8e8882 Merge pull request #219 from AnneLiseC/feat/doc-cr-autocat
41e9db4 feat(documents): section CR uploadés sous les CR générés (onglet CR)
00d3b9a chore(documents): rétro-catégorisation des 4 CR existants
30b96d2 chore(documents): rétro-catégorisation des 4 CR existants
8360908 feat(documents): auto-catégorisation CR à l'upload + tag manuel
537abec Merge pull request #218 from AnneLiseC/feat/doc-categorie-cr
6bedcc6 feat(documents): colonne categorie sur chantier_documents (CR)
fa86b34 Merge pull request #217 from AnneLiseC/perf/index-fk
6bf6d0e perf(db): SQL indexation des 29 FK non indexées (advisor Supabase)
843eac6 Merge pull request #216 from AnneLiseC/fix/nom-client-format
8ca9cf4 feat(clients): nom couple sur tableau finances + PDF récapitulatif
8503e51 fix(clients): basculer 9 sites couple-aware sur formatNomClient
261b91e feat(clients): formatNomClient centralisé (nom couple sans « null »)
b4d8ff6 Merge branch 'main' of https://github.com/AnneLiseC/illico-app
0581136 doc à jour
b4d7ae2 Merge pull request #215 from AnneLiseC/chore/finance-code-mort
b3432a7 chore finance.js — retirer 3 clés de retour mortes
4ce74bb chore finance.js — supprimer getPartAdmin (mort)
15f9564 Merge pull request #214 from AnneLiseC/feat/statut-editeur-manuel
b74b263 ÉTAPE E — Éditeur de statut manuel sur la fiche (annule/termine)
03c3cde Merge pull request #213 from AnneLiseC/fix/statut-check-strict
b8c748e ÉTAPE D — CHECK strict dossiers.statut + défaut NULL
94f3c2f doc à jour
edc21cf Merge pull request #212 from AnneLiseC/feat/liste-chantiers-rdv
565390c ÉTAPE C / sous-lot 6 — Finances : badge statut sur calcStatut
2fea54c ÉTAPE C / sous-lot 5 — Dashboard : calcStatut + Pipeline 6 buckets
09dbdc1 ÉTAPE C / sous-lot 4 — clients/[id] : centraliser sur StatutBadge partagé
626df50 ÉTAPE C / sous-lot 3 — Fiche chantier : badge sur calcStatut
4afb444 ÉTAPE C / sous-lot 2 — Liste chantiers : charger rendez_vous pour calcStatut
036aeca Merge pull request #211 from AnneLiseC/feat/statutbadge-tailwind
68d5dfc ÉTAPE C / sous-lot 1 — StatutBadge sur STATUT_CONFIG.color (Tailwind)
611fb22 Merge pull request #210 from AnneLiseC/feat/statut-config-nouveaux
948b5a0 ÉTAPE F-config — 4 nouveaux statuts dans STATUT_CONFIG
c596d55 Merge pull request #209 from AnneLiseC/fix/statut-rattrapage-null
7d4206b ÉTAPE B — Rattrapage NULL des statuts calculables
3043fac Merge pull request #208 from AnneLiseC/feat/calcstatut-v2
8fce442 ÉTAPE A / Commit 3 — Supprimer l'auto-push dossiers.statut='devis_a_modifier'
c87428a ÉTAPE A / Commit 2 — Création dossier écrit statut NULL
07021af ÉTAPE A / Commit 1 — Réécriture calcStatut (cascade v2)
5ac386f spec à jour modifier
7acd4f3 Merge branch 'main' of https://github.com/AnneLiseC/illico-app
b4dd101 spec à jour
2841c78 Merge pull request #207 from AnneLiseC/chore/regularisation-rdv-legacy-marine
3deb822 Régularisation RDV R2/R3 legacy (dossiers Marine)
a19de34 Merge branch 'main' of https://github.com/AnneLiseC/illico-app
3062a01 SPEC redesign statut
92c2ce5 Merge pull request #206 from AnneLiseC/chore/quick-wins-chantier
bc0952c QW4 Taux courtage/AMO : écriture DB au blur/Enter (plus par caractère)
fe93443 QW3 Libellé suppression chantier en constante partagée
2d344ac QW2 prenomAdmin défensif (order+limit avant maybeSingle)
e709568 QW1 Supprimer suiviAcompteAMO mort (chantiers/[id])
28a8a95 Merge branch 'main' of https://github.com/AnneLiseC/illico-app
265748c doc à jour sessions A à D
e5c6da0 Merge pull request #205 from AnneLiseC/feat/types-rdv
a617134 #10 Code : 3 nouveaux types de RDV (suivi, reception, etude)
a2a7d92 #10 SQL : étendre le CHECK rendez_vous.type_rdv (3 nouveaux types)
4093286 Merge pull request #204 from AnneLiseC/chore/drop-avancement-orpheline
d2473b7 chore DROP COLUMN dossiers.avancement (colonne orpheline)
5f7e3cd Merge pull request #203 from AnneLiseC/fix/espace-client-cr-realtime-avancement
5611fa4 #8 Realtime CR côté client (apparition sans refresh)
92043cf #9 Retirer la barre avancement morte (colonne jamais alimentée)
9fc14c5 Merge branch 'main' of https://github.com/AnneLiseC/illico-app
37ebc04 doc à jour
0ee864c Merge pull request #202 from AnneLiseC/fix/placeholder-cross-societe
7979f3f #7 Retirer le DELETE SQL du placeholder (bloqué par Supabase)
f1fadfe #7 Fermer la brèche placeholder cross-société + compléter storage_policies.sql
f06bb09 Merge pull request #201 from AnneLiseC/chore/versionner-policies-storage
04cf47b #5 Versionner les policies Storage live (réconcilier le repo obsolète)
15767f7 Merge pull request #200 from AnneLiseC/fix/rattrapage-couples-amo-legacy
982d7cb #4 Rattrapage data couples AMO legacy (AM-002, AM-009)
2d56011 Merge pull request #199 from AnneLiseC/fix/atomicite-conversions-amo
ac3c569 #3 Atomicité des conversions AMO↔courtage
adf0469 Merge branch 'main' of https://github.com/AnneLiseC/illico-app
e5c9f9c boussole a jour
ddfad72 Merge pull request #198 from AnneLiseC/fix/statut-chantier-devis
52b0d90 fix(statut): corriger la dérivation devis_a_modifier dans calcStatut
c533628 Merge branch 'main' of https://github.com/AnneLiseC/illico-app
1b34380 doc à jour 12/06
62086ec Merge pull request #197 from AnneLiseC/fix/k-atomicite-suivi-honoraires
7c21903 fix(chantier): toggle honoraires atomique via fonction Postgres (Lot K)
6e7ad64 Merge pull request #196 from AnneLiseC/fix/erreurs-avalees-espace-planning-artisans
0204a06 fix(artisans): capturer les erreurs avalées des écritures fiches/docs
608a7e3 fix(planning): capturer l'erreur de suppression RDV/intervention
6fdee53 fix(espace-client): erreur d'envoi de message visible par le client
49953e4 Merge pull request #195 from AnneLiseC/fix/erreurs-avalees-chantier-divers
c6347df fix(chantier): capturer les erreurs des écritures dossiers (taux + contrat)
b866d73 fix(chantier): retirer la feature morte pdf_path du CR manuel
da1cc94 fix(chantier): capturer les erreurs avalées des écritures non-financières
5efbe04 Merge pull request #194 from AnneLiseC/fix/erreurs-avalees-chantier-finances
2f0ae90 fix(chantier): capturer les erreurs avalées des écritures devis_artisans
1b63379 fix(chantier): capturer les erreurs avalées des écritures factures_artisans
e92c441 fix(chantier): capturer les erreurs avalées des écritures suivi_financier
f385f27 Merge pull request #193 from AnneLiseC/fix/cr-markdown-rendu
44d3e75 docs(sql): migration des 5 CR legacy (titres ## collés + indentation)
6f33025 feat(cr): côté agente — aperçu lisible + dépliable du CR rendu
c40f983 Merge pull request #192 from AnneLiseC/fix/cosmetique-espace-client-params
5da3f3a fix(parametres): retirer Google Drive des intégrations (bouton mort)
63b0cd9 Merge pull request #191 from AnneLiseC/chore/suppr-formulaire-devis-mort
0adfb07 Merge branch 'main' of https://github.com/AnneLiseC/illico-app
b77005f boussole à jour
b64b30e Merge pull request #190 from AnneLiseC/fix/finances-boutons-morts
43db86d fix(finances): retirer 4 boutons morts (CSV, ▼, Exporter le bilan, Saisir un règlement)
0eb07f4 boussole corrigé
052e670 Merge branch 'main' of https://github.com/AnneLiseC/illico-app
4c61869 doc à jour
f183014 Merge pull request #189 from AnneLiseC/fix/upsert-facture-reentrance
be7baa3 fix(finances): écriture robuste de upsertFactureMoisType (.error + 23505)
97ea172 Merge pull request #188 from AnneLiseC/feat/redevance-montant-agente
9f1b02a Garde-fou création profil client
4b1ab18 Merge branch 'main' of https://github.com/AnneLiseC/illico-app
f1c1169 doc 7 à jour
113da76 Merge pull request #131 from AnneLiseC/chore/harden-trigger-set-referente
6f40faf chore(sql): durcit set_dossier_referente_from_client (SECURITY DEFINER + search_path)
25d49d5 Merge pull request #130 from AnneLiseC/fix/upload-feedback-erreur
52977d5 fix(uploads): feedback utilisateur sur échec d'upload (6 sites, pattern ii)
a9a61a5 Merge pull request #129 from AnneLiseC/fix/code-mort-objet-purge-cr
8b1f2a8 fix: retire le code mort d.objet + purge le dossier Storage CR à la suppression
30f582a Merge pull request #128 from AnneLiseC/fix/upload-devis-reference-pendante
6c845e1 fix(chantiers): upload devis — plus de devis_pdf_path pendant si l'upload échoue
709a0f6 Merge pull request #127 from AnneLiseC/fix/l19-molette-input-number
f98f3f9 L19 ok
9a9825f fix(l19): neutralise le scroll-molette sur les <input type="number">
5e8a965 doc 7 à jour
1511ecd Merge pull request #126 from AnneLiseC/fix/fallback-marine-en-dur
fc8d550 fix(finances): fallback générique 'Moi' au lieu de 'Marine' en dur
456f1d4 Merge pull request #125 from AnneLiseC/refactor/rename-ismarine-isadmin
f658b46 refactor: renomme isMarine/estChantierMarine -> isAdmin/referentEstAdmin
9f5af46 Merge branch 'main' of https://github.com/AnneLiseC/illico-app
5838ab4 DROP factures_agente_backup_b7b
e3a0d1c Merge pull request #124 from AnneLiseC/fix/tva-travaux-vs-frais
aadad67 fix(finance): sépare TVA travaux (10%) et frais (20%)
f7e9e44 Merge pull request #123 from AnneLiseC/refactor/hygiene-constantes-finance
57a23b2 refactor(finance): constantes finance.js au lieu de hardcodes (chiffre-neutre)
fcf6828 Merge branch 'main' of https://github.com/AnneLiseC/illico-app
7152cc9 Dettes liées au chantier finances — CLOSES (04-05/06)
7ab762e Merge pull request #122 from AnneLiseC/fix/echeance-pas-de-date-si-non-regle
bfb1026 fix(chantiers): échéance non réglée = aucune date affichée (courtage, AMO, frais)
9d78eb0 Merge pull request #121 from AnneLiseC/fix/frais-statut-source-unique
c0e6545 fix(frais): dossiers.frais_statut = source unique du statut « frais payé »
11157d9 Merge pull request #120 from AnneLiseC/fix/toggle-deblocage-acompte-artisan-dates
01d568e fix(chantiers): toggle déblocage écrit date_deblocage + dates effacées au décoche
e002e0e Merge pull request #119 from AnneLiseC/fix/f2-apporteur-mode-total
b6e7138 fix(finances): F2 agrège l'apporteur en mode total_chantier_ht
ddf1af8 Merge pull request #118 from AnneLiseC/fix/toggle-apporteur-statut-ctp
1a2d0ac fix(chantiers): toggle apporteur écrit statut_ctp+date_paiement (visible en F2)
52eb7ab Merge pull request #117 from AnneLiseC/refactor/suppr-date-reglement-client-flux-artisan
1ff83df refactor(chantiers): retire date_reglement_client du flux artisan (colonne fantôme)
72b0b02 Merge pull request #116 from AnneLiseC/fix/toggle-date-paiement-suppression
acd447b fix(chantiers): affiche la date de règlement réelle sur le toggle honoraires
c0e2fc3 fix(chantiers): toggle honoraires date le règlement + supprime au décoche
bd979ea Merge branch 'main' of https://github.com/AnneLiseC/illico-app
a0ddaf1 Finances (B) — suppression `frais_deduits
0307e35 Merge pull request #115 from AnneLiseC/refactor/suppr-frais-deduits-code
b08c634 refactor(finances): retire frais_deduits du code (orphelin ancien modèle)
ff3b162 Merge pull request #114 from AnneLiseC/fix/finances-chargertout-erreurs
b8cb745 Finances (B) — chargerTout robustesse
1778c83 fix(finances): chargerTout remonte les erreurs au lieu d'afficher 0 €
48a9d15 Merge branch 'main' of https://github.com/AnneLiseC/illico-app
67c514b Finances (B) — fix double comptage honoraires AMO
1238193 Merge pull request #113 from AnneLiseC/fix/double-comptage-amo
96f6b96 fix(finances): supprime le double comptage des honoraires AMO
497aad9 Merge branch 'main' of https://github.com/AnneLiseC/illico-app
dcc714c recap pdf
3a85ee0 Merge pull request #112 from AnneLiseC/feat/recap-honoraires-partage
9a7ca1f recap honoraires PDF : composant partagé (source unique)
74bf469 Merge pull request #111 from AnneLiseC/feat/rebranch-recap-pdf
8940a1c rebranch du Recap PDF honoraires sur finance.js
b99f41e Finances (B) — finance.js : cœur honoraires paramétrable
2cee132 Merge pull request #110 from AnneLiseC/feat/finance-honoraires-base-parametrable
b31cfb1 finance: cœur honoraires paramétrable + base recu+accepte + brut (additif)
fdabbe5 Merge branch 'main' of https://github.com/AnneLiseC/illico-app
1c15e23 Merge pull request #109 from AnneLiseC/feat/rebranch-finance-filtres-royalties
719e66d filtres devis ok
028823c rebranch des filtres devis de finances/page.js sur finance.js
c43d63f Merge branch 'main' of https://github.com/AnneLiseC/illico-app
083e026 CORRECTION DETTES
66c9507 Merge pull request #108 from AnneLiseC/feat/rebranch-filtre-dashboard
106fc46 Finances (B) — dashboard rebranché
2a33ab5 rebranch du filtre devis du dashboard sur finance.js
981f660 Merge branch 'main' of https://github.com/AnneLiseC/illico-app
92e5a23 Finances (B) Étapes 5+6+7 — Honoraires + Récap + Persistance
ea73a41 Merge pull request #107 from AnneLiseC/feat/rebranch-honoraires-recap-chantier
338b1f2 rebranch honoraires + Récap chantier sur finance.js
d2ab289 Merge branch 'main' of https://github.com/AnneLiseC/illico-app
6c8c0b5 Finances (B) — préalables gros lot 5+6+7 terminés
1f3061b Merge pull request #106 from AnneLiseC/chore/clean-jadras-residus-sql
b62810a docs/sql: fichier de nettoyage des 4 résidus de toggle (dossier Jadras)
6162973 Merge branch 'main' of https://github.com/AnneLiseC/illico-app
```

---

## PARTIE B — SQL VERSIONNÉ (docs/sql) vs BASE RÉELLE

### B.1 — État de la base (chiffres, pg_catalog/information_schema)

| Objet (schéma public) | Nombre |
|---|---|
| Tables | 30 |
| Fonctions | 23 |
| Triggers (non internes) | 15 |
| Vues | 4 |
| Policies RLS | 45 |
| Migrations natives Supabase (supabase_migrations.schema_migrations) | 18 |

### B.2 — Fichiers docs/sql (96) → objet principal détecté (CREATE/ALTER/DROP)

> Extraction mécanique des instructions DDL. « (pas de DDL détecté) » = fichier de
> requête/seed/test/rattrapage (UPDATE/INSERT/SELECT), pas de création de structure.

- **2026-06-18_objectifs_ca_rls_durcissement.sql** — CREATE POLICY objectifs_ca_insert_agente ON public.objectifs_ca CREATE POLICY objectifs_ca_scope ON public.objectifs_ca�CREATE POLICY objectifs_ca_select ON public.objectifs_ca�CREATE POLICY objectifs_ca_update_agente ON public.objectifs_ca CREATE POLICY objectifs_ca_write_admin ON public.objectifs_ca
- **2026-06-20_c7_vue_devis_client.sql** — CREATE FUNCTION public.mes_dossiers_client CREATE VIEW�CREATE VIEW public.client_devis_acceptes�DROP FUNCTION IF EXISTS public.mes_dossiers_client() DROP VIEW IF EXISTS public.client_devis_acceptes
- **2026-06-21_c7_retrait_policy_cr_client.sql** — CREATE POLICY comptes_rendus_client_read ON public.comptes_rendus DROP POLICY comptes_rendus_client_read ON public.comptes_rendus
- **2026-06-21_c7_vue_cr_client.sql** — CREATE VIEW public.client_comptes_rendus DROP VIEW IF EXISTS public.client_comptes_rendus
- **2026-06-21_c7_vue_devis_ajout_a_devis_signe.sql** — CREATE VIEW public.client_devis_acceptes
- **2026-06-23_c7_messages_insert_role.sql** — CREATE POLICY messages_client_insert ON public.messages DROP POLICY messages_client_insert ON public.messages
- **2026-06-23_c7_messages_update_client.sql** — CREATE POLICY messages_client_update ON public.messages DROP POLICY messages_client_update ON public.messages
- **2026-06-23_c7_messages_update_trigger.sql** — CREATE FUNCTION public.messages_lock_columns CREATE TRIGGER messages_lock_columns_trg�DROP FUNCTION IF EXISTS public.messages_lock_columns()�DROP TRIGGER IF EXISTS messages_lock_columns_trg ON public.messages
- **2026-06-23_lot3_edition_message.sql** — ALTER public.messages DROP COLUMN edited_at CREATE FUNCTION public.messages_lock_columns�CREATE POLICY messages_client_update ON public.messages�DROP POLICY messages_client_update ON public.messages
- **2026-06-23_lot3_fix_trigger_nullsafe.sql** — CREATE FUNCTION public.messages_lock_columns
- **2026-06-24_agenda_scope_tenant.sql** — ALTER public.interventions_artisans DROP column if CREATE function public.agenda_derive_tenant�CREATE policy interventions_artisans_scope on public.interventions_artisans�CREATE policy rendez_vous_scope on public.rendez_vous CREATE trigger interventions_artisans_derive_tenant
- **2026-06-24_agenda_trigger_dossier.sql** — CREATE function public.agenda_derive_tenant
- **2026-06-24_cibles_calendrier.sql** — CREATE function public.cible_derive_societe CREATE policy cibles_select on public.cibles_calendrier�CREATE policy cibles_write on public.cibles_calendrier�CREATE table public.cibles_calendrier  CREATE trigger cibles_calendrier_derive_societe
- **2026-06-24_cibles_liaison.sql** — ALTER public.interventions_artisans DROP column if DROP column if exists cible_calendrier_defaut_id�DROP column if exists cible_id
- **2026-06-24_cibles_seed_martigues.sql** — (pas de DDL détecté — requête/seed/test)
- **2026-06-24_created_by.sql** — ALTER public.interventions_artisans DROP column if DROP column if exists CREATEd_by
- **2026-06-24_date_heure_utc.sql** — ALTER public.rendez_vous DROP column date_heure_old DROP COLUMN tant que le front (lecture + écriture) et le
- **2026-06-24_tranche3_expiration.sql** — ALTER public.dossiers ADD COLUMN acces_expire_le ALTER public.dossiers ADD COLUMN date_cloture�ALTER public.dossiers DROP COLUMN acces_expire_le�ALTER public.dossiers DROP COLUMN date_cloture ALTER public.profiles ADD COLUMN acces_actif
- **2026-06-24_tranche4b_expiration_rls.sql** — CREATE FUNCTION public.mes_dossiers_client CREATE FUNCTION public.mon_expiration_client�CREATE POLICY dossiers_client_read ON public.dossiers�CREATE POLICY dossiers_client_read ON public.dossiers FOR SELECT TO authenticated CREATE POLICY messages_client_insert ON public.messages
- **2026-06-24_tranche5_desactivation.sql** — CREATE FUNCTION public.desactiver_acces_expires DROP FUNCTION IF EXISTS public.desactiver_acces_expires()
- **2026-06-24_vues_client_agenda.sql** — CREATE view public.client_interventions CREATE view public.client_rendez_vous�DROP VIEW).�DROP view if exists public.client_interventions DROP view if exists public.client_rendez_vous
- **2026-06-26_repare_rdv_autres_titre.sql** — CREATE table public._backup_rdv_autres_titre_20260526 as DROP table public._backup_rdv_autres_titre_20260526
- **2026-06-29_access_token_nullable.sql** — ALTER public.comptes_oauth alter column access_token
- **2026-06-29_cibles_agenda_nom.sql** — ALTER public.cibles_calendrier DROP column agenda_nom ALTER public.cibles_calendrier add column if
- **2026-06-29_comptes_oauth.sql** — ALTER public.comptes_oauth DROP constraint comptes_oauth_user_fournisseur_key ALTER public.comptes_oauth DROP constraint google_tokens_user_id_key�ALTER public.comptes_oauth add constraint google_tokens_user_id_key�DROP column caldav_server, drop column caldav_password, drop column caldav_username, DROP column compte_email, drop column fournisseur
- **2026-06-29_rls_cibles_confidentialite.sql** — CREATE policy cibles_delete on public.cibles_calendrier CREATE policy cibles_insert on public.cibles_calendrier�CREATE policy cibles_select on public.cibles_calendrier�CREATE policy cibles_update on public.cibles_calendrier CREATE policy cibles_write on public.cibles_calendrier
- **2026-06-30_soft_delete_agente.sql** — ALTER public.profiles DROP column actif ALTER public.profiles add column if
- **2026-07-09_ts2_courtage_ts.sql** — CREATE function public.suivi_courtage_ts_upsert CREATE unique index suivi_financier_unique_sans_artisan�DROP function if exists public.suivi_courtage_ts_upsert(uuid, numeric)
- **A1_redevances_unicite_par_agente.sql** — ALTER public.redevances ADD CONSTRAINT redevances_mois_annee_key ALTER public.redevances DROP CONSTRAINT redevances_agente_annee_mois_unique
- **ADD_archive_clients_dossiers.sql** — ALTER dossiers DROP COLUMN IF CREATE FUNCTION propagate_client_archive�CREATE TRIGGER clients_propagate_archive�DROP COLUMN IF EXISTS archive DROP FUNCTION IF EXISTS propagate_client_archive()
- **B1_paiement_direct_partenaire.sql** — DROP COLUMN IF EXISTS paiement_direct, DROP COLUMN IF EXISTS partenaire
- **B2_taux_dossier.sql** — (pas de DDL détecté — requête/seed/test)
- **B5_ttc_fige.sql** — (pas de DDL détecté — requête/seed/test)
- **B6a_apporteur_actif.sql** — (pas de DDL détecté — requête/seed/test)
- **B7a_redevance_ht.sql** — ALTER public.profiles ALTER COLUMN redevance_mensuelle_ht ALTER public.redevances ALTER COLUMN montant_ht�DROP COLUMN) : seuls RENAME +
- **B7b_facturation_reset.sql** — CREATE TABLE IF NOT EXISTS public.factures_agente_backup_b7b AS DROP TABLE public.factures_agente_backup_b7b
- **B8a_redevances_trigger_drop_ttc.sql** — CREATE FUNCTION public.redevances_montant_protege CREATE FUNCTION suffit�DROP COLUMN redevances.montant_ttc (B8b)
- **B8b_drop_redevances_montant_ttc.sql** — ALTER public.redevances ADD COLUMN montant_ttc ALTER public.redevances DROP COLUMN montant_ttc�DROP COLUMN redevances.montant_ttc
- **B_cleanup_legacy_columns.sql** — ALTER public.devis_artisans DROP COLUMN IF DROP COLUMN IF EXISTS sans_royalties
- **CLEAN_jadras_residus_toggle.sql** — (pas de DDL détecté — requête/seed/test)
- **DROP_factures_agente_backup_b7b.sql** — DROP TABLE factures_agente_backup_b7b
- **FIX_cr_titres_colles.sql** — (pas de DDL détecté — requête/seed/test)
- **HARDEN_set_dossier_referente_from_client.sql** — CREATE FUNCTION set_dossier_referente_from_client
- **L10a_adresse_decomposee.sql** — ALTER public.agences ADD COLUMN IF ALTER public.agences DROP COLUMN IF
- **L5a-1_rls_profiles.sql** — CREATE FUNCTION public.profiles_protege_identite CREATE POLICY profiles_insert_own ON public.profiles�CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT WITH CHECK �CREATE POLICY profiles_select_all ON public.profiles FOR SELECT USING  CREATE POLICY profiles_select_scope ON public.profiles
- **L5a-2_rls_racines.sql** — CREATE POLICY "Insertion artisans" ON public.artisans FOR INSERT CREATE POLICY "Insertion clients" ON public.clients FOR INSERT�CREATE POLICY "Lecture artisans" ON public.artisans FOR SELECT�CREATE POLICY "Lecture clients" ON public.clients FOR SELECT CREATE POLICY "Modification artisans" ON public.artisans FOR UPDATE
- **L5a-3-fix_filles_finances_staff.sql** — CREATE POLICY devis_artisans_scope ON public.devis_artisans CREATE POLICY devis_artisans_scope ON public.devis_artisans FOR ALL TO authenticated�CREATE POLICY factures_artisans_scope ON public.factures_artisans�CREATE POLICY suivi_financier_scope ON public.suivi_financier DROP POLICY IF EXISTS devis_artisans_scope ON public.devis_artisans
- **L5a-3-mig_redevances_agence_id.sql** — ALTER public.redevances ALTER COLUMN agence_id ALTER public.redevances DROP COLUMN IF�CREATE INDEX redevances_agence_id_idx ON public.redevances 
- **L5a-3-rls_finances.sql** — CREATE FUNCTION public.redevances_montant_protege CREATE POLICY devis_artisans_scope ON public.devis_artisans�CREATE POLICY devis_artisans_staff ON public.devis_artisans FOR ALL�CREATE POLICY factures_agente_scope ON public.factures_agente CREATE POLICY factures_agente_staff ON public.factures_agente FOR ALL
- **L5b_rls_operationnelles.sql** — CREATE POLICY chantier_documents_scope ON public.chantier_documents CREATE POLICY chantier_fiches_techniques_scope ON public.chantier_fiches_techniques�CREATE POLICY comptes_rendus_client_read ON public.comptes_rendus�CREATE POLICY comptes_rendus_scope ON public.comptes_rendus CREATE POLICY interventions_artisans_scope ON public.interventions_artisans
- **L5c-B-fix_objectifs_ca.sql** — ALTER public.objectifs_ca ADD COLUMN agence_id ALTER public.objectifs_ca ADD COLUMN societe_id�ALTER public.objectifs_ca ALTER COLUMN agence_id�ALTER public.objectifs_ca ALTER COLUMN societe_id ALTER public.objectifs_ca DROP COLUMN IF
- **L5c_rls_transverses.sql** — CREATE POLICY artisans_specialites_scope ON public.artisans_specialites CREATE POLICY fiches_techniques_scope ON public.fiches_techniques�CREATE POLICY google_tokens_own ON public.google_tokens�CREATE POLICY messages_client_insert ON public.messages CREATE POLICY messages_client_read ON public.messages
- **L8_reference_par_agence.sql** — ALTER public.dossiers ADD CONSTRAINT dossiers_agence_reference_key ALTER public.dossiers ADD CONSTRAINT dossiers_reference_key�ALTER public.dossiers DROP CONSTRAINT IF�ALTER public.dossiers DROP CONSTRAINT dossiers_reference_key CREATE FUNCTION public.generer_reference_dossier
- **MT1_tables_societes_agences.sql** — CREATE INDEX agences_societe_id_idx CREATE TABLE public.agences �CREATE TABLE public.societes �CREATE UNIQUE INDEX agences_code_par_societe_uniq CREATE UNIQUE INDEX societes_siret_uniq
- **MT2_seed_et_colonnes.sql** — ALTER public.artisans DROP COLUMN IF ALTER public.dossiers DROP COLUMN IF�ALTER public.profiles DROP COLUMN IF�CREATE INDEX artisans_agence_id_idx ON public.artisans  CREATE INDEX clients_agence_id_idx ON public.clients 
- **MT3_backfill_notnull.sql** — ALTER public.artisans ALTER COLUMN agence_id ALTER public.dossiers ALTER COLUMN agence_id�ALTER public.profiles ALTER COLUMN societe_id
- **MT4_helpers_revoke.sql** — CREATE FUNCTION public.get_my_agence_id CREATE FUNCTION public.get_my_societe_id�DROP FUNCTION IF EXISTS public.get_my_agence_id()�DROP FUNCTION IF EXISTS public.get_my_societe_id()
- **MT5_policies_lecture_fondations.sql** — CREATE POLICY agences_select_ma_societe ON public.agences CREATE POLICY societes_select_la_mienne ON public.societes�DROP POLICY IF EXISTS agences_select_ma_societe ON public.agences�DROP POLICY IF EXISTS societes_select_la_mienne ON public.societes
- **MT6-3_policies_societe_id.sql** — CREATE POLICY artisans_scope ON public.artisans CREATE POLICY artisans_scope ON public.artisans FOR ALL TO authenticated�CREATE POLICY clients_scope ON public.clients�CREATE POLICY clients_scope ON public.clients FOR ALL TO authenticated CREATE POLICY dossiers_scope ON public.dossiers
- **MT6_societe_id_racines.sql** — ALTER public.redevances ADD COLUMN societe_id ALTER public.redevances ALTER COLUMN societe_id�ALTER public.redevances DROP COLUMN IF�CREATE FUNCTION public.derive_societe_id_from_agence CREATE INDEX artisans_societe_id_idx ON public.artisans 
- **MT7_artisans_societe_wide.sql** — ALTER public.artisans ADD COLUMN agence_id ALTER public.artisans ADD CONSTRAINT artisans_agence_id_fkey�ALTER public.artisans ALTER COLUMN agence_id�ALTER public.artisans DROP COLUMN IF ALTER public.artisans DROP CONSTRAINT IF
- **P0-2_messages_policies.sql** — CREATE POLICY client_insert_messages ON public.messages CREATE POLICY staff_all_messages ON public.messages�CREATE POLICY staff_delete_messages ON public.messages�CREATE POLICY staff_insert_messages ON public.messages CREATE POLICY staff_select_messages ON public.messages
- **P0-9_rls_scope_agente.sql** — CREATE FUNCTION public.redevances_montant_protege CREATE POLICY "Insertion devis artisans" ON public.devis_artisans FOR INSERT TO public�CREATE POLICY "Insertion dossiers" ON public.dossiers FOR INSERT TO public�CREATE POLICY "Insertion redevances" ON public.redevances FOR INSERT TO public CREATE POLICY "Insertion suivi financier" ON public.suivi_financier FOR INSERT TO public
- **add_categorie_facture_honoraire.sql** — (pas de DDL détecté — requête/seed/test)
- **add_pv_path_devis_artisans.sql** — ALTER public.devis_artisans DROP COLUMN IF
- **comparateur_simulations.sql** — CREATE INDEX IF NOT EXISTS comparateur_lignes_devis_artisan_id_idx CREATE INDEX IF NOT EXISTS comparateur_lignes_simulation_id_idx�CREATE INDEX IF NOT EXISTS comparateur_simulations_dossier_id_idx�CREATE POLICY "comparateur_lignes_scope" ON public.comparateur_lignes CREATE POLICY "comparateur_simulations_scope" ON public.comparateur_simulations
- **conversions_amo_courtage.sql** — CREATE FUNCTION public.convertir_dossier_en_amo CREATE FUNCTION public.convertir_dossier_en_courtage�DROP FUNCTION IF EXISTS public.convertir_dossier_en_amo(uuid, numeric)�DROP FUNCTION IF EXISTS public.convertir_dossier_en_courtage(uuid)
- **doc_categorie.sql** — ALTER public.chantier_documents DROP COLUMN IF ALTER public.chantier_documents DROP CONSTRAINT IF
- **drop_avancement_orpheline.sql** — ALTER dossiers ADD COLUMN avancement ALTER dossiers ADD CONSTRAINT dossiers_avancement_check�ALTER dossiers DROP COLUMN avancement�DROP COLUMN dossiers.avancement (orpheline) DROP COLUMN ne se rollback pas simplement. Les données
- **extend_type_rdv_check.sql** — ALTER rendez_vous ADD CONSTRAINT rendez_vous_type_rdv_check ALTER rendez_vous DROP CONSTRAINT rendez_vous_type_rdv_check
- **fix_dates_frais_ecrasees.sql** — (pas de DDL détecté — requête/seed/test)
- **fix_doublon_factures_agente.sql** — CREATE UNIQUE INDEX IF NOT EXISTS factures_agente_unique CREATE UNIQUE INDEX échouait 
- **fix_notifications_insert_policy.sql** — CREATE POLICY "Authenticated insert own notifications" DROP POLICY IF EXISTS "Service role inserts notifications" ON public.notifications
- **fix_placeholder_cross_societe.sql** — CREATE POLICY "Lecture documents" ON storage.objects CREATE POLICY "Lecture photos" ON storage.objects�CREATE POLICY "Suppression documents" ON storage.objects�CREATE POLICY "Suppression photos" ON storage.objects CREATE POLICY "Upload documents" ON storage.objects
- **garde_fou_profil_client_agence.sql** — CREATE FUNCTION public.profile_client_derive_agence CREATE TRIGGER profile_client_derive_agence_trg�DROP TRIGGER IF EXISTS profile_client_derive_agence_trg ON public.profiles
- **index_foreign_keys.sql** — CREATE INDEX IF NOT EXISTS idx_admin_invitations_user_id ON public.admin_invitations  CREATE INDEX IF NOT EXISTS idx_artisans_specialites_specialite_id ON public.artisans_specialites �CREATE INDEX IF NOT EXISTS idx_chantier_documents_dossier_id ON public.chantier_documents �CREATE INDEX IF NOT EXISTS idx_chantier_fiches_techniques_artisan_id ON public.chantier_fiches_techniques  CREATE INDEX IF NOT EXISTS idx_chantier_fiches_techniques_fiche_technique_id ON public.chantier_fiches_techniques 
- **k_suivi_toggle_honoraires.sql** — CREATE FUNCTION public.suivi_toggle_honoraires
- **l14b_3a_table_admin_invitations.sql** — CREATE TABLE public.admin_invitations  CREATE UNIQUE INDEX admin_invitations_email_en_attente_uniq�DROP TABLE public.admin_invitations
- **l14b_3c_fonction_onboarding.sql** — CREATE FUNCTION public.onboarding_create_societe DROP FUNCTION IF EXISTS public.onboarding_CREATE_societe(uuid,text,text,text,text,text,text,text,text,text,text,text)
- **l14b_migration_code_mar.sql** — (pas de DDL détecté — requête/seed/test)
- **l14b_nettoyage_doublon_unique.sql** — CREATE UNIQUE INDEX agences_code_par_societe_uniq ON public.agences 
- **l14b_trigger_code_agence.sql** — CREATE FUNCTION public.agences_generer_code CREATE TRIGGER agences_generer_code_trg�DROP FUNCTION IF EXISTS public.agences_generer_code()�DROP TRIGGER IF EXISTS agences_generer_code_trg ON public.agences
- **l14b_unique_agence_code.sql** — ALTER public.agences DROP CONSTRAINT agences_societe_code_unique
- **perf_rls_initplan.sql** — CREATE POLICY "Authenticated insert own notifications" ON public.notifications CREATE POLICY "Users mark own notifications read" ON public.notifications�CREATE POLICY "Users see own notifications" ON public.notifications�DROP POLICY IF EXISTS "Authenticated insert own notifications" ON public.notifications DROP POLICY IF EXISTS "Users mark own notifications read" ON public.notifications
- **profiles_verrou_champs_admin.sql** — CREATE FUNCTION public.profiles_protege_identite
- **rattrapage_couples_amo_legacy.sql** — CREATE TABLE public.backup_rattrapage_amo_legacy_20260615 AS DROP TABLE public.backup_rattrapage_amo_legacy_20260615
- **realtime_comptes_rendus.sql** — DROP TABLE comptes_rendus
- **regularisation_rdv_legacy_marine.sql** — (pas de DDL détecté — requête/seed/test)
- **retro_categorie_cr.sql** — (pas de DDL détecté — requête/seed/test)
- **revoke_execute_triggers.sql** — (pas de DDL détecté — requête/seed/test)
- **statut_check_strict.sql** — ALTER dossiers ADD CONSTRAINT dossiers_statut_check ALTER dossiers ADD CONSTRAINT dossiers_statut_manuel_check�ALTER dossiers ALTER COLUMN statut�ALTER dossiers DROP CONSTRAINT dossiers_statut_check ALTER dossiers DROP CONSTRAINT dossiers_statut_manuel_check
- **statut_rattrapage_null.sql** — CREATE TABLE public.backup_statut_rattrapage_20260615 AS DROP TABLE public.backup_statut_rattrapage_20260615
- **storage_policies.sql** — CREATE POLICY "Lecture documents" ON storage.objects CREATE POLICY "Lecture photos" ON storage.objects�CREATE POLICY "Remplacement factures agente" ON storage.objects�CREATE POLICY "Suppression documents" ON storage.objects CREATE POLICY "Suppression photos" ON storage.objects
- **test_c7_vue_cr_client.sql** — (pas de DDL détecté — requête/seed/test)
- **test_c7_vue_devis_client.sql** — (pas de DDL détecté — requête/seed/test)
- **test_objectifs_ca_rls.sql** — (pas de DDL détecté — requête/seed/test)

### B.3 — INVERSE : chaque objet de la base est-il cité dans un fichier docs/sql ?

Confrontation mécanique (grep du nom exact dans docs/sql/, fichiers test_* inclus).

- **Fonctions (23/23)** : toutes citées dans ≥1 fichier docs/sql. Aucune fonction sans trace fichier.
- **Vues (4/4)** : toutes citées (`client_comptes_rendus`, `client_devis_acceptes`, `client_interventions`, `client_rendez_vous`).
- **Triggers (15/15)** : tous cités dans ≥1 fichier.
- **Tables (30/30)** : toutes citées (au moins dans un ALTER/policy/index).
- **Policies (45/45)** : toutes citées par nom exact dans ≥1 fichier.

> ⚠️ « Cité » = le NOM apparaît dans un fichier (souvent un ALTER/policy tardif). Cela ne
> prouve PAS que la **création** de l'objet est versionnée — voir B.4.

### B.4 — Tables présentes en base SANS `CREATE TABLE` dans docs/sql (création NON versionnée ici)

Tables ayant un `CREATE TABLE` réel dans docs/sql (création versionnée) :
- `_backup_rdv_autres_titre_20260526`
- `admin_invitations`
- `agences`
- `backup_rattrapage_amo_legacy_20260615`
- `backup_statut_rattrapage_20260615`
- `cibles_calendrier`
- `comparateur_lignes`
- `comparateur_simulations`
- `factures_agente_backup_b7b`
- `societes`

Tables présentes en base **sans aucun `CREATE TABLE` dans docs/sql** (schéma d'origine créé
hors versionnement docs/sql — dashboard Supabase et/ou migration native) :
- `artisans`
- `artisans_specialites`
- `chantier_documents`
- `chantier_fiches_techniques`
- `clients`
- `comptes_oauth`
- `comptes_rendus`
- `devis_artisans`
- `dossiers`
- `factures_agente`
- `factures_artisans`
- `fiches_techniques`
- `interventions_artisans`
- `messages`
- `notifications`
- `objectifs_ca`
- `photos`
- `profiles`
- `redevances`
- `rendez_vous`
- `specialites`
- `suivi_financier`

> Parmi ces tables, `notifications` est créée par la migration native `create_notifications_table`
> (voir B.5) ; les autres préexistent au versionnement docs/sql (aucune trace de création nulle part
> dans le repo — leur structure d'origine n'est pas reconstructible depuis git/docs/sql).

### B.5 — Migrations natives Supabase (supabase_migrations.schema_migrations, 18)

Piste de versionnement PARALLÈLE à docs/sql (appliquée via Supabase CLI/dashboard). Ces objets
sont versionnés côté Supabase mais **n'ont pas de fichier dans docs/sql** :

| version | name |
|---|---|
| 20260423125607 | create_notifications_table |
| 20260511132450 | add_ordre_to_devis_artisans |
| 20260513144616 | add_email2_telephone2_to_clients |
| 20260515094746 | add_google_end_event_id_to_interventions |
| 20260515112103 | add_autres_to_type_rdv_check |
| 20260515120022 | add_titre_to_rendez_vous |
| 20260515124603 | add_heure_debut_duree_minutes_to_interventions_artisans |
| 20260515142953 | add_notes_to_clients |
| 20260520132938 | update_dossiers_statut_granular |
| 20260520133252 | remap_dossiers_statut_corrected |
| 20260520133340 | add_a_modifier_to_devis_artisans_statut |
| 20260520135038 | add_avancement_to_dossiers |
| 20260520144016 | add_notif_prefs_to_profiles |
| 20260520152008 | add_notif_canal_columns_to_profiles |
| 20260520195041 | dossier_inherit_referente_from_client |
| 20260520202147 | add_redevance_mensuelle_ttc_to_profiles |
| 20260521083619 | add_lieu_to_rdv_and_interventions |
| 20260521093221 | enable_realtime_messages |

**Colonnes/objets ajoutés UNIQUEMENT par migration native (versionnés hors docs/sql)** — déduits
des noms de migration : `devis_artisans.ordre`, `clients.email2`, `clients.telephone2`,
`clients.notes`, `interventions_artisans.google_end_event_id`, `interventions_artisans.heure_debut`,
`interventions_artisans.duree_minutes`, `rendez_vous.titre`, `profiles.notif_prefs`,
`profiles.notif_canal_*`, `profiles.redevance_mensuelle_ttc`, `rendez_vous.lieu`,
`interventions_artisans.lieu`, valeurs du check `rendez_vous.type_rdv` (autres),
valeurs du check `devis_artisans.statut` (a_modifier), granularité `dossiers.statut`, table `notifications`.
> Note : certains de ces sujets sont AUSSI retouchés plus tard par un fichier docs/sql
> (ex. `dossiers.statut` par `statut_check_strict.sql` ; `dossiers.avancement` par
> `drop_avancement_orpheline.sql` ; `type_rdv` par `extend_type_rdv_check.sql`) → double piste.

### B.6 — Divergences fichier ↔ base repérées (le fichier décrit un état différent de la base actuelle)

Faits bruts (itérations SQL successives : un fichier ancien peut décrire un objet renommé/supprimé depuis) :

- **`L5c_rls_transverses.sql`** crée une policy `google_tokens_own` sur `public.google_tokens` — la
  table en base est `comptes_oauth` (renommée depuis). Objet `google_tokens` **absent de la base**.
- **`P0-2_messages_policies.sql`** crée `client_insert_messages`, `staff_all_messages`,
  `staff_delete_messages`, `staff_insert_messages` — **aucune** de ces policies n'existe en base
  (les policies messages actuelles sont `messages_client_insert/read/update`, `messages_staff_scope`).
- **`L5a-1_rls_profiles.sql`** crée `profiles_select_all` — la base a `profiles_select_scope` (superseded).
- **`L5a-2_rls_racines.sql`** crée `"Lecture artisans"`, `"Insertion clients"`, etc. — la base a
  `artisans_scope`, `clients_scope` (policies renommées par MT6-3).
- **`P0-9_rls_scope_agente.sql`** crée des policies `"Insertion devis artisans"`, `"Insertion dossiers"`,
  `"Insertion redevances"` (TO public) — absentes en base (remplacées par les `*_scope`).
- **`storage_policies.sql`, `fix_placeholder_cross_societe.sql`** : policies sur `storage.objects`
  (schéma `storage`, hors périmètre de l'inventaire public — non confronté ici).

> Ces divergences sont NORMALES pour un versionnement par fichiers cumulatifs (chaque fichier = un
> état à un instant t, pas l'état final). Elles signifient : « présence d'un fichier » ≠ « le fichier
> décrit la base actuelle ». La reconstruction de l'état courant nécessiterait de rejouer tous les
> fichiers dans l'ordre, ce que cette collecte ne fait pas.

---

## PARTIE C — MÉTA : ce que cette méthode ne peut PAS voir

Limites structurelles de l'inventaire git + SQL (à garder en tête pour les phases suivantes) :

1. **Changements de comportement sans commit dédié** — une correction glissée dans un commit
   au sujet trompeur, ou un comportement modifié par un simple changement de valeur, n'apparaît
   pas comme tel dans `git log --oneline`. Le sujet du commit est déclaratif, pas prouvé.

2. **Réécritures en masse masquant l'historique** — les fichiers listés en A.3 (blobs base64,
   PDF, fonts, `package-lock.json`, et dans une moindre mesure `app/chantiers/[id]/page.js`)
   ont un diff illisible : un changement de logique noyé dans une régénération bulk est invisible.

3. **SQL appliqué en base puis rollback sans trace** — le MCP montre l'état INSTANTANÉ de la base.
   Un objet créé puis supprimé (ou un `BEGIN … ROLLBACK` d'essai) ne laisse aucune trace. Les
   fichiers `*_backup_*` et les tables `backup_*`/`_backup_*` en base sont les seuls indices de
   manipulations passées.

4. **SQL appliqué à la main jamais versionné NI en docs/sql NI en migration native** — indétectable
   au niveau colonne : le schéma d'origine (~21 tables préexistantes, B.4) n'a AUCUN fichier de
   création ; impossible de distinguer une colonne « d'origine » d'une colonne ajoutée à la main
   après coup sur ces tables. Seules les colonnes tracées par un `ADD COLUMN` docs/sql ou une
   migration native sont attribuables.

5. **Divergence fichier↔base non exhaustive** — B.6 liste les divergences repérées à l'œil sur les
   noms d'objets ; une divergence de CORPS (fonction dont le code en base diffère du dernier fichier,
   policy dont le `USING` a été édité en base) n'est pas détectée ici (comparaison de définitions non faite).

6. **Ordre d'application réel inconnu** — les fichiers docs/sql ne portent pas tous une date ; l'ordre
   dans lequel ils ont été réellement joués en base n'est pas reconstructible depuis le repo.

7. **Objets hors schéma `public`** — policies `storage.objects`, objets `auth.*`, réglages Realtime,
   Edge Functions, secrets : non inventoriés ici (périmètre limité au schéma public + migrations).

8. **Branches distantes supprimées** — une branche mergée puis supprimée côté remote n'apparaît plus
   dans `git branch -r` ; seuls subsistent son commit de merge sur main et ses commits (si non squashés).

---

*Fin de l'inventaire 01. Collecte brute, sans conclusion ni confrontation documentaire.*
