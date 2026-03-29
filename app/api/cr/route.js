// app/api/cr/route.js
// Génération de CR de visite par IA (Claude API)

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const TYPES_VISITE = {
  r1: 'R1 – Première visite / visite technique',
  r2: 'R2 – Visite avec artisans',
  r3: 'R3 – Présentation des devis',
  suivi: 'Visite de suivi de chantier',
  reception: 'Visite de réception de chantier',
}

const SECTIONS_PAR_TYPE = {
  r1:       ['Identification du projet', 'État des lieux', 'Périmètre des travaux par pièce / zone', "Points d'attention et contraintes techniques", 'Prochaines étapes'],
  r2:       ['Identification du chantier', 'Travaux réalisés', 'Constat et points techniques', "Plan d'action et séquençage", 'Prochaines étapes'],
  r3:       ['Identification du chantier', 'Récapitulatif des devis présentés', 'Points de discussion', 'Décisions prises', 'Prochaines étapes'],
  suivi:    ['Identification du chantier', 'Avancement des travaux par lot', 'Planning prévisionnel', 'Points de retard ou incidents', 'Actions requises'],
  reception:['Identification du chantier', 'Travaux réceptionnés', 'Réserves constatées', 'Délais de levée des réserves', 'Signature de réception'],
}

function buildSystemPrompt(type) {
  const typLabel = TYPES_VISITE[type] || 'Visite de chantier'
  const sections = (SECTIONS_PAR_TYPE[type] || SECTIONS_PAR_TYPE.suivi)
    .map((s, i) => `${i + 1}. ${s}`).join('\n')

  return `Tu es un expert en gestion de chantiers BTP. Tu rédiges des comptes-rendus de visite professionnels pour illiCO travaux Martigues, agence de courtage en travaux et AMO.

TYPE DE VISITE : ${typLabel}

CONSIGNES :
- Ton professionnel, précis, clair — style AMO (Assistance à Maîtrise d'Ouvrage)
- Français impeccable
- Sections numérotées, bullet points pour les listes, texte continu pour les constats
- Reprendre exactement les noms des artisans, pièces, produits mentionnés dans les notes
- Mettre en valeur les points critiques, retards, incidents, décisions importantes
- Si des images sont fournies (photos de cahier, captures), extraire et intégrer leur contenu
- Sections attendues :
${sections}

RÉPONSE : JSON strict uniquement, aucun texte avant ou après :
{
  "titre": "COMPTE RENDU [TYPE EN MAJUSCULES] — [résumé 5 mots max]",
  "sections": [
    {
      "numero": 1,
      "titre": "Titre de section",
      "contenu": "Texte rédigé. Listes avec tirets - . Tableaux markdown si pertinent.",
      "important": false
    }
  ]
}`
}

function buildUserPrompt({ dossier, devis, typeVisite, dateVisite, intervenants, notesBrutes, numeroCR }) {
  const client = dossier.client
  const nomClient = client
    ? [client.civilite, client.prenom, client.nom, client.prenom2 ? `& ${client.prenom2} ${client.nom2}` : null].filter(Boolean).join(' ')
    : 'Client inconnu'

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
- Numéro de CR : N°${numeroCR}

VISITE :
- Date : ${dateVisite ? new Date(dateVisite).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Non précisée'}
- Intervenants présents lors de la visite : ${intervenantsStr.join(', ')}

NOTES BRUTES (à partir desquelles générer le CR) :
${notesBrutes}

Génère le compte-rendu complet en JSON.`
}

export async function POST(request) {
  try {
    const { dossierId, userId, typeVisite, dateVisite, intervenants, notesBrutes, imagesBase64 } = await request.json()

    if (!dossierId || !userId || !typeVisite || (!notesBrutes?.trim() && !imagesBase64?.length)) {
      return NextResponse.json({ error: 'Paramètres manquants (type de visite + notes ou images requises)' }, { status: 400 })
    }

    // Charger dossier + devis
    const { data: dossier } = await supabaseAdmin
      .from('dossiers')
      .select('*, referente:profiles!dossiers_referente_id_fkey(id, prenom, nom), client:clients(*)')
      .eq('id', dossierId).single()

    const { data: devis } = await supabaseAdmin
      .from('devis_artisans')
      .select('*, artisan:artisans(id, entreprise)')
      .eq('dossier_id', dossierId)

    // Numéro du prochain CR
    const { count } = await supabaseAdmin
      .from('comptes_rendus')
      .select('*', { count: 'exact', head: true })
      .eq('dossier_id', dossierId)
    const numeroCR = (count || 0) + 1

    // Construire les messages Claude
    const systemPrompt = buildSystemPrompt(typeVisite)
    const userText = buildUserPrompt({ dossier, devis: devis || [], typeVisite, dateVisite, intervenants, notesBrutes: notesBrutes || '', numeroCR })

    const userContent = []

    // Images en premier si présentes
    if (imagesBase64?.length) {
      for (const img of imagesBase64) {
        const commaIdx = img.indexOf(',')
        const header = commaIdx > 0 ? img.slice(0, commaIdx) : ''
        const data = commaIdx > 0 ? img.slice(commaIdx + 1) : img
        const mediaType = header.includes('png') ? 'image/png' : 'image/jpeg'
        userContent.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data } })
      }
      userContent.push({
        type: 'text',
        text: userText + '\n\nNote : les images ci-dessus sont des photos ou captures de notes — extraire et intégrer leur contenu textuel dans le CR.',
      })
    } else {
      userContent.push({ type: 'text', text: userText })
    }

    // Appel Claude API
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
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

    return NextResponse.json({ cr: crJSON, numeroCR })
  } catch (err) {
    console.error('CR AI error:', err)
    return NextResponse.json({ error: err.message || 'Erreur serveur' }, { status: 500 })
  }
}