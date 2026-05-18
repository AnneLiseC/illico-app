# Refonte UI illiCO — Installation

Ce dossier contient la refonte visuelle complète à appliquer **par-dessus** ton `illico-app/app/` existant.

## Comment l'appliquer

1. Décompresse le zip.
2. **Sauvegarde ton dossier `illico-app/app/`** (git commit ou copie).
3. Copie le contenu de `redesign/app/` par-dessus ton `illico-app/app/`. Tous les fichiers présents écrasent ceux du même chemin. Les fichiers absents (par ex. `lib/`, `api/`, etc.) restent intacts.
4. `npm run dev` — c'est tout.

## Ce qui change

| Fichier | Modification |
|---|---|
| `globals.css` | Refonte complète — tokens, composants, utilities |
| `layout.js` | Nouveau shell avec `<Header>` global |
| `components/navbar.js` | Sidebar pixel-perfect (groupes Activité/Contacts/Pilotage/Système, badges, dégradé) |
| `components/header.js` | **Nouveau** — breadcrumb + recherche globale + cluster actions |
| `components/ui/*` | **Nouveau** — Badge, Avatar, KpiCard, Progress, StatutBadge, TypoBadge |
| `dashboard/page.js` | Refonte complète avec KPI réels Supabase |
| `chantiers/page.js` | Split list/detail, KPI strip, filtres améliorés |
| `finances/page.js` | Restructure F1 / F2 / Synthèse — toute la logique préservée |
| `clients/*` `artisans/*` `planning/*` `messagerie/*` `statistiques/*` `parametres/*` | Restyle |

## Ce qui ne change PAS

- `lib/` (dossiers.js, finance.js, auth-context.js, supabase.js, etc.) → 100% préservé.
- `api/` → pas touché.
- Tes pages **détail** (`chantiers/[id]/`, `clients/[id]/`, etc.) → seul le shell layout impacte le rendu.
- Toute la logique métier, les requêtes Supabase, les actions, la facturation.

## Notes

- La police principale est désormais **Manrope** (chargée via `next/font/google` dans `layout.js`). Tu peux garder Geist en mono.
- Le Dashboard utilise les vraies données Supabase (chantiers, devis, profile).
- Le module Finances garde toutes ses actions (calculer / calculerReel / majSuivi / objectifs / factures agente / redevances) — seul le shell et la présentation changent.
