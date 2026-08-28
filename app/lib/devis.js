// app/lib/devis.js
// Logique pure du devis (testable, sans React ni réseau) :
//   - buildDevisPayload : construit la ligne devis_artisans depuis le formulaire de la modale.
//   - normaliserExtractionDevis : coerce/valide la sortie brute de l'IA (montants, dates)
//     et applique la règle métier « pas de TVA → HT = TTC ».
//   - matchArtisanParNom : rapproche le nom d'entreprise extrait d'un artisan existant
//     (pas de SIRET sur les artisans → match sur le nom normalisé uniquement).

// ── Payload devis_artisans depuis le formulaire de la modale ──
// Extrait tel quel de saveDevisFromModal pour être unit-testé : c'est le point d'entrée
// de l'argent (montants, commission, acompte), on veut un filet avant d'y brancher l'IA.
export function buildDevisPayload(form) {
  const acomptePct = form.acompte_pourcentage === -1 || form.acompte_pourcentage === 0
    ? form.acompte_pourcentage
    : parseFloat(form.acompte_pourcentage)
  const acompteMontant = form.acompte_pourcentage === -1
    ? (form.acompte_montant_fixe !== '' && Number.isFinite(parseFloat(form.acompte_montant_fixe)) ? parseFloat(form.acompte_montant_fixe) : null)
    : null
  return {
    montant_ht: form.montant_ht !== '' ? parseFloat(form.montant_ht) : null,
    montant_ttc: form.montant_ttc !== '' ? parseFloat(form.montant_ttc) : null,
    ttc_manuel: form.ttc_manuel ?? false,
    commission_pourcentage: form.sans_commission ? 0 : (form.commission_pourcentage ? parseFloat(form.commission_pourcentage) / 100 : null),
    // Case « Sans commission ni honoraires » = DEUX effets → DEUX colonnes. On n'utilise
    // PAS commission_pourcentage = 0 comme marqueur d'exonération : commission et
    // honoraires restent deux décisions séparées en base, même cochées d'un clic.
    hors_honoraires: !!form.sans_commission,
    date_reception: form.date_reception || null,
    date_limite: form.date_limite || null,
    notes: form.notes || null,
    acompte_pourcentage: acomptePct,
    acompte_montant_fixe: acompteMontant,
  }
}

// Nombre robuste : accepte "1 234,56 €", "1234.56", 1234.56 → 1234.56. Sinon null.
function toNombre(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const n = parseFloat(String(v).replace(/ /g, ' ').replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

// Date → 'YYYY-MM-DD'. Accepte ISO et 'JJ/MM/AAAA'. Sinon null (jamais de date inventée).
function toDateISO(v) {
  if (!v) return null
  const s = String(v).trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

// Normalise la sortie brute de l'IA. NE fait JAMAIS confiance : coercition de types,
// NaN → null, dates inventées → null. Règle métier : franchise en base (pas de TVA) →
// HT et TTC sont égaux. Si HT et TTC sont tous deux lus, on les garde tels quels.
export function normaliserExtractionDevis(raw) {
  let ht  = toNombre(raw?.montant_ht)
  const tva = toNombre(raw?.montant_tva)
  let ttc = toNombre(raw?.montant_ttc)
  const taux = toNombre(raw?.taux_tva)
  const sansTva = (tva == null || tva === 0) && (taux == null || taux === 0)
  // Pas de TVA → HT = TTC (comble le manquant à partir de l'autre).
  if (sansTva) {
    if (ttc == null && ht != null) ttc = ht
    if (ht == null && ttc != null) ht = ttc
  }
  const warnings = []
  if (ht != null && ttc != null && ttc < ht) warnings.push('ttc_inferieur_ht')
  return {
    montant_ht: ht,
    montant_tva: tva,
    montant_ttc: ttc,
    taux_tva: taux,
    date_reception: toDateISO(raw?.date_reception),
    date_limite: toDateISO(raw?.date_limite),
    description: raw?.description ? String(raw.description).trim().slice(0, 2000) : null,
    entreprise: raw?.entreprise ? String(raw.entreprise).trim().slice(0, 200) : null,
    siret: raw?.siret ? String(raw.siret).replace(/\s/g, '').slice(0, 20) : null,
    warnings,
  }
}

// Normalise un nom d'entreprise pour le rapprochement : minuscules, sans accents, sans
// forme juridique ni ponctuation. « SARL Dupont Plomberie » ≈ « dupont plomberie ».
function normNom(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(sarl|sasu|sas|eurl|sa|sci|snc|scop|eirl|ei|ets|etablissements|entreprise|auto\s*entrepreneur|micro\s*entreprise)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
}

// Rapproche le nom extrait d'un artisan de la liste. Renvoie { id, exact } ou { id:'', ... }.
// Match exact normalisé d'abord ; sinon inclusion (≥4 car. pour éviter les faux positifs).
export function matchArtisanParNom(entreprise, artisans) {
  const cible = normNom(entreprise)
  if (!cible || !Array.isArray(artisans)) return { id: '', exact: false }
  const exact = artisans.find(a => normNom(a.entreprise) === cible)
  if (exact) return { id: exact.id, exact: true }
  if (cible.length >= 4) {
    const partiel = artisans.find(a => {
      const n = normNom(a.entreprise)
      return n && n.length >= 4 && (n.includes(cible) || cible.includes(n))
    })
    if (partiel) return { id: partiel.id, exact: false }
  }
  return { id: '', exact: false }
}
