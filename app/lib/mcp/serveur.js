// app/lib/mcp/serveur.js
// Déclaration du serveur MCP « BATILIS » : 9 outils, tous en LECTURE SEULE.
// SDK officiel @modelcontextprotocol/sdk 1.x (McpServer.registerTool + schémas zod).
// https://github.com/modelcontextprotocol/typescript-sdk

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { STATUT_CONFIG } from '../dossiers'
import {
  ErreurOutil, mesDossiers, lireDossier, devisDuDossier, financesDuDossier, rendezVous,
  comptesRendus, interventions, actionsOuvertes, attestationsArtisans,
} from './outils'

const LECTURE_SEULE = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
const TYPOLOGIES = ['courtage', 'amo', 'estimo', 'merad', 'audit_energetique', 'studio_jardin']
const DATE = /^\d{4}-\d{2}-\d{2}$/

const reference = z.string().trim().min(1).max(40).describe('Référence du dossier, ex. « 2026-AM-043 ».')
const agence = z.string().trim().min(1).max(20).optional()
  .describe('Code agence. À fournir seulement si l\'outil signale que la référence est portée par plusieurs dossiers.')

function enJson(fn) {
  return async (args) => {
    try {
      return { content: [{ type: 'text', text: JSON.stringify(await fn(args)) }] }
    } catch (e) {
      if (e instanceof ErreurOutil) return { isError: true, content: [{ type: 'text', text: e.message }] }
      console.error('[mcp] outil', e)
      return { isError: true, content: [{ type: 'text', text: 'Erreur interne du connecteur BATILIS.' }] }
    }
  }
}

/** Un serveur par requête (transport sans état). `supabase` = client au jeton de l'utilisatrice. */
export function creerServeurMcp({ supabase }) {
  const serveur = new McpServer({ name: 'batilis', version: '1.0.0' })
  const outil = (nom, description, inputSchema, fn) =>
    serveur.registerTool(nom, { description, inputSchema, annotations: LECTURE_SEULE }, enJson(fn))

  outil('mes_dossiers',
    'Liste les dossiers BATILIS de la personne connectée (et uniquement les siens) : référence, agence, client, '
    + 'typologie, statut calculé, adresse du chantier, dates clés. Les dossiers archivés sont exclus par défaut.',
    {
      statut: z.enum(Object.keys(STATUT_CONFIG)).optional().describe('Filtre sur le statut calculé.'),
      typologie: z.enum(TYPOLOGIES).optional(),
      inclure_archives: z.boolean().default(false),
      recherche: z.string().trim().max(100).optional().describe('Texte cherché dans la référence, le client ou l\'adresse.'),
    },
    args => mesDossiers(supabase, args))

  outil('lire_dossier',
    'Fiche complète d\'un dossier : statut, client, référente, contrat, frais de consultation, taux, dates. '
    + 'L\'email et le téléphone du client ne sont donnés que si avec_coordonnees = true.',
    { reference, agence, avec_coordonnees: z.boolean().default(false) },
    args => lireDossier(supabase, args))

  outil('devis_du_dossier',
    'Devis artisans d\'un dossier : entreprise, numéro, statut, montants HT et TTC (euros), acompte, dates, '
    + 'indicateur hors_honoraires.',
    { reference, agence },
    args => devisDuDossier(supabase, args))

  outil('finances_du_dossier',
    'Finances d\'un dossier : échéances du suivi financier et synthèse des honoraires (HT et TTC, euros) calculée '
    + 'par le moteur financier de BATILIS, identique à l\'écran.',
    { reference, agence },
    args => financesDuDossier(supabase, args))

  outil('rendez_vous',
    'Rendez-vous visibles par la personne connectée entre deux dates (heure de Paris), avec adresse et artisans '
    + 'conviés. Par défaut : aujourd\'hui + 30 jours. 92 jours maximum. Filtre optionnel par dossier.',
    {
      reference: reference.optional(),
      agence,
      du: z.string().regex(DATE).optional().describe('AAAA-MM-JJ, inclus.'),
      au: z.string().regex(DATE).optional().describe('AAAA-MM-JJ, inclus.'),
    },
    args => rendezVous(supabase, args))

  outil('comptes_rendus',
    'Derniers rapports de visite VALIDÉS d\'un dossier (texte final), du plus récent au plus ancien.',
    { reference, agence, nombre: z.number().int().min(1).max(5).default(1) },
    args => comptesRendus(supabase, args))

  outil('interventions',
    'Planning d\'un dossier : interventions planifiées des artisans et lots (dates, avancement).',
    { reference, agence },
    args => interventions(supabase, args))

  outil('actions_ouvertes',
    'Actions de suivi encore ouvertes issues des visites de chantier (non clôturées, non actées, non archivées). '
    + 'Sans référence : toutes celles des dossiers visibles.',
    { reference: reference.optional(), agence },
    args => actionsOuvertes(supabase, args))

  outil('attestations_artisans',
    'Décennale et qualification des artisans d\'un dossier, avec date d\'expiration et alerte '
    + '(expirée, expire sous 30 jours, absente).',
    { reference, agence },
    args => attestationsArtisans(supabase, args))

  return serveur
}
