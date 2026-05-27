# Document 6 — Journal d'avancement

*Où on en est dans le chantier de correction. À rouvrir à chaque reprise. Le CDC (00) décrit la CIBLE ; ce fichier décrit l'ÉTAT RÉEL.*

**Dernière mise à jour : 27 mai 2026 — facturation Lot B bien avancée.** Faits récemment : redevance HT (B7a), reset B7b, étape 2 (affichage live + détail dépliable), 3a (F1 cliquable), correction apporteur (#65, bug financier), suppression `renderSuiviAgenteFinancier` (336 l.), 3b-1 (F2 admin-only), 3b-2 (retrait statut `facture`), décalage temporel M−1 (P2), fix 2 bugs redevance (fuseau + mois creux), ménage code mort FINANCES (PR #73, ~175 l.). Reste facturation : 3a-bis, chantier 2 (décalage vue admin), vue agente du suivi, DROP `montant_ttc`, détails/KPI. Puis lot sécurité P0-9-bis + dette.

---

## Vue d'ensemble des lots

| Lot | Sujet | État |
|---|---|---|
| A | Sécurité | ✅ TERMINÉ, mergé, testé en prod |
| **B** | **Argent juste** | 🟢 CŒUR TERMINÉ (tous P0 + nettoyage + perf) ; FACTURATION bien avancée (3a + 3b-1 + 3b-2 + décalage M−1 + fix redevance + ménage code mort faits ; reste 3a-bis, vues, DROP `montant_ttc`) |
| C | Intégrité (P0-3, P0-10, P0-11) | ⏳ à venir |
| D | Confort (P1) | ⏳ à venir |
| E | Dette technique (P2) | ⏳ à venir |
| F | Fonctions (prospects, reconnexion invitation, etc.) | ⏳ à venir |
| Design | Alignement sur la maquette `_design` | ⏳ après les corrections |

---

## Lot A — Sécurité ✅ TERMINÉ

Mergé et testé en production. Contenu :
- Authentification de toutes les routes API (P0-1) : helper `app/lib/api-auth.js` (serveur) + `api-auth-client.js` (client).
- `/api/create-agente` réservée admin (faille majeure fermée).
- `/api/cr`, `/api/pdf` (client restreint au CR de son dossier), routes Google Calendar : userId depuis la session.
- State OAuth Google signé (HMAC-SHA256 + nonce + exp 10 min).
- Policy `messages` (P0-2) : SQL `docs/sql/P0-2_messages_policies.sql` appliqué dans Supabase.
- Variable d'env `OAUTH_STATE_SECRET` ajoutée (Vercel + .env.local).
- Fix annexe : bug PDF `cr is not defined` (pré-existant) + affichage d'erreur PDF côté client.

---

## Lot B — Argent juste 🔄 EN COURS (cœur terminé, facturation en cours)

### Cœur du Lot B — fait et mergé

**Tâche 1 — Refonte `sans_royalties` → `paiement_direct` + `partenaire`** ✅
- La colonne `sans_royalties` faisait 3 boulots (paiement direct + royalties Type 1 + marqueur partenaire). Séparée en deux colonnes claires.
- `artisans.paiement_direct` (client paie en direct, pas de royalties Type 1, virement direct dans le cron).
- `artisans.partenaire` (on facture un % à l'entreprise ; cocher partenaire force paiement_direct).
- Migration : 5 entreprises réparties → 3 partenaires (HSH/Amandine, S&S, MARC) + 2 commission 0% (DECOGRANIT, SOLMAT).
- Cron `relances` bascule sur `paiement_direct`. Fiche artisan : 2 réglages (Paiement / Relation).
- SQL : `docs/sql/B1_paiement_direct_partenaire.sql`.

**Tâche 2 — Taux de partage au niveau dossier** ✅
- `dossiers.part_agente` (déjà existant, finance.js le lit déjà). Nettoyage du legacy `devis_artisans.part_agente`.
- BUG TROUVÉ ET CORRIGÉ : 5 dossiers de Marine avaient part_agente=0.5 au lieu de 0. Cause : `|| 0.5` qui écrasait le 0. Corrigé en `?? 0.5`.
- Sélecteur de taux à la création + édition depuis le dossier. Sélecteur retiré de la modale devis.
- SQL : `docs/sql/B2_taux_dossier.sql`.

**Tâche 3 — Affichage du détail des parts par devis** ✅
- Sous chaque devis : `Part [prénom agente] → X €` / `Part [prénom admin] → Y €`, lus depuis finance.js (jamais recalculés).
- Référent admin → aucune ligne de part (admin = 100% de son chantier), basé sur le RÔLE pas le nom.
- Exemple validé : Amandine 5175 HT, 10%, 50/50 → 245,81 / 245,81.

**ROYALTIES — clarification majeure** ✅
- Décision : royalties = **5% HT** (PAS de ×1,2). illiCO facture 5%+20%TVA=6%TTC mais TVA récupérée → coût net 5% HT.
- finance.js était DÉJÀ juste (×5%). C'est la doc (Doc 4) qui avait un ×1,2 en trop — corrigée.
- ⚠️ Ne pas confondre avec le ÷1,2 des frais de consultation (reconstitution HT, à garder).

**P0-4 — Sélecteur d'acompte** ✅
- `|| 30` → `?? 30` sur 9 occurrences (un acompte 0 ne s'affiche plus à 30%).
- Option « Sans acompte » ajoutée au sélecteur inline. parseFloat sécurisé (plus de NaN).
- Acompte : -1 = montant fixe, 0 = sans acompte, 30/40 = pourcentage.

**P0-4bis — Avertissement doux acompte 0 + commission** ✅
- `window.confirm` non bloquant si : acompte 0 ET commission > 0 ET artisan NON partenaire.
- Branché sur les 2 chemins (modale + sélecteur inline). Partenaire → jamais d'avertissement.
- Remplace la règle « acompte 0 force commission 0 » (ABANDONNÉE : casserait les partenaires).

**P0-5 — TTC figé dès saisie manuelle** ✅
- Colonne `devis_artisans.ttc_manuel`. Migration B5 : 11 devis multi-taux/HT=TTC marqués manuels (dont correction Toits du Midi : TVA 3225€ saisie au lieu du TTC 61873€).
- TTC suit le HT en auto (×1,1) tant que non touché ; dès saisie manuelle → figé, le HT ne l'écrase plus jamais. Label « auto +10% » / « figé ».
- TTC < HT : BLOCAGE (bandeau rouge + bouton désactivé). TTC = HT autorisé (partenaires).
- SQL : `docs/sql/B5_ttc_fige.sql`.

**P0-6 — Apporteur (Kiosque)** ✅ (A + B)
- **Tâche A (structure)** : colonne `dossiers.apporteur_actif` (défaut false), interrupteur en ÉDITION + CRÉATION (visible si client a un apporteur, nom/%/mode lecture seule depuis le client, « taux à définir » si % null). SQL `B6a_apporteur_actif.sql`. Option A retenue (tout false, réactivation manuelle).
- **Tâche B6b (calcul + bug de mode + affichages)** : calcul apporteur dans finance.js gaté sur `apporteur_actif` + taux défini (sinon 0, jamais NaN), base = signés hors commission 0%, prévi (signés) / réel (acomptes débloqués), partage part_agente sens inverse sans royalties. Bug de mode corrigé (`apporteur_base` + `total_chantier_ht` → modes par-devis/total-chantier distincts). Affichages basculés : badge « Partenaire » ambre sur vrais partenaires, aucun sur commission 0% ; « Paiement direct à l'entreprise » dans le suivi. Test Guerteau : prévi 1 814,55 € (1 088,73 / 725,82), réel suit les acomptes débloqués. Bonus : frais consultation prévi déduit maintenant les royalties (475 au lieu de 500).

**P0-7 — Parts admin après royalties (mode non-Marine)** ✅ vérifié, DÉJÀ OK
- finance.js déduit les royalties Type 2 AVANT le split → symétrique : agente + admin = netCom dans tous les cas.
- Preuve : devis 7200 HT à 15%, 60/40 → admin = 410,40 (et non 432). 432 − 410,40 = 21,60 = 40% des royalties → l'admin supporte sa part. Bug supposé par l'audit, mais finance.js était déjà juste.

**P0-8 — KPI du suivi financier (fiche chantier) faux** ✅
- Cause racine (UNIVERSELLE, pas Marine) : `calculateDossierFinance` recevait un `dossier` SANS les devis → tous les KPI dérivés des devis à 0. Seuls les frais étaient comptés.
- Correctif : passer `{ ...dossier, devis_artisans: devis, suivi_financier: suiviFinancier }` à finance.js.
- Filtrage « réel » cohérent sur les 3 flux : frais si réglé (« Offert » si offerts), commissions si acompte débloqué, honoraires par composant. Net = nets − apporteur RÉEL (`partsReel`). Zéro hardcode.
- Validé au centime sur Guerteau. Marine : KPI réparés + « Offert ».
- NB : le bug supposé d'origine (royalties Marine à 0 en dur, ~l.480 page Finances) est un VRAI champ mort distinct → noté pour suppression (piège futur si rebranché).

**P0-9 — Cloisonnement RLS par agente** ✅
- Faille : RLS trop grossière (staff vs client, jamais par agente) → toute agente lisait TOUTES les données financières via l'API (le front ne faisait que masquer).
- Correctif (SQL `P0-9_rls_scope_agente.sql`) : DROP des policies agente-larges + jeu propre par table. dossiers/factures_agente/redevances → admin OR ownership ; devis_artisans/suivi_financier/factures_artisans → admin OR dossier rattaché. redevances : INSERT/DELETE admin only, SELECT/UPDATE ownership + TRIGGER protégeant le montant (l'agente ne change que le statut). Admin total par le RÔLE. Client préservé.
- Testé : agente ne voit que ses dossiers ; URL directe d'un dossier d'une autre → « chantier introuvable » (refusé en base) ; admin voit tout ; client voit son dossier.
- NB : cases de redevance non cliquables côté UI (handler absent, pas un bug RLS) → noté dans 05. 3 bonus sécurité (get_my_role anon, notifications WITH CHECK true, mots de passe) → durcissement séparé.

**Nettoyage final colonnes legacy** ✅ fait, mergé, déployé, DROP appliqué
- `artisans.sans_royalties` (→ paiement_direct + partenaire) et `devis_artisans.part_agente` (→ dossiers.part_agente) : confirmées orphelines.
- Ordre respecté : lot code (retrait écritures + sans_royalties des selects) mergé + déployé en prod D'ABORD, puis SQL `B_cleanup_legacy_columns.sql` (contrôle AVANT + DROP IF EXISTS + contrôle APRÈS = 0) appliqué.
- Dette de transition Tâche 1/2 close.

**PERFORMANCE (hors périmètre initial, suite à la lenteur ressentie)** ✅ fait, mergé, mesuré
- **1. Mémoïsation page Finances** : `calculer`/`calculerReel` (recalcul complet, ~100-300×/rendu, non mémoïsés) renommés `calculerBase`/`calculerReelBase` (verbatim) ; cache `useMemo(Map<dossierId,{c,r}>, [dossiers])` ; wrappers de même nom lisent le cache. Zéro call site touché. Invalidation via `chargerTout()`. Validé (0 écart sur 7 dossiers, page fluide).
- **2. Embedding fiche chantier** (commit `ae18c28`) : ouverture ~3-5s. Vraie cause = 14 allers-retours PostgREST en FILE sur le pool de 11 connexions (coût FIXE, indépendant du volume ; RLS <1,5 ms/requête, jamais le goulot). Correctif : 14 requêtes → 4 appels (1 `dossiers` IMBRIQUÉE : dossier + client + referente + 9 enfants en un select + own + admin + artisans). Prototype : 15,6 ms SQL, ~1,5s navigateur. Parité stricte vérifiée, zéro régression finance.js. Sécurité : P0-9 tient sur l'embedding. DÉCOUVERTE : tables OPÉRATIONNELLES PAS cloisonnées par agente → P0-9-bis dans 05.

### Lot B — FACTURATION 🔄 en cours

> Page la plus sensible (franchisée ↔ agentes, on facture sur les montants de l'app). `app/finances/page.js`, composant `FacturationAgentes`.

**Cœur de l'étape 3 — terminé.** 3a (toggles F1 cliquables, figement, masquage 0 €), 3b-1 (F2 admin-only via RLS), 3b-2 (retrait statut `facture` + découplage upload PDF + gate synchro redevances), remplacement PDF (5 pièces : UI + extension + policy UPDATE Storage + bandeau erreur/succès + cache-buster). Reste **3a-bis** (alerte d'écart figé/live) en attente d'arbitrage métier avec Marine — voir Doc 5.

#### Décisions métier verrouillées
- **F1** = `agente_vers_ctp` (l'agente facture CTP : frais + commissions + honoraires + part partenaire) — action agente ET admin.
- **F2** = `ctp_vers_agente` (CTP facture l'agente : redevance HT + part apporteur) — action ADMIN UNIQUEMENT.
- **Statut « reçu »** = l'argent a été REÇU par son destinataire (F1 reçu = agente a reçu ; F2 reçu = CTP a reçu). Label « Reçu » ; valeur base `'paye'` inchangée.
- **Apporteur** = dette de l'agente envers CTP (CTP paie le Kiosque entier, refacture à l'agente SA PART en HT). `montantF2 = redevance + part apporteur`.
- **Décalage M−1** (onglet Facturation agentes uniquement) : facture du mois M = activité du mois M−1. Persistance **P2** : on persiste/apparie/toggle sur le mois d'ACTIVITÉ, seul le libellé est décalé. `calcMois`/`agrégerParPaiement` non modifiés.
- **F1 et F2 = deux factures séparées** (pas de virement net unique → KPI « Net à virer » trompeur, à revoir).

#### Fait et mergé (facturation)
- **Étape 1 — redevance HT** : bascule 540 TTC → 450 HT (`profiles.redevance_mensuelle_ht`, par agente, admin à NULL). SQL `B7a_redevance_ht.sql`. Vérifié : agrégats admin lisent les LIGNES `redevances.montant_ht`, pas le paramètre.
- **Reset B7b** : 8 lignes `factures_agente` remises à `a_facturer`/`montant=NULL` (montants désormais live via `agrégerParPaiement`). `facture_path` conservé. Backup `factures_agente_backup_b7b`. SQL `B7b_facturation_reset.sql`.
- **Étape 2 — affichage live + détail dépliable** par mois (décomposition par flux).
- **Code mort facturation supprimé** (513 lignes) : `renderFacturationMoisSuivi`, `renderFacturationAnneeAgente`, `renderAgenteMoisAdmin`, `FacturationAgentePropre`, `upsertFactureMoisType` local mort, variables mortes, `factPeriod`. `upsertFactureMoisType` vivant (uploadPdf) conservé.
- **3a — F1 cliquable + figement (option B)** : statut cliquable (à facturer ↔ reçu), figement du live au clic, `montant:null` au déclic, helper `f1Eff`. Testé en base.
- **Correction apporteur (PR #65)** — bug financier intercepté : `apporteurRembourseNet` utilisait le coût total Kiosque au lieu de la part agente → F2 sur-facturait. Fix : deux champs distincts `apporteurCoutTotalNet` (charge CTP) / `apporteurPartAgenteNet` (dette agente, F2). finance.js était juste (non touché). Validé Guerteau (1814,55 → part 1088,72).
- **Suppression `renderSuiviAgenteFinancier`** (336 lignes, code mort sans call-site) : portait les 8 `montant_ttc||540` → débloque le DROP `montant_ttc`. Logique archivée comme spec de la future vue agente (voir 05).
- **3b-1 — F2 cliquable ADMIN ONLY + figement + label « Reçu »** : `isMarine` gate le clic ; agente = badge non cliquable (plus de 403 RLS). Propagation `redevances` (CA réel net, Suivi CTP, grille 12 mois, KPI). Testé en base (clic admin persiste).
- **Décalage temporel M−1 (P2)** : helper `shiftMoisKey` année-aware, lignes = mois de facture, données/appariement/toggle sur l'activité M−1, titres « Mois Année » + sous-titre « activité de [M−1] ». `calcMois`/`agrégerParPaiement` intouchés.
- **Fix 2 bugs redevance** (avec le décalage) : bug fuseau (comparaison de date au mois de début, corrigée au grain mois via entiers, zéro Date) + bug mois creux (`months` ne couvrait pas les mois redevance-seule → `redevanceDueKeys` de debut au mois courant). Testé en base.
- **Remplacement PDF de facture (terminé)** — 5 pièces : (1) zone d'upload toujours visible + libellé adaptatif « Remplacer le PDF » ; (2) extension normalisée `.toLowerCase()` → chemin déterministe ; (3) cause racine : policy UPDATE Storage manquante sur le bucket `documents` → l'upsert ne pouvait pas écraser ; corrigée par policy UPDATE ciblée `factures_agente/` (voir `docs/sql/storage_policy_update_factures.sql`) ; (4) bandeau erreur/succès rendu dans l'onglet facturation + reset en tête d'`uploadPdf` (les échecs d'upload étaient silencieux) ; (5) cache-buster `&t=Date.now()` sur les 2 « Voir le PDF » (cache CDN 1h).

-  **3b-2** : `StatutFacture` 2 états (retrait du statut `facture`) + découplage `uploadPdf` (n'écrit plus `statut:'facture'`).
- **Ménage code mort FINANCES (terminé)** — PR #73, 3 commits sur `app/finances/page.js`, ~175 lignes supprimées, **0 chiffre changé** (le mort retiré n'avait aucune lecture, donc aucun montant ne pouvait bouger ; validé au centime sur Guerteau et Jadras en preview). (1) **9 morts évidents** : `royaltiesReelTotal` (le piège prioritaire — la branche Marine codait 0 € en dur), `agentePeriod`/`setAgentePeriod`, `CheckItem`, `majSuivi`, `renderMesPeriode`, `tabs`, `nomAgente`, `uploadingFactureAgente` (état write-only) + import `useRef` inutilisé + `const key` orphelin (conséquence mécanique). (2) **29 clés mortes** du retour de `calculerBase` + **3 clés mortes** du retour de `calculerReelBase` (const internes CONSERVÉS, alimentent `gainAgenteReel`). (3) **4 commentaires orphelins** (2 bandeaux de section + 2 groupeurs internes). Anti-leçon respectée : re-grep des call-sites avant chaque suppression ; faux-amis vérifiés (`dv.comTTC` épargné — disparu avec sa seule clé porteuse morte `comTTCSigne` ; `nomReferente`/`nomFranchisee`/`sfSousOngletCTP` intacts).

#### Reste (facturation) — détail dans 05
- [ ] **Chantier 2** : décalage M−1 redevance+apporteur dans la vue activité propre de l'admin (écran à identifier, à auditer).
- [ ] **Vue agente du suivi** (gros sujet de conception ; base = spec archivée de `renderSuiviAgenteFinancier`).
- [ ] **DROP `redevances.montant_ttc`** (re-grep tout le repo avant).
- [ ] **Détail par chantier** dans le dépliable ; **détail apporteur par devis** ; **timing remboursement apporteur** dans F2.
- [ ] **Colonne « Marine » en dur** (Réel/Prévisionnel) à adapter au périmètre ; **KPI « Net à virer »** trompeur à revoir.
- [ ] **Grille redevances 12 mois** : éventuellement relibeller en mois de facture (à juger à l'écran).
- [ ] **Hygiène** : dropper `factures_agente_backup_b7b` après validation.

### HORS Lot B — découvertes notées dans 05, à planifier en lots dédiés
P0-9-bis (sécurité, tables opérationnelles), durcissement RLS (3 bonus + select-wrapping + index), Lot E (code mort devis inline, renommage isMarine/estChantierMarine, audit `finance.js` repo-wide ; champ mort piégé `royaltiesReelTotal` neutralisé par le ménage code mort), notif mail upload facture.

---

## Règles métier verrouillées (référence rapide)

- **Convention argent** : PARTENAIRE = entrant/gain (on facture un %) ; APPORTEUR = sortant/coût (Kiosque, on lui doit un %).
- **Royalties** = 5% HT, déduites avant le partage. Type 1 = informatif (jamais déduit).
- **Taux de partage** : choisi à la création du dossier parmi les taux de l'agente, figé sur le dossier, modifiable depuis le dossier.
- **Acompte** : la commission se prélève sur l'acompte (artisans classiques). Acompte 0 = pas de commission prélevée SAUF partenaire (facturé à part).
- **Matrice** : 30/15 (standard), 30/10 (partenaire), 30/0 et 0/0 (entreprise connue, comptée dans honoraires).
- **Admin référent** = 100% de son chantier (part_agente = 0). Distinction par RÔLE, jamais par nom.
- **Facturation F1/F2** : F1 = agente→CTP, F2 = CTP→agente (admin only). Statut « reçu » = argent reçu par le destinataire. Décalage M−1 (facture mois M = activité M−1), persistance sur le mois d'activité (P2).

---

## Méthode (rappel)

- Un lot validé = un merge. Un changement à la fois. Test au centime sur dossier réel avant merge.
- Vérifier la persistance EN BASE (SELECT), jamais sur le seul affichage (leçon : 403 RLS silencieux + affichage optimiste).
- Relire le vrai diff, jamais le résumé de Claude Code (leçon : `months` doublé, annoncé conforme dans le résumé).
- Audit/call-sites AVANT de qualifier une fonction « vivante/morte ».
- SQL livré en fichier (appliqué manuellement dans Supabase), jamais via MCP. Contrôle AVANT/APRÈS + rollback.
- `_design` intouchable. finance.js = source unique. Jamais de nom/id en dur.
- Points hors-périmètre notés dans `05_points_a_traiter.md`.