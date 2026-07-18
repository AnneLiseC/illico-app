// ─────────────────────────────────────────────────────────────────────────────
// Traitement des images côté navigateur — surtout : rendre les photos iPhone
// (HEIC/HEIF) exploitables PARTOUT.
//
// Problème : les iPhone enregistrent en HEIC par défaut. Les navigateurs ne
// décodent PAS le HEIC → une telle photo ne s'affiche pas dans une <img>, ne
// passe pas dans un <canvas> (compression), et est refusée par l'API Claude.
// Solution : convertir HEIC→JPEG à l'UPLOAD, pour que le Storage ne contienne
// jamais de HEIC — ainsi galerie, ZIP, CR et PDF en profitent tous.
//
// heic2any est browser-only (wasm libheif) → import DYNAMIQUE uniquement quand
// une image HEIC est réellement rencontrée (jamais au SSR, jamais dans le bundle
// initial).
// ─────────────────────────────────────────────────────────────────────────────

export function isHeicFile(file) {
  const t = (file?.type || '').toLowerCase()
  const n = (file?.name || '').toLowerCase()
  return t.includes('heic') || t.includes('heif') || n.endsWith('.heic') || n.endsWith('.heif')
}

// Convertit un fichier HEIC/HEIF en JPEG. Retourne le fichier d'origine INCHANGÉ
// si ce n'est pas du HEIC (donc appelable systématiquement, sans surcoût).
export async function heicToJpegFile(file, quality = 0.92) {
  if (!isHeicFile(file)) return file
  const { default: heic2any } = await import('heic2any')
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality })
  const blob = Array.isArray(out) ? out[0] : out
  const nom = (file.name || 'photo').replace(/\.(heic|heif)$/i, '') + '.jpg'
  return new File([blob], nom, { type: 'image/jpeg' })
}

// Compresse une image en JPEG redimensionnée (pour l'envoi à l'IA / vignettes).
// Gère le HEIC en amont (le canvas ne sait pas le décoder).
export async function compressImageToBlob(file, maxSide = 1600, quality = 0.8) {
  const jpegFile = await heicToJpegFile(file, 0.92)
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        canvas.toBlob(
          blob => (blob ? resolve(blob) : reject(new Error('compression échouée'))),
          'image/jpeg',
          quality
        )
      }
      img.onerror = reject
      img.src = reader.result
    }
    reader.onerror = reject
    reader.readAsDataURL(jpegFile)
  })
}
