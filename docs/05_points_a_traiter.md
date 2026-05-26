# Document 5 — Points à traiter (relevés pendant les tests)

*Liste vivante. Points découverts pendant les tests du Lot A, non présents dans les MD initiaux. À traiter dans les lots indiqués. Cocher au fur et à mesure.*

---

## PRIORITAIRE — bloque l'usage

- [ ] **Reconnexion après invitation (Décision 1 incomplète).** Une agente invitée est connectée une fois mais n'a pas de mot de passe ; le lien d'invitation expire (otp_expired) → elle ne peut plus se reconnecter. **Manque l'étape « définir son mot de passe » après acceptation de l'invitation** (invitation → page choix mot de passe → reconnexion email + mot de passe ensuite). **Lot F, en tête.** Contournement temporaire : définir le mot de passe manuellement dans Supabase (Authentication → Users).

---

## Lot D — confort / corrections fonctionnelles

- [ ] **Messagerie : aucun dossier AMO affiché.** Bug pré-existant : la page lit `clients.raison_sociale` (colonne ajoutée en cible, voir Doc 2). Brancher correctement la lecture une fois la colonne créée.
- [ ] **Erreur Google « Cannot access 'n' before initialization »** au clic sur le bouton Google quand le calendrier est DÉJÀ connecté (cas limite ; la première connexion fonctionne). À corriger.
- [ ] **Avancement du projet pas à jour côté client** (espace client). Vérifier le calcul/la source de la barre d'avancement.
- [ ] **CR côté client : visible seulement après actualisation de la page** (manque un rafraîchissement temps réel / refetch après publication).

---

## Consignes IA — sujet dédié (ni Lot A ni B)

- [ ] **CR affiché en markdown brut** (`## 1. Identification…`, `**gras**`) côté agente et client. Le CR généré par l'IA doit être rendu en mise en forme propre (convertir le markdown en HTML à l'affichage), ET revoir les consignes données à Claude pour la structure des CR.

---

## Lot E / Design

- [ ] **Intégrations : masquer Supabase et Claude IA** dans la page paramètres — ce sont des intégrations développeur, pas utilisateur.
- [ ] **Espace client : retirer les statuts « à contacter » et « à relancer »** (statuts internes qui ne concernent pas le client).
- [ ] **Messages côté client : bulle grise à gauche** au lieu de bleue à droite (l'affichage de l'auteur est inversé côté client).
- [ ] **Chantiers — résumé sans quitter la liste :** cliquer sur un chantier doit ouvrir le résumé EN RESTANT dans la liste (panneau latéral), pas faire un retour à la liste.

---

## Horizon (section 10 du CDC — multi-franchise / mobile)

- [ ] **Connexion agenda multi-fournisseurs :** pour le multi-franchise, proposer d'autres calendriers que Google (Notion, Apple, etc.) selon le choix du franchisé.

---

## Dette technique (Lot E)

- [ ] **Build local échoue sans `.env.local`** : les clients Supabase s'instancient à la collecte des routes. Fragile (le build ne passe qu'avec les bonnes variables). À rendre plus robuste (instanciation paresseuse / lazy).
- [ ] **Handlers qui avalent les erreurs en silence** (`if (!res.ok) return`) : pattern à traquer ailleurs (corrigé pour le PDF côté client au Lot A, mais peut exister sur d'autres fetch). Toujours afficher un message d'erreur.

---

## Notes de vérification (acquis pendant le Lot A)

- Restriction PDF côté client : volontairement limitée au CR de son propre dossier. À confirmer qu'aucun autre document n'est nécessaire côté client (sinon élargir).
- Des chemins de code n'avaient jamais été exercés (ex. PDF de CR) → s'attendre à réveiller d'autres bugs dormants en testant le Lot B (calculs financiers). Normal.

---

## Ajouts (tests Lot B — tâche 2)

### Bugs pré-existants découverts (indépendants de la tâche 2)

- [ ] **Devis avec TTC mais sans HT : message d'erreur « il manque le HT ».** Règle de validation de saisie (même famille que « création chantier sans client »). Le HT est obligatoire sur un devis. Découvert lors de P0-5 (ces devis sont marqués ttc_manuel à la migration, mais la saisie future doit les empêcher). **(Lot C/D — validation)**
- [ ] **Création de chantier sans client possible.** On peut créer un chantier sans lui associer de client → anormal. Ajouter une validation obligatoire du client à la création de chantier. **(Lot C/D — intégrité)**
- [ ] **Suppression chantier cassée : `column devis_artisans.pdf_path does not exist`.** Le code de suppression en cascade référence une colonne `pdf_path` qui n'existe pas (ou plus) sur `devis_artisans`. Bloque la suppression de chantier ET de clients. C'est lié à **P0-11** (cascade incomplète). Identifier le bon nom de colonne (ou retirer la référence) et reconstruire la cascade proprement. **(Lot C — intégrité, à rattacher à P0-11)**

### Prérequis au test des calculs financiers (BLOQUANT pour tâche calculs partenaire)

- [ ] **Aucun affichage du détail des parts.** Aujourd'hui : la facturation montre un montant mensuel global, le suivi financier d'un chantier montre le montant mais PAS la décomposition (commission, royalties, part agente, part admin). **Impossible de vérifier un calcul au centime sans ce détail.** À construire AVANT de coder les calculs partenaire : un affichage par devis du détail (HT → commission → royalties Type 2 → net → part agente / part admin), dans le suivi financier du chantier. C'est l'outil de contrôle de tout le Lot B. **(Lot B — tâche prioritaire avant les calculs partenaire)**

### Dette à solder en fin de Lot B

- [ ] **`devis_artisans.part_agente`** est désormais un miroir de `dossiers.part_agente` (alignement défensif). À supprimer quand plus rien ne la lit hors finance.js (qui lit déjà le dossier). **(fin Lot B)**
- [ ] **`sans_royalties`** conservée en base le temps de la transition partenaire/paiement_direct. À retirer quand finance.js et toutes les pages liront `paiement_direct`/`partenaire`. **(fin Lot B)**

### Lot E — dette / nommage

- [ ] **Variables au nom trompeur basé sur "Marine"** — à renommer en UNE passe globale (Lot E). Recensées à ce jour :
  - `estChantierMarine` (chantiers/[id]/page.js, finances/page.js, etc.) = `referente?.role === 'admin'`
  - `isMarine` (finances/page.js:2303) = test admin pour le sélecteur d'agente
  - (probablement d'autres `...Marine` ailleurs — faire un grep global au moment du renommage)
  Le COMPORTEMENT est correct (basé sur le rôle admin), mais le NOM évoque une personne → piège le jour d'un 2e admin. Renommer sur `...Admin` / `referentEstAdmin` / `isAdmin`. Conforme au principe CLAUDE.md (jamais de nom en dur, même en nom de variable). **(Lot E)**

### Lot B — règle "acompte 0 ⟹ commission 0" : ABANDONNÉE

- [x] **Règle "acompte 0 force commission 0" : NE PAS coder.** Raison : elle n'est vraie que pour les artisans en circuit illiCO France (commission prélevée sur l'acompte). Pour les PARTENAIRES (ex. Amandine), acompte 0 + commission est LÉGITIME — on ne prélève pas sur l'acompte, on facture l'entreprise à part. Forcer commission 0 casserait les partenaires.
- [ ] **Remplacée par P0-4bis — avertissement doux (non bloquant).** Afficher « Attention, acompte 0 : la commission ne sera pas prélevée. Confirmer ? » UNIQUEMENT si : `acompte_pourcentage === 0` ET commission > 0 ET artisan NON partenaire. Pour un partenaire : jamais d'avertissement. Ne force aucune valeur. **(Lot B, après P0-4)**

### Lot B — Tâche B : RÉEL apporteur + visu par devis

- [ ] **BUG (en cours de correction) : le RÉEL du coût apporteur-client ne suit pas les acomptes débloqués.** Vérifié par test (décocher l'acompte Esprit Cuisine → le réel apporteur reste identique au prévi à 1 088,72€, alors que honoraires et frais baissent bien). Cause : l'affichage de la Répartition réelle utilise l'ancien axe `retire` au lieu de la version `partsReel`/`totalHTReel` (acomptes débloqués) ajoutée dans finance.js. Le réel apporteur doit baisser quand un acompte est décoché, comme honoraires/frais. **(Tâche B, passe dédiée)**
- [ ] **AJOUT (nouvelle visu) : aucun détail « ce que je dois au Kiosque par devis » dans la fiche chantier.** Aujourd'hui : le total apporteur est dans Finances, et intégré aux factures agente (paiement ~1 mois après déblocage acompte). Mais pas de vue devis-par-devis du coût apporteur dans la fiche chantier. À ajouter (probablement avec les vues de facturation détaillées F1/F2). **(Lot B — ajout, après le bug réel)**

### Lot B / affichage — KPI « Frais consult. HT » quand frais offerts

- [ ] **KPI « Frais consult. HT » affiche « 0,00 € / net 0,00 € » quand les frais sont offerts.** Améliorer : afficher « Offert » (comme le KPI du haut « Frais consultation TTC : Offerts »). Cosmétique, pas un bug de calcul. À traiter avec P0-8 (même écran) ou au Lot E. **(Lot B/affichage)**

### Lot B — vue F1/F2 mensuelle : remboursement apporteur sur le timing (avec les vues de facturation)

- [ ] **Vue F1/F2 mensuelle/annuelle — remboursement apporteur garde un axe distinct** (`apporteurRembourseNet`, basé sur une DATE de remboursement, pas sur « acompte débloqué »). Volontairement non migré en B6b car ça relève du TIMING de facturation (facture Kiosque ~1 mois après déblocage acompte). À traiter AVEC les vues de facturation détaillées F1/F2 (déjà au programme du Lot B). Cohérent avec la décision : calcul du montant en B6b, timing de facturation séparé. **(Lot B, vues facturation)**

### Lot B — visu du détail apporteur par devis (fonctionnalité, après B6b)

- [ ] **Aucune visu du détail « ce que je dois à l'apporteur PAR DEVIS ».** Aujourd'hui : l'onglet Finances montre le TOTAL apporteur, la facturation agente l'intègre dans les factures (timing ~1 mois après déblocage acompte). Mais nulle part le détail par devis (ex. DAMIAN 524,34 / MJ 216 / ELEC 134,10 / P&M 280,47 / ESPRIT 659,64). Anne-Lise en a besoin pour CONTRÔLER la facture du Kiosque à réception. À ajouter dans le suivi financier du chantier (une ligne de coût apporteur par devis signé éligible). Fonctionnalité, pas un bug. **(Lot B, après le calcul B6b)**

### Lot B — Tâche B : affichages financiers à basculer sur partenaire/paiement_direct

Reste de la Tâche 1 (séparation sans_royalties → partenaire/paiement_direct) : seul le CRON a été basculé. Les affichages Finances et Suivi financier lisent encore l'ancienne logique. À corriger AVEC la Tâche B (calcul apporteur), car même zone (finance.js + écrans financiers).

- [ ] **Onglet Finances — badge « Apporteur » FAUX** sur les entreprises en paiement_direct (DECOGRANIT, SOLMAT = commission 0% ; et Amandine, MARC = partenaires sur Jadras). DÉCIDÉ : badge « Partenaire » (ambre) sur les vrais partenaires (`partenaire = true` — Amandine, MARC) ; AUCUN badge sur les artisans à commission 0% non-partenaires (DECOGRANIT, SOLMAT).
- [ ] **Suivi financier (chantier/id) — ligne « illiCO France — acompte débloqué » FAUSSE** pour les entreprises en paiement_direct (l'argent ne passe pas par illiCO France). DÉCIDÉ : remplacer par « Paiement direct à l'entreprise ». Concerne DECOGRANIT, SOLMAT, Amandine, MARC.
- [ ] Ces deux affichages doivent lire `partenaire` / `paiement_direct`, plus jamais `sans_royalties` ni l'ancienne logique apporteur.

### Fonctionnalité — notification mail à l'upload de facture (à creuser, hors Lot B)

- [ ] **Envoi automatique d'un mail quand une facture est uploadée**, idée d'Anne-Lise :
  - Agente upload sa facture F1 → mail à l'admin.
  - Admin upload sa facture → mail à l'agente + redevance cochée des deux côtés ?
  À cadrer : quel déclencheur exact, quel destinataire, contenu du mail, sens du « redevance cochée des deux côtés » (workflow à définir). NB : la redevance est paramétrée (montant) par l'ADMIN ; elle fait partie de la facture du mois mais est séparée pour la visu. Fonctionnalité, pas un bug — à traiter après le Lot B. **(Fonctions / Lot F)**
- [ ] **Cases de redevance mensuelle non cliquables côté agente.** Sur la page Facturation, la section « Redevances mensuelles » affiche des cases par mois (JAN ✓, AVR ⏳…) mais le clic ne fait RIEN (pas d'erreur console — handler absent, fonctionnalité non branchée). La RLS P0-9 autorise pourtant l'agente à cocher le statut de SA redevance (UPDATE, montant protégé par trigger). Il manque juste le branchement UI du clic → UPDATE. À faire avec le cadrage du workflow redevance (option B + automatisme éventuel). NB : vérifier aussi si l'admin peut cocher (peut-être cassé pour tous). **(Lot B / Fonctions)**
- [ ] **Automatisme de cochage de la redevance** (question d'Anne-Lise) : le statut « payé » de la redevance pourrait-il se cocher automatiquement quand l'admin rentre sa facture du mois (puisque la redevance est dans cette facture) ? Workflow à définir, lié à l'idée de notification mail ci-dessus. En P0-9 on donne seulement le DROIT à l'agente de cocher le statut ; l'automatisme éventuel vient après. **(Fonctions / Lot F)**

### Optimisation BDD — dette d'hygiène (future-proofing, PAS urgent)

Relevés par l'advisor Supabase pendant le diagnostic perf de la fiche chantier. NE SONT PAS la cause de la lenteur actuelle (à ce volume — 20 dossiers, 35 devis — invisible, mesuré <1,5 ms/requête). La vraie cause des 3s = nombre d'allers-retours PostgREST en file sur le pool de 11 connexions (traité par l'embedding, voir perf chantier). Ces 3 points deviennent utiles à partir de milliers de lignes — à traiter en UNE passe d'optimisation BDD plus tard :
- [ ] **`auth_rls_initplan` (32×)** : `auth.uid()`/`get_my_role()` réévalués par ligne dans les policies P0-9 (dossiers, devis_artisans, suivi_financier, redevances, factures_agente, factures_artisans). Correctif = encapsuler dans `(select get_my_role())` / `(select auth.uid())` → évalué une fois (InitPlan). Gain sub-milliseconde aujourd'hui, réel à l'échelle. Ne change PAS la logique de sécurité, juste l'évaluation.
- [ ] **`multiple_permissive_policies` (51×)** : plusieurs policies permissives sur la même table/action, toutes évaluées par ligne et OR-ées (ex. dossiers, photos, messages, comptes_rendus). Multiplicateur du point précédent. À consolider.
- [ ] **`unindexed_foreign_keys` (29×)** : FK sans index, dont `devis_artisans.dossier_id`, `suivi_financier.dossier_id` (d'où des Seq Scan). Ajouter les index = hygiène/échelle. SQL simple.

### P0-9-bis — SÉCURITÉ : cloisonner par agente les tables OPÉRATIONNELLES (lacune préexistante)

Découvert pendant le diagnostic perf (prototype embedding). P0-9 n'a cloisonné par agente QUE les tables financières (devis_artisans, suivi_financier, factures_artisans, redevances, factures_agente). Les tables OPÉRATIONNELLES sont restées « staff voit tout » (`get_my_role() IN ('admin','agente')`), donc NON cloisonnées :
- `rendez_vous`, `interventions_artisans`, `photos`, `comptes_rendus`, `chantier_documents`, `chantier_fiches_techniques`, `messages`
**Conséquence (testée empiriquement)** : aujourd'hui, une agente qui requête en direct `rendez_vous?dossier_id=eq.X` (ou photos, CR, messages...) d'un dossier d'une AUTRE agente récupère les données (test B : rdv=1, photos=1 sur dossier admin, alors que devis=0/suivi=0/factures=0 bien bloqués). C'est la même classe de faille que P0-9, sur d'autres tables.
**Statut** : l'embedding (perf fiche chantier) MASQUE cette lacune sur le chargement de la fiche chantier (les enfants ne sont atteignables qu'à travers un parent gaté), mais NE FERME PAS la faille au niveau base (un appel direct par dossier_id étranger renvoie toujours les données). À fermer pour de vrai : appliquer le même pattern P0-9 (admin OR EXISTS(dossier WHERE referente_id=auth.uid())) à ces 7 tables. **(SÉCURITÉ — à faire, pas une simple dette. À coupler avec le select-wrapping RLS.)**

### Sécurité — durcissement RLS complémentaire (juste après P0-9)

Repérés par l'advisor sécurité Supabase pendant l'analyse P0-9. NE PAS mélanger à P0-9 (un changement à la fois). À traiter en bloc « durcissement sécurité » juste après P0-9 :
- [ ] **`get_my_role()` exécutable par `anon`** (fonction SECURITY DEFINER exposée). À restreindre.
- [ ] **Policy INSERT `notifications` en `WITH CHECK (true)`** : n'importe qui peut insérer des notifications. À resserrer.
- [ ] **Protection « mots de passe compromis » désactivée** dans Supabase Auth. À activer.

### Lot E — champ mort PIÉGÉ (royaltiesReelTotal)

- [ ] **`royaltiesReelTotal: 0` (et `fraisAgenteReel: 0`, `gainAgenteReel: 0`) dans la branche Marine de `calculerReel`, `finances/page.js:~480`** : champ mort actuellement (lu nulle part dans le JSX de la page Finances). MAIS piégé : code une valeur d'argent FAUSSE (0). Si quelqu'un le rebranche un jour à un affichage, Marine retombe à 0 royalties silencieusement. À supprimer au Lot E (pas neutre comme du code mort ordinaire — c'est un piège financier). **(Lot E, priorité dans le nettoyage)**

### Lot E — code mort détecté (facturation)

- [ ] **`FacturationAgentePropre` et `renderFacturationMoisSuivi`** : jamais rendus (code mort). La facturation active = `FacturationAgentes`. Découvert lors de P0-9. À supprimer au Lot E après confirmation. **(Lot E)**
- [ ] **`renderAgenteMoisAdmin` (l.2464) et `renderFacturationAnneeAgente` (l.1683)** : code mort de facturation NON listé initialement, découvert lors de l'audit étape 1 facturation. Aucun call-site (def seule). `renderAgenteMoisAdmin` est la version la plus complète (calcul live F1/F2 + handlers statut). À supprimer en bloc au Lot E avec le reste du code mort facturation. **(Lot E)**
- [ ] **Variables mortes facturation** : `totalRedevancesReglees` (l.827), `mesRedevancesReglees` (l.849), `monNet` (l.850) — jamais utilisées. À supprimer au Lot E. **(Lot E)**

### Lot E — code mort détecté (formulaire devis inline)

- [ ] **Tout le formulaire devis inline est mort.** Confirmé lors de l'analyse P0-5 : `nouveauDevis`, `ajouterDevis`, `setND`, `sauvegarderDevis`, `modifierDevis`, `devisEnEdition` dans `app/chantiers/[id]/page.js` — jamais rendus, jamais appelés. Le SEUL chemin actif de devis est `DevisModal` + `saveDevisFromModal`. À supprimer en bloc au Lot E (après confirmation qu'aucune référence cachée ne subsiste). **(Lot E)**

### Lot E — code mort détecté (P0-4bis)

- [ ] **`sauvegarderDevis` (l. ~1106) et `modifierDevis` (l. ~1140)** dans `app/chantiers/[id]/page.js` : définis mais plus appelés. **Remplacés par `saveDevisFromModal(form)` (l. ~1154), qui gère désormais création ET édition en une seule fonction** (branché sur le bouton « Enregistrer » de DevisModal). Les deux anciennes sont des vestiges d'avant la fusion. Avant suppression au Lot E : confirmer qu'aucune référence cachée ne les appelle. **(Lot E)**

- [ ] **Formulaire inline de devis = code mort complet.** `nouveauDevis`, `ajouterDevis`, `setND`, `sauvegarderDevis`, `modifierDevis`, `devisEnEdition` dans `app/chantiers/[id]/page.js` : jamais rendus, jamais appelés. Le seul chemin actif est `DevisModal` + `saveDevisFromModal`. À supprimer en bloc au Lot E (après vérif des références). **(Lot E)**

---

## Ajouts (Lot B facturation — étape 1 : redevance HT)

### Section facturation Lot B — vérification en cours (étape 1)

- [x] **VÉRIFIÉ (conforme) — aucun affichage admin ne lit le PARAMÈTRE redevance au lieu des LIGNES encaissées.** « Redevance » a deux sens opposés selon le rôle : côté **agente** = ce qu'elle DOIT (lit le paramètre `profiles.redevance_mensuelle_ht`) ; côté **admin** = ce qu'elle a FACTURÉ/ENCAISSÉ des agentes (agrège les lignes de la table `redevances.montant_ht`). Ces flux ne doivent JAMAIS se croiser. Point de contrôle identifié : `totalNetCTP` (`finances/page.js` l.841) et tout KPI rendu en contexte admin. Si un affichage admin lit le paramètre (qui est `null` pour un admin) au lieu des lignes → bug à corriger (risque NaN / affichage faux dans la vue admin). **(Vérifié pendant l'étape 1 : les agrégats admin lisent bien les LIGNES `redevances.montant_ht` ; les 2 lectures du paramètre — 2344/2434 — portent sur `agenteActuelle`, jamais sur l'admin. Le null du paramètre admin est inerte. RÉSOLU.)**

### Lot E — dette (convention null redevance)

- [ ] **Cohérence de convention null sur la redevance.** Depuis l'étape 1 facturation : les lectures de LIGNE redevance gèrent le manquant en `|| 0` (compte comme 0), les affichages de PARAMÈTRE en `!= null ? … : 'à paramétrer'`. Deux conventions pour la même idée « pas de valeur ». Invisible dans le cas réel actuel (montant 450, jamais null côté agente). À harmoniser un jour, pas un bloqueur. **(Lot E — dette.)**

### Lot F — fonction (réglage du montant de redevance dans Paramètres)

- [ ] **CHANTIER PARAMÈTRES — construire le réglage du montant de redevance par agente.** Aujourd'hui la page Paramètres ne gère que la DATE de début des redevances ; le MONTANT n'est réglable nulle part (il vivait en dur : `540 €` codé dans le texte `parametres/page.js:551` + défaut DB, tous deux supprimés en étape 1 facturation). À construire : ajouter un champ « Redevance mensuelle (HT) » au formulaire agente (`app/parametres/page.js`) + le faire transiter dans `/api/create-agente` (destructure + updates + création) + écrire `profiles.redevance_mensuelle_ht`. Source de vérité = ce champ, jamais un littéral ; absent = « à paramétrer ».
  **Règle d'affichage : ce champ ne s'affiche QUE pour les agentes, JAMAIS pour un admin.** Un admin encaisse les redevances des agentes mais n'en doit aucune → le paramètre est sans objet pour lui (mis à `NULL` en base via `WHERE role = 'admin'` en étape 1 facturation). L'admin ne voit que les redevances facturées/encaissées (lignes de la table `redevances`), jamais une redevance « à lui ».
  NB : reporté hors étape 1 (le champ n'existe pas encore → rien à masquer en étape 1, le sujet masquage admin appartient à cette construction). Ne bloque pas la clôture du Lot B. **(Lot F — fonction.)**
- [ ] **Cases de redevance mensuelle non cliquables côté agente** (déjà noté plus haut dans « notification mail à l'upload de facture ») : à traiter avec le workflow redevance. Rappel ici car même zone. **(Lot B / Fonctions.)**

---

## Ajouts (Lot B facturation — étape 2 : affichage live + détail par mois)

### Lot B facturation — à corriger BIENTÔT (affichage selon le rôle/périmètre)

- [ ] **Dernière colonne des onglets Réel / Prévisionnel affiche « Marine » en dur** au lieu de s'adapter au périmètre sélectionné. Comportement attendu : périmètre « Tous » = chiffres de l'agence ; « Marine » = chiffres de l'admin ; « Anne-Lise » = chiffres de l'agente. Concerne l'affichage des données financières F1/F2 **par mois ET par année**, **côté admin ET côté agente**. C'est un libellé/calcul en dur basé sur un nom de personne (même famille de piège que `isMarine` / `estChantierMarine`). À corriger bientôt (pas Lot E lointain) car ça touche l'affichage financier réel. **(Lot B facturation — à corriger bientôt.)**

### Lot B facturation — étape 3 (à faire ensuite)

- [ ] **Découpler l'upload PDF du statut.** Aujourd'hui `uploadPdf` (FactureDetailCard) force `statut: 'facture'` quand un PDF est déposé. À l'étape 3, le PDF doit devenir optionnel et indépendant du statut : déposer un PDF ne doit PAS changer le statut. **PENDANT LES TESTS DE L'ÉTAPE 2 : ne pas uploader de PDF** (ça basculerait le mois en « facturé », comportement résiduel attendu, pas un bug). **(Lot B facturation — étape 3.)**
- [ ] **Clic « payé » cliquable + figement du montant.** Étape 3 : rendre le statut cliquable (2 états « à facturer » / « payé »), figer le montant live au clic payé, retrait du statut « Facturé ». ATTENTION : le clic/déclic payé a des conséquences sur d'autres pages (CA réel net, net à virer, redevances réglées, Suivi). Avant de coder : cartographier EXHAUSTIVEMENT tout ce que le statut payé fait bouger, dans les deux sens (clic ET déclic), pour avoir la check-list de test de réversibilité. **(Lot B facturation — étape 3.)**

### Lot B facturation — hygiène (après validation étapes 2-3)

- [ ] **Supprimer la table de backup `factures_agente_backup_b7b`.** Créée par le SQL B7b (filet de sécurité avant la remise à plat des 8 lignes). À dropper (`DROP TABLE public.factures_agente_backup_b7b;`) une fois que les étapes 2 et 3 sont validées et qu'on est sûr de ne plus avoir besoin de restaurer les anciens montants. **(Lot B facturation — hygiène, après étape 3.)**