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

- [ ] **Création de chantier sans client possible.** On peut créer un chantier sans lui associer de client → anormal. Ajouter une validation obligatoire du client à la création de chantier. **(Lot C/D — intégrité)**
- [ ] **Suppression chantier cassée : `column devis_artisans.pdf_path does not exist`.** Le code de suppression en cascade référence une colonne `pdf_path` qui n'existe pas (ou plus) sur `devis_artisans`. Bloque la suppression de chantier ET de clients. C'est lié à **P0-11** (cascade incomplète). Identifier le bon nom de colonne (ou retirer la référence) et reconstruire la cascade proprement. **(Lot C — intégrité, à rattacher à P0-11)**

### Prérequis au test des calculs financiers (BLOQUANT pour tâche calculs partenaire)

- [ ] **Aucun affichage du détail des parts.** Aujourd'hui : la facturation montre un montant mensuel global, le suivi financier d'un chantier montre le montant mais PAS la décomposition (commission, royalties, part agente, part admin). **Impossible de vérifier un calcul au centime sans ce détail.** À construire AVANT de coder les calculs partenaire : un affichage par devis du détail (HT → commission → royalties Type 2 → net → part agente / part admin), dans le suivi financier du chantier. C'est l'outil de contrôle de tout le Lot B. **(Lot B — tâche prioritaire avant les calculs partenaire)**

### Dette à solder en fin de Lot B

- [ ] **`devis_artisans.part_agente`** est désormais un miroir de `dossiers.part_agente` (alignement défensif). À supprimer quand plus rien ne la lit hors finance.js (qui lit déjà le dossier). **(fin Lot B)**
- [ ] **`sans_royalties`** conservée en base le temps de la transition partenaire/paiement_direct. À retirer quand finance.js et toutes les pages liront `paiement_direct`/`partenaire`. **(fin Lot B)**