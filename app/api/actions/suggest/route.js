// app/api/actions/suggest/route.js
// Aide IA à la rédaction d'ACTIONS de compte-rendu (Lot 1c-3). Claude lit des NOTES brutes
// (texte collé, dictée…) et renvoie une LISTE d'actions candidates structurées. L'humaine
// COCHE et valide avant insertion — rien n'est écrit en base ici. L'IA n'est jamais un
// passage obligé (le système marche sans). Mêmes garde-fous que /api/fiches/extract.
//
// IN  : { notes: string, lots?: [{id, nom}] }
// OUT : { actions: [{ titre, texte, portee, lot_nom, statut, statut_date }] }
import { NextResponse } from 'next/server'
import { requireRole } from '../../../lib/api-auth'
import { reglesActions, TYPES_VISITE } from '../../../lib/crRegles'
export const maxDuration = 300   // aligné sur /api/cr : l'appel IA + les retries (90 s chacun)
                                 // pouvaient dépasser 60 s et provoquer un 504 côté Vercel.
// 90 s par tentative (au lieu de 45) : une analyse CR lourde (notes longues, mode « ancien
// rapport » exhaustif, ou API Claude chargée) dépassait les 45 s → l'AbortController avortait
// les 3 tentatives (« This operation was aborted ») → 503. 3 tentatives × 90 s + backoff ≈ 272 s,
// large marge sous maxDuration=300 (pas de 504 Vercel).
const CLAUDE_TIMEOUT_MS = 90_000
const CLAUDE_RETRIES = 2
const RETRIABLE_STATUS = new Set([408, 429, 500, 502, 503, 504, 529])
const MAX_NOTES = 12_000
// 16 statuts figés (mêmes clés que le CHECK de la table `actions`).
const STATUTS = ['en_cours', 'date_limite', 'urgent', 'refuse', 'en_retard', 'rappel',
  'en_attente', 'a_surveiller', 'programme', 'a_programmer', 'information',
  'quitus_transmis', 'garder_memoire', 'constate', 'acte', 'cloture']
const STATUT_SET = new Set(STATUTS)
const SYSTEM_PROMPT = `Tu es un assistant pour une courtière en travaux / AMO (illiCO travaux). On te donne des NOTES BRUTES prises pendant une visite de chantier (bullet points, phrases incomplètes, dictée…). Tu dois en extraire une LISTE d'ACTIONS / remarques de compte-rendu, structurées.
Réponds STRICTEMENT par un objet JSON (aucun texte autour, pas de markdown) :
{
  "updates": [   // MISES À JOUR d'actions DÉJÀ PRÉSENTES (voir liste fournie). Vide [] si aucune.
    {
      "ref": nombre,          // le numéro de réf. de l'action existante concernée (dans la liste fournie)
      "statut": une des valeurs EXACTES ci-dessous | "",   // nouveau statut si les notes le font évoluer, sinon ""
      "texte": chaîne | "",   // la NOTE D'AVANCEMENT à ajouter (datée) sur cette action : ce qui a évolué, factuel et clair (ex. « Cloison posée, reste les bandes à poncer »). Remplis-le dès qu'il y a du nouveau au-delà du simple statut ; "" uniquement si rien à noter.
      "note": chaîne          // en 1 phrase, ce qui change (pour que l'humaine comprenne). Ex : « passe en terminé »
    }
  ],
  "actions": [    // uniquement les points RÉELLEMENT NOUVEAUX (pas déjà dans la liste fournie)
    {
      "titre": chaîne,        // titre court de l'action (~60 caractères), optionnel ("" si rien)
      "texte": chaîne,        // la remarque rédigée clairement, 1 à 3 phrases
      "portee": "generale" | "lot",   // "lot" si l'action concerne un corps d'état / artisan précis, sinon "generale"
      "artisan": chaîne,      // l'ENTREPRISE/artisan EXACT indiqué entre parenthèses dans la note (ex. "ESPRIT CUISINE", "D2M", "MJ RENOVATION", "SUD RENOV ENERGIE") ; "" si aucun. C'EST LE CHAMP QUI COMPTE pour rattacher au bon lot — le serveur en déduit le lot.
      "lot_nom": chaîne,      // facultatif : le nom du lot s'il figure dans la liste fournie ; sinon "". Ne l'invente pas — en cas de doute, laisse "" et renseigne "artisan".
      "statut": une des valeurs EXACTES: ${STATUTS.join(', ')},
      "statut_date": "AAAA-MM-JJ" | ""   // date d'échéance/statut si une date est mentionnée dans les notes, sinon ""
    }
  ]
}
RÈGLES :
- Écris TOUJOURS en FRANÇAIS, même si les notes sont dans une autre langue.
- ORTHOGRAPHE, GRAMMAIRE, CONJUGAISON — PRIORITÉ ABSOLUE : chaque "titre" et "texte" doit être dans un français IMPECCABLE (orthographe, accords, conjugaison, ponctuation, majuscules). Corrige toutes les fautes des notes brutes / de la dictée. Le compte-rendu est envoyé au client : aucune faute n'est tolérée.
- N'invente rien : uniquement ce qui est dans les notes. Une note = potentiellement une action.
- ANALYSE D'ABORD, UNE PAR UNE, LES ACTIONS DÉJÀ PRÉSENTES avant de créer quoi que ce soit. Pour CHAQUE point des notes, demande-toi s'il fait AVANCER, précise, complète, débloque ou clôture une action déjà présente — MÊME si la formulation diffère des notes brutes. Si OUI → c'est une MISE À JOUR (dans "updates") avec sa "ref" : écris l'avancement dans "texte" et mets à jour le "statut" s'il évolue. Ne crée une entrée dans "actions" QUE pour un sujet VRAIMENT nouveau, absent de la liste.
- LE TITRE DE L'ACTION EXISTANTE DÉFINIT SON OUVRAGE ET SA PIÈCE. Ne rattache un point à une action existante QUE s'il concerne CE MÊME ouvrage ET CETTE MÊME pièce. Être du MÊME ARTISAN NE SUFFIT PAS : un artisan intervient souvent sur plusieurs ouvrages/pièces. EXEMPLE À NE PAS FAIRE : mettre un « lavabo salle de bain », un « placard chambre » ou un « meuble TV salon » dans une action intitulée « Pose cuisine » — ce sont des ouvrages/pièces DIFFÉRENTS, donc des actions DIFFÉRENTES (nouvelles actions, ou mises à jour d'autres actions existantes qui portent vraiment sur cette pièce).
- Sur une visite de SUIVI, beaucoup de points sont des avancements d'actions existantes : utilise les "updates" quand l'ouvrage/pièce correspond VRAIMENT. Mais ne force JAMAIS un point dans une action existante d'un autre ouvrage/pièce juste parce que c'est le même artisan : dans ce cas, crée une NOUVELLE action.
- L'ARTISAN / LOT FAIT FOI, et il est souvent écrit ENTRE PARENTHÈSES dans les notes (ex. « (ESPRIT CUISINE) », « (MJ RENOVATION) », « (D2M) », « (SUD RENOV ENERGIE) »). Ne rattache un point à une action existante QUE si c'est le MÊME artisan/lot ET le MÊME ouvrage/pièce. Si l'artisan entre parenthèses diffère de celui de l'action existante → ce n'est PAS la même action. Ne mélange JAMAIS deux artisans dans une même action ni dans une même note d'avancement (ex. un lavabo « (ESPRIT CUISINE) » ne va PAS dans une action de plomberie « (SUD RENOV ENERGIE) »).
- UN SEUL ENDROIT PAR POINT : chaque point des notes va SOIT dans une mise à jour, SOIT dans une nouvelle action — JAMAIS les deux, et jamais répété dans deux entrées. Un même avancement ne va JAMAIS dans deux mises à jour : s'il pourrait concerner plusieurs actions existantes, choisis LA PLUS SPÉCIFIQUE (ex. une action dédiée « LED » plutôt qu'une action large « finitions électriques ») et ne le mets qu'UNE fois. Aucun doublon.
- GRANULARITÉ par ouvrage/pièce : un ouvrage / une pièce / une tâche distincte = une seule action. Ne fusionne JAMAIS des pièces ou des ouvrages différents dans une même action ou une même note d'avancement, même pour le même artisan (ex. ne mets pas la cave avec la salle de bain, ni la cuisine avec une chambre ou une salle de bain). Si un même artisan a 5 points sur 5 pièces/ouvrages différents → 5 entrées distinctes, pas une seule. Tu ne regroupes plusieurs avancements dans une même mise à jour QUE s'ils relèvent exactement du MÊME ouvrage/pièce que l'action existante visée.
- CONSERVE TELS QUELS les marqueurs écrits dans les notes : garde « (TS) » (travaux supplémentaires — enjeu de facturation) dans le "texte" ; « [à titre informatif] » → statut "information" (ou "garder_memoire"). Ne supprime jamais ces marqueurs.
- Si aucune action existante ne correspond (ou aucune fournie), "updates" reste [].
- "statut" par défaut = "en_cours". Utilise "date_limite" ou "a_programmer" si une échéance est donnée ; "information" pour une simple info ; "cloture" seulement si la note dit explicitement que c'est réglé.
- Si une DATE est mentionnée (ex. "avant le 12/02", "semaine prochaine" → estime au mieux en AAAA-MM-JJ), mets-la dans "statut_date".
- "lot_nom" doit être COPIÉ EXACTEMENT depuis la LISTE DE LOTS fournie (le texte entre guillemets) — jamais inventé, jamais reformulé en corps d'état (n'écris PAS « Peinture », « Carrelage », « Meubles de cuisine » si ce n'est pas dans la liste). Pour choisir le bon lot : prends celui dont l'ARTISAN correspond à l'artisan indiqué entre parenthèses dans les notes. Si aucun lot de la liste ne correspond vraiment → portee="generale" et lot_nom="".
- N'ÉCRIS JAMAIS le nom de l'artisan / entreprise dans "titre", "texte" ni "note". Le nom entre parenthèses dans les notes (« (D2M) », « (ESPRIT CUISINE) »…) sert UNIQUEMENT à remplir le champ "artisan" et à router — il ne doit PAS apparaître dans le texte, qui est destiné au client. Garde en revanche « (TS) » et « [à titre informatif] ».`
function parseJsonSafe(text) {
  if (!text) return null
  try { return JSON.parse(text) } catch { /* isole l'objet */ }
  const i = text.indexOf('{')
  const j = text.lastIndexOf('}')
  if (i === -1 || j === -1 || j <= i) return null
  try { return JSON.parse(text.slice(i, j + 1)) } catch { return null }
}

// Découpe un segment en objets JSON { … } BALANCÉS (gère les guillemets et échappements),
// en ignorant le dernier objet incomplet d'une sortie tronquée. Même filet que
// /api/actions/consolider.
function objetsBalances(segment) {
  const objets = []
  let prof = 0, debut = -1, dansStr = false, echap = false
  for (let k = 0; k < segment.length; k++) {
    const ch = segment[k]
    if (dansStr) {
      if (echap) echap = false
      else if (ch === '\\') echap = true
      else if (ch === '"') dansStr = false
      continue
    }
    if (ch === '"') dansStr = true
    else if (ch === '{') { if (prof === 0) debut = k; prof++ }
    else if (ch === '}') { if (prof > 0) { prof--; if (prof === 0 && debut !== -1) { objets.push(segment.slice(debut, k + 1)); debut = -1 } } }
  }
  return objets
}

// Filet de récupération quand la sortie IA est TRONQUÉE au plafond de tokens : le JSON global
// est coupé donc illisible d'un bloc, mais les objets déjà émis dans "actions"/"updates" sont
// complets. On les récupère un par un plutôt que de tout jeter (mieux vaut 18 actions sur 20
// qu'un échec total). Schéma : { "updates": [ … ], "actions": [ … ] } (updates avant actions).
function recupererActions(text) {
  if (!text) return null
  const iUpd = text.indexOf('"updates"')
  const iAct = text.indexOf('"actions"')
  const tryParse = (s) => { try { return JSON.parse(s) } catch { return null } }
  const segAct = iAct === -1 ? '' : text.slice(text.indexOf('[', iAct) + 1)
  const segUpd = iUpd === -1 ? '' : text.slice(text.indexOf('[', iUpd) + 1, iAct > iUpd ? iAct : undefined)
  const actions = objetsBalances(segAct).map(tryParse).filter(Boolean)
  const updates = objetsBalances(segUpd).map(tryParse).filter(Boolean)
  return actions.length ? { actions, updates } : null
}
export async function POST(request) {
  const auth = await requireRole(request, ['admin', 'agente'])
  if (auth.error) return auth.error
  let body
  try { body = await request.json() } catch { body = {} }
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, MAX_NOTES) : ''
  if (!notes) return NextResponse.json({ error: 'notes manquantes' }, { status: 400 })
  // Lots du dossier AVEC leur artisan : l'artisan sert à router (les notes taguent l'artisan
  // entre parenthèses) et "lot_nom" doit être copié EXACTEMENT depuis cette liste (jamais inventé).
  const lots = Array.isArray(body.lots)
    ? body.lots.filter(l => l?.nom).slice(0, 60).map(l => ({
        nom: String(l.nom).slice(0, 120),
        artisan: typeof l.artisan === 'string' ? l.artisan.slice(0, 120) : '',
      }))
    : []
  // Actions DÉJÀ présentes dans le rapport (reportées ou créées) → l'IA propose des MISES À JOUR
  // au lieu de recréer des doublons. Chaque entrée porte une "ref" (numéro) stable côté client.
  const existantes = (Array.isArray(body.existantes) ? body.existantes : [])
    .filter(e => Number.isFinite(Number(e?.ref)))
    .slice(0, 120)
    .map(e => ({
      ref: Number(e.ref),
      titre: typeof e?.titre === 'string' ? e.titre.slice(0, 160) : '',
      texte: typeof e?.texte === 'string' ? e.texte.slice(0, 400) : '',
      statut: typeof e?.statut === 'string' ? e.statut : '',
      lot_nom: typeof e?.lot_nom === 'string' ? e.lot_nom.slice(0, 120) : '',
    }))
  const refSet = new Set(existantes.map(e => e.ref))
  // Type de visite (R1/R2/R3/suivi/réception) → règles rédactionnelles + contexte adaptés.
  const typeVisite = TYPES_VISITE[body.type_visite] ? body.type_visite : null
  // Les règles du CR (consignes générales + contexte du type) sont injectées dans le prompt système.
  const system = `${SYSTEM_PROMPT}\n\n${reglesActions(typeVisite)}`
  const enTete = typeVisite ? `Type de visite : ${TYPES_VISITE[typeVisite]}\n\n` : ''
  // Reprise d'un ANCIEN rapport rédigé (prose) → cadrage différent des notes brutes.
  const bloc = body.source === 'ancien_rapport'
    ? `ANCIEN COMPTE-RENDU DÉJÀ RÉDIGÉ (à convertir en actions) :\n${notes}\n\nSois EXHAUSTIF : parcours TOUT le rapport et extrais CHAQUE élément actionnable en une action distincte — chaque travail réalisé, chaque point à suivre, chaque réserve, chaque décision, validation, arbitrage, demande, relance ou point de vigilance. Vise plutôt trop que pas assez (mieux vaut une action de trop, décochable, qu'un oubli). Une puce ou une phrase du rapport = souvent une action. Ignore UNIQUEMENT les rubriques purement descriptives d'identification (référence dossier, adresse, intervenants présents, dates d'en-tête) et les phrases de liaison sans contenu.`
    : `Notes de visite :\n${notes}`
  // Bloc « actions déjà présentes » : injecté seulement s'il y en a (flux notes d'un suivi).
  const blocExistantes = existantes.length
    ? `\n\nACTIONS DÉJÀ PRÉSENTES dans ce rapport (ne PAS les recréer ; propose une MISE À JOUR via "updates" avec la "ref" si un point des notes les concerne) :\n${existantes.map(e => `[ref ${e.ref}] (${e.statut || '—'})${e.lot_nom ? ' [' + e.lot_nom + ']' : ''} ${e.titre || ''}${e.texte ? ' — ' + e.texte : ''}`.trim()).join('\n')}`
    : ''
  const lotsListe = lots.length
    ? lots.map(l => `- "${l.nom}"${l.artisan ? ` (artisan : ${l.artisan})` : ''}`).join('\n')
    : 'aucun'
  const userText = `${enTete}${bloc}${blocExistantes}\n\nLOTS DISPONIBLES — "lot_nom" doit être COPIÉ EXACTEMENT depuis cette liste (le texte entre guillemets), jamais inventé ni reformulé. L'artisan entre parenthèses dans les notes désigne le lot du MÊME artisan ci-dessous :\n${lotsListe}\n\nRenvoie les mises à jour (updates) et les nouvelles actions au format JSON demandé, en français.`
  const claudeBody = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,   // 4000 tronquait les grosses analyses CR → JSON coupé → « Réponse IA illisible ».
    temperature: 0,
    system,
    messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
  })
  let claudeRes = null
  let derniereErreur = null
  for (let tentative = 0; tentative <= CLAUDE_RETRIES; tentative++) {
    if (tentative > 0) await new Promise(r => setTimeout(r, 800 * 2 ** (tentative - 1)))
    const ctrl = new AbortController()
    const minuteur = setTimeout(() => ctrl.abort(), CLAUDE_TIMEOUT_MS)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: claudeBody,
        signal: ctrl.signal,
      })
      clearTimeout(minuteur)
      if (res.ok) { claudeRes = res; break }
      if (RETRIABLE_STATUS.has(res.status) && tentative < CLAUDE_RETRIES) { derniereErreur = new Error(`Claude API ${res.status}`); continue }
      claudeRes = res
      break
    } catch (e) {
      clearTimeout(minuteur)
      derniereErreur = e
    }
  }
  if (!claudeRes) return NextResponse.json({ error: `Service IA indisponible (${derniereErreur?.message || 'timeout'}). Réessaie.` }, { status: 503 })
  if (!claudeRes.ok) {
    const err = await claudeRes.json().catch(() => ({}))
    return NextResponse.json({ error: err.error?.message || 'Erreur Claude API' }, { status: 500 })
  }
  const claudeData = await claudeRes.json()
  const claudeText = claudeData.content?.[0]?.text || ''
  const tronquee = claudeData.stop_reason === 'max_tokens'   // sortie coupée par le plafond de tokens
  let raw = parseJsonSafe(claudeText)
  // Si le JSON global est illisible (typiquement une sortie tronquée), on tente de récupérer
  // les objets complets déjà émis au lieu d'échouer en bloc.
  if (!raw || !Array.isArray(raw.actions)) raw = recupererActions(claudeText)
  if (!raw || !Array.isArray(raw.actions)) return NextResponse.json({ error: 'Réponse IA illisible' }, { status: 502 })
  // Coercition : on ne fait jamais confiance à la sortie brute.
  const dateOk = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)) ? s : null
  // Mapping DÉTERMINISTE artisan → lot RÉEL. Le modèle identifie l'artisan (entre parenthèses,
  // fiable) ; le serveur en déduit le lot. Un lot_nom inventé (« Carrelage », « Meubles de
  // cuisine »…) devient IMPOSSIBLE : s'il ne correspond à aucun lot du dossier, l'action passe
  // en "generale". Robuste là où le prompt seul échouait (le modèle « améliorait » les noms).
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim()
  const lotsNorm = lots.map(l => ({ nom: l.nom, nomN: norm(l.nom), artN: norm(l.artisan) }))
  // Artisan de la note → LOTS de cet artisan : égalité OU inclusion (ex. « d2m » ⊂ « d2m electricite »,
  // « habitat francais » ⊂ « l habitat francais »). Renvoie TOUS les lots de l'artisan (il peut en avoir plusieurs).
  const lotsParArtisan = (hint) => {
    const h = norm(hint)
    if (!h) return []
    return lotsNorm.filter(l => l.artN && (l.artN === h || l.artN.includes(h) || h.includes(l.artN))).map(l => l.nom)
  }
  const lotParNom = (nom) => {
    const n = norm(nom)
    if (!n) return ''
    const hit = lotsNorm.find(l => l.nomN === n)
    return hit ? hit.nom : ''
  }
  // Le nom de l'artisan ne doit PAS apparaître dans le texte du CR (il sert au routage, pas à
  // l'affichage client). On retire les parenthèses qui désignent un artisan connu — « (D2M) »,
  // « (ESPRIT CUISINE) »… — en gardant « (TS) » et toute autre parenthèse de contenu.
  const artisansNorm = [...new Set(lotsNorm.map(l => l.artN).filter(Boolean))]
  const estArtisan = (c) => { const n = norm(c); return !!n && artisansNorm.some(a => a === n || a.includes(n)) }
  const stripArtisans = (t) => String(t || '')
    .replace(/\s*\(([^()]*)\)/g, (m, inner) => estArtisan(inner) ? '' : m)
    .replace(/\s{2,}/g, ' ').replace(/\s+([.,])/g, '$1').trim()
  const actions = raw.actions.slice(0, 40).map(a => {
    const statut = STATUT_SET.has(a?.statut) ? a.statut : 'en_cours'
    // Lot : l'artisan fait foi. 1 seul lot pour cet artisan → on le prend. PLUSIEURS lots (même
    // artisan sur plusieurs lots) → on ne devine pas : on ne garde le lot que si le modèle a donné
    // un lot_nom qui est L'UN de ces lots ; sinon "generale" (l'humaine assignera). Aucun artisan
    // reconnu → on retombe sur lot_nom s'il correspond à un vrai lot.
    const parArt = lotsParArtisan(a?.artisan)
    const parNom = lotParNom(a?.lot_nom)
    let lot_nom = ''
    if (parArt.length === 1) lot_nom = parArt[0]
    else if (parArt.length > 1) lot_nom = parArt.includes(parNom) ? parNom : ''
    else lot_nom = parNom
    return {
      titre: stripArtisans(typeof a?.titre === 'string' ? a.titre.trim().slice(0, 120) : ''),
      texte: stripArtisans(typeof a?.texte === 'string' ? a.texte.trim().slice(0, 1500) : ''),
      portee: lot_nom ? 'lot' : 'generale',
      lot_nom,
      statut,
      statut_date: dateOk(a?.statut_date),
    }
  }).filter(a => a.texte || a.titre)
  // Mises à jour : ref valide + au moins un changement (statut ou texte). On ne fait jamais confiance.
  const updates = (Array.isArray(raw.updates) ? raw.updates : []).map(u => {
    const ref = Number(u?.ref)
    if (!refSet.has(ref)) return null
    const statut = STATUT_SET.has(u?.statut) ? u.statut : null
    const texteBrut = (typeof u?.texte === 'string' && u.texte.trim()) ? stripArtisans(u.texte.trim().slice(0, 1500)) : null
    const texte = texteBrut || null
    if (!statut && !texte) return null
    return { ref, statut, texte, note: stripArtisans(typeof u?.note === 'string' ? u.note.trim().slice(0, 200) : '') }
  }).filter(Boolean)
  return NextResponse.json({ actions, updates, tronquee })
}
