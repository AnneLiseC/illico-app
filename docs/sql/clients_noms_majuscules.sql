-- Met en MAJUSCULES le NOM (et NOM2) des clients existants saisis en minuscules.
-- Les nouvelles saisies sont déjà normalisées par l'appli (clients/nouveau + clients/[id]).
-- Les pros avec raison sociale ne sont pas touchés (leur `nom` = « SCI Xxx », affiché via raison_sociale).
-- À simuler d'abord : remplacer COMMIT par ROLLBACK.
BEGIN;
UPDATE clients
SET nom  = upper(trim(nom)),
    nom2 = nullif(upper(trim(nom2)), '')
WHERE raison_sociale IS NULL
  AND (nom <> upper(trim(nom)) OR nom2 <> upper(trim(nom2)));
-- attendu : 17 lignes (au 26/11/2026)
SELECT count(*) AS restants FROM clients
WHERE raison_sociale IS NULL AND (nom <> upper(nom) OR nom2 <> upper(nom2));  -- attendu : 0
COMMIT;
