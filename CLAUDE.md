# CLAUDE.md — Règles permanentes du projet illico-app

> Ce fichier est lu automatiquement par Claude Code à chaque session.
> Il définit les règles **non négociables** du projet. À respecter en toutes circonstances.

---

## 0. Avant toute chose — lire le contexte

Avant d'agir sur une tâche, **lis les documents de référence dans `/docs`** :

- `docs/00_CDC_v6.md` — cahier des charges (la cible à atteindre)
- `docs/01_carte_bugs.md` — les bugs classés P0/P1/P2 + décisions actées
- `docs/02_architecture_donnees.md` — les 23 tables, cible et écarts
- `docs/03_flux_parcours.md` — le parcours d'un dossier
- `docs/04_finance.md` — la logique financière exacte (source de vérité des calculs)

Ces documents priment sur toute supposition. En cas de doute, **demande avant d'agir**.

---

## 1. INTOUCHABLE — ne jamais supprimer ni modifier sans validation explicite

- **`app/_design/`** : c'est la **MAQUETTE DE RÉFÉRENCE VISUELLE**, pas du code mort.
  L'audit a pu la signaler comme « non importée / à supprimer » — **C'EST FAUX pour ce projet.**
  C'est le design cible de toute l'application. **NE JAMAIS la supprimer, la déplacer ou la modifier.**
  On s'en INSPIRE pour le design, on ne la touche pas.

- **`app/lib/finance.js`** : source de vérité des calculs financiers.
  Ne jamais modifier la logique de calcul sans validation explicite de l'utilisatrice.

- **`.env.local`**, **`.mcp.json`**, clés et secrets : ne jamais les lire, afficher ou commiter.

---

## 2. RÈGLE DE SÉQUENCE — un seul type de changement à la fois

**On corrige d'abord la logique (bugs), on aligne le design ENSUITE, dans un lot séparé.**

- Tant qu'on est sur les corrections fonctionnelles (Lots A→D) :
  **NE PAS modifier l'apparence des pages.** Corriger uniquement la logique, les calculs, la sécurité, les données.
- Si une correction impose un changement visuel minimal, le **signaler** et demander, ne pas l'imposer.
- L'alignement de toutes les pages sur la maquette `app/_design/` se fera dans un **lot dédié, plus tard**.

Objectif : quand le design bouge, ce doit être volontaire — jamais un effet de bord d'une correction de bug.

---

## 3. PRINCIPES D'INGÉNIERIE (cible CDC v6)

- **finance.js = source UNIQUE.** Les `page.js` appellent finance.js, ne recalculent jamais les montants localement. Supprimer toute réimplémentation de calcul hors de finance.js.
- **Zéro hardcode.** TVA honoraires, taux courtage/AMO/royalties, redevance (450 € HT), SIRET, etc. → toujours des valeurs paramétrables, jamais des littéraux dans le code.
- **Auth unique.** Se baser sur la personne authentifiée au login (source unique). Supprimer les fetch d'auth refaits dans chaque page.
- **TVA = couche de facturation uniquement.** Tous les partages agente/admin se calculent sur le **HT**, jamais sur le TTC.
- **Pas de suppression de fonctionnalité** sans le dire. Si du code semble mort, le signaler avant de supprimer (cf. règle 1).
- **JAMAIS de nom, prénom ou id en dur comme condition logique.** Toute distinction de comportement se fait sur le **rôle** (`role === 'admin'`, `role === 'agente'`, `role === 'client'`), jamais sur « Marine », « Anne-Lise » ou un id spécifique. L'app doit fonctionner à l'identique pour tout futur admin, toute future agente, tout futur client — c'est la base du multi-utilisateur et du multi-franchise. Si tu vois un nom/id en dur dans le code existant, signale-le.

---

## 4. DÉCISIONS DE CONCEPTION ACTÉES (détail dans `/docs`)

1. **Accès** : agentes/admin par invitation (mot de passe choisi par la personne) ; clients AMO par lien magique. Aucun mot de passe échangé en clair.
2. **Emails** : envoi via Gmail agence + `Reply-To` sur @illico-travaux.com (illiCO France bloque l'envoi natif).
3. **Double honoraire AMO** : taux standard 9% + taux remisé ; le client voit les DEUX.
4. **Apporteur (entrant) vs Partenaire (sortant)** : deux flux de sens inverse. Renommer « apporteur d'affaires » en « partenaire » dans le module artisan. Détail des calculs dans `docs/04_finance.md`.
5. **TTC devis** : pré-rempli HT×1,1 à la création, FIGÉ dès saisie manuelle, jamais recalculé ensuite.

Autres règles structurantes : prospect avant le client (statut léger), détection de doublon à la saisie (clients + artisans), 7 types de RDV (`rendez_vous.dossier_id` nullable), historique PDF artisan (`artisan_documents`), `agence_id` réservé partout (multi-franchise futur, non exploité).

---

## 5. MÉTHODE DE TRAVAIL

- Travailler **lot par lot**, dans l'ordre : A (sécurité) → B (argent) → C (intégrité) → D (confort) → E (dette) → F (fonctions). Ne pas mélanger les lots.
- Avant de modifier un fichier, **expliquer brièvement ce qui va changer et pourquoi.**
- Après chaque changement significatif, **vérifier que le build passe** (`npm run build`) et que rien d'autre n'est cassé.
- Préférer des **commits petits et ciblés** (un sujet = un commit), pour pouvoir revenir en arrière facilement.
- En cas de doute sur une règle métier (finance, partage, typologie), **demander** plutôt que supposer.

---

## 6. STACK

Next.js 16 (App Router, React 19) · Supabase (PostgreSQL + Auth + Storage, 23 tables, RLS) · Tailwind · Claude API · @react-pdf + pdf-lib · googleapis · Vercel.

Langue de travail et de communication : **français**.

## 7. SOBRIÉTÉ DU CODE — le minimum qui résout le problème

- Rien de spéculatif : pas de fonctionnalité au-delà du demandé, pas d'abstraction
  pour du code à usage unique, pas de « flexibilité » non requise, pas de gestion
  d'erreur pour des cas impossibles.
- Si une approche plus simple existe, le dire et la défendre, même si je n'ai pas demandé.
- Si plusieurs interprétations de ma demande existent, les exposer — ne pas en choisir
  une en silence.
- Test mental avant de livrer : « un ingénieur senior dirait-il que c'est sur-compliqué ? »
  Si oui, réécrire plus court.
- Critère de succès et vérification : `npm run build` passe + le comportement est
  conforme à `/docs`. Tant qu'il n'y a pas de tests automatisés dans le projet,
  ne pas en inventer pour « vérifier » — ne pas installer d'infra de test sans validation.

  ## 8. BUILD LOCAL — ne pas réinstaller les dépendances entre sessions
- Les `node_modules` ne sont pas persistés entre sessions Claude Code. Si `next` est
  introuvable ou que `npm run build` échoue pour cause de dépendances manquantes,
  **ne pas lancer `npm install` automatiquement** — l'install des dépendances génère
  un long log qui consomme inutilement des tokens à chaque session.
- À la place : signaler brièvement (« build skip : node_modules absent ») et continuer.
- La vérification primaire du build = Vercel à chaque push (preview), pas le build local.
  Le build local n'est qu'indicatif ; son absence ne bloque pas le travail.
- La vérification finale reste : (1) lecture du diff par Anne-Lise, (2) test à l'écran
  sur la preview Vercel après push, (3) vérification en base si pertinent.

  ## 9. CONSÉQUENCES MÉCANIQUES D'UNE SUPPRESSION
- Si retirer un symbole rend immédiatement orphelin un autre symbole (variable
  inutilisée, import devenu mort, paramètre jamais lu), traite-le dans le même
  commit, en le signalant clairement dans le message du commit.
- Si l'orphelin est ambigu (commentaire qui titre du vide, code qui peut avoir
  une autre raison d'être, fonction utilitaire potentiellement utile ailleurs)
  → demande avant de supprimer.
- Principe : différencier la conséquence mécanique évidente (`const key` qui
  n'est plus lu après retrait de son seul consommateur) du jugement éditorial
  (un commentaire qui pourrait servir de repère structurel).
## 10. CONVENTIONS & DÉCISIONS ACTÉES (sessions récentes)

**Finance — honoraires courtage/AMO (source : finance.js) :**
- `honoraires.courtage.ttc` = taux × travaux **TTC** ; `.ht` = taux × travaux **HT**.
  Le `.ttc` est LA valeur affichée partout (KPI, écritures suivi_financier, lignes
  « Autres échéances », honoraire client). **Ne jamais multiplier `.ttc` par 1,20**
  (double TVA). `soldeAmo.ttc` idem côté AMO ; solde AMO affiché = `honorairesAMO −
  honorairesCourtage`.
- Libellés corrects : « X % des travaux · MONTANT **TTC** » (surtout pas « travaux HT »).

**Base de données — 5 vérifs OBLIGATOIRES avant tout DROP :**
0 ligne de données + 0 réf. code + 0 réf. fonction/vue/policy/trigger + 0 FK entrante
+ feu vert explicite d'Anne-Lise. S'il en manque une → **seulement lister comme
candidat**, ne pas supprimer. « Vide » se prouve par un COUNT exact, jamais par
pg_stats/null_frac. (Erreur passée : colonnes annoncées vides à tort sur null_frac.)

**Deux systèmes de CR coexistent (ne pas confondre) :**
- CR narratifs (`comptes_rendus.contenu_final`, R1/R2/R3/suivi/réception) via
  CRGenerationModal + chantiers/[id]/page.js.
- Visites structurées (`actions`/`cr_actions`) via CRVisitesPanel.
Câblés : `auteur_id`, `visite_rdv_id` (+ push calendrier), `action_cibles.intervenant_id`,
`cr_presences`, versionnage (`parent_cr_id`/`version`, bouton « Nouvelle version »).

**Restitution PDF — PV de réception :** rattachement EXACT 1 devis = 1 PV via
`devis_artisans.pv_path` (upload par devis dans le sous-onglet Documents). Le PDF lit
`d.pv_path` et place le PV dans la section devis/factures, pas en fin de PDF. MERAD :
pas de kbis CTP. Même artisan sur plusieurs lots : kbis + assurance une seule fois.

**Spécialités artisan :** déduites par IA depuis la décennale (route
`/api/artisans/specialites/extract`), tables `specialites` + `artisans_specialites`.

**Git / déploiement :** Anne-Lise committe et push elle-même depuis son terminal
(`C:\Users\anne-\illico-app`). git via le pont Cowork échoue (identité + permissions
`.git/objects`) — ne pas s'en servir pour committer : préparer le diff, donner les lignes.
