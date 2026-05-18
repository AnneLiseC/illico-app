# Handoff — Refonte UI illiCO travaux Martigues

## Vue d'ensemble

Ce dossier contient la refonte design complète de l'application interne **illiCO travaux Martigues** : back-office d'une franchise de courtage en travaux qui gère ses chantiers, clients, artisans, devis et finances.

L'objectif de la refonte :
- Donner une identité visuelle propre et cohérente (palette bleu illiCO, dégradé sidebar, typographie Manrope).
- Réorganiser la densité d'information sans tout entasser sur une seule page.
- Couvrir tous les écrans existants (Dashboard, Chantiers, Clients, Artisans, Planning, Finances, Messagerie, Statistiques, Paramètres).
- Préparer une refonte du module **Finances** avec les vues F1 (prévisionnel) / F2 (réel) / Synthèse.

## À propos des fichiers fournis

> **Les fichiers HTML/JSX livrés ici sont des références de design** — des prototypes statiques qui illustrent l'apparence et le comportement attendus, **pas du code à copier-coller en production**.
>
> La tâche consiste à **reproduire ces écrans dans la codebase Next.js existante** (`illico-app/`) en utilisant ses patterns établis : App Router, Server Components, Tailwind v4, Supabase. Les couleurs, espacements, composants et interactions doivent être reproduits fidèlement, mais montés sur React/Next, pas sur Babel-standalone.

Le prototype tourne sur **React 18 + Babel standalone** (un seul fichier HTML qui charge des `.jsx` via `<script type="text/babel">`). Toute la donnée est **mockée** dans `src/data.jsx` ; il n'y a aucun appel Supabase ni routing réel.

## Fidélité

**Haute fidélité (hifi)** pour les surfaces critiques :
- Dashboard, Chantiers (liste + détail), Finances (3 onglets) — couleurs, typographie, espacements et interactions sont finaux.
- KPIs, badges de statut, tabs, sidebar collapsible — tokens définitifs.

**Moyenne fidélité** pour les écrans secondaires (Clients, Artisans, Planning, Messagerie, Statistiques, Paramètres) — la structure et le visuel sont arrêtés mais certaines interactions sont esquissées (sélection thread, filtres planning, etc.).

## Stack cible (existante)

Référence : `illico-app/package.json`
- **Framework** : Next.js 16 (App Router), React 19, Node.
- **Style** : Tailwind v4 (`@tailwindcss/postcss`), un fichier `globals.css` racine.
- **Données** : Supabase (`@supabase/supabase-js`) — voir `app/lib/supabase.js`, `app/lib/dossiers.js`, `app/lib/finance.js`.
- **Calendrier** : `@fullcalendar/*` déjà installé — à utiliser pour `Planning`.
- **Charts** : `chart.js` installé — les graphiques du prototype sont en SVG inline ; libre au dev de garder du SVG (plus léger, plus contrôlable) ou de basculer sur Chart.js.
- **PDF** : `@react-pdf/renderer` + `pdf-lib` (déjà utilisé pour les exports dossier).

## Tokens de design

À placer dans `globals.css` ou un fichier `tokens.css` importé en racine. Tous les composants du prototype dépendent de ces variables.

### Couleurs

```css
:root {
  /* Brand */
  --brand-900: #003d64;
  --brand-800: #00578e;   /* Bleu illiCO principal (texte, sidebar) */
  --brand-500: #0094d4;   /* Accent — boutons primaires, focus, badges */
  --brand-50:  #f0f7ff;   /* Survol de ligne, état sélectionné */

  /* Surface */
  --bg:        #f4f7fb;   /* Fond de l'app */
  --surface:   #ffffff;   /* Cartes */
  --surface-2: #f8fafc;   /* Headers de table, sous-cartes */

  /* Ink (typographie) */
  --ink-900: #0f2744;     /* Titres, montants */
  --ink-700: #334155;     /* Corps */
  --ink-500: #64748b;     /* Métadonnées */
  --ink-400: #94a3b8;     /* Placeholders, eyebrows */
  --ink-300: #cbd5e1;     /* Bordures inputs */
  --ink-200: #e2e8f0;     /* Bordures cartes, séparateurs */
  --ink-100: #eef2f7;     /* Lignes de tableau, fonds discrets */

  /* Sémantique */
  --ok:   #16a34a;        /* texte vert : #15803d sur fond clair */
  --warn: #f59e0b;        /* texte amber : #a16207 */
  --bad:  #dc2626;        /* texte rouge : #b91c1c */
  --info: #0094d4;
  --mute: #94a3b8;
}
```

### Typographie

- **Famille principale** : `Manrope` (poids 400/500/600/700/800) — depuis Google Fonts.
- **Famille monospace** : `JetBrains Mono` (poids 500/600) — pour références dossier (`M-2026-0184`), montants en €, codes.
- **Features OpenType** : `font-feature-settings: "ss01", "cv11"` sur le body, `"tnum"` (tabular-nums) sur tous les chiffres alignés.

| Usage              | Taille   | Weight | Color           |
|--------------------|----------|--------|-----------------|
| Page H1            | 24px     | 700    | --ink-900       |
| Page H2            | 18px     | 700    | --ink-900       |
| Carte titre        | 16px     | 700    | --ink-900       |
| Eyebrow / labels   | 11px     | 600    | --ink-400       |
| Corps              | 13-14px  | 500    | --ink-700       |
| Métadonnées        | 12px     | 500    | --ink-500       |
| KPI grand chiffre  | 36px     | 800    | --brand-800     |
| Bouton             | 13px     | 600    | varie           |
| Référence mono     | 11.5-12px| 700    | --brand-800     |

Eyebrows : `text-transform: uppercase; letter-spacing: 0.08em`.

### Espacement / radius / ombre

```css
--radius:    14px;   /* cartes principales */
--radius-sm: 10px;   /* boutons, inputs, badges grands */
--radius-xs: 8px;    /* petits éléments */

--shadow-card: 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,87,142,0.08);
--shadow-pop:  0 1px 2px rgba(0,0,0,0.04), 0 10px 30px rgba(0,87,142,0.14);
```

- Padding standard d'une carte : `padding: 20-22px` (hero) ou `14-18px` (rangée dense).
- Gap entre cartes dans une grille : `gap: 18-20px`.
- Padding de page : `28px 32px 60px`.
- Header sticky : hauteur `64px`, padding horizontal `28px`.
- Sidebar : `72px` collapsée, `240px` ouverte (transition 200ms cubic-bezier(.2,.7,.2,1)).

### Densité

Un attribut `data-density` sur `<body>` règle le padding vertical des rangées :
- `compact` → 10px
- `comfortable` → 14px (défaut)
- `cozy` → 18px

## Composants atomiques

Tous définis dans `src/shared.jsx`. À recréer en React/Next.

### `<Badge tone="ok|warn|bad|info|mute|brand">`
Pastille pleine avec point coloré. Tons :
- `ok` : fond `rgba(22,163,74,0.10)`, texte `#15803d`
- `warn` : fond `rgba(245,158,11,0.13)`, texte `#a16207`
- `bad` : fond `rgba(220,38,38,0.10)`, texte `#b91c1c`
- `info` : fond `rgba(0,148,212,0.12)`, texte `#0078ad`
- `mute` : fond `rgba(148,163,184,0.18)`, texte `#475569`
- `brand` : fond `rgba(0,87,142,0.10)`, texte `--brand-800`

### `<StatutBadge statut>` / `<TypoBadge typo>`
Wrappers qui mappent les valeurs métier (`devis_en_attente`, `amo`, etc.) vers Badge.

### `<Avatar name color size ring />`
Cercle initiales, couleur de fond paramétrable (provient de l'agente ou client).

### `<KpiCard label value sub tone icon trend />`
Carte chiffre clé. Avec :
- Coin décoratif triangulaire (SVG 80×80 `<path d="M0 0 L80 0 L80 80 Z" />`) en haut-droite, semi-transparent dans la couleur du `tone`.
- Icône 36×36 à droite (fond `rgba(0,87,142,0.08)`, couleur `--brand-800`, radius 10).
- Grand chiffre (`big-num` : 36px, weight 800, `--brand-800`, letter-spacing -0.02em).
- Trend optionnel sous la valeur (flèche + libellé, vert si up, rouge sinon).
- Tweakable globalement : `body[data-show-deco="0"]` masque les coins.

### `<Progress value tone height showLabel />`
Barre de progression `height: 6` par défaut, radius 99px. Tons auto selon valeur (`<40` bad, `<70` warn, `>=100` ok).

### `<MiniMeta icon mute>`
Texte de métadonnée inline avec icône 12px (`--ink-500` par défaut).

### Boutons

```css
.btn-primary { background: var(--brand-500); color:#fff;
  box-shadow: 0 1px 0 rgba(0,0,0,0.04), 0 4px 12px rgba(0,148,212,0.30);
  &:hover { background:#007fb8; transform: translateY(-1px); } }
.btn-ghost   { background: transparent; color: var(--ink-700);
  border: 1px solid var(--ink-200);
  &:hover { background: var(--surface-2); border-color: var(--ink-300); } }
.btn-dark    { background: var(--brand-800); color:#fff; }
```
Tous : `padding: 8px 14px`, `border-radius: 10px`, `font-size: 13px`, `font-weight: 600`, `transition: all 150ms ease`, `gap: 8px` pour icône+texte.

### Inputs

```css
.input {
  height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--ink-300);
  background: #fff;
  font-size: 13px;
  &:focus { border-color: var(--brand-500); box-shadow: 0 0 0 3px rgba(0,148,212,0.18); }
  &::placeholder { color: var(--ink-400); }
}
```

### Tabs

Sous-ligne 2px, couleur `--brand-800` active, sinon `--ink-500`.
```css
.tab { padding: 10px 14px; border-bottom: 2px solid transparent; font-weight: 600; }
.tab.active { color: var(--brand-800); border-bottom-color: var(--brand-800); }
```

## Layout global

`app/layout.js` à recomposer en grille 2 colonnes :

```
┌───────┬──────────────────────────────────────────────────────────┐
│       │ Header (64px, sticky, fond blanc, border-bottom)         │
│       │  · Breadcrumb illiCO Martigues › <Section>               │
│       │  · Search global avec raccourci ⌘K                        │
│       │  · Notifications · Mail · Avatar utilisateur              │
│Sidebar├──────────────────────────────────────────────────────────┤
│ 72px  │                                                          │
│       │  <Page content>                                          │
│       │   padding: 28px 32px 60px                                 │
│       │                                                          │
└───────┴──────────────────────────────────────────────────────────┘
```

### Sidebar (`src/Sidebar.jsx`)
- Largeur 72px collapsée ; **se déploie à 240px au survol** ; option « épinglée ouverte » (persistée).
- Fond par défaut : dégradé `linear-gradient(180deg, var(--brand-800) 0%, var(--brand-900) 100%)`.
- Logo block en haut : carré 32px blanc, lettres "iC" couleur `--brand-800`, weight 800.
- Sections (eyebrows blanches semi-transparentes) :
  - **Activité** : Tableau de bord, Chantiers (badge 9)
  - **Contacts** : Clients, Artisans
  - **Pilotage** : Planning (badge 3), Finances, Messagerie (badge 5), Statistiques
  - **Système** : Paramètres
- État actif : barre 3px blanche à gauche + fond `rgba(255,255,255,0.15)`.
- Badge fermé = pastille rouge en haut à droite de l'icône ; badge ouvert = pill blanche `var(--brand-500)`.
- User block en bas : avatar 34px blanc, nom + rôle « Franchisée · Martigues ».

### Header
- Breadcrumb : « illiCO Martigues › **<Section actuelle>** » (chevron `--ink-500`).
- Search 480px max, fond `--surface-2`, icône loupe à gauche, raccourci `⌘K` à droite (kbd style).
- Cluster droite : bell (avec dot rouge si notifs), mail, séparateur 1×24px, avatar dropdown utilisateur.

## Écrans détaillés

### 1. Dashboard (`src/Dashboard.jsx`)

Layout vertical en sections espacées de 24px :

1. **Welcome row** — date (eyebrow), `Bonjour Marine 👋` (28px/700), phrase de résumé inline (devis à relancer + RDV du jour). Actions à droite : `Exporter` (ghost), `Nouveau chantier` (primary).

2. **KPI grid** (4 colonnes, gap 16px, responsive → 2 cols à 1100px, 1 col à 560px) :
   - Chantiers en cours · tone brand · trend `+2 vs mois dernier`
   - Devis à relancer <7j · tone warn · sub = nombre en retard
   - CA du mois (réel) · tone ok · `<Progress>` vers objectif mensuel
   - CA cumulé 2026 · tone brand · `<Progress>` vers objectif annuel

3. **Grid principale** (`1.4fr 1fr`, gap 20px) :
   - **Gauche** :
     - Carte **À relancer cette semaine** — liste de 5 dossiers, chaque rangée = chip `J-X` ou `J+X` (rouge si retard, ambre sinon) + ref mono + nom + typologie + ville + date limite + avatar référente. Clic → ouvre le détail Chantier.
     - Carte **Chiffre d'affaires 2026** — barres SVG, dégradé `--brand-500` sur barre réel, gris `--ink-200` sur objectif, 5 lignes de grille horizontales, libellés mois sous chaque paire.
   - **Droite** :
     - Carte **Aujourd'hui** — timeline verticale, chaque RDV = heure mono + dot coloré (info/ok/warn/mute) avec ring blanc, ligne verticale 1px reliant les dots, label + sous-titre.
     - Carte **Pipeline** — barre segmentée 4 couleurs (à traiter / en devis / en chantier / terminés) puis légende grid 2×2 avec chiffres 18px/800.
     - Carte **Activité récente** — liste d'icônes 32px (fond `--brand-50`) + texte structuré « <who> <what> <ref mono> » + horodatage.

### 2. Chantiers (`src/Chantiers.jsx`)

1. **Header** — eyebrow « Pilotage », H1 « Chantiers », sub-info (compteurs filtrés).

2. **Tabs scope** : Mes chantiers / Chantiers Camille / Chantiers Sophie / Tous.

3. **KPI strip** — 4 cards : À traiter / En devis / En chantier / Terminés. Chiffre 28px/800 `--brand-800`, icône carrée 36px à droite avec tone correspondant.

4. **Barre de filtres** dans une carte : search + select statut + select typologie + bouton « Plus de filtres ».

5. **Grille 2 colonnes `1fr 420px`** (collapse en 1 col <1000px) :
   - **ChantiersList** : carte avec header (compteur + tri), liste scrollable de tuiles `padding:14px`, sélection = border `--brand-500` + fond `--brand-50` + glow `box-shadow: 0 0 0 3px rgba(0,148,212,0.10)`. Chaque tuile : ref mono + TypoBadge en haut, nom client (15px/700), ville, puis ligne du bas avec date limite (`J-X` coloré si urgent), montant TTC, avatar référente. Progress 4px en bas si avancement > 0.
   - **ChantierDetail** : header avec gradient corner en haut-droite, ref + typo + H2 client + adresse. Boutons `Ouvrir dossier` / `Appeler` / `Email` / menu kebab. Body scrollable :
     - Grid 2×2 FactRow : Surface, Montant chantier (highlight gros bleu), Contrat signé (✓ vert ou ✗ rouge), Référente (avatar+nom).
     - Descriptif (eyebrow + paragraphe).
     - Avancement avec progress 8px + dates démarrage/fin.
     - Liste des devis (artisans) avec carré icône marteau + nom entreprise + métier·ville + montant TTC + Badge statut.
     - Bloc « Suivi financier » fond `--surface-2`, grid 2×2 : Acomptes reçus/total + Progress, Factures payées/total + Progress, Frais consultation + Badge, Commissions prévues.
     - Contact (téléphone mono + email).

### 3. Finances (`src/Finances.jsx`)

1. Header avec sub-info année.

2. **Tabs F1 / F2 / Synthèse** — les onglets F1/F2 affichent un mini-tag mono « F1 » / « F2 » coloré en bleu foncé quand actif.

3. **KPI strip** : CA réel net 2026 + Progress objectif / CA prévisionnel / Commissions HT + frais conso / Part franchisée + part agentes.

4. **Sub-toolbar** (carte) — Vue (Par chantier / Par mois / Par année) en segmented control fond `--ink-100` padding 3, et Périmètre (Tous / Marine / agentes) idem.

5. **Synthèse** : grille `1.5fr 1fr` :
   - Grand graphique SVG **CA mensuel** — barres bleues réel + courbe pointillée prévisionnel + zone d'aire `rgba(0,148,212,0.06)`. Sous le graphique : 3 cards plates `--surface-2` avec total réel, total prévi, objectif.
   - **Donut** SVG 3 segments (commissions / frais conso / royalties) + légende détaillée avec montants et pourcentages.
   - **Performances par référente** : liste avec avatar + nom/rôle/nb dossiers + montant total à droite, séparateurs `--ink-100`.

6. **F1 / F2 tab** : tableau dense avec colonnes Dossier (ref+nom+TypoBadge) · Référente (avatar+prénom) · Statut · Frais HT · Commissions HT · Royalties (-X, dim) · Net (15px/800 brand) · Avancement (progress 80px + % mono) · action.
   - Ligne expandable au clic : `FinanceBreakdown` qui montre détail des devis acceptés (mini-table) + bloc répartition à droite avec frais/commissions/royalties/net/part franchisée/part agente.
   - `<tfoot>` avec totaux en gras 20px sur la colonne net.

### 4. Clients / Artisans / Planning / Messagerie / Statistiques / Paramètres

Détails dans `src/Stubs.jsx`. Points clés :

- **Clients** : grille de cards `auto-fill minmax(320px, 1fr)`. Chaque card = avatar 42px + nom + ville + tél/email + bloc bas avec nb dossiers et montant total.
- **Artisans** : table classique avec entreprise (icône marteau dans carré `--brand-50`) + métier + ville + nb devis + CA cumulé HT + action.
- **Planning** : grille `80px repeat(7, 1fr)` semaine. Colonne horaires 8h–17h (lignes de 50px). Événements absolus colorés selon catégorie. Jour courant teinté `rgba(0,148,212,0.03)`. À refaire en production avec **FullCalendar (vue `timeGridWeek`)** plutôt qu'en réinventant.
- **Messagerie** : split `320px 1fr`. Sidebar threads avec avatar + nom + date + dernier message + ref mono + badge unread. Conversation : header avec statut « En ligne », flux bulles `12px 12px 12px 4px` à gauche, `12px 12px 4px 12px` à droite (couleur brand), input bas + bouton Envoyer.
- **Statistiques** : 4 KPI + 2 cartes barres horizontales (typologies, sources d'apport).
- **Paramètres** : split nav 240px / contenu 28px. Nav avec border-left 3px sur item actif. Formulaires en grid 2 colonnes avec composant `<Field label>`.

## Données

Le prototype utilise un dataset mock dans `src/data.jsx` qui colle au schéma Supabase réel (voir `illico-app/app/lib/dossiers.js`).

### Entités clés

```ts
type Agente = { id, prenom, nom, role: 'admin'|'agente', initials, color };

type Statut =
  | 'a_contacter' | 'a_relancer'
  | 'devis_en_attente' | 'devis_a_modifier'
  | 'en_cours_chantier' | 'termine' | 'annule';

type Typologie =
  | 'courtage' | 'amo' | 'estimo' | 'merad'
  | 'audit_energetique' | 'studio_jardin';

type Dossier = {
  id, reference,                       // M-2026-0184
  client: { civilite, prenom, nom, adresse, tel, email },
  typologie: Typologie,
  referente: Agente,
  contrat_signe: bool, date_signature_contrat,
  date_demarrage_chantier, date_fin_chantier, date_limite_devis,
  frais_consultation, frais_statut: 'regle'|'en_attente'|'offerts',
  montant_chantier_ttc, description, surface,
  devis: Devis[],
  suivi: { acomptes_recus, acomptes_total, factures_payees, factures_total },
  avancement,                          // 0-100
};

type Devis = {
  id, artisan: { id, entreprise, metier, ville },
  statut: 'accepte'|'refuse'|'en_attente',
  montant_ttc, montant_ht,
  date_signature?, commission_pourcentage,
};
```

### Calculs financiers

Implémentés dans `src/Finances.jsx`, à reprendre :

```
commissionsHT = Σ (devis accepté · montant_ht × commission_pourcentage / 100)
fraisHT       = frais_consultation / 1.20
royalties     = (commissionsHT + fraisHT) × 0.32
previsionnel    = commissionsHT + fraisHT
previsionnelNet = previsionnel − royalties
reelPct = avancement >= 100 ? 1.0
         : frais_statut === 'regle' ? 0.3 + (acomptes_recus / acomptes_total) × 0.5
         : 0
reel    = previsionnel × reelPct
reelNet = reel × (1 − 0.32)
partAgente = referente.role === 'admin' ? 0 : 0.5
gainAgente = reelNet × partAgente
gainAdmin  = reelNet × (1 − partAgente)
```

⚠️ Confirmer ces formules avec Marine (la franchisée) avant production — c'est une approximation des règles métier illiCO France.

## Interactions & animations

- **Hover de ligne** : `background: var(--brand-50)` (transition 150ms).
- **Hover bouton primary** : décalage `translateY(-1px)` + assombrissement.
- **Page transitions** : `@keyframes fadeIn` (opacity 0 → 1 + translateY 4 → 0 en 240ms).
- **Sidebar collapse** : `transition: width 200ms cubic-bezier(.2,.7,.2,1)`. Les libellés et badges s'animent en opacity 150ms.
- **Progress fills** : `transition: width 400ms ease`.
- **Inputs focus** : ring 3px `rgba(0,148,212,0.18)`.

## Tweaks (panneau dev)

Le prototype expose 4 réglages via le panneau Tweaks (en haut à droite quand activé). À NE PAS porter en production — c'était pour itérer le design. Pour info :
- `sidebarPinned`, `sidebarStyle` (gradient / aplat / ardoise), `accent` (couleur primaire), `density` (compact / standard / aéré), `showDecorations` (arcs décoratifs sur les KPI).

Pour la prod, **garder les valeurs par défaut** : sidebar `gradient`, accent `#0094d4`, density `comfortable`, décorations on.

## Mapping écrans → routes Next.js existantes

| Prototype                    | Route existante                          |
|------------------------------|------------------------------------------|
| Dashboard                    | `app/dashboard/page.js`                  |
| Chantiers (liste + détail)   | `app/chantiers/page.js` + `[id]/page.js` |
| Clients                      | `app/clients/page.js` + `[id]/page.js`   |
| Artisans                     | `app/artisans/page.js` + `[id]/page.js`  |
| Planning                     | `app/planning/page.js`                   |
| Finances                     | `app/finances/page.js`                   |
| Messagerie                   | `app/messagerie/page.js`                 |
| Statistiques                 | `app/statistiques/page.js`               |
| Paramètres                   | `app/parametres/page.js`                 |
| Sidebar + header global      | `app/layout.js` + `app/components/navbar.js` (refonte) |

## Fichiers fournis

```
design_handoff_illico_redesign/
├── README.md                  ← ce fichier
└── prototype/
    ├── Illico Redesign.html   ← entry point
    ├── tweaks-panel.jsx       ← panneau dev (à ignorer en prod)
    └── src/
        ├── icons.jsx          ← icônes inline SVG (lucide-style)
        ├── data.jsx           ← mock data — colle au schéma Supabase
        ├── shared.jsx         ← Badge, Avatar, KpiCard, Progress, etc.
        ├── Sidebar.jsx
        ├── Dashboard.jsx
        ├── Chantiers.jsx
        ├── Finances.jsx
        ├── Stubs.jsx          ← Clients/Artisans/Planning/Messagerie/Statistiques/Paramètres
        └── App.jsx            ← shell + routing client + intégration Tweaks
```

Pour visualiser : ouvrir `prototype/Illico Redesign.html` dans un navigateur (aucune build nécessaire).

## Prochaines étapes recommandées

1. **Phase 1 — Design system** : porter les tokens (`globals.css`) + composants atomiques (`Badge`, `Avatar`, `KpiCard`, `Progress`, `Tabs`, `Button`, `Input`) en composants React partagés dans `app/components/ui/`.
2. **Phase 2 — Shell** : refondre `app/layout.js` et `navbar.js` → nouvelle sidebar + header. Garder le `auth-context.js` intact.
3. **Phase 3 — Pages prioritaires** : Dashboard → Chantiers (liste + détail) → Finances. Brancher sur les vraies queries Supabase de `app/lib/dossiers.js` et `app/lib/finance.js`.
4. **Phase 4 — Pages secondaires** : Clients, Artisans, Planning (FullCalendar), Messagerie, Statistiques, Paramètres.
5. **Phase 5 — Polish** : transitions, états vides, états de chargement, responsive mobile (le prototype est desktop-first ; mobile à designer si nécessaire).

## Notes finales

- Les icônes du prototype sont des SVG inline custom (style Lucide). En prod, utiliser **lucide-react** directement.
- Tous les chiffres affichés dans le prototype sont **mockés et plausibles** mais non basés sur de la vraie donnée. Ne pas s'en inspirer pour les objectifs métier.
- Le prototype n'a aucune logique d'auth, de permissions par rôle, ni de validation de formulaire — à brancher sur l'existant.
- Conserver la sémantique **Franchisée / Agente** (le rôle admin = la franchisée, qui voit tout ; les agentes voient leurs propres dossiers par défaut). Les filtres de scope dans Chantiers et Finances doivent respecter ça côté Supabase RLS.
