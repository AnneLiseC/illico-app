// app/lib/pdf/fonts.js
// Enregistrement des polices PDF (partagé par tous les documents @react-pdf).
//
// Pourquoi : @react-pdf/renderer rend par défaut avec les polices STANDARD
// intégrées (Helvetica…), dont la table de glyphes provoque, en v4, des glyphes
// parasites/superposés en début de mots et des caractères manquants (accents,
// flèches → hors WinAnsi). On embarque donc une vraie police TTF Unicode (Roboto,
// instances statiques Regular + Bold) et on l'enregistre une seule fois ici.
//
// L'enregistrement est un singleton global @react-pdf : un seul import suffit
// pour tous les documents (CR, restitution, récap honoraires).
import path from 'path'
import { Font } from '@react-pdf/renderer'
import { EmbeddedFont } from '@react-pdf/pdfkit'

// ── Rustine ToUnicode : fiabilise le copier-coller / l'extraction du texte des PDF ──
//
// LE PROBLÈME — @react-pdf embarque les polices en sous-ensemble et génère, pour chaque
// police, une table « ToUnicode » qui relie chaque glyphe à son caractère Unicode (c'est
// elle qui permet de copier-coller ou d'extraire le texte d'un PDF). Or fontkit renvoie
// parfois, selon l'enchaînement des caractères rencontrés dans le document, un tableau de
// codePoints VIDE pour un glyphe — typiquement une CAPITALE ACCENTUÉE (É, À, È…). La
// table contient alors une entrée « <cid><> » : le glyphe s'affiche parfaitement, mais à
// l'extraction il ne rend RIEN. Constaté sur un dossier client : « MJ RÉNOVATION » se
// copiait « MJ R NOVATION », le É disparaissait de la couche texte du récapitulatif et du
// descriptif (pages générées), pas des devis artisans importés. Le défaut dépend du
// contenu exact, d'où son côté intermittent.
//
// LE REMÈDE — à l'écriture de la table (et UNIQUEMENT là), on rétablit toute entrée vide
// en relisant le caractère depuis le cmap de la police d'origine (glyphe → Unicode). On
// ne touche QUE la couche texte : aucune mise en page, aucune largeur de glyphe, aucun
// total ne changent. La rustine est idempotente et protégée : si quoi que ce soit manque
// à l'appel, elle laisse la génération se dérouler comme avant.
//
// Pourquoi ici : fonts.js est le point d'entrée importé par TOUS les documents PDF — la
// rustine s'applique donc partout, en une seule fois (patch de prototype, posé une fois).
if (EmbeddedFont && EmbeddedFont.prototype && !EmbeddedFont.prototype.__rustineToUnicode) {
  const toUnicodeOriginal = EmbeddedFont.prototype.toUnicodeCmap
  EmbeddedFont.prototype.toUnicodeCmap = function () {
    try {
      const reverse = this.font && this.font._cmapProcessor
      const glyphesSousEnsemble = this.subset && this.subset.glyphs
      if (reverse && typeof reverse.codePointsForGlyph === 'function' && Array.isArray(glyphesSousEnsemble) && Array.isArray(this.unicode)) {
        for (let cid = 0; cid < this.unicode.length; cid++) {
          const codePoints = this.unicode[cid]
          if (codePoints && codePoints.length) continue        // déjà bon : on ne touche pas
          const glypheOrigine = glyphesSousEnsemble[cid]        // cid sous-ensemble → glyphe d'origine
          if (glypheOrigine == null) continue
          const retrouve = reverse.codePointsForGlyph(glypheOrigine)
          if (retrouve && retrouve.length) this.unicode[cid] = retrouve
        }
      }
    } catch { /* la rustine ne doit JAMAIS casser la génération d'un document */ }
    return toUnicodeOriginal.call(this)
  }
  EmbeddedFont.prototype.__rustineToUnicode = true
}

const fontsDir = path.join(process.cwd(), 'public', 'fonts')

Font.register({ family: 'Roboto', src: path.join(fontsDir, 'Roboto-Regular.ttf') })
Font.register({ family: 'Roboto-Bold', src: path.join(fontsDir, 'Roboto-Bold.ttf') })
Font.register({ family: 'Roboto-Italic', src: path.join(fontsDir, 'Roboto-Italic.ttf') })
// Variante italic de la famille 'Roboto' : résout les styles fontStyle:'italic'
// (ex. restitution.js paiementEmpty, RecapHonoraires niveau/remiseLabel) qui
// héritent de la famille Roboto. La famille séparée 'Roboto-Italic' ci-dessus est
// conservée (utilisée par NOM via fontFamily:'Roboto-Italic' ailleurs).
Font.register({ family: 'Roboto', src: path.join(fontsDir, 'Roboto-Italic.ttf'), fontStyle: 'italic' })
