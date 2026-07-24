// app/lib/calendar/parse-event.js
// Couche 2 du pull calendrier — PARSER de titres d'events (FONCTION PURE, sans I/O).
//
// parseEvent(titre, { clients, dossiers, artisans }) -> { type_rdv, dossier_id, artisan_id }
//   Les listes clients/dossiers/artisans sont déjà chargées et SCOPÉES (société/agence
//   de la cible) par l'appelant. La fonction ne touche jamais la base.
//
// RÈGLE DE SÉCURITÉ ABSOLUE : en cas d'ambiguïté -> 'autres' / lien null. JAMAIS de devinette.
//   - type_rdv est TOUJOURS renvoyé (défaut 'autres') ;
//   - dossier_id / artisan_id seulement si CERTAIN (exactement 1 candidat à chaque étage).

// Normalisation : accents retirés, emojis retirés, minuscule, espaces réduits, trim.
export function normalizeTitle(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // accents (diacritiques combinants)
    .replace(/\p{Extended_Pictographic}/gu, ' ')        // emojis (🔨🏗🏁…)
    .replace(/[️‍]/g, ' ')                    // sélecteur de variation / ZWJ
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// Présence de `phrase` (déjà normalisée) comme séquence de MOTS entiers dans `texte`.
function containsWord(texte, phrase) {
  if (!phrase) return false
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(texte)
}

// EXCLUSION 1 — nos propres pushes Batilis ré-importés : séparateur " | " AVEC un
// libellé de type. On ne les retype/relie PAS (risque de doublon avec le RDV natif).
function isBatilisPush(norm) {
  return norm.includes(' | ') &&
    (norm.includes('visite technique') || norm.includes('presentation'))
}

// EXCLUSION 2 — marqueurs de dates-clés chantier (pas des RDV) : demarrage / fin / 🏗 / 🏁.
// Les emojis sont détectés sur le titre BRUT (la normalisation les retire).
function isChantierMarker(rawTitre, norm) {
  if (/🏗|🏁/u.test(rawTitre || '')) return true
  return /(^|[^a-z0-9])(demarrage|fin)([^a-z0-9]|$)/.test(norm)
}

// TYPE — premier test qui matche gagne. R1/R2/R3 (en tête) priment sur tout le reste.
function detectType(norm) {
  const m = norm.match(/^r\s?([123])(?![0-9a-z])/)  // "r1", "r1 -", "r1—", "r3 jourdan"…
  if (m) return m[1] === '1' ? 'visite_technique_client'
       : m[1] === '2' ? 'visite_technique_artisan'
       : 'presentation_devis'
  if (/(^|[^a-z])recep/.test(norm)) return 'reception'
  if (/(^|[^a-z])suiv/.test(norm)) return 'suivi'
  if (/(^|[^a-z])archi/.test(norm) || /(^|[^a-z])bet([^a-z]|$)/.test(norm)
      || /bureau d ?etude/.test(norm) || /(^|[^a-z])cuisin/.test(norm)) return 'etude'
  return 'autres'
}

// Retire le préfixe R1/R2/R3 (+ séparateur) pour ne chercher les entités que dans le reste.
function resteApresPrefixe(norm) {
  return norm.replace(/^r\s?[123]\s*[-—:.]*\s*/, '').trim() || norm
}

// DOSSIER — 1 client CERTAIN (nom/prenom/nom2/prenom2, mot entier, len>=3) -> son UNIQUE
// dossier en cours. 0 ou >1 client, ou 0/>1 dossier en cours -> null (type conservé).
function resolveDossier(reste, clients, dossiers) {
  const seen = new Set()
  const matched = []
  for (const c of clients) {
    const champs = [c.nom, c.prenom, c.nom2, c.prenom2]
    const hit = champs.some((f) => {
      const nf = normalizeTitle(f)
      return nf.length >= 3 && containsWord(reste, nf)
    })
    if (hit && !seen.has(c.id)) { seen.add(c.id); matched.push(c) }
  }
  if (matched.length !== 1) return null
  const client = matched[0]
  const enCours = dossiers.filter((d) =>
    d.client_id === client.id &&
    d.archive === false &&
    !['annule', 'termine'].includes(d.statut || ''))
  return enCours.length === 1 ? enCours[0].id : null
}

// ARTISAN — 1 entreprise CERTAINE (match exact mot entier sur artisans.entreprise).
// 0 ou >1 (plusieurs entreprises dans le titre) -> null. artisan_id est unique sur le RDV.
function resolveArtisan(reste, artisans) {
  const seen = new Set()
  const matched = []
  for (const a of artisans) {
    const na = normalizeTitle(a.entreprise)
    if (na.length >= 2 && containsWord(reste, na) && !seen.has(a.id)) {
      seen.add(a.id); matched.push(a)
    }
  }
  return matched.length === 1 ? matched[0].id : null
}

export function parseEvent(titre, { clients = [], dossiers = [], artisans = [] } = {}) {
  const out = { type_rdv: 'autres', dossier_id: null, artisan_id: null }
  const norm = normalizeTitle(titre)
  if (!norm) return out

  // Exclusions : nos pushes ré-importés + marqueurs de chantier -> 'autres', aucun lien.
  if (isBatilisPush(norm) || isChantierMarker(titre, norm)) return out

  out.type_rdv = detectType(norm)
  const reste = resteApresPrefixe(norm)
  out.dossier_id = resolveDossier(reste, clients, dossiers)
  out.artisan_id = resolveArtisan(reste, artisans)
  return out
}
