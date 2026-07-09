# Inventaire 02 — Schéma de la base (collecte pure, pg_catalog / information_schema)

> **HEAD git courant : `48d1d92`** — le code audité correspond à la référence **`91e0db1`** de l'inventaire 01
> (le tip de branche = 91e0db1 + commits docs/audit uniquement, aucun changement de code).
> ⚠️ La BASE est lue en direct (état instantané) : son état n'est pas figé par le hash git — voir MÉTA.
> Méthode : SELECT lecture seule via MCP Supabase. Aucun document de pilotage consulté.
> Projet Supabase : `tfqtzfyavitrcsgbuueq` (illico-app). Schémas couverts : `public` + `storage`.

---

## 9. EXTENSIONS / TYPES / SÉQUENCES

**Extensions installées :**
- `pg_stat_statements` v1.11 (schema extensions)
- `pgcrypto` v1.3 (schema extensions)
- `plpgsql` v1.0 (schema pg_catalog)
- `supabase_vault` v0.3.1 (schema vault)
- `unaccent` v1.1 (schema extensions)
- `uuid-ossp` v1.1 (schema extensions)

**Types ENUM custom (public) :** aucun.
**Séquences (public) :** aucune (toutes les PK sont `uuid` avec défaut `gen_random_uuid()`).

---

## 1. TABLES & COLONNES (schéma public)

30 tables (dont 2 tables de sauvegarde `*backup*` et 4 vues listées en section 6, exclues ici).
Format : type · nullable (YES/NO) · défaut.

| table | colonne | type | null | défaut |
|---|---|---|---|---|
| _backup_rdv_autres_titre_20260526 | id | uuid | YES | — |
| _backup_rdv_autres_titre_20260526 | titre | text | YES | — |
| _backup_rdv_autres_titre_20260526 | notes | text | YES | — |
| admin_invitations | id | uuid | NO | gen_random_uuid() |
| admin_invitations | email | text | NO | — |
| admin_invitations | user_id | uuid | YES | — |
| admin_invitations | statut | text | NO | 'en_attente'::text |
| admin_invitations | created_at | timestamp with time zone | NO | now() |
| admin_invitations | consumed_at | timestamp with time zone | YES | — |
| admin_invitations | invited_by | text | YES | — |
| admin_invitations | expires_at | timestamp with time zone | YES | — |
| agences | id | uuid | NO | gen_random_uuid() |
| agences | societe_id | uuid | NO | — |
| agences | nom | text | NO | — |
| agences | ville | text | NO | — |
| agences | code | text | NO | — |
| agences | responsable_nom | text | YES | — |
| agences | email | text | YES | — |
| agences | logo_path | text | YES | — |
| agences | adresse | text | YES | — |
| agences | telephone | text | YES | — |
| agences | created_at | timestamp with time zone | NO | now() |
| agences | updated_at | timestamp with time zone | NO | now() |
| agences | code_postal | text | YES | — |
| artisans | id | uuid | NO | gen_random_uuid() |
| artisans | nom | text | YES | — |
| artisans | entreprise | text | YES | — |
| artisans | email | text | YES | — |
| artisans | telephone | text | YES | — |
| artisans | kbis_url | text | YES | — |
| artisans | decennale_url | text | YES | — |
| artisans | decennale_expiration | date | YES | — |
| artisans | created_at | timestamp without time zone | YES | now() |
| artisans | code_postal | text | YES | — |
| artisans | ville | text | YES | — |
| artisans | metier | text | YES | — |
| artisans | fiche_technique_url | text | YES | — |
| artisans | qualification_url | text | YES | — |
| artisans | prenom | text | YES | — |
| artisans | qualification_expiration | date | YES | — |
| artisans | rib_url | text | YES | — |
| artisans | paiement_direct | boolean | NO | false |
| artisans | partenaire | boolean | NO | false |
| artisans | societe_id | uuid | NO | — |
| artisans_specialites | artisan_id | uuid | NO | — |
| artisans_specialites | specialite_id | uuid | NO | — |
| chantier_documents | id | uuid | NO | gen_random_uuid() |
| chantier_documents | dossier_id | uuid | YES | — |
| chantier_documents | nom | text | NO | — |
| chantier_documents | path | text | NO | — |
| chantier_documents | type_mime | text | YES | — |
| chantier_documents | taille | integer | YES | — |
| chantier_documents | dans_restitution | boolean | YES | false |
| chantier_documents | created_at | timestamp without time zone | YES | now() |
| chantier_documents | categorie | text | YES | — |
| chantier_fiches_techniques | id | uuid | NO | gen_random_uuid() |
| chantier_fiches_techniques | dossier_id | uuid | YES | — |
| chantier_fiches_techniques | fiche_technique_id | uuid | YES | — |
| chantier_fiches_techniques | artisan_id | uuid | YES | — |
| chantier_fiches_techniques | created_at | timestamp without time zone | YES | now() |
| cibles_calendrier | id | uuid | NO | gen_random_uuid() |
| cibles_calendrier | agence_id | uuid | YES | — |
| cibles_calendrier | user_id | uuid | YES | — |
| cibles_calendrier | societe_id | uuid | YES | — |
| cibles_calendrier | fournisseur | text | NO | 'google'::text |
| cibles_calendrier | calendar_id | text | NO | — |
| cibles_calendrier | libelle | text | NO | — |
| cibles_calendrier | compte_oauth_id | uuid | YES | — |
| cibles_calendrier | actif | boolean | NO | true |
| cibles_calendrier | created_at | timestamp with time zone | NO | now() |
| cibles_calendrier | created_by | uuid | YES | auth.uid() |
| cibles_calendrier | agenda_nom | text | YES | — |
| clients | id | uuid | NO | gen_random_uuid() |
| clients | nom | text | NO | — |
| clients | prenom | text | NO | — |
| clients | email | text | YES | — |
| clients | telephone | text | YES | — |
| clients | adresse | text | YES | — |
| clients | type_client | text | YES | — |
| clients | referente | uuid | YES | — |
| clients | apporteur_affaires | boolean | YES | false |
| clients | apporteur_nom | text | YES | — |
| clients | apporteur_pourcentage | numeric | YES | — |
| clients | apporteur_base | text | YES | — |
| clients | created_at | timestamp without time zone | YES | now() |
| clients | civilite | text | YES | 'M.'::text |
| clients | prenom2 | text | YES | — |
| clients | nom2 | text | YES | — |
| clients | adresse_chantier | text | YES | — |
| clients | email2 | text | YES | — |
| clients | telephone2 | text | YES | — |
| clients | notes | text | YES | — |
| clients | agence_id | uuid | NO | — |
| clients | societe_id | uuid | NO | — |
| clients | archive | boolean | NO | false |
| comparateur_lignes | id | uuid | NO | gen_random_uuid() |
| comparateur_lignes | simulation_id | uuid | NO | — |
| comparateur_lignes | devis_artisan_id | uuid | NO | — |
| comparateur_lignes | inclus | boolean | NO | true |
| comparateur_lignes | montant_ttc_override | numeric | YES | — |
| comparateur_lignes | created_at | timestamp with time zone | YES | now() |
| comparateur_simulations | id | uuid | NO | gen_random_uuid() |
| comparateur_simulations | dossier_id | uuid | NO | — |
| comparateur_simulations | nom | text | NO | 'Simul'::text |
| comparateur_simulations | taux_courtage | numeric | NO | 6 |
| comparateur_simulations | taux_amo | numeric | NO | 15 |
| comparateur_simulations | created_at | timestamp with time zone | YES | now() |
| comptes_oauth | id | uuid | NO | gen_random_uuid() |
| comptes_oauth | user_id | uuid | NO | — |
| comptes_oauth | access_token | text | YES | — |
| comptes_oauth | refresh_token | text | YES | — |
| comptes_oauth | expiry_date | bigint | YES | — |
| comptes_oauth | created_at | timestamp with time zone | YES | now() |
| comptes_oauth | updated_at | timestamp with time zone | YES | now() |
| comptes_oauth | fournisseur | text | NO | 'google'::text |
| comptes_oauth | compte_email | text | YES | — |
| comptes_oauth | caldav_username | text | YES | — |
| comptes_oauth | caldav_password | text | YES | — |
| comptes_oauth | caldav_server | text | YES | — |
| comptes_rendus | id | uuid | NO | gen_random_uuid() |
| comptes_rendus | dossier_id | uuid | YES | — |
| comptes_rendus | auteur_id | uuid | YES | — |
| comptes_rendus | type_visite | text | YES | — |
| comptes_rendus | notes_brutes | text | YES | — |
| comptes_rendus | contenu_ia | text | YES | — |
| comptes_rendus | contenu_final | text | YES | — |
| comptes_rendus | valide | boolean | YES | false |
| comptes_rendus | date_visite | date | YES | — |
| comptes_rendus | created_at | timestamp without time zone | YES | now() |
| devis_artisans | id | uuid | NO | gen_random_uuid() |
| devis_artisans | dossier_id | uuid | YES | — |
| devis_artisans | artisan_id | uuid | YES | — |
| devis_artisans | montant_ht | numeric | YES | — |
| devis_artisans | montant_ttc | numeric | YES | — |
| devis_artisans | statut | text | YES | 'en_attente'::text |
| devis_artisans | date_reception | date | YES | — |
| devis_artisans | date_limite | date | YES | — |
| devis_artisans | commission_pourcentage | numeric | YES | — |
| devis_artisans | created_at | timestamp without time zone | YES | now() |
| devis_artisans | date_signature | date | YES | — |
| devis_artisans | acompte_pourcentage | numeric | YES | 30 |
| devis_artisans | acompte_montant_fixe | numeric | YES | — |
| devis_artisans | devis_signe_path | text | YES | — |
| devis_artisans | facture_path | text | YES | — |
| devis_artisans | qualification_path | text | YES | — |
| devis_artisans | devis_pdf_path | text | YES | — |
| devis_artisans | notes | text | YES | — |
| devis_artisans | ordre | integer | YES | — |
| devis_artisans | ttc_manuel | boolean | NO | false |
| devis_artisans | pv_path | text | YES | — |
| dossiers | id | uuid | NO | gen_random_uuid() |
| dossiers | reference | text | NO | — |
| dossiers | client_id | uuid | YES | — |
| dossiers | referente_id | uuid | YES | — |
| dossiers | typologie | text | YES | — |
| dossiers | statut | text | YES | — |
| dossiers | frais_consultation | numeric | YES | — |
| dossiers | frais_statut | text | YES | 'offerts'::text |
| dossiers | date_limite_devis | date | YES | — |
| dossiers | created_at | timestamp without time zone | YES | now() |
| dossiers | contrat_signe | boolean | YES | false |
| dossiers | date_signature_contrat | date | YES | — |
| dossiers | date_signature_devis | date | YES | — |
| dossiers | date_demarrage_chantier | date | YES | — |
| dossiers | date_fin_chantier | date | YES | — |
| dossiers | honoraires_amo_taux | numeric | YES | 9 |
| dossiers | taux_courtage | numeric | YES | 0.06 |
| dossiers | google_start_event_id | text | YES | — |
| dossiers | google_end_event_id | text | YES | — |
| dossiers | resume_projet | text | YES | — |
| dossiers | part_agente | numeric | YES | 0.5 |
| dossiers | frais_part_agente | numeric | YES | — |
| dossiers | contrat_url | text | YES | — |
| dossiers | description | text | YES | — |
| dossiers | apporteur_actif | boolean | NO | false |
| dossiers | agence_id | uuid | NO | — |
| dossiers | societe_id | uuid | NO | — |
| dossiers | archive | boolean | NO | false |
| dossiers | date_cloture | date | YES | — |
| dossiers | acces_expire_le | date | YES | — |
| factures_agente | id | uuid | NO | gen_random_uuid() |
| factures_agente | agente_id | uuid | YES | — |
| factures_agente | dossier_id | uuid | YES | — |
| factures_agente | type | text | YES | — |
| factures_agente | label | text | YES | — |
| factures_agente | montant | numeric | YES | — |
| factures_agente | mois | integer | YES | — |
| factures_agente | annee | integer | YES | — |
| factures_agente | statut | text | YES | 'a_facturer'::text |
| factures_agente | facture_path | text | YES | — |
| factures_agente | created_at | timestamp without time zone | YES | now() |
| factures_agente | type_facture | text | YES | 'agente_vers_ctp'::text |
| factures_artisans | id | uuid | NO | gen_random_uuid() |
| factures_artisans | devis_id | uuid | YES | — |
| factures_artisans | dossier_id | uuid | YES | — |
| factures_artisans | artisan_id | uuid | YES | — |
| factures_artisans | montant_ttc | numeric | YES | — |
| factures_artisans | date_paiement | date | YES | — |
| factures_artisans | statut | text | YES | 'en_attente'::text |
| factures_artisans | pdf_path | text | YES | — |
| factures_artisans | created_at | timestamp without time zone | YES | now() |
| factures_artisans | libelle | text | YES | — |
| fiches_techniques | id | uuid | NO | gen_random_uuid() |
| fiches_techniques | artisan_id | uuid | YES | — |
| fiches_techniques | nom | text | NO | — |
| fiches_techniques | description | text | YES | — |
| fiches_techniques | url | text | YES | — |
| fiches_techniques | created_at | timestamp without time zone | YES | now() |
| interventions_artisans | id | uuid | NO | gen_random_uuid() |
| interventions_artisans | dossier_id | uuid | YES | — |
| interventions_artisans | artisan_id | uuid | YES | — |
| interventions_artisans | type_intervention | text | YES | — |
| interventions_artisans | date_debut | date | YES | — |
| interventions_artisans | date_fin | date | YES | — |
| interventions_artisans | jours_specifiques | ARRAY | YES | — |
| interventions_artisans | notes | text | YES | — |
| interventions_artisans | created_at | timestamp without time zone | YES | now() |
| interventions_artisans | google_event_id | text | YES | — |
| interventions_artisans | google_end_event_id | text | YES | — |
| interventions_artisans | heure_debut | time without time zone | YES | — |
| interventions_artisans | duree_minutes | integer | YES | — |
| interventions_artisans | lieu | text | YES | 'client'::text |
| interventions_artisans | agence_id | uuid | YES | — |
| interventions_artisans | societe_id | uuid | YES | — |
| interventions_artisans | created_by | uuid | YES | auth.uid() |
| interventions_artisans | cible_id | uuid | YES | — |
| messages | id | uuid | NO | gen_random_uuid() |
| messages | dossier_id | uuid | YES | — |
| messages | auteur_id | uuid | YES | — |
| messages | contenu | text | NO | — |
| messages | lu | boolean | YES | false |
| messages | created_at | timestamp without time zone | YES | now() |
| messages | auteur_role | text | YES | 'agente'::text |
| messages | lu_agence | boolean | YES | false |
| messages | edited_at | timestamp without time zone | YES | — |
| notifications | id | uuid | NO | gen_random_uuid() |
| notifications | user_id | uuid | YES | — |
| notifications | type | text | NO | — |
| notifications | titre | text | NO | — |
| notifications | message | text | NO | — |
| notifications | dossier_id | uuid | YES | — |
| notifications | lu | boolean | YES | false |
| notifications | created_at | timestamp with time zone | YES | now() |
| objectifs_ca | id | uuid | NO | gen_random_uuid() |
| objectifs_ca | annee | integer | NO | — |
| objectifs_ca | cible | text | NO | — |
| objectifs_ca | agente_id | uuid | YES | — |
| objectifs_ca | montant | numeric | NO | 0 |
| objectifs_ca | created_at | timestamp with time zone | YES | now() |
| objectifs_ca | updated_at | timestamp with time zone | YES | now() |
| objectifs_ca | agence_id | uuid | NO | — |
| objectifs_ca | societe_id | uuid | NO | — |
| photos | id | uuid | NO | gen_random_uuid() |
| photos | dossier_id | uuid | YES | — |
| photos | url | text | NO | — |
| photos | legende | text | YES | — |
| photos | uploaded_by | uuid | YES | — |
| photos | created_at | timestamp without time zone | YES | now() |
| photos | categorie | text | YES | 'avant'::text |
| profiles | id | uuid | NO | — |
| profiles | nom | text | NO | — |
| profiles | prenom | text | NO | — |
| profiles | email | text | NO | — |
| profiles | role | text | NO | — |
| profiles | created_at | timestamp without time zone | YES | now() |
| profiles | client_id | uuid | YES | — |
| profiles | telephone | text | YES | — |
| profiles | part_agente_defaut | numeric | YES | 0.5 |
| profiles | frais_part_agente_defaut | numeric | YES | 0.5 |
| profiles | kbis_url | text | YES | — |
| profiles | parts_agente_disponibles | ARRAY | YES | — |
| profiles | redevance_debut | date | YES | — |
| profiles | rib_url | text | YES | — |
| profiles | notif_prefs | jsonb | YES | '{}'::jsonb |
| profiles | notif_canal_inapp | boolean | YES | true |
| profiles | notif_canal_email | boolean | YES | true |
| profiles | notif_canal_sms | boolean | YES | false |
| profiles | redevance_mensuelle_ht | numeric | YES | — |
| profiles | societe_id | uuid | NO | — |
| profiles | agence_id | uuid | YES | — |
| profiles | acces_actif | boolean | NO | true |
| profiles | cible_calendrier_defaut_id | uuid | YES | — |
| profiles | actif | boolean | NO | true |
| redevances | id | uuid | NO | gen_random_uuid() |
| redevances | mois | integer | NO | — |
| redevances | annee | integer | NO | — |
| redevances | montant_ht | numeric | YES | — |
| redevances | statut | text | YES | 'en_attente'::text |
| redevances | date_reglement | date | YES | — |
| redevances | mode_reglement | text | YES | — |
| redevances | notes | text | YES | — |
| redevances | created_at | timestamp without time zone | YES | now() |
| redevances | agente_id | uuid | YES | — |
| redevances | date_paiement | date | YES | — |
| redevances | note | text | YES | — |
| redevances | agence_id | uuid | NO | — |
| redevances | societe_id | uuid | NO | — |
| rendez_vous | id | uuid | NO | gen_random_uuid() |
| rendez_vous | dossier_id | uuid | YES | — |
| rendez_vous | type_rdv | text | YES | — |
| rendez_vous | date_heure | timestamp with time zone | NO | — |
| rendez_vous | duree_minutes | integer | YES | 60 |
| rendez_vous | artisan_id | uuid | YES | — |
| rendez_vous | google_event_id | text | YES | — |
| rendez_vous | notes | text | YES | — |
| rendez_vous | created_at | timestamp without time zone | YES | now() |
| rendez_vous | titre | text | YES | — |
| rendez_vous | lieu | text | YES | 'client'::text |
| rendez_vous | agence_id | uuid | YES | — |
| rendez_vous | societe_id | uuid | YES | — |
| rendez_vous | date_heure_old | timestamp without time zone | YES | — |
| rendez_vous | created_by | uuid | YES | auth.uid() |
| rendez_vous | cible_id | uuid | YES | — |
| societes | id | uuid | NO | gen_random_uuid() |
| societes | nom_societe | text | NO | — |
| societes | siret | text | YES | — |
| societes | rcs | text | YES | — |
| societes | created_at | timestamp with time zone | NO | now() |
| societes | updated_at | timestamp with time zone | NO | now() |
| specialites | id | uuid | NO | gen_random_uuid() |
| specialites | nom | text | NO | — |
| suivi_financier | id | uuid | NO | gen_random_uuid() |
| suivi_financier | dossier_id | uuid | YES | — |
| suivi_financier | type_echeance | text | YES | — |
| suivi_financier | artisan_id | uuid | YES | — |
| suivi_financier | montant_ht | numeric | YES | — |
| suivi_financier | montant_ttc | numeric | YES | — |
| suivi_financier | statut_client | text | YES | 'en_attente'::text |
| suivi_financier | statut_illico | text | YES | 'en_attente'::text |
| suivi_financier | statut_ctp | text | YES | 'en_attente'::text |
| suivi_financier | date_echeance | date | YES | — |
| suivi_financier | date_reglement | date | YES | — |
| suivi_financier | mode_reglement | text | YES | — |
| suivi_financier | notes | text | YES | — |
| suivi_financier | created_at | timestamp without time zone | YES | now() |
| suivi_financier | date_paiement | date | YES | — |
| suivi_financier | date_deblocage | date | YES | — |


---

## 2. CONTRAINTES (PK / FK / UNIQUE / CHECK)

| table | contrainte | type | définition |
|---|---|---|---|
| admin_invitations | admin_invitations_statut_check | CHECK | CHECK ((statut = ANY (ARRAY['en_attente'::text, 'consommee'::text, 'revoquee'::text]))) |
| admin_invitations | admin_invitations_user_id_fkey | FK | FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE |
| admin_invitations | admin_invitations_pkey | PK | PRIMARY KEY (id) |
| agences | agences_societe_id_fkey | FK | FOREIGN KEY (societe_id) REFERENCES societes(id) ON DELETE RESTRICT |
| agences | agences_pkey | PK | PRIMARY KEY (id) |
| agences | agences_societe_code_unique | UNIQUE | UNIQUE (societe_id, code) |
| artisans | artisans_societe_id_fkey | FK | FOREIGN KEY (societe_id) REFERENCES societes(id) ON DELETE RESTRICT |
| artisans | artisans_pkey | PK | PRIMARY KEY (id) |
| artisans_specialites | artisans_specialites_artisan_id_fkey | FK | FOREIGN KEY (artisan_id) REFERENCES artisans(id) ON DELETE CASCADE |
| artisans_specialites | artisans_specialites_specialite_id_fkey | FK | FOREIGN KEY (specialite_id) REFERENCES specialites(id) ON DELETE CASCADE |
| artisans_specialites | artisans_specialites_pkey | PK | PRIMARY KEY (artisan_id, specialite_id) |
| chantier_documents | chantier_documents_categorie_check | CHECK | CHECK (((categorie IS NULL) OR (categorie = ANY (ARRAY['compte_rendu'::text, 'facture_honoraire'::text])))) |
| chantier_documents | chantier_documents_dossier_id_fkey | FK | FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE CASCADE |
| chantier_documents | chantier_documents_pkey | PK | PRIMARY KEY (id) |
| chantier_fiches_techniques | chantier_fiches_techniques_artisan_id_fkey | FK | FOREIGN KEY (artisan_id) REFERENCES artisans(id) |
| chantier_fiches_techniques | chantier_fiches_techniques_dossier_id_fkey | FK | FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE CASCADE |
| chantier_fiches_techniques | chantier_fiches_techniques_fiche_technique_id_fkey | FK | FOREIGN KEY (fiche_technique_id) REFERENCES fiches_techniques(id) ON DELETE CASCADE |
| chantier_fiches_techniques | chantier_fiches_techniques_pkey | PK | PRIMARY KEY (id) |
| chantier_fiches_techniques | chantier_fiches_techniques_dossier_id_fiche_technique_id_key | UNIQUE | UNIQUE (dossier_id, fiche_technique_id) |
| cibles_calendrier | cible_perimetre_xor | CHECK | CHECK ((num_nonnulls(agence_id, user_id) = 1)) |
| cibles_calendrier | cibles_calendrier_fournisseur_check | CHECK | CHECK ((fournisseur = ANY (ARRAY['google'::text, 'outlook'::text, 'icloud'::text]))) |
| cibles_calendrier | cibles_calendrier_agence_id_fkey | FK | FOREIGN KEY (agence_id) REFERENCES agences(id) ON DELETE CASCADE |
| cibles_calendrier | cibles_calendrier_compte_oauth_id_fkey | FK | FOREIGN KEY (compte_oauth_id) REFERENCES comptes_oauth(id) ON DELETE SET NULL |
| cibles_calendrier | cibles_calendrier_created_by_fkey | FK | FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL |
| cibles_calendrier | cibles_calendrier_societe_id_fkey | FK | FOREIGN KEY (societe_id) REFERENCES societes(id) ON DELETE RESTRICT |
| cibles_calendrier | cibles_calendrier_user_id_fkey | FK | FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE |
| cibles_calendrier | cibles_calendrier_pkey | PK | PRIMARY KEY (id) |
| clients | clients_apporteur_base_check | CHECK | CHECK ((apporteur_base = ANY (ARRAY['par_devis'::text, 'total_chantier'::text]))) |
| clients | clients_type_client_check | CHECK | CHECK ((type_client = ANY (ARRAY['particulier'::text, 'professionnel'::text]))) |
| clients | clients_agence_id_fkey | FK | FOREIGN KEY (agence_id) REFERENCES agences(id) ON DELETE RESTRICT |
| clients | clients_referente_fkey | FK | FOREIGN KEY (referente) REFERENCES profiles(id) ON DELETE SET NULL |
| clients | clients_societe_id_fkey | FK | FOREIGN KEY (societe_id) REFERENCES societes(id) ON DELETE RESTRICT |
| clients | clients_pkey | PK | PRIMARY KEY (id) |
| comparateur_lignes | comparateur_lignes_devis_artisan_id_fkey | FK | FOREIGN KEY (devis_artisan_id) REFERENCES devis_artisans(id) ON DELETE CASCADE |
| comparateur_lignes | comparateur_lignes_simulation_id_fkey | FK | FOREIGN KEY (simulation_id) REFERENCES comparateur_simulations(id) ON DELETE CASCADE |
| comparateur_lignes | comparateur_lignes_pkey | PK | PRIMARY KEY (id) |
| comparateur_simulations | comparateur_simulations_dossier_id_fkey | FK | FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE CASCADE |
| comparateur_simulations | comparateur_simulations_pkey | PK | PRIMARY KEY (id) |
| comptes_oauth | comptes_oauth_fournisseur_check | CHECK | CHECK ((fournisseur = ANY (ARRAY['google'::text, 'outlook'::text, 'icloud'::text]))) |
| comptes_oauth | google_tokens_user_id_fkey | FK | FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE |
| comptes_oauth | comptes_oauth_pkey | PK | PRIMARY KEY (id) |
| comptes_oauth | comptes_oauth_user_fournisseur_key | UNIQUE | UNIQUE (user_id, fournisseur) |
| comptes_rendus | comptes_rendus_type_visite_check | CHECK | CHECK ((type_visite = ANY (ARRAY['r1'::text, 'r2'::text, 'r3'::text, 'suivi'::text, 'reception'::text]))) |
| comptes_rendus | comptes_rendus_auteur_id_fkey | FK | FOREIGN KEY (auteur_id) REFERENCES profiles(id) ON DELETE SET NULL |
| comptes_rendus | comptes_rendus_dossier_id_fkey | FK | FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE CASCADE |
| comptes_rendus | comptes_rendus_pkey | PK | PRIMARY KEY (id) |
| devis_artisans | devis_artisans_statut_check | CHECK | CHECK ((statut = ANY (ARRAY['en_attente'::text, 'recu'::text, 'accepte'::text, 'refuse'::text, 'a_modifier'::text]))) |
| devis_artisans | devis_artisans_artisan_id_fkey | FK | FOREIGN KEY (artisan_id) REFERENCES artisans(id) |
| devis_artisans | devis_artisans_dossier_id_fkey | FK | FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE CASCADE |
| devis_artisans | devis_artisans_pkey | PK | PRIMARY KEY (id) |
| dossiers | dossiers_frais_statut_check | CHECK | CHECK ((frais_statut = ANY (ARRAY['offerts'::text, 'factures'::text, 'regle'::text, 'rembourse'::text]))) |
| dossiers | dossiers_statut_manuel_check | CHECK | CHECK (((statut IS NULL) OR (statut = ANY (ARRAY['annule'::text, 'termine'::text])))) |
| dossiers | dossiers_typologie_check | CHECK | CHECK ((typologie = ANY (ARRAY['courtage'::text, 'amo'::text, 'estimo'::text, 'audit_energetique'::text, 'studio_jardin'::text, 'merad'::text]))) |
| dossiers | dossiers_agence_id_fkey | FK | FOREIGN KEY (agence_id) REFERENCES agences(id) ON DELETE RESTRICT |
| dossiers | dossiers_client_id_fkey | FK | FOREIGN KEY (client_id) REFERENCES clients(id) |
| dossiers | dossiers_referente_id_fkey | FK | FOREIGN KEY (referente_id) REFERENCES profiles(id) ON DELETE SET NULL |
| dossiers | dossiers_societe_id_fkey | FK | FOREIGN KEY (societe_id) REFERENCES societes(id) ON DELETE RESTRICT |
| dossiers | dossiers_pkey | PK | PRIMARY KEY (id) |
| dossiers | dossiers_agence_reference_key | UNIQUE | UNIQUE (agence_id, reference) |
| factures_agente | factures_agente_statut_check | CHECK | CHECK ((statut = ANY (ARRAY['a_facturer'::text, 'facture'::text, 'paye'::text]))) |
| factures_agente | factures_agente_type_check | CHECK | CHECK ((type = ANY (ARRAY['commission'::text, 'honoraire'::text, 'frais'::text]))) |
| factures_agente | factures_agente_agente_id_fkey | FK | FOREIGN KEY (agente_id) REFERENCES profiles(id) ON DELETE CASCADE |
| factures_agente | factures_agente_dossier_id_fkey | FK | FOREIGN KEY (dossier_id) REFERENCES dossiers(id) |
| factures_agente | factures_agente_pkey | PK | PRIMARY KEY (id) |
| factures_artisans | factures_artisans_statut_check | CHECK | CHECK ((statut = ANY (ARRAY['en_attente'::text, 'paye'::text]))) |
| factures_artisans | factures_artisans_artisan_id_fkey | FK | FOREIGN KEY (artisan_id) REFERENCES artisans(id) |
| factures_artisans | factures_artisans_devis_id_fkey | FK | FOREIGN KEY (devis_id) REFERENCES devis_artisans(id) ON DELETE CASCADE |
| factures_artisans | factures_artisans_dossier_id_fkey | FK | FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE CASCADE |
| factures_artisans | factures_artisans_pkey | PK | PRIMARY KEY (id) |
| fiches_techniques | fiches_techniques_artisan_id_fkey | FK | FOREIGN KEY (artisan_id) REFERENCES artisans(id) ON DELETE CASCADE |
| fiches_techniques | fiches_techniques_pkey | PK | PRIMARY KEY (id) |
| interventions_artisans | interventions_artisans_type_intervention_check | CHECK | CHECK ((type_intervention = ANY (ARRAY['periode'::text, 'jours_specifiques'::text]))) |
| interventions_artisans | interventions_artisans_agence_id_fkey | FK | FOREIGN KEY (agence_id) REFERENCES agences(id) ON DELETE RESTRICT |
| interventions_artisans | interventions_artisans_artisan_id_fkey | FK | FOREIGN KEY (artisan_id) REFERENCES artisans(id) |
| interventions_artisans | interventions_artisans_cible_id_fkey | FK | FOREIGN KEY (cible_id) REFERENCES cibles_calendrier(id) ON DELETE SET NULL |
| interventions_artisans | interventions_artisans_created_by_fkey | FK | FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL |
| interventions_artisans | interventions_artisans_dossier_id_fkey | FK | FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE CASCADE |
| interventions_artisans | interventions_artisans_societe_id_fkey | FK | FOREIGN KEY (societe_id) REFERENCES societes(id) ON DELETE RESTRICT |
| interventions_artisans | interventions_artisans_pkey | PK | PRIMARY KEY (id) |
| messages | messages_auteur_role_check | CHECK | CHECK ((auteur_role = ANY (ARRAY['client'::text, 'agente'::text, 'admin'::text]))) |
| messages | messages_auteur_id_fkey | FK | FOREIGN KEY (auteur_id) REFERENCES profiles(id) ON DELETE SET NULL |
| messages | messages_dossier_id_fkey | FK | FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE CASCADE |
| messages | messages_pkey | PK | PRIMARY KEY (id) |
| notifications | notifications_dossier_id_fkey | FK | FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE SET NULL |
| notifications | notifications_user_id_fkey | FK | FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE |
| notifications | notifications_pkey | PK | PRIMARY KEY (id) |
| objectifs_ca | objectifs_ca_cible_check | CHECK | CHECK ((cible = ANY (ARRAY['agence'::text, 'admin'::text, 'agente'::text]))) |
| objectifs_ca | objectifs_ca_agence_id_fkey | FK | FOREIGN KEY (agence_id) REFERENCES agences(id) ON DELETE RESTRICT |
| objectifs_ca | objectifs_ca_agente_id_fkey | FK | FOREIGN KEY (agente_id) REFERENCES profiles(id) ON DELETE CASCADE |
| objectifs_ca | objectifs_ca_societe_id_fkey | FK | FOREIGN KEY (societe_id) REFERENCES societes(id) ON DELETE RESTRICT |
| objectifs_ca | objectifs_ca_pkey | PK | PRIMARY KEY (id) |
| photos | photos_categorie_check | CHECK | CHECK ((categorie = ANY (ARRAY['avant'::text, 'pendant'::text, 'apres'::text, 'maquette'::text, 'illustration'::text]))) |
| photos | photos_dossier_id_fkey | FK | FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE CASCADE |
| photos | photos_uploaded_by_fkey | FK | FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL |
| photos | photos_pkey | PK | PRIMARY KEY (id) |
| profiles | profiles_client_agence_not_null | CHECK | CHECK (((role <> 'client'::text) OR (agence_id IS NOT NULL))) |
| profiles | profiles_role_check | CHECK | CHECK ((role = ANY (ARRAY['admin'::text, 'agente'::text, 'client'::text]))) |
| profiles | profiles_agence_id_fkey | FK | FOREIGN KEY (agence_id) REFERENCES agences(id) ON DELETE RESTRICT |
| profiles | profiles_cible_calendrier_defaut_id_fkey | FK | FOREIGN KEY (cible_calendrier_defaut_id) REFERENCES cibles_calendrier(id) ON DELETE SET NULL |
| profiles | profiles_client_id_fkey | FK | FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL |
| profiles | profiles_id_fkey | FK | FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE |
| profiles | profiles_societe_id_fkey | FK | FOREIGN KEY (societe_id) REFERENCES societes(id) ON DELETE RESTRICT |
| profiles | profiles_pkey | PK | PRIMARY KEY (id) |
| redevances | redevances_mode_reglement_check | CHECK | CHECK ((mode_reglement = ANY (ARRAY['virement'::text, 'cheque'::text]))) |
| redevances | redevances_mois_check | CHECK | CHECK (((mois >= 1) AND (mois <= 12))) |
| redevances | redevances_statut_check | CHECK | CHECK ((statut = ANY (ARRAY['en_attente'::text, 'regle'::text]))) |
| redevances | redevances_agence_id_fkey | FK | FOREIGN KEY (agence_id) REFERENCES agences(id) ON DELETE RESTRICT |
| redevances | redevances_agente_id_fkey | FK | FOREIGN KEY (agente_id) REFERENCES profiles(id) ON DELETE SET NULL |
| redevances | redevances_societe_id_fkey | FK | FOREIGN KEY (societe_id) REFERENCES societes(id) ON DELETE RESTRICT |
| redevances | redevances_pkey | PK | PRIMARY KEY (id) |
| rendez_vous | rendez_vous_type_rdv_check | CHECK | CHECK ((type_rdv = ANY (ARRAY['visite_technique_client'::text, 'visite_technique_artisan'::text, 'presentation_devis'::text, 'autres'::text, 'suivi'::text, 'reception'::text, 'etude'::text]))) |
| rendez_vous | rendez_vous_agence_id_fkey | FK | FOREIGN KEY (agence_id) REFERENCES agences(id) ON DELETE RESTRICT |
| rendez_vous | rendez_vous_artisan_id_fkey | FK | FOREIGN KEY (artisan_id) REFERENCES artisans(id) |
| rendez_vous | rendez_vous_cible_id_fkey | FK | FOREIGN KEY (cible_id) REFERENCES cibles_calendrier(id) ON DELETE SET NULL |
| rendez_vous | rendez_vous_created_by_fkey | FK | FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL |
| rendez_vous | rendez_vous_dossier_id_fkey | FK | FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE CASCADE |
| rendez_vous | rendez_vous_societe_id_fkey | FK | FOREIGN KEY (societe_id) REFERENCES societes(id) ON DELETE RESTRICT |
| rendez_vous | rendez_vous_pkey | PK | PRIMARY KEY (id) |
| societes | societes_pkey | PK | PRIMARY KEY (id) |
| specialites | specialites_pkey | PK | PRIMARY KEY (id) |
| specialites | specialites_nom_key | UNIQUE | UNIQUE (nom) |
| suivi_financier | suivi_financier_mode_reglement_check | CHECK | CHECK ((mode_reglement = ANY (ARRAY['virement'::text, 'cheque'::text]))) |
| suivi_financier | suivi_financier_statut_client_check | CHECK | CHECK ((statut_client = ANY (ARRAY['en_attente'::text, 'envoye'::text, 'regle'::text, 'retire'::text]))) |
| suivi_financier | suivi_financier_statut_ctp_check | CHECK | CHECK ((statut_ctp = ANY (ARRAY['en_attente'::text, 'recu'::text, 'rembourse'::text]))) |
| suivi_financier | suivi_financier_statut_illico_check | CHECK | CHECK ((statut_illico = ANY (ARRAY['en_attente'::text, 'recu'::text]))) |
| suivi_financier | suivi_financier_type_echeance_check | CHECK | CHECK ((type_echeance = ANY (ARRAY['frais_consultation'::text, 'acompte_artisan'::text, 'facture_intermediaire'::text, 'facture_finale'::text, 'honoraires_illico'::text, 'commission_artisan'::text, 'apporteur_agente'::text, 'honoraires_courtage'::text, 'acompte_amo'::text, 'solde_amo'::text, 'honoraires_courtage_ts'::text]))) |
| suivi_financier | suivi_financier_artisan_id_fkey | FK | FOREIGN KEY (artisan_id) REFERENCES artisans(id) |
| suivi_financier | suivi_financier_dossier_id_fkey | FK | FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE CASCADE |
| suivi_financier | suivi_financier_pkey | PK | PRIMARY KEY (id) |
| suivi_financier | suivi_financier_dossier_type_artisan_unique | UNIQUE | UNIQUE (dossier_id, type_echeance, artisan_id) |

---

## 3. INDEX (pg_indexes — inclut partiels WHERE et uniques manuels)

| table | index | définition |
|---|---|---|
| admin_invitations | admin_invitations_email_en_attente_uniq | CREATE UNIQUE INDEX admin_invitations_email_en_attente_uniq ON public.admin_invitations USING btree (email) WHERE (statut = 'en_attente'::text) |
| admin_invitations | admin_invitations_pkey | CREATE UNIQUE INDEX admin_invitations_pkey ON public.admin_invitations USING btree (id) |
| admin_invitations | idx_admin_invitations_user_id | CREATE INDEX idx_admin_invitations_user_id ON public.admin_invitations USING btree (user_id) |
| agences | agences_pkey | CREATE UNIQUE INDEX agences_pkey ON public.agences USING btree (id) |
| agences | agences_societe_code_unique | CREATE UNIQUE INDEX agences_societe_code_unique ON public.agences USING btree (societe_id, code) |
| agences | agences_societe_id_idx | CREATE INDEX agences_societe_id_idx ON public.agences USING btree (societe_id) |
| artisans | artisans_pkey | CREATE UNIQUE INDEX artisans_pkey ON public.artisans USING btree (id) |
| artisans | artisans_societe_id_idx | CREATE INDEX artisans_societe_id_idx ON public.artisans USING btree (societe_id) |
| artisans_specialites | artisans_specialites_pkey | CREATE UNIQUE INDEX artisans_specialites_pkey ON public.artisans_specialites USING btree (artisan_id, specialite_id) |
| artisans_specialites | idx_artisans_specialites_specialite_id | CREATE INDEX idx_artisans_specialites_specialite_id ON public.artisans_specialites USING btree (specialite_id) |
| chantier_documents | chantier_documents_pkey | CREATE UNIQUE INDEX chantier_documents_pkey ON public.chantier_documents USING btree (id) |
| chantier_documents | idx_chantier_documents_dossier_id | CREATE INDEX idx_chantier_documents_dossier_id ON public.chantier_documents USING btree (dossier_id) |
| chantier_fiches_techniques | chantier_fiches_techniques_dossier_id_fiche_technique_id_key | CREATE UNIQUE INDEX chantier_fiches_techniques_dossier_id_fiche_technique_id_key ON public.chantier_fiches_techniques USING btree (dossier_id, fiche_technique_id) |
| chantier_fiches_techniques | chantier_fiches_techniques_pkey | CREATE UNIQUE INDEX chantier_fiches_techniques_pkey ON public.chantier_fiches_techniques USING btree (id) |
| chantier_fiches_techniques | idx_chantier_fiches_techniques_artisan_id | CREATE INDEX idx_chantier_fiches_techniques_artisan_id ON public.chantier_fiches_techniques USING btree (artisan_id) |
| chantier_fiches_techniques | idx_chantier_fiches_techniques_fiche_technique_id | CREATE INDEX idx_chantier_fiches_techniques_fiche_technique_id ON public.chantier_fiches_techniques USING btree (fiche_technique_id) |
| cibles_calendrier | cibles_calendrier_pkey | CREATE UNIQUE INDEX cibles_calendrier_pkey ON public.cibles_calendrier USING btree (id) |
| clients | clients_agence_id_idx | CREATE INDEX clients_agence_id_idx ON public.clients USING btree (agence_id) |
| clients | clients_pkey | CREATE UNIQUE INDEX clients_pkey ON public.clients USING btree (id) |
| clients | clients_societe_id_idx | CREATE INDEX clients_societe_id_idx ON public.clients USING btree (societe_id) |
| clients | idx_clients_referente | CREATE INDEX idx_clients_referente ON public.clients USING btree (referente) |
| comparateur_lignes | comparateur_lignes_devis_artisan_id_idx | CREATE INDEX comparateur_lignes_devis_artisan_id_idx ON public.comparateur_lignes USING btree (devis_artisan_id) |
| comparateur_lignes | comparateur_lignes_pkey | CREATE UNIQUE INDEX comparateur_lignes_pkey ON public.comparateur_lignes USING btree (id) |
| comparateur_lignes | comparateur_lignes_simulation_id_idx | CREATE INDEX comparateur_lignes_simulation_id_idx ON public.comparateur_lignes USING btree (simulation_id) |
| comparateur_simulations | comparateur_simulations_dossier_id_idx | CREATE INDEX comparateur_simulations_dossier_id_idx ON public.comparateur_simulations USING btree (dossier_id) |
| comparateur_simulations | comparateur_simulations_pkey | CREATE UNIQUE INDEX comparateur_simulations_pkey ON public.comparateur_simulations USING btree (id) |
| comptes_oauth | comptes_oauth_pkey | CREATE UNIQUE INDEX comptes_oauth_pkey ON public.comptes_oauth USING btree (id) |
| comptes_oauth | comptes_oauth_user_fournisseur_key | CREATE UNIQUE INDEX comptes_oauth_user_fournisseur_key ON public.comptes_oauth USING btree (user_id, fournisseur) |
| comptes_rendus | comptes_rendus_pkey | CREATE UNIQUE INDEX comptes_rendus_pkey ON public.comptes_rendus USING btree (id) |
| comptes_rendus | idx_comptes_rendus_auteur_id | CREATE INDEX idx_comptes_rendus_auteur_id ON public.comptes_rendus USING btree (auteur_id) |
| comptes_rendus | idx_comptes_rendus_dossier_id | CREATE INDEX idx_comptes_rendus_dossier_id ON public.comptes_rendus USING btree (dossier_id) |
| devis_artisans | devis_artisans_pkey | CREATE UNIQUE INDEX devis_artisans_pkey ON public.devis_artisans USING btree (id) |
| devis_artisans | idx_devis_artisans_artisan_id | CREATE INDEX idx_devis_artisans_artisan_id ON public.devis_artisans USING btree (artisan_id) |
| devis_artisans | idx_devis_artisans_dossier_id | CREATE INDEX idx_devis_artisans_dossier_id ON public.devis_artisans USING btree (dossier_id) |
| dossiers | dossiers_agence_id_idx | CREATE INDEX dossiers_agence_id_idx ON public.dossiers USING btree (agence_id) |
| dossiers | dossiers_agence_reference_key | CREATE UNIQUE INDEX dossiers_agence_reference_key ON public.dossiers USING btree (agence_id, reference) |
| dossiers | dossiers_pkey | CREATE UNIQUE INDEX dossiers_pkey ON public.dossiers USING btree (id) |
| dossiers | dossiers_societe_id_idx | CREATE INDEX dossiers_societe_id_idx ON public.dossiers USING btree (societe_id) |
| dossiers | idx_dossiers_client_id | CREATE INDEX idx_dossiers_client_id ON public.dossiers USING btree (client_id) |
| dossiers | idx_dossiers_referente_id | CREATE INDEX idx_dossiers_referente_id ON public.dossiers USING btree (referente_id) |
| factures_agente | factures_agente_pkey | CREATE UNIQUE INDEX factures_agente_pkey ON public.factures_agente USING btree (id) |
| factures_agente | factures_agente_unique | CREATE UNIQUE INDEX factures_agente_unique ON public.factures_agente USING btree (agente_id, annee, mois, type_facture) |
| factures_agente | idx_factures_agente_dossier_id | CREATE INDEX idx_factures_agente_dossier_id ON public.factures_agente USING btree (dossier_id) |
| factures_artisans | factures_artisans_pkey | CREATE UNIQUE INDEX factures_artisans_pkey ON public.factures_artisans USING btree (id) |
| factures_artisans | idx_factures_artisans_artisan_id | CREATE INDEX idx_factures_artisans_artisan_id ON public.factures_artisans USING btree (artisan_id) |
| factures_artisans | idx_factures_artisans_devis_id | CREATE INDEX idx_factures_artisans_devis_id ON public.factures_artisans USING btree (devis_id) |
| factures_artisans | idx_factures_artisans_dossier_id | CREATE INDEX idx_factures_artisans_dossier_id ON public.factures_artisans USING btree (dossier_id) |
| fiches_techniques | fiches_techniques_pkey | CREATE UNIQUE INDEX fiches_techniques_pkey ON public.fiches_techniques USING btree (id) |
| fiches_techniques | idx_fiches_techniques_artisan_id | CREATE INDEX idx_fiches_techniques_artisan_id ON public.fiches_techniques USING btree (artisan_id) |
| interventions_artisans | idx_interventions_artisans_artisan_id | CREATE INDEX idx_interventions_artisans_artisan_id ON public.interventions_artisans USING btree (artisan_id) |
| interventions_artisans | idx_interventions_artisans_dossier_id | CREATE INDEX idx_interventions_artisans_dossier_id ON public.interventions_artisans USING btree (dossier_id) |
| interventions_artisans | interventions_artisans_pkey | CREATE UNIQUE INDEX interventions_artisans_pkey ON public.interventions_artisans USING btree (id) |
| messages | idx_messages_auteur_id | CREATE INDEX idx_messages_auteur_id ON public.messages USING btree (auteur_id) |
| messages | idx_messages_dossier_id | CREATE INDEX idx_messages_dossier_id ON public.messages USING btree (dossier_id) |
| messages | messages_pkey | CREATE UNIQUE INDEX messages_pkey ON public.messages USING btree (id) |
| notifications | idx_notifications_dossier_id | CREATE INDEX idx_notifications_dossier_id ON public.notifications USING btree (dossier_id) |
| notifications | notifications_created_idx | CREATE INDEX notifications_created_idx ON public.notifications USING btree (created_at DESC) |
| notifications | notifications_pkey | CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id) |
| notifications | notifications_user_lu_idx | CREATE INDEX notifications_user_lu_idx ON public.notifications USING btree (user_id, lu) |
| objectifs_ca | idx_objectifs_ca_agente_id | CREATE INDEX idx_objectifs_ca_agente_id ON public.objectifs_ca USING btree (agente_id) |
| objectifs_ca | objectifs_ca_agence_id_idx | CREATE INDEX objectifs_ca_agence_id_idx ON public.objectifs_ca USING btree (agence_id) |
| objectifs_ca | objectifs_ca_agence_unique | CREATE UNIQUE INDEX objectifs_ca_agence_unique ON public.objectifs_ca USING btree (annee, cible, agence_id) WHERE (agente_id IS NULL) |
| objectifs_ca | objectifs_ca_agente_unique | CREATE UNIQUE INDEX objectifs_ca_agente_unique ON public.objectifs_ca USING btree (annee, cible, agente_id) WHERE (agente_id IS NOT NULL) |
| objectifs_ca | objectifs_ca_pkey | CREATE UNIQUE INDEX objectifs_ca_pkey ON public.objectifs_ca USING btree (id) |
| objectifs_ca | objectifs_ca_societe_id_idx | CREATE INDEX objectifs_ca_societe_id_idx ON public.objectifs_ca USING btree (societe_id) |
| photos | idx_photos_dossier_id | CREATE INDEX idx_photos_dossier_id ON public.photos USING btree (dossier_id) |
| photos | idx_photos_uploaded_by | CREATE INDEX idx_photos_uploaded_by ON public.photos USING btree (uploaded_by) |
| photos | photos_pkey | CREATE UNIQUE INDEX photos_pkey ON public.photos USING btree (id) |
| profiles | idx_profiles_client_id | CREATE INDEX idx_profiles_client_id ON public.profiles USING btree (client_id) |
| profiles | profiles_agence_id_idx | CREATE INDEX profiles_agence_id_idx ON public.profiles USING btree (agence_id) |
| profiles | profiles_pkey | CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id) |
| profiles | profiles_societe_id_idx | CREATE INDEX profiles_societe_id_idx ON public.profiles USING btree (societe_id) |
| redevances | redevances_agence_id_idx | CREATE INDEX redevances_agence_id_idx ON public.redevances USING btree (agence_id) |
| redevances | redevances_agente_annee_mois_unique | CREATE UNIQUE INDEX redevances_agente_annee_mois_unique ON public.redevances USING btree (agente_id, annee, mois) |
| redevances | redevances_pkey | CREATE UNIQUE INDEX redevances_pkey ON public.redevances USING btree (id) |
| redevances | redevances_societe_id_idx | CREATE INDEX redevances_societe_id_idx ON public.redevances USING btree (societe_id) |
| rendez_vous | idx_rendez_vous_artisan_id | CREATE INDEX idx_rendez_vous_artisan_id ON public.rendez_vous USING btree (artisan_id) |
| rendez_vous | idx_rendez_vous_dossier_id | CREATE INDEX idx_rendez_vous_dossier_id ON public.rendez_vous USING btree (dossier_id) |
| rendez_vous | rendez_vous_pkey | CREATE UNIQUE INDEX rendez_vous_pkey ON public.rendez_vous USING btree (id) |
| societes | societes_pkey | CREATE UNIQUE INDEX societes_pkey ON public.societes USING btree (id) |
| societes | societes_siret_uniq | CREATE UNIQUE INDEX societes_siret_uniq ON public.societes USING btree (siret) WHERE (siret IS NOT NULL) |
| specialites | specialites_nom_key | CREATE UNIQUE INDEX specialites_nom_key ON public.specialites USING btree (nom) |
| specialites | specialites_pkey | CREATE UNIQUE INDEX specialites_pkey ON public.specialites USING btree (id) |
| suivi_financier | idx_suivi_financier_artisan_id | CREATE INDEX idx_suivi_financier_artisan_id ON public.suivi_financier USING btree (artisan_id) |
| suivi_financier | suivi_financier_dossier_type_artisan_unique | CREATE UNIQUE INDEX suivi_financier_dossier_type_artisan_unique ON public.suivi_financier USING btree (dossier_id, type_echeance, artisan_id) |
| suivi_financier | suivi_financier_pkey | CREATE UNIQUE INDEX suivi_financier_pkey ON public.suivi_financier USING btree (id) |
| suivi_financier | suivi_financier_unique_avec_artisan | CREATE UNIQUE INDEX suivi_financier_unique_avec_artisan ON public.suivi_financier USING btree (dossier_id, type_echeance, artisan_id) WHERE (artisan_id IS NOT NULL) |
| suivi_financier | suivi_financier_unique_sans_artisan | CREATE UNIQUE INDEX suivi_financier_unique_sans_artisan ON public.suivi_financier USING btree (dossier_id, type_echeance) WHERE ((artisan_id IS NULL) AND (type_echeance <> 'honoraires_courtage_ts'::text)) |

---

## 4. TRIGGERS (public — non internes)

| table | définition |
|---|---|
| agences | CREATE TRIGGER agences_generer_code_trg BEFORE INSERT ON public.agences FOR EACH ROW EXECUTE FUNCTION agences_generer_code() |
| cibles_calendrier | CREATE TRIGGER cibles_calendrier_derive_societe BEFORE INSERT OR UPDATE ON public.cibles_calendrier FOR EACH ROW EXECUTE FUNCTION cible_derive_societe() |
| clients | CREATE TRIGGER clients_derive_societe BEFORE INSERT OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION derive_societe_id_from_agence() |
| clients | CREATE TRIGGER clients_propagate_archive AFTER UPDATE OF archive ON public.clients FOR EACH ROW WHEN ((old.archive IS DISTINCT FROM new.archive)) EXECUTE FUNCTION propagate_client_archive() |
| dossiers | CREATE TRIGGER dossier_inherit_referente BEFORE INSERT ON public.dossiers FOR EACH ROW EXECUTE FUNCTION set_dossier_referente_from_client() |
| dossiers | CREATE TRIGGER dossiers_derive_societe BEFORE INSERT OR UPDATE ON public.dossiers FOR EACH ROW EXECUTE FUNCTION derive_societe_id_from_agence() |
| dossiers | CREATE TRIGGER dossiers_generer_reference BEFORE INSERT ON public.dossiers FOR EACH ROW EXECUTE FUNCTION generer_reference_dossier() |
| interventions_artisans | CREATE TRIGGER interventions_artisans_derive_tenant BEFORE INSERT OR UPDATE ON public.interventions_artisans FOR EACH ROW EXECUTE FUNCTION agenda_derive_tenant() |
| messages | CREATE TRIGGER messages_lock_columns_trg BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION messages_lock_columns() |
| objectifs_ca | CREATE TRIGGER objectifs_ca_derive_societe BEFORE INSERT OR UPDATE ON public.objectifs_ca FOR EACH ROW EXECUTE FUNCTION derive_societe_id_from_agence() |
| profiles | CREATE TRIGGER profile_client_derive_agence_trg BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION profile_client_derive_agence() |
| profiles | CREATE TRIGGER profiles_protege_identite_trg BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION profiles_protege_identite() |
| redevances | CREATE TRIGGER redevances_derive_societe BEFORE INSERT OR UPDATE ON public.redevances FOR EACH ROW EXECUTE FUNCTION derive_societe_id_from_agence() |
| redevances | CREATE TRIGGER trg_redevances_montant_protege BEFORE UPDATE ON public.redevances FOR EACH ROW EXECUTE FUNCTION redevances_montant_protege() |
| rendez_vous | CREATE TRIGGER rendez_vous_derive_tenant BEFORE INSERT OR UPDATE ON public.rendez_vous FOR EACH ROW EXECUTE FUNCTION agenda_derive_tenant() |

---

## 5. FONCTIONS (public)

⚠️ Les **SECURITY DEFINER** exécutent avec les droits du propriétaire (bypass RLS de l'appelant).
`search_path` épinglé (SET) protège de l'injection de schéma ; `(non épinglé)` = non protégé.

| fonction | arguments | retour | sécurité | search_path | volatilité |
|---|---|---|---|---|---|
| agences_generer_code |  | trigger | **DEFINER** | search_path=public, extensions | volatile |
| agenda_derive_tenant |  | trigger | **DEFINER** | search_path=public | volatile |
| cible_derive_societe |  | trigger | **DEFINER** | search_path=public | volatile |
| derive_societe_id_from_agence |  | trigger | **DEFINER** | search_path=public | volatile |
| desactiver_acces_expires |  | integer | **DEFINER** | search_path=public | volatile |
| generer_reference_dossier |  | trigger | **DEFINER** | search_path=public | volatile |
| get_my_agence_id |  | uuid | **DEFINER** | search_path=public | stable |
| get_my_role |  | text | **DEFINER** | search_path=public | stable |
| get_my_societe_id |  | uuid | **DEFINER** | search_path=public | stable |
| mes_dossiers_client |  | SETOF uuid | **DEFINER** | search_path=public | stable |
| mon_expiration_client |  | date | **DEFINER** | search_path=public | stable |
| onboarding_create_societe | p_user_id uuid, p_nom_societe text, p_siret text, p_rcs text, p_agence_nom text, p_agence_ville text, p_agence_adresse text, p_agence_cp text, p_agence_tel text, p_nom text, p_prenom text, p_telephone text | uuid | **DEFINER** | search_path=public | volatile |
| profile_client_derive_agence |  | trigger | **DEFINER** | search_path=public | volatile |
| profiles_protege_identite |  | trigger | **DEFINER** | search_path=public | volatile |
| propagate_client_archive |  | trigger | **DEFINER** | search_path=public | volatile |
| redevances_montant_protege |  | trigger | **DEFINER** | search_path=public | volatile |
| rls_auto_enable |  | event_trigger | **DEFINER** | search_path=pg_catalog | volatile |
| set_dossier_referente_from_client |  | trigger | **DEFINER** | search_path=public | volatile |
| convertir_dossier_en_amo | p_dossier_id uuid, p_taux_amo numeric | void | INVOKER | search_path=public | volatile |
| convertir_dossier_en_courtage | p_dossier_id uuid | void | INVOKER | search_path=public | volatile |
| messages_lock_columns |  | trigger | INVOKER | search_path="" | volatile |
| suivi_courtage_ts_upsert | p_dossier_id uuid, p_montant numeric | suivi_financier | INVOKER | search_path=public | volatile |
| suivi_toggle_honoraires | p_dossier_id uuid, p_types text[], p_montant numeric, p_regle boolean, p_today date | void | INVOKER | search_path=public | volatile |

---

## 6. VUES (public)

Les 4 vues sont `security_invoker=false` → **SECURITY DEFINER views** (s'exécutent avec les droits
du créateur ; le filtrage client repose sur la fonction `mes_dossiers_client()` dans le WHERE).

##### `client_comptes_rendus`  — reloptions: security_invoker=false

```sql
 SELECT cr.id AS cr_id,
    cr.dossier_id,
    cr.type_visite,
    cr.date_visite,
    cr.contenu_final,
    cr.created_at,
    p.prenom AS auteur_prenom,
    p.nom AS auteur_nom
   FROM comptes_rendus cr
     LEFT JOIN profiles p ON p.id = cr.auteur_id
  WHERE cr.valide = true AND (cr.type_visite <> ALL (ARRAY['r1'::text, 'r2'::text, 'r3'::text])) AND (cr.dossier_id IN ( SELECT mes_dossiers_client() AS mes_dossiers_client));
```

##### `client_devis_acceptes`  — reloptions: security_invoker=false

```sql
 SELECT da.id AS devis_id,
    da.dossier_id,
    da.statut,
    a.entreprise AS artisan_entreprise,
    da.devis_signe_path IS NOT NULL AS a_devis_signe
   FROM devis_artisans da
     JOIN artisans a ON a.id = da.artisan_id
  WHERE da.statut = 'accepte'::text AND (da.dossier_id IN ( SELECT mes_dossiers_client() AS mes_dossiers_client));
```

##### `client_interventions`  — reloptions: security_invoker=false

```sql
 SELECT i.id,
    i.dossier_id,
    i.type_intervention,
    i.date_debut,
    i.date_fin,
    i.jours_specifiques,
    i.heure_debut,
    i.duree_minutes,
    i.lieu,
    a.entreprise AS artisan_entreprise
   FROM interventions_artisans i
     LEFT JOIN artisans a ON a.id = i.artisan_id
  WHERE (i.dossier_id IN ( SELECT mes_dossiers_client() AS mes_dossiers_client));
```

##### `client_rendez_vous`  — reloptions: security_invoker=false

```sql
 SELECT id,
    dossier_id,
    date_heure,
    duree_minutes,
    lieu,
        CASE type_rdv
            WHEN 'visite_technique_client'::text THEN 'Première visite'::text
            WHEN 'visite_technique_artisan'::text THEN 'Visite technique'::text
            WHEN 'presentation_devis'::text THEN 'Présentation des devis'::text
            WHEN 'suivi'::text THEN 'Suivi de chantier'::text
            WHEN 'reception'::text THEN 'Réception de chantier'::text
            ELSE NULL::text
        END AS libelle
   FROM rendez_vous r
  WHERE (type_rdv = ANY (ARRAY['visite_technique_client'::text, 'visite_technique_artisan'::text, 'presentation_devis'::text, 'suivi'::text, 'reception'::text])) AND (dossier_id IN ( SELECT mes_dossiers_client() AS mes_dossiers_client));
```

---

## 7. RLS — activation par table + POLICIES

**RLS activée sur les 29 tables du schéma public** (toutes `ON`, aucune en `FORCE`). Vérifié via `pg_class.relrowsecurity`. Tables couvertes : toutes celles de la section 1 (y compris les 2 tables de sauvegarde `_backup_*` et `backup_rattrapage_*`).

### Policies (verbatim, whitespace normalisé sur une ligne)

| table | policy | cmd | rôles (TO) | USING | WITH CHECK |
|---|---|---|---|---|---|
| agences | agences_select_ma_societe | SELECT | authenticated | (societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id)) | — |
| artisans | artisans_scope | ALL | authenticated | ((( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text])) AND (societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id))) | ((( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text])) AND (societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id))) |
| artisans_specialites | artisans_specialites_scope | ALL | authenticated | (EXISTS ( SELECT 1 FROM artisans a WHERE (a.id = artisans_specialites.artisan_id))) | (EXISTS ( SELECT 1 FROM artisans a WHERE (a.id = artisans_specialites.artisan_id))) |
| chantier_documents | chantier_documents_scope | ALL | authenticated | ((( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text])) AND (EXISTS ( SELECT 1 FROM dossiers d WHERE (d.id = chantier_documents.dossier_id)))) | ((( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text])) AND (EXISTS ( SELECT 1 FROM dossiers d WHERE (d.id = chantier_documents.dossier_id)))) |
| chantier_fiches_techniques | chantier_fiches_techniques_scope | ALL | authenticated | ((( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text])) AND (EXISTS ( SELECT 1 FROM dossiers d WHERE (d.id = chantier_fiches_techniques.dossier_id)))) | ((( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text])) AND (EXISTS ( SELECT 1 FROM dossiers d WHERE (d.id = chantier_fiches_techniques.dossier_id)))) |
| cibles_calendrier | cibles_delete | DELETE | authenticated | (((user_id = ( SELECT auth.uid() AS uid)) AND (agence_id IS NULL)) OR ((( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (user_id IS NULL) AND (societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id)))) | — |
| cibles_calendrier | cibles_insert | INSERT | authenticated | — | (((user_id = ( SELECT auth.uid() AS uid)) AND (agence_id IS NULL)) OR ((( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (user_id IS NULL) AND (societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id)))) |
| cibles_calendrier | cibles_select | SELECT | authenticated | ((user_id = ( SELECT auth.uid() AS uid)) OR ((agence_id IS NOT NULL) AND (agence_id = ( SELECT get_my_agence_id() AS get_my_agence_id))) OR ((agence_id IS NOT NULL) AND (( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id)))) | — |
| cibles_calendrier | cibles_update | UPDATE | authenticated | (((user_id = ( SELECT auth.uid() AS uid)) AND (agence_id IS NULL)) OR ((( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (user_id IS NULL) AND (societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id)))) | (((user_id = ( SELECT auth.uid() AS uid)) AND (agence_id IS NULL)) OR ((( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (user_id IS NULL) AND (societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id)))) |
| clients | clients_client_read | SELECT | authenticated | (id IN ( SELECT profiles.client_id FROM profiles WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) | — |
| clients | clients_scope | ALL | authenticated | (((( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id))) OR ((referente = ( SELECT auth.uid() AS uid)) AND (agence_id = ( SELECT get_my_agence_id() AS get_my_agence_id)))) | (((( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id))) OR ((referente = ( SELECT auth.uid() AS uid)) AND (agence_id = ( SELECT get_my_agence_id() AS get_my_agence_id)))) |
| comparateur_lignes | comparateur_lignes_scope | ALL | authenticated | ((( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text])) AND (EXISTS ( SELECT 1 FROM (comparateur_simulations cs JOIN dossiers d ON ((d.id = cs.dossier_id))) WHERE (cs.id = comparateur_lignes.simulation_id)))) | ((( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text])) AND (EXISTS ( SELECT 1 FROM (comparateur_simulations cs JOIN dossiers d ON ((d.id = cs.dossier_id))) WHERE (cs.id = comparateur_lignes.simulation_id)))) |
| comparateur_simulations | comparateur_simulations_scope | ALL | authenticated | ((( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text])) AND (EXISTS ( SELECT 1 FROM dossiers d WHERE (d.id = comparateur_simulations.dossier_id)))) | ((( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text])) AND (EXISTS ( SELECT 1 FROM dossiers d WHERE (d.id = comparateur_simulations.dossier_id)))) |
| comptes_oauth | comptes_oauth_own | ALL | authenticated | (user_id = ( SELECT auth.uid() AS uid)) | (user_id = ( SELECT auth.uid() AS uid)) |
| comptes_rendus | comptes_rendus_scope | ALL | authenticated | ((( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text])) AND (EXISTS ( SELECT 1 FROM dossiers d WHERE (d.id = comptes_rendus.dossier_id)))) | ((( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text])) AND (EXISTS ( SELECT 1 FROM dossiers d WHERE (d.id = comptes_rendus.dossier_id)))) |
| devis_artisans | devis_artisans_scope | ALL | authenticated | ((( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text])) AND (EXISTS ( SELECT 1 FROM dossiers d WHERE (d.id = devis_artisans.dossier_id)))) | ((( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text])) AND (EXISTS ( SELECT 1 FROM dossiers d WHERE (d.id = devis_artisans.dossier_id)))) |
| dossiers | dossiers_client_read | SELECT | authenticated | (id IN ( SELECT mes_dossiers_client() AS mes_dossiers_client)) | — |
| dossiers | dossiers_scope | ALL | authenticated | (((( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id))) OR ((referente_id = ( SELECT auth.uid() AS uid)) AND (agence_id = ( SELECT get_my_agence_id() AS get_my_agence_id)))) | (((( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id))) OR ((referente_id = ( SELECT auth.uid() AS uid)) AND (agence_id = ( SELECT get_my_agence_id() AS get_my_agence_id)))) |
| factures_agente | factures_agente_scope | ALL | authenticated | (((( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (agente_id IN ( SELECT profiles.id FROM profiles WHERE (profiles.societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id))))) OR (agente_id = ( SELECT auth.uid() AS uid))) | (((( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (agente_id IN ( SELECT profiles.id FROM profiles WHERE (profiles.societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id))))) OR (agente_id = ( SELECT auth.uid() AS uid))) |
| factures_artisans | factures_artisans_scope | ALL | authenticated | ((( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text])) AND (EXISTS ( SELECT 1 FROM dossiers d WHERE (d.id = factures_artisans.dossier_id)))) | ((( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text])) AND (EXISTS ( SELECT 1 FROM dossiers d WHERE (d.id = factures_artisans.dossier_id)))) |
| fiches_techniques | fiches_techniques_scope | ALL | authenticated | (EXISTS ( SELECT 1 FROM artisans a WHERE (a.id = fiches_techniques.artisan_id))) | (EXISTS ( SELECT 1 FROM artisans a WHERE (a.id = fiches_techniques.artisan_id))) |
| interventions_artisans | interventions_artisans_scope | ALL | authenticated | (((( SELECT get_my_role() AS get_my_role) = 'agente'::text) AND (agence_id = ( SELECT get_my_agence_id() AS get_my_agence_id))) OR ((( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id)))) | (((( SELECT get_my_role() AS get_my_role) = 'agente'::text) AND (agence_id = ( SELECT get_my_agence_id() AS get_my_agence_id))) OR ((( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id)))) |
| messages | messages_client_insert | INSERT | authenticated | — | ((auteur_id = ( SELECT auth.uid() AS uid)) AND (auteur_role = 'client'::text) AND (dossier_id IN ( SELECT mes_dossiers_client() AS mes_dossiers_client))) |
| messages | messages_client_read | SELECT | authenticated | (dossier_id IN ( SELECT mes_dossiers_client() AS mes_dossiers_client)) | — |
| messages | messages_client_update | UPDATE | authenticated | ((dossier_id IN ( SELECT mes_dossiers_client() AS mes_dossiers_client)) AND ((auteur_role <> 'client'::text) OR (auteur_id = ( SELECT auth.uid() AS uid)))) | ((dossier_id IN ( SELECT mes_dossiers_client() AS mes_dossiers_client)) AND ((auteur_role <> 'client'::text) OR (auteur_id = ( SELECT auth.uid() AS uid)))) |
| messages | messages_staff_scope | ALL | authenticated | ((( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text])) AND (EXISTS ( SELECT 1 FROM dossiers d WHERE (d.id = messages.dossier_id)))) | ((( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text])) AND (EXISTS ( SELECT 1 FROM dossiers d WHERE (d.id = messages.dossier_id)))) |
| notifications | Authenticated insert own notifications | INSERT | authenticated | — | (( SELECT auth.uid() AS uid) = user_id) |
| notifications | Users mark own notifications read | UPDATE | public | (( SELECT auth.uid() AS uid) = user_id) | — |
| notifications | Users see own notifications | SELECT | public | (( SELECT auth.uid() AS uid) = user_id) | — |
| objectifs_ca | objectifs_ca_insert_agente | INSERT | authenticated | — | ((cible = 'agente'::text) AND (agente_id = ( SELECT auth.uid() AS uid)) AND (agence_id = ( SELECT get_my_agence_id() AS get_my_agence_id))) |
| objectifs_ca | objectifs_ca_select | SELECT | authenticated | (((( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id))) OR ((cible = 'agente'::text) AND (agente_id = ( SELECT auth.uid() AS uid))) OR ((cible = 'agence'::text) AND (agence_id = ( SELECT get_my_agence_id() AS get_my_agence_id)))) | — |
| objectifs_ca | objectifs_ca_update_agente | UPDATE | authenticated | ((cible = 'agente'::text) AND (agente_id = ( SELECT auth.uid() AS uid))) | ((cible = 'agente'::text) AND (agente_id = ( SELECT auth.uid() AS uid)) AND (agence_id = ( SELECT get_my_agence_id() AS get_my_agence_id))) |
| objectifs_ca | objectifs_ca_write_admin | ALL | authenticated | ((( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id))) | ((( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id))) |
| photos | photos_client_read | SELECT | authenticated | (dossier_id IN ( SELECT mes_dossiers_client() AS mes_dossiers_client)) | — |
| photos | photos_scope | ALL | authenticated | ((( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text])) AND (EXISTS ( SELECT 1 FROM dossiers d WHERE (d.id = photos.dossier_id)))) | ((( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text])) AND (EXISTS ( SELECT 1 FROM dossiers d WHERE (d.id = photos.dossier_id)))) |
| profiles | profiles_insert_own | INSERT | authenticated | — | (id = ( SELECT auth.uid() AS uid)) |
| profiles | profiles_select_scope | SELECT | authenticated | ((id = ( SELECT auth.uid() AS uid)) OR ((( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id)))) | — |
| profiles | profiles_update_scope | UPDATE | authenticated | ((id = ( SELECT auth.uid() AS uid)) OR ((( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id)))) | ((id = ( SELECT auth.uid() AS uid)) OR ((( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id)))) |
| redevances | redevances_delete_admin | DELETE | authenticated | ((( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id))) | — |
| redevances | redevances_insert_admin | INSERT | authenticated | — | ((( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id))) |
| redevances | redevances_select | SELECT | authenticated | (((( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id))) OR (agente_id = ( SELECT auth.uid() AS uid))) | — |
| redevances | redevances_update | UPDATE | authenticated | (((( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id))) OR (agente_id = ( SELECT auth.uid() AS uid))) | (((( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id))) OR (agente_id = ( SELECT auth.uid() AS uid))) |
| rendez_vous | rendez_vous_scope | ALL | authenticated | (((( SELECT get_my_role() AS get_my_role) = 'agente'::text) AND (agence_id = ( SELECT get_my_agence_id() AS get_my_agence_id))) OR ((( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id)))) | (((( SELECT get_my_role() AS get_my_role) = 'agente'::text) AND (agence_id = ( SELECT get_my_agence_id() AS get_my_agence_id))) OR ((( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id)))) |
| societes | societes_select_la_mienne | SELECT | authenticated | (id = ( SELECT get_my_societe_id() AS get_my_societe_id)) | — |
| specialites | specialites_read | SELECT | authenticated | (( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text])) | — |
| suivi_financier | suivi_financier_scope | ALL | authenticated | ((( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text])) AND (EXISTS ( SELECT 1 FROM dossiers d WHERE (d.id = suivi_financier.dossier_id)))) | ((( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text])) AND (EXISTS ( SELECT 1 FROM dossiers d WHERE (d.id = suivi_financier.dossier_id)))) |

---

## 8. GRANTS

### 8.1 Grants de TABLE (rôles anon / authenticated / service_role)

> Rappel : sur Supabase, `anon` et `authenticated` reçoivent par défaut tous les privilèges DML
> sur les tables `public` ; c'est la **RLS** (section 7) qui filtre l'accès réel. Les écarts au
> défaut sont notables : `admin_invitations` = **service_role uniquement** (ni anon ni authenticated) ;
> les 4 vues `client_*` = **SELECT à authenticated** seulement.

| table/vue | rôle | privilèges |
|---|---|---|
| _backup_rdv_autres_titre_20260526 | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| _backup_rdv_autres_titre_20260526 | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| _backup_rdv_autres_titre_20260526 | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| admin_invitations | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| agences | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| agences | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| agences | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| artisans | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| artisans | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| artisans | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| artisans_specialites | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| artisans_specialites | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| artisans_specialites | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| backup_rattrapage_amo_legacy_20260615 | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| backup_rattrapage_amo_legacy_20260615 | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| backup_rattrapage_amo_legacy_20260615 | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| chantier_documents | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| chantier_documents | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| chantier_documents | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| chantier_fiches_techniques | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| chantier_fiches_techniques | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| chantier_fiches_techniques | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| cibles_calendrier | authenticated | DELETE, INSERT, SELECT, UPDATE |
| cibles_calendrier | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| client_comptes_rendus | authenticated | SELECT |
| client_comptes_rendus | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| client_devis_acceptes | authenticated | SELECT |
| client_devis_acceptes | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| client_interventions | authenticated | SELECT |
| client_interventions | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| client_rendez_vous | authenticated | SELECT |
| client_rendez_vous | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| clients | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| clients | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| clients | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| comparateur_lignes | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| comparateur_lignes | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| comparateur_lignes | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| comparateur_simulations | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| comparateur_simulations | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| comparateur_simulations | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| comptes_oauth | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| comptes_oauth | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| comptes_oauth | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| comptes_rendus | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| comptes_rendus | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| comptes_rendus | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| devis_artisans | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| devis_artisans | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| devis_artisans | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| dossiers | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| dossiers | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| dossiers | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| factures_agente | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| factures_agente | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| factures_agente | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| factures_artisans | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| factures_artisans | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| factures_artisans | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| fiches_techniques | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| fiches_techniques | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| fiches_techniques | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| interventions_artisans | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| interventions_artisans | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| interventions_artisans | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| messages | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| messages | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| messages | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| notifications | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| notifications | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| notifications | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| objectifs_ca | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| objectifs_ca | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| objectifs_ca | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| photos | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| photos | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| photos | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| profiles | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| profiles | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| profiles | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| redevances | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| redevances | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| redevances | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| rendez_vous | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| rendez_vous | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| rendez_vous | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| societes | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| societes | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| societes | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| specialites | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| specialites | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| specialites | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| suivi_financier | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| suivi_financier | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| suivi_financier | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |

### 8.2 EXECUTE sur fonctions (grantees)

⚠️ Fonctions avec **EXECUTE à PUBLIC/anon** (signalées) : `agenda_derive_tenant`, `cible_derive_societe`,
`messages_lock_columns`, `profile_client_derive_agence`, `suivi_courtage_ts_upsert`. (Les fonctions
trigger sont appelées par le moteur, pas directement ; `suivi_courtage_ts_upsert` est INVOKER.)

| fonction | grantees EXECUTE |
|---|---|
| agences_generer_code() | authenticated, service_role |
| agenda_derive_tenant() | PUBLIC, anon, authenticated, service_role |
| cible_derive_societe() | PUBLIC, anon, authenticated, service_role |
| convertir_dossier_en_amo(p_dossier_id uuid, p_taux_amo numeric) | authenticated, service_role |
| convertir_dossier_en_courtage(p_dossier_id uuid) | authenticated, service_role |
| derive_societe_id_from_agence() | authenticated, service_role |
| desactiver_acces_expires() | service_role |
| generer_reference_dossier() | authenticated, service_role |
| get_my_agence_id() | authenticated, service_role |
| get_my_role() | authenticated, service_role |
| get_my_societe_id() | authenticated, service_role |
| mes_dossiers_client() | authenticated, service_role |
| messages_lock_columns() | PUBLIC, anon, authenticated, service_role |
| mon_expiration_client() | authenticated, service_role |
| onboarding_create_societe(...12 args...) | service_role |
| profile_client_derive_agence() | PUBLIC, anon, authenticated, service_role |
| profiles_protege_identite() | authenticated, service_role |
| propagate_client_archive() | authenticated, service_role |
| redevances_montant_protege() | authenticated, service_role |
| rls_auto_enable() | authenticated, service_role |
| set_dossier_referente_from_client() | authenticated, service_role |
| suivi_courtage_ts_upsert(p_dossier_id uuid, p_montant numeric) | PUBLIC, anon, authenticated, service_role |
| suivi_toggle_honoraires(p_dossier_id uuid, p_types text[], p_montant numeric, p_regle boolean, p_today date) | authenticated, service_role |

---

## 10. STORAGE

**Buckets :**

| id | name | public |
|---|---|---|
| documents | documents | **non (privé)** |
| photos | photos | **non (privé)** |

**Policies `storage.objects` (verbatim, whitespace normalisé) :**

| policy | cmd | rôles | USING | WITH CHECK |
|---|---|---|---|---|
| Lecture documents | SELECT | public | ((bucket_id = 'documents'::text) AND (( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text])) AND ((((storage.foldername(name))[1] = 'chantiers'::text) AND (EXISTS ( SELECT 1 FROM dossiers d WHERE (((d.id)::text = split_part(objects.name, '/'::text, 2)) AND (((( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (d.societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id))) OR ((d.referente_id = ( SELECT auth.uid() AS uid)) AND (d.agence_id = ( SELECT get_my_agence_id() AS get_my_agence_id)))))))) OR (((storage.foldername(name))[1] = 'artisans'::text) AND (EXISTS ( SELECT 1 FROM artisans a WHERE (((a.id)::text = split_part(objects.name, '/'::text, 2)) AND (a.societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id)))))) OR (((storage.foldername(name))[1] = ANY (ARRAY['factures_agente'::text, 'kbis'::text, 'rib'::text])) AND (EXISTS ( SELECT 1 FROM profiles p WHERE (((p.id)::text = split_part(split_part(objects.name, '/'::text, 2), '.'::text, 1)) AND ((p.id = ( SELECT auth.uid() AS uid)) OR ((( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (p.societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id)))))))))) | — |
| Lecture photos | SELECT | public | ((bucket_id = 'photos'::text) AND (( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'agente'::text])) AND (((storage.foldername(name))[1] = 'chantiers'::text) AND (EXISTS ( SELECT 1 FROM dossiers d WHERE (((d.id)::text = split_part(objects.name, '/'::text, 2)) AND (((( SELECT get_my_role() AS get_my_role) = 'admin'::text) AND (d.societe_id = ( SELECT get_my_societe_id() AS get_my_societe_id))) OR ((d.referente_id = ( SELECT auth.uid() AS uid)) AND (d.agence_id = ( SELECT get_my_agence_id() AS get_my_agence_id))))))))) | — |
| Remplacement factures agente | UPDATE | public | (documents ; foldername[1] IN factures_agente/rib → profil propriétaire ou admin même société ; OU kbis → admin même société) | (idem USING) |
| Suppression documents | DELETE | public | (documents ; chantiers→dossier scope OU artisans→même société OU factures_agente/kbis/rib→profil ou admin même société) | — |
| Suppression photos | DELETE | public | (photos ; chantiers→dossier scope [admin même société OU référente+agence]) | — |
| Upload documents | INSERT | public | — | (documents ; chantiers→dossier scope OU artisans→même société OU factures_agente/rib→profil ou admin OU kbis→admin même société) |
| Upload photos | INSERT | public | — | (photos ; chantiers→dossier scope [admin même société OU référente+agence]) |
| client_read_photos | SELECT | public | ((bucket_id = 'photos'::text) AND (EXISTS ( SELECT 1 FROM (profiles me JOIN dossiers d ON ((d.client_id = me.client_id))) WHERE ((me.id = auth.uid()) AND (me.role = 'client'::text) AND (me.client_id IS NOT NULL) AND ((d.id)::text = split_part(objects.name, '/'::text, 2)))))) | — |

> Note : les policies « Remplacement/Suppression/Upload documents » et « Suppression/Upload photos »
> ont été résumées ci-dessus faute de place ; leurs expressions complètes verbatim sont identiques
> en structure aux policies « Lecture » correspondantes (mêmes branches foldername + mêmes scopes
> dossier/artisan/profil). Les policies « Lecture documents », « Lecture photos » et
> « client_read_photos » sont reproduites intégralement.

---

## MÉTA — ce que cette méthode ne voit PAS

1. **Les DONNÉES / valeurs** : aucun contenu de ligne n'est inventorié (uniquement la structure).
   Une valeur par défaut applicative, un enregistrement particulier, un état métier ne sont pas ici.
2. **L'état de la base n'est pas figé par le hash git** : la BASE est lue en direct. Un objet créé
   ou supprimé après cette collecte ne serait pas reflété ; l'inventaire vaut pour l'instant de lecture.
3. **Comportement applicatif** : ce que le code front/route FAIT avec ces objets (quelles colonnes il
   lit/écrit, quelle logique) n'est pas visible depuis le schéma — voir inventaires 03/04/05.
4. **Corps des fonctions non reproduit** : seule la signature (args, retour, sécurité, search_path,
   volatilité) est listée ; la logique interne des 23 fonctions n'est pas dans ce fichier.
5. **Objets d'autres schémas** : `auth.*`, `vault.*`, `realtime.*`, `extensions.*`, les triggers
   internes, les Edge Functions, les webhooks/DB triggers Supabase, les réglages Realtime/replication
   ne sont pas couverts (périmètre = `public` + `storage.objects` + buckets).
6. **Historique** : un objet créé puis supprimé, ou une policy modifiée puis remise, ne laisse aucune
   trace dans l'état instantané. Les tables `_backup_*` / `backup_*` sont les seuls indices de
   manipulations passées.
7. **Grants par colonne** : seuls les grants au niveau TABLE sont listés ; d'éventuels grants
   colonne-par-colonne (rares ici) ne sont pas détaillés.

*Fin de l'inventaire 02. Collecte brute pg_catalog / information_schema, sans confrontation documentaire.*
