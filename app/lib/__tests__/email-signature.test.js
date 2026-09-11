import { describe, it, expect } from 'vitest'
import {
  signatureAgence, signatureComplete, adresseUneLigne, telephoneLisible, gabaritEmail, echapper,
} from '../email-signature.js'

// Ces mails partent à de VRAIS clients. Une signature fausse ou vide, c'est un client qui
// ne sait pas qui lui écrit ni qui appeler — sur un dossier de travaux à 50 000 €.

// Les deux agences RÉELLES de la base au 11/09, dont l'une est à moitié renseignée.
const MARTIGUES = {
  nom: 'illiCO travaux Martigues', adresse: '22 RUE RAMADE',
  code_postal: '13500', ville: 'Martigues', telephone: '0659810681',
}
const PARIS = {
  nom: 'illiCO travaux Paris 15', adresse: '24 rue des Volontaires',
  code_postal: '75015', ville: 'Paris', telephone: '01 39 98 00 15',
}

describe('adresse sur une ligne', () => {
  it('assemble rue, code postal et ville', () => {
    expect(adresseUneLigne(MARTIGUES)).toBe('22 RUE RAMADE, 13500 Martigues')
  })
  it('ne laisse pas de virgule orpheline quand un morceau manque', () => {
    // Une agence à moitié remplie ne doit pas produire « , 13500 » ni « 22 RUE RAMADE, ».
    expect(adresseUneLigne({ code_postal: '13500', ville: 'Martigues' })).toBe('13500 Martigues')
    expect(adresseUneLigne({ adresse: '22 RUE RAMADE' })).toBe('22 RUE RAMADE')
    expect(adresseUneLigne({})).toBe('')
    expect(adresseUneLigne(null)).toBe('')
  })
})

describe('téléphone', () => {
  it('met en forme un numéro français collé', () => {
    expect(telephoneLisible('0659810681')).toBe('06 59 81 06 81')
  })
  it('laisse intact ce qu\'il ne sait pas formater — jamais déformer un numéro', () => {
    expect(telephoneLisible('01 39 98 00 15')).toBe('01 39 98 00 15')
    expect(telephoneLisible('+33 6 59 81 06 81')).toBe('+33 6 59 81 06 81')
    expect(telephoneLisible('')).toBe('')
    expect(telephoneLisible(null)).toBe('')
  })
})

describe('signature de l\'agence', () => {
  it('porte le nom, l\'adresse et le téléphone de l\'AGENCE, pas ceux de BATILIS', () => {
    const s = signatureAgence(MARTIGUES)
    expect(s).toContain('illiCO travaux Martigues')
    expect(s).toContain('22 RUE RAMADE, 13500 Martigues')
    expect(s).toContain('06 59 81 06 81')
    expect(s).not.toContain('BATILIS')
  })

  it('distingue deux agences — c\'est tout l\'objet du multi-tenant', () => {
    expect(signatureAgence(PARIS)).toContain('illiCO travaux Paris 15')
    expect(signatureAgence(PARIS)).not.toContain('Martigues')
  })

  it('ne produit RIEN sans agence, plutôt qu\'une signature fantôme', () => {
    // « Cordialement, » suivi du vide est pire que pas de signature du tout.
    expect(signatureAgence(null)).toBe('')
    expect(signatureAgence({})).toBe('')
    expect(signatureAgence({ telephone: '0659810681' })).toBe('')
  })

  it('tient debout sur une agence à moitié renseignée', () => {
    const s = signatureAgence({ nom: 'illiCO travaux Aix' })
    expect(s).toContain('illiCO travaux Aix')
    expect(s).toContain('Cordialement')
  })

  it('échappe le HTML — un nom avec « & » ne doit pas casser le mail', () => {
    expect(signatureAgence({ nom: 'Dupont & Fils <SARL>' })).toContain('Dupont &amp; Fils &lt;SARL&gt;')
    expect(echapper(`a"b'c`)).toBe('a&quot;b&#39;c')
  })

  it('la formule de politesse se retire à la demande', () => {
    expect(signatureAgence(MARTIGUES, { formule: null })).not.toContain('Cordialement')
    expect(signatureAgence(MARTIGUES, { formule: 'Bien à vous,' })).toContain('Bien à vous,')
  })
})

describe('gabarit commun', () => {
  it('garde le contenu et ajoute la signature', () => {
    const html = gabaritEmail({ contenu: '<p>Bonjour,</p>', agence: MARTIGUES })
    expect(html).toContain('<p>Bonjour,</p>')
    expect(html).toContain('illiCO travaux Martigues')
  })
  it('reste un mail valide sans agence connue', () => {
    const html = gabaritEmail({ contenu: '<p>Bonjour,</p>' })
    expect(html).toContain('<p>Bonjour,</p>')
    expect(html).not.toContain('undefined')
    expect(html).not.toContain('null')
  })
  it('n\'embarque aucune image distante — Outlook les bloque', () => {
    expect(gabaritEmail({ contenu: '<p>x</p>', agence: MARTIGUES })).not.toContain('<img')
  })
})

// ── Signature complète : la personne PUIS l'agence ────────────────────────────────────
//
// Les relances signaient déjà avec la référente. Ce qui manquait, c'est l'agence en
// dessous : un client à qui l'on demande un acompte doit pouvoir vérifier à qui il envoie
// son argent, et un numéro de portable seul ne le lui dit pas.
describe('signature complète', () => {
  const REFERENTE = { prenom: 'Anne-Lise', nom: 'Caillet', telephone: '0659810681', email: 'al@exemple.test' }

  it('porte la personne ET son agence', () => {
    const s = signatureComplete({ personne: REFERENTE, agence: MARTIGUES, roleLabel: 'Courtière en travaux' })
    expect(s).toContain('ANNE-LISE CAILLET')
    expect(s).toContain('Courtière en travaux')
    expect(s).toContain('al@exemple.test')
    expect(s).toContain('illiCO travaux Martigues')
    expect(s).toContain('22 RUE RAMADE, 13500 Martigues')
  })

  it('l\'agence prend le relais quand la personne est inconnue', () => {
    // C'était le repli « illiCO travaux » tout court : l'anonymat qu'on supprime.
    const s = signatureComplete({ agence: MARTIGUES })
    expect(s).toContain('illiCO travaux Martigues')
    expect(s).not.toContain('undefined')
  })

  it('la personne suffit quand l\'agence n\'est pas renseignée', () => {
    expect(signatureComplete({ personne: REFERENTE })).toContain('ANNE-LISE CAILLET')
  })

  it('ne signe RIEN plutôt que de signer anonymement', () => {
    // Une signature sans nom n'apprend rien au destinataire et fait perdre confiance.
    expect(signatureComplete({})).toBe('')
    expect(signatureComplete({ personne: {}, agence: {} })).toBe('')
  })

  it('n\'invente pas un rôle qu\'on ne lui a pas donné', () => {
    const s = signatureComplete({ personne: REFERENTE, agence: MARTIGUES })
    expect(s).toContain('ANNE-LISE CAILLET')
    expect(s).not.toContain('undefined')
  })
})
