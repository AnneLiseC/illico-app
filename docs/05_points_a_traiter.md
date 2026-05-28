# Document 5 — Points à traiter (relevés pendant les tests)

*Liste vivante. Points découverts pendant les tests, non présents dans les MD initiaux. À traiter dans les lots indiqués. Cocher au fur et à mesure.*

> **Convention :** `[ ]` = à faire · `[x]` = fait. Les points faits sont conservés (trace de décision) tant qu'ils éclairent un point ouvert ; sinon ils peuvent être archivés en fin de doc.

---

## PRIORITAIRE — bloque l'usage

- [ ] **Reconnexion après invitation (Décision 1 incomplète).** Une agente invitée est connectée une fois mais n'a pas de mot de passe ; le lien d'invitation expire (otp_expired) → elle ne peut plus se reconnecter. **Manque l'étape « définir son mot de passe » après acceptation de l'invitation** (invitation → page choix mot de passe → reconnexion email + mot de passe ensuite). **Lot F, en tête.** Contournement temporaire : définir le mot de passe manuellement dans Supabase (Authentication → Users).

---

## LOT B FACTURATION — état et reste à faire

> Section centrale de la fin du Lot B. La facturation est la page la plus sensible (franchisée ↔ agentes, on facture sur les montants de l'app). Tout ce qui suit concerne `app/finances/page.js`, composant `FacturationAgentes`.

### Décisions métier verrouillées (référence — ne pas re-débattre)

- [x] **Modèle F1 / F2.** **F1** = `agente_vers_ctp` = l'agente facture CTP (frais + commissions + honoraires + part partenaire). Action AGENTE (et admin). **F2** = `ctp_vers_agente` = CTP facture l'agente (redevance HT + part apporteur). Action **ADMIN UNIQUEMENT** (c'est CTP qui constate la réception ; RLS `redevances_insert_admin` réservée admin — NE PAS la toucher). **(Verrouillé.)**
- [x] **Qui coche quel statut.** F1 = cliquable par l'agente ET l'admin ; F2 = cliquable par l'**ADMIN uniquement**. Côté agente, F2 = badge visible NON cliquable (pas un tiret, pas un bouton grisé : aucun chemin d'écriture). **(Verrouillé — appliqué en 3b-1.)**
- [x] **Sémantique du statut « reçu ».** = « l'argent a été REÇU par son destinataire » (à la réception, pas à l'émission). F1 reçu = l'agente a reçu ; F2 reçu = CTP a reçu. Label affiché « Reçu » ; valeur base inchangée (`'paye'`). **(Verrouillé.)**
- [x] **Apporteur = dette de l'agente ENVERS CTP.** CTP paie le Kiosque entier puis refacture à l'agente SA PART, en HT (pas le coût total). `montantF2 = redevance + part apporteur` (addition de deux dettes, flux agente → CTP). **(Verrouillé.)**
- [x] **Décalage temporel M−1 (UNIQUEMENT onglet Facturation agentes).** La facture du mois M porte sur l'activité du mois M−1. F1 février = activité janvier ; F2 février = redevance + apporteur de janvier. **Persistance P2** : on persiste / apparie / toggle sur le mois d'ACTIVITÉ ; seul le LIBELLÉ est décalé. `calcMois`/`agrégerParPaiement` NON modifiés (partagés CA réel / Suivi / Synthèse, restent datés activité). **(Verrouillé — appliqué.)**

### Séquence étape 3 (ordre verrouillé — état)

1. [x] **3a** — F1 cliquable + figement (option B `f1Eff`) + masquage 0 €. ✅ FAIT, mergé.
2. [x] **3b-1** — F2 cliquable ADMIN ONLY + figement (`f2Eff`) + label « Payé » → « Reçu » + masquage 0 €. Propagation `redevances` (CA réel net, Suivi CTP via `renderSuiviFinancier`, grille 12 mois + KPI redevances, tout en `montant_ht`). Testé EN BASE (clic F2 admin persiste ; agente non cliquable, plus de 403 RLS). ✅ FAIT, mergé.
3. [x] **3b-2** — retrait du statut `facture` : `StatutFacture` passe de 3 à 2 branches (`paye` / `a_facturer`) + découplage `uploadPdf` (n'écrit plus `statut:'facture'`, juste `facture_path`). ✅ FAIT, mergé.
4. [x] **Ménage code mort FINANCES** (zone finances/facturation uniquement, PAS tout le repo) : `royaltiesReelTotal` (champ piégé, valeur d'argent fausse à 0, voir Lot E ci-dessous) + orphelins `agentePeriod`/`setAgentePeriod` + audit grep des autres résidus de la zone. Audit/call-sites AVANT suppression (leçon : ne jamais qualifier « vivant/mort » sans grep call-site). NB : `renderSuiviAgenteFinancier` déjà supprimé (voir « faits »). ✅ FAIT, mergé (PR #73, 3 commits, ~175 l. supprimées — détail dans Doc 6).
5. [x] **DROP `redevances.montant_ttc`** : débloqué (le dernier porteur des `montant_ttc||540` était `renderSuiviAgenteFinancier`, supprimé). Re-grep tout le repo AVANT le DROP (`montant_ttc` légitime sur devis_artisans / suivi_financier / factures_artisans — NE PAS confondre). ✅ FAIT, appliqué en prod le 27 mai 2026 (B8a recréation trigger + B8b DROP COLUMN — détail dans Doc 6).

> ✅ **Séquence étape 3 TERMINÉE** — les 5 items faits (3a, 3b-1, 3b-2, remplacement PDF, ménage code mort, DROP `montant_ttc`). Seul `3a-bis` reste, parké en attente d'arbitrage avec Marine (voir « À arbitrer avec Marine »).

> Hors de cette séquence (autre zone, autre passe) : formulaire devis inline mort dans `chantiers/[id]`, renommage `isMarine`/`estChantierMarine` → ne PAS mélanger au ménage finances (Lot E).

### Chantier 2 — décalage M−1 dans la vue activité PROPRE de l'admin (à auditer)

- [ ] **Décalage redevance + apporteur dans la vue où l'admin voit SES propres chantiers.** Règle : l'activité propre de l'admin n'est PAS décalée (elle est la structure, argent dispo immédiatement), MAIS la redevance + l'apporteur qu'elle ENCAISSE des agentes (= la F2 des agentes) suivent le décalage M−1. **Écran à IDENTIFIER (probablement Suivi CTP ou vue admin du suivi — NON audité).** Auditer AVANT de coder (ne pas toucher à l'aveugle ; leçon `renderSuiviAgenteFinancier`). **(Lot B facturation — décalage cas 2.)**

### Vue agente du suivi financier (gros sujet de conception)

- [ ] **Construire la vue agente de l'onglet Suivi.** Aujourd'hui `renderSuiviFinancier` (2 modes agence/CTP, défaut CTP, sans garde de rôle) n'a PAS de vue agente — l'agente voit le compte de résultat CTP scopé (apporteur total, redevance en PRODUIT au lieu de charge, royalties affichées, + bug d'accès au mode CTP). À construire ; base = la vue agente ARCHIVÉE ci-dessous (ex-`renderSuiviAgenteFinancier`). Inclut le fix du bug d'accès (toggle mode CTP à réserver à l'admin). **(Lot B facturation — conception.)**

  **Spec archivée (ex-`renderSuiviAgenteFinancier`, supprimée du code, récupérable dans l'historique git) :** net agente = gains − redevance − part apporteur ; redevance en CHARGE (pas en produit) ; apporteur en part (pas coût total) ; royalties ABSENTES de la vue agente ; données `mesDossiers`/`mesRedevances` ; libellés à la 1ère personne. C'est la cible de la future vue agente.

### À corriger BIENTÔT (affichage selon le rôle/périmètre)

- [ ] **Dernière colonne des onglets Réel / Prévisionnel affiche « Marine » en dur** au lieu de s'adapter au périmètre sélectionné. Attendu : périmètre « Tous » = chiffres agence ; « Marine » = chiffres admin ; « Anne-Lise » = chiffres agente. Concerne l'affichage F1/F2 par mois ET par année, côté admin ET agente. Libellé/calcul en dur basé sur un nom (même famille de piège que `isMarine`/`estChantierMarine`). À corriger bientôt (pas Lot E lointain) car ça touche l'affichage financier réel. **(Lot B facturation — à corriger bientôt.)**

- [ ] **KPI « Net à virer à l'agente = F1 − F2 » trompeur.** F1 et F2 sont DEUX factures séparées, chacune émet et paie la sienne — il n'y a PAS de virement net unique. Le KPI laisse croire à un solde net à virer, ce qui ne correspond pas au flux réel (deux règlements distincts). À revoir (affichage KPI, pas le calcul). **(Lot B facturation — affichage KPI à revoir.)**

### Détail / confort (fin de lot facturation)

- [ ] **Détail par CHANTIER dans le dépliable de la facturation.** Aujourd'hui le détail mensuel dépliable montre la décomposition par FLUX (commissions, part partenaire, honoraires, redevance, apporteur) mais PAS quel dossier alimente chaque montant. Pour contrôler au centime, il faut voir que (ex.) les 245,81 € de part partenaire viennent de Jadras (2026-AM-001). La donnée existe déjà (`agrégerParPaiement` garde le `d.id` dans `addToKey`). À ajouter sans refonte. **(Lot B facturation — fin de lot.)**

- [ ] **Détail apporteur PAR DEVIS** (« ce que je dois au Kiosque par devis » : DAMIAN 524,34 / MJ 216 / ELEC 134,10 / P&M 280,47 / ESPRIT 659,64). Aujourd'hui l'onglet Finances montre le TOTAL apporteur, la facturation l'intègre aux factures (timing ~1 mois après déblocage acompte), mais nulle part le détail par devis. Anne-Lise en a besoin pour CONTRÔLER la facture du Kiosque à réception. À ajouter dans le suivi financier du chantier (une ligne de coût apporteur par devis signé éligible) — probablement avec les vues de facturation détaillées F1/F2. Fonctionnalité, pas un bug. **(Lot B facturation — après B6b.)**

- [ ] **Timing remboursement apporteur dans F2 (vue F1/F2 mensuelle/annuelle).** `apporteurRembourseNet` garde un axe distinct (basé sur une DATE de remboursement, pas sur « acompte débloqué »). Volontairement non migré en B6b car ça relève du TIMING de facturation (facture Kiosque ~1 mois après déblocage acompte). À traiter AVEC les vues de facturation détaillées F1/F2. Cohérent avec la décision : calcul du montant en B6b, timing de facturation séparé. **(Lot B facturation — vues facturation.)**

- [ ] **Grille « Redevances mensuelles » 12 mois — éventuellement relibeller en mois de facture.** Sous le décalage M−1 (P2), la grille reste datée sur le mois d'ACTIVITÉ (case JAN = redevance de janvier réglée) — factuellement correct. Mais incohérence visuelle possible : cliquer « reçu » sur la ligne « Février » coche la case « JAN ». À juger à l'écran ; laissée en mois d'activité pour l'instant. Si gênant → petit sujet séparé. **(Lot B facturation — à juger.)**

### Hygiène (après validation finale)

- [ ] **Supprimer la table de backup `factures_agente_backup_b7b`.** Créée par le SQL B7b (filet avant la remise à plat des 8 lignes). À dropper (`DROP TABLE public.factures_agente_backup_b7b;`) une fois les étapes facturation validées et certain de ne plus restaurer les anciens montants. **(Lot B facturation — hygiène.)**

---

## LOT B FACTURATION — faits cette session (trace)

- [x] **Étape 1 — redevance HT.** Bascule 540 TTC → 450 HT (paramètre `profiles.redevance_mensuelle_ht`, par agente, admin à NULL). Aucun défaut en dur. SQL `B7a_redevance_ht.sql`. **VÉRIFIÉ** : aucun affichage admin ne lit le PARAMÈTRE redevance au lieu des LIGNES encaissées — côté agente = ce qu'elle DOIT (paramètre) ; côté admin = ce qu'elle a ENCAISSÉ (lignes `redevances.montant_ht`). Les agrégats admin lisent bien les LIGNES ; les 2 lectures du paramètre portent sur `agenteActuelle`, jamais sur l'admin. Le null du paramètre admin est inerte. RÉSOLU.
- [x] **Reset B7b.** Remise à plat des 8 lignes `factures_agente` (`statut='a_facturer'`, `montant=NULL`) ; montants désormais calculés en LIVE par `agrégerParPaiement`. `facture_path` non touché. Backup `factures_agente_backup_b7b` créé. SQL `B7b_facturation_reset.sql`.
- [x] **Étape 2 — affichage live + détail dépliable par mois.** Montants F1/F2 calculés live, détail par flux dépliable.
- [x] **3a — F1 cliquable + figement (option B).** Statut cliquable (à facturer ↔ reçu), figement du live au clic, `montant:null` au déclic, helper `f1Eff` partout. Testé en base.
- [x] **Correction apporteur (part agente vs coût total)** — PR #65. BUG FINANCIER intercepté : `apporteurRembourseNet` utilisait `ligne.totalHT` (coût Kiosque ENTIER) au lieu de la part agente → F2 sur-facturait. Fix : DEUX champs distincts — `apporteurCoutTotalNet` (= `ligne.totalHT`, charge CTP) et `apporteurPartAgenteNet` (= part agente, dette agente/F2). `finance.js` était JUSTE (non touché). Validé : Guerteau coût total 1814,55 → part agente 1088,72 (split 60%).
- [x] **Suppression `renderSuiviAgenteFinancier`** (336 lignes, code mort confirmé sans call-site). Contenait les 8 `montant_ttc||540` → débloque le DROP `montant_ttc`. Logique métier ARCHIVÉE comme spec de la future vue agente (voir « Vue agente du suivi » ci-dessus). Leçon : toujours confirmer le call-site avant de qualifier « vivant/mort ».
- [x] **3b-1 — F2 cliquable ADMIN ONLY + figement + label « Reçu ».** Voir séquence étape 3. Testé en base (clic admin persiste ; agente non cliquable, plus de 403).
- [x] **Décalage temporel M−1 (chantier 1, P2).** Helper `shiftMoisKey` année-aware, lignes = mois de facture, données/appariement/toggle sur l'activité M−1, titres « Mois Année » + sous-titre « activité de [M−1] ». `calcMois`/`agrégerParPaiement` intouchés. Testé (sous-titres, pas de doublon, bord d'année).
- [x] **Fix 2 bugs redevance par mois** (mergé avec le décalage). **Bug 1 (fuseau)** : `calcMois` comparait `moisConcerne` (Date locale) à `debutRedev` (Date UTC) → la redevance du mois de début exact était exclue. Fix : comparaison au grain mois via entiers (`debutIndex` parsé depuis la CHAÎNE `redevance_debut`, zéro Date). **Bug 2 (mois creux)** : `months` ne couvrait pas les mois redevance-seule. Fix : `redevanceDueKeys` de `debutIndex` au mois courant inclus (rollover géré), mappés en mois de facture. Garde-fous null/début-futur OK. Testé EN BASE (redevance janvier réapparaît à 450 sur ligne février ; mois creux ont leur ligne ; clic→janvier en base + déclic→décoche janvier).
- [x] **Code mort facturation initial supprimé** (513 lignes) : `renderFacturationMoisSuivi`, `renderFacturationAnneeAgente`, `renderAgenteMoisAdmin`, `FacturationAgentePropre`, `upsertFactureMoisType` LOCAL mort, variables mortes (`totalRedevancesReglees`/`mesDossiersGainsPrevi`/`mesDossiersGainsReels`/`mesApporteurDu`/`mesRedevancesReglees`/`monNet`), état orphelin `factPeriod`/`setFactPeriod`. L'`upsertFactureMoisType` VIVANT (uploadPdf) conservé.

---

## Lot C / D — bugs pré-existants découverts

- [ ] **Devis avec TTC mais sans HT : message d'erreur « il manque le HT ».** Règle de validation de saisie (même famille que « création chantier sans client »). Le HT est obligatoire sur un devis. Découvert lors de P0-5. **(Lot C/D — validation)**
- [ ] **Création de chantier sans client possible.** On peut créer un chantier sans client associé → anormal. Ajouter une validation obligatoire du client. **(Lot C/D — intégrité)**
- [x] **Suppression chantier cassée : `column devis_artisans.pdf_path does not exist`.** Le code de suppression en cascade référence une colonne `pdf_path` inexistante. Bloque la suppression de chantier ET de clients. Lié à **P0-11** (cascade incomplète). Identifier le bon nom de colonne (ou retirer la référence) et reconstruire la cascade. **(Lot C — intégrité, à rattacher à P0-11)** ✅ FAIT, mergé (PR #77, branche `claude/fix-suppression-chantier`). Test au centième validé en preview le 27 mai 2026 (chantier de test complet : contrat AMO + 9 fichiers Storage + 10 tables filles → tout est parti, en base ET en Storage). Détail dans Doc 6.

---

## Lot D — confort / corrections fonctionnelles

- [ ] **Messagerie : aucun dossier AMO affiché.** Bug pré-existant : la page lit `clients.raison_sociale` (colonne cible, voir Doc 2). Brancher la lecture une fois la colonne créée.
- [ ] **Erreur Google « Cannot access 'n' before initialization »** au clic sur le bouton Google quand le calendrier est DÉJÀ connecté (cas limite ; la première connexion fonctionne).
- [ ] **Avancement du projet pas à jour côté client** (espace client). Vérifier le calcul/la source de la barre.
- [ ] **CR côté client : visible seulement après actualisation** (manque refetch temps réel après publication).
- [ ] **Source unique de libellé suppression chantier (anomalie hors scope P0-11).** Le libellé de suppression est dupliqué entre le `confirm()` (`app/chantiers/[id]/page.js`, ~l.1772) et le sous-titre du bouton « Supprimer le chantier » (~l.2502). Les deux ont été alignés sur la liste exhaustive dans le fix P0-11, mais une source unique de vérité (constante partagée) serait plus propre et éviterait une nouvelle divergence. Sujet séparé. **(Lot D — confort.)**
-  [ ] **Comptes-rendus — fonctionnalité PDF à compléter ou à clarifierÉtat actuel découvert lors du fix suppression chantier (mai 2026)** : La table comptes_rendus n'a aucune colonne pour stocker un chemin de fichier (vérifié information_schema.columns : colonnes existantes = id, dossier_id, auteur_id, type_visite, notes_brutes, contenu_ia, contenu_final, valide, date_visite, created_at). Le CR est donc stocké en colonnes texte uniquement. 
Mais le code app/chantiers/[id]/page.js:1334 tente d'écrire pdf_path sur comptes_rendus — soit cette écriture plante silencieusement, soit elle est dans une branche jamais exécutée. À auditer.
Conséquence dans le fix suppression chantier : on a exclu comptes_rendus du nettoyage Storage (rien à supprimer côté fichiers). Le CASCADE supprime les lignes en base, c'est tout.À décider :

(a) Garder les CR en texte pur (contenu_brut/ia/final), supprimer la l.1334 morte → simplification, aucune feature PDF.
(b) Ajouter la fonctionnalité PDF de CR : créer la colonne pdf_path en base, brancher l'upload, et inclure les CR dans le nettoyage Storage du fix suppression chantier (à compléter rétroactivement). Sujet de conception (génération du PDF côté client/serveur ? Template ?).
Lien avec autres sujets : à inclure dans l'audit code mort repo-wide de lib/finance.js qu'on a noté pour plus tard (l.1334 est code mort ou code latent à clarifier).
---

## Consignes IA — sujet dédié (ni Lot A ni B)

- [ ] **CR affiché en markdown brut** (`## 1. Identification…`, `**gras**`) côté agente et client. Rendre en mise en forme propre (markdown → HTML à l'affichage), ET revoir les consignes données à Claude pour la structure des CR.

---

## SÉCURITÉ — à planifier (lots dédiés, après le Lot B)

### P0-9-bis — cloisonner par agente les tables OPÉRATIONNELLES (lacune préexistante)

- [ ] Découvert pendant le diagnostic perf. P0-9 n'a cloisonné par agente QUE les tables financières. Les tables OPÉRATIONNELLES sont restées « staff voit tout » (`get_my_role() IN ('admin','agente')`), donc NON cloisonnées : `rendez_vous`, `interventions_artisans`, `photos`, `comptes_rendus`, `chantier_documents`, `chantier_fiches_techniques`, `messages`. **Testé empiriquement** : une agente requêtant en direct `rendez_vous?dossier_id=eq.X` d'un dossier d'une AUTRE agente récupère les données (rdv=1, photos=1 sur dossier admin, alors que devis/suivi/factures bien bloqués). Même classe de faille que P0-9. L'embedding MASQUE la lacune au chargement de la fiche chantier, mais NE FERME PAS la faille en base. À fermer : même pattern P0-9 (admin OR EXISTS(dossier WHERE referente_id=auth.uid())) sur ces 7 tables. **(SÉCURITÉ — à faire, pas une simple dette. À coupler avec le select-wrapping RLS.)**

### Durcissement RLS complémentaire (juste après P0-9, en bloc)

- [ ] **`get_my_role()` exécutable par `anon`** (SECURITY DEFINER exposée). À restreindre.
- [ ] **Policy INSERT `notifications` en `WITH CHECK (true)`** : n'importe qui peut insérer des notifications. À resserrer.
- [ ] **Protection « mots de passe compromis » désactivée** dans Supabase Auth. À activer.
- [ ] **Buckets Storage sans policy UPDATE** : `photos` a INSERT/SELECT/DELETE sans UPDATE (même trou que `documents` avant le fix factures). Si remplacement de photo voulu un jour → même bug (upsert refusé, échec silencieux), à corriger par une policy UPDATE ciblée.
- [ ] **Policies Storage non versionnées (dette infra)** : les policies du bucket `documents` (Lecture/Upload/Suppression) et celles des autres buckets vivent uniquement en base, pas dans le repo. Seule la policy UPDATE `factures_agente` est désormais consignée (`docs/sql/storage_policy_update_factures.sql`). À résorber : exporter/versionner toutes les policies Storage existantes pour reproductibilité.

---

## Optimisation BDD — dette d'hygiène (future-proofing, PAS urgent)

Relevés par l'advisor Supabase. NE SONT PAS la cause de la lenteur actuelle (à ce volume, mesuré <1,5 ms/requête ; vraie cause = allers-retours PostgREST, traitée par l'embedding). Utiles à partir de milliers de lignes — une passe d'optimisation BDD plus tard :
- [ ] **`auth_rls_initplan` (32×)** : `auth.uid()`/`get_my_role()` réévalués par ligne dans les policies P0-9. Correctif = encapsuler dans `(select get_my_role())` / `(select auth.uid())` → évalué une fois (InitPlan). Ne change PAS la logique de sécurité.
- [ ] **`multiple_permissive_policies` (51×)** : plusieurs policies permissives par table/action, toutes évaluées et OR-ées. À consolider.
- [ ] **`unindexed_foreign_keys` (29×)** : FK sans index (dont `devis_artisans.dossier_id`, `suivi_financier.dossier_id`). Ajouter les index = hygiène/échelle.

---

## Lot E — dette technique / nommage / code mort

- [ ] **Audit code mort `lib/finance.js` (repo-wide) — passe séparée.** `finance.js` est importé par plusieurs pages (`app/finances/page.js`, `app/page.js` dashboard, `app/chantiers/[id]/page.js`, `app/statistiques/page.js`…). Certains champs des objets retournés peuvent n'être lus nulle part (mort repo-wide), mais le ménage code mort FINANCES s'est STRICTEMENT limité à `page.js` + l'interne de `finance.js`. À faire en passe séparée : grep repo-wide de CHAQUE clé retournée par `finance.js`, en distinguant les clés vraiment mortes (jamais lues nulle part) des clés vivantes ailleurs que dans `page.js`. Pas urgent. **(Lot E — code mort.)**
- [ ] **Variables au nom trompeur basé sur "Marine"** — renommage en UNE passe globale. Recensées : `estChantierMarine` (chantiers/[id], finances, etc.) = `referente?.role === 'admin'` ; `isMarine` (finances/page.js) = test admin pour le sélecteur d'agente ; (grep global au moment du renommage pour les autres `...Marine`). Le COMPORTEMENT est correct (basé sur le rôle), le NOM évoque une personne → piège le jour d'un 2e admin. Renommer en `...Admin` / `referentEstAdmin` / `isAdmin`. **(Lot E.)**
- [ ] **Formulaire devis inline = code mort complet** dans `app/chantiers/[id]/page.js` : `nouveauDevis`, `ajouterDevis`, `setND`, `sauvegarderDevis` (~l.1106), `modifierDevis` (~l.1140), `devisEnEdition` — jamais rendus, jamais appelés. Le SEUL chemin actif est `DevisModal` + `saveDevisFromModal` (~l.1154, gère création ET édition). Les anciennes sont des vestiges d'avant la fusion. À supprimer en bloc (après vérif qu'aucune référence cachée ne subsiste). **(Lot E.)**
- [ ] **Cohérence de convention null sur la redevance.** Les lectures de LIGNE redevance gèrent le manquant en `|| 0` (compte comme 0), les affichages de PARAMÈTRE en `!= null ? … : 'à paramétrer'`. Deux conventions pour la même idée. Invisible aujourd'hui (montant 450, jamais null côté agente). À harmoniser. **(Lot E — dette.)**
- [ ] **Build local échoue sans `.env.local`** : les clients Supabase s'instancient à la collecte des routes. Fragile. À rendre plus robuste (instanciation paresseuse / lazy).
- [ ] **Handlers qui avalent les erreurs en silence** (`if (!res.ok) return`) : pattern à traquer ailleurs (corrigé pour le PDF côté client au Lot A). Toujours afficher un message d'erreur.

---

## Lot E / Design

- [ ] **Intégrations : masquer Supabase et Claude IA** dans la page paramètres (intégrations développeur, pas utilisateur).
- [ ] **Espace client : retirer les statuts « à contacter » et « à relancer »** (statuts internes).
- [ ] **Messages côté client : bulle grise à gauche** au lieu de bleue à droite (auteur inversé côté client).
- [ ] **Chantiers — résumé sans quitter la liste :** cliquer sur un chantier doit ouvrir le résumé EN RESTANT dans la liste (panneau latéral).

---

## Lot F — fonctions

- [ ] **CHANTIER PARAMÈTRES — réglage du MONTANT de redevance par agente.** Aujourd'hui Paramètres ne gère que la DATE de début ; le MONTANT n'est réglable nulle part (vivait en dur, supprimé en étape 1). À construire : champ « Redevance mensuelle (HT) » au formulaire agente (`app/parametres/page.js`) + transit dans `/api/create-agente` (destructure + updates + création) + écriture `profiles.redevance_mensuelle_ht`. Source de vérité = ce champ, jamais un littéral ; absent = « à paramétrer ». **Affichage : champ visible UNIQUEMENT pour les agentes, JAMAIS pour un admin** (admin encaisse, n'en doit aucune → paramètre à NULL). Ne bloque pas la clôture du Lot B. **(Lot F — fonction.)**
- [ ] **Cases de redevance mensuelle non cliquables côté agente.** La section « Redevances mensuelles » affiche des cases par mois mais le clic ne fait RIEN (handler absent, non branché). La RLS P0-9 autorise pourtant l'agente à cocher le statut de SA redevance (UPDATE, montant protégé par trigger). Il manque le branchement UI du clic → UPDATE. Vérifier aussi si l'admin peut cocher (peut-être cassé pour tous). À faire avec le cadrage du workflow redevance. **(Lot B / Fonctions.)**
- [ ] **Notification mail à l'upload de facture** (idée d'Anne-Lise) : agente upload F1 → mail à l'admin ; admin upload sa facture → mail à l'agente + redevance cochée des deux côtés ? À cadrer : déclencheur, destinataire, contenu, sens du « redevance cochée des deux côtés ». NB : la redevance est paramétrée (montant) par l'ADMIN ; elle fait partie de la facture du mois mais est séparée pour la visu. **(Fonctions / Lot F.)**
- [ ] **Automatisme de cochage de la redevance** : le statut « reçu » de la redevance pourrait-il se cocher automatiquement quand l'admin rentre sa facture du mois ? Workflow à définir, lié à la notification mail ci-dessus. **(Fonctions / Lot F.)**

---

## Horizon (section 10 du CDC — multi-franchise / mobile)

- [ ] **Connexion agenda multi-fournisseurs :** pour le multi-franchise, proposer d'autres calendriers que Google (Notion, Apple, etc.) selon le choix du franchisé.

---

## À arbitrer avec Marine (décisions métier en attente)

- [ ] **3a-bis — Alerte d'écart figé/live (à arbitrer avec Marine)** : badge ⚠️ qui signalerait un écart entre `f.montant` (figé au clic « Reçu ») et `calcMois().montantFx` (live), pour F1 et F2, sur les mois « Reçu » uniquement. Question métier : la fréquence des modifs post-figement (devis/commission/acompte modifié après que la facture est marquée « Reçu ») justifie-t-elle un filet de sécurité ? En théorie, l'activité d'un mois facturé ne devrait pas bouger. Blocage si on le fait seul : un badge non actionnable (il dit qu'il y a écart mais pas pourquoi) crée du bruit sans valeur — il faudrait coupler à une traçabilité des modifs post-figement, ce qui est un sujet plus large. Décision attendue : (a) on laisse tomber si Marine confirme que le cas est marginal ; (b) on fait juste le badge si visibilité minimale suffit ; (c) on conçoit un vrai système de traçabilité (gros sujet à part).

---

## Notes de vérification (acquis pendant le Lot A)

- Restriction PDF côté client : volontairement limitée au CR de son propre dossier. À confirmer qu'aucun autre document n'est nécessaire côté client (sinon élargir).
- Des chemins de code n'avaient jamais été exercés (ex. PDF de CR) → s'attendre à réveiller d'autres bugs dormants en testant les calculs financiers. Normal.

---

## Décisions / dettes SOLDÉES (trace, archivables plus tard)

- [x] **Dette legacy `sans_royalties` + `devis_artisans.part_agente`** : colonnes supprimées (DROP appliqué, voir Doc 6). Les deux points « à retirer en fin de Lot B » sont donc clos.
- [x] **Règle "acompte 0 force commission 0" : ABANDONNÉE** (ne vaut que pour les artisans circuit illiCO France ; pour un partenaire, acompte 0 + commission est légitime). Remplacée par **P0-4bis** (avertissement doux non bloquant) — fait, mergé.
- [x] **BUG RÉEL apporteur ne suit pas les acomptes débloqués** : corrigé en B6b (réel sur `partsReel`/`totalHTReel` ; décocher un acompte fait baisser le réel). Clos.
- [x] **Affichages financiers à basculer sur partenaire/paiement_direct** (badge « Apporteur » faux, ligne « illiCO France — acompte débloqué » fausse) : traités en B6b (badge « Partenaire » ambre sur vrais partenaires, aucun sur commission 0% ; « Paiement direct à l'entreprise » dans le suivi). Clos.
- [x] **KPI « Frais consult. HT » à 0 quand frais offerts** : à afficher « Offert ». Réglé avec P0-8 (« Offert » affiché). Clos.
- [x] **Bug `apporteurRembourseNet` (coût total vs part agente)** : corrigé (PR #65, deux champs distincts). Voir « faits cette session ». Clos.
- [x] **`renderSuiviAgenteFinancier` mort à supprimer** : supprimé (336 lignes). Logique archivée pour la future vue agente. Débloque le DROP `montant_ttc`. Clos.
- [x] **`royaltiesReelTotal: 0` (branche Marine de `calculerReel`) — champ mort PIÉGÉ qui codait 0 € en dur** : neutralisé par le ménage code mort FINANCES (voir Doc 6) — supprimé aux 3 sites (clé Marine, const, clé du retour ; 0 lecture, aucun effet d'affichage). Plus de risque de retomber à 0 royalties si rebranché un jour. Clos. *(était en Lot E, déplacé ici une fois résolu.)*