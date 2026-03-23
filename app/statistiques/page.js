'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'

const MOIS_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

const TYPOLOGIE_LABELS = {
  courtage: 'Courtage',
  amo: 'AMO',
  estimo: 'Estimo',
  audit_energetique: 'Audit énergétique',
  studio_jardin: 'Studio de jardin',
}

const TYPOLOGIE_COLORS = {
  courtage: '#2563EB',
  amo: '#7C3AED',
  estimo: '#059669',
  audit_energetique: '#D97706',
  studio_jardin: '#DB2777',
}

// Couleurs fixes pour les utilisatrices (évite les classes Tailwind dynamiques)
const USER_COLORS = [
  { bg: '#F3E8FF', border: '#D8B4FE', text: '#7C3AED', dot: '#9333EA' }, // purple - admin
  { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8', dot: '#2563EB' }, // blue
  { bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D', dot: '#16A34A' }, // green
  { bg: '#FFF7ED', border: '#FED7AA', text: '#C2410C', dot: '#EA580C' }, // orange
]

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-gray-400">{label}</p>
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <p className="text-xl font-bold" style={{ color: color || '#1F2937' }}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function Statistiques() {
  const [profile, setProfile] = useState(null)
  const [dossiers, setDossiers] = useState([])
  const [utilisatrices, setUtilisatrices] = useState([])
  const [loading, setLoading] = useState(true)
  const [onglet, setOnglet] = useState('agence')
  const [anneeFiltre, setAnneeFiltre] = useState(new Date().getFullYear())
  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(profData)
      const { data } = await supabase
        .from('dossiers')
        .select(`*,
          referente:profiles(id, prenom, nom, role),
          client:clients(id, prenom, nom, civilite),
          devis_artisans(*, artisan:artisans(id, entreprise, metier))`)
      setDossiers(data || [])
      // Charger toutes les utilisatrices dynamiquement
      const { data: usersData } = await supabase
        .from('profiles')
        .select('*')
        .in('role', ['admin', 'agente'])
        .order('prenom')
      setUtilisatrices(usersData || [])
      setLoading(false)
    }
    init()
  }, [router])

  const isMarine = profile?.role === 'admin'

  // Une agente ne voit que ses propres dossiers
  const dossiersVisibles = isMarine
    ? dossiers
    : dossiers.filter(d => d.referente?.id === profile?.id)

  const dossiersFiltres = dossiersVisibles.filter(d => {
    if (anneeFiltre === 'tous') return true
    const date = d.date_signature_contrat || d.created_at
    if (!date) return false
    return new Date(date).getFullYear() === parseInt(anneeFiltre)
  })

  const calculerDossier = (d) => {
    const estChantierMarine = d.referente?.role === 'admin'
    const devisActifs = (d.devis_artisans || []).filter(dv => dv.statut !== 'refuse')
    const devisSignes = devisActifs.filter(dv => dv.statut === 'accepte' && dv.date_signature)
    let comHT = 0, comTTC = 0, royaltiesCom = 0, net = 0, partAgente = 0, partMarine = 0
    devisActifs.forEach(dv => {
      const cHT = (dv.montant_ht || 0) * (dv.commission_pourcentage || 0)
      const cTTC = cHT * 1.2
      const roy = cHT * 0.05 * 1.2
      const n = cTTC - roy
      comHT += cHT; comTTC += cTTC; royaltiesCom += roy; net += n
      partAgente += estChantierMarine ? 0 : n * (dv.part_al || 0.5)
      partMarine += estChantierMarine ? n : n * (1 - (dv.part_al || 0.5))
    })
    const totalHT = devisActifs.reduce((s, dv) => s + (dv.montant_ht || 0), 0)
    const totalTTCSignes = devisSignes.reduce((s, dv) => s + (dv.montant_ttc || 0), 0)
    const honorairesCourtage = ['courtage', 'amo'].includes(d.typologie) ? totalTTCSignes * 0.06 : 0
    const honorairesAMO = d.typologie === 'amo' ? totalTTCSignes * ((d.honoraires_amo_taux || 9) / 100) : 0
    const honorairesTTC = honorairesCourtage + honorairesAMO
    const royaltiesHonoraires = (honorairesCourtage + honorairesAMO) * 0.05 * 1.2
    const fraisTTC = parseFloat(d.frais_consultation || 0)
    const fraisRoyalties = (fraisTTC / 1.2) * 0.05 * 1.2
    const sommeRoyalties = royaltiesCom + fraisRoyalties + royaltiesHonoraires
    const totalEncaissement = fraisTTC + honorairesTTC + comTTC - sommeRoyalties
    return {
      estChantierMarine, totalHT, comHT, comTTC, royaltiesCom, net,
      partAgente, partMarine, honorairesTTC, fraisTTC, sommeRoyalties,
      totalEncaissement, nbDevis: devisActifs.length, nbDevisSignes: devisSignes.length,
    }
  }

  const anneesDispos = [...new Set(dossiers.map(d => {
    const date = d.date_signature_contrat || d.created_at
    return date ? new Date(date).getFullYear() : null
  }).filter(Boolean))].sort((a, b) => b - a)

  const fmt = (n) => {
    const num = Math.round(n || 0)
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €'
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Chargement...</p>
    </div>
  )

  const stats = dossiersFiltres.map(d => ({ ...d, _calc: calculerDossier(d) }))

  const totalCA = stats.reduce((s, d) => s + d._calc.totalHT, 0)
  const totalComHT = stats.reduce((s, d) => s + d._calc.comHT, 0)
  const totalComTTC = stats.reduce((s, d) => s + d._calc.comTTC, 0)
  const totalHonoraires = stats.reduce((s, d) => s + d._calc.honorairesTTC, 0)
  const totalFrais = stats.reduce((s, d) => s + d._calc.fraisTTC, 0)
  const totalRoyalties = stats.reduce((s, d) => s + d._calc.sommeRoyalties, 0)
  const totalNet = stats.reduce((s, d) => s + d._calc.totalEncaissement, 0)
  const totalPartAgente = stats.reduce((s, d) => s + d._calc.partAgente, 0)
  const totalPartMarine = stats.reduce((s, d) => s + d._calc.partMarine, 0)

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
  const maxMois = Math.max(...caParMois, 1)

  // Artisans
  const artisansMap = {}
  stats.forEach(d => {
    (d.devis_artisans || []).filter(dv => dv.statut !== 'refuse').forEach(dv => {
      const id = dv.artisan?.id; if (!id) return
      if (!artisansMap[id]) artisansMap[id] = { id, entreprise: dv.artisan?.entreprise, metier: dv.artisan?.metier, volumeHT: 0, comHT: 0, nbDevis: 0, nbDevisSignes: 0, chantiers: new Set() }
      artisansMap[id].volumeHT += (dv.montant_ht || 0)
      artisansMap[id].comHT += (dv.montant_ht || 0) * (dv.commission_pourcentage || 0)
      artisansMap[id].nbDevis++
      if (dv.statut === 'accepte') artisansMap[id].nbDevisSignes++
      artisansMap[id].chantiers.add(d.id)
    })
  })
  const topArtisans = Object.values(artisansMap).map(a => ({ ...a, nbChantiers: a.chantiers.size })).sort((a, b) => b.volumeHT - a.volumeHT).slice(0, 15)
  const maxArtisanVolume = topArtisans[0]?.volumeHT || 1

  // Clients
  const clientsMap = {}
  stats.forEach(d => {
    const id = d.client?.id; if (!id) return
    if (!clientsMap[id]) clientsMap[id] = { id, prenom: d.client?.prenom, nom: d.client?.nom, caHT: 0, comHT: 0, nbDossiers: 0, typologies: new Set() }
    clientsMap[id].caHT += d._calc.totalHT
    clientsMap[id].comHT += d._calc.comHT
    clientsMap[id].nbDossiers++
    clientsMap[id].typologies.add(d.typologie)
  })
  const topClients = Object.values(clientsMap).map(c => ({ ...c, typologies: [...c.typologies] })).sort((a, b) => b.caHT - a.caHT).slice(0, 15)
  const maxClientCA = topClients[0]?.caHT || 1

  // Typologies
  const typologiesMap = {}
  stats.forEach(d => {
    const t = d.typologie
    if (!typologiesMap[t]) typologiesMap[t] = { label: TYPOLOGIE_LABELS[t] || t, color: TYPOLOGIE_COLORS[t] || '#6B7280', nbDossiers: 0, caHT: 0, comHT: 0 }
    typologiesMap[t].nbDossiers++
    typologiesMap[t].caHT += d._calc.totalHT
    typologiesMap[t].comHT += d._calc.comHT
  })
  const typologies = Object.entries(typologiesMap).sort((a, b) => b[1].nbDossiers - a[1].nbDossiers)
  const totalDossiers = stats.length || 1

  // ── ONGLETS selon le rôle (utilisatrices = admin seulement) ──
  const ongletsList = [
    { key: 'agence', label: '🏢 Agence globale' },
    ...(isMarine ? [{ key: 'utilisatrices', label: '👥 Par utilisatrice' }] : []),
    { key: 'artisans', label: '🔨 Par artisan' },
    { key: 'clients', label: '🏠 Par client' },
    { key: 'typologies', label: '📋 Par typologie' },
  ]

  // ── STATS PAR UTILISATRICE (dynamique, scalable) ──
  const statsParUtilisatrice = utilisatrices.map((u, idx) => {
    const dossiersU = dossiersFiltres.filter(d => d.referente?.id === u.id)
    const statsU = dossiersU.map(d => ({ ...d, _calc: calculerDossier(d) }))
    const isAdmin = u.role === 'admin'
    const caHT = statsU.reduce((s, d) => s + d._calc.totalHT, 0)
    const comHT = statsU.reduce((s, d) => s + d._calc.comHT, 0)
    const honoraires = statsU.reduce((s, d) => s + d._calc.honorairesTTC, 0)
    const frais = statsU.reduce((s, d) => s + d._calc.fraisTTC, 0)
    const gains = statsU.reduce((s, d) => s + (isAdmin ? d._calc.partMarine : d._calc.partAgente), 0)
    const caParMoisU = Array(12).fill(0)
    statsU.forEach(d => {
      const date = d.date_signature_contrat || d.created_at
      if (!date) return
      caParMoisU[new Date(date).getMonth()] += d._calc.totalHT
    })
    return { user: u, color: USER_COLORS[idx % USER_COLORS.length], nbDossiers: dossiersU.length, caHT, comHT, honoraires, frais, gains, caParMois: caParMoisU }
  })
  const maxMoisU = Math.max(...statsParUtilisatrice.flatMap(u => u.caParMois), 1)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-gray-600 text-sm">← Retour</button>
          <h1 className="text-lg font-bold text-blue-900">Statistiques</h1>
        </div>
        <select value={anneeFiltre} onChange={e => setAnneeFiltre(e.target.value === 'tous' ? 'tous' : parseInt(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="tous">Toutes les années</option>
          {anneesDispos.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
          {ongletsList.map(({ key, label }) => (
            <button key={key} onClick={() => setOnglet(key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${onglet === key ? 'border-blue-800 text-blue-800' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── AGENCE GLOBALE ── */}
        {onglet === 'agence' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Chantiers" value={stats.length} sub={`${parStatut.en_cours} en cours · ${parStatut.termine} terminés`} icon="📁" />
              <StatCard label="CA total HT" value={fmt(totalCA)} sub="Montant devis actifs" icon="💰" color="#1D4ED8" />
              <StatCard label="Commissions HT" value={fmt(totalComHT)} sub={`TTC : ${fmt(totalComTTC)}`} icon="📊" color="#15803D" />
              <StatCard label="Net encaissé" value={fmt(totalNet)} sub={`Royalties : ${fmt(totalRoyalties)}`} icon="✅" color="#7C3AED" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Honoraires" value={fmt(totalHonoraires)} sub="Courtage + AMO" icon="🏷️" />
              <StatCard label="Frais consultation" value={fmt(totalFrais)} sub="TTC encaissés" icon="📝" />
              {isMarine ? (
                <>
                  <StatCard label="Part agentes" value={fmt(totalPartAgente)} sub="Sur commissions" color="#2563EB" icon="👩" />
                  <StatCard label="Part Marine" value={fmt(totalPartMarine)} sub="Sur commissions" color="#7C3AED" icon="👩" />
                </>
              ) : (
                <StatCard label="Ma part" value={fmt(totalPartAgente)} sub="Sur commissions" color="#2563EB" icon="👩" />
              )}
            </div>

            {/* Graphique CA mensuel */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="font-semibold text-gray-800 mb-6">CA mensuel — Montants HT devis actifs</h2>
              <div className="flex items-end gap-2">
                {caParMois.map((val, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    {val > 0 && <p className="text-xs text-gray-500">{Math.round(val / 1000)}k</p>}
                    <div className="w-full" style={{ height: 100 }}>
                      <div style={{
                        width: '100%',
                        height: val > 0 ? `${Math.max(6, (val / maxMois) * 100)}%` : '3px',
                        backgroundColor: val > 0 ? '#2563EB' : '#E5E7EB',
                        borderRadius: '4px 4px 0 0',
                        marginTop: 'auto'
                      }} />
                    </div>
                    <p className="text-xs text-gray-400">{MOIS_LABELS[i]}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Statuts */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'En cours', val: parStatut.en_cours, bg: '#DCFCE7', color: '#15803D' },
                { label: 'En attente', val: parStatut.en_attente, bg: '#FEF9C3', color: '#A16207' },
                { label: 'Terminés', val: parStatut.termine, bg: '#F3F4F6', color: '#4B5563' },
                { label: 'Annulés', val: parStatut.annule, bg: '#FEE2E2', color: '#DC2626' },
              ].map(({ label, val, bg, color }) => (
                <div key={label} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
                  <span className="text-sm text-gray-600">{label}</span>
                  <span className="text-lg font-bold px-3 py-1 rounded-full" style={{ backgroundColor: bg, color }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── PAR UTILISATRICE (admin seulement, 100% dynamique) ── */}
        {onglet === 'utilisatrices' && isMarine && (
          <div className="space-y-6">
            {/* Cartes par utilisatrice */}
            <div className={`grid gap-6 ${statsParUtilisatrice.length <= 2 ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3'}`}>
              {statsParUtilisatrice.map(({ user, color, nbDossiers, caHT, comHT, honoraires, frais, gains }) => (
                <div key={user.id} className="rounded-xl p-6"
                  style={{ backgroundColor: color.bg, border: `1px solid ${color.border}` }}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color.dot }} />
                    <h2 className="font-semibold" style={{ color: color.text }}>{user.prenom} {user.nom}</h2>
                    <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: color.dot }}>
                      {user.role === 'admin' ? 'Franchisée' : 'Agente'}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {[
                      ['Chantiers', nbDossiers + (nbDossiers > 1 ? ' chantiers' : ' chantier')],
                      ['CA HT', fmt(caHT)],
                      ['COM HT', fmt(comHT)],
                      ['Honoraires', fmt(honoraires)],
                      ['Frais consul.', fmt(frais)],
                      ['Net gains', fmt(gains)],
                    ].map(([lbl, val]) => (
                      <div key={lbl} className="flex justify-between items-center py-1.5 border-b last:border-0"
                        style={{ borderColor: color.border }}>
                        <span className="text-sm text-gray-500">{lbl}</span>
                        <span className="text-sm font-bold" style={{ color: color.text }}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Graphique comparaison CA par mois (si plusieurs utilisatrices) */}
            {statsParUtilisatrice.length > 1 && (
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <h2 className="font-semibold text-gray-800 mb-6">CA mensuel comparé</h2>
                <div className="flex items-end gap-2" style={{ height: 140 }}>
                  {MOIS_LABELS.map((mois, i) => (
                    <div key={mois} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full flex items-end gap-0.5" style={{ height: 110 }}>
                        {statsParUtilisatrice.map((u) => (
                          <div key={u.user.id} style={{
                            flex: 1,
                            height: `${Math.max(3, (u.caParMois[i] / maxMoisU) * 100)}%`,
                            backgroundColor: u.color.dot,
                            borderRadius: '3px 3px 0 0'
                          }} />
                        ))}
                      </div>
                      <p className="text-xs text-gray-400">{mois}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-4 mt-3 flex-wrap">
                  {statsParUtilisatrice.map((u) => (
                    <div key={u.user.id} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: u.color.dot }} />
                      <span className="text-xs text-gray-500">{u.user.prenom} {u.user.nom}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tableau récap toutes utilisatrices */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <p className="font-medium text-gray-800">Récapitulatif — Toutes les utilisatrices</p>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase">Utilisatrice</th>
                    <th className="text-right px-3 py-3 text-xs font-medium text-gray-500 uppercase">Chantiers</th>
                    <th className="text-right px-3 py-3 text-xs font-medium text-gray-500 uppercase">CA HT</th>
                    <th className="text-right px-3 py-3 text-xs font-medium text-gray-500 uppercase">COM HT</th>
                    <th className="text-right px-3 py-3 text-xs font-medium text-gray-500 uppercase">Honoraires</th>
                    <th className="text-right px-3 py-3 text-xs font-medium text-gray-500 uppercase">Net gains</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {statsParUtilisatrice.map(({ user, color, nbDossiers, caHT, comHT, honoraires, gains }) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color.dot }} />
                          <span className="font-medium text-gray-800">{user.prenom} {user.nom}</span>
                          <span className="text-xs text-gray-400">{user.role === 'admin' ? 'Franchisée' : 'Agente'}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-gray-600">{nbDossiers}</td>
                      <td className="px-3 py-3 text-right font-medium" style={{ color: color.dot }}>{fmt(caHT)}</td>
                      <td className="px-3 py-3 text-right text-gray-600">{fmt(comHT)}</td>
                      <td className="px-3 py-3 text-right text-gray-600">{fmt(honoraires)}</td>
                      <td className="px-3 py-3 text-right font-bold" style={{ color: color.dot }}>{fmt(gains)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                  <tr>
                    <td className="px-3 py-3 text-gray-700">Total</td>
                    <td className="px-3 py-3 text-right text-gray-700">{stats.length}</td>
                    <td className="px-3 py-3 text-right text-blue-700">{fmt(totalCA)}</td>
                    <td className="px-3 py-3 text-right text-gray-700">{fmt(totalComHT)}</td>
                    <td className="px-3 py-3 text-right text-gray-700">{fmt(totalHonoraires)}</td>
                    <td className="px-3 py-3 text-right text-green-700">{fmt(totalPartAgente + totalPartMarine)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* ── PAR ARTISAN ── */}
        {onglet === 'artisans' && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-800">Classement artisans — Volume confié HT</p>
                <p className="text-xs text-gray-400">{topArtisans.length} artisans sur cette période</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">Total volume</p>
                <p className="text-sm font-bold text-blue-700">{fmt(topArtisans.reduce((s, a) => s + a.volumeHT, 0))}</p>
              </div>
            </div>
            {topArtisans.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-12">Aucune donnée pour cette période</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {topArtisans.map((a, idx) => (
                  <div key={a.id} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50">
                    <span className="text-sm font-bold text-gray-300 w-6 text-center">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{a.entreprise}</p>
                      <p className="text-xs text-gray-400">{a.metier} · {a.nbChantiers} chantier{a.nbChantiers > 1 ? 's' : ''}</p>
                    </div>
                    <div className="w-40 hidden md:flex flex-col gap-1">
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div style={{ width: `${(a.volumeHT / maxArtisanVolume) * 100}%`, height: '100%', backgroundColor: '#2563EB', borderRadius: 9999 }} />
                      </div>
                      <p className="text-xs text-gray-400">{a.nbDevisSignes}/{a.nbDevis} devis signés ({a.nbDevis > 0 ? Math.round((a.nbDevisSignes / a.nbDevis) * 100) : 0}%)</p>
                    </div>
                    <div className="text-right min-w-[100px]">
                      <p className="text-sm font-bold text-blue-700">{fmt(a.volumeHT)}</p>
                      <p className="text-xs text-gray-400">COM : {fmt(a.comHT)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── PAR CLIENT ── */}
        {onglet === 'clients' && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-800">Classement clients — CA HT</p>
                <p className="text-xs text-gray-400">{topClients.length} clients sur cette période</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">CA total</p>
                <p className="text-sm font-bold text-green-700">{fmt(totalCA)}</p>
              </div>
            </div>
            {topClients.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-12">Aucune donnée pour cette période</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {topClients.map((c, idx) => (
                  <div key={c.id} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50">
                    <span className="text-sm font-bold text-gray-300 w-6 text-center">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{c.prenom} {c.nom}</p>
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {c.typologies.map(t => (
                          <span key={t} style={{ backgroundColor: (TYPOLOGIE_COLORS[t] || '#6B7280') + '22', color: TYPOLOGIE_COLORS[t] || '#6B7280' }}
                            className="text-xs px-1.5 py-0.5 rounded-full font-medium">
                            {TYPOLOGIE_LABELS[t] || t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="w-40 hidden md:flex flex-col gap-1">
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div style={{ width: `${(c.caHT / maxClientCA) * 100}%`, height: '100%', backgroundColor: '#059669', borderRadius: 9999 }} />
                      </div>
                      <p className="text-xs text-gray-400">{c.nbDossiers} dossier{c.nbDossiers > 1 ? 's' : ''}</p>
                    </div>
                    <div className="text-right min-w-[100px]">
                      <p className="text-sm font-bold text-green-700">{fmt(c.caHT)}</p>
                      <p className="text-xs text-gray-400">COM : {fmt(c.comHT)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── PAR TYPOLOGIE ── */}
        {onglet === 'typologies' && (
          <div className="space-y-6">
            {typologies.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-12 bg-white border border-gray-200 rounded-xl">Aucune donnée pour cette période</p>
            ) : (
              <>
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <h2 className="font-semibold text-gray-800 mb-4">Répartition par nombre de chantiers</h2>
                  <div className="flex rounded-lg overflow-hidden h-10 mb-4">
                    {typologies.map(([key, t]) => (
                      <div key={key} style={{ flex: t.nbDossiers, backgroundColor: t.color }}
                        className="flex items-center justify-center">
                        {t.nbDossiers / totalDossiers > 0.08 && (
                          <span className="text-white text-xs font-bold">{Math.round((t.nbDossiers / totalDossiers) * 100)}%</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-4">
                    {typologies.map(([key, t]) => (
                      <div key={key} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                        <span className="text-sm text-gray-600">{t.label}</span>
                        <span className="text-sm font-bold text-gray-800">{t.nbDossiers}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  {typologies.map(([key, t]) => (
                    <div key={key} className="bg-white border border-gray-200 rounded-xl p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: t.color }} />
                          <span className="font-semibold text-gray-800">{t.label}</span>
                          <span className="text-sm text-gray-400">{t.nbDossiers} dossier{t.nbDossiers > 1 ? 's' : ''}</span>
                        </div>
                        <span className="text-sm font-medium text-gray-500">{Math.round((t.nbDossiers / totalDossiers) * 100)}% du total</span>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-gray-400 mb-0.5">CA HT</p>
                          <p className="text-base font-bold" style={{ color: t.color }}>{fmt(t.caHT)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 mb-0.5">Commissions HT</p>
                          <p className="text-base font-bold text-gray-700">{fmt(t.comHT)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 mb-0.5">Taux moyen</p>
                          <p className="text-base font-bold text-gray-700">
                            {t.caHT > 0 ? ((t.comHT / t.caHT) * 100).toFixed(1) : '0'}%
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  )
}