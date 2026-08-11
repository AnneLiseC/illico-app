// app/lib/drive/http.js
// fetch résilient au throttling, partagé par les miroirs Drive (OneDrive + Google Drive).
//
// Pourquoi : un push de dossier entier tire BEAUCOUP de requêtes en parallèle. Les providers
// rejettent la rafale — Microsoft Graph par un 429 + en-tête Retry-After ; Google Drive par un
// 429 OU un 403 dont le corps porte « rateLimitExceeded / userRateLimitExceeded / quotaExceeded ».
// Comme les push sont « fire-and-forget » côté app (.catch(()=>{})), ces échecs étaient avalés →
// des fichiers manquaient silencieusement. On réessaie ici, en respectant Retry-After quand il
// est fourni, sinon backoff exponentiel plafonné.
//
// body des uploads = Buffer (réutilisable entre tentatives), jamais un flux consommable.

const RETRY_STATUS = new Set([429, 500, 503, 504])
const GOOGLE_THROTTLE_RE = /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/i

function backoffMs(res, attempt) {
  const ra = Number(res?.headers?.get?.('retry-after'))
  if (Number.isFinite(ra) && ra > 0) return Math.min(ra * 1000, 30000)
  return Math.min(500 * 2 ** attempt, 16000)
}

const defaultSleep = ms => new Promise(r => setTimeout(r, ms))

// fetchRetry(url, opts, { tries, isGoogle, fetchImpl, sleep })
// - tries    : nombre max de RÉ-essais après le 1er appel (défaut 5).
// - isGoogle : active la détection du throttling Google via 403 + corps.
// - fetchImpl / sleep : points d'injection pour les tests (défaut : fetch global / setTimeout).
export async function fetchRetry(url, opts = {}, cfg = {}) {
  const { tries = 5, isGoogle = false, fetchImpl = fetch, sleep = defaultSleep } = cfg
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(url, opts)
    if (res.ok || attempt >= tries) return res

    let transient = RETRY_STATUS.has(res.status)
    if (!transient && isGoogle && res.status === 403) {
      // Corps lu sur un clone → l'appelant peut toujours lire res s'il n'y a pas de retry.
      try {
        const txt = await res.clone().text()
        if (GOOGLE_THROTTLE_RE.test(txt)) transient = true
      } catch { /* corps illisible → on ne réessaie pas */ }
    }
    if (!transient) return res

    await sleep(backoffMs(res, attempt))
  }
}
