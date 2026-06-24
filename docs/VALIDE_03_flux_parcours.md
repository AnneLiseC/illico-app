# Document 3 — Parcours d'un dossier (flux)

*Flux identique pour agente et admin ; l'admin voit des infos en plus et ne sépare pas ses parts. Annexe visuelle : logigramme.*

## Colonne vertébrale
Premier contact → R1 → (branche Étude/Conception optionnelle) → R2 (×N) → réception/analyse devis → R3 (×N) → signature → suivi → réception/clôture.

- **R2 et R3 sont des boucles** : se répètent autant que nécessaire (plusieurs artisans, plusieurs présentations).
- **Branche Étude/Conception** : optionnelle, insérée manuellement par l'agente entre R1 et R2 (BET, architecte, maquette, RDV intermédiaires — ex. dossier Carmona). Type de RDV « Étude/Conception ».

## Entrée : le prospect
- R1 planifié SANS dossier, noté « R1 - nom client ».
- 1h après : notif « Créer un dossier ? » → OUI (signé) / NON (refusé + motif) / PEUT-ÊTRE (en attente).
- PEUT-ÊTRE : J+2 relance mail auto (annulée si tranché), J+5 notif interne, relance manuelle. Toute réponse oui/non éteint les relances.

## Étapes et points de cassure (bugs où ça frappe)
| Étape | Point de cassure |
|---|---|
| Création client+dossier | Référence dossier non atomique (P1-6) |
| Réception/analyse devis | TTC écrasé si re-saisie HT (P0-5) ; acompte 0→30% (P0-4) |
| R3 présentation | PDF R3 : afficher tout sauf refusés, prévi/réel |
| Signature | Statut devis_a_modifier non réversible auto |
| Suivi | Relances email muettes (P0-3) ; doublons Google (P0-10) |

## Vue admin (en plus, mêmes étapes)
- Suivi : finance globale agence (CTP). Clôture : rétentions de garantie, honoraires AMO.

## Hors parcours — admin uniquement
Gestion des agentes (invitation, taux 1/2), redevances mensuelles (450 € HT), facturation inter-agentes → CTP, suivi financier CTP global, statistiques globales. Marine ne sépare pas ses parts.

## Fin de vie
Réception → dossier de restitution + paiement solde AMO. Espace client ouvert jusqu'à fin de chantier + 3 mois, puis archivage.

## Types de RDV (7)
Avec dossier : R1, R2, R3, suivi, réception, Étude/Conception. Sans dossier : Pro/Perso (BNI, soirées). `rendez_vous.dossier_id` nullable.
