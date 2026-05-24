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
