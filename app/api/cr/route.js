// app/api/cr/route.js
// Génération de CR de visite par IA (Claude API)

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '../../lib/api-auth'
import { formatNomClient } from '../../lib/clients'

let _supabaseAdmin
function getSupabaseAdmin() {
  if (!_supabaseAdmin) _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _supabaseAdmin
}

const TYPES_VISITE = {
  r1: 'R1 – Première visite / visite technique',
  r2: 'R2 – Visite avec artisans',
  r3: 'R3 – Présentation des devis',
  suivi: 'Visite de suivi de chantier',
  reception: 'Visite de réception de chantier',
}

const SECTIONS_PAR_TYPE = {
  r1: ['Identification du projet', 'État des lieux', 'Périmètre des travaux par pièce / zone', "Points d'attention et contraintes techniques", 'Artisans à solliciter', 'Prochaines étapes',],
  r2: ['Identification du chantier', 'Travaux à réaliser par artisan', 'Constat et points techniques', "Plan d'action et séquençage", 'Travaux manquants', 'Prochaines étapes',],
  r3: ['Identification du chantier','Récapitulatif des devis présentés','Points de discussion', 'Décisions prises','Prochaines étapes',],
  suivi: ['Identification du chantier', 'Travaux réalisés depuis la dernière visite','Situation des lots', 'Décisions et actions à suivre','Planning prévisionnel',],
  reception: ['Identification du chantier','Travaux réceptionnés', 'Réserves constatées', 'Délais de levée des réserves', 'Signature de réception', ],
}

const REGLES_SPECIFIQUES = {
  r1: `CONTEXTE R1 :Cette première visite réunit uniquement le courtier illiCO travaux et le client. Aucun artisan n'est présent ni retenu à ce stade. Aucun devis n'existe. Aucun planning de travaux ne doit être créé.

Le compte-rendu doit se concentrer sur :
- l'état des lieux ;
- les besoins exprimés par le client ;
- le périmètre des travaux ;
- les contraintes techniques observées ;
- les informations nécessaires à la préparation de la visite R2.

FORMATS :
- "Identification du projet" : chaque ligne au format **Label :** Valeur.
- Les autres sections sont rédigées sous forme de listes à puces. `,

  r2: `CONTEXTE R2 : Cette visite réunit le courtier illiCO travaux, le client et les artisans sélectionnés. Il s'agit de la visite technique préalable à l'établissement des devis.

RÈGLES :
- Décrire les travaux prévus pour chaque artisan présent.
- Identifier les contraintes techniques observées.
- Identifier les éventuels travaux complémentaires à chiffrer.
- Ne pas présenter de montants ou de devis.

FORMATS :
- "Identification du chantier" : chaque ligne au format **Label :** Valeur.
- Les autres sections sont rédigées sous forme de listes à puces. `,

  r3: `CONTEXTE R3 :Cette visite réunit uniquement le courtier illiCO travaux et le client. Elle se déroule à l'agence. Elle a pour objectif la présentation des devis et l'accompagnement à la décision.

RÈGLES :
- Résumer les devis présentés.
- Mentionner les arbitrages du client.
- Identifier les lots validés, refusés ou à compléter.
- Ne pas décrire le suivi de chantier.

FORMATS :
- "Identification du chantier" : chaque ligne au format **Label :** Valeur.
- Les autres sections sont rédigées sous forme de listes à puces. `,

  suivi: `CONTEXTE VISITE DE SUIVI : Cette visite a pour objectif de constater l'avancement du chantier et d'identifier les actions à venir.

RÈGLES :
- "Travaux réalisés depuis la dernière visite" contient uniquement les travaux réalisés.
- "Situation des lots" décrit l'état actuel de chaque entreprise ou lot.
- "Décisions et actions à suivre" regroupe les validations, décisions et actions restantes.
- Le planning prévisionnel ne contient que les interventions futures.
- Ne jamais afficher de dates passées ou d'interventions terminées.

FORMATS :
- "Identification du chantier" : chaque ligne au format **Label :** Valeur.
- "Travaux réalisés depuis la dernière visite" : liste à puces uniquement.
- "Situation des lots" :
  pour chaque entreprise :

  **Nom de l'entreprise :**

  - Réalisé : ...
  - En cours : ...
  - Points à suivre : ...

  Ne pas créer de rubrique vide.

- "Décisions et actions à suivre" :  liste à puces uniquement.

- "Planning prévisionnel" :  générer uniquement si des dates futures sont mentionnées.
  Utiliser un tableau markdown :

  | Date | Intervention prévue | Responsable | Commentaires |
  |------|---------------------|-------------|--------------|
`,

  reception: `CONTEXTE RÉCEPTION : Cette visite a pour objectif la réception des travaux.

RÈGLES :
- Décrire uniquement les travaux réceptionnés.
- Lister les réserves de manière factuelle.
- Associer chaque réserve à un délai de levée lorsqu'il est connu.
- Ne pas refaire l'historique du chantier.

FORMATS :
- "Identification du chantier" : chaque ligne au format **Label :** Valeur.
- Les autres sections sont rédigées sous forme de listes à puces.`,
}

function buildSystemPrompt(type, agenceNom) {
  const typLabel = TYPES_VISITE[type] || 'Visite de chantier'
  const sections = (SECTIONS_PAR_TYPE[type] || SECTIONS_PAR_TYPE.suivi)
    .map((s, i) => `${i + 1}. ${s}`)
    .join('\n')

  return `Tu es un expert en gestion de chantiers BTP. Tu rédiges des comptes-rendus de visite professionnels pour ${agenceNom}, agence de courtage en travaux et AMO.

TYPE DE VISITE : ${typLabel}

CONSIGNES GÉNÉRALES :

- Ton professionnel, simple et factuel.
- Toujours utiliser le terme client ou clients.
- Corriger l'orthographe, la grammaire et la conjugaison.
- Reprendre exactement les noms propres, entreprises, produits, références et matériaux fournis.
- Ne jamais modifier un nom propre ou une référence technique.
- Restituer uniquement les informations réellement constatées ou indiquées.
- Ne pas inventer d'informations manquantes.
- Si une information n'est pas connue, ne pas la déduire.
- Éviter toute répétition entre les sections.
- Une information ne doit apparaître qu'une seule fois dans le compte-rendu.
- Mettre en avant les décisions et validations lorsqu'elles existent.
- Signaler les points de vigilance uniquement lorsqu'ils ont un impact réel sur le chantier.
- Éviter les formulations alarmistes, excessivement administratives ou juridiques.
- Ne jamais utiliser d'emojis ou de pictogrammes.

${reglesSpecifiques}

SECTIONS ATTENDUES (respecter exactement l'ordre et les intitulés) :

${sections}

RÉPONSE : JSON strict uniquement, aucun texte avant ou après :
{
  "titre": "COMPTE RENDU [TYPE EN MAJUSCULES] — [résumé 5 mots max]",
  "sections": [
    {
      "numero": 1,
      "titre": "Titre de section",
      "contenu": "Texte rédigé.
    }
  ]
}`
}

function buildUserPrompt({ dossier, devis, typeVisite, dateVisite, intervenants, notesBrutes }) {
  const client = dossier.client
  const nomClient = client ? formatNomClient(client, { civilite: true, withRepresentant: true }) : 'Client inconnu'

  const artisansChantier = (devis || [])
    .filter(d => d.statut === 'accepte').map(d => d.artisan?.entreprise).filter(Boolean)

  const intervenantsStr = intervenants?.length ? intervenants : artisansChantier.length ? artisansChantier : ['Non précisé']

  return `CONTEXTE DU DOSSIER :
    - Référence : ${dossier.reference}
    - Maître d'ouvrage : ${nomClient}
    - Adresse : ${client?.adresse || 'Non renseignée'}
    - Type de prestation : ${dossier.typologie?.toUpperCase() || ''}
    - Référente illiCO : ${dossier.referente ? `${dossier.referente.prenom} ${dossier.referente.nom}` : ''}
    - Artisans du chantier : ${artisansChantier.join(', ') || 'Aucun devis accepté'}

    VISITE :
    - Date : ${dateVisite ? new Date(dateVisite).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Non précisée'}
    - Intervenants présents lors de la visite : ${intervenantsStr.join(', ')}

    NOTES BRUTES (à partir desquelles générer le CR) :
    ${notesBrutes}

    Génère le compte-rendu complet en JSON.`
}

export async function POST(request) {
  const auth = await requireRole(request, ['admin', 'agente'])
  if (auth.error) return auth.error
  try {
    const { dossierId, typeVisite, dateVisite, intervenants, notesBrutes, docsPaths, photosPaths } = await request.json()

    // Au moins une source de contenu : notes OU photos Storage OU documents. Cas réel :
    // photographier ses notes manuscrites et laisser Claude les lire, sans rien saisir
    // (via photosPaths — photos du chantier ou uploadées côté client).
    const aDuContenu = notesBrutes?.trim() || photosPaths?.length || docsPaths?.length
    if (!dossierId || !typeVisite || !aDuContenu) {
      return NextResponse.json({ error: 'Paramètres manquants (type de visite + notes, images ou documents requis)' }, { status: 400 })
    }

    // Charger dossier + devis
    const { data: dossier } = await getSupabaseAdmin()
      .from('dossiers')
      .select('*, referente:profiles!dossiers_referente_id_fkey(id, prenom, nom), client:clients(*), agence:agences(nom)')
      .eq('id', dossierId).single()

    // Contrôle d'appartenance — service_role contourne la RLS, on la reflète ici :
    // admin = même société, agente = même agence. 404 uniforme (introuvable ou
    // étranger : même réponse, ne jamais confirmer l'existence d'un dossier d'un autre tenant).
    const dossierAutorise = dossier && (
      auth.profile.role === 'admin'
        ? dossier.societe_id === auth.profile.societe_id
        : dossier.agence_id === auth.profile.agence_id
    )
    if (!dossierAutorise) {
      return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 })
    }

    // docsPaths du body : jamais de confiance (téléchargés en service_role).
    // Deux contrôles indépendants : (a) match EXACT contre chantier_documents de CE
    // dossier ; (b) préfixe Storage du dossier (convention : chantiers/{dossier_id}/…).
    // Un seul path invalide → 400, requête entière rejetée (fail loud).
    if (docsPaths?.length) {
      const { data: docsDossier } = await getSupabaseAdmin()
        .from('chantier_documents')
        .select('path')
        .eq('dossier_id', dossierId)
      const pathsAutorises = new Set((docsDossier || []).map(d => d.path))
      const prefixe = `chantiers/${dossierId}/`
      const pathInvalide = docsPaths.some(doc => !pathsAutorises.has(doc.path) || !doc.path.startsWith(prefixe))
      if (pathInvalide) {
        return NextResponse.json({ error: 'Document non rattaché au dossier' }, { status: 400 })
      }
    }

    // photosPaths du body : jamais de confiance (téléchargés en service_role).
    // Un path est valide SI ET SEULEMENT SI il commence par le préfixe tenant
    // chantiers/{dossierId}/ (defense in depth, non négociable comme docsPaths) ET
    // (a) il existe en table `photos` pour CE dossier (photos de l'appli), OU
    // (b) il suit la convention dédiée chantiers/{dossierId}/cr/ (photos ordi, hors table).
    // Un seul path invalide → 400 (fail loud). Le contrôle tenant amont reste le garde-fou.
    if (photosPaths?.length) {
      const { data: photosDossier } = await getSupabaseAdmin()
        .from('photos')
        .select('url')
        .eq('dossier_id', dossierId)
      const pathsAutorises = new Set((photosDossier || []).map(p => p.url))
      const prefixe = `chantiers/${dossierId}/`
      const prefixeCr = `chantiers/${dossierId}/cr/`
      const pathInvalide = photosPaths.some(path =>
        !path.startsWith(prefixe) || (!pathsAutorises.has(path) && !path.startsWith(prefixeCr))
      )
      if (pathInvalide) {
        return NextResponse.json({ error: 'Photo non rattachée au dossier' }, { status: 400 })
      }
    }

    const { data: devis } = await getSupabaseAdmin()
      .from('devis_artisans')
      .select('*, artisan:artisans(id, entreprise)')
      .eq('dossier_id', dossierId)

    // Construire les messages Claude
    const agenceNom = dossier.agence?.nom || 'illiCO travaux'
    const systemPrompt = buildSystemPrompt(typeVisite, agenceNom)
    const userText = buildUserPrompt({ dossier, devis: devis || [], typeVisite, dateVisite, intervenants, notesBrutes: notesBrutes || '' })

    const userContent = []

    // Documents du chantier sélectionnés
    for (const doc of (docsPaths || [])) {
      try {
        const { data: fileData } = await getSupabaseAdmin().storage.from('documents').download(doc.path)
        if (!fileData) continue
        const buf = Buffer.from(await fileData.arrayBuffer())
        const b64 = buf.toString('base64')
        if (doc.type_mime?.includes('pdf')) {
          userContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } })
        } else if (doc.type_mime?.startsWith('image')) {
          const mime = doc.type_mime.includes('png') ? 'image/png' : 'image/jpeg'
          userContent.push({ type: 'image', source: { type: 'base64', media_type: mime, data: b64 } })
        }
      } catch {}
    }

    // Photos du chantier sélectionnées (paths Storage, bucket `photos`).
    // media_type déduit de l'extension.
    for (const path of (photosPaths || [])) {
      try {
        const { data: fileData } = await getSupabaseAdmin().storage.from('photos').download(path)
        if (!fileData) continue
        const buf = Buffer.from(await fileData.arrayBuffer())
        const b64 = buf.toString('base64')
        const mime = /\.png$/i.test(path) ? 'image/png' : 'image/jpeg'
        userContent.push({ type: 'image', source: { type: 'base64', media_type: mime, data: b64 } })
      } catch {}
    }

    // Texte
    const hasMedia = (docsPaths || []).length > 0 || (photosPaths || []).length > 0
    userContent.push({
      type: 'text',
      text: hasMedia
        ? userText + '\n\nNote : les documents et images ci-dessus sont des pièces du chantier — extraire et intégrer leur contenu dans le CR si pertinent.'
        : userText,
    })

    // Appel Claude API
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    })

    if (!claudeRes.ok) {
      const err = await claudeRes.json()
      return NextResponse.json({ error: err.error?.message || 'Erreur Claude API' }, { status: 500 })
    }

    const claudeData = await claudeRes.json()
    const rawText = claudeData.content?.[0]?.text || ''

    let crJSON
    try {
      const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      crJSON = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({ error: 'Réponse IA invalide', raw: rawText }, { status: 500 })
    }

    return NextResponse.json({ cr: crJSON })
  } catch (err) {
    console.error('CR AI error DETAIL:', err.message, err.stack)
    return NextResponse.json({ error: err.message || 'Erreur serveur' }, { status: 500 })
  }
}