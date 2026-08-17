// app/lib/joursOuvres.js — calcul de durée en JOURS OUVRÉS, par entreprise (Lot 4-3).
// Chaque artisan a `jours_travailles` : tableau ISO des jours travaillés (1 = lundi … 7 = dimanche).
// Défaut = lundi→vendredi. Sert à : afficher la durée réelle d'un lot et recalculer sa date de
// fin quand on saisit une durée, en sautant les jours non travaillés de SON artisan.

export const JOURS_DEFAUT = [1, 2, 3, 4, 5]
export const LIBELLES_JOURS = [
  { iso: 1, l: 'L' }, { iso: 2, l: 'M' }, { iso: 3, l: 'M' }, { iso: 4, l: 'J' },
  { iso: 5, l: 'V' }, { iso: 6, l: 'S' }, { iso: 7, l: 'D' },
]

// 'YYYY-MM-DD' | Date -> Date (minuit local, sans dérive fuseau).
function toDate(v) {
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate())
  if (typeof v === 'string') {
    const m = v.slice(0, 10).split('-')
    if (m.length === 3) return new Date(+m[0], +m[1] - 1, +m[2])
  }
  return null
}
function iso(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const jj = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${jj}`
}
// getDay() : 0 = dimanche → 7 ; sinon inchangé (1..6).
function isoDay(d) { const j = d.getDay(); return j === 0 ? 7 : j }

function normJours(jours) {
  const arr = Array.isArray(jours) ? jours.map(Number).filter(n => n >= 1 && n <= 7) : []
  return arr.length ? arr : JOURS_DEFAUT
}

export function estOuvre(date, jours) {
  const d = toDate(date); if (!d) return false
  return normJours(jours).includes(isoDay(d))
}

// Nombre de jours ouvrés entre debut et fin INCLUS (0 si dates absentes/incohérentes).
export function dureeOuvree(debut, fin, jours) {
  const a = toDate(debut), b = toDate(fin)
  if (!a || !b || b < a) return 0
  const js = normJours(jours)
  let n = 0
  for (const d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    if (js.includes(isoDay(d))) n++
  }
  return n
}

// Date de fin telle qu'il y ait `nb` jours ouvrés depuis `debut` (inclus). Si `debut` tombe un
// jour non travaillé, le comptage démarre au 1er jour ouvré suivant. Renvoie 'YYYY-MM-DD' ou null.
export function finApresOuvres(debut, nb, jours) {
  const a = toDate(debut)
  const n = Math.max(1, Math.floor(Number(nb) || 1))
  if (!a) return null
  const js = normJours(jours)
  const d = new Date(a)
  // Avance jusqu'au 1er jour ouvré >= debut.
  let garde = 0
  while (!js.includes(isoDay(d)) && garde++ < 3660) d.setDate(d.getDate() + 1)
  let compte = 1
  garde = 0
  while (compte < n && garde++ < 3660) {
    d.setDate(d.getDate() + 1)
    if (js.includes(isoDay(d))) compte++
  }
  return iso(d)
}

// ── Durée en JOURS CALENDAIRES simples (planning : lots ET sous-lots) ──
// Nombre de jours entre debut et fin INCLUS (debut==fin ⇒ 1 jour). 0 si dates absentes/incohérentes.
export function dureeJours(debut, fin) {
  const a = toDate(debut), b = toDate(fin)
  if (!a || !b || b < a) return 0
  return Math.round((b - a) / 86400000) + 1
}

// Date de fin telle qu'il y ait `nb` jours calendaires depuis `debut` (inclus). 'YYYY-MM-DD' ou null.
export function finApresJours(debut, nb) {
  const a = toDate(debut)
  const n = Math.max(1, Math.floor(Number(nb) || 1))
  if (!a) return null
  const d = new Date(a)
  d.setDate(d.getDate() + (n - 1))
  return iso(d)
}
