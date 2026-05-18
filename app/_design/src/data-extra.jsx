// Extra mock data — comptes-rendus, photos, RDV, factures, redevances, factures agente, objectifs.
// Layered on top of DATA from data.jsx.

(function () {
  const D = window.DATA;
  const today = D.today;
  const d = (offset) => {
    const x = new Date(today);
    x.setDate(x.getDate() + offset);
    return x.toISOString().split('T')[0];
  };

  // ─── Photos par catégorie (par dossier) ─────────────────────────────
  // Pas de vraies images : on stocke des "placeholders" + métadonnées.
  const PHOTOS = {
    d1: [
      { id:'p1',  categorie:'avant',   uploaded:d(-40), tag:'Cuisine existante' },
      { id:'p2',  categorie:'avant',   uploaded:d(-40), tag:'SDB existante' },
      { id:'p3',  categorie:'avant',   uploaded:d(-40), tag:'Séjour' },
      { id:'p4',  categorie:'maquette',uploaded:d(-30), tag:'Plan cuisine' },
      { id:'p5',  categorie:'maquette',uploaded:d(-30), tag:'Plan SDB' },
      { id:'p6',  categorie:'pendant', uploaded:d(-14), tag:'Démolition cloison' },
      { id:'p7',  categorie:'pendant', uploaded:d(-7),  tag:'Plomberie en cours' },
      { id:'p8',  categorie:'pendant', uploaded:d(-3),  tag:'Carrelage SDB' },
    ],
    d6: [
      { id:'p9',  categorie:'avant',   uploaded:d(-90), tag:'Façade' },
      { id:'p10', categorie:'maquette',uploaded:d(-80), tag:'Plan masse' },
      { id:'p11', categorie:'pendant', uploaded:d(-50), tag:'Élec en cours' },
      { id:'p12', categorie:'pendant', uploaded:d(-30), tag:'Cloisons' },
      { id:'p13', categorie:'pendant', uploaded:d(-10), tag:'Finitions' },
    ],
  };

  // ─── Comptes-rendus (R1 / R2 / R3 / suivi / réception) ──────────────
  const COMPTES_RENDUS = {
    d1: [
      { id:'cr1', type:'r1', date:d(-50), auteur:'Marine Castellet', titre:'R1 — Visite client',
        contenu:'Visite initiale chez Mme Vasseur. Souhaite refaire cuisine + SDB en gardant le séjour. Budget évoqué autour de 80 k€ TTC.' },
      { id:'cr2', type:'r2', date:d(-35), auteur:'Marine Castellet', titre:'R2 — Visite avec plombier',
        contenu:'Rencontre avec Plomberie Méditerranée. Évacuation OK, refaire l\'eau chaude. Pose nouvelle douche italienne en SDB.' },
      { id:'cr3', type:'r3', date:d(-22), auteur:'Marine Castellet', titre:'R3 — Présentation devis',
        contenu:'Présentation des 4 devis : plomberie, carrelage, peinture, élec. Total : 78 400 € TTC. Client signe.' },
      { id:'cr4', type:'suivi', date:d(-10), auteur:'Marine Castellet', titre:'Visite chantier — semaine 18',
        contenu:'Démolition terminée. Plomberie en cours de pose. Léger retard sur carrelage (livraison fournisseur).', valide:true },
    ],
    d3: [
      { id:'cr5', type:'r1', date:d(-12), auteur:'Sophie Aubert', titre:'R1 — Mme Dorian',
        contenu:'Premier RDV. Aménagement combles, espace parents 65 m². Beaucoup de demandes sur l\'isolation.' },
      { id:'cr6', type:'r2', date:d(-2), auteur:'Sophie Aubert', titre:'R2 — Charpentier',
        contenu:'Évaluation structure : OK pour aménagement, prévoir renforts. Faire intervenir un électricien.' },
    ],
  };

  // ─── RDV liés au dossier ────────────────────────────────────────────
  const RDV_DOSSIER = {
    d1: [
      { id:'r1',  type:'r1', date_heure:d(-50)+'T10:00', duree:90, artisan:null, notes:'Premier contact' },
      { id:'r2',  type:'r2', date_heure:d(-35)+'T14:30', duree:120, artisan: D.ARTISANS[0], notes:'Visite plomberie' },
      { id:'r3',  type:'r3', date_heure:d(-22)+'T16:00', duree:60, artisan:null, notes:'Présentation devis' },
      { id:'r4',  type:'suivi', date_heure:d(7)+'T11:00', duree:60, artisan:null, notes:'Point chantier' },
    ],
    d3: [
      { id:'r5', type:'r2', date_heure:d(0)+'T09:30', duree:90, artisan:null, notes:'R2 combles' },
    ],
  };

  // ─── Interventions artisans planifiées ──────────────────────────────
  const INTERVENTIONS = {
    d1: [
      { id:'i1', artisan: D.ARTISANS[0], type:'periode', debut:d(-15), fin:d(-8), notes:'Pose plomberie' },
      { id:'i2', artisan: D.ARTISANS[2], type:'periode', debut:d(-7), fin:d(2), notes:'Carrelage SDB + cuisine' },
      { id:'i3', artisan: D.ARTISANS[1], type:'jours',   jours:[d(3), d(5), d(7)], notes:'Élec — passage par jour' },
      { id:'i4', artisan: D.ARTISANS[5], type:'periode', debut:d(10), fin:d(20), notes:'Peintures finales' },
    ],
  };

  // ─── Factures artisans (par devis) ──────────────────────────────────
  const FACTURES_ARTISAN = {
    d1: [
      { id:'fa1', devis_id:'dv1', artisan: D.ARTISANS[0], libelle:'Acompte 30%', montant_ttc:5460, date:d(-19), statut:'paye' },
      { id:'fa2', devis_id:'dv2', artisan: D.ARTISANS[2], libelle:'Acompte 30%', montant_ttc:7380, date:d(-17), statut:'paye' },
      { id:'fa3', devis_id:'dv3', artisan: D.ARTISANS[5], libelle:'Acompte 30%', montant_ttc:3840, date:d(-11), statut:'paye' },
      { id:'fa4', devis_id:'dv4', artisan: D.ARTISANS[1], libelle:'Acompte 30%', montant_ttc:6840, date:d(-9),  statut:'en_attente' },
      { id:'fa5', devis_id:'dv1', artisan: D.ARTISANS[0], libelle:'Solde',       montant_ttc:12740,date:null,    statut:'a_emettre' },
    ],
  };

  // ─── Documents joints au chantier ───────────────────────────────────
  const DOCUMENTS = {
    d1: [
      { id:'doc1', nom:'Contrat illiCO signé.pdf',           type:'contrat', ko:842,  date:d(-42) },
      { id:'doc2', nom:'Devis Plomberie Méditerranée.pdf',   type:'devis',   ko:412,  date:d(-22) },
      { id:'doc3', nom:'Devis Carrelage Provence.pdf',       type:'devis',   ko:386,  date:d(-22) },
      { id:'doc4', nom:'Plan SDB v3.pdf',                     type:'plan',    ko:1240, date:d(-30) },
      { id:'doc5', nom:'Photos avant — archive.zip',          type:'archive', ko:18400,date:d(-40) },
    ],
  };

  // ─── Suivi financier (par dossier × type d'échéance) ────────────────
  // Statuts: statut_client = en_attente | regle | retire ; statut_illico = en_attente | recu
  const SUIVI_FIN = {
    d1: [
      { type:'frais_consultation', statut_client:'regle', date:d(-40) },
      { type:'acompte_artisan', artisan_id:'ar1', statut_client:'regle', statut_illico:'recu', date:d(-20) },
      { type:'acompte_artisan', artisan_id:'ar3', statut_client:'regle', statut_illico:'recu', date:d(-18) },
      { type:'acompte_artisan', artisan_id:'ar6', statut_client:'regle', statut_illico:'recu', date:d(-10) },
      { type:'acompte_artisan', artisan_id:'ar2', statut_client:'regle', statut_illico:'en_attente', date:d(-8) },
      { type:'honoraires_courtage', statut_client:'en_attente' },
      { type:'solde_amo', statut_client:'en_attente' },
    ],
  };

  // ─── Factures agente F1/F2 ──────────────────────────────────────────
  // F1 = agente facture la franchisée pour ses gains du mois
  // F2 = franchisée facture l'agente pour la redevance + apporteur remboursé
  const FACTURES_AGENTE = [
    { id:'fag1', agente:'a2', mois:3,  annee:2026, type:'agente_vers_ctp', montant:2840, statut:'paye',     fichier:'cr-mars.pdf' },
    { id:'fag2', agente:'a2', mois:3,  annee:2026, type:'ctp_vers_agente', montant:540,  statut:'paye',     fichier:'red-mars.pdf' },
    { id:'fag3', agente:'a2', mois:4,  annee:2026, type:'agente_vers_ctp', montant:3120, statut:'paye',     fichier:'cr-avril.pdf' },
    { id:'fag4', agente:'a2', mois:4,  annee:2026, type:'ctp_vers_agente', montant:540,  statut:'paye',     fichier:'red-avril.pdf' },
    { id:'fag5', agente:'a2', mois:5,  annee:2026, type:'agente_vers_ctp', montant:1860, statut:'a_facturer', fichier:null },
    { id:'fag6', agente:'a2', mois:5,  annee:2026, type:'ctp_vers_agente', montant:540,  statut:'facture',    fichier:'red-mai.pdf' },
    { id:'fag7', agente:'a3', mois:3,  annee:2026, type:'agente_vers_ctp', montant:1980, statut:'paye',     fichier:null },
    { id:'fag8', agente:'a3', mois:4,  annee:2026, type:'agente_vers_ctp', montant:2240, statut:'a_facturer', fichier:null },
  ];

  // ─── Redevances (540€ / mois / agente) ──────────────────────────────
  const REDEVANCES = [
    { id:'rd1', agente:'a2', mois:3, annee:2026, montant_ttc:540, statut:'regle',      date_paiement:d(-44) },
    { id:'rd2', agente:'a2', mois:4, annee:2026, montant_ttc:540, statut:'regle',      date_paiement:d(-14) },
    { id:'rd3', agente:'a2', mois:5, annee:2026, montant_ttc:540, statut:'en_attente', date_paiement:null },
    { id:'rd4', agente:'a3', mois:3, annee:2026, montant_ttc:540, statut:'regle',      date_paiement:d(-44) },
    { id:'rd5', agente:'a3', mois:4, annee:2026, montant_ttc:540, statut:'regle',      date_paiement:d(-14) },
  ];

  // ─── Objectifs CA (annuel) ──────────────────────────────────────────
  const OBJECTIFS = [
    { cible:'agence', agente_id:null, annee:2026, montant:145000 },
    { cible:'agente', agente_id:'a2', annee:2026, montant:38000 },
    { cible:'agente', agente_id:'a3', annee:2026, montant:32000 },
  ];

  // ─── Notifications enrichies ───────────────────────────────────────
  const NOTIFICATIONS_FULL = [
    { id:'nf1',  type:'deadline_devis',   titre:'Devis à relancer demain',                 message:'M. Lemaire — date limite J-1',      ref:'M-2026-0218', lu:false, date:d(0)+'T08:30' },
    { id:'nf2',  type:'cr_depose',         titre:'Nouveau compte-rendu déposé',            message:'Camille a publié un R2',           ref:'M-2026-0203', lu:false, date:d(0)+'T07:42' },
    { id:'nf3',  type:'acompte_debloque',  titre:'Acompte artisan débloqué',               message:'illiCO France — Plomberie',         ref:'M-2026-0184', lu:false, date:d(0)+'T06:12' },
    { id:'nf4',  type:'msg_client',        titre:'Nouveau message client',                 message:'Mme Vasseur : "Quand passera l\'électricien ?"', ref:'M-2026-0184', lu:false, date:d(-1)+'T17:22' },
    { id:'nf5',  type:'devis_signe',       titre:'Devis signé',                            message:'Cuisines Provence — 23 200 € TTC',   ref:'M-2026-0207', lu:true,  date:d(-1)+'T11:08' },
    { id:'nf6',  type:'facture_payee',     titre:'Facture réglée',                         message:'M. Boudet — solde toiture',          ref:'M-2026-0167', lu:true,  date:d(-3)+'T15:30' },
    { id:'nf7',  type:'decennale_expire',  titre:'Décennale expirante',                    message:'Toiture Étang — expire dans 21 j',  ref:null,           lu:true,  date:d(-4)+'T09:00' },
    { id:'nf8',  type:'redevance_due',     titre:'Redevance mai à percevoir',              message:'Camille Roux — 540 € TTC',           ref:null,           lu:true,  date:d(-7)+'T08:00' },
  ];

  const NOTIF_LABELS = {
    deadline_devis:   { icon:'Alert',  color:'#a16207', bg:'rgba(245,158,11,0.13)' },
    cr_depose:        { icon:'Doc',    color:'#0078ad', bg:'rgba(0,148,212,0.12)' },
    acompte_debloque: { icon:'Coins',  color:'#15803d', bg:'rgba(22,163,74,0.10)' },
    msg_client:       { icon:'Mail',   color:'#0078ad', bg:'rgba(0,148,212,0.12)' },
    devis_signe:      { icon:'Check',  color:'#15803d', bg:'rgba(22,163,74,0.10)' },
    facture_payee:    { icon:'Euro',   color:'#15803d', bg:'rgba(22,163,74,0.10)' },
    decennale_expire: { icon:'Shield', color:'#b91c1c', bg:'rgba(220,38,38,0.10)' },
    redevance_due:    { icon:'Wallet', color:'#475569', bg:'rgba(148,163,184,0.18)' },
  };

  // ─── Sources d'apport ───────────────────────────────────────────────
  const APPORTS = [
    { k:'Bouche-à-oreille',    v:42 },
    { k:'illiCO France',       v:28 },
    { k:'Google / SEO',        v:16 },
    { k:'Réseaux sociaux',     v:9  },
    { k:'Apporteur d\'affaires', v:5 },
  ];

  // ─── Artisans avec décennale ────────────────────────────────────────
  D.ARTISANS.forEach((a, i) => {
    const dec = new Date(today);
    dec.setMonth(dec.getMonth() + [5,18,2,11,1,9,22,15][i]); // varié
    a.decennale_expiration = dec.toISOString().split('T')[0];
    a.kbis = i % 2 === 0;
    a.qualification = i % 3 === 0 ? 'RGE Qualibat' : null;
  });

  // ─── Profile defaults pour agentes ─────────────────────────────────
  D.AGENTES.forEach(a => {
    if (a.role === 'agente') {
      a.parts_disponibles = [50, 60];
      a.frais_part_defaut = 100;
      a.redevance_debut = '2026-01-01';
      a.email = `${a.prenom.toLowerCase()}.${a.nom.toLowerCase()}@illico.fr`;
    }
  });

  Object.assign(D, {
    PHOTOS, COMPTES_RENDUS, RDV_DOSSIER, INTERVENTIONS,
    FACTURES_ARTISAN, DOCUMENTS, SUIVI_FIN,
    FACTURES_AGENTE, REDEVANCES, OBJECTIFS,
    NOTIFICATIONS_FULL, NOTIF_LABELS, APPORTS, d,
  });
})();
