# Document 2 — Architecture & schéma de données (cible mono-agence)

*23 tables. `agence_id` réservé partout pour le multi-franchise futur (non exploité). Annexe visuelle : schéma relationnel.*

## Légende des écarts
- **[NOUVEAU]** ajout cible · **[MODIF]** modifié · **[OK]** inchangé.


## CONVENTION — apporteur vs partenaire (sens de l'ARGENT)
> **Une même entité peut être À LA FOIS partenaire ET apporteur** (ex. Amandine PARIS : partenaire côté artisan car on lui amène des chantiers + apporteur côté client car elle peut nous amener des clients). Les deux rôles coexistent, dans deux tables différentes (artisans pour partenaire, client pour apporteur). Ce n'est pas une erreur.
> **Le taux apporteur peut être `null` LÉGITIMEMENT** : apporteur identifié mais conditions pas encore négociées (projet pas assez avancé). `null` ≠ erreur. Conséquence : le calcul apporteur ne se déclenche QUE si taux défini (non null, > 0) ET `apporteur_actif`. Un apporteur à taux null peut être activé sur un dossier ; le coût s'affiche « taux à définir » jusqu'à ce que le % soit renseigné.
On parle TOUJOURS du sens de l'argent, jamais de l'affaire :
- **PARTENAIRE** = argent ENTRANT (gain). BET, architecte, fournisseur. On leur amène l'affaire, ils nous reversent un %. CTP encaisse, reverse une part à l'agente. Vit sur la fiche ARTISAN (case « apporteur d'affaires » actuelle À RENOMMER en « partenaire »).
- **APPORTEUR** = argent SORTANT (coût). Ex. Kiosque à travaux. Il nous amène un client, on lui doit un %. CTP décaisse, l'agente rembourse sa part. Taux CONTRACTUEL (illiCO France ↔ apporteur), ne varie jamais.

## Module Accès / Auth
- **profiles** : id, role (admin/agente/client), nom/prénom/téléphone, `client_id`→clients. **[NOUVEAU]** `taux_1`, `taux_2` (les 2 splits de l'agente), `agence_id`. Sécurité d'accès aujourd'hui inexistante (P0-1).
- **google_tokens** : [OK].

## Module Clients
- **clients** : identité, type particulier/pro. **[NOUVEAU]** `raison_sociale` (pros). **[MODIF]** bloc APPORTEUR = MÉMOIRE DE PROVENANCE (« ce client vient du Kiosque ») : `apporteur` oui/non + nom + taux contractuel (fixe, ne varie pas) + base (par devis / total chantier). Le taux par défaut vient d'ici mais le CALCUL ne se déclenche QUE si activé sur le chantier (voir dossiers). `apporteur_taux > 0` validé (P1-7). **[NOUVEAU]** `agence_id`. Détection de doublon à la saisie.

## Module Artisans / Partenaires
- **artisans** : entreprise, métier (texte libre), contact, `sans_royalties`. **[NOUVEAU]** bloc PARTENAIRE (argent ENTRANT / gain) : `partenaire` (oui/non) + `partenaire_taux` (0 légitime). C'est la case « apporteur d'affaires » actuelle À RENOMMER en « partenaire » (BET, archi, fournisseur). Le devis du partenaire n'a pas de royalties, mais la commission qu'on gagne en lui amenant l'affaire = revenu CTP → royalties dessus (voir Doc 4). **[NOUVEAU]** `agence_id`. **[MODIF]** PDF sortent de la fiche → table `artisan_documents`.
- **artisan_documents** **[NOUVELLE TABLE]** : historique de TOUS les PDF artisan (qualification, RIB, KBIS, décennale). Champs : type, nom_fichier (nommage logique), path, date_upload, date_fin_validite (décennale), actif. Renouvellement = nouvelle ligne, ancienne conservée. Alerte J-30 lit la décennale active.
- **specialites** **[VIVANTE]** : catalogue de référence. Libellé unique (sans doublon), modifiable. Suppression bloquée si au moins un artisan l'utilise (message listant les artisans).
- **artisans_specialites** **[VIVANTE]** : couverture de chaque artisan. Remplie par l'IA qui lit la décennale → mappe sur `specialites` → propose les cases → validation. Retirer une spécialité à un artisan = toujours possible.
- **fiches_techniques** : [OK] (hors historique, suppression sans conséquence).

## Module Dossier chantier
- **dossiers** : référence unique. **[MODIF]** référence ATOMIQUE (P1-6) ; typologie CONVERTIBLE (courtage↔AMO, Estimo→courtage/AMO, recalcul honoraires à la conversion). **[NOUVEAU]** `taux_choisi` (1|2) → part agente au niveau dossier ; `taux_amo_standard` (9%) + `taux_amo_applique` (remise) → double honoraire ; **`apporteur_actif` (oui/non) = interrupteur : applique-t-on l'apporteur du client SUR CE chantier ? Le calcul ne se déclenche QUE si activé. Le taux est lu depuis le client, jamais redéfini ici.** ; `agence_id`. **[MODIF]** suppression en cascade complète (P0-11).
- **photos**, **comptes_rendus**, **chantier_documents**, **chantier_fiches_techniques** : [OK].

## Module Devis & factures artisans
- **devis_artisans** : `montant_ht` + `montant_ttc`. **[MODIF]** TTC pré-rempli HT×1,1 à la création, FIGÉ dès saisie manuelle, jamais recalculé ensuite (P0-5). `acompte_%` gère le 0 légitime (P0-4). Calculs sur le HT via finance.js.
- **factures_artisans** : **[MODIF]** `date_paiement` colonne unifiée (P1-2).

## Module Finances
- **suivi_financier** : **[MODIF]** unifier `date_paiement`/`date_reglement` en UNE colonne.
- **redevances** : **[MODIF]** `montant_ht` (450 € HT, et non TTC), paramétrable.
- **factures_agente** : **[MODIF]** afficher la bonne facturation à chaque agente (P0-9).
- **objectifs_ca** : [OK].

## Module Planning
- **rendez_vous** : **[MODIF]** `dossier_id` NULLABLE (RDV sans dossier). **[NOUVEAU]** 7 types : R1, R2, R3, suivi, réception, Étude/Conception (avec dossier : BET/archi/maquette), Pro/Perso (sans dossier : BNI/soirées). Heure + fuseau pris en compte (P1-8).
- **interventions_artisans** : **[MODIF]** affichage 2 lignes ponctuelles (début J1 / fin Jn) au lieu d'une barre pleine durée. Sync Google sans doublon (P0-10).

## Module Communication
- **messages** : **[MODIF]** `auteur_role` validé côté serveur (P0-2). AMO uniquement.
- **notifications** : **[MODIF]** pagination ; préférences consommées côté serveur.

## Prospects & cycle de vie (nouveau)
- **Prospect** = statut léger (nom, coordonnées, date R1, statut en attente/signé/refusé+motif). Devient client à la signature. Donne la liste de prospects + le taux de transformation.
- **Workflow R1→dossier** : R1 planifiable sans dossier (« R1 - nom client »). 1h après : notif « Créer un dossier ? » → OUI (client+dossier, R1 rattaché) / NON (trace + motif) / PEUT-ÊTRE (en attente : J+2 mail auto annulé si tranché, J+5 notif interne, relance manuelle).
- **Espace client** : accessible jusqu'à fin de chantier + 3 mois, puis archivage.

## Détection de doublon (clients & artisans)
- Déclenchement à la saisie des champs clés (nom, prénom, téléphone, email), avant le reste de la fiche.
- Match téléphone OU email = quasi sûr (alerte forte) ; nom+prénom seul = alerte sans affirmer.
- Choix : « c'est le même » (ouvre fiche existante) / « homonyme, nouveau » / « annuler ». Idem artisans (entreprise + tél/email).

## Convention de nommage des PDF
- Format : `Identifiant_TYPE_AAAA-MM-JJ.pdf`, sans accent ni espace.
- Artisan (identifiant = entreprise) : `GuilHomeElec_DECENNALE_2026-05-24.pdf`.
- App (identifiant = nom client) : `Souchon_DEVIS_MJRenovation_2026-05-24.pdf`.
- Homonymes : prénom ajouté seulement si un autre client porte le même nom (`SouchonMarie_…` vs `SouchonPaul_…`). L'app vérifie l'unicité au moment de générer.

## Migrations BDD à prévoir
- **Ajouts** : `artisan_documents` ; `profiles.taux_1/taux_2` ; `dossiers.taux_choisi/taux_amo_standard/taux_amo_applique` ; `artisans.partenaire/partenaire_taux` ; `clients.raison_sociale` ; `agence_id` (profiles, clients, dossiers, artisans — réservé).
- **Modifications** : unifier `suivi_financier.date_paiement` ; `apporteur_base→mode` ; référence atomique ; cascade dossiers ; redevance HT paramétrable ; typologie convertible ; **ajouter `dossiers.apporteur_actif` (interrupteur) ; renommer la case artisan « apporteur d'affaires » → « partenaire ».**
- **Ressuscitées** : `specialites` + `artisans_specialites`.
- **Horizon (non fait maintenant)** : table de référence `apporteurs` (réutilisable, contrats illiCO France) pour le multi-franchise. Pour l'instant on reste simple : champs apporteur sur le client + interrupteur sur le dossier.