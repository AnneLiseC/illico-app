# Document 1 — Carte des bugs illico-app

*Établie à partir de l'audit du 24/05/26 + règles métier validées. Référence : annexe visuelle disponible.*

## Légende des priorités
- **P0** — données fausses visibles, corruption silencieuse, ou faille de sécurité. À corriger avant tout.
- **P1** — fonctionnalité cassée ou chiffre faux, impact limité ou contournable.
- **P2** — dette technique, ergonomie, pérennité. À solder avant multi-utilisateur/mobile.

## Préalable TVA (recadré)
- HT = source de vérité interne (commissions + royalties dessus, TVA hors-jeu).
- TTC = saisi manuellement, STOCKÉ et persistant, **jamais recalculé** par l'app. Multi-taux possible (ex. Esprit Cuisine).
- Honoraires : TVA = taux dominant du chantier (10% aujourd'hui), paramétrable.
- Frais de consultation : seul HT reconstitué à 20% (÷1,2).
- **Règle d'or : le TTC ne se recalcule jamais. HT×1,1 = valeur par défaut à la création seulement, jamais d'écrasement ensuite.**

## P0 — à corriger avant tout

### Sécurité
- **P0-1 — Aucune route API ne vérifie la session.** `/api/create-agente` utilise service_role sans vérifier l'appelant. Impact : n'importe qui avec l'URL peut créer/supprimer une agente, lire/écrire des données. Correctif : auth reliée à la personne connectée au login, vérifiée sur chaque route.
- **P0-2 — Policy `messages` à auditer.** `auteur_role` envoyé en clair ; un client pourrait se faire passer pour une agente. Revalider le rôle côté serveur.

### Argent / chiffres faux
- **P0-3 — Aucun email envoyé (stub silencieux).** `sendEmail` est un stub vide ; les relances loggent « envoyé » sans rien envoyer. Correctif : Gmail agence + `Reply-To` @illico-travaux.com.
- **P0-4 — Sélecteur d'acompte : « sans acompte » devient 30%.** `acompte_pourcentage || 30` → `0 || 30 = 30`. 4 cas réels : 30/40/montant saisi/0. Correctif : `?? 30` au lieu de `|| 30`, + option « sans acompte » dans le sélecteur inline.
- **P0-5 — TTC écrasé à la re-saisie du HT.** Le HT×1,1 écrase le TTC manuel multi-taux. Correctif : l'app ne recalcule jamais le TTC ; au changement de HT, l'utilisatrice ressaisit. Garde-fou : alerte si TTC < HT.
- **P0-6 — Apporteur « total chantier » retombe sur « par devis ».** Renommage `apporteur_base`→`apporteur_mode` cassé vs `finance.js` qui teste `=== 'total_chantier'`. Correctif : harmoniser.
- **P0-7 — Part franchisée sur-évaluée.** Royalties non déduites de `gainAdminReel` en mode non-Marine. Correctif : parts = (base − royalties) × taux, pour agente ET admin. `royalties = HT × 5% × 1,2`.
- **P0-8 — Marine ne voit pas ses royalties.** `royaltiesReelTotal = 0` codé en dur en mode Marine.
- **P0-9 — Anne-Lise voit la facturation d'une autre agente.** `FacturationAgentes` rendu au lieu de `FacturationAgentePropre`.

### Intégrité
- **P0-10 — Sync Google Calendar duplique les interventions** (pas d'`_googleEventId` à l'insertion).
- **P0-11 — Suppression de chantier incomplète** (ne purge pas factures, documents, CR, messages). Ajouter ON DELETE CASCADE propre.

## P1 — ensuite
- **P1-1** KPI « chantiers actifs » à 0 (`'en_cours'` vs `'en_cours_chantier'`).
- **P1-2** Dates de règlement perdues (`date_paiement` vs `date_reglement`). Unifier.
- **P1-3** Paramètres inaccessibles aux agentes. Ouvrir : modif RIB → notif admin ; notifs + mot de passe → sans admin.
- **P1-4** Boutons « Modifier » cassés (routes `/clients/[id]/modifier`, `/artisans/[id]/modifier` inexistantes).
- **P1-5** Honoraires AMO recalculés à la main, 9% codé en dur. Tout passer par finance.js, taux lu du dossier.
- **P1-6** Référence dossier non-atomique (`count(*)+1`). Passer en séquence/RPC Postgres.
- **P1-7** Apporteur 0% : donnée polluée (NaN). Valider le taux ; le 0 reste légitime (cas partenaire).
- **P1-8** Planning : heure ignorée (allDay forcé) + fuseau horaire.
- **P1-9** Artisans : qualification absente du formulaire création ; qualification_url/rib_url non éditables.
- **P1-10** Artisans : 0 devis affiché si profil non chargé (au lieu d'un état chargement).

## P2 — dette
- Honoraires TVA 10% à rendre paramétrable.
- finance.js source unique (supprimer les recalculs dans dashboard/finances/statistiques/chantiers[id]).
- Auth unique au login (supprimer les 5 fetch maison).
- Boutons décoratifs à implémenter (Connexion Google, Mot de passe oublié, Filtres, Exporter, Tri, Intégrations).
- Zéro hardcode (540€, 30%, taux, SIRET).
- Code mort à supprimer : `app-header.js`, dépendances npm inutiles (claude, prisma, playwright). **NE PAS toucher `_design` (référence visuelle).**
- Monolithes à découper : chantiers/[id] (4783 l.), finances (2900 l.).
- Majuscule « Jean-Pierre » → « Jean-pierre » à corriger.
- Tables `specialites`/`artisans_specialites` : ressuscitées (voir Doc 2), plus mortes.
- Pagination (notifications, messages, dossiers, photos). Tests + CI. Espace client multi-dossiers AMO.

## Décisions de conception actées
1. Modèle d'accès (invitation / lien magique).
2. Emails : Gmail + Reply-To.
3. Double honoraire AMO (9% + remisé, les deux affichés).
4. Apporteur (entrant) vs Partenaire (sortant) — renommage + distinction.
5. TTC manuel persistant.

## Ordre de bataille
- **A** Sécurité (P0-1, P0-2) → **B** Argent juste (P0-4→P0-9) → **C** Intégrité (P0-3, P0-10, P0-11) → **D** Confort (P1-1→P1-10) → **E** Dette (P2) → **F** Fonctions (prospects, partenaire, double honoraire, IA décennale, conversion typologie).
