// Mock data — realistic shapes drawn from the real Supabase schema
// Names are typical for the Martigues / Bouches-du-Rhône area

const AGENTES = [
  { id: 'a1', prenom: 'Marine', nom: 'Castellet', role: 'admin', initials: 'MC', color: '#0094d4' },
  { id: 'a2', prenom: 'Camille', nom: 'Roux', role: 'agente', initials: 'CR', color: '#16a34a' },
  { id: 'a3', prenom: 'Sophie', nom: 'Aubert', role: 'agente', initials: 'SA', color: '#f59e0b' },
];

const TYPOLOGIES = {
  courtage: 'Courtage',
  amo: 'AMO',
  estimo: 'Estimo',
  merad: 'MERAD',
  audit_energetique: 'Audit énergétique',
  studio_jardin: 'Studio de jardin',
};

const STATUT = {
  a_contacter:       { label: 'À contacter',          tone: 'info' },
  a_relancer:        { label: 'À relancer',            tone: 'warn' },
  devis_en_attente:  { label: 'Devis en attente',      tone: 'warn' },
  devis_a_modifier:  { label: 'Devis à modifier',      tone: 'bad' },
  en_cours_chantier: { label: 'En cours de chantier',  tone: 'ok' },
  termine:           { label: 'Terminé',               tone: 'mute' },
  annule:            { label: 'Annulé',                tone: 'mute' },
};

const ARTISANS = [
  { id: 'ar1', entreprise: 'Plomberie Méditerranée',  metier: 'Plomberie',   ville: 'Martigues' },
  { id: 'ar2', entreprise: 'Électricité Marseille Sud',metier: 'Électricité',ville: 'Marseille' },
  { id: 'ar3', entreprise: 'Carrelage Provence',      metier: 'Carrelage',   ville: 'Istres' },
  { id: 'ar4', entreprise: 'Menuiserie Calanque',     metier: 'Menuiserie',  ville: 'Carry-le-Rouet' },
  { id: 'ar5', entreprise: 'Toiture Étang',           metier: 'Couverture',  ville: 'Port-de-Bouc' },
  { id: 'ar6', entreprise: 'Peinture Camargue',       metier: 'Peinture',    ville: 'Fos-sur-Mer' },
  { id: 'ar7', entreprise: 'Maçonnerie du Sud',       metier: 'Maçonnerie',  ville: 'Martigues' },
  { id: 'ar8', entreprise: 'Cuisines Provence',       metier: 'Agencement',  ville: 'Aix-en-Provence' },
];

// Date helpers — days relative to "today" (May 15 2026 in the project)
const today = new Date('2026-05-15');
const d = (offset) => {
  const x = new Date(today);
  x.setDate(x.getDate() + offset);
  return x.toISOString().split('T')[0];
};

const DOSSIERS = [
  {
    id: 'd1', reference: 'M-2026-0184',
    client: { civilite: 'Mme', prenom: 'Catherine', nom: 'Vasseur', adresse: '14 chemin des Salins, 13500 Martigues', tel: '06 12 45 78 90', email: 'c.vasseur@gmail.com' },
    typologie: 'amo',
    referente: AGENTES[0],
    statut_raw: null,
    contrat_signe: true, date_signature_contrat: d(-42),
    date_demarrage_chantier: d(-21), date_fin_chantier: d(28),
    date_limite_devis: d(-15),
    frais_consultation: 1500, frais_statut: 'regle',
    montant_chantier_ttc: 78400,
    description: "Rénovation complète maison de ville — cuisine + salle de bain + peintures",
    surface: 92,
    devis: [
      { id:'dv1', artisan: ARTISANS[0], statut: 'accepte', montant_ttc: 18200, montant_ht: 15166, date_signature: d(-20), commission_pourcentage: 8 },
      { id:'dv2', artisan: ARTISANS[2], statut: 'accepte', montant_ttc: 24600, montant_ht: 20500, date_signature: d(-18), commission_pourcentage: 10 },
      { id:'dv3', artisan: ARTISANS[5], statut: 'accepte', montant_ttc: 12800, montant_ht: 10666, date_signature: d(-12), commission_pourcentage: 8 },
      { id:'dv4', artisan: ARTISANS[1], statut: 'accepte', montant_ttc: 22800, montant_ht: 19000, date_signature: d(-10), commission_pourcentage: 9 },
    ],
    suivi: { acomptes_recus: 3, acomptes_total: 4, factures_payees: 1, factures_total: 4 },
    avancement: 42,
  },
  {
    id: 'd2', reference: 'M-2026-0192',
    client: { civilite: 'M. & Mme', prenom: 'Julien', nom: 'Mercier', prenom2:'Léa', nom2:'Mercier', adresse: '8 av. Frédéric Mistral, 13117 Lavéra', tel: '06 87 23 14 02', email: 'julien.mercier@orange.fr' },
    typologie: 'courtage',
    referente: AGENTES[1],
    contrat_signe: true, date_signature_contrat: d(-7),
    date_limite_devis: d(5),
    frais_consultation: 900, frais_statut: 'regle',
    montant_chantier_ttc: 42800,
    description: "Extension véranda 22 m² + ouverture cuisine sur séjour",
    surface: 22,
    devis: [
      { id:'dv5', artisan: ARTISANS[6], statut: 'accepte', montant_ttc: 28400, montant_ht: 23666, date_signature: d(-3), commission_pourcentage: 8 },
      { id:'dv6', artisan: ARTISANS[3], statut: 'en_attente', montant_ttc: 14400, montant_ht: 12000, commission_pourcentage: 9 },
    ],
    suivi: { acomptes_recus: 0, acomptes_total: 2, factures_payees: 0, factures_total: 2 },
    avancement: 12,
  },
  {
    id: 'd3', reference: 'M-2026-0203',
    client: { civilite: 'Mme', prenom: 'Isabelle', nom: 'Dorian', adresse: '23 rue de la République, 13500 Martigues', tel: '06 45 12 88 04', email: 'i.dorian@laposte.net' },
    typologie: 'amo',
    referente: AGENTES[2],
    contrat_signe: true, date_signature_contrat: d(-2),
    date_limite_devis: d(4),
    frais_consultation: 1200, frais_statut: 'en_attente',
    montant_chantier_ttc: 0,
    description: "Réagencement combles aménagés — 65 m² · chambre parents + suite",
    surface: 65,
    devis: [],
    suivi: { acomptes_recus: 0, acomptes_total: 0, factures_payees: 0, factures_total: 0 },
    avancement: 5,
    has_r2: true,
  },
  {
    id: 'd4', reference: 'M-2026-0167',
    client: { civilite: 'M.', prenom: 'Pascal', nom: 'Boudet', adresse: '5 Allée des Pins, 13500 Saint-Pierre', tel: '06 33 22 11 90', email: 'pascal.b@hotmail.fr' },
    typologie: 'courtage',
    referente: AGENTES[0],
    contrat_signe: true, date_signature_contrat: d(-78),
    date_demarrage_chantier: d(-49), date_fin_chantier: d(-3),
    frais_consultation: 1000, frais_statut: 'regle',
    montant_chantier_ttc: 31200,
    description: "Réfection toiture + isolation combles — maison individuelle",
    surface: 110,
    statut_raw: 'termine',
    devis: [
      { id:'dv7', artisan: ARTISANS[4], statut: 'accepte', montant_ttc: 18900, montant_ht: 15750, date_signature: d(-60), commission_pourcentage: 9 },
      { id:'dv8', artisan: ARTISANS[5], statut: 'accepte', montant_ttc: 12300, montant_ht: 10250, date_signature: d(-55), commission_pourcentage: 7 },
    ],
    suivi: { acomptes_recus: 2, acomptes_total: 2, factures_payees: 2, factures_total: 2 },
    avancement: 100,
  },
  {
    id: 'd5', reference: 'M-2026-0211',
    client: { civilite: 'M. & Mme', prenom: 'Olivier', nom: 'Fournier', prenom2:'Nathalie', nom2:'Fournier', adresse: '2 lot. Les Mimosas, 13620 Carry-le-Rouet', tel: '06 19 04 55 12', email: 'o.fournier@gmail.com' },
    typologie: 'estimo',
    referente: AGENTES[1],
    contrat_signe: false,
    date_limite_devis: d(2),
    frais_consultation: 750, frais_statut: 'en_attente',
    montant_chantier_ttc: 0,
    description: "Estimation rénovation salle de bain — préchiffrage avant achat",
    surface: 8,
    devis: [],
    suivi: { acomptes_recus: 0, acomptes_total: 0, factures_payees: 0, factures_total: 0 },
    avancement: 0,
  },
  {
    id: 'd6', reference: 'M-2026-0156',
    client: { civilite: 'Mme', prenom: 'Hélène', nom: 'Pradel', adresse: '47 bd des Goumiers, 13800 Istres', tel: '06 22 88 14 50', email: 'h.pradel@orange.fr' },
    typologie: 'amo',
    referente: AGENTES[2],
    contrat_signe: true, date_signature_contrat: d(-95),
    date_demarrage_chantier: d(-70),
    date_fin_chantier: d(15),
    frais_consultation: 1500, frais_statut: 'regle',
    montant_chantier_ttc: 124500,
    description: "Rénovation lourde — maison année 80 · 145 m² · plomberie, élec, sols, peintures",
    surface: 145,
    devis: [
      { id:'dv9', artisan: ARTISANS[0], statut: 'accepte', montant_ttc: 31200, montant_ht: 26000, date_signature: d(-65), commission_pourcentage: 8 },
      { id:'dv10', artisan: ARTISANS[1], statut: 'accepte', montant_ttc: 28800, montant_ht: 24000, date_signature: d(-60), commission_pourcentage: 9 },
      { id:'dv11', artisan: ARTISANS[2], statut: 'accepte', montant_ttc: 22500, montant_ht: 18750, date_signature: d(-50), commission_pourcentage: 10 },
      { id:'dv12', artisan: ARTISANS[5], statut: 'accepte', montant_ttc: 15300, montant_ht: 12750, date_signature: d(-40), commission_pourcentage: 8 },
      { id:'dv13', artisan: ARTISANS[7], statut: 'accepte', montant_ttc: 26700, montant_ht: 22250, date_signature: d(-30), commission_pourcentage: 12 },
    ],
    suivi: { acomptes_recus: 5, acomptes_total: 5, factures_payees: 3, factures_total: 5 },
    avancement: 78,
  },
  {
    id: 'd7', reference: 'M-2026-0218',
    client: { civilite: 'M.', prenom: 'Stéphane', nom: 'Lemaire', adresse: '12 rue du Phare, 13230 Port-Saint-Louis', tel: '06 77 14 23 88', email: 'stef.lemaire@free.fr' },
    typologie: 'merad',
    referente: AGENTES[0],
    contrat_signe: false,
    date_limite_devis: d(1),
    frais_consultation: 600, frais_statut: 'en_attente',
    montant_chantier_ttc: 0,
    description: "MERAD — diagnostic accessibilité PMR appartement T3",
    surface: 68,
    devis: [],
    suivi: { acomptes_recus: 0, acomptes_total: 0, factures_payees: 0, factures_total: 0 },
    avancement: 0,
  },
  {
    id: 'd8', reference: 'M-2026-0145',
    client: { civilite: 'M. & Mme', prenom: 'Antoine', nom: 'Sarrazin', prenom2:'Marie', nom2:'Sarrazin', adresse: '6 traverse de la Calanque, 13960 Sausset-les-Pins', tel: '06 88 33 44 22', email: 'a.sarrazin@gmail.com' },
    typologie: 'studio_jardin',
    referente: AGENTES[1],
    contrat_signe: true, date_signature_contrat: d(-110),
    date_demarrage_chantier: d(-80),
    date_fin_chantier: d(-20),
    frais_consultation: 1200, frais_statut: 'regle',
    montant_chantier_ttc: 48900,
    description: "Studio de jardin 25 m² — ossature bois, isolation, double vitrage",
    surface: 25,
    statut_raw: 'termine',
    devis: [
      { id:'dv14', artisan: ARTISANS[3], statut: 'accepte', montant_ttc: 32400, montant_ht: 27000, date_signature: d(-78), commission_pourcentage: 9 },
      { id:'dv15', artisan: ARTISANS[1], statut: 'accepte', montant_ttc: 8200,  montant_ht: 6833,  date_signature: d(-70), commission_pourcentage: 8 },
    ],
    suivi: { acomptes_recus: 2, acomptes_total: 2, factures_payees: 2, factures_total: 2 },
    avancement: 100,
  },
  {
    id: 'd9', reference: 'M-2026-0221',
    client: { civilite: 'Mme', prenom: 'Valérie', nom: 'Anselm', adresse: '34 av. de la Méditerranée, 13270 Fos-sur-Mer', tel: '06 14 22 78 11', email: 'v.anselm@gmail.com' },
    typologie: 'audit_energetique',
    referente: AGENTES[2],
    contrat_signe: true, date_signature_contrat: d(-1),
    date_limite_devis: d(20),
    frais_consultation: 850, frais_statut: 'en_attente',
    montant_chantier_ttc: 0,
    description: "Audit énergétique réglementaire avant rénovation globale",
    surface: 96,
    devis: [],
    suivi: { acomptes_recus: 0, acomptes_total: 0, factures_payees: 0, factures_total: 0 },
    avancement: 2,
  },
  {
    id: 'd10', reference: 'M-2026-0199',
    client: { civilite: 'M.', prenom: 'Renaud', nom: 'Vasseur', adresse: '11 quai Brescon, 13500 Martigues', tel: '06 02 99 04 23', email: 'r.vasseur@gmail.com' },
    typologie: 'courtage',
    referente: AGENTES[1],
    contrat_signe: true, date_signature_contrat: d(-12),
    date_limite_devis: d(-8),
    frais_consultation: 1100, frais_statut: 'regle',
    montant_chantier_ttc: 36800,
    description: "Rénovation salle de bain + WC séparé · 9 m²",
    surface: 9,
    devis: [
      { id:'dv16', artisan: ARTISANS[0], statut: 'refuse', montant_ttc: 18000, montant_ht: 15000, commission_pourcentage: 8 },
      { id:'dv17', artisan: ARTISANS[2], statut: 'accepte', montant_ttc: 17400, montant_ht: 14500, date_signature: d(-4), commission_pourcentage: 10 },
    ],
    suivi: { acomptes_recus: 1, acomptes_total: 1, factures_payees: 0, factures_total: 1 },
    avancement: 22,
    has_r3: true,
  },
  {
    id: 'd11', reference: 'M-2026-0123',
    client: { civilite: 'Mme', prenom: 'Brigitte', nom: 'Coste', adresse: '18 rue Aristide Briand, 13500 Martigues', tel: '06 55 11 22 33', email: 'b.coste@orange.fr' },
    typologie: 'courtage',
    referente: AGENTES[0],
    contrat_signe: false,
    statut_raw: 'annule',
    frais_consultation: 800, frais_statut: 'offerts',
    montant_chantier_ttc: 0,
    description: "Projet annulé — vente du bien",
    surface: 78,
    devis: [],
    suivi: { acomptes_recus: 0, acomptes_total: 0, factures_payees: 0, factures_total: 0 },
    avancement: 0,
  },
  {
    id: 'd12', reference: 'M-2026-0207',
    client: { civilite: 'M. & Mme', prenom: 'Karim', nom: 'Benoît', prenom2:'Sarah', nom2:'Benoît', adresse: '9 av. des Cigales, 13500 Croix-Sainte', tel: '06 80 33 12 44', email: 'k.benoit@gmail.com' },
    typologie: 'amo',
    referente: AGENTES[2],
    contrat_signe: true, date_signature_contrat: d(-25),
    date_demarrage_chantier: d(-3),
    date_fin_chantier: d(60),
    frais_consultation: 1300, frais_statut: 'regle',
    montant_chantier_ttc: 89200,
    description: "Rénovation cuisine + salon + 2 chambres · pose carrelage, peintures, élec",
    surface: 105,
    devis: [
      { id:'dv18', artisan: ARTISANS[1], statut: 'accepte', montant_ttc: 22800, montant_ht: 19000, date_signature: d(-15), commission_pourcentage: 9 },
      { id:'dv19', artisan: ARTISANS[2], statut: 'accepte', montant_ttc: 28400, montant_ht: 23666, date_signature: d(-12), commission_pourcentage: 10 },
      { id:'dv20', artisan: ARTISANS[5], statut: 'accepte', montant_ttc: 14800, montant_ht: 12333, date_signature: d(-8), commission_pourcentage: 8 },
      { id:'dv21', artisan: ARTISANS[7], statut: 'accepte', montant_ttc: 23200, montant_ht: 19333, date_signature: d(-5), commission_pourcentage: 12 },
    ],
    suivi: { acomptes_recus: 2, acomptes_total: 4, factures_payees: 0, factures_total: 4 },
    avancement: 8,
  },
];

// Compute statut by avancement + flags (mirrors lib/dossiers.calcStatut)
function calcStatut(d) {
  if (d.statut_raw === 'annule') return 'annule';
  if (d.statut_raw === 'termine') return 'termine';
  if (d.date_demarrage_chantier) return 'en_cours_chantier';
  if (d.has_r3 || d.devis.some(dv => dv.statut === 'refuse')) return 'devis_a_modifier';
  if (d.has_r2) return 'devis_en_attente';
  if (!d.contrat_signe && (d.frais_consultation ?? 0) > 0 && d.frais_statut !== 'regle' && d.frais_statut !== 'offerts' && d.devis.length === 0) return 'a_relancer';
  return 'a_contacter';
}

// Format
const fmtEur = (n, opts = {}) => {
  const v = Math.round(Number(n) || 0);
  const s = v.toLocaleString('fr-FR');
  return opts.short ? s + ' €' : s + ' €';
};
const fmtMonth = (iso) => {
  if (!iso) return '—';
  const dt = new Date(iso);
  return dt.toLocaleDateString('fr-FR', { day:'2-digit', month:'short' });
};
const fmtDate = (iso) => {
  if (!iso) return '—';
  const dt = new Date(iso);
  return dt.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'2-digit' });
};
const nomClient = (c) => c ? `${c.civilite} ${c.prenom} ${c.nom}${c.prenom2 ? ` & ${c.prenom2} ${c.nom2}` : ''}` : '—';

const villeFromAddr = (a) => {
  if (!a) return '';
  const m = a.match(/\b(\d{5})\s+([^,]+)$/);
  return m ? m[2].trim() : '';
};

// Mensuel — CA réel par mois pour graph
const CA_MENSUEL = [
  { m: 'Jan', reel: 3200, objectif: 7500 },
  { m: 'Fév', reel: 5400, objectif: 7500 },
  { m: 'Mar', reel: 8200, objectif: 7500 },
  { m: 'Avr', reel: 6900, objectif: 7500 },
  { m: 'Mai', reel: 5200, objectif: 7500 }, // mois en cours, partiel
];

// Notifications mock
const NOTIFS = [
  { id:'n1', who:'Camille Roux', what:'a déposé un CR de visite R2', ref:'M-2026-0203', when:'il y a 12 min', icon:'Doc' },
  { id:'n2', who:'illiCO France',  what:'a débloqué l\'acompte artisan', ref:'M-2026-0184', when:'il y a 1h', icon:'Coins' },
  { id:'n3', who:'Mme Vasseur',     what:'a réglé le solde AMO',         ref:'M-2026-0184', when:'il y a 3h', icon:'Euro' },
  { id:'n4', who:'Sophie Aubert',   what:'a créé un nouveau dossier',    ref:'M-2026-0221', when:'hier 17:42', icon:'Folder' },
];

window.DATA = { AGENTES, TYPOLOGIES, STATUT, ARTISANS, DOSSIERS, CA_MENSUEL, NOTIFS, calcStatut, fmtEur, fmtMonth, fmtDate, nomClient, villeFromAddr, today };
