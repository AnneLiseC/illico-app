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