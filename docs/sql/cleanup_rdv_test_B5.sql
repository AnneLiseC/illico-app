-- docs/sql/cleanup_rdv_test_B5.sql
-- Nettoyage des 3 RDV de test B5 (créés le 13/07) — CÔTÉ BATILIS UNIQUEMENT.
-- ⚠️ Aucun trigger delete vers Google (prouvé lot C) : supprimer ces lignes ne touche
--    PAS Google. Les events Google de test sont à supprimer à la main côté Google Agenda.
--
-- Cible par google_event_id (stable) :
--   « Test test »                    _8kp48h1j68p34b9j6d23ib9k850k4ba18l136b9i6oo3cc9l852j2hi564
--   « R3 zezezzz »                   _6oq48ha689332b9p74ojgb9k70pjcb9o84p3ib9h8l2k2ci588o32ca68g
--   « R1 - M. et Mme Jerome Jadras » _8gqk4cq46d342b9j6kojcb9k88o46b9p6d248b9o6orjcghl8oo36h9p64
--
-- SIMULATION : encadré BEGIN … ROLLBACK. À exécuter toi-même. Remplace ROLLBACK par
-- COMMIT pour appliquer réellement.

BEGIN;

-- CONTRÔLE AVANT : les 3 lignes visées.
SELECT id, titre, type_rdv, dossier_id, google_event_id
FROM public.rendez_vous
WHERE google_event_id IN (
  '_8kp48h1j68p34b9j6d23ib9k850k4ba18l136b9i6oo3cc9l852j2hi564',
  '_6oq48ha689332b9p74ojgb9k70pjcb9o84p3ib9h8l2k2ci588o32ca68g',
  '_8gqk4cq46d342b9j6kojcb9k88o46b9p6d248b9o6orjcghl8oo36h9p64'
);

-- SUPPRESSION (bornée à ces 3 google_event_id).
DELETE FROM public.rendez_vous
WHERE google_event_id IN (
  '_8kp48h1j68p34b9j6d23ib9k850k4ba18l136b9i6oo3cc9l852j2hi564',
  '_6oq48ha689332b9p74ojgb9k70pjcb9o84p3ib9h8l2k2ci588o32ca68g',
  '_8gqk4cq46d342b9j6kojcb9k88o46b9p6d248b9o6orjcghl8oo36h9p64'
);

-- CONTRÔLE APRÈS : doit renvoyer 0.
SELECT count(*) AS restant
FROM public.rendez_vous
WHERE google_event_id IN (
  '_8kp48h1j68p34b9j6d23ib9k850k4ba18l136b9i6oo3cc9l852j2hi564',
  '_6oq48ha689332b9p74ojgb9k70pjcb9o84p3ib9h8l2k2ci588o32ca68g',
  '_8gqk4cq46d342b9j6kojcb9k88o46b9p6d248b9o6orjcghl8oo36h9p64'
);

ROLLBACK;  -- -> COMMIT pour appliquer
