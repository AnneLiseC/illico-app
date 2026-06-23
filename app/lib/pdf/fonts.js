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

const fontsDir = path.join(process.cwd(), 'public', 'fonts')

Font.register({ family: 'Roboto', src: path.join(fontsDir, 'Roboto-Regular.ttf') })
Font.register({ family: 'Roboto-Bold', src: path.join(fontsDir, 'Roboto-Bold.ttf') })
Font.register({ family: 'Roboto-Italic', src: path.join(fontsDir, 'Roboto-Italic.ttf') })
// Variante italic de la famille 'Roboto' : résout les styles fontStyle:'italic'
// (ex. restitution.js paiementEmpty, RecapHonoraires niveau/remiseLabel) qui
// héritent de la famille Roboto. La famille séparée 'Roboto-Italic' ci-dessus est
// conservée (utilisée par NOM via fontFamily:'Roboto-Italic' ailleurs).
Font.register({ family: 'Roboto', src: path.join(fontsDir, 'Roboto-Italic.ttf'), fontStyle: 'italic' })
