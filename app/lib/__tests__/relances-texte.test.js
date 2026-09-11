import { describe, it, expect } from 'vitest'
import {
  salutationClient, nomClientPourArtisan, libelleRdv, destinatairesRappel,
  prevenirClientParDefaut, heureRdvFR, dateRdvFR, adresseArtisan, mentionReglement,
} from '../relances-texte.js'

// Ces mails partent à des CLIENTS et à des ARTISANS. Une faute s'y voit immédiatement et
// ne se rattrape pas. Tous les cas testés ici ont été constatés sur des mails réellement
// produits (mode ESSAI, 07 et 08/09).

describe('salutation du client', () => {
  it('ne répète pas le patronyme quand les deux conjoints portent le même nom', () => {
    // Le mail parti le 08/09 disait « Bonjour M. et Mme Brunet, Brunet, ».
    expect(salutationClient({ civilite: 'M. et Mme', nom: 'Brunet', nom2: 'Brunet' }))
      .toBe('M. et Mme Brunet')
  })

  it('garde les DEUX noms quand ils diffèrent — c\'est tout l\'intérêt du second titulaire', () => {
    expect(salutationClient({ civilite: 'M. et Mme', nom: 'Guerteau', nom2: 'Eppinger' }))
      .toBe('M. et Mme Guerteau, Eppinger')
  })

  it('ne se laisse pas piéger par la casse ni les espaces de saisie', () => {
    expect(salutationClient({ civilite: 'M. et Mme', nom: 'Brunet', nom2: ' BRUNET ' }))
      .toBe('M. et Mme Brunet')
  })

  it('fonctionne avec un seul titulaire', () => {
    expect(salutationClient({ civilite: 'M.', nom: 'Chambonnière' })).toBe('M. Chambonnière')
  })

  it('ne rend JAMAIS une salutation vide — « Bonjour , » serait pire que tout', () => {
    expect(salutationClient({})).toBe('Madame, Monsieur')
    expect(salutationClient(null)).toBe('Madame, Monsieur')
    expect(salutationClient({ nom: '   ' })).toBe('Madame, Monsieur')
  })
})

describe('intitulé du rendez-vous', () => {
  it('n\'imprime JAMAIS la valeur brute de la colonne', () => {
    // « Nous vous rappelons votre rendez-vous visite_technique_artisan prévu » — parti tel
    // quel au client le 08/09, soulignés compris.
    for (const type of ['visite_technique_client', 'visite_technique_artisan',
      'presentation_devis', 'etude', 'suivi', 'reception']) {
      const l = libelleRdv({ type_rdv: type }, 'client')
      expect(l).toBeTruthy()
      expect(l).not.toContain('_')
    }
  })

  it('nomme l\'ENTREPRISE qui vient chez le client', () => {
    // « Visite technique avec l'artisan » ne dit pas au client s'il ouvre au plombier
    // ou au maçon.
    expect(libelleRdv({ type_rdv: 'visite_technique_artisan' }, 'client', 'MJ RENOVATION'))
      .toBe('Visite technique avec MJ RENOVATION')
  })

  it('reste lisible quand l\'entreprise manque, sans « avec  » bancal', () => {
    expect(libelleRdv({ type_rdv: 'visite_technique_artisan' }, 'client', null))
      .toBe('Visite technique avec l\'artisan')
    expect(libelleRdv({ type_rdv: 'visite_technique_artisan' }, 'client', '   '))
      .toBe('Visite technique avec l\'artisan')
  })

  it('sur une visite technique CLIENT aussi, on nomme qui vient', () => {
    // R1 comme R2 : le client sait qui sonne, l'artisan sait chez qui il va.
    expect(libelleRdv({ type_rdv: 'visite_technique_client' }, 'client', 'D2M'))
      .toBe('Visite technique avec D2M')
  })

  it('ne dit rien plutôt que « autres » — 92 % des rendez-vous portent ce type', () => {
    expect(libelleRdv({ type_rdv: 'autres' }, 'client')).toBe(null)
  })

  it('utilise le titre saisi quand il y en a un', () => {
    expect(libelleRdv({ type_rdv: 'autres', titre: 'JADRAS Moustapha et Gaëtan' }, 'artisan'))
      .toBe('JADRAS Moustapha et Gaëtan')
  })

  it('ne dit rien sur un type inconnu, plutôt que de l\'imprimer', () => {
    // La régression à empêcher : ajouter un type en base et le voir sortir brut en mail.
    expect(libelleRdv({ type_rdv: 'type_ajoute_demain' }, 'client')).toBe(null)
    expect(libelleRdv({}, 'client')).toBe(null)
    expect(libelleRdv(null, 'client')).toBe(null)
  })

  it('n\'emploie pas le jargon interne R1 / R2 dans un mail client', () => {
    for (const type of ['visite_technique_client', 'visite_technique_artisan']) {
      expect(libelleRdv({ type_rdv: type }, 'client')).not.toMatch(/\bR[12]\b/)
    }
  })
})

// ── Qui reçoit le rappel ────────────────────────────────────────────────────
//
// Règle RÉVISÉE le 11/09 : `prevenir_client` répond à « le client VIENT », pas à « faut-il
// lui écrire ». Il est informé dans les deux cas ; c'est le TEXTE qui change. Avant, un
// rendez-vous non coché ne lui disait rien et il découvrait des intervenants chez lui.
describe('destinataires du rappel', () => {
  it('le client est TOUJOURS informé, quel que soit le type', () => {
    for (const type of ['visite_technique_client', 'presentation_devis', 'etude', 'reception',
      'visite_technique_artisan', 'suivi', 'autres', 'type_inconnu']) {
      expect(destinatairesRappel({ type_rdv: type }).client).toBe(true)
    }
  })

  it('sa PRÉSENCE, elle, suit le type par défaut', () => {
    for (const type of ['visite_technique_client', 'presentation_devis', 'etude', 'reception']) {
      expect(destinatairesRappel({ type_rdv: type }).clientPresent).toBe(true)
    }
    for (const type of ['visite_technique_artisan', 'suivi', 'autres']) {
      expect(destinatairesRappel({ type_rdv: type }).clientPresent).toBe(false)
    }
  })

  // « Des fois on peut l'attendre pour les rdv » — le type ne peut pas décider seul.
  it('le choix explicite de l\'agente PRIME sur le défaut du type', () => {
    expect(destinatairesRappel({ type_rdv: 'visite_technique_artisan', prevenir_client: true }).clientPresent).toBe(true)
    expect(destinatairesRappel({ type_rdv: 'suivi', prevenir_client: true }).clientPresent).toBe(true)
    expect(destinatairesRappel({ type_rdv: 'autres', prevenir_client: true }).clientPresent).toBe(true)
    expect(destinatairesRappel({ type_rdv: 'reception', prevenir_client: false }).clientPresent).toBe(false)
  })

  it('décoché, le client reste informé — il est juste dispensé de venir', () => {
    // C'est tout l'objet de l'arbitrage du 11/09 : ne plus confondre « pas attendu » et
    // « pas au courant ».
    const d = destinatairesRappel({ type_rdv: 'suivi', prevenir_client: false })
    expect(d.client).toBe(true)
    expect(d.clientPresent).toBe(false)
  })

  it('NULL veut dire « rien de décidé », pas « non »', () => {
    // La distinction porte toute la migration : une colonne NOT NULL DEFAULT false
    // aurait figé la règle métier dans 2 000 lignes de base.
    expect(destinatairesRappel({ type_rdv: 'reception', prevenir_client: null }).clientPresent).toBe(true)
    expect(destinatairesRappel({ type_rdv: 'reception', prevenir_client: undefined }).clientPresent).toBe(true)
  })

  it('prévient l\'artisan de TOUT rendez-vous, `autres` compris', () => {
    for (const type of ['autres', 'suivi', 'visite_technique_artisan',
      'visite_technique_client', 'reception', 'type_inconnu']) {
      expect(destinatairesRappel({ type_rdv: type }).artisan).toBe(true)
    }
  })

  it('un type inconnu n\'attend PAS le client par défaut', () => {
    // Le sens a changé le 11/09 : le client est informé de tout, mais un type qu'on ne
    // connaît pas ne peut pas affirmer qu'il doit se déplacer. Le défaut prudent est
    // « pas attendu », qu'un clic corrige.
    expect(destinatairesRappel({ type_rdv: 'type_ajoute_demain' }).clientPresent).toBe(false)
    expect(destinatairesRappel({}).clientPresent).toBe(false)
  })

  it('donne le défaut à cocher dans le formulaire', () => {
    expect(prevenirClientParDefaut('visite_technique_client')).toBe(true)
    expect(prevenirClientParDefaut('suivi')).toBe(false)
  })
})

describe('nom du client montré à l\'artisan', () => {
  it('dit à l\'artisan chez QUI il se déplace', () => {
    expect(nomClientPourArtisan({ civilite: 'M. et Mme', nom: 'Brunet', nom2: 'Brunet' }))
      .toBe('M. et Mme Brunet')
  })

  it('ne se rabat PAS sur « Madame, Monsieur » — ce serait ridicule dans un intitulé', () => {
    // « Visite technique avec Madame, Monsieur » : mieux vaut ne rien mettre.
    expect(nomClientPourArtisan({})).toBe(null)
    expect(nomClientPourArtisan(null)).toBe(null)
    expect(nomClientPourArtisan({ civilite: 'M. et Mme' })).toBe(null)
  })

  it('compose l\'intitulé du mail artisan avec le nom du client', () => {
    const nom = nomClientPourArtisan({ civilite: 'M.', nom: 'Jadras' })
    // « chez », pas « avec » : l'artisan se DÉPLACE chez le client.
    expect(libelleRdv({ type_rdv: 'visite_technique_artisan' }, 'artisan', nom))
      .toBe('Visite technique chez M. Jadras')
  })

  it('reste correct quand le client n\'a pas de nom exploitable', () => {
    expect(libelleRdv({ type_rdv: 'visite_technique_artisan' }, 'artisan', null))
      .toBe('Visite technique')
  })
})

// ── L'heure ─────────────────────────────────────────────────────────────────
//
// Le défaut le plus grave des cinq : les rappels annonçaient 07:00 pour un rendez-vous
// de 09:00. `date_heure` est un timestamptz renvoyé en UTC, et `toLocaleTimeString`
// sans fuseau utilise celui de la machine — Vercel tourne en UTC.
//
// ⚠️ Ces tests DOIVENT passer quel que soit le fuseau de la machine qui les exécute :
// c'est précisément parce que le poste de développement est réglé sur Paris que le bug
// est resté invisible jusqu'à ce qu'un mail parte.
describe('heure du rendez-vous', () => {
  it('affiche l\'heure de PARIS, pas celle du serveur (heure d\'été : +2)', () => {
    // Le rendez-vous BRUNET du 09/09 : stocké 07:00 UTC, annoncé 07:00 au lieu de 09:00.
    expect(heureRdvFR('2026-09-09T07:00:00+00:00')).toBe('09:00')
  })

  it('gère l\'heure d\'HIVER (+1), pas seulement l\'été', () => {
    // Un décalage codé en dur à +2 casserait fin octobre. Il n'y en a pas.
    expect(heureRdvFR('2026-01-15T07:00:00+00:00')).toBe('08:00')
  })

  it('donne le bon JOUR quand le fuseau fait changer de date', () => {
    // 23:30 UTC le 8 = 01:30 le 9 à Paris. Le rappel doit dire le 9.
    expect(dateRdvFR('2026-09-08T23:30:00+00:00')).toContain('9 septembre')
    expect(heureRdvFR('2026-09-08T23:30:00+00:00')).toBe('01:30')
  })

  it('écrit la date en toutes lettres, avec le jour de la semaine', () => {
    expect(dateRdvFR('2026-09-09T07:00:00+00:00')).toBe('mercredi 9 septembre 2026')
  })

  it('ne produit pas « Invalid Date » sur une valeur absente', () => {
    expect(heureRdvFR(null)).toBe('')
    expect(dateRdvFR(undefined)).toBe('')
  })
})

describe('adresse a un artisan', () => {
  it('civilite + NOM, sans le prenom', () => {
    // « Bonjour M. MARCHAND » : on ecrit a un partenaire professionnel.
    expect(adresseArtisan({ civilite: 'M.', prenom: 'Julien', nom: 'Marchand', entreprise: 'LS TRAVAUX' }))
      .toBe('M. MARCHAND')
    expect(adresseArtisan({ civilite: 'Mme', nom: 'Dupont' })).toBe('Mme DUPONT')
  })

  it('se rabat sur le nom quand la civilite manque', () => {
    // 41 artisans sont en base sans civilite : le mail doit rester correct.
    expect(adresseArtisan({ prenom: 'Julien', nom: 'Marchand', entreprise: 'LS TRAVAUX' })).toBe('MARCHAND')
  })

  it('se rabat sur l\'entreprise quand aucun contact n\'est nomme', () => {
    expect(adresseArtisan({ entreprise: 'LS TRAVAUX' })).toBe('LS TRAVAUX')
  })

  it('renvoie null plutot que de produire « Bonjour , »', () => {
    expect(adresseArtisan({})).toBe(null)
    expect(adresseArtisan(null)).toBe(null)
  })

  it('ne DEDUIT jamais la civilite du prenom', () => {
    // L'automatisme se trompe sur un prenom mixte ou etranger, dans un mail signe de
    // l'agence. Mieux vaut « MARCHAND » qu'un « Mme » adresse a un homme.
    expect(adresseArtisan({ prenom: 'Dominique', nom: 'Martin' })).toBe('MARTIN')
  })
})

// ── Où régler : la phrase suit la pièce jointe ────────────────────────────────────────
//
// Le défaut du 11/09 : le texte promettait « le RIB joint à ce message » et rien n'était
// joint. Ces tests figent la règle — on n'annonce jamais une pièce qu'on n'envoie pas.
describe('mention de règlement', () => {
  it('annonce le RIB SEULEMENT quand il part vraiment', () => {
    expect(mentionReglement(true, 'LS TRAVAUX')).toBe('sur le RIB de LS TRAVAUX joint à ce message')
  })

  it('sans RIB joint, ne promet RIEN et renvoie à la facture', () => {
    const phrase = mentionReglement(false, 'ALPILLES GENIE CLIMATIQUE')
    expect(phrase).not.toMatch(/joint/)
    expect(phrase).toBe('aux coordonnées bancaires figurant sur la facture de ALPILLES GENIE CLIMATIQUE')
  })

  it('tient debout sans nom de bénéficiaire', () => {
    expect(mentionReglement(true, '')).toBe('sur le RIB joint à ce message')
    expect(mentionReglement(false, null)).toBe('aux coordonnées bancaires figurant sur la facture')
    expect(mentionReglement(false, '   ')).not.toMatch(/undefined|null/)
  })

  it('sert aussi bien un artisan qu\'une société', () => {
    expect(mentionReglement(true, 'CONSEIL TRAVAUX PROVENCE - CTP'))
      .toContain('CONSEIL TRAVAUX PROVENCE - CTP')
  })
})
