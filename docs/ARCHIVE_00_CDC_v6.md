# Cahier des charges v6.0 — illico-app

*Cible : version web mono-agence (Marine + Anne-Lise). Spécification de ce qui DOIT ÊTRE (pas un inventaire de l'existant). Remplace le v5 ("98% complété" inexact). Détails dans les documents 01 à 04.*

## 1. Contexte
- Agence : illiCO travaux Martigues. Admin : Marine (société CTP). Agente : Anne-Lise (+ futures).
- Activité : courtage + AMO en rénovation. Typologies : courtage, AMO, Estimo, Merad, Studio de jardin (3 dernières : en développement).
- Objectifs : centraliser dossiers + prospection, fiabiliser les calculs (finance.js source unique), automatiser relances, sécuriser accès, vision financière juste par périmètre, espace client AMO.
- Périmètre v6 : web mono-agence. Multi-franchise + mobile = horizon (section 10). `agence_id` réservé.

## 2. Utilisateurs, rôles, accès
- **Admin** : accès total + consolidé CTP + toutes agentes. Ne sépare pas ses parts.
- **Agente** : ses dossiers, son suivi financier (par dossier ET perso/global), facturation vers CTP, redevances, stats. Périmètre limité à elle-même.
- **Client AMO** : lecture de son dossier (photos, CR publiés, messagerie).
- Périmètre financier : l'agente a une vision complète mais limitée à son périmètre ; l'admin a une couche d'agrégation au-dessus.
- **Modèle d'accès (Décision 1)** : agentes/admin par invitation (mot de passe choisi par la personne) ; clients par lien magique. Aucun mot de passe en clair.
- **Sécurité (P0-1)** : auth reliée à la personne connectée au login, vérifiée sur CHAQUE route serveur. Préalable absolu.

## 3. Du prospect à la clôture
Voir `03_flux_parcours.md`. Prospect (statut léger avant le client) ; détection de doublon à la saisie ; grandes étapes avec boucles R2/R3 et branche Étude/Conception ; espace client jusqu'à fin de chantier + 3 mois.

## 4. Modules
- **Clients** : identité, type, `raison_sociale` (pros), apporteur ENTRANT (taux > 0), détection doublon.
- **Artisans/Partenaires** : fiche + PARTENAIRE sortant (taux, 0 légitime) ; `artisan_documents` historisé ; spécialités via IA (lecture décennale → catalogue → validation).
- **Dossier** : référence atomique, typologie convertible, taux unique appliqué à tout, suppression cascade.
- **Devis** : TTC pré-rempli HT×1,1 puis figé ; acompte 30/40/saisi/0.
- **Planning** : 7 types de RDV, `dossier_id` nullable, heure+fuseau, interventions en 2 lignes.
- **CR IA, Photos, Documents** : génération Claude, sections éditables, flag restitution.

## 5. Finances
Voir `04_finance.md`. Règle d'or : TVA = facturation, partage sur HT. 6 flux (commission, courtage, AMO double, frais, apporteur, partenaire). Règlement CTP↔agente par deux factures croisées.

## 6. Automatisations
Contournement email (Décision 2) : Gmail agence + `Reply-To` @illico-travaux.com. Relances à activer (devis, acomptes, factures, RDV, décennale, CR client, prospect J+2). Idempotence requise.

## 7. PDF & nommage
R3 + récapitulatif : tous devis sauf refusés, prévi/réel. Nommage : `Identifiant_TYPE_AAAA-MM-JJ.pdf` (identifiant = entreprise pour artisan, nom client pour app ; prénom si homonyme).

## 8. Stack & principes
Next.js 16 / Supabase (23 tables) / Tailwind / Claude API / @react-pdf+pdf-lib / googleapis / Vercel.
Principes : zéro hardcode ; finance.js source unique ; auth unique au login ; suppression code mort (SAUF `_design`) ; découpe monolithes ; pagination ; tests.

## 9. Plan de travail (lots)
A Sécurité (P0-1, P0-2) → B Argent (P0-4→P0-9 + finance.js) → C Intégrité (P0-3, P0-10, P0-11) → D Confort (P1) → E Dette (P2) → F Fonctions (prospects, partenaire, double honoraire, IA décennale, conversion typologie).
**Séquence design : corrections d'abord, alignement sur la maquette `_design` ENSUITE (lot dédié).**

## 10. Horizon (non spécifié ici)
Multi-franchise (activer `agence_id`, royalties Type 1 explicitées) ; mobile React Native (stores, push, offline) ; Estimo/Merad/Studio ; webhooks Google Calendar.
