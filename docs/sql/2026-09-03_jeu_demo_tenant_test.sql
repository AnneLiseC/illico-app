-- ═══════════════════════════════════════════════════════════════════════════
-- JEU DE DÉMONSTRATION — tenant de test uniquement
-- Fichier : docs/sql/2026-09-03_jeu_demo_tenant_test.sql
-- Écrit le 03/09/2026
--
-- OBJET   Peupler le compte franchisé de test avec des données fictives
--         présentables, pour servir de démonstration à de futurs clients.
--
-- PÉRIMÈTRE  Société  ef0b86f1-066c-44b1-a3ba-098dfb41d2d8  (« test »)
--            Agence   50654b35-8eef-430e-be4f-adf0e95a63b9
--         AUCUNE ligne de ce fichier ne touche la société CTP.
--         Toutes les insertions portent ces deux identifiants en dur.
--
-- DONNÉES  Entièrement fictives :
--          · e-mails en @exemple.test — TLD réservé RFC 2606, qui ne résout
--            jamais. C'est volontaire : le cron de relances envoie de vrais
--            mails, et une adresse plausible mais réelle enverrait du courrier
--            à un inconnu.
--          · téléphones en 06 39 98 xx xx (plage de fiction).
--          · aucune photo, aucun document : les fichiers n'existent pas dans
--            le Storage, des vignettes cassées feraient plus de mal que de bien.
--
-- MÉTHODE  Le fichier se termine par ROLLBACK. Vérifie le bloc de contrôle,
--          puis remplace ROLLBACK par COMMIT et rejoue.
--
-- ANNULATION  docs/sql/2026-09-03_jeu_demo_tenant_test_ROLLBACK.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── A. Habillage du tenant de démonstration ──────────────────────────────
-- Sans ça, l'écran affiche « test » et « illioc test » devant un prospect.
-- Les e-mails de connexion ne sont PAS touchés : tu te connectes comme avant.

update societes
   set nom_societe = 'RÉNOV CONSEIL ÎLE-DE-FRANCE', siret = '90112233400021', rcs = 'Nanterre B 901 122 334'
 where id = 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8';

update agences
   set nom = 'illiCO travaux Paris 15', ville = 'Paris', code_postal = '75015',
       adresse = '24 rue des Volontaires', telephone = '01 39 98 00 15',
       email = 'paris15@exemple.test', responsable_nom = 'Julien Marchand'
 where id = '50654b35-8eef-430e-be4f-adf0e95a63b9';

update profiles set nom = 'Marchand', prenom = 'Julien'  where id = 'db435e64-d392-4585-b5f8-ea50c5fb8324';  -- ton login, nom d'affichage seulement
update profiles set nom = 'Vasseur',  prenom = 'Camille' where id = 'c36f9d39-a7cf-4c54-8774-4491908ff7dc';

-- ─── B. Jeu de données ────────────────────────────────────────────────────

insert into artisans (id, nom, prenom, entreprise, metier, email, telephone, ville, code_postal, partenaire, paiement_direct, societe_id) values
  ('c6dd2993-a2ea-4f37-a49c-9bb1019ab13a', 'Bertin', 'Nicolas', 'BERTIN RÉNOVATION', 'maçonnerie', 'contact@bertin.exemple.test', '06 39 98 10 40', 'Nanterre', '92000', false, false, 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8'),
  ('6c0bd7f4-4807-4c4d-b3a5-3f40e914bb77', 'Lombard', 'Éric', 'ATELIER LOMBARD MENUISERIE', 'menuiserie', 'contact@lombard.exemple.test', '06 39 98 11 41', 'Montrouge', '92120', false, false, 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8'),
  ('e9572bb8-43f6-4163-97db-b149e51f2607', 'Ferrand', 'Sofiane', 'FERRAND ÉLECTRICITÉ', 'électricité', 'contact@ferrand.exemple.test', '06 39 98 12 42', 'Paris', '75015', true, false, 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8'),
  ('303a072d-a820-4903-b0ce-476246418420', 'Dumas', 'Karine', 'DUMAS PLOMBERIE CHAUFFAGE', 'plomberie', 'contact@dumas.exemple.test', '06 39 98 13 43', 'Issy-les-Moulineaux', '92130', true, false, 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8'),
  ('2dd1ec21-82c0-46b6-9669-881e66b51826', 'Nogueira', 'Paulo', 'NOGUEIRA CARRELAGE', 'carrelage', 'contact@nogueira.exemple.test', '06 39 98 14 44', 'Vanves', '92170', false, false, 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8'),
  ('fedd1a05-c49f-4156-86d4-1ffe642f9a0b', 'Pichon', 'Thierry', 'PICHON PEINTURE & DÉCO', 'peinture', 'contact@pichon.exemple.test', '06 39 98 15 45', 'Paris', '75014', true, false, 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8'),
  ('7927e38f-b99c-46cd-8310-149aa3ff5eb0', 'Alvarez', 'Manon', 'ALVAREZ COUVERTURE', 'couverture', 'contact@alvarez.exemple.test', '06 39 98 16 46', 'Clamart', '92140', false, false, 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8'),
  ('74c14e34-821a-4840-beec-9837c14d66dd', 'Rey', 'Damien', 'REY MENUISERIE ALU', 'menuiserie alu', 'contact@rey.exemple.test', '06 39 98 17 47', 'Malakoff', '92240', false, false, 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8'),
  ('aa4827cf-cd5a-4c4c-9352-0ff634978efe', 'Costa', 'Léa', 'COSTA PLÂTRERIE', 'plâtrerie', 'contact@costa.exemple.test', '06 39 98 18 48', 'Paris', '75013', false, false, 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8'),
  ('bcf57c74-b64f-429f-a121-e0327f3fae37', 'Sauvage', 'Hugo', 'SAUVAGE CUISINES', 'agencement', 'contact@sauvage.exemple.test', '06 39 98 19 49', 'Boulogne-Billancourt', '92100', false, false, 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8');

insert into clients (id, nom, prenom, civilite, prenom2, nom2, email, telephone, adresse, type_client, referente, agence_id, societe_id) values
  ('a22791ba-3e72-471c-b96d-8da58c782c9c', 'DELAUNAY', 'Sophie', 'Mme', NULL, NULL, 'sophie.delaunay@exemple.test', '06 39 98 50 12', '14 rue des Volontaires, 75015 Paris', 'particulier', 'db435e64-d392-4585-b5f8-ea50c5fb8324', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8'),
  ('ee253703-f3e0-4e47-829e-0e631922cc87', 'MERCIER', 'Antoine', 'M.', NULL, NULL, 'antoine.mercier@exemple.test', '06 39 98 51 13', '3 allée des Peupliers, 92130 Issy-les-Moulineaux', 'particulier', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8'),
  ('1628e4f5-7e19-4887-bcba-b0397b25ff74', 'BOURGEOIS', 'Claire', 'Mme', NULL, NULL, 'claire.bourgeois@exemple.test', '06 39 98 52 14', '27 avenue Victor Cresson, 92130 Issy-les-Moulineaux', 'particulier', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8'),
  ('a73a457f-89b6-4f51-9e9d-891586ee3ca5', 'TANGUY', 'Mathieu', 'M. et Mme', 'Élodie', 'ROUSSEL', 'mathieu.tanguy@exemple.test', '06 39 98 53 15', '8 rue du Moulin, 92240 Malakoff', 'particulier', 'db435e64-d392-4585-b5f8-ea50c5fb8324', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8'),
  ('f37d5aa6-c654-46e6-ac74-6fa58f28972e', 'NGUYEN', 'Lan', 'Mme', NULL, NULL, 'lan.nguyen@exemple.test', '06 39 98 54 16', '41 rue Raymond Losserand, 75014 Paris', 'particulier', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8'),
  ('f0a3329f-c73b-4b19-b959-2ddc2668e99b', 'PEREIRA', 'Joaquim', 'M.', NULL, NULL, 'joaquim.pereira@exemple.test', '06 39 98 55 17', '12 rue Gabriel Péri, 92120 Montrouge', 'particulier', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8'),
  ('158907c5-5d08-4297-8680-d22efb6b60e6', 'LAURENT', 'Béatrice', 'Mme', NULL, NULL, 'béatrice.laurent@exemple.test', '06 39 98 56 18', '5 square des Acacias, 92170 Vanves', 'particulier', 'db435e64-d392-4585-b5f8-ea50c5fb8324', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8'),
  ('12e2c9c8-8d69-40f5-9670-005a982ddf53', 'BOUCHER', 'Yann', 'M.', NULL, NULL, 'yann.boucher@exemple.test', '06 39 98 57 19', '19 rue de Vanves, 92100 Boulogne-Billancourt', 'particulier', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8'),
  ('a74515ab-dbb2-4d28-b071-e4fd8de6f7c9', 'MARTINEZ', 'Inès', 'Mme', NULL, NULL, 'inès.martinez@exemple.test', '06 39 98 58 20', '33 boulevard Gambetta, 92140 Clamart', 'particulier', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8'),
  ('72356e36-1571-41d6-881e-cd221784c466', 'VIDAL', 'Pierre', 'M.', NULL, NULL, 'pierre.vidal@exemple.test', '06 39 98 59 21', '7 rue Bourgon, 75013 Paris', 'particulier', 'db435e64-d392-4585-b5f8-ea50c5fb8324', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8'),
  ('d97b7018-2eb6-4d50-ba2a-ed11fe355864', 'CHEVALIER', 'Nadège', 'Mme', NULL, NULL, 'nadège.chevalier@exemple.test', '06 39 98 60 22', '22 rue Jean Jaurès, 92000 Nanterre', 'particulier', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8'),
  ('bf3cab31-14ba-457d-ac2f-59f5a20ffedd', 'GIRAUD', 'Thomas', 'M.', NULL, NULL, 'thomas.giraud@exemple.test', '06 39 98 61 23', '60 rue Olivier de Serres, 75015 Paris', 'particulier', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8');

insert into dossiers (id, reference, client_id, referente_id, typologie, statut, frais_consultation, frais_statut, honoraires_amo_taux, taux_courtage, part_agente, frais_part_agente, contrat_signe, date_signature_contrat, date_premier_rdv, date_demarrage_chantier, date_fin_chantier, date_cloture, description, adresse_chantier, agence_id, societe_id, created_at) values
  ('2da9eb8d-f40f-45e9-b274-3191e5dac611', '2026-AM-001', 'a22791ba-3e72-471c-b96d-8da58c782c9c', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc', 'amo', NULL, 450, 'regle', 9, 0.06, 0.5, 1, true, '2026-02-16', '2026-02-09', '2026-06-15', NULL, NULL, 'Rénovation complète d''un appartement de 78 m² : cuisine ouverte, salle d''eau, électricité et peintures.', '14 rue des Volontaires, 75015 Paris', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', '2026-01-30 09:15:00'),
  ('4dc052ee-c493-47ad-95eb-57344e7dd0cb', '2026-CT-002', 'ee253703-f3e0-4e47-829e-0e631922cc87', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc', 'courtage', NULL, 300, 'regle', 9, 0.06, 0.5, 1, true, '2026-04-14', '2026-04-07', '2026-08-24', NULL, NULL, 'Extension de 22 m² sur jardin, ossature bois et raccordements.', '3 allée des Peupliers, 92130 Issy-les-Moulineaux', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', '2026-03-31 09:15:00'),
  ('733cbeec-c0f4-492a-93c5-b742f7d15c3a', '2026-CT-003', '1628e4f5-7e19-4887-bcba-b0397b25ff74', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc', 'courtage', NULL, NULL, 'offerts', 9, 0.06, 0.5, 1, true, '2026-07-28', '2026-07-21', NULL, NULL, NULL, 'Réfection d''une salle de bains et remplacement des menuiseries.', '27 avenue Victor Cresson, 92130 Issy-les-Moulineaux', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', '2026-07-16 09:15:00'),
  ('d66cb8d9-1fea-4c3c-9153-8869357645da', '2026-AM-004', 'a73a457f-89b6-4f51-9e9d-891586ee3ca5', 'db435e64-d392-4585-b5f8-ea50c5fb8324', 'amo', NULL, 500, 'regle', 7, 0.06, 0, 0, true, '2026-06-11', '2026-06-02', '2026-11-02', NULL, NULL, 'Surélévation partielle et création d''une suite parentale.', '8 rue du Moulin, 92240 Malakoff', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', '2026-05-27 09:15:00'),
  ('86382e23-8a12-4665-953e-e2a5c78dfe28', '2026-CT-005', 'f37d5aa6-c654-46e6-ac74-6fa58f28972e', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc', 'courtage', 'termine', 250, 'regle', 9, 0.06, 0.5, 1, true, '2026-01-22', '2026-01-15', '2026-03-09', '2026-06-26', '2026-07-18', 'Rénovation d''un T3 avant mise en location.', '41 rue Raymond Losserand, 75014 Paris', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', '2026-01-05 09:15:00'),
  ('f23ae663-3a93-490e-970c-b853484972a9', '2026-CT-006', 'f0a3329f-c73b-4b19-b959-2ddc2668e99b', 'db435e64-d392-4585-b5f8-ea50c5fb8324', 'courtage', 'termine', NULL, 'offerts', 9, 0.06, 0, 0, true, '2025-11-27', '2025-11-18', '2026-01-12', '2026-04-30', '2026-05-22', 'Remplacement de la couverture et isolation des combles.', '12 rue Gabriel Péri, 92120 Montrouge', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', '2025-11-10 09:15:00'),
  ('8cbabbd5-8c78-4fc1-ba9b-c8818757b596', '2026-AM-007', '158907c5-5d08-4297-8680-d22efb6b60e6', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc', 'amo', 'termine', 400, 'regle', 8, 0.05, 0.5, 1, true, '2026-02-05', '2026-01-29', '2026-04-06', '2026-08-07', '2026-08-28', 'Réhabilitation d''une maison de ville, tous corps d''état.', '5 square des Acacias, 92170 Vanves', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', '2026-01-23 09:15:00'),
  ('63974b9e-3efd-41c6-986b-8420ef440fe1', '2026-CT-008', '12e2c9c8-8d69-40f5-9670-005a982ddf53', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc', 'courtage', 'annule', NULL, 'offerts', 9, 0.06, 0.5, 1, false, NULL, '2026-03-10', NULL, NULL, '2026-04-15', 'Projet de véranda reporté par le client (financement non obtenu).', '19 rue de Vanves, 92100 Boulogne-Billancourt', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', '2026-02-28 09:15:00'),
  ('fbe3dcca-14bd-49a7-955c-d4f070804f36', '2026-CT-009', 'a74515ab-dbb2-4d28-b071-e4fd8de6f7c9', 'db435e64-d392-4585-b5f8-ea50c5fb8324', 'courtage', 'annule', 150, 'rembourse', 9, 0.06, 0, 0, true, '2026-03-03', '2026-02-24', NULL, NULL, '2026-05-06', 'Rénovation énergétique abandonnée, bien revendu en cours d''étude.', '33 boulevard Gambetta, 92140 Clamart', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', '2026-02-16 09:15:00'),
  ('8130be9a-dcc7-4fdb-8a7b-7a700e3e85eb', '2026-ES-010', '72356e36-1571-41d6-881e-cd221784c466', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc', 'estimo', NULL, 190, 'regle', 9, 0.06, 0.5, 1, true, '2026-08-18', '2026-08-11', NULL, NULL, NULL, 'Estimation travaux avant acquisition d''un 3 pièces.', '7 rue Bourgon, 75013 Paris', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', '2026-08-06 09:15:00'),
  ('c192caf3-7930-4932-b198-20cc66740b08', '2026-MR-011', 'd97b7018-2eb6-4d50-ba2a-ed11fe355864', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc', 'merad', NULL, NULL, 'offerts', 9, 0.06, 0.5, 1, true, '2026-08-25', '2026-08-20', '2026-09-14', '2026-09-25', NULL, 'Mission MERAD — adaptation du logement au maintien à domicile.', '22 rue Jean Jaurès, 92000 Nanterre', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', '2026-08-09 09:15:00'),
  ('3e27e812-fc5d-490d-8f6c-2023df7210b3', '2026-CT-012', 'bf3cab31-14ba-457d-ac2f-59f5a20ffedd', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc', 'courtage', NULL, NULL, 'offerts', 9, 0.06, 0.5, 1, false, NULL, '2026-09-09', NULL, NULL, NULL, 'Première prise de contact — rénovation d''un studio de 26 m².', '60 rue Olivier de Serres, 75015 Paris', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', '2026-08-29 09:15:00');

insert into devis_artisans (id, dossier_id, artisan_id, montant_ht, montant_ttc, statut, date_reception, date_limite, date_signature, commission_pourcentage, acompte_pourcentage, ordre) values
  ('3e631843-72b6-4e4d-9205-0f3d803b35aa', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'c6dd2993-a2ea-4f37-a49c-9bb1019ab13a', 24800, 27280.0, 'accepte', '2026-03-12', '2026-04-02', '2026-04-02', 0.12, 30, 0),
  ('b6fd2805-52bd-4422-aab5-2e67c7a9a890', '2da9eb8d-f40f-45e9-b274-3191e5dac611', '303a072d-a820-4903-b0ce-476246418420', 18400, 20240.0, 'accepte', '2026-03-18', '2026-04-08', '2026-04-02', 0.12, 30, 1),
  ('be461806-27fa-48fc-a22b-9f2da0d44215', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'e9572bb8-43f6-4163-97db-b149e51f2607', 11250, 12375.0, 'accepte', '2026-03-20', '2026-04-10', '2026-04-09', 0.15, 30, 2),
  ('908c8333-58f8-48ee-9347-beb969af3763', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'bcf57c74-b64f-429f-a121-e0327f3fae37', 21900, 24090.0, 'accepte', '2026-04-03', '2026-04-24', '2026-04-24', 0.1, 40, 3),
  ('78e2c81b-1908-4f51-954f-772def433071', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'fedd1a05-c49f-4156-86d4-1ffe642f9a0b', 8600, 9460.0, 'accepte', '2026-05-11', '2026-06-01', '2026-05-26', 0.15, 30, 4),
  ('6a734f95-290a-419a-ba5a-5b2951e61f41', '2da9eb8d-f40f-45e9-b274-3191e5dac611', '2dd1ec21-82c0-46b6-9669-881e66b51826', 9750, 10725.0, 'refuse', '2026-03-25', '2026-04-15', NULL, 0.12, 30, 5),
  ('aa44b6ea-41f3-4d1c-aa25-dcb160776730', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', 'c6dd2993-a2ea-4f37-a49c-9bb1019ab13a', 31500, 34650.0, 'accepte', '2026-05-19', '2026-06-09', '2026-06-09', 0.12, 30, 6),
  ('f8c914c4-67b2-4946-99da-32824c84c2a6', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', '6c0bd7f4-4807-4c4d-b3a5-3f40e914bb77', 17800, 19580.0, 'accepte', '2026-05-26', '2026-06-16', '2026-06-09', 0.1, 30, 7),
  ('5379e173-8c25-4bfe-b40e-8efe8782d334', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', 'e9572bb8-43f6-4163-97db-b149e51f2607', 9400, 10340.0, 'accepte', '2026-06-15', '2026-07-06', '2026-07-01', 0.15, 30, 8),
  ('b4726614-68f0-456d-9e46-ac5d38bdf531', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', '7927e38f-b99c-46cd-8310-149aa3ff5eb0', 6200, 6820.0, 'recu', '2026-08-25', '2026-09-15', NULL, 0.12, 30, 9),
  ('48682056-c09d-4097-85e3-50539f9ecbe2', '733cbeec-c0f4-492a-93c5-b742f7d15c3a', '303a072d-a820-4903-b0ce-476246418420', 12600, 13860.0, 'recu', '2026-08-18', '2026-09-08', NULL, 0.12, 30, 10),
  ('1209e167-fefd-4d8a-be82-dc9434dea419', '733cbeec-c0f4-492a-93c5-b742f7d15c3a', '74c14e34-821a-4840-beec-9837c14d66dd', 9850, 10835.0, 'recu', '2026-08-26', '2026-09-16', NULL, 0.1, 30, 11),
  ('937990a0-4344-490a-b0a7-c83f7cc8adbf', '733cbeec-c0f4-492a-93c5-b742f7d15c3a', '2dd1ec21-82c0-46b6-9669-881e66b51826', 7300, 8030.0, 'en_attente', NULL, NULL, NULL, 0.12, 30, 12),
  ('ce3c100a-dae2-4d24-9aa5-a5cf0f33fe61', 'd66cb8d9-1fea-4c3c-9153-8869357645da', 'c6dd2993-a2ea-4f37-a49c-9bb1019ab13a', 38900, 42790.0, 'accepte', '2026-07-06', '2026-07-27', '2026-07-29', 0.12, 30, 13),
  ('be282fc6-e5c3-4c00-ae0c-acedadb0f997', 'd66cb8d9-1fea-4c3c-9153-8869357645da', 'aa4827cf-cd5a-4c4c-9352-0ff634978efe', 14200, 15620.0, 'accepte', '2026-07-13', '2026-08-03', '2026-07-29', 0.12, 30, 14),
  ('2545031e-f3b5-4657-9d38-f0544c989934', 'd66cb8d9-1fea-4c3c-9153-8869357645da', 'e9572bb8-43f6-4163-97db-b149e51f2607', 10500, 11550.0, 'a_modifier', '2026-08-24', '2026-09-14', NULL, 0.15, 30, 15),
  ('f6bdbbdb-03a2-4606-9946-e6bdb6859517', '86382e23-8a12-4665-953e-e2a5c78dfe28', 'c6dd2993-a2ea-4f37-a49c-9bb1019ab13a', 22400, 24640.0, 'accepte', '2026-02-10', '2026-03-03', '2026-02-26', 0.12, 30, 16),
  ('1a485343-434b-45b3-90db-01a0948a27f3', '86382e23-8a12-4665-953e-e2a5c78dfe28', 'fedd1a05-c49f-4156-86d4-1ffe642f9a0b', 12900, 14190.0, 'accepte', '2026-02-17', '2026-03-10', '2026-02-26', 0.15, 30, 17),
  ('f19a7c25-77df-4cf7-859a-c3572bd34436', '86382e23-8a12-4665-953e-e2a5c78dfe28', '2dd1ec21-82c0-46b6-9669-881e66b51826', 12700, 13970.0, 'accepte', '2026-03-02', '2026-03-23', '2026-03-16', 0.12, 30, 18),
  ('c95bdd15-d1f0-4473-9a06-c97872a06dbf', 'f23ae663-3a93-490e-970c-b853484972a9', '7927e38f-b99c-46cd-8310-149aa3ff5eb0', 19800, 21780.0, 'accepte', '2025-12-08', '2025-12-29', '2025-12-19', 0.12, 30, 19),
  ('4d5c0fb8-d390-44d4-9716-ead69c90f81f', 'f23ae663-3a93-490e-970c-b853484972a9', 'aa4827cf-cd5a-4c4c-9352-0ff634978efe', 11400, 12540.0, 'accepte', '2025-12-15', '2026-01-05', '2025-12-19', 0.12, 30, 20),
  ('9fb91683-0deb-4ba9-a503-45de02409408', '8cbabbd5-8c78-4fc1-ba9b-c8818757b596', 'c6dd2993-a2ea-4f37-a49c-9bb1019ab13a', 16700, 18370.0, 'accepte', '2026-02-16', '2026-03-09', '2026-03-05', 0.12, 30, 21),
  ('96d81c53-4990-42c1-bea4-5cd87c55297f', '8cbabbd5-8c78-4fc1-ba9b-c8818757b596', '303a072d-a820-4903-b0ce-476246418420', 10200, 11220.0, 'accepte', '2026-02-20', '2026-03-13', '2026-03-05', 0.12, 30, 22),
  ('2719127f-4171-4c89-b36c-85eb0874d587', '8cbabbd5-8c78-4fc1-ba9b-c8818757b596', 'e9572bb8-43f6-4163-97db-b149e51f2607', 7450, 8195.0, 'accepte', '2026-02-24', '2026-03-17', '2026-03-12', 0.15, 30, 23),
  ('c157a1f1-ffef-406e-904d-019d37e77afa', '8cbabbd5-8c78-4fc1-ba9b-c8818757b596', 'fedd1a05-c49f-4156-86d4-1ffe642f9a0b', 7900, 8690.0, 'accepte', '2026-04-20', '2026-05-11', '2026-05-07', 0.15, 30, 24),
  ('455ab15a-0037-4a0e-9d41-69c2d4283dfb', '63974b9e-3efd-41c6-986b-8420ef440fe1', '6c0bd7f4-4807-4c4d-b3a5-3f40e914bb77', 15400, 16940.0, 'refuse', '2026-03-24', '2026-04-14', NULL, 0.1, 30, 25),
  ('7eed9c1b-201d-4d39-b1b9-0238d262e520', 'fbe3dcca-14bd-49a7-955c-d4f070804f36', '7927e38f-b99c-46cd-8310-149aa3ff5eb0', 8900, 9790.0, 'refuse', '2026-03-17', '2026-04-07', NULL, 0.12, 30, 26),
  ('eb648ad4-2899-4f0d-abc8-4d4230f3e0ba', 'c192caf3-7930-4932-b198-20cc66740b08', 'aa4827cf-cd5a-4c4c-9352-0ff634978efe', 6400, 7040.0, 'accepte', '2026-08-26', '2026-09-16', '2026-08-31', 0.12, 30, 27);

insert into suivi_financier (id, dossier_id, type_echeance, artisan_id, montant_ht, montant_ttc, statut_client, statut_illico, statut_ctp, date_echeance, date_reglement, mode_reglement, date_paiement) values
  ('24076ca3-4357-44c1-b0f0-b6c7262d2697', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'frais_consultation', NULL, NULL, NULL, 'regle', 'en_attente', 'en_attente', '2026-02-16', '2026-02-16', 'virement', NULL),
  ('1ef9b29f-5d22-451b-82d0-093e44e9aa74', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'honoraires_courtage', NULL, NULL, 5606.7, 'regle', 'en_attente', 'en_attente', '2026-08-20', '2026-08-20', 'virement', '2026-08-20'),
  ('88c4fee3-1c2a-43ff-ad5b-6cffefc6d88a', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'acompte_amo', NULL, NULL, 4205.03, 'regle', 'en_attente', 'en_attente', '2026-08-20', '2026-08-20', 'virement', '2026-08-20'),
  ('faeaef01-f5ef-4651-837d-f726b82548be', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'solde_amo_paiement', NULL, NULL, 4205.02, 'en_attente', 'en_attente', 'en_attente', NULL, NULL, NULL, NULL),
  ('50462da2-0ff5-47af-8c9b-1fa1fd9287c5', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'acompte_artisan', 'c6dd2993-a2ea-4f37-a49c-9bb1019ab13a', NULL, NULL, 'regle', 'recu', 'en_attente', '2026-04-02', '2026-04-02', 'virement', '2026-04-02'),
  ('6d99bb55-93d3-4f95-8e3d-9869790a5ccb', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'acompte_artisan', '303a072d-a820-4903-b0ce-476246418420', NULL, NULL, 'regle', 'recu', 'en_attente', '2026-04-02', '2026-04-02', 'virement', '2026-04-02'),
  ('73bb7a70-0372-46d7-a659-1e3ca4a2ed56', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'acompte_artisan', 'e9572bb8-43f6-4163-97db-b149e51f2607', NULL, NULL, 'regle', 'recu', 'en_attente', '2026-04-09', '2026-04-09', 'virement', '2026-04-09'),
  ('bba1ae7f-f4bf-40c5-9c1e-009f0324209e', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'acompte_artisan', 'bcf57c74-b64f-429f-a121-e0327f3fae37', NULL, NULL, 'regle', 'recu', 'en_attente', '2026-04-24', '2026-04-24', 'virement', '2026-04-24'),
  ('58a2fe00-2578-432d-99e9-2076ff62af6d', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'acompte_artisan', 'fedd1a05-c49f-4156-86d4-1ffe642f9a0b', NULL, NULL, 'regle', 'recu', 'en_attente', '2026-05-26', '2026-05-26', 'virement', '2026-05-26'),
  ('b328cbcc-c1ee-4fdf-922c-f16e11a70124', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', 'frais_consultation', NULL, NULL, NULL, 'regle', 'en_attente', 'en_attente', '2026-04-14', '2026-04-14', 'virement', NULL),
  ('1b6c06f9-3655-47ce-a5b2-90c471cc9fd3', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', 'honoraires_courtage', NULL, NULL, 3874.2, 'regle', 'en_attente', 'en_attente', '2026-08-20', '2026-08-20', 'virement', '2026-08-20'),
  ('349788a8-ade5-4ce3-b19e-6b113516ad27', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', 'acompte_artisan', 'c6dd2993-a2ea-4f37-a49c-9bb1019ab13a', NULL, NULL, 'regle', 'recu', 'en_attente', '2026-06-09', '2026-06-09', 'virement', '2026-06-09'),
  ('1c47ed3d-fa0e-40d6-a9e7-646ad1bc3266', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', 'acompte_artisan', '6c0bd7f4-4807-4c4d-b3a5-3f40e914bb77', NULL, NULL, 'regle', 'recu', 'en_attente', '2026-06-09', '2026-06-09', 'virement', '2026-06-09'),
  ('1672336a-5323-4901-9f43-27751a58e10c', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', 'acompte_artisan', 'e9572bb8-43f6-4163-97db-b149e51f2607', NULL, NULL, 'regle', 'recu', 'en_attente', '2026-07-01', '2026-07-01', 'virement', '2026-07-01'),
  ('93725a25-8bc9-47da-8d8b-311d9e87ccc3', 'd66cb8d9-1fea-4c3c-9153-8869357645da', 'frais_consultation', NULL, NULL, NULL, 'regle', 'en_attente', 'en_attente', '2026-06-11', '2026-06-11', 'virement', NULL),
  ('736d6fc1-1a4e-4222-b1dd-d49f73209231', 'd66cb8d9-1fea-4c3c-9153-8869357645da', 'honoraires_courtage', NULL, NULL, 3504.6, 'en_attente', 'en_attente', 'en_attente', NULL, NULL, NULL, NULL),
  ('b3f4a294-70fb-42a0-892e-76a8b700305b', 'd66cb8d9-1fea-4c3c-9153-8869357645da', 'acompte_amo', NULL, NULL, 2044.35, 'en_attente', 'en_attente', 'en_attente', NULL, NULL, NULL, NULL),
  ('97e4e68e-ad1f-4302-b196-fb727a455fad', 'd66cb8d9-1fea-4c3c-9153-8869357645da', 'solde_amo_paiement', NULL, NULL, 2044.35, 'en_attente', 'en_attente', 'en_attente', NULL, NULL, NULL, NULL),
  ('af2081e0-87a5-46c4-8bc6-ad405f85f318', 'd66cb8d9-1fea-4c3c-9153-8869357645da', 'acompte_artisan', 'c6dd2993-a2ea-4f37-a49c-9bb1019ab13a', NULL, NULL, 'regle', 'recu', 'en_attente', '2026-07-29', '2026-07-29', 'virement', '2026-07-29'),
  ('07bd289f-c662-4b07-97dd-f0094001a0f8', 'd66cb8d9-1fea-4c3c-9153-8869357645da', 'acompte_artisan', 'aa4827cf-cd5a-4c4c-9352-0ff634978efe', NULL, NULL, 'regle', 'recu', 'en_attente', '2026-07-29', '2026-07-29', 'virement', '2026-07-29'),
  ('ad760732-1b96-49aa-8b03-f0706d2b95e7', '86382e23-8a12-4665-953e-e2a5c78dfe28', 'frais_consultation', NULL, NULL, NULL, 'regle', 'en_attente', 'en_attente', '2026-01-22', '2026-01-22', 'virement', NULL),
  ('785099be-4405-4446-9129-faa3d27b57d3', '86382e23-8a12-4665-953e-e2a5c78dfe28', 'honoraires_courtage', NULL, NULL, 3168.0, 'regle', 'en_attente', 'en_attente', '2026-07-18', '2026-07-18', 'virement', '2026-07-18'),
  ('4154aee5-db09-45b2-8c19-7522a14b6e71', '86382e23-8a12-4665-953e-e2a5c78dfe28', 'acompte_artisan', 'c6dd2993-a2ea-4f37-a49c-9bb1019ab13a', NULL, NULL, 'regle', 'recu', 'en_attente', '2026-02-26', '2026-02-26', 'virement', '2026-02-26'),
  ('95e4191b-03cd-4ed5-8418-7ef35135d1a5', '86382e23-8a12-4665-953e-e2a5c78dfe28', 'facture_finale', 'c6dd2993-a2ea-4f37-a49c-9bb1019ab13a', NULL, NULL, 'regle', 'en_attente', 'en_attente', '2026-06-26', '2026-06-26', 'virement', '2026-06-26'),
  ('fbf1947d-1741-47c7-97eb-3d7a44ec8697', '86382e23-8a12-4665-953e-e2a5c78dfe28', 'acompte_artisan', 'fedd1a05-c49f-4156-86d4-1ffe642f9a0b', NULL, NULL, 'regle', 'recu', 'en_attente', '2026-02-26', '2026-02-26', 'virement', '2026-02-26'),
  ('d2de5e0d-8b06-4f77-a063-ec732b896325', '86382e23-8a12-4665-953e-e2a5c78dfe28', 'facture_finale', 'fedd1a05-c49f-4156-86d4-1ffe642f9a0b', NULL, NULL, 'regle', 'en_attente', 'en_attente', '2026-06-26', '2026-06-26', 'virement', '2026-06-26'),
  ('416d2920-3654-45d4-b1ca-869fec4fb171', '86382e23-8a12-4665-953e-e2a5c78dfe28', 'acompte_artisan', '2dd1ec21-82c0-46b6-9669-881e66b51826', NULL, NULL, 'regle', 'recu', 'en_attente', '2026-03-16', '2026-03-16', 'virement', '2026-03-16'),
  ('0d2c3f35-3d1b-4e81-a941-0ec5b8771356', '86382e23-8a12-4665-953e-e2a5c78dfe28', 'facture_finale', '2dd1ec21-82c0-46b6-9669-881e66b51826', NULL, NULL, 'regle', 'en_attente', 'en_attente', '2026-06-26', '2026-06-26', 'virement', '2026-06-26'),
  ('1cfaed91-9777-4a7e-9385-e13187e9689d', 'f23ae663-3a93-490e-970c-b853484972a9', 'honoraires_courtage', NULL, NULL, 2059.2, 'regle', 'en_attente', 'en_attente', '2026-05-22', '2026-05-22', 'virement', '2026-05-22'),
  ('4233bcc7-9c75-4716-9292-5e44792d6722', 'f23ae663-3a93-490e-970c-b853484972a9', 'acompte_artisan', '7927e38f-b99c-46cd-8310-149aa3ff5eb0', NULL, NULL, 'regle', 'recu', 'en_attente', '2025-12-19', '2025-12-19', 'virement', '2025-12-19'),
  ('d85b8ba0-4e31-4710-809f-82ae4e7a15f2', 'f23ae663-3a93-490e-970c-b853484972a9', 'facture_finale', '7927e38f-b99c-46cd-8310-149aa3ff5eb0', NULL, NULL, 'regle', 'en_attente', 'en_attente', '2026-04-30', '2026-04-30', 'virement', '2026-04-30'),
  ('47e7b057-1e6b-4fb3-91fa-dbcd20e37ba5', 'f23ae663-3a93-490e-970c-b853484972a9', 'acompte_artisan', 'aa4827cf-cd5a-4c4c-9352-0ff634978efe', NULL, NULL, 'regle', 'recu', 'en_attente', '2025-12-19', '2025-12-19', 'virement', '2025-12-19'),
  ('7537da2d-fa5e-435a-a32a-fca0bb40f814', 'f23ae663-3a93-490e-970c-b853484972a9', 'facture_finale', 'aa4827cf-cd5a-4c4c-9352-0ff634978efe', NULL, NULL, 'regle', 'en_attente', 'en_attente', '2026-04-30', '2026-04-30', 'virement', '2026-04-30'),
  ('66bc2ea4-3b81-481c-a84e-9bd90051039e', '8cbabbd5-8c78-4fc1-ba9b-c8818757b596', 'frais_consultation', NULL, NULL, NULL, 'regle', 'en_attente', 'en_attente', '2026-02-05', '2026-02-05', 'virement', NULL),
  ('cc559787-9053-4466-844b-78dfae10168b', '8cbabbd5-8c78-4fc1-ba9b-c8818757b596', 'honoraires_courtage', NULL, NULL, 2323.75, 'regle', 'en_attente', 'en_attente', '2026-08-28', '2026-08-28', 'virement', '2026-08-28'),
  ('a5335a7c-25ac-40fe-b471-d8a0d9123a69', '8cbabbd5-8c78-4fc1-ba9b-c8818757b596', 'acompte_amo', NULL, NULL, 1859.0, 'regle', 'en_attente', 'en_attente', '2026-08-28', '2026-08-28', 'virement', '2026-08-28'),
  ('5ecb49f2-7c32-41ff-a470-3fc03d11d7c4', '8cbabbd5-8c78-4fc1-ba9b-c8818757b596', 'solde_amo_paiement', NULL, NULL, 1859.0, 'regle', 'en_attente', 'en_attente', '2026-08-28', '2026-08-28', 'virement', '2026-08-28'),
  ('6c0c705f-eeb4-4f72-b744-5caca9686980', '8cbabbd5-8c78-4fc1-ba9b-c8818757b596', 'acompte_artisan', 'c6dd2993-a2ea-4f37-a49c-9bb1019ab13a', NULL, NULL, 'regle', 'recu', 'en_attente', '2026-03-05', '2026-03-05', 'virement', '2026-03-05'),
  ('b942b926-0249-42f6-acee-e59a87e48dbd', '8cbabbd5-8c78-4fc1-ba9b-c8818757b596', 'facture_finale', 'c6dd2993-a2ea-4f37-a49c-9bb1019ab13a', NULL, NULL, 'regle', 'en_attente', 'en_attente', '2026-08-07', '2026-08-07', 'virement', '2026-08-07'),
  ('9997c9e6-5a2c-4c07-a806-d44a25d2e508', '8cbabbd5-8c78-4fc1-ba9b-c8818757b596', 'acompte_artisan', '303a072d-a820-4903-b0ce-476246418420', NULL, NULL, 'regle', 'recu', 'en_attente', '2026-03-05', '2026-03-05', 'virement', '2026-03-05'),
  ('a7c5791f-3470-4bf0-bfb2-5a905fad65b0', '8cbabbd5-8c78-4fc1-ba9b-c8818757b596', 'facture_finale', '303a072d-a820-4903-b0ce-476246418420', NULL, NULL, 'regle', 'en_attente', 'en_attente', '2026-08-07', '2026-08-07', 'virement', '2026-08-07'),
  ('88d32a27-97c2-4f36-917f-cdd2f1c4b8e5', '8cbabbd5-8c78-4fc1-ba9b-c8818757b596', 'acompte_artisan', 'e9572bb8-43f6-4163-97db-b149e51f2607', NULL, NULL, 'regle', 'recu', 'en_attente', '2026-03-12', '2026-03-12', 'virement', '2026-03-12'),
  ('63556cac-f44f-43ac-8a18-1dbc1c3916e0', '8cbabbd5-8c78-4fc1-ba9b-c8818757b596', 'facture_finale', 'e9572bb8-43f6-4163-97db-b149e51f2607', NULL, NULL, 'regle', 'en_attente', 'en_attente', '2026-08-07', '2026-08-07', 'virement', '2026-08-07'),
  ('dbd89ec1-5f49-46a3-baa4-6c7b366fbebd', '8cbabbd5-8c78-4fc1-ba9b-c8818757b596', 'acompte_artisan', 'fedd1a05-c49f-4156-86d4-1ffe642f9a0b', NULL, NULL, 'regle', 'recu', 'en_attente', '2026-05-07', '2026-05-07', 'virement', '2026-05-07'),
  ('ad22e82e-d746-4625-9d32-1d675fbd9424', '8cbabbd5-8c78-4fc1-ba9b-c8818757b596', 'facture_finale', 'fedd1a05-c49f-4156-86d4-1ffe642f9a0b', NULL, NULL, 'regle', 'en_attente', 'en_attente', '2026-08-07', '2026-08-07', 'virement', '2026-08-07'),
  ('377dcb41-48a6-487b-bb86-5ab58838bbe9', 'fbe3dcca-14bd-49a7-955c-d4f070804f36', 'frais_consultation', NULL, NULL, NULL, 'regle', 'en_attente', 'rembourse', '2026-03-03', '2026-03-03', 'virement', NULL),
  ('56c32c5c-176b-49af-ba1c-4f2fb230ce41', '8130be9a-dcc7-4fdb-8a7b-7a700e3e85eb', 'frais_consultation', NULL, NULL, NULL, 'regle', 'en_attente', 'en_attente', '2026-08-18', '2026-08-18', 'virement', NULL),
  ('c4c37c7e-e8a8-4aab-8823-8c9182c3a93a', 'c192caf3-7930-4932-b198-20cc66740b08', 'acompte_artisan', 'aa4827cf-cd5a-4c4c-9352-0ff634978efe', NULL, NULL, 'regle', 'recu', 'en_attente', '2026-08-31', '2026-08-31', 'virement', '2026-08-31');

-- rattache chaque acompte artisan à son devis
update suivi_financier sf set devis_id = dv.id
from devis_artisans dv
where sf.type_echeance = 'acompte_artisan' and sf.devis_id is null
  and dv.dossier_id = sf.dossier_id and dv.artisan_id = sf.artisan_id and dv.statut = 'accepte'
  and sf.dossier_id in (select id from dossiers where societe_id = 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8');

insert into factures_artisans (id, devis_id, dossier_id, artisan_id, montant_ttc, date_paiement, statut, libelle) values
  ('b1b4d406-0a61-4058-9915-be4ed3ffb735', 'f6bdbbdb-03a2-4606-9946-e6bdb6859517', '86382e23-8a12-4665-953e-e2a5c78dfe28', 'c6dd2993-a2ea-4f37-a49c-9bb1019ab13a', 24640.0, '2026-06-26', 'paye', 'Solde BERTIN RÉNOVATION'),
  ('fa308bd7-34a6-4636-942c-9e29c3b47e67', '1a485343-434b-45b3-90db-01a0948a27f3', '86382e23-8a12-4665-953e-e2a5c78dfe28', 'fedd1a05-c49f-4156-86d4-1ffe642f9a0b', 14190.0, '2026-06-26', 'paye', 'Solde PICHON PEINTURE & DÉCO'),
  ('0ecc6ebe-001f-4973-bc52-22dfc0addd5e', 'f19a7c25-77df-4cf7-859a-c3572bd34436', '86382e23-8a12-4665-953e-e2a5c78dfe28', '2dd1ec21-82c0-46b6-9669-881e66b51826', 13970.0, '2026-06-26', 'paye', 'Solde NOGUEIRA CARRELAGE'),
  ('99979246-8319-4680-ba77-15bb6ae5eb40', 'c95bdd15-d1f0-4473-9a06-c97872a06dbf', 'f23ae663-3a93-490e-970c-b853484972a9', '7927e38f-b99c-46cd-8310-149aa3ff5eb0', 21780.0, '2026-04-30', 'paye', 'Solde ALVAREZ COUVERTURE'),
  ('ad8f90ec-3b01-4eb1-95a9-60a55325f0fe', '4d5c0fb8-d390-44d4-9716-ead69c90f81f', 'f23ae663-3a93-490e-970c-b853484972a9', 'aa4827cf-cd5a-4c4c-9352-0ff634978efe', 12540.0, '2026-04-30', 'paye', 'Solde COSTA PLÂTRERIE'),
  ('a3332c95-fd1a-428a-8622-b039decc0e83', '9fb91683-0deb-4ba9-a503-45de02409408', '8cbabbd5-8c78-4fc1-ba9b-c8818757b596', 'c6dd2993-a2ea-4f37-a49c-9bb1019ab13a', 18370.0, '2026-08-07', 'paye', 'Solde BERTIN RÉNOVATION'),
  ('b50959f0-5755-4405-bbdf-e7133bf58ba0', '96d81c53-4990-42c1-bea4-5cd87c55297f', '8cbabbd5-8c78-4fc1-ba9b-c8818757b596', '303a072d-a820-4903-b0ce-476246418420', 11220.0, '2026-08-07', 'paye', 'Solde DUMAS PLOMBERIE CHAUFFAGE'),
  ('18cf1183-ecef-4d8e-8da2-78d9bb6ffeec', '2719127f-4171-4c89-b36c-85eb0874d587', '8cbabbd5-8c78-4fc1-ba9b-c8818757b596', 'e9572bb8-43f6-4163-97db-b149e51f2607', 8195.0, '2026-08-07', 'paye', 'Solde FERRAND ÉLECTRICITÉ'),
  ('1e9a4c01-20be-48aa-a375-ebab864587b6', 'c157a1f1-ffef-406e-904d-019d37e77afa', '8cbabbd5-8c78-4fc1-ba9b-c8818757b596', 'fedd1a05-c49f-4156-86d4-1ffe642f9a0b', 8690.0, '2026-08-07', 'paye', 'Solde PICHON PEINTURE & DÉCO');

insert into lots (id, dossier_id, parent_lot_id, artisan_id, nom, date_debut, date_fin, avancement, couleur, ordre) values
  ('aec32c9a-1eb9-4b10-b0e3-c10601f5cc5f', '2da9eb8d-f40f-45e9-b274-3191e5dac611', NULL, NULL, 'Rénovation complète', '2026-06-15', '2026-10-30', 55, '#4f46e5', 0),
  ('5bcf7a22-f8ee-4bf2-895b-69823ffaef2e', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'aec32c9a-1eb9-4b10-b0e3-c10601f5cc5f', 'c6dd2993-a2ea-4f37-a49c-9bb1019ab13a', 'Dépose et démolition', '2026-06-15', '2026-06-26', 100, '#dc2626', 1),
  ('cfc490d8-6fad-4776-b35a-5331958dac30', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'aec32c9a-1eb9-4b10-b0e3-c10601f5cc5f', '303a072d-a820-4903-b0ce-476246418420', 'Plomberie et évacuations', '2026-06-29', '2026-07-17', 100, '#0ea5e9', 2),
  ('34c09b88-542c-4b4f-9d9d-63c1a4f7531d', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'aec32c9a-1eb9-4b10-b0e3-c10601f5cc5f', 'e9572bb8-43f6-4163-97db-b149e51f2607', 'Électricité et tableau', '2026-07-06', '2026-07-31', 100, '#16a34a', 3),
  ('5506b286-b635-414f-a5f1-2849934ae2f3', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'aec32c9a-1eb9-4b10-b0e3-c10601f5cc5f', 'c6dd2993-a2ea-4f37-a49c-9bb1019ab13a', 'Plâtrerie et cloisons', '2026-08-03', '2026-08-28', 70, '#a16207', 4),
  ('f2c4490e-dd31-4fac-af2e-c8f7c32983d6', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'aec32c9a-1eb9-4b10-b0e3-c10601f5cc5f', 'bcf57c74-b64f-429f-a121-e0327f3fae37', 'Cuisine sur mesure', '2026-09-07', '2026-09-25', 10, '#7c3aed', 5),
  ('37c9bca1-0075-45b7-acf3-b679ea692eb9', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'aec32c9a-1eb9-4b10-b0e3-c10601f5cc5f', 'fedd1a05-c49f-4156-86d4-1ffe642f9a0b', 'Peintures et finitions', '2026-09-28', '2026-10-23', 0, '#db2777', 6),
  ('85a4a1d5-5daa-4134-83c3-7918a94387ff', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'aec32c9a-1eb9-4b10-b0e3-c10601f5cc5f', NULL, 'Réception de chantier', '2026-10-26', '2026-10-30', 0, '#0d9488', 7),
  ('317d2f52-8a27-4c40-800f-1de607d400e8', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', NULL, NULL, 'Extension ossature bois', '2026-08-24', '2026-12-18', 25, '#0ea5e9', 0),
  ('48e8db05-cb95-44bd-9ee0-ff4a94ca9145', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', '317d2f52-8a27-4c40-800f-1de607d400e8', 'c6dd2993-a2ea-4f37-a49c-9bb1019ab13a', 'Terrassement et fondations', '2026-08-24', '2026-09-11', 90, '#dc2626', 1),
  ('1c210d2d-9cb7-4563-b524-7c8d1e97c7ff', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', '317d2f52-8a27-4c40-800f-1de607d400e8', '6c0bd7f4-4807-4c4d-b3a5-3f40e914bb77', 'Ossature et charpente', '2026-09-14', '2026-10-09', 5, '#16a34a', 2),
  ('a5c399ba-31ad-43e0-b28f-fd49d9aba297', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', '317d2f52-8a27-4c40-800f-1de607d400e8', '7927e38f-b99c-46cd-8310-149aa3ff5eb0', 'Couverture et étanchéité', '2026-10-12', '2026-10-30', 0, '#a16207', 3),
  ('63a51a8a-67db-4dac-a035-3d543aa32099', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', '317d2f52-8a27-4c40-800f-1de607d400e8', 'e9572bb8-43f6-4163-97db-b149e51f2607', 'Électricité et raccordement', '2026-11-02', '2026-11-20', 0, '#4f46e5', 4),
  ('bb9dfbd3-190d-4c7c-b7b7-fff95d3890f3', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', '317d2f52-8a27-4c40-800f-1de607d400e8', 'fedd1a05-c49f-4156-86d4-1ffe642f9a0b', 'Finitions intérieures', '2026-11-23', '2026-12-18', 0, '#db2777', 5);

insert into interventions_artisans (id, dossier_id, artisan_id, type_intervention, date_debut, date_fin, notes, lieu, agence_id, societe_id, owner_id) values
  ('69ea0b1b-b091-4892-992e-0136b9df373c', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'c6dd2993-a2ea-4f37-a49c-9bb1019ab13a', 'periode', '2026-06-15', '2026-06-26', 'Dépose et évacuation en benne', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('2ee75adc-5596-473c-9a6c-080ee6146fe4', '2da9eb8d-f40f-45e9-b274-3191e5dac611', '303a072d-a820-4903-b0ce-476246418420', 'periode', '2026-06-29', '2026-07-17', 'Reprise complète des alimentations', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('4130cbd4-cc2f-4fc4-997a-b34dc461f455', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'e9572bb8-43f6-4163-97db-b149e51f2607', 'periode', '2026-07-06', '2026-07-31', 'Mise aux normes du tableau', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('f8d13ab0-2588-428d-b49e-d0bed37af35d', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'bcf57c74-b64f-429f-a121-e0327f3fae37', 'periode', '2026-09-07', '2026-09-25', 'Pose cuisine sur mesure', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('10ccd297-53de-45ac-93b3-e6a2b036d1f9', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', 'c6dd2993-a2ea-4f37-a49c-9bb1019ab13a', 'periode', '2026-08-24', '2026-09-11', 'Terrassement et semelles', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('e14a2b14-a5d3-4090-aa65-0855dff2252d', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', '6c0bd7f4-4807-4c4d-b3a5-3f40e914bb77', 'periode', '2026-09-14', '2026-10-09', 'Levage ossature', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('65925856-a365-46ff-8e1f-5a91182149b4', 'd66cb8d9-1fea-4c3c-9153-8869357645da', 'c6dd2993-a2ea-4f37-a49c-9bb1019ab13a', 'periode', '2026-11-02', '2026-12-12', 'Gros oeuvre surélévation', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'db435e64-d392-4585-b5f8-ea50c5fb8324'),
  ('24426ce0-5534-4581-b4d3-34851c4d2a4a', 'c192caf3-7930-4932-b198-20cc66740b08', 'aa4827cf-cd5a-4c4c-9352-0ff634978efe', 'periode', '2026-09-14', '2026-09-25', 'Adaptation salle d''eau', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc');

insert into rendez_vous (id, dossier_id, type_rdv, date_heure, duree_minutes, titre, notes, lieu, agence_id, societe_id, owner_id) values
  ('d2d9ab1b-01d0-4543-b479-d1c2fb3bc433', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'visite_technique_client', '2026-02-09 14:30:00+02', 90, NULL, 'Premier rendez-vous — relevé des besoins et prise de cotes.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('75f3b2f3-5b0e-478c-ba2a-e7d752c90216', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'presentation_devis', '2026-02-16 16:00:00+02', 90, NULL, 'Présentation du dossier et signature du contrat.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('a8162e5d-dfea-40ec-8bab-948fb8678f6d', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', 'visite_technique_client', '2026-04-07 09:30:00+02', 90, NULL, 'Premier rendez-vous — relevé des besoins et prise de cotes.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('a13f13b7-bd9a-4850-8008-89ed74c9b379', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', 'presentation_devis', '2026-04-14 10:00:00+02', 90, NULL, 'Présentation du dossier et signature du contrat.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('de206f73-8306-4f57-a9b8-2cfbed15fd57', '733cbeec-c0f4-492a-93c5-b742f7d15c3a', 'visite_technique_client', '2026-07-21 14:30:00+02', 90, NULL, 'Premier rendez-vous — relevé des besoins et prise de cotes.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('3e4fbbac-5ea2-42f0-a24a-6c8a3cd22bf7', '733cbeec-c0f4-492a-93c5-b742f7d15c3a', 'presentation_devis', '2026-07-28 16:00:00+02', 90, NULL, 'Présentation du dossier et signature du contrat.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('2b0f8049-b4bd-46e0-ba52-73d01051b856', 'd66cb8d9-1fea-4c3c-9153-8869357645da', 'visite_technique_client', '2026-06-02 09:30:00+02', 90, NULL, 'Premier rendez-vous — relevé des besoins et prise de cotes.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'db435e64-d392-4585-b5f8-ea50c5fb8324'),
  ('09418fc7-b93e-44f3-bef9-a2bac107b0b5', 'd66cb8d9-1fea-4c3c-9153-8869357645da', 'presentation_devis', '2026-06-11 10:00:00+02', 90, NULL, 'Présentation du dossier et signature du contrat.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'db435e64-d392-4585-b5f8-ea50c5fb8324'),
  ('c32cea97-5764-45d9-b402-b49204888082', '86382e23-8a12-4665-953e-e2a5c78dfe28', 'visite_technique_client', '2026-01-15 14:30:00+02', 90, NULL, 'Premier rendez-vous — relevé des besoins et prise de cotes.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('95b53143-1ead-40c1-a5da-5fcc6d60ddb4', '86382e23-8a12-4665-953e-e2a5c78dfe28', 'presentation_devis', '2026-01-22 16:00:00+02', 90, NULL, 'Présentation du dossier et signature du contrat.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('a84ab34c-c01a-4ba4-a781-acf97a27fe23', 'f23ae663-3a93-490e-970c-b853484972a9', 'visite_technique_client', '2025-11-18 09:30:00+02', 90, NULL, 'Premier rendez-vous — relevé des besoins et prise de cotes.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'db435e64-d392-4585-b5f8-ea50c5fb8324'),
  ('167a8ba1-efb2-4300-baa2-7e1754ca1dca', 'f23ae663-3a93-490e-970c-b853484972a9', 'presentation_devis', '2025-11-27 10:00:00+02', 90, NULL, 'Présentation du dossier et signature du contrat.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'db435e64-d392-4585-b5f8-ea50c5fb8324'),
  ('cad7f72a-b68e-43b4-af8d-e626aa1d1399', '8cbabbd5-8c78-4fc1-ba9b-c8818757b596', 'visite_technique_client', '2026-01-29 14:30:00+02', 90, NULL, 'Premier rendez-vous — relevé des besoins et prise de cotes.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('4ff61c7e-40ff-4de9-bd2c-d9e45348bde2', '8cbabbd5-8c78-4fc1-ba9b-c8818757b596', 'presentation_devis', '2026-02-05 16:00:00+02', 90, NULL, 'Présentation du dossier et signature du contrat.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('1f75c5d3-7e9e-4854-a8be-3047d13cf3eb', '63974b9e-3efd-41c6-986b-8420ef440fe1', 'visite_technique_client', '2026-03-10 09:30:00+02', 90, NULL, 'Premier rendez-vous — relevé des besoins et prise de cotes.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('b7f25931-3a8b-4e7a-b4b4-125224a19481', 'fbe3dcca-14bd-49a7-955c-d4f070804f36', 'visite_technique_client', '2026-02-24 14:30:00+02', 90, NULL, 'Premier rendez-vous — relevé des besoins et prise de cotes.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'db435e64-d392-4585-b5f8-ea50c5fb8324'),
  ('3558a8f4-31f1-4c59-98a3-06b04f2a118f', 'fbe3dcca-14bd-49a7-955c-d4f070804f36', 'presentation_devis', '2026-03-03 16:00:00+02', 90, NULL, 'Présentation du dossier et signature du contrat.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'db435e64-d392-4585-b5f8-ea50c5fb8324'),
  ('f6c269f3-bb38-4272-82a0-77331c2c8f5c', '8130be9a-dcc7-4fdb-8a7b-7a700e3e85eb', 'visite_technique_client', '2026-08-11 09:30:00+02', 90, NULL, 'Premier rendez-vous — relevé des besoins et prise de cotes.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('4a848d6a-5b6e-4c26-9bf1-496dbe57b5e1', '8130be9a-dcc7-4fdb-8a7b-7a700e3e85eb', 'presentation_devis', '2026-08-18 10:00:00+02', 90, NULL, 'Présentation du dossier et signature du contrat.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('e3328324-67ed-4d9f-a3ec-dae9b1656ab5', 'c192caf3-7930-4932-b198-20cc66740b08', 'visite_technique_client', '2026-08-20 14:30:00+02', 90, NULL, 'Premier rendez-vous — relevé des besoins et prise de cotes.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('d7610374-94bc-4e19-8497-6b28e14631fd', 'c192caf3-7930-4932-b198-20cc66740b08', 'presentation_devis', '2026-08-25 16:00:00+02', 90, NULL, 'Présentation du dossier et signature du contrat.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('f391e2bf-bef1-431c-843a-1c52b1a838bf', '3e27e812-fc5d-490d-8f6c-2023df7210b3', 'visite_technique_client', '2026-09-09 09:30:00+02', 90, NULL, 'Premier rendez-vous — relevé des besoins et prise de cotes.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('e5d74dc0-9884-41e0-b9ff-1c732cf0c91e', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'visite_technique_artisan', '2026-03-12 08:30:00+02', 60, 'Visite technique — BERTIN RÉNOVATION', NULL, 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('0b75e250-f68f-431f-bfc5-adaf745d9d7c', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'visite_technique_artisan', '2026-03-18 11:00:00+02', 60, 'Visite technique — DUMAS PLOMBERIE', NULL, 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('582bd521-1c2c-4764-9728-1e5418334382', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'suivi', '2026-06-26 09:00:00+02', 60, NULL, 'Visite de chantier hebdomadaire.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('721706c2-9295-43f4-ae34-a23456806f89', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'suivi', '2026-07-17 09:00:00+02', 60, NULL, 'Visite de chantier hebdomadaire.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('3de8059d-d628-4f64-938b-08f3219b8345', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'suivi', '2026-07-31 09:00:00+02', 60, NULL, 'Visite de chantier hebdomadaire.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('4d5399a7-6d25-4091-b60a-14548b730eb1', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'suivi', '2026-08-21 09:00:00+02', 60, NULL, 'Visite de chantier hebdomadaire.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('661611a0-460f-43d3-94a4-260bdcab0683', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'suivi', '2026-09-04 09:00:00+02', 60, NULL, 'Point avancement plâtrerie — réception des cloisons.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('789d5600-de96-4766-b484-9ffafd07995f', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'suivi', '2026-09-18 09:00:00+02', 60, NULL, 'Livraison cuisine — contrôle des cotes.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('22e6ebcb-5748-4925-aaf9-6650b9df42ae', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'suivi', '2026-10-09 09:00:00+02', 60, NULL, 'Avant peintures.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('80cf8064-0c12-4cc4-a3e5-05d8810638d0', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'reception', '2026-10-29 14:00:00+02', 120, NULL, 'Réception de chantier avec la cliente.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('4142b02c-652a-4281-8f14-8ca845fa14a9', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', 'suivi', '2026-08-28 10:00:00+02', 60, NULL, 'Contrôle des fondations.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('0339b71e-df60-4910-b575-ea12dae55358', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', 'suivi', '2026-09-10 10:00:00+02', 60, NULL, 'Fin terrassement — validation avant ossature.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('01207346-22e8-498f-bc36-cbccbbdab980', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', 'suivi', '2026-09-24 10:00:00+02', 60, NULL, 'Levage ossature en cours.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('eb31b769-2319-44ce-b5e8-f5e4e96fa722', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', 'visite_technique_artisan', '2026-09-08 15:00:00+02', 60, 'Visite technique — ALVAREZ COUVERTURE', NULL, 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('55a0e126-3af5-4944-896e-38b57f1736c8', '733cbeec-c0f4-492a-93c5-b742f7d15c3a', 'presentation_devis', '2026-09-11 17:00:00+02', 90, NULL, 'Présentation comparative des trois devis.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('3024446c-995c-48cf-b704-70fc2de8d87b', 'd66cb8d9-1fea-4c3c-9153-8869357645da', 'suivi', '2026-09-16 11:00:00+02', 60, NULL, 'Calage du démarrage de novembre.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'db435e64-d392-4585-b5f8-ea50c5fb8324'),
  ('421761ae-fbe4-4c8a-b6ee-aa123b70a4f8', '8130be9a-dcc7-4fdb-8a7b-7a700e3e85eb', 'etude', '2026-09-07 14:00:00+02', 120, NULL, 'Restitution de l''estimation travaux.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('85c55894-d053-4153-bb91-615bb23ae1b1', 'c192caf3-7930-4932-b198-20cc66740b08', 'suivi', '2026-09-15 09:30:00+02', 60, NULL, 'Démarrage de l''adaptation.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('816985b8-9689-4e2f-b0be-889b00f8c647', '3e27e812-fc5d-490d-8f6c-2023df7210b3', 'visite_technique_client', '2026-09-09 14:30:00+02', 90, NULL, 'Premier rendez-vous.', 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('f8f9b4fe-c93a-4766-a820-dccb3f87fca9', NULL, 'autres', '2026-09-07 08:30:00+02', 60, 'Réunion d''agence — point hebdomadaire', NULL, 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('aaf617a4-cbc1-4c51-8539-1e77560ed7cd', NULL, 'autres', '2026-09-14 08:30:00+02', 60, 'Réunion d''agence — point hebdomadaire', NULL, 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('3d9c6d31-1c93-4c8f-81d2-ff68536245f3', NULL, 'autres', '2026-09-21 08:30:00+02', 60, 'Réunion d''agence — point hebdomadaire', NULL, 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('402bbb2d-a6f9-41f5-b625-6d7ee89e19e3', NULL, 'autres', '2026-09-10 08:30:00+02', 60, 'Rendez-vous partenaire — courtier en financement', NULL, 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc'),
  ('5c03a0b2-b5d3-49dd-9c08-7b31908dcecd', NULL, 'autres', '2026-09-17 08:30:00+02', 60, 'Prospection — salon de l''habitat', NULL, 'client', '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc');

insert into actions (id, dossier_id, numero, portee, titre, texte, statut, statut_date, ordre) values
  ('047953fd-b7e3-4b3d-a840-bce751f9e4cc', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'A1', 'generale', 'Attestation décennale DUMAS', 'Relancer DUMAS PLOMBERIE pour l''attestation décennale 2026, la précédente expire le 31/10.', 'en_retard', '2026-08-24', 0),
  ('0d0b657a-ddad-45dd-b79b-dc6f1d23af3c', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'A2', 'generale', 'Choix du carrelage salle d''eau', 'La cliente hésite entre deux références. Échantillons déposés le 19/08.', 'en_attente', '2026-08-19', 1),
  ('f488c890-3155-4c8e-ab61-3a3a267808f2', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'A3', 'generale', 'Commande cuisine', 'Commande passée chez SAUVAGE CUISINES, livraison annoncée semaine 38.', 'programme', '2026-08-28', 2),
  ('4fb76aa6-f309-4421-a824-eb0c0aac8784', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'A4', 'generale', 'Reprise du seuil de porte', 'Constaté en visite du 21/08 : ressaut de 2 cm à reprendre avant peintures.', 'constate', '2026-08-21', 3),
  ('2392318c-dfde-4b53-bbc2-540f7561d32f', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'A5', 'generale', 'Déclaration préalable', 'Accordée en mairie le 12/05, affichage sur site vérifié.', 'cloture', '2026-05-12', 4),
  ('0594513f-ed06-4e31-807e-9b129210356f', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', 'A6', 'generale', 'Étude de sol', 'Rapport G2 reçu, transmis à l''ossature bois.', 'acte', '2026-08-20', 5),
  ('35e73ec6-8235-4951-a1f5-69e0406963f7', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', 'A7', 'generale', 'Raccordement ENEDIS', 'Demande déposée, délai annoncé 8 semaines — à surveiller pour novembre.', 'a_surveiller', '2026-08-26', 6),
  ('f51628cf-59c9-47e6-b59f-4a4f9b35148a', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', 'A8', 'generale', 'Assurance dommages-ouvrage', 'Devis assureur à relancer avant démarrage de l''ossature.', 'urgent', '2026-09-01', 7),
  ('18d98dfb-004b-41c7-922f-96ad0686a628', 'd66cb8d9-1fea-4c3c-9153-8869357645da', 'A9', 'generale', 'Permis de construire', 'Instruction en cours, réponse attendue mi-octobre.', 'a_surveiller', '2026-08-04', 8),
  ('7dcdac8f-3833-4307-99d6-53937ed6f189', '733cbeec-c0f4-492a-93c5-b742f7d15c3a', 'A10', 'generale', 'Relance NOGUEIRA', 'Devis carrelage toujours pas reçu, relance faite le 27/08.', 'en_retard', '2026-08-27', 9);

insert into comptes_rendus (id, dossier_id, auteur_id, type_visite, contenu_ia, contenu_final, valide, date_visite, numero_visite) values
  ('02c2bd92-65ec-4c4f-972f-afad0ef5422f', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc', 'r1', '**Objet** — Premier rendez-vous au domicile de Mme DELAUNAY.

Le logement est un appartement de 78 m² au 3e étage, occupé pendant les travaux jusqu''à la phase cuisine.

**Besoins exprimés**
- Ouverture de la cuisine sur le séjour, avec conservation du linteau porteur.
- Réfection complète de la salle d''eau, receveur extra-plat de plain-pied.
- Reprise de l''électricité : tableau non conforme, absence de liaison équipotentielle.
- Peintures de l''ensemble des pièces.

**Points de vigilance**
- Copropriété : autorisation d''AG nécessaire pour la modification des évacuations.
- Ascenseur indisponible du 15 au 30 juin (travaux copropriété) — à intégrer au planning des livraisons.

**Suite** — consultation de cinq entreprises, retour des devis sous trois semaines.', '**Objet** — Premier rendez-vous au domicile de Mme DELAUNAY.

Le logement est un appartement de 78 m² au 3e étage, occupé pendant les travaux jusqu''à la phase cuisine.

**Besoins exprimés**
- Ouverture de la cuisine sur le séjour, avec conservation du linteau porteur.
- Réfection complète de la salle d''eau, receveur extra-plat de plain-pied.
- Reprise de l''électricité : tableau non conforme, absence de liaison équipotentielle.
- Peintures de l''ensemble des pièces.

**Points de vigilance**
- Copropriété : autorisation d''AG nécessaire pour la modification des évacuations.
- Ascenseur indisponible du 15 au 30 juin (travaux copropriété) — à intégrer au planning des livraisons.

**Suite** — consultation de cinq entreprises, retour des devis sous trois semaines.', true, '2026-02-09', 1),
  ('e8e08122-5f53-45a4-9f9d-4e0610887452', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc', 'suivi', '**Visite de chantier n°2** — présents : Mme DELAUNAY, DUMAS PLOMBERIE, illiCO travaux.

**Avancement**
- Dépose et démolition terminées, évacuations conformes au plan.
- Plomberie : alimentations neuves tirées, attente du receveur pour le calage définitif.
- Électricité : saignées réalisées, tableau posé, mise en service prévue le 31/07.

**Décisions prises**
- Le receveur extra-plat est validé en 90 × 120, référence transmise.
- La hauteur de la crédence est arrêtée à 60 cm.

**Réserves** — aucune à ce stade.

**Prochaine visite** — 31 juillet, réception de l''électricité.', '**Visite de chantier n°2** — présents : Mme DELAUNAY, DUMAS PLOMBERIE, illiCO travaux.

**Avancement**
- Dépose et démolition terminées, évacuations conformes au plan.
- Plomberie : alimentations neuves tirées, attente du receveur pour le calage définitif.
- Électricité : saignées réalisées, tableau posé, mise en service prévue le 31/07.

**Décisions prises**
- Le receveur extra-plat est validé en 90 × 120, référence transmise.
- La hauteur de la crédence est arrêtée à 60 cm.

**Réserves** — aucune à ce stade.

**Prochaine visite** — 31 juillet, réception de l''électricité.', true, '2026-07-17', 2),
  ('c04a0eb1-9361-4452-801f-374f5ecd0598', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc', 'suivi', '**Visite de chantier n°3** — présents : Mme DELAUNAY, COSTA PLÂTRERIE, illiCO travaux.

**Avancement**
- Cloisons montées à 70 %, bandes en cours.
- Le seuil de la porte de la salle d''eau présente un ressaut de 2 cm : reprise demandée avant peintures.

**En attente**
- Choix définitif du carrelage : deux échantillons laissés sur place, réponse attendue pour le 5 septembre.

**Planning** — la livraison de la cuisine est confirmée en semaine 38, sans incidence sur la date de réception du 30 octobre.', '**Visite de chantier n°3** — présents : Mme DELAUNAY, COSTA PLÂTRERIE, illiCO travaux.

**Avancement**
- Cloisons montées à 70 %, bandes en cours.
- Le seuil de la porte de la salle d''eau présente un ressaut de 2 cm : reprise demandée avant peintures.

**En attente**
- Choix définitif du carrelage : deux échantillons laissés sur place, réponse attendue pour le 5 septembre.

**Planning** — la livraison de la cuisine est confirmée en semaine 38, sans incidence sur la date de réception du 30 octobre.', true, '2026-08-21', 3),
  ('d3f39a8c-8607-4f2b-a4c1-b8c6d9b21f62', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc', 'r1', '**Objet** — Premier rendez-vous, M. MERCIER.

Projet d''extension de 22 m² en ossature bois sur jardin, en prolongement du séjour.

**Contraintes identifiées**
- Emprise au sol : déclaration préalable suffisante, vérifié au PLU.
- Étude de sol G2 nécessaire avant chiffrage des fondations.
- Accès chantier par le portail latéral, largeur 2,10 m — engins limités.

**Suite** — consultation gros œuvre, ossature bois, couverture et électricité.', '**Objet** — Premier rendez-vous, M. MERCIER.

Projet d''extension de 22 m² en ossature bois sur jardin, en prolongement du séjour.

**Contraintes identifiées**
- Emprise au sol : déclaration préalable suffisante, vérifié au PLU.
- Étude de sol G2 nécessaire avant chiffrage des fondations.
- Accès chantier par le portail latéral, largeur 2,10 m — engins limités.

**Suite** — consultation gros œuvre, ossature bois, couverture et électricité.', true, '2026-04-07', 1),
  ('bfb09b3e-2285-40ef-9dcd-69d8efccdc89', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc', 'suivi', '**Visite de chantier n°1** — présents : M. MERCIER, BERTIN RÉNOVATION, illiCO travaux.

**Avancement** — terrassement réalisé, semelles coulées le 27/08, séchage en cours.

**Point de vigilance** — la demande de raccordement ENEDIS a été déposée le 26/08, délai annoncé de huit semaines. À surveiller pour ne pas décaler la phase électricité de novembre.

**Prochaine visite** — 10 septembre, validation avant levage de l''ossature.', '**Visite de chantier n°1** — présents : M. MERCIER, BERTIN RÉNOVATION, illiCO travaux.

**Avancement** — terrassement réalisé, semelles coulées le 27/08, séchage en cours.

**Point de vigilance** — la demande de raccordement ENEDIS a été déposée le 26/08, délai annoncé de huit semaines. À surveiller pour ne pas décaler la phase électricité de novembre.

**Prochaine visite** — 10 septembre, validation avant levage de l''ossature.', true, '2026-08-28', 2);

insert into cr_actions (cr_id, action_id, statut_au_cr, texte_au_cr, inclus) values
  ('c04a0eb1-9361-4452-801f-374f5ecd0598', '0d0b657a-ddad-45dd-b79b-dc6f1d23af3c', 'en_attente', 'La cliente hésite entre deux références. Échantillons déposés le 19/08.', true),
  ('c04a0eb1-9361-4452-801f-374f5ecd0598', '4fb76aa6-f309-4421-a824-eb0c0aac8784', 'constate', 'Constaté en visite du 21/08 : ressaut de 2 cm à reprendre avant peintures.', true),
  ('e8e08122-5f53-45a4-9f9d-4e0610887452', '2392318c-dfde-4b53-bbc2-540f7561d32f', 'cloture', 'Accordée en mairie le 12/05, affichage sur site vérifié.', true),
  ('bfb09b3e-2285-40ef-9dcd-69d8efccdc89', '0594513f-ed06-4e31-807e-9b129210356f', 'acte', 'Rapport G2 reçu, transmis à l''ossature bois.', true),
  ('bfb09b3e-2285-40ef-9dcd-69d8efccdc89', '35e73ec6-8235-4951-a1f5-69e0406963f7', 'a_surveiller', 'Demande déposée, délai annoncé 8 semaines — à surveiller pour novembre.', true);

insert into messages (id, dossier_id, auteur_id, contenu, auteur_role, lu, lu_agence, created_at) values
  ('c09cd9f3-a0bb-41ec-9756-2c174eda1dc9', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc', 'Bonjour Madame DELAUNAY, le compte rendu de la visite du 21 août est disponible dans votre espace. Bonne lecture.', 'agente', true, true, '2026-08-22 10:20:00'),
  ('466aec72-94b4-467e-9a04-2ee47c9b8f60', '2da9eb8d-f40f-45e9-b274-3191e5dac611', NULL, 'Merci beaucoup. Pour le carrelage, je penche pour la référence claire, je vous confirme avant le 5 septembre.', 'client', true, true, '2026-08-23 10:20:00'),
  ('cf0501cd-45de-4508-a78e-ad68481fca67', '2da9eb8d-f40f-45e9-b274-3191e5dac611', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc', 'Parfait, je transmets à COSTA PLÂTRERIE dès votre confirmation. La cuisine est bien confirmée en semaine 38.', 'agente', true, true, '2026-08-24 10:20:00'),
  ('789fce51-e331-476c-9a2c-bfac4869ae2c', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc', 'Bonjour Monsieur MERCIER, les semelles ont été coulées hier. Prochain point le 10 septembre avant le levage.', 'agente', true, true, '2026-08-28 10:20:00'),
  ('a0ec3141-ed36-4437-a12d-9d93178a425e', '4dc052ee-c493-47ad-95eb-57344e7dd0cb', NULL, 'Très bien, je serai présent. Avez-vous des nouvelles du raccordement ENEDIS ?', 'client', true, true, '2026-08-29 10:20:00');

insert into objectifs_ca (id, annee, cible, agente_id, montant, agence_id, societe_id) values
  ('21196520-567b-4bf2-820a-dd9436a027bc', 2026, 'agence', NULL, 45000, '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8'),
  ('16922102-93f6-4104-8972-f067c4b4947d', 2026, 'agente', 'c36f9d39-a7cf-4c54-8774-4491908ff7dc', 20000, '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8'),
  ('210e25bd-9e17-4df3-b532-b52ebc562641', 2025, 'agence', NULL, 28000, '50654b35-8eef-430e-be4f-adf0e95a63b9', 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8');


-- ─── C. Contrôle — UNE seule requête ──────────────────────────────────────
-- L'éditeur SQL de Supabase n'affiche que le résultat de la DERNIÈRE requête.
-- Tout est donc regroupé ici, en quatre lignes.

with soc as (select 'ef0b86f1-066c-44b1-a3ba-098dfb41d2d8'::uuid as id),
dos as (select d.* from dossiers d, soc where d.societe_id = soc.id),
sig as (select dv.dossier_id, sum(dv.montant_ttc) as ttc from devis_artisans dv
        where dv.dossier_id in (select id from dos) and dv.statut = 'accepte' group by 1),
hon as (select d.reference,
        round(coalesce(s.ttc,0) * d.taux_courtage, 2)
        + case when d.typologie = 'amo' then round(coalesce(s.ttc,0) * d.honoraires_amo_taux / 100, 2) else 0 end as honoraires
        from dos d left join sig s on s.dossier_id = d.id),
porte as (select coalesce(statut,'en cours') as st, count(*) as n from dos group by 1)
select 'volumes' as bloc,
  (select count(*)::text from artisans a, soc where a.societe_id = soc.id)||' artisans · '||
  (select count(*)::text from clients c, soc where c.societe_id = soc.id)||' clients · '||
  (select count(*)::text from dos)||' dossiers · '||
  (select count(*)::text from devis_artisans where dossier_id in (select id from dos))||' devis · '||
  (select count(*)::text from suivi_financier where dossier_id in (select id from dos))||' lignes de suivi · '||
  (select count(*)::text from rendez_vous r, soc where r.societe_id = soc.id)||' RDV · '||
  (select count(*)::text from lots where dossier_id in (select id from dos))||' lots · '||
  (select count(*)::text from comptes_rendus where dossier_id in (select id from dos))||' CR · '||
  (select count(*)::text from actions where dossier_id in (select id from dos))||' actions' as detail
union all
select 'habillage',
  (select nom_societe from societes s, soc where s.id = soc.id)||' — '||
  (select nom from agences where id = '50654b35-8eef-430e-be4f-adf0e95a63b9')
union all
select 'portefeuille',
  coalesce((select string_agg(st||' : '||n, ' · ' order by st) from porte), 'aucun dossier')
union all
select 'honoraires attendus',
  coalesce((select round(sum(honoraires),2)::text from hon where honoraires > 0), '0')||' € TTC sur '||
  (select count(*)::text from hon where honoraires > 0)||' dossiers'
union all
select 'garde-fou CTP',
  (select count(*)::text from dossiers where societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd')||' dossiers, '||
  (select count(*)::text from clients  where societe_id = 'ef2128ea-4660-4c74-ba17-6910be523efd')||' clients — inchangés';

-- ─── Remplace ROLLBACK par COMMIT quand le contrôle te convient ────────────
ROLLBACK;
