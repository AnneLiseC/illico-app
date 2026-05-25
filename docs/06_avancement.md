# Document 6 — Journal d'avancement

*Où on en est dans le chantier de correction. À rouvrir à chaque reprise. Le CDC (00) décrit la CIBLE ; ce fichier décrit l'ÉTAT RÉEL.*

**Nettoyage final colonnes legacy** ✅ fait, mergé, déployé, DROP appliqué
- `artisans.sans_royalties` (remplacée par paiement_direct + partenaire, Tâche 1) et `devis_artisans.part_agente` (le taux vit sur dossiers.part_agente, Tâche 2) : confirmées orphelines (aucune fonction/vue/policy/trigger, aucune lecture/écriture code après retrait des références).
- Ordre respecté : lot code (retrait 2 écritures + sans_royalties des 4 selects, paiement_direct/partenaire conservés) mergé + déployé en prod D'ABORD, puis SQL `B_cleanup_legacy_columns.sql` (contrôle AVANT + DROP COLUMN IF EXISTS + contrôle APRÈS = 0 ligne) appliqué main.
- Contrôle AVANT : divergence sur 1 artisan (sans_royalties=false / paiement_direct=true) = artisan de test ajouté après Tâche 1 via le nouveau code (ne sync plus sans_royalties) → sans impact (colonne non lue, donnée utile paiement_direct/partenaire correcte). Dette de transition Tâche 1/2 close.

**PERFORMANCE (hors périmètre Lot B au départ, fait suite à la lenteur ressentie)** ✅ fait, mergé, mesuré

**1. Mémoïsation page Finances** ✅ mergé
- Cause : `calculer`/`calculerReel` (recalcul complet finance.js) appelés ~100-300×/rendu, non mémoïsés, refaits à chaque changement d'onglet/scope/survol. Vraie cause de la lenteur de la page Finances.
- Correctif : `calculer`/`calculerReel` renommés `calculerBase`/`calculerReelBase` (verbatim, zéro changement de logique) ; cache `useMemo(Map<dossierId,{c,r}>, [dossiers])` ; wrappers de même nom lisent le cache. Zéro call site touché. Invalidation via `chargerTout()` (toute mutation → nouvelle réf `dossiers` → recalcul). Invariant noté dans le code.
- Validé : assertion temporaire « 0 écart » sur 7 dossiers (cache = calcul direct), montants identiques, réel bouge quand on coche un acompte, page fluide. Assertion retirée après validation.

**2. Embedding fiche chantier** ✅ mergé (commit `ae18c28`)
- Cause (diagnostiquée, pas supposée) : ouverture ~3-5s. Mesures réelles : RLS <1,5 ms/requête (jamais le goulot). Le vrai coût = 14 allers-retours PostgREST mis en FILE sur le pool de 11 connexions (escalier 300ms→1,8→2,8s = signature d'une file d'attente). Coût FIXE (un chantier vide ramait pareil), indépendant du volume.
- Correctif : passer de 14 requêtes (`Promise.all`) à 4 appels — 1 requête `dossiers` IMBRIQUÉE (embedding PostgREST : dossier + client + referente + 9 tables enfants en un seul select) + profil own + profil admin + artisans, puis `signerPhotos`. Mesure prototype : 15,6 ms SQL sur le plus gros dossier, ~1,5s navigateur observé (au lieu de ~3-5s).
- Parité stricte vérifiée (champs, relations nested, tris 1:1). Zéro régression finance.js confirmée (calculateDevisFinance ne lit `dossier` que via getPartAgente ; calculateDossierFinance/calculerAvancement override explicitement devis/suivi). `chargerPhotos` (refetch après upload) inchangé.
- Sécurité testée empiriquement : P0-9 tient sur l'embedding (dossier étranger → parent gaté → 0 enfant). DÉCOUVERTE au passage : tables OPÉRATIONNELLES (rdv, photos, CR, messages, interventions, docs, fiches) PAS cloisonnées par agente (lacune préexistante, pas causée par l'embedding qui la masque) → noté P0-9-bis dans 05.

**Dernière mise à jour : perf (mémoïsation Finances + embedding chantier) mergée. Cœur du Lot B terminé ; reste = facturation (vues F1/F2 + redevance) + lot sécurité P0-9-bis + dette.**

---

## Vue d'ensemble des lots

| Lot | Sujet | État |
|---|---|---|
| A | Sécurité | ✅ TERMINÉ, mergé, testé en prod |
| **B** | **Argent juste** | 🟢 CŒUR TERMINÉ (tous P0 + nettoyage + perf) ; reste FACTURATION |
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

## Lot B — Argent juste 🔄 EN COURS

### Fait et mergé

**Tâche 1 — Refonte `sans_royalties` → `paiement_direct` + `partenaire`** ✅
- La colonne `sans_royalties` faisait 3 boulots (paiement direct + royalties Type 1 + marqueur partenaire). Séparée en deux colonnes claires.
- `artisans.paiement_direct` (client paie en direct, pas de royalties Type 1, virement direct dans le cron).
- `artisans.partenaire` (on facture un % à l'entreprise ; cocher partenaire force paiement_direct).
- Migration : 5 entreprises réparties → 3 partenaires (HSH/Amandine, S&S, MARC) + 2 commission 0% (DECOGRANIT, SOLMAT).
- Cron `relances` bascule sur `paiement_direct`. Fiche artisan : 2 réglages (Paiement / Relation).
- `sans_royalties` conservée en base (transition, synchro `= paiement_direct`).
- SQL : `docs/sql/B1_paiement_direct_partenaire.sql`.

**Tâche 2 — Taux de partage au niveau dossier** ✅
- `dossiers.part_agente` (déjà existant, finance.js le lit déjà). Nettoyage du legacy `devis_artisans.part_agente`.
- BUG TROUVÉ ET CORRIGÉ : 5 dossiers de Marine avaient part_agente=0.5 (50%) au lieu de 0 (100%). Cause racine : `|| 0.5` qui écrasait le 0. Corrigé en `?? 0.5`.
- Sélecteur de taux à la création + édition depuis le dossier (déjà en place). Sélecteur retiré de la modale devis.
- SQL : `docs/sql/B2_taux_dossier.sql`.

**Tâche 3 — Affichage du détail des parts par devis** ✅
- Sous chaque devis : `Part [prénom agente] → X €` / `Part [prénom admin] → Y €`, lus depuis finance.js (jamais recalculés).
- Référent admin → aucune ligne de part (admin = 100% de son chantier), basé sur le RÔLE pas le nom.
- Exemple validé : Amandine 5175 HT, 10%, 50/50 → 245,81 / 245,81.

**ROYALTIES — clarification majeure** ✅
- Décision : royalties = **5% HT** (PAS de ×1,2). illiCO facture 5%+20%TVA=6%TTC mais TVA récupérée → coût net 5% HT.
- finance.js était DÉJÀ juste (×5%). C'est la documentation (Doc 4) qui avait un ×1,2 en trop — corrigée.
- ⚠️ Ne pas confondre avec le ÷1,2 des frais de consultation (reconstitution HT, à garder).

**P0-4 — Sélecteur d'acompte** ✅
- `|| 30` → `?? 30` sur 9 occurrences (un acompte 0 ne s'affiche plus à 30%).
- Option « Sans acompte » ajoutée au sélecteur inline. parseFloat du montant fixe sécurisé (plus de NaN).
- Acompte : -1 = montant fixe, 0 = sans acompte, 30/40 = pourcentage.

**P0-4bis — Avertissement doux acompte 0 + commission** ✅
- `window.confirm` non bloquant si : acompte 0 ET commission > 0 ET artisan NON partenaire.
- Branché sur les 2 chemins (modale + sélecteur inline). Partenaire → jamais d'avertissement.

### À faire (reste du Lot B)

**P0-5 — TTC figé dès saisie manuelle** ✅ (fait, mergé)
- Colonne `devis_artisans.ttc_manuel` (booléen). Migration B5 : 11 devis multi-taux/HT=TTC marqués manuels (dont correction d'une erreur de saisie : Toits du Midi avait la TVA 3225€ au lieu du TTC 61873€ → corrigé).
- TTC suit le HT en auto (×1,1) tant que non touché ; dès saisie manuelle du TTC → figé, le HT ne l'écrase plus jamais (création comme édition). Label conditionnel « auto +10% » / « figé ».
- TTC < HT : BLOCAGE (bandeau rouge persistant + bouton désactivé), pas d'alerte douce — TTC < HT est toujours une erreur. TTC = HT autorisé (partenaires). Remplace le window.confirm initial qui échouait en silence.
- SQL : `docs/sql/B5_ttc_fige.sql`.

- 🔄 **P0-6 — Apporteur (Kiosque).** EN COURS, découpé en A + B.
  - **Tâche A (structure)** ✅ faite, mergée : colonne `dossiers.apporteur_actif` (défaut false), interrupteur en ÉDITION + CRÉATION du chantier (visible si client a un apporteur, désactivé défaut, nom/%/mode lecture seule depuis le client, "taux à définir, coût non calculé" si % null). SQL `B6a_apporteur_actif.sql`. Option A retenue (tout false, réactivation manuelle des vrais chantiers Kiosque).
  - **Tâche B6b (calcul + bug de mode + affichages)** ✅ faite, testée au centime : calcul apporteur dans finance.js gaté sur `apporteur_actif` + taux défini (sinon 0, jamais NaN), base = signés hors commission 0%, deux versions prévi (signés) / réel (acomptes débloqués), partage part_agente sens inverse sans royalties. Bug de mode corrigé (`apporteur_base` + `total_chantier_ht`) → modes par-devis/total-chantier distincts (découpage des règlements voulu). Affichages basculés : badge "Partenaire" ambre sur vrais partenaires, aucun sur commission 0% ; "Paiement direct à l'entreprise" dans le suivi. Test validé sur Guerteau : prévi 1 814,55 € (1 088,73 / 725,82), réel suit les acomptes débloqués (décocher Esprit Cuisine fait baisser le réel). Bonus déterré : frais consultation prévi déduit maintenant les royalties (475 au lieu de 500).
  - **Reste apporteur (notés dans 05, après B6b)** : visu du détail apporteur PAR DEVIS (contrôle de la facture Kiosque) ; vue F1/F2 mensuelle (timing du remboursement) à traiter avec les vues de facturation détaillées.
**P0-7 — Parts admin après royalties (mode non-Marine)** ✅ vérifié, DÉJÀ OK (aucune correction)
- finance.js déduit les royalties Type 2 AVANT le split (`comHT → royalties → netCom → split(netCom, part_agente)`), donc symétrique : agente + admin = netCom dans tous les cas.
- Preuve : devis 7200 HT à 15%, 60/40 → admin = 410,40 (et non 432 qui serait le bug). 432 − 410,40 = 21,60 = 40% des royalties → l'admin supporte bien sa part. Idem mode Marine (100%). Comme le ×1,2 : bug supposé par l'audit, mais finance.js était déjà juste.
**P0-8 — KPI du suivi financier (fiche chantier) faux** ✅ fait, mergé, testé au centime
- Cause racine (pas Marine, UNIVERSEL) : `calculateDossierFinance` recevait un `dossier` SANS les devis (chargés dans un state séparé, jamais fusionnés) → tous les KPI dérivés des devis (commissions, honoraires, leurs royalties, net) à 0. Seuls les frais (sur le dossier) étaient comptés. Touchait TOUS les dossiers, repéré sur Marine par hasard.
- Correctif : passer `{ ...dossier, devis_artisans: devis, suivi_financier: suiviFinancier }` à finance.js (même motif que l'avancement).
- Filtrage « réel » (option b) cohérent sur les 3 flux : frais si `frais_statut='regle'` (sinon 0, « Offert » si offerts), commissions si acompte débloqué (`statut_illico='recu'`), honoraires par composant (courtage si `honoraires_courtage` réglé, AMO si `solde_amo` réglé). Net = nets − apporteur RÉEL (`partsReel`). Tout dynamique, zéro hardcode (royalties via `ROYALTIES_RATE`, sommes via `.reduce`).
- Validé au centime sur Guerteau : royalties 555,70 (frais 25 + commissions 331,60 + courtage 199,10), commissions 6 631,99, AMO solde exclu (en attente), chiffres bougent quand on coche/décoche les statuts. Marine : KPI réparés + « Offert ».
- NB : le bug supposé d'origine (royalties Marine à 0 en dur, ligne 480 page Finances) était un VRAI champ mort distinct — noté pour suppression au Lot E (piège futur si rebranché).
**P0-9 — Cloisonnement RLS par agente** ✅ fait, mergé, testé avec agentes de test
- Faille trouvée : RLS trop grossière (staff vs client, jamais par agente) → toute agente lisait TOUTES les données financières de toutes les agentes via l'API (le front ne faisait que masquer). Faille de confidentialité réelle.
- Correctif (SQL `P0-9_rls_scope_agente.sql`, appliqué main) : DROP des policies agente-larges + CREATE jeu propre par table. dossiers/factures_agente/redevances → admin OR ownership ; devis_artisans/suivi_financier/factures_artisans → admin OR dossier rattaché (referente_id). redevances : INSERT/DELETE admin only, SELECT/UPDATE ownership + TRIGGER qui protège le montant (l'agente ne change que le statut). Admin total par le RÔLE. Client préservé (`client_read_own_dossier`).
- Testé : agente de test ne voit que ses dossiers ; accès par URL directe à un dossier d'une autre → « chantier introuvable » (refusé au niveau base, pas masqué) ; agente garde le plein contrôle de SES données ; admin voit tout ; client voit son dossier.
- NB : cases de redevance non cliquables côté UI (handler absent, pas un bug RLS) → noté dans 05. 3 bonus sécurité (get_my_role anon, notifications WITH CHECK true, mots de passe) → noté pour durcissement séparé.
### État du Lot B (récap)

**TERMINÉ** : Tâches 1-2-3, royalties, P0-4/4bis/5/6/7/8/9, nettoyage legacy (sans_royalties + part_agente supprimées), + perf (mémoïsation Finances + embedding chantier).

**RESTE pour clôturer le Lot B — la FACTURATION** (la page la plus importante franchisée ↔ agents, on facture sur les montants de l'app) :
- [ ] **Toggle redevance** : brancher le clic sur les cases redevance mensuelle (UI absente ; RLS P0-9 déjà prête côté agente). Cadrer avec le workflow redevance (option B + automatisme éventuel).
- [ ] **Statuts F1/F2 cliquables** : aujourd'hui badges en lecture seule (le code qui les togglait est mort — `FacturationAgentePropre`/`renderFacturationMoisSuivi`). Rebrancher sur la vue active `FacturationAgentes`.
- [ ] **Fiabilité des montants F1/F2** : aujourd'hui snapshots figés (`factures_agente.montant`), jamais recalculés ; l'UI qui les régénérait est morte. À rebrancher sur finance.js (devenu peu coûteux grâce à la mémoïsation). ⚠️ vérifier d'abord comment les montants sont créés aujourd'hui (saisie admin ? import ?) pour ne pas écraser.
- [ ] **Détail apporteur par devis dans la facturation** (existe déjà sur la fiche chantier — confort).
- [ ] **Timing remboursement apporteur** dans F2 (facture Kiosque ~1 mois après déblocage).

**HORS Lot B — découvertes notées dans 05, à planifier en lots dédiés** : P0-9-bis (sécurité, tables opérationnelles), durcissement RLS (3 bonus + select-wrapping + index), Lot E (champ mort piégé, code mort facturation/devis, renommage isMarine/estChantierMarine), notif mail upload facture.

---

## Règles métier verrouillées (référence rapide)

- **Convention argent** : PARTENAIRE = entrant/gain (on facture un %) ; APPORTEUR = sortant/coût (Kiosque, on lui doit un %).
- **Royalties** = 5% HT, déduites avant le partage. Type 1 = informatif (jamais déduit).
- **Taux de partage** : choisi à la création du dossier parmi les taux de l'agente, figé sur le dossier, modifiable depuis le dossier.
- **Acompte** : la commission se prélève sur l'acompte (artisans classiques). Acompte 0 = pas de commission prélevée SAUF partenaire (facturé à part).
- **Matrice** : 30/15 (standard), 30/10 (partenaire), 30/0 et 0/0 (entreprise connue, comptée dans honoraires).
- **Admin référent** = 100% de son chantier (part_agente = 0). Distinction par RÔLE, jamais par nom.

---

## Méthode (rappel)

- Un lot validé = un merge. Un changement à la fois. Test au centime sur dossier réel avant merge.
- SQL livré en fichier (appliqué manuellement dans Supabase), jamais via MCP.
- `_design` intouchable. finance.js = source unique. Jamais de nom/id en dur.
- Points hors-périmètre notés dans `05_points_a_traiter.md`.