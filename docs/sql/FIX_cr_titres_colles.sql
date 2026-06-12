-- ============================================================================
-- FIX_cr_titres_colles.sql — Migration des 5 CR legacy (12/06/2026)
-- ============================================================================
-- CONTEXTE : l'assemblage des sections CR (sauvegarderCRGenere) utilisait
-- join('') → les titres « ## N. » se collaient en milieu de ligne, et
-- l'indentation du template (2 espaces) fuyait en tête de section.
-- Le code est corrigé pour le futur (commit 7028d77, branche fix/cr-markdown-rendu).
-- Ce fichier assainit les 5 CR existants en base.
-- Constat (12/06, lecture seule) : 5 CR collés / 0 sain / 0 faux positif
-- (tous les ## de la table sont des titres « ## N. », vérifié à l'audit).
--
-- À exécuter dans le SQL editor Supabase, bloc par bloc, dans l'ordre.
-- ============================================================================

RESET ROLE;

-- ============================================================================
-- 1. CONTRÔLE AVANT — attendu : 5
-- ============================================================================
SELECT count(*) AS cr_colles
FROM comptes_rendus
WHERE contenu_final ~ '[^\n]## \d+\.';

-- ============================================================================
-- 2. MIGRATION (transaction)
--    (a) désencoller les titres : insérer une ligne vide avant tout « ## N. »
--        précédé d'un caractère non-newline ;
--    (b) retirer les 2 espaces d'indentation parasites juste après la ligne
--        vide qui suit un titre.
--    Scopé aux seules lignes concernées.
-- ============================================================================
BEGIN;

UPDATE comptes_rendus
SET contenu_final = regexp_replace(
      regexp_replace(contenu_final, '([^\n])(## \d+\.)', E'\\1\n\n\\2', 'g'),  -- (a)
      '(## \d+\.[^\n]*\n\n)  ', E'\\1', 'g'                                    -- (b)
    )
WHERE contenu_final ~ '[^\n]## \d+\.'
   OR contenu_final ~ '\n\n  ';
-- attendu : UPDATE 5

COMMIT;

-- ============================================================================
-- 3. CONTRÔLE APRÈS — attendu : 0
-- ============================================================================
SELECT count(*) AS cr_colles
FROM comptes_rendus
WHERE contenu_final ~ '[^\n]## \d+\.';

-- ============================================================================
-- 4. VÉRIF VISUELLE — titres sur leur propre ligne, plus d'indentation
-- ============================================================================
SELECT id, type_visite, left(contenu_final, 200) AS debut
FROM comptes_rendus
WHERE id IN (
  '5d7da3ef-d807-422f-ad40-ba432784a575',
  '2c6ae464-e452-4a08-b939-234061460d99',
  '37cc5fd9-0679-4838-9167-90487aedcf8e',
  '6b77ed04-c085-4e10-ae0f-be0e99a1ec57',
  '33b49adb-9855-4a43-b1a3-f950ccbf319c'
);

-- ============================================================================
-- 5. ROLLBACK MANUEL (si besoin) — backup INTÉGRAL des 5 contenus AVANT
--    migration, relevé en lecture seule le 12/06/2026.
--    Pour restaurer : retirer le /* et le */ qui encadrent la section,
--    puis exécuter les UPDATE.
-- ============================================================================
/*
BEGIN;

-- CR r1 — dossier 44cd5da5-d86c-444c-8333-5c294f1a9001
UPDATE comptes_rendus SET contenu_final = $bak1$## 1. Identification du projet

**Référence :** AM-2026-XXX58
**Maître d'ouvrage :** M. et Mme Jerome Jadras & Marjorie Jadras
**Adresse :** 13500 MARTIGUES
**Type de prestation :** AMO
**Référente illiCO :** Anne-Lise Caillet
**Date de visite :** 12 janvier 2026
**Nature du bien :** Appartement 77 m² en rez-de-chaussée
**Budget envisagé :** 120 000 €## 2. État des lieux

**Configuration générale :**
– Appartement de 77 m² conception années 60
– Rez-de-chaussée avec 5 marches à l'entrée
– Trois chambres : 11 m², 10,01 m² et 8,27 m²
– Accès résidence avec code, facilement accessible

**État général :**
– Bien propre mais endommagé nécessitant une rénovation globale
– Toutes les pièces sont concernées par les travaux
– Traces de moisissures constatées dans la chambre parentale
– Début d'incendie identifié dans la cuisine

**Particularités techniques :**
– Marche de 2 cm présente dans le salon
– Chauffe-eau situé en cave directement sous l'appartement## 3. Périmètre des travaux par pièce / zone

**Ensemble de l'appartement :**
– Rénovation de tous les sols avec carrelage identique
– Création de faux-plafonds avec spots intégrés
– Isolation périphérique des murs et côté cage d'escalier
– Remplacement de toutes les menuiseries intérieures

**Cuisine :**
– Modernisation complète suite au début d'incendie
– Création d'une entrée en arcade
– Déplacement de la machine à laver vers la SDB
– Suppression du sèche-linge

**Salle de bain :**
– Rénovation complète style italien
– Intégration de la machine à laver (évacuation existante)

**Entrée :**
– Refonte complète de la penderie## 4. Points d'attention et contraintes techniques

**Contraintes structurelles :**
– Marche de 2 cm dans le salon à traiter
– Conception années 60 nécessitant une attention particulière pour l'isolation

**Problématiques identifiées :**
– Moisissures en chambre parentale : traitement préalable obligatoire
– Séquelles du début d'incendie en cuisine : diagnostic sécurité requis
– Chauffe-eau en cave : vérification des raccordements

**Options techniques à étudier :**
– Faisabilité du déplacement du compteur électrique général
– Déplacement de la hotte cuisine avec conduit existant
– Étude pour l'obtention d'aides administratives et réductions d'impôt

**Objectifs performance :**
– Optimisation des rangements et de l'espace
– Amélioration significative du confort thermique## 5. Artisans à solliciter

**Corps d'état nécessaires :**
– Électricien pour mise aux normes et éclairage intégré
– Plombier pour déplacement machine à laver et rénovation SDB
– Carreleur pour sols et faïences
– Plaquiste pour faux-plafonds et isolation
– Menuisier pour portes intérieures et aménagements
– Cuisiniste pour la cuisine complète
– Peintre pour finitions

**Expertises spécialisées :**
– Diagnostic sécurité post-incendie
– Traitement anti-moisissures
– Étude thermique pour optimisation isolation## 6. Prochaines étapes

**Études préalables :**
– Diagnostic technique complet du bien
– Traitement prioritaire des moisissures chambre parentale
– Évaluation des séquelles du début d'incendie

**Démarches administratives :**
– Étude des aides disponibles et réductions d'impôt
– Vérification réglementaire pour les modifications électriques

**Consultation artisans :**
– Transmission du présent compte-rendu aux entreprises sélectionnées
– Organisation des visites techniques (R2) avec les différents corps d'état
– Établissement des devis détaillés dans le respect du budget 120 000 €$bak1$
WHERE id = '5d7da3ef-d807-422f-ad40-ba432784a575';

-- CR r2 — dossier 44cd5da5-d86c-444c-8333-5c294f1a9001
UPDATE comptes_rendus SET contenu_final = $bak2$## 1. Identification du chantier

**Référence :** AM-2026-XXX58
**Maître d'ouvrage :** M. et Mme Jerome Jadras & Marjorie Jadras
**Adresse :** 13500 MARTIGUES
**Type de prestation :** AMO
**Référente illiCO :** Anne-Lise Caillet
**Date de visite :** 26 mars 2026
**Intervenants présents :** Amandine PARIS - HSH décoration & aménagement
**Numéro de CR :** N°2## 2. Travaux à réaliser par artisan

**HSH décoration & aménagement (Amandine PARIS) :**
– Architecture d'intérieur globale de l'appartement
– Conception et aménagement de tous les espaces
– Changement des meubles (global)
– Préparation du dossier client avec métré effectué

**Artisans à identifier pour :**
– Plomberie (déplacement machine à laver, chauffe-eau cave)
– Électricité (déplacement compteur, installation VMC, éclairage)
– Isolation thermique et phonique
– Carrelage et revêtements sols
– Menuiseries (porte blindée, portes intérieures PVC, fenêtres)
– Traitement moisissures
– Installation climatisation réversible
– Faux plafonds avec spots intégrés## 3. Constat et points techniques

**État général de l'appartement :**
– Appartement propre mais signes d'usure générale nécessitant rénovation globale
– **Point critique :** Traces de moisissures chambre parentale (mur périphérique)
– **Point critique :** Début d'incendie antérieur en cuisine
– Absence de VMC avec obligation actuelle de déshumidificateur
– Clim existante salon à remplacer
– Fenêtres sans ouverture isolante, fenêtre salon à réparer
– Chauffe-eau situé en cave sous l'appartement
– Faux plafond couloir et entrée existant sans isolation
– **Attention :** Marche de 2 cm dans le salon (dalle béton)
– Prise salon reliée au volet électrique sous le sol

**Contraintes techniques identifiées :**
– 14 cm disponibles entre plafond existant et haut des portes-fenêtres pour isolation phonique
– Machine à laver s'ouvre de gauche à droite (contrainte d'emplacement)
– Four neuf à conserver
– LED pilotées via smartphone à conserver dans chambres enfants## 4. Plan d'action et séquençage

**Travaux transversaux prioritaires :**
– Isolation thermique intérieure sur murs périphériques et côté hall d'entrée
– Installation VMC obligatoire
– Traitement moisissures chambre parentale
– Faux plafonds avec isolation phonique et spots intégrés
– Carrelage identique toutes pièces avec suppression marche salon

**Aménagements par pièce :**
– **Entrée :** Porte blindée, penderie complète, faux plafond avec isolation
– **Cuisine :** Isolation mur périphérique, rangements importants, déplacement machine à laver
– **Salle de bain :** Style italien, douche à l'italienne, intégration machine à laver
– **WC :** WC japonais (<1 500€) ou suspendu, coffrage conduit évacuation
– **Salon :** Clim réversible silencieuse, installation TV suspendue, 3-4 prises TV
– **Chambre parentale :** Retrait armoire, traitement moisissures, lit avec chevets suspendus
– **Chambres enfants :** Aménagements spécifiques (miroir coiffeuse Abbygaëlle), conservation LED smartphone
– **Cave :** Remplacement chauffe-eau, rangement 2 vélos## 5. Points en attente de validation

**Faisabilité technique à confirmer :**
– Déplacement hotte cuisine (étude conduit actuel)
– Déplacement compteur électrique général (validation gestionnaire copropriété)
– Accès et remplacement chauffe-eau cave
– Vérification prise salon (dalle béton/volet électrique)

**Éléments en cours :**
– Photos miroir coiffeuse Abbygaëlle à recevoir
– Préparation dossier client par HSH avec métré effectué

**Contraintes planning :**
– Vacances clients en août à intégrer dans planning
– Aides administratives/réduction d'impôt impossibles (propriétaire en résidence principale)## 6. Prochaines étapes

**Actions immédiates :**
– Finalisation du dossier par Amandine PARIS (HSH)
– Recherche et sélection des artisans spécialisés pour chaque lot
– Validation faisabilité technique points en attente
– Réception photos miroir coiffeuse Abbygaëlle

**Planning prévisionnel :**
– Organisation visite R3 avec artisans sélectionnés
– Préparation devis détaillés par lot
– Intégration contrainte vacances août dans séquençage travaux

**Validation nécessaire :**
– Accord gestionnaire copropriété pour déplacement compteur
– Confirmation budget global client après réception devis$bak2$
WHERE id = '2c6ae464-e452-4a08-b939-234061460d99';

-- CR suivi — dossier a0545e6b-7882-403b-ad16-a38c287f18f6
UPDATE comptes_rendus SET contenu_final = $bak3$## 1. Identification du chantier

  **Référence dossier :** 2026-AM-007
**Maître d'ouvrage :** M. et Mme Eric Carmona & Isabelle
**Adresse :** 9 allée des campagnols 13800 Istres
**Type de prestation :** AMO
**Référente illiCO :** Anne-Lise Caillet
**Numéro de CR :** N°1
**Date de visite :** Non précisée
**Intervenants présents :** Non précisé## 2. Avancement des travaux par lot

  **Aucun artisan retenu :** Les maîtres d'ouvrage n'ont signé aucun devis à ce jour

– Aucune intervention d'artisan programmée
– Projet en phase de redéfinition## 3. Planning prévisionnel

  **À définir :** Réalisation de maquettes pour réaménagement
**À programmer :** Validation du nouveau concept par les maîtres d'ouvrage
**En attente :** Sélection des artisans selon la nouvelle orientation## 4. Points de retard ou incidents

  – Le projet d'extension initialement prévu n'est plus d'actualité
– Le devis du Bureau d'Études Techniques (BET) n'a pas été signé par les maîtres d'ouvrage
– Réorientation complète du projet vers un réaménagement de la pièce existante
– Aucun artisan n'a été retenu, nécessitant une nouvelle phase de consultation## 5. Actions requises

  – Réaliser des maquettes pour le projet de réaménagement de la pièce
– Définir précisément les besoins et attentes des maîtres d'ouvrage pour le réaménagement
– Établir un nouveau planning prévisionnel adapté au projet révisé
– Relancer la consultation d'artisans selon les nouveaux besoins identifiés
– Programmer une nouvelle réunion de validation du concept avec les maîtres d'ouvrage$bak3$
WHERE id = '37cc5fd9-0679-4838-9167-90487aedcf8e';

-- CR suivi — dossier 44cd5da5-d86c-444c-8333-5c294f1a9001
UPDATE comptes_rendus SET contenu_final = $bak4$## 1. Identification du chantier

  **Référence :** 2026-AM-001
**Maître d'ouvrage :** M. et Mme Jerome Jadras & Marjorie null
**Adresse :** 13500 MARTIGUES
**Type de prestation :** AMO
**Référente illiCO :** Anne-Lise Caillet
**Numéro de CR :** N°3
**Intervenants présents :** MJ RENOVATION## 2. Avancement des travaux par lot

  **MJ RENOVATION :**
– Isolation réalisée conformément au plan d'isolation HSH Décoration & Aménagement
– Mise en œuvre conforme aux spécifications techniques (isolation thermique 13cm, isolation phonique 7cm)
– Respect des dimensions et implantations selon plan échelle 1/75
– Travaux de finition en cours : bandes et ponçage restant à effectuer
– Avancement global du lot : 90% terminé## 3. Planning prévisionnel

  **Prochaine intervention MJ RENOVATION :** Finalisation bandes et ponçage isolation
**Validation technique :** Plan d'isolation HSH soumis aux artisans exécuteurs pour coordination des lots suivants## 4. Points de retard ou incidents

  Aucun retard ou incident signalé. Les travaux d'isolation progressent selon les prévisions.## 5. Actions requises

  – Finaliser les bandes et ponçage par MJ RENOVATION
– Coordonner avec les autres artisans (D2M ELECTRICITE, SUD RENOV ENERGIE) pour la suite des interventions
– Valider la conformité finale de l'isolation avant passage aux lots suivants$bak4$
WHERE id = '6b77ed04-c085-4e10-ae0f-be0e99a1ec57';

-- CR r3 — dossier 44cd5da5-d86c-444c-8333-5c294f1a9001
UPDATE comptes_rendus SET contenu_final = $bak5$## 1. Identification du chantier

  **Référence :** 2026-AM-001
**Maître d'ouvrage :** M. et Mme Jerome Jadras & Marjorie null
**Adresse :** 13500 MARTIGUES
**Type de prestation :** AMO
**Référente illiCO :** Anne-Lise Caillet
**Artisans du chantier :** L HABITAT FRANCAIS, HSH Décoration & Aménagement, SUD RENOV ENERGIE, ESPRIT CUISINES, MJ RENOVATION, AM SERVICE
**Numéro de CR :** N°4## 2. Récapitulatif des devis présentés

  – **L HABITAT FRANCAIS :** Devis signé
– **HSH Décoration & Aménagement :** Devis signé - conception et plans d'aménagement complets
– **SUD RENOV ENERGIE :** Devis signé
– **ESPRIT CUISINES :** Devis signé
– **AM SERVICE :** Devis signé
– **MJ RENOVATION :** Devis NON signé
– **D2M :** Devis NON signé## 3. Points de discussion

  – Changement d'avis des clients concernant certains artisans
– Demande d'ajout de prises USB sur l'installation électrique
– Modification du choix de carrelage pour le sol
– Présentation des plans détaillés HSH avec métrés indicatifs
– Validation des coloris et matériaux sélectionnés (ALVIC Cashmere, ALVIC Velasquez, ICE CREAM 01JA)
– Contraintes techniques liées aux murs non droits nécessitant des adaptations## 4. Décisions prises

  – Signature validée pour 5 entreprises sur 7
– Non-reconduction des prestations MJ RENOVATION et D2M suite au changement d'avis clients
– Intégration des prises USB supplémentaires dans le lot électrique
– Modification du carrelage sol selon nouveau choix clients
– Validation des plans d'aménagement HSH Décoration avec toutes les spécifications techniques
– Accord sur les coloris et matériaux présentés## 5. Prochaines étapes

  – Recherche et sélection de nouveaux artisans pour remplacer MJ RENOVATION et D2M
– Mise à jour des devis électricité avec prises USB supplémentaires
– Finalisation commande carrelage sol selon nouveau choix
– Coordination entre artisans retenus pour planification des travaux
– Validation définitive planning d'intervention une fois tous devis signés$bak5$
WHERE id = '33b49adb-9855-4a43-b1a3-f950ccbf319c';

COMMIT;
*/
