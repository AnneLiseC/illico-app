// app/lib/stats.js

export const MOIS_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

export const TYPOLOGIE_LABELS = {
  courtage: 'Courtage',
  amo: 'AMO',
  estimo: 'Estimo',
  audit_energetique: 'Audit énergétique',
  studio_jardin: 'Studio de jardin',
}

export const TYPOLOGIE_COLORS = {
  courtage: '#2563EB',
  amo: '#7C3AED',
  estimo: '#059669',
  audit_energetique: '#D97706',
  studio_jardin: '#DB2777',
}

export const USER_COLORS = [
  { bg: '#F3E8FF', border: '#D8B4FE', text: '#7C3AED', dot: '#9333EA' }, // admin
  { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8', dot: '#2563EB' },
  { bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D', dot: '#16A34A' },
  { bg: '#FFF7ED', border: '#FED7AA', text: '#C2410C', dot: '#EA580C' },
]

export function formatEuro(n) {
  const num = Math.round(n || 0)
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €'
}

export function getDossiersVisibles(dossiers, profile) {
  const isAdmin = profile?.role === 'admin'
  if (isAdmin) return dossiers
  return dossiers.filter(d => d.referente?.id === profile?.id)
}

export function filterDossiersByYear(dossiers, anneeFiltre) {
  return dossiers.filter(d => {
    if (anneeFiltre === 'tous') return true
    const date = d.date_signature_contrat || d.created_at
    if (!date) return false
    return new Date(date).getFullYear() === parseInt(anneeFiltre, 10)
  })
}

export function getAnneesDisponibles(dossiers) {
  return [
    ...new Set(
      dossiers
        .map(d => {
          const date = d.date_signature_contrat || d.created_at
          return date ? new Date(date).getFullYear() : null
        })
        .filter(Boolean)
    ),
  ].sort((a, b) => b - a)
}

export function calculerDossierStats(dossier) {
  const estChantierMarine = dossier.referente?.role === 'admin'

  const devisActifs = (dossier.devis_artisans || []).filter(dv => dv.statut !== 'refuse')
  const devisSignes = devisActifs.filter(dv => dv.statut === 'accepte' && dv.date_signature)

  let comHT = 0
  let comTTC = 0
  let royaltiesCom = 0
  let net = 0
  let partAgente = 0
  let partAdmin = 0

  devisActifs.forEach(dv => {
    const montantHT = dv.montant_ht || 0
    const commissionPct = dv.commission_pourcentage || 0
    const partAgentePct = dv.part_agente || 0.5

    const cHT = montantHT * commissionPct
    const cTTC = cHT * 1.2
    const roy = cHT * 0.05 * 1.2
    const n = cTTC - roy

    comHT += cHT
    comTTC += cTTC
    royaltiesCom += roy
    net += n

    if (estChantierMarine) {
      partAdmin += n
    } else {
      partAgente += n * partAgentePct
      partAdmin += n * (1 - partAgentePct)
    }
  })

  const totalHT = devisActifs.reduce((sum, dv) => sum + (dv.montant_ht || 0), 0)
  const totalTTCSignes = devisSignes.reduce((sum, dv) => sum + (dv.montant_ttc || 0), 0)

  const honorairesCourtage =
    ['courtage', 'amo'].includes(dossier.typologie) ? totalTTCSignes * 0.06 : 0

  const honorairesAMO =
    dossier.typologie === 'amo'
      ? totalTTCSignes * ((dossier.honoraires_amo_taux || 9) / 100)
      : 0

  const honorairesTTC = honorairesCourtage + honorairesAMO
  const royaltiesHonoraires = honorairesTTC * 0.05 * 1.2

  const fraisTTC = parseFloat(dossier.frais_consultation || 0)
  const fraisRoyalties = (fraisTTC / 1.2) * 0.05 * 1.2

  const sommeRoyalties = royaltiesCom + fraisRoyalties + royaltiesHonoraires
  const totalEncaissement = fraisTTC + honorairesTTC + comTTC - sommeRoyalties

  return {
    estChantierMarine,
    totalHT,
    comHT,
    comTTC,
    royaltiesCom,
    net,
    partAgente,
    partAdmin,
    honorairesTTC,
    fraisTTC,
    sommeRoyalties,
    totalEncaissement,
    nbDevis: devisActifs.length,
    nbDevisSignes: devisSignes.length,
  }
}

export function enrichDossiersWithStats(dossiers) {
  return dossiers.map(d => ({
    ...d,
    _calc: calculerDossierStats(d),
  }))
}

export function buildGlobalStats(stats) {
  const totalCA = stats.reduce((s, d) => s + d._calc.totalHT, 0)
  const totalComHT = stats.reduce((s, d) => s + d._calc.comHT, 0)
  const totalComTTC = stats.reduce((s, d) => s + d._calc.comTTC, 0)
  const totalHonoraires = stats.reduce((s, d) => s + d._calc.honorairesTTC, 0)
  const totalFrais = stats.reduce((s, d) => s + d._calc.fraisTTC, 0)
  const totalRoyalties = stats.reduce((s, d) => s + d._calc.sommeRoyalties, 0)
  const totalNet = stats.reduce((s, d) => s + d._calc.totalEncaissement, 0)
  const totalPartAgente = stats.reduce((s, d) => s + d._calc.partAgente, 0)
  const totalPartAdmin = stats.reduce((s, d) => s + d._calc.partAdmin, 0)

  const parStatut = {
    en_cours: stats.filter(d => d.statut === 'en_cours').length,
    en_attente: stats.filter(d => d.statut === 'en_attente').length,
    termine: stats.filter(d => d.statut === 'termine').length,
    annule: stats.filter(d => d.statut === 'annule').length,
  }

  const caParMois = Array(12).fill(0)
  stats.forEach(d => {
    const date = d.date_signature_contrat || d.created_at
    if (!date) return
    caParMois[new Date(date).getMonth()] += d._calc.totalHT
  })

  return {
    totalCA,
    totalComHT,
    totalComTTC,
    totalHonoraires,
    totalFrais,
    totalRoyalties,
    totalNet,
    totalPartAgente,
    totalPartAdmin,
    parStatut,
    caParMois,
    maxMois: Math.max(...caParMois, 1),
    totalDossiers: stats.length || 1,
  }
}

export function buildTopArtisans(stats) {
  const artisansMap = {}

  stats.forEach(d => {
    ;(d.devis_artisans || [])
      .filter(dv => dv.statut !== 'refuse')
      .forEach(dv => {
        const id = dv.artisan?.id
        if (!id) return

        if (!artisansMap[id]) {
          artisansMap[id] = {
            id,
            entreprise: dv.artisan?.entreprise,
            metier: dv.artisan?.metier,
            volumeHT: 0,
            comHT: 0,
            nbDevis: 0,
            nbDevisSignes: 0,
            chantiers: new Set(),
          }
        }

        artisansMap[id].volumeHT += dv.montant_ht || 0
        artisansMap[id].comHT += (dv.montant_ht || 0) * (dv.commission_pourcentage || 0)
        artisansMap[id].nbDevis += 1
        if (dv.statut === 'accepte') artisansMap[id].nbDevisSignes += 1
        artisansMap[id].chantiers.add(d.id)
      })
  })

  const topArtisans = Object.values(artisansMap)
    .map(a => ({
      ...a,
      nbChantiers: a.chantiers.size,
    }))
    .sort((a, b) => b.volumeHT - a.volumeHT)
    .slice(0, 15)

  return {
    topArtisans,
    maxArtisanVolume: topArtisans[0]?.volumeHT || 1,
  }
}

export function buildTopClients(stats) {
  const clientsMap = {}

  stats.forEach(d => {
    const id = d.client?.id
    if (!id) return

    if (!clientsMap[id]) {
      clientsMap[id] = {
        id,
        prenom: d.client?.prenom,
        nom: d.client?.nom,
        caHT: 0,
        comHT: 0,
        nbDossiers: 0,
        typologies: new Set(),
      }
    }

    clientsMap[id].caHT += d._calc.totalHT
    clientsMap[id].comHT += d._calc.comHT
    clientsMap[id].nbDossiers += 1
    clientsMap[id].typologies.add(d.typologie)
  })

  const topClients = Object.values(clientsMap)
    .map(c => ({
      ...c,
      typologies: [...c.typologies],
    }))
    .sort((a, b) => b.caHT - a.caHT)
    .slice(0, 15)

  return {
    topClients,
    maxClientCA: topClients[0]?.caHT || 1,
  }
}

export function buildTypologieStats(stats) {
  const typologiesMap = {}

  stats.forEach(d => {
    const t = d.typologie

    if (!typologiesMap[t]) {
      typologiesMap[t] = {
        label: TYPOLOGIE_LABELS[t] || t,
        color: TYPOLOGIE_COLORS[t] || '#6B7280',
        nbDossiers: 0,
        caHT: 0,
        comHT: 0,
      }
    }

    typologiesMap[t].nbDossiers += 1
    typologiesMap[t].caHT += d._calc.totalHT
    typologiesMap[t].comHT += d._calc.comHT
  })

  return Object.entries(typologiesMap).sort((a, b) => b[1].nbDossiers - a[1].nbDossiers)
}

export function buildStatsParUtilisatrice(dossiersFiltres, utilisatrices) {
  const statsParUtilisatrice = utilisatrices.map((u, idx) => {
    const dossiersU = dossiersFiltres.filter(d => d.referente?.id === u.id)
    const statsU = enrichDossiersWithStats(dossiersU)
    const isAdmin = u.role === 'admin'

    const caHT = statsU.reduce((s, d) => s + d._calc.totalHT, 0)
    const comHT = statsU.reduce((s, d) => s + d._calc.comHT, 0)
    const honoraires = statsU.reduce((s, d) => s + d._calc.honorairesTTC, 0)
    const frais = statsU.reduce((s, d) => s + d._calc.fraisTTC, 0)
    const gains = statsU.reduce(
      (s, d) => s + (isAdmin ? d._calc.partAdmin : d._calc.partAgente),
      0
    )

    const caParMois = Array(12).fill(0)
    statsU.forEach(d => {
      const date = d.date_signature_contrat || d.created_at
      if (!date) return
      caParMois[new Date(date).getMonth()] += d._calc.totalHT
    })

    return {
      user: u,
      color: USER_COLORS[idx % USER_COLORS.length],
      nbDossiers: dossiersU.length,
      caHT,
      comHT,
      honoraires,
      frais,
      gains,
      caParMois,
    }
  })

  return {
    statsParUtilisatrice,
    maxMoisU: Math.max(...statsParUtilisatrice.flatMap(u => u.caParMois), 1),
  }
}

export function getStatTabs(isAdmin) {
  return [
    { key: 'agence', label: 'Agence globale' },
    ...(isAdmin ? [{ key: 'utilisatrices', label: 'Par utilisatrice' }] : []),
    { key: 'artisans', label: 'Par artisan' },
    { key: 'clients', label: 'Par client' },
    { key: 'typologies', label: 'Par typologie' },
  ]
}