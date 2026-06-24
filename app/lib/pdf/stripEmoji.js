// app/lib/pdf/stripEmoji.js
// Retrait des emojis/pictogrammes dans le TEXTE rendu en PDF.
//
// Pourquoi : la police Roboto (lib/pdf/fonts.js) n'a pas les glyphes emoji →
// un ⚠️ (U+26A0 + U+FE0F), ✅, 🔧… s'affiche en carré/tofu. Les CR générés par
// l'IA contiennent ces caractères dans contenu_final. On NE touche PAS la donnée
// en base : on nettoie uniquement à l'affichage PDF.
//
// ⚠️ Strip CHIRURGICAL : on ne retire QUE les plages emoji/pictogrammes.
// On NE touche PAS aux caractères que Roboto rend et qui portent du sens :
//   — U+2014 (em-dash) · • U+2022 (puce) · – U+2013 · → U+2192 (flèche) ·
//   € U+20AC · ' U+2019 · ≈ U+2248 · etc. (tous HORS des plages ci-dessous).
//
// Le flag 'u' est OBLIGATOIRE (plages > U+FFFF comme \u{1F000}).
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu

export function stripEmojiPdf(text) {
  if (!text) return text
  return text
    .replace(EMOJI_RE, '')
    .replace(/ {2,}/g, ' ')   // recolle un éventuel double-espace laissé par un emoji retiré
}
