'use client'
import { useState, useEffect, use } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

function FichesTechPanel({ artisanId, fichesCochees, onToggle }) {
  const [fiches, setFiches] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const charger = async () => {
      const { data } = await supabase.from('fiches_techniques').select('*').eq('artisan_id', artisanId).order('nom')
      setFiches(data || [])
      setLoading(false)
    }
    charger()
  }, [artisanId])
  if (loading) return <p className="text-xs text-gray-400 mt-2">Chargement...</p>
  if (fiches.length === 0) return (
    <p className="text-xs text-gray-400 mt-2">
      Aucune fiche technique pour cet artisan —
      <a href={`/artisans/${artisanId}`} target="_blank" className="text-blue-500 hover:underline ml-1">En ajouter →</a>
    </p>
  )
  return (
    <div className="mt-2 space-y-1 bg-gray-50 rounded-lg p-3">
      {fiches.map(fiche => {
        const cochee = fichesCochees.some(f => f.fiche_technique_id === fiche.id)
        return (
          <label key={fiche.id} className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={cochee} onChange={() => onToggle(fiche.id, artisanId)} className="w-4 h-4 accent-blue-700" />
            <span className="text-xs text-gray-700">{fiche.nom}</span>
            {fiche.description && <span className="text-xs text-gray-400">— {fiche.description}</span>}
          </label>
        )
      })}
    </div>
  )
}

function EditDevis({ devis, onSave, onCancel, isMarine }) {
  const [form, setForm] = useState({
    montant_ht: devis.montant_ht || '',
    montant_ttc: devis.montant_ttc || '',
    commission_pourcentage: devis.commission_pourcentage ? (devis.commission_pourcentage * 100).toFixed(1) : '',
    part_agente: isMarine ? '0' : (devis.part_agente || '0.5'),
    date_reception: devis.date_reception || '',
    date_limite: devis.date_limite || '',
  })
  const set = (champ, val) => setForm(f => ({ ...f, [champ]: val }))
  return (
    <div className="border border-blue-100 bg-blue-50 rounded-lg p-3 space-y-3 mt-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Montant HT (€)</label>
          <input type="number" step="0.01" value={form.montant_ht} onChange={e => set('montant_ht', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Montant TTC (€)</label>
          <input type="number" step="0.01" value={form.montant_ttc} onChange={e => set('montant_ttc', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Commission (%)</label>
          <input type="number" step="0.1" min="0" max="100" value={form.commission_pourcentage} placeholder="ex: 15"
            onChange={e => set('commission_pourcentage', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        {!isMarine && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Répartition</label>
            <select value={form.part_agente} onChange={e => set('part_agente', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="0.5">50 / 50</option>
              <option value="0.6">60 / 40</option>
            </select>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Date réception</label>
          <input type="date" value={form.date_reception} onChange={e => set('date_reception', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Date limite</label>
          <input type="date" value={form.date_limite} onChange={e => set('date_limite', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 border border-gray-300 text-gray-700 py-1.5 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
        <button onClick={() => onSave(form)} className="flex-1 bg-blue-800 text-white py-1.5 rounded-lg text-sm hover:bg-blue-900">Enregistrer</button>
      </div>
    </div>
  )
}

export default function FicheChantier({ params }) {
  const { id } = use(params)
  const [dossier, setDossier] = useState(null)
  const [client, setClient] = useState(null)
  const [profile, setProfile] = useState(null)
  const [nomFranchisee, setNomFranchisee] = useState('Franchisée')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generatingPDF, setGeneratingPDF] = useState(null) // 'recapitulatif' | 'dossier_fin'
  const [erreur, setErreur] = useState('')
  const [succes, setSucces] = useState('')
  const [mode, setMode] = useState('lecture')
  const [devis, setDevis] = useState([])
  const [artisans, setArtisans] = useState([])
  const [ajouterDevis, setAjouterDevis] = useState(false)
  const [savingDevis, setSavingDevis] = useState(false)
  const [devisEnEdition, setDevisEnEdition] = useState(null)
  const [photos, setPhotos] = useState([])
  const [categorie, setCategorie] = useState('avant')
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState(null) // devisId en cours d'upload
  const [uploadingQual, setUploadingQual] = useState(null) // devisId pour qualification
  const [comptesRendus, setComptesRendus] = useState([])
  const [messages, setMessages] = useState([])
  const [nouveauCR, setNouveauCR] = useState({ type_visite: '', notes_brutes: '', contenu_final: '', date_visite: '', valide: false })
  const [ajouterCR, setAjouterCR] = useState(false)
  const [savingCR, setSavingCR] = useState(false)
  const [nbMsgNonLus, setNbMsgNonLus] = useState(0)
  const [photoOuverte, setPhotoOuverte] = useState(null)
  const [rdvsDossier, setRdvsDossier] = useState([])
  const [modalRdvOuvert, setModalRdvOuvert] = useState(false)
  const [rdvEnEdition, setRdvEnEdition] = useState(null)
  const [interventionEnEdition, setInterventionEnEdition] = useState(null)
  const [modalInterventionOuvert, setModalInterventionOuvert] = useState(false)
  const [interventionsDossier, setInterventionsDossier] = useState([])
  const [nouveauRdvDossier, setNouveauRdvDossier] = useState({ type_rdv: 'visite_technique_client', date_heure: '', duree_minutes: 60, artisan_id: '', notes: '' })
  const [modalCreerIntervOuvert, setModalCreerIntervOuvert] = useState(false)
  const [nouvIntervArtisanId, setNouvIntervArtisanId] = useState(null)
  const [nouvIntervForm, setNouvIntervForm] = useState({ type_intervention: 'periode', date_debut: '', date_fin: '', jours_specifiques: [], notes: '' })
  const [fichesTechChantier, setFichesTechChantier] = useState({})
  const [fichesPanelOuvert, setFichesPanelOuvert] = useState(null)
  const [nouveauDevis, setNouveauDevis] = useState({ artisan_id: '', montant_ht: '', montant_ttc: '', commission_pourcentage: '', part_agente: '0.5', date_reception: '', date_limite: '', fichier: null })
  const [suiviFinancier, setSuiviFinancier] = useState([])
  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(profData)
      // Charger le nom de la franchisée pour les labels dynamiques
      const { data: adminData } = await supabase
        .from('profiles').select('prenom, nom').eq('role', 'admin').single()
      if (adminData) setNomFranchisee(`${adminData.prenom} ${adminData.nom}`)
      const { data: dossierData } = await supabase.from('dossiers')
        .select('*, referente:profiles!dossiers_referente_id_fkey(id, prenom, nom, role), client:clients(*)')        .eq('id', id).single()
      setDossier(dossierData)
      setClient(dossierData?.client)
      const { data: devisData } = await supabase.from('devis_artisans')
        .select('*, artisan:artisans(id, entreprise, metier)').eq('dossier_id', id).order('created_at')
      setDevis(devisData || [])
      const { data: artisansData } = await supabase.from('artisans').select('id, entreprise, metier').order('entreprise')
      setArtisans(artisansData || [])
      const { data: photosData } = await supabase.from('photos').select('*').eq('dossier_id', id).order('created_at', { ascending: false })
      const photosAvecUrl = await Promise.all((photosData || []).map(async (photo) => {
        const { data: urlData } = await supabase.storage.from('photos').createSignedUrl(photo.url, 3600)
        return { ...photo, url_signee: urlData?.signedUrl || '' }
      }))
      setPhotos(photosAvecUrl)
      const { data: rdvsData } = await supabase.from('rendez_vous')
        .select('*, artisan:artisans(id, entreprise)').eq('dossier_id', id).order('date_heure')
      setRdvsDossier(rdvsData || [])
      const { data: intData } = await supabase.from('interventions_artisans')
        .select('*, artisan:artisans(id, entreprise)').eq('dossier_id', id).order('date_debut')
      setInterventionsDossier(intData || [])
      const { data: suiviData } = await supabase.from('suivi_financier').select('*').eq('dossier_id', id)

      // Comptes-rendus et messages espace client
      const { data: crData } = await supabase
        .from('comptes_rendus').select('*').eq('dossier_id', id).order('created_at', { ascending: false })
      setComptesRendus(crData || [])
      const { data: msgData } = await supabase
        .from('messages').select('*, auteur:profiles(prenom, nom, role)').eq('dossier_id', id).order('created_at')
      setMessages(msgData || [])
      setNbMsgNonLus((msgData || []).filter(m => m.auteur_role === 'client' && !m.lu_agence).length)
      setSuiviFinancier(suiviData || [])
      const { data: fichesChantierData } = await supabase.from('chantier_fiches_techniques')
        .select('*, fiche:fiches_techniques(id, nom, description)').eq('dossier_id', id)
      const grouped = {}
      ;(fichesChantierData || []).forEach(item => {
        if (!grouped[item.artisan_id]) grouped[item.artisan_id] = []
        grouped[item.artisan_id].push(item)
      })
      setFichesTechChantier(grouped)
      setLoading(false)
    }
    init()
  }, [id, router])

  const chargerPhotos = async () => {
    const { data } = await supabase.from('photos').select('*').eq('dossier_id', id).order('created_at', { ascending: false })
    const photosAvecUrl = await Promise.all((data || []).map(async (photo) => {
      const { data: urlData } = await supabase.storage.from('photos').createSignedUrl(photo.url, 3600)
      return { ...photo, url_signee: urlData?.signedUrl || '' }
    }))
    setPhotos(photosAvecUrl)
  }

  const uploadPhotos = async (fichiers) => {
    if (!fichiers.length) return
    setUploadingPhoto(true)
    for (const fichier of fichiers) {
      const ext = fichier.name.split('.').pop()
      const chemin = `chantiers/${id}/${categorie}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error: uploadError } = await supabase.storage.from('photos').upload(chemin, fichier)
      if (!uploadError) await supabase.from('photos').insert({ dossier_id: id, url: chemin, categorie, uploaded_by: profile?.id })
    }
    await chargerPhotos()
    setUploadingPhoto(false)
    setSucces('Photo(s) ajoutée(s) ✓')
  }

  const supprimerPhoto = async (photoId, chemin) => {
    if (!confirm('Supprimer cette photo ?')) return
    await supabase.storage.from('photos').remove([chemin])
    await supabase.from('photos').delete().eq('id', photoId)
    await chargerPhotos()
  }

  const chargerRdvsDossier = async () => {
    const { data } = await supabase.from('rendez_vous').select('*, artisan:artisans(id, entreprise)').eq('dossier_id', id).order('date_heure')
    setRdvsDossier(data || [])
    const { data: intData } = await supabase.from('interventions_artisans').select('*, artisan:artisans(id, entreprise)').eq('dossier_id', id).order('date_debut')
    setInterventionsDossier(intData || [])
  }

  const sauvegarderRdvDossier = async () => {
    const { error } = await supabase.from('rendez_vous').insert({
      dossier_id: id, type_rdv: nouveauRdvDossier.type_rdv, date_heure: nouveauRdvDossier.date_heure,
      duree_minutes: parseInt(nouveauRdvDossier.duree_minutes), artisan_id: nouveauRdvDossier.artisan_id || null, notes: nouveauRdvDossier.notes || null,
    })
    if (!error) {
      await chargerRdvsDossier()
      setModalRdvOuvert(false)
      setNouveauRdvDossier({ type_rdv: 'visite_technique_client', date_heure: '', duree_minutes: 60, artisan_id: '', notes: '' })
      setSucces('RDV créé ✓')
    }
  }

  const deleteGoogleEvent = async (googleEventId) => {
    if (!googleEventId || !profile?.id) return
    try {
      await fetch('/api/google/calendar/event', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profile.id, googleEventId }),
      })
    } catch (err) {
      console.error('Erreur suppression Google event:', err)
    }
  }

  const supprimerRdvDossier = async (rdvId) => {
    if (!confirm('Supprimer ce RDV ?')) return
    const rdv = rdvsDossier.find(r => r.id === rdvId)
    await supabase.from('rendez_vous').delete().eq('id', rdvId)
    if (rdv?.google_event_id) await deleteGoogleEvent(rdv.google_event_id)
    await chargerRdvsDossier()
  }

  const modifierRdvDossier = async () => {
    if (!rdvEnEdition) return
    await supabase.from('rendez_vous').update({
      type_rdv: rdvEnEdition.type_rdv, date_heure: rdvEnEdition.date_heure,
      duree_minutes: parseInt(rdvEnEdition.duree_minutes), artisan_id: rdvEnEdition.artisan_id || null, notes: rdvEnEdition.notes || null,
    }).eq('id', rdvEnEdition.id)
    await chargerRdvsDossier()
    setModalRdvOuvert(false)
    setRdvEnEdition(null)
    setSucces('RDV modifié ✓')
  }

  const supprimerInterventionDossier = async (intId) => {
    if (!confirm('Supprimer cette intervention ?')) return
    const intervention = interventionsDossier.find(i => i.id === intId)
    await supabase.from('interventions_artisans').delete().eq('id', intId)
    if (intervention?.google_event_id) await deleteGoogleEvent(intervention.google_event_id)
    const { data } = await supabase.from('interventions_artisans').select('*, artisan:artisans(id, entreprise)').eq('dossier_id', id).order('date_debut')
    setInterventionsDossier(data || [])
  }

  const creerInterventionDossier = async () => {
    if (!nouvIntervArtisanId) return
    setSaving(true)
    const payload = {
      dossier_id: id,
      artisan_id: nouvIntervArtisanId,
      type_intervention: nouvIntervForm.type_intervention,
      date_debut: nouvIntervForm.date_debut || null,
      date_fin: nouvIntervForm.type_intervention === 'periode' ? nouvIntervForm.date_fin || null : null,
      jours_specifiques: nouvIntervForm.type_intervention === 'jours_specifiques' ? nouvIntervForm.jours_specifiques : null,
      notes: nouvIntervForm.notes || null,
    }
    const { data: intData } = await supabase.from('interventions_artisans').insert(payload).select('*, artisan:artisans(id, entreprise)')
    // Sync Google si connecté
    if (intData?.[0] && profile?.id) {
      await fetch('/api/google/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profile.id, singleIntervId: intData[0].id }),
      })
    }
    await chargerRdvsDossier()
    setModalCreerIntervOuvert(false)
    setNouvIntervArtisanId(null)
    setNouvIntervForm({ type_intervention: 'periode', date_debut: '', date_fin: '', jours_specifiques: [], notes: '' })
    setSucces('Intervention planifiée ✓')
    setSaving(false)
  }

  const modifierInterventionDossier = async () => {
    if (!interventionEnEdition) return
    await supabase.from('interventions_artisans').update({
      type_intervention: interventionEnEdition.type_intervention,
      date_debut: interventionEnEdition.date_debut || null,
      date_fin: interventionEnEdition.type_intervention === 'periode' ? interventionEnEdition.date_fin || null : null,
      jours_specifiques: interventionEnEdition.type_intervention === 'jours_specifiques' ? interventionEnEdition.jours_specifiques : null,
      notes: interventionEnEdition.notes || null,
    }).eq('id', interventionEnEdition.id)
    await chargerRdvsDossier()
    setModalInterventionOuvert(false)
    setInterventionEnEdition(null)
    setSucces('Intervention modifiée ✓')
  }

  const chargerFichesTechChantier = async () => {
    const { data } = await supabase.from('chantier_fiches_techniques').select('*, fiche:fiches_techniques(id, nom, description)').eq('dossier_id', id)
    const grouped = {}
    ;(data || []).forEach(item => {
      if (!grouped[item.artisan_id]) grouped[item.artisan_id] = []
      grouped[item.artisan_id].push(item)
    })
    setFichesTechChantier(grouped)
  }

  const toggleFicheTech = async (ficheId, artisanId) => {
    const dejaCochee = fichesTechChantier[artisanId]?.some(f => f.fiche_technique_id === ficheId)
    if (dejaCochee) {
      const item = fichesTechChantier[artisanId].find(f => f.fiche_technique_id === ficheId)
      await supabase.from('chantier_fiches_techniques').delete().eq('id', item.id)
    } else {
      await supabase.from('chantier_fiches_techniques').insert({ dossier_id: id, fiche_technique_id: ficheId, artisan_id: artisanId })
    }
    await chargerFichesTechChantier()
  }

  const chargerDevis = async () => {
    const { data } = await supabase.from('devis_artisans').select('*, artisan:artisans(id, entreprise, metier)').eq('dossier_id', id).order('created_at')
    setDevis(data || [])
  }

  const set = (champ, valeur) => setDossier(d => ({ ...d, [champ]: valeur }))
  const setND = (champ, valeur) => setNouveauDevis(d => ({ ...d, [champ]: valeur }))

  const isMarine = profile?.role === 'admin'
  const estChantierMarine = dossier?.referente?.role === 'admin'

  const calculer = (d) => {
    const comHT = (d.montant_ht || 0) * (d.commission_pourcentage || 0)
    const comTTC = comHT * 1.2
    const royalties = (comHT * 0.05) * 1.2          // 5% sur Commissions HT × 1.2
    const royaltiesArtisan = (d.montant_ht || 0) * 0.05 * 1.2  // 5% sur montant devis HT × 1.2
    const net = comTTC - royalties
    const partAgente = estChantierMarine ? 0 : net * (d.part_agente || 0.5)
    const partAdmin = estChantierMarine ? net : net * (1 - (d.part_agente || 0.5))
    let apporteurTTC = 0, apporteurPartAgente = 0, apporteurPartAdmin = 0
    if (client?.apporteur_affaires && client?.apporteur_base === 'par_devis') {
      apporteurTTC = (d.montant_ht || 0) * (client.apporteur_pourcentage / 100) * 1.2
      apporteurPartAgente = estChantierMarine ? 0 : apporteurTTC * (d.part_agente || 0.5)
      apporteurPartAdmin = estChantierMarine ? apporteurTTC : apporteurTTC * (1 - (d.part_agente || 0.5))
    }
    return { comHT, comTTC, royalties, royaltiesArtisan, net, partAgente, partAdmin, apporteurTTC, apporteurPartAgente, apporteurPartAdmin }
  }

  const calculerFrais = () => {
    if (dossier?.frais_consultation === null || dossier?.frais_consultation === undefined || dossier?.frais_consultation === '') {
      return null
    }

    const ttc = parseFloat(dossier.frais_consultation) || 0
    const ht = ttc / 1.2
    const royalties = (ht * 0.05) * 1.2
    const net = ttc - royalties
    const partAgente = estChantierMarine ? 0 : net
    const partAdmin = estChantierMarine ? net : 0

    return { ht, ttc, royalties, net, partAgente, partAdmin }
  }

  const handleSave = async () => {
    setSaving(true)
    setErreur('')
    setSucces('')
    const { error } = await supabase.from('dossiers').update({
      typologie: dossier.typologie, statut: dossier.statut,
      frais_consultation: dossier.frais_consultation, frais_statut: dossier.frais_statut,
      date_limite_devis: dossier.date_limite_devis, contrat_signe: dossier.contrat_signe,
      date_signature_contrat: dossier.date_signature_contrat, date_demarrage_chantier: dossier.date_demarrage_chantier,
      date_fin_chantier: dossier.date_fin_chantier, taux_courtage: dossier.taux_courtage, honoraires_amo_taux: dossier.honoraires_amo_taux,
      resume_projet: dossier.resume_projet || null,
    }).eq('id', id)
    if (error) { setErreur('Erreur : ' + error.message) } else { setSucces('Modifications enregistrées ✓'); setMode('lecture') }
    setSaving(false)
  }

  const sauvegarderDevis = async () => {
    if (!nouveauDevis.artisan_id) return
    setSavingDevis(true)
    const partAgente = estChantierMarine ? 0 : parseFloat(nouveauDevis.part_agente)
    const { data: devisInsere, error } = await supabase.from('devis_artisans').insert({
      dossier_id: id, artisan_id: nouveauDevis.artisan_id,
      montant_ht: nouveauDevis.montant_ht ? parseFloat(nouveauDevis.montant_ht) : null,
      montant_ttc: nouveauDevis.montant_ttc ? parseFloat(nouveauDevis.montant_ttc) : null,
      commission_pourcentage: nouveauDevis.commission_pourcentage ? parseFloat(nouveauDevis.commission_pourcentage) / 100 : null,
      part_agente: partAgente, date_reception: nouveauDevis.date_reception || null, date_limite: nouveauDevis.date_limite || null,
      statut: nouveauDevis.date_reception ? 'recu' : 'en_attente',
    }).select()
    if (!error && nouveauDevis.fichier && devisInsere?.[0]) {
      const ext = nouveauDevis.fichier.name.split('.').pop()
      await supabase.storage.from('documents').upload(`chantiers/${id}/devis/${devisInsere[0].id}.${ext}`, nouveauDevis.fichier)
    }
    if (!error) {
      await chargerDevis()
      setAjouterDevis(false)
      setNouveauDevis({ artisan_id: '', montant_ht: '', montant_ttc: '', commission_pourcentage: '', part_agente: '0.5', date_reception: '', date_limite: '', fichier: null })
      setSucces('Devis ajouté ✓')
    } else { setErreur('Erreur : ' + error.message) }
    setSavingDevis(false)
  }

  const modifierDevis = async (devisId, updates) => {
    const partAgente = estChantierMarine ? 0 : parseFloat(updates.part_agente)
    await supabase.from('devis_artisans').update({
      montant_ht: updates.montant_ht ? parseFloat(updates.montant_ht) : null,
      montant_ttc: updates.montant_ttc ? parseFloat(updates.montant_ttc) : null,
      commission_pourcentage: updates.commission_pourcentage ? parseFloat(updates.commission_pourcentage) / 100 : null,
      part_agente: partAgente, date_reception: updates.date_reception || null, date_limite: updates.date_limite || null,
    }).eq('id', devisId)
    await chargerDevis()
    setDevisEnEdition(null)
    setSucces('Devis modifié ✓')
  }

  const changerStatutDevis = async (devisId, statut) => {
    if (statut === 'accepte') {
      const aujourd_hui = new Date().toISOString().slice(0, 10)
      const [annee, mois, jour] = aujourd_hui.split('-')
      const dateSignature = prompt('Date de signature du devis (JJ/MM/AAAA) :', `${jour}/${mois}/${annee}`)
      if (dateSignature) {
        const [j, m, a] = dateSignature.split('/')
        await supabase.from('devis_artisans').update({ statut, date_signature: `${a}-${m.padStart(2,'0')}-${j.padStart(2,'0')}` }).eq('id', devisId)
      } else {
        await supabase.from('devis_artisans').update({ statut: 'recu' }).eq('id', devisId)
      }
    } else {
      await supabase.from('devis_artisans').update({ statut }).eq('id', devisId)
    }
    await chargerDevis()
  }

  const supprimerDevis = async (devisId) => {
    if (!confirm('Supprimer ce devis ?')) return
    await supabase.from('devis_artisans').delete().eq('id', devisId)
    await chargerDevis()
  }

  // ── UPLOAD DEVIS SIGNÉ ──
  const uploadDevisSigne = async (devisId, fichier) => {
    if (!fichier) return
    setUploadingDoc(devisId)
    const ext = fichier.name.split('.').pop()
    const chemin = `chantiers/${id}/devis_signes/${devisId}.${ext}`
    const { error } = await supabase.storage.from('documents').upload(chemin, fichier, { upsert: true })
    if (!error) {
      await supabase.from('devis_artisans').update({ devis_signe_path: chemin }).eq('id', devisId)
      await chargerDevis()
      setSucces('Devis signé uploadé ✓')
    } else { setErreur('Erreur upload : ' + error.message) }
    setUploadingDoc(null)
  }

  const supprimerDevisSigne = async (devisId, path) => {
    if (!confirm('Supprimer le devis signé ?')) return
    await supabase.storage.from('documents').remove([path])
    await supabase.from('devis_artisans').update({ devis_signe_path: null }).eq('id', devisId)
    await chargerDevis()
    setSucces('Devis signé supprimé ✓')
  }

  // ── UPLOAD FACTURE ARTISAN ──
  const uploadFacture = async (devisId, fichier) => {
    if (!fichier) return
    setUploadingDoc(devisId + '_fact')
    const ext = fichier.name.split('.').pop()
    const chemin = `chantiers/${id}/factures/${devisId}.${ext}`
    const { error } = await supabase.storage.from('documents').upload(chemin, fichier, { upsert: true })
    if (!error) {
      await supabase.from('devis_artisans').update({ facture_path: chemin }).eq('id', devisId)
      await chargerDevis()
      setSucces('Facture uploadée ✓')
    } else { setErreur('Erreur upload : ' + error.message) }
    setUploadingDoc(null)
  }

  const supprimerFacture = async (devisId, path) => {
    if (!confirm('Supprimer la facture ?')) return
    await supabase.storage.from('documents').remove([path])
    await supabase.from('devis_artisans').update({ facture_path: null }).eq('id', devisId)
    await chargerDevis()
    setSucces('Facture supprimée ✓')
  }

  // ── UPLOAD QUALIFICATION ARTISAN ──
  const uploadQualification = async (devisId, fichier) => {
    if (!fichier) return
    setUploadingQual(devisId)
    const ext = fichier.name.split('.').pop()
    const chemin = `chantiers/${id}/qualifications/${devisId}.${ext}`
    const { error } = await supabase.storage.from('documents').upload(chemin, fichier, { upsert: true })
    if (!error) {
      await supabase.from('devis_artisans').update({ qualification_path: chemin }).eq('id', devisId)
      await chargerDevis()
      setSucces('Qualification uploadée ✓')
    } else { setErreur('Erreur upload : ' + error.message) }
    setUploadingQual(null)
  }

  const supprimerQualification = async (devisId, path) => {
    if (!confirm('Supprimer la qualification ?')) return
    await supabase.storage.from('documents').remove([path])
    await supabase.from('devis_artisans').update({ qualification_path: null }).eq('id', devisId)
    await chargerDevis()
    setSucces('Qualification supprimée ✓')
  }

  // ── URL SIGNÉE DOCUMENT ──
  const ouvrirDocument = async (path) => {
    const { data } = await supabase.storage.from('documents').createSignedUrl(path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    else setErreur('Impossible d\'ouvrir le document')
  }

  // ── COMPTES-RENDUS (schéma : type_visite, notes_brutes, contenu_final, valide) ──
  const sauvegarderCR = async () => {
    if (!nouveauCR.type_visite) return
    setSavingCR(true)
    await supabase.from('comptes_rendus').insert({
      dossier_id: id,
      auteur_id: profile?.id,
      type_visite: nouveauCR.type_visite,
      notes_brutes: nouveauCR.notes_brutes || null,
      contenu_final: nouveauCR.contenu_final || null,
      date_visite: nouveauCR.date_visite || null,
      valide: nouveauCR.valide,
    })
    const { data } = await supabase.from('comptes_rendus').select('*').eq('dossier_id', id).order('created_at', { ascending: false })
    setComptesRendus(data || [])
    setNouveauCR({ type_visite: '', notes_brutes: '', contenu_final: '', date_visite: '', valide: false })
    setAjouterCR(false)
    setSucces('Compte-rendu ajouté ✓')
    setSavingCR(false)
  }

  const supprimerCR = async (crId) => {
    if (!confirm('Supprimer ce compte-rendu ?')) return
    await supabase.from('comptes_rendus').delete().eq('id', crId)
    setComptesRendus(prev => prev.filter(c => c.id !== crId))
  }

  const toggleValide = async (crId, valide) => {
    await supabase.from('comptes_rendus').update({ valide }).eq('id', crId)
    setComptesRendus(prev => prev.map(c => c.id === crId ? { ...c, valide } : c))
  }

  // ── MESSAGES AGENTE → CLIENT (schéma : messages avec auteur_role + lu_agence) ──
  const [reponseMsg, setReponseMsg] = useState('')
  const [sendingMsg, setSendingMsg] = useState(false)
  const envoyerReponse = async () => {
    if (!reponseMsg.trim()) return
    setSendingMsg(true)
    await supabase.from('messages').insert({
      dossier_id: id,
      auteur_id: profile?.id,
      auteur_role: profile?.role === 'admin' ? 'admin' : 'agente',
      contenu: reponseMsg.trim(),
      lu: false,        // pas encore lu par le client
      lu_agence: true,  // lu par l'agente (elle l'a écrit)
    })
    // Marquer les messages client comme lus par l'agence
    await supabase.from('messages').update({ lu_agence: true })
      .eq('dossier_id', id).eq('auteur_role', 'client')
    const { data } = await supabase.from('messages')
      .select('*, auteur:profiles(prenom, nom, role)')
      .eq('dossier_id', id).order('created_at')
    setMessages(data || [])
    setNbMsgNonLus(0)
    setReponseMsg('')
    setSendingMsg(false)
  }

  const generatePDF = async (type) => {
    setGeneratingPDF(type)
    try {
      const res = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dossierId: id, type, userId: profile?.id }),
      })
      if (!res.ok) {
        const err = await res.json()
        setErreur('Erreur PDF : ' + err.error)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const filename = type === 'recapitulatif'
        ? `Recapitulatif_${dossier.reference}.pdf`
        : `DossierFin_${dossier.reference}.pdf`
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      setSucces('PDF généré avec succès ✓')
    } catch (err) {
      setErreur('Erreur lors de la génération : ' + err.message)
    } finally {
      setGeneratingPDF(null)
    }
  }

  const typologieLabel = (t) => ({ courtage: 'Courtage', amo: 'AMO', estimo: 'Estimo', audit_energetique: 'Audit énergétique', studio_jardin: 'Studio de jardin' })[t] || t

  const statutConfig = {
    en_cours: { label: 'En cours', color: 'bg-green-100 text-green-700' },
    en_attente: { label: 'En attente', color: 'bg-yellow-100 text-yellow-700' },
    termine: { label: 'Terminé', color: 'bg-gray-100 text-gray-600' },
    annule: { label: 'Annulé', color: 'bg-red-100 text-red-600' },
  }
  const statutDevisConfig = {
    en_attente: { label: 'En attente', color: 'bg-yellow-100 text-yellow-700' },
    recu: { label: 'Reçu', color: 'bg-blue-100 text-blue-700' },
    accepte: { label: 'Accepté', color: 'bg-green-100 text-green-700' },
    refuse: { label: 'Refusé', color: 'bg-red-100 text-red-600' },
  }
  const fraisStatutConfig = {
    offerts: { label: 'Offerts', color: 'bg-blue-100 text-blue-700' },
    factures: { label: 'Facturés — en attente', color: 'bg-amber-100 text-amber-700' },
    regle: { label: 'Réglés', color: 'bg-green-100 text-green-700' },
  }

  const devisActifs = devis.filter(d => d.statut !== 'refuse')
  const totalDevisHT = devisActifs.reduce((s, d) => s + (d.montant_ht || 0), 0)
  const totalDevisTTC = devisActifs.reduce((s, d) => s + (d.montant_ttc || 0), 0)
  const totalComHT = devisActifs.reduce((s, d) => s + calculer(d).comHT, 0)
  const totalComTTC = devisActifs.reduce((s, d) => s + calculer(d).comTTC, 0)
  const totalRoyalties = devisActifs.reduce((s, d) => s + calculer(d).royalties, 0)
  const totalRoyaltiesArtisan = devisActifs.reduce((s, d) => s + calculer(d).royaltiesArtisan, 0)
  const totalPartAgente = devisActifs.reduce((s, d) => s + calculer(d).partAgente, 0)
  const totalPartAdmin = devisActifs.reduce((s, d) => s + calculer(d).partAdmin, 0)
  const totalApporteurTTC = (() => {
    if (!client?.apporteur_affaires) return 0
    if (client.apporteur_base === 'par_devis') return devisActifs.reduce((s, d) => s + calculer(d).apporteurTTC, 0)
    return totalDevisHT * (client.apporteur_pourcentage / 100) * 1.2
  })()
  const totalApporteurPartAgente = (() => {
    if (!client?.apporteur_affaires || estChantierMarine) return 0
    if (client.apporteur_base === 'par_devis') return devisActifs.reduce((s, d) => s + calculer(d).apporteurPartAgente, 0)
    return totalApporteurTTC * (devisActifs[0]?.part_agente || 0.5)
  })()
  const totalApporteurPartAdmin = (() => {
    if (!client?.apporteur_affaires) return 0
    if (client.apporteur_base === 'par_devis') return devisActifs.reduce((s, d) => s + calculer(d).apporteurPartAdmin, 0)
    return totalApporteurTTC * (1 - (estChantierMarine ? 0 : (devisActifs[0]?.part_agente || 0.5)))
  })()

  const frais = calculerFrais()
  const devisSignes = devis.filter(d => d.statut === 'accepte' && d.date_signature && d.montant_ttc)
  const totalDevisTTCSignes = devisSignes.reduce((s, d) => s + (d.montant_ttc || 0), 0)
  const tauxCourtage = (dossier?.taux_courtage ?? 0.06)
  const tauxCourtagePct = (tauxCourtage * 100).toFixed(1)
  const tauxAmo = ((dossier?.honoraires_amo_taux ?? 9) / 100)
  const tauxAmoPct = (tauxAmo * 100).toFixed(1)
  const honorairesCourtage = totalDevisTTCSignes * tauxCourtage
  const honorairesAMO = totalDevisTTCSignes * (tauxCourtage + tauxAmo)  
  const suiviCourtage = suiviFinancier.find(s => s.type_echeance === 'honoraires_courtage')
  const suiviAcompteAMO = suiviFinancier.find(s => s.type_echeance === 'acompte_amo')
  const suiviSoldeAMO = suiviFinancier.find(s => s.type_echeance === 'solde_amo')

  const majSuiviChantier = async (type, montant, champ, valeur) => {
    const upsertOne = async (t, m) => {
      // Interroger la BDD directement (pas le state) pour éviter les problèmes de double appel
      const { data: existing } = await supabase
        .from('suivi_financier')
        .select('id')
        .eq('dossier_id', id)
        .eq('type_echeance', t)
        .is('artisan_id', null)
        .maybeSingle()
      if (existing) {
        await supabase.from('suivi_financier').update({ [champ]: valeur }).eq('id', existing.id)
      } else {
        await supabase.from('suivi_financier').insert({ dossier_id: id, type_echeance: t, montant_ttc: m, [champ]: valeur })
      }
    }
    await upsertOne(type, montant)
    if (type === 'honoraires_courtage' && dossier?.typologie === 'amo') await upsertOne('acompte_amo', montant)
    if (type === 'acompte_amo' && dossier?.typologie === 'amo') await upsertOne('honoraires_courtage', montant)
    const { data } = await supabase.from('suivi_financier').select('*').eq('dossier_id', id)
    setSuiviFinancier(data || [])
  }

  const montantAcompte = (d) => (d.montant_ttc || 0) * ((d.acompte_pourcentage || 30) / 100)

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-400">Chargement...</p></div>
  if (!dossier) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-400">Chantier introuvable</p></div>

  const nomComplet = client ? `${client.civilite} ${client.prenom} ${client.nom}${client.prenom2 ? ` & ${client.prenom2} ${client.nom2}` : ''}` : ''
  const s = statutConfig[dossier.statut]
  const f = fraisStatutConfig[dossier.frais_statut]

  // Calcul parts honoraires
  const partAgenteRef = estChantierMarine ? 0 : (devisActifs[0]?.part_agente || 0.5)
  const honTotal = ['courtage', 'amo'].includes(dossier.typologie) && totalDevisTTCSignes > 0
    ? (dossier.typologie === 'amo' ? honorairesAMO : honorairesCourtage) : 0
  const honAgente = honTotal * partAgenteRef
  const honAdmin = honTotal * (1 - partAgenteRef)
  const fraisAgente = frais ? frais.partAgente : 0
  const fraisAdmin = frais ? frais.partAdmin : 0
  const totalGainAgente = totalPartAgente - totalApporteurPartAgente + honAgente + fraisAgente
  const totalGainAdmin = totalPartAdmin - totalApporteurPartAdmin + honAdmin + fraisAdmin

  const supprimerChantier = async () => {
    const ok = confirm(
      'Supprimer définitivement ce chantier, tous ses devis, photos, documents, RDV, interventions et suivis financiers ? Cette action est irréversible.'
    )
    if (!ok) return

    setSaving(true)
    setErreur('')
    setSucces('')

    try {
      // 1) Charger ce qu'il faut pour supprimer proprement les fichiers connus
      const { data: photosData, error: photosErr } = await supabase
        .from('photos')
        .select('id, url')
        .eq('dossier_id', id)

      if (photosErr) throw photosErr

      const { data: devisData, error: devisErr } = await supabase
        .from('devis_artisans')
        .select('id, devis_signe_path, facture_path')
        .eq('dossier_id', id)

      if (devisErr) throw devisErr

      // 2) Supprimer les fichiers Storage connus
      const photoPaths = (photosData || [])
        .map(p => p.url)
        .filter(Boolean)

      const documentPaths = (devisData || [])
        .flatMap(d => [d.devis_signe_path, d.facture_path])
        .filter(Boolean)

      if (photoPaths.length > 0) {
        const { error } = await supabase.storage.from('photos').remove(photoPaths)
        if (error) throw error
      }

      if (documentPaths.length > 0) {
        const { error } = await supabase.storage.from('documents').remove(documentPaths)
        if (error) throw error
      }

      // 3) Supprimer aussi les dossiers Storage du chantier pour éviter les fichiers orphelins
      // (ex: devis uploadés sans chemin stocké en base)
      const removeFolderContents = async (bucket, folder) => {
        const { data: listed, error: listErr } = await supabase.storage.from(bucket).list(folder, {
          limit: 1000,
          offset: 0,
        })
        if (listErr) throw listErr

        const files = (listed || [])
          .filter(item => item.name && !item.id?.endsWith?.('/'))
          .map(item => `${folder}/${item.name}`)

        if (files.length > 0) {
          const { error: removeErr } = await supabase.storage.from(bucket).remove(files)
          if (removeErr) throw removeErr
        }
      }

      // bucket photos
      await removeFolderContents('photos', `chantiers/${id}/avant`)
      await removeFolderContents('photos', `chantiers/${id}/pendant`)
      await removeFolderContents('photos', `chantiers/${id}/apres`)
      await removeFolderContents('photos', `chantiers/${id}/maquette`)

      // bucket documents
      await removeFolderContents('documents', `chantiers/${id}/devis`)
      await removeFolderContents('documents', `chantiers/${id}/devis_signes`)
      await removeFolderContents('documents', `chantiers/${id}/factures`)

      // 4) Supprimer les lignes liées en base
      const deletes = [
        supabase.from('suivi_financier').delete().eq('dossier_id', id),
        supabase.from('chantier_fiches_techniques').delete().eq('dossier_id', id),
        supabase.from('rendez_vous').delete().eq('dossier_id', id),
        supabase.from('interventions_artisans').delete().eq('dossier_id', id),
        supabase.from('photos').delete().eq('dossier_id', id),
        supabase.from('devis_artisans').delete().eq('dossier_id', id),
      ]

      const results = await Promise.all(deletes)
      const deleteError = results.find(r => r.error)?.error
      if (deleteError) throw deleteError

      // 5) Supprimer le dossier chantier
      const { error: dossierErr } = await supabase
        .from('dossiers')
        .delete()
        .eq('id', id)

      if (dossierErr) throw dossierErr

      router.push('/chantiers')
    } catch (err) {
      setErreur('Erreur suppression chantier : ' + err.message)
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/clients/${client?.id}`)} className="text-gray-400 hover:text-gray-600 text-sm">← Retour</button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-blue-900">{dossier.reference}</h1>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${s.color}`}>{s.label}</span>
            </div>
            <p className="text-xs text-gray-400">{nomComplet} — {typologieLabel(dossier.typologie)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {mode === 'lecture' ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => generatePDF('recapitulatif')}
                disabled={!!generatingPDF}
                className="border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
                {generatingPDF === 'recapitulatif' ? '⏳ Génération...' : '📄 Récapitulatif'}
              </button>
              <button
                onClick={() => generatePDF('dossier_restitution')}
                disabled={!!generatingPDF}
                className="border border-orange-300 text-orange-700 px-3 py-2 rounded-lg text-sm hover:bg-orange-50 disabled:opacity-50">
                {generatingPDF === 'dossier_restitution' ? '⏳ Génération...' : '🎁 Dossier restitution'}
              </button>
              <button onClick={() => setMode('edition')} className="bg-blue-800 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-900">Modifier</button>
            </div>
          ) : (
            <>
              <button onClick={() => setMode('lecture')} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
              <button onClick={handleSave} disabled={saving} className="bg-blue-800 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-900 disabled:opacity-50">
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {succes && <p className="text-green-600 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-2">{succes}</p>}
        {erreur && <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-2">{erreur}</p>}

        {/* Infos générales */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Informations générales</h2>
          {mode === 'lecture' ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                {[
                  ['Référence', dossier.reference],
                  ['Référente', dossier.referente ? `${dossier.referente.prenom} ${dossier.referente.nom}` : '—'],
                  ['Typologie', typologieLabel(dossier.typologie)],
                  ['Date limite devis', dossier.date_limite_devis ? new Date(dossier.date_limite_devis).toLocaleDateString('fr-FR') : '—'],
                  ['Démarrage chantier', dossier.date_demarrage_chantier ? new Date(dossier.date_demarrage_chantier).toLocaleDateString('fr-FR') : '—'],
                  ['Fin de chantier', dossier.date_fin_chantier ? new Date(dossier.date_fin_chantier).toLocaleDateString('fr-FR') : '—'],
                ].map(([label, valeur]) => (
                  <div key={label}>
                    <p className="text-xs text-gray-400 mb-1">{label}</p>
                    <p className="text-sm font-medium text-gray-800">{valeur}</p>
                  </div>
                ))}
              </div>
              {dossier.resume_projet && (
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-xs text-gray-400 mb-1">Résumé du projet</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{dossier.resume_projet}</p>
                </div>
              )}
              <div className="border-t border-gray-100 pt-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Contrat de prestation</p>
                  {dossier.contrat_signe && dossier.date_signature_contrat && (
                    <p className="text-xs text-gray-400">Signé le {new Date(dossier.date_signature_contrat).toLocaleDateString('fr-FR')}</p>
                  )}
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={dossier.contrat_signe || false}
                    onChange={async (e) => {
                      const signe = e.target.checked
                      let dateSignature = dossier.date_signature_contrat
                      if (signe && !dateSignature) {
                        const today = new Date().toISOString().slice(0, 10)
                        const [annee, mois, jour] = today.split('-')
                        const saisi = prompt('Date de signature du contrat (JJ/MM/AAAA) :', `${jour}/${mois}/${annee}`)
                        if (saisi) {
                          const [j, m, a] = saisi.split('/')
                          dateSignature = `${a}-${m.padStart(2,'0')}-${j.padStart(2,'0')}`
                        }
                      }
                      await supabase.from('dossiers').update({ contrat_signe: signe, date_signature_contrat: signe ? dateSignature : null }).eq('id', id)
                      setDossier(d => ({ ...d, contrat_signe: signe, date_signature_contrat: signe ? dateSignature : null }))
                      setSucces('Contrat mis à jour ✓')
                    }}
                    className="w-4 h-4 accent-blue-700" />
                  <span className={`text-sm font-medium ${dossier.contrat_signe ? 'text-green-600' : 'text-gray-500'}`}>
                    {dossier.contrat_signe ? 'Signé' : 'Non signé'}
                  </span>
                </label>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
                  <select value={dossier.statut} onChange={e => set('statut', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="en_cours">En cours</option>
                    <option value="en_attente">En attente</option>
                    <option value="termine">Terminé</option>
                    <option value="annule">Annulé</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Typologie</label>
                  <select value={dossier.typologie} onChange={e => set('typologie', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="courtage">Courtage</option>
                    <option value="amo">AMO</option>
                    <option value="estimo">Estimo</option>
                    <option value="audit_energetique">Audit énergétique</option>
                    <option value="studio_jardin">Studio de jardin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date limite devis</label>
                  <input type="date" value={dossier.date_limite_devis || ''} onChange={e => set('date_limite_devis', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Démarrage chantier</label>
                  <input type="date" value={dossier.date_demarrage_chantier || ''} onChange={e => set('date_demarrage_chantier', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fin de chantier</label>
                  <input type="date" value={dossier.date_fin_chantier || ''} onChange={e => set('date_fin_chantier', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-700">Contrat de prestation</p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={dossier.contrat_signe || false} onChange={e => set('contrat_signe', e.target.checked)} className="w-4 h-4 accent-blue-700" />
                    <span className="text-sm text-gray-600">Signé</span>
                  </label>
                </div>
                {dossier.contrat_signe && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date de signature</label>
                    <input type="date" value={dossier.date_signature_contrat || ''} onChange={e => set('date_signature_contrat', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                )}
              </div>
            </div>
          )}
          <button
            onClick={supprimerChantier}
            disabled={saving}
            className="px-4 py-2 rounded-lg border border-red-200 text-res-600 hover:bg-red-50 text-sm font medium disabled:opacity-50"
            >
              Supprimer le chantier
            </button>
        </div>

        {/* Frais de consultation */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Frais de consultation</h2>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${f.color}`}>{f.label}</span>
          </div>
          {mode === 'lecture' ? (
            <div className="space-y-2">
              {frais ? (
                <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-400">Montant TTC</span>
                    <span className="font-medium">{frais.ttc.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-400">Montant HT</span>
                    <span className="font-medium">{frais.ht.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-400">Royalties illiCO France</span>
                    <span className="font-medium text-red-500">- {frais.royalties.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-200 pt-1">
                    <span className="text-xs text-gray-400">Net</span>
                    <span className="font-medium">{frais.net.toFixed(2)} €</span>
                  </div>
                  {!estChantierMarine && (
                    <div className="flex justify-between">
                      <span className="text-xs text-blue-500">Part {dossier.referente?.prenom || 'Agente'}</span>
                      <span className="font-medium text-blue-700">{frais.partAgente.toFixed(2)} €</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-xs text-purple-500">Part {nomFranchisee}</span>
                    <span className="font-medium text-purple-700">{frais.partAdmin.toFixed(2)} €</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400">Offerts</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
                <select value={dossier.frais_statut} onChange={e => set('frais_statut', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="offerts">Offerts</option>
                  <option value="factures">Facturés (à régler)</option>
                  <option value="regle">Facturés et réglés</option>
                </select>
              </div>
              {dossier.frais_statut !== 'offerts' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Montant TTC (€)</label>
                  <input type="number" step="0.01" min="0" value={dossier.frais_consultation || ''}
                    onChange={e => set('frais_consultation', e.target.value === ''?'' :parseFloat(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Devis artisans */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Devis artisans ({devis.length})</h2>
            <button onClick={() => setAjouterDevis(true)} className="text-sm bg-blue-800 text-white px-3 py-1.5 rounded-lg hover:bg-blue-900">+ Ajouter</button>
          </div>

          {ajouterDevis && (
            <div className="border border-blue-200 bg-blue-50 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-blue-800">Nouveau devis</p>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Artisan *</label>
                <select value={nouveauDevis.artisan_id} onChange={e => setND('artisan_id', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Choisir un artisan —</option>
                  {artisans.map(a => <option key={a.id} value={a.id}>{a.entreprise}{a.metier ? ` (${a.metier})` : ''}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Montant HT (€)</label>
                  <input type="number" step="0.01" min="0" value={nouveauDevis.montant_ht} onChange={e => setND('montant_ht', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Montant TTC (€)</label>
                  <input type="number" step="0.01" min="0" value={nouveauDevis.montant_ttc} onChange={e => setND('montant_ttc', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className={`grid gap-3 ${estChantierMarine ? 'grid-cols-1' : 'grid-cols-2'}`}>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Commission (%)</label>
                  <input type="number" step="0.1" min="0" max="100" value={nouveauDevis.commission_pourcentage} placeholder="ex: 15"
                    onChange={e => setND('commission_pourcentage', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                {!estChantierMarine && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Répartition</label>
                    <select value={nouveauDevis.part_agente} onChange={e => setND('part_agente', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="0.5">50 / 50</option>
                      <option value="0.6">60 / 40</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Date de réception</label>
                  <input type="date" value={nouveauDevis.date_reception} onChange={e => setND('date_reception', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Date limite</label>
                  <input type="date" value={nouveauDevis.date_limite} onChange={e => setND('date_limite', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">PDF du devis (optionnel)</label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <span className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700">
                    {nouveauDevis.fichier ? '✓ ' + nouveauDevis.fichier.name : '+ Choisir un PDF'}
                  </span>
                  {nouveauDevis.fichier && <button type="button" onClick={() => setND('fichier', null)} className="text-xs text-red-400 hover:text-red-600">Supprimer</button>}
                  <input type="file" accept=".pdf" className="hidden" onChange={e => setND('fichier', e.target.files[0] || null)} />
                </label>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setAjouterDevis(false)} className="flex-1 border border-gray-300 text-gray-700 py-1.5 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
                <button onClick={sauvegarderDevis} disabled={!nouveauDevis.artisan_id || savingDevis}
                  className="flex-1 bg-blue-800 text-white py-1.5 rounded-lg text-sm hover:bg-blue-900 disabled:opacity-50">
                  {savingDevis ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          )}

          {devis.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Aucun devis pour ce chantier</p>
          ) : (
            <div className="space-y-3">
              {devis.map(d => {
                const { comHT, comTTC, royalties, royaltiesArtisan, net, partAgente, partAdmin, apporteurTTC, apporteurPartAgente, apporteurPartAdmin } = calculer(d)
                const sd = statutDevisConfig[d.statut]
                return (
                  <div key={d.id} className="border border-gray-100 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{d.artisan?.entreprise}</p>
                        <p className="text-xs text-gray-400">{d.artisan?.metier}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${sd.color}`}>{sd.label}</span>
                        <button onClick={() => setDevisEnEdition(d.id === devisEnEdition ? null : d.id)} className="text-blue-400 text-xs hover:text-blue-600">
                          {devisEnEdition === d.id ? 'Fermer' : 'Modifier'}
                        </button>
                        <button onClick={() => supprimerDevis(d.id)} className="text-red-400 text-xs hover:text-red-600">Supprimer</button>
                      </div>
                    </div>

                    {/* Infos client */}
                    <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="text-xs text-gray-400">Montant HT</span>
                        <span className="font-medium">{d.montant_ht ? `${d.montant_ht.toFixed(2)} €` : '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-gray-400">Montant TTC</span>
                        <span className="font-medium">{d.montant_ttc ? `${d.montant_ttc.toFixed(2)} €` : '—'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-400">Acompte</span>
                        <div className="flex items-center gap-2">
                          <select value={d.acompte_pourcentage || 30}
                            onChange={async e => {
                              await supabase.from('devis_artisans').update({ acompte_pourcentage: parseFloat(e.target.value) }).eq('id', d.id)
                              await chargerDevis()
                            }}
                            className="border border-gray-200 rounded px-2 py-0.5 text-xs focus:outline-none">
                            <option value={30}>30%</option>
                            <option value={40}>40%</option>
                            <option value={-1}>Montant</option>
                          </select>
                          {d.acompte_pourcentage === -1 && (
                            <input type="number" step="0.01" placeholder="Montant TTC" defaultValue={d.acompte_montant_fixe || ''}
                              onBlur={async e => {
                                await supabase.from('devis_artisans').update({ acompte_montant_fixe: parseFloat(e.target.value) }).eq('id', d.id)
                                await chargerDevis()
                              }}
                              className="w-24 border border-gray-200 rounded px-2 py-0.5 text-xs focus:outline-none" />
                          )}
                          <span className="text-xs font-medium">
                            {(d.acompte_pourcentage === -1 ? (d.acompte_montant_fixe || 0) : montantAcompte(d)).toFixed(2)} € TTC
                          </span>
                        </div>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-gray-400">Commission</span>
                        <span className="font-medium">{d.commission_pourcentage ? `${(d.commission_pourcentage * 100).toFixed(1)} %` : '—'}</span>
                      </div>
                      {!estChantierMarine && (
                        <div className="flex justify-between">
                          <span className="text-xs text-gray-400">Répartition</span>
                          <span className="font-medium">{d.part_agente === 0.6 ? '60/40' : '50/50'}</span>
                        </div>
                      )}
                      {d.date_signature && (
                        <div className="flex justify-between">
                          <span className="text-xs text-green-500">Signé le</span>
                          <span className="font-medium text-green-700">{new Date(d.date_signature).toLocaleDateString('fr-FR')}</span>
                        </div>
                      )}
                    </div>

                    {/* Vision financière — accordéon */}
                    <details className="border border-blue-100 rounded-lg">
                      <summary className="px-3 py-2 text-xs font-medium text-blue-700 cursor-pointer hover:bg-blue-50 rounded-lg">
                        💰 Vision financière
                      </summary>
                      <div className="p-3 space-y-3">
                        {/* COM artisans */}
                        <div className="bg-gray-50 rounded p-3 space-y-1 text-xs">
                          <p className="font-medium text-gray-600 uppercase mb-1">Commissions artisan</p>
                          <div className="flex justify-between"><span className="text-gray-400">Commissions HT</span><span className="font-medium">{comHT.toFixed(2)} €</span></div>
                          <div className="flex justify-between"><span className="text-gray-400">Commissions TTC</span><span className="font-medium">{comTTC.toFixed(2)} €</span></div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Royalties illiCO artisans TTC</span>
                            <span className="font-medium text-red-400"> {royaltiesArtisan.toFixed(2)} €</span>
                          </div>
                          <div className="flex justify-between border-t border-gray-200 pt-1">
                            <span className="text-gray-400">Net</span>
                            <span className="font-medium">{net.toFixed(2)} €</span>
                          </div>
                          {/* Part agente : toujours visible si chantier agente */}
                          {!estChantierMarine && (
                            <div className="flex justify-between"><span className="text-blue-500">{dossier.referente?.prenom || 'Agente'}</span><span className="font-medium text-blue-700">{partAgente.toFixed(2)} €</span></div>
                          )}
                          {/* Part franchisée : visible sauf si la franchisée regarde ses propres chantiers */}
                          {!(isMarine && estChantierMarine) && (
                            <div className="flex justify-between"><span className="text-purple-500">{nomFranchisee}</span><span className="font-medium text-purple-700">{partAdmin.toFixed(2)} €</span></div>
                          )}
                        </div>
                        {/* Apporteur par devis */}
                        {client?.apporteur_affaires && client?.apporteur_base === 'par_devis' && apporteurTTC > 0 && (
                          <div className="bg-orange-50 rounded p-3 space-y-1 text-xs">
                            <p className="font-medium text-orange-700 uppercase mb-1">Apporteur — {client.apporteur_nom} ({client.apporteur_pourcentage}%)</p>
                            <div className="flex justify-between"><span className="text-orange-500">Total TTC</span><span className="font-medium text-orange-600">- {apporteurTTC.toFixed(2)} €</span></div>
                            {!estChantierMarine && <div className="flex justify-between"><span className="text-orange-400">{dossier.referente?.prenom || 'Agente'}</span><span className="font-medium text-orange-500">- {apporteurPartAgente.toFixed(2)} €</span></div>}
                            {!(isMarine && estChantierMarine) && (
                              <div className="flex justify-between"><span className="text-orange-400">{nomFranchisee}</span><span className="font-medium text-orange-500">- {apporteurPartAdmin.toFixed(2)} €</span></div>
                            )}
                          </div>
                        )}
                        {/* Total gains devis */}
                        <div className="bg-gray-100 rounded p-3 space-y-1 text-xs">
                          <p className="font-medium text-gray-700 uppercase mb-1">Total gains ce devis</p>
                          {!estChantierMarine && (
                            <div className="flex justify-between">
                              <span className="text-blue-600 font-medium">{dossier.referente?.prenom || 'Agente'}</span>
                              <span className="font-bold text-blue-700">{(partAgente - apporteurPartAgente).toFixed(2)} €</span>
                            </div>
                          )}
                          {!(isMarine && estChantierMarine) && (
                            <div className="flex justify-between">
                              <span className="text-purple-600 font-medium">{nomFranchisee}</span>
                              <span className="font-bold text-purple-700">{(partAdmin - apporteurPartAdmin).toFixed(2)} €</span>
                            </div>
                          )}
                          {isMarine && estChantierMarine && (
                            <div className="flex justify-between">
                              <span className="text-gray-600 font-medium">Net</span>
                              <span className="font-bold text-gray-700">{(net - apporteurTTC).toFixed(2)} €</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </details>

                    {devisEnEdition === d.id && (
                      <EditDevis devis={d} isMarine={estChantierMarine} onSave={(updates) => modifierDevis(d.id, updates)} onCancel={() => setDevisEnEdition(null)} />
                    )}

                    <div className="flex gap-2 pt-1 border-t border-gray-100">
                      {['en_attente', 'recu', 'accepte', 'refuse'].map(st => (
                        <button key={st} onClick={() => changerStatutDevis(d.id, st)}
                          className={`text-xs px-2 py-1 rounded-full border transition-all ${d.statut === st ? statutDevisConfig[st].color + ' border-transparent font-medium' : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}>
                          {statutDevisConfig[st].label}
                        </button>
                      ))}
                    </div>

                    {/* ── DOCUMENTS : Devis signé + Facture ── */}
                    <div className="pt-2 border-t border-gray-100 space-y-2">
                      {/* Devis signé */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 font-medium">📄 Devis signé client</span>
                        <div className="flex items-center gap-2">
                          {d.devis_signe_path ? (
                            <>
                              <button onClick={() => ouvrirDocument(d.devis_signe_path)}
                                className="text-xs text-blue-600 hover:underline">Voir PDF</button>
                              <button onClick={() => supprimerDevisSigne(d.id, d.devis_signe_path)}
                                className="text-xs text-red-400 hover:text-red-600">Supprimer</button>
                            </>
                          ) : (
                            <label className={`text-xs cursor-pointer px-2 py-1 rounded border transition-all ${uploadingDoc === d.id ? 'text-gray-400 border-gray-200' : 'text-blue-600 border-blue-200 hover:bg-blue-50'}`}>
                              {uploadingDoc === d.id ? 'Upload...' : '+ Uploader'}
                              <input type="file" accept=".pdf" className="hidden" disabled={uploadingDoc === d.id}
                                onChange={e => e.target.files[0] && uploadDevisSigne(d.id, e.target.files[0])} />
                            </label>
                          )}
                        </div>
                      </div>
                      {/* Facture artisan */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 font-medium">🧾 Facture artisan</span>
                        <div className="flex items-center gap-2">
                          {d.facture_path ? (
                            <>
                              <button onClick={() => ouvrirDocument(d.facture_path)}
                                className="text-xs text-blue-600 hover:underline">Voir PDF</button>
                              <button onClick={() => supprimerFacture(d.id, d.facture_path)}
                                className="text-xs text-red-400 hover:text-red-600">Supprimer</button>
                            </>
                          ) : (
                            <label className={`text-xs cursor-pointer px-2 py-1 rounded border transition-all ${uploadingDoc === d.id + '_fact' ? 'text-gray-400 border-gray-200' : 'text-green-600 border-green-200 hover:bg-green-50'}`}>
                              {uploadingDoc === d.id + '_fact' ? 'Upload...' : '+ Uploader'}
                              <input type="file" accept=".pdf" className="hidden" disabled={uploadingDoc === d.id + '_fact'}
                                onChange={e => e.target.files[0] && uploadFacture(d.id, e.target.files[0])} />
                            </label>
                          )}
                        </div>
                      </div>
                      {/* Qualification artisan */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 font-medium">🏅 Qualification (RGE, Qualibat…)</span>
                        <div className="flex items-center gap-2">
                          {d.qualification_path ? (
                            <>
                              <button onClick={() => ouvrirDocument(d.qualification_path)}
                                className="text-xs text-blue-600 hover:underline">Voir PDF</button>
                              <button onClick={() => supprimerQualification(d.id, d.qualification_path)}
                                className="text-xs text-red-400 hover:text-red-600">Supprimer</button>
                            </>
                          ) : (
                            <label className={`text-xs cursor-pointer px-2 py-1 rounded border transition-all ${uploadingQual === d.id ? 'text-gray-400 border-gray-200' : 'text-purple-600 border-purple-200 hover:bg-purple-50'}`}>
                              {uploadingQual === d.id ? 'Upload...' : '+ Uploader'}
                              <input type="file" accept=".pdf" className="hidden" disabled={uploadingQual === d.id}
                                onChange={e => e.target.files[0] && uploadQualification(d.id, e.target.files[0])} />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-50">
                      <button onClick={() => setFichesPanelOuvert(fichesPanelOuvert === d.id ? null : d.id)} className="text-xs text-blue-600 hover:underline">
                        🗂 Fiches techniques ({fichesTechChantier[d.artisan_id]?.length || 0})
                      </button>
                      {fichesPanelOuvert === d.id && (
                        <FichesTechPanel artisanId={d.artisan_id} fichesCochees={fichesTechChantier[d.artisan_id] || []} onToggle={toggleFicheTech} />
                      )}
                    </div>
                    {/* Bouton intervention rapide sur devis accepté */}
                    {d.statut === 'accepte' && (
                      <div className="pt-2 border-t border-gray-50">
                        <button
                          onClick={() => { setNouvIntervArtisanId(d.artisan_id); setModalCreerIntervOuvert(true) }}
                          className="text-xs text-green-700 border border-green-200 px-2 py-1 rounded hover:bg-green-50">
                          📅 Planifier une intervention
                        </button>
                        {/* Interventions existantes pour cet artisan */}
                        {interventionsDossier.filter(i => i.artisan_id === d.artisan_id).map(i => (
                          <div key={i.id} className="mt-1 text-xs text-gray-500 flex items-center gap-2">
                            <span>🔨</span>
                            {i.type_intervention === 'periode'
                              ? `${new Date(i.date_debut).toLocaleDateString('fr-FR')} → ${new Date(i.date_fin).toLocaleDateString('fr-FR')}`
                              : `${i.jours_specifiques?.length} jour(s)`}
                            {i.notes && <span className="text-gray-400">— {i.notes}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Récapitulatif chantier */}
          {devis.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-3 border border-gray-200">
              <p className="text-xs font-medium text-gray-600 uppercase">Récapitulatif chantier</p>

              {/* Frais consultation */}
              {frais && dossier.frais_statut !== 'offerts' && (
                <div className="space-y-1">
                  <p className="text-xs text-gray-400 font-medium">Frais de consultation</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Montant TTC</span>
                    <span className={`font-medium ${dossier.frais_statut === 'regle' ? 'text-green-600' : 'text-gray-800'}`}>
                      {frais.ttc.toFixed(2)} € {dossier.frais_statut === 'regle' ? '✅' : '⏳'}
                    </span>
                  </div>
                </div>
              )}

              {/* Devis */}
              <div className="space-y-1 border-t border-gray-200 pt-2">
                <p className="text-xs text-gray-400 font-medium">Devis artisans signés</p>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total HT</span>
                  <span className="font-medium text-gray-800">{totalDevisHT.toFixed(2)} €</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total TTC</span>
                  <span className="font-medium text-gray-800">{totalDevisTTC.toFixed(2)} €</span>
                </div>
              </div>

              {/* Honoraires */}
              {['courtage', 'amo'].includes(dossier.typologie) && totalDevisTTCSignes > 0 && (
                <div className="space-y-1 border-t border-gray-200 pt-2">
                  <p className="text-xs text-gray-400 font-medium">Honoraires client (sur {totalDevisTTCSignes.toFixed(2)} € TTC signés)</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Honoraires courtage ({tauxCourtagePct}%)</span>
                    <span className="font-medium text-gray-800">{honorairesCourtage.toFixed(2)} €</span>
                  </div>

                  {dossier.typologie === 'amo' && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Solde AMO ({dossier.honoraires_amo_taux || 9}%)</span>
                        <span className="font-medium text-gray-800">{(honorairesAMO - honorairesCourtage).toFixed(2)} €</span>
                      </div>
                      <div className="flex justify-between text-sm border-t border-gray-200 pt-1">
                        <span className="font-medium text-gray-700">Total honoraires AMO</span>
                        <span className="font-bold text-gray-800">{honorairesAMO.toFixed(2)} €</span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Vision financière globale — accordéon */}
              <details className="border-t border-gray-200 pt-2">
                <summary className="text-xs font-medium text-blue-700 cursor-pointer hover:text-blue-900">💰 Vision financière globale</summary>
                <div className="mt-3 space-y-2">

                  {/* Totaux COM */}
                  <div className="bg-gray-100 rounded p-3 space-y-1 text-xs">
                    <p className="font-medium text-gray-600 uppercase mb-1">Commissions artisans (totaux)</p>
                    <div className="flex justify-between"><span className="text-gray-400">Total Commissions HT</span><span>{totalComHT.toFixed(2)} €</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Total Commissions TTC</span><span>{totalComTTC.toFixed(2)} €</span></div>
                    
                    <div className="flex justify-between">
                      <span className="text-gray-400">Royalties illiCO artisans TTC</span>
                      <span className="text-red-400"> {totalRoyaltiesArtisan.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Royalties illiCO com TTC</span>
                      <span className="text-red-500">- {totalRoyalties.toFixed(2)} €</span>
                    </div>
                    {!estChantierMarine && <div className="flex justify-between"><span className="text-blue-500">{dossier.referente?.prenom || 'Agente'}</span><span className="text-blue-700">{totalPartAgente.toFixed(2)} €</span></div>}
                    <div className="flex justify-between"><span className="text-purple-500">{nomFranchisee}</span><span className="text-purple-700">{totalPartAdmin.toFixed(2)} €</span></div>
                  </div>

                  {/* Apporteur global */}
                  {client?.apporteur_affaires && totalApporteurTTC > 0 && (
                    <div className="bg-orange-50 rounded p-3 space-y-1 text-xs">
                      <p className="font-medium text-orange-700 uppercase mb-1">
                        Apporteur — {client.apporteur_nom} ({client.apporteur_pourcentage}% {client.apporteur_base === 'par_devis' ? 'par devis' : 'sur total chantier'})
                      </p>
                      <div className="flex justify-between"><span className="text-orange-500">Total TTC</span><span className="text-orange-600">- {totalApporteurTTC.toFixed(2)} €</span></div>
                      {!estChantierMarine && <div className="flex justify-between"><span className="text-orange-400">{dossier.referente?.prenom || 'Agente'}</span><span className="text-orange-500">- {totalApporteurPartAgente.toFixed(2)} €</span></div>}
                      <div className="flex justify-between"><span className="text-orange-400">{nomFranchisee}</span><span className="text-orange-500">- {totalApporteurPartAdmin.toFixed(2)} €</span></div>
                    </div>
                  )}

                  {/* Parts honoraires */}
                  {honTotal > 0 && (
                    <div className="bg-blue-50 rounded p-3 space-y-1 text-xs">
                      <p className="font-medium text-blue-700 uppercase mb-1">Part honoraires</p>
                      {!estChantierMarine && <div className="flex justify-between"><span className="text-blue-500">{dossier.referente?.prenom || 'Agente'}</span><span className="text-blue-700">{honAgente.toFixed(2)} €</span></div>}
                      <div className="flex justify-between"><span className="text-purple-500">{nomFranchisee}</span><span className="text-purple-700">{honAdmin.toFixed(2)} €</span></div>
                    </div>
                  )}

                  {/* TOTAL GAINS */}
                  <div className="bg-gray-200 rounded p-3 space-y-1 text-xs">
                    <p className="font-bold text-gray-700 uppercase mb-1">Total gains</p>
                    {!estChantierMarine && (
                      <div className="flex justify-between">
                        <span className="text-blue-600 font-bold">{dossier.referente?.prenom || 'Agente'}</span>
                        <span className="font-bold text-blue-700">{totalGainAgente.toFixed(2)} €</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-purple-600 font-bold">{nomFranchisee}</span>
                      <span className="font-bold text-purple-700">{totalGainAdmin.toFixed(2)} €</span>
                    </div>
                  </div>
                </div>
              </details>
            </div>
          )}
        </div>

        {/* Honoraires client */}
        {['courtage', 'amo'].includes(dossier.typologie) && totalDevisTTCSignes > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">Honoraires client</h2>
            <p className="text-xs text-gray-400">
              Calculés sur {totalDevisTTCSignes.toFixed(2)} € TTC de devis signés
            </p>

            <div className="border border-gray-100 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">
                  Honoraires courtage ({tauxCourtagePct}%)
                </p>
                <span className="text-sm font-bold text-gray-800">
                  {honorairesCourtage.toFixed(2)} €
                </span>
              </div>
              <p className="text-xs text-gray-400 mb-3">
                {tauxCourtagePct}% × {totalDevisTTCSignes.toFixed(2)} € TTC — Échéance : 48h après signature devis
              </p>
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-medium text-blue-700">Taux courtage (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="20"
                      value={(dossier.taux_courtage ?? 0.06) * 100}
                      onChange={async e => {
                        const taux = parseFloat(e.target.value || 0) / 100
                        set('taux_courtage', taux)
                        await supabase.from('dossiers').update({ taux_courtage: taux }).eq('id', id)
                      }}
                      className="w-24 border border-blue-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
              <div className="mt-3">
                <select
                  value={suiviCourtage?.statut_client || 'en_attente'}
                  onChange={e => majSuiviChantier('honoraires_courtage', honorairesCourtage, 'statut_client', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer"
                >
                  <option value="en_attente">⏳ En attente</option>
                  <option value="envoye">📤 Facturé</option>
                  <option value="regle">✅ Réglé</option>
                </select>
              </div>
            </div>

            {dossier.typologie === 'amo' && (
              <div className="border border-blue-100 rounded-lg p-4 bg-blue-50">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-blue-800">
                    Honoraires AMO ({(Number(tauxCourtagePct) + Number(tauxAmoPct)).toFixed(1)}%)
                  </p>
                  <span className="text-sm font-bold text-blue-900">
                    {honorairesAMO.toFixed(2)} €
                  </span>
                </div>
                <p className="text-xs text-blue-500 mb-3">
                  {tauxCourtagePct}% courtage + {tauxAmoPct}% AMO × {totalDevisTTCSignes.toFixed(2)} € TTC
                </p>

                <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-medium text-blue-700">Taux AMO (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="20"
                      value={dossier.honoraires_amo_taux ?? 9}
                      onChange={async e => {
                        const taux = parseFloat(e.target.value || 0)
                        set('honoraires_amo_taux', taux)
                        await supabase.from('dossiers').update({ honoraires_amo_taux: taux }).eq('id', id)
                      }}
                      className="w-24 border border-blue-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="bg-white rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-blue-700">
                        Acompte AMO ({tauxCourtagePct}%) — {honorairesCourtage.toFixed(2)} €
                      </span>
                      <span className="text-xs text-blue-400">Signature devis</span>
                    </div>
                    <select
                      value={suiviAcompteAMO?.statut_client || 'en_attente'}
                      onChange={e => majSuiviChantier('acompte_amo', honorairesCourtage, 'statut_client', e.target.value)}
                      className="border border-blue-200 rounded px-2 py-0.5 text-xs focus:outline-none bg-white"
                    >
                      <option value="en_attente">En attente</option>
                      <option value="envoye">Facturé</option>
                      <option value="regle">✅ Réglé</option>
                    </select>
                  </div>

                  <div className="bg-white rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-blue-700">
                        Solde AMO ({tauxAmoPct}%) — {(honorairesAMO - honorairesCourtage).toFixed(2)} €
                      </span>
                      <span className="text-xs text-blue-400">Fin de chantier</span>
                    </div>
                    <select
                      value={suiviSoldeAMO?.statut_client || 'en_attente'}
                      onChange={e => majSuiviChantier('solde_amo', honorairesAMO - honorairesCourtage, 'statut_client', e.target.value)}
                      className="border border-blue-200 rounded px-2 py-0.5 text-xs focus:outline-none bg-white"
                    >
                      <option value="en_attente">En attente</option>
                      <option value="envoye">Facturé</option>
                      <option value="regle">✅ Réglé</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Photos du chantier */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Photos du chantier</h2>
          <div className="flex gap-2 flex-wrap">
            {['avant', 'pendant', 'apres', 'maquette'].map(cat => (
              <button key={cat} onClick={() => setCategorie(cat)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all ${categorie === cat ? 'bg-blue-800 text-white border-blue-800' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                {cat === 'avant' ? 'Avant' : cat === 'pendant' ? 'Pendant' : cat === 'apres' ? 'Après' : 'Maquette'}
                {photos.filter(p => p.categorie === cat).length > 0 && <span className="ml-1">({photos.filter(p => p.categorie === cat).length})</span>}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <label className={`cursor-pointer flex items-center gap-2 text-xs px-3 py-2 rounded-lg border transition-all ${uploadingPhoto ? 'bg-gray-100 text-gray-400' : 'border-blue-300 text-blue-700 hover:bg-blue-50'}`}>
              {uploadingPhoto ? 'Upload en cours...' : `+ Ajouter une photo (${categorie === 'avant' ? 'Avant' : categorie === 'pendant' ? 'Pendant' : categorie === 'apres' ? 'Après' : 'Maquette'})`}
              <input type="file" accept="image/*" multiple className="hidden" disabled={uploadingPhoto} onChange={e => uploadPhotos(Array.from(e.target.files))} />
            </label>
          </div>
          {photos.filter(p => p.categorie === categorie).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Aucune photo dans cette catégorie</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {photos.filter(p => p.categorie === categorie).map((photo, index) => (
                <div key={photo.id} className="relative group rounded-lg border border-gray-100 cursor-pointer bg-gray-100" onClick={() => setPhotoOuverte(index)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url_signee} alt="" onError={e => e.target.style.border = '2px solid red'}
                    style={{ width: '100%', height: '128px', objectFit: 'cover', display: 'block', borderRadius: '8px' }} />
                  <div className="absolute inset-0 flex items-end justify-end p-1 opacity-0 group-hover:opacity-100">
                    <button onClick={e => { e.stopPropagation(); supprimerPhoto(photo.id, photo.url) }}
                      className="bg-red-500 text-white text-xs px-2 py-1 rounded">Supprimer</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {photoOuverte !== null && (
            <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center" onClick={() => setPhotoOuverte(null)}>
              <button onClick={e => { e.stopPropagation(); setPhotoOuverte(i => i > 0 ? i - 1 : photos.filter(p => p.categorie === categorie).length - 1) }}
                className="absolute left-4 text-white text-3xl px-4 py-2 hover:bg-white hover:bg-opacity-20 rounded">‹</button>
              <div onClick={e => e.stopPropagation()} className="max-w-4xl max-h-screen p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photos.filter(p => p.categorie === categorie)[photoOuverte]?.url_signee} alt=""
                  className="max-h-screen max-w-full object-contain rounded" />
                <p className="text-white text-center text-sm mt-2 opacity-60">
                  {photoOuverte + 1} / {photos.filter(p => p.categorie === categorie).length} — Clic en dehors pour fermer
                </p>
              </div>
              <button onClick={e => { e.stopPropagation(); setPhotoOuverte(i => i < photos.filter(p => p.categorie === categorie).length - 1 ? i + 1 : 0) }}
                className="absolute right-4 text-white text-3xl px-4 py-2 hover:bg-white hover:bg-opacity-20 rounded">›</button>
            </div>
          )}
        </div>

        {/* Planning du chantier */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Planning</h2>
            <div className="flex gap-2">
              <button onClick={() => { setNouvIntervArtisanId(null); setModalCreerIntervOuvert(true) }}
                className="text-sm border border-green-300 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-50">+ Intervention</button>
              <button onClick={() => setModalRdvOuvert(true)} className="text-sm bg-blue-800 text-white px-3 py-1.5 rounded-lg hover:bg-blue-900">+ RDV</button>
            </div>
          </div>
          {rdvsDossier.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-2">Rendez-vous</p>
              <div className="space-y-2">
                {rdvsDossier.map(r => {
                  const typeConfig = {
                    visite_technique_client: { label: 'R1 — Visite technique client', color: 'bg-blue-100 text-blue-700' },
                    visite_technique_artisan: { label: 'R2 — Visite technique avec artisan', color: 'bg-green-100 text-green-700' },
                    presentation_devis: { label: 'R3 — Présentation devis', color: 'bg-amber-100 text-amber-700' },
                  }
                  const tc = typeConfig[r.type_rdv]
                  return (
                    <div key={r.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                      <div>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${tc.color}`}>{tc.label}</span>
                        <p className="text-sm font-medium text-gray-800 mt-1">
                          {new Date(r.date_heure).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                          {r.artisan && ` — ${r.artisan.entreprise}`}
                        </p>
                        {r.notes && <p className="text-xs text-gray-400">{r.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setRdvEnEdition(r); setModalRdvOuvert(true) }} className="text-blue-400 text-xs hover:text-blue-600">Modifier</button>
                        <button onClick={() => supprimerRdvDossier(r.id)} className="text-red-400 text-xs hover:text-red-600">Supprimer</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {interventionsDossier.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-2">Interventions artisans</p>
              <div className="space-y-2">
                {interventionsDossier.map(i => (
                  <div key={i.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-800">🔨 {i.artisan?.entreprise}</p>
                      {i.type_intervention === 'periode' ? (
                        <p className="text-xs text-gray-500">{new Date(i.date_debut).toLocaleDateString('fr-FR')} → {new Date(i.date_fin).toLocaleDateString('fr-FR')}</p>
                      ) : (
                        <p className="text-xs text-gray-500">{i.jours_specifiques?.length} jour(s) : {i.jours_specifiques?.slice(0, 3).map(j => new Date(j).toLocaleDateString('fr-FR')).join(', ')}{i.jours_specifiques?.length > 3 ? '...' : ''}</p>
                      )}
                      {i.notes && <p className="text-xs text-gray-400">{i.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setInterventionEnEdition(i); setModalInterventionOuvert(true) }} className="text-blue-400 text-xs hover:text-blue-600">Modifier</button>
                      <button onClick={() => supprimerInterventionDossier(i.id)} className="text-red-400 text-xs hover:text-red-600">Supprimer</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {rdvsDossier.length === 0 && interventionsDossier.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">Aucun planning pour ce chantier</p>
          )}
        </div>

        {/* Modal RDV */}
        {modalRdvOuvert && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => { setModalRdvOuvert(false); setRdvEnEdition(null) }}>
            <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
              <h2 className="font-semibold text-gray-800">{rdvEnEdition ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous'}</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type de RDV *</label>
                <select value={rdvEnEdition ? rdvEnEdition.type_rdv : nouveauRdvDossier.type_rdv}
                  onChange={e => rdvEnEdition ? setRdvEnEdition(r => ({ ...r, type_rdv: e.target.value })) : setNouveauRdvDossier(f => ({ ...f, type_rdv: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="visite_technique_client">R1 — Visite technique client</option>
                  <option value="visite_technique_artisan">R2 — Visite technique avec artisan</option>
                  <option value="presentation_devis">R3 — Présentation devis</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date et heure *</label>
                  <input type="datetime-local" value={rdvEnEdition ? rdvEnEdition.date_heure?.slice(0, 16) : nouveauRdvDossier.date_heure}
                    onChange={e => rdvEnEdition ? setRdvEnEdition(r => ({ ...r, date_heure: e.target.value })) : setNouveauRdvDossier(f => ({ ...f, date_heure: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Durée</label>
                  <select value={rdvEnEdition ? rdvEnEdition.duree_minutes : nouveauRdvDossier.duree_minutes}
                    onChange={e => rdvEnEdition ? setRdvEnEdition(r => ({ ...r, duree_minutes: e.target.value })) : setNouveauRdvDossier(f => ({ ...f, duree_minutes: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value={30}>30 min</option>
                    <option value={60}>1h</option>
                    <option value={90}>1h30</option>
                    <option value={120}>2h</option>
                    <option value={180}>3h</option>
                  </select>
                </div>
              </div>
              {(rdvEnEdition ? rdvEnEdition.type_rdv : nouveauRdvDossier.type_rdv) === 'visite_technique_artisan' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Artisan</label>
                  <select value={rdvEnEdition ? rdvEnEdition.artisan_id || '' : nouveauRdvDossier.artisan_id}
                    onChange={e => rdvEnEdition ? setRdvEnEdition(r => ({ ...r, artisan_id: e.target.value })) : setNouveauRdvDossier(f => ({ ...f, artisan_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— Choisir —</option>
                    {artisans.map(a => <option key={a.id} value={a.id}>{a.entreprise}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={rdvEnEdition ? rdvEnEdition.notes || '' : nouveauRdvDossier.notes}
                  onChange={e => rdvEnEdition ? setRdvEnEdition(r => ({ ...r, notes: e.target.value })) : setNouveauRdvDossier(f => ({ ...f, notes: e.target.value }))}
                  rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setModalRdvOuvert(false); setRdvEnEdition(null) }} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
                <button onClick={rdvEnEdition ? modifierRdvDossier : sauvegarderRdvDossier} disabled={!rdvEnEdition && !nouveauRdvDossier.date_heure}
                  className="flex-1 bg-blue-800 text-white py-2 rounded-lg text-sm hover:bg-blue-900 disabled:opacity-50">
                  {rdvEnEdition ? 'Enregistrer' : 'Créer le RDV'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Intervention */}
        {modalInterventionOuvert && interventionEnEdition && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => { setModalInterventionOuvert(false); setInterventionEnEdition(null) }}>
            <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
              <h2 className="font-semibold text-gray-800">Modifier l'intervention</h2>
              <p className="text-sm text-blue-700 font-medium">🔨 {interventionEnEdition.artisan?.entreprise}</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type d'intervention</label>
                <div className="flex gap-3">
                  {[{ value: 'periode', label: 'Période continue' }, { value: 'jours_specifiques', label: 'Jours spécifiques' }].map(({ value, label }) => (
                    <label key={value} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="type_int_edit" value={value}
                        checked={interventionEnEdition.type_intervention === value}
                        onChange={e => setInterventionEnEdition(i => ({ ...i, type_intervention: e.target.value, jours_specifiques: [] }))}
                        className="accent-blue-700" />
                      <span className="text-sm text-gray-700">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              {interventionEnEdition.type_intervention === 'periode' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date de début</label>
                    <input type="date" value={interventionEnEdition.date_debut || ''} onChange={e => setInterventionEnEdition(i => ({ ...i, date_debut: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date de fin</label>
                    <input type="date" value={interventionEnEdition.date_fin || ''} onChange={e => setInterventionEnEdition(i => ({ ...i, date_fin: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              )}
              {interventionEnEdition.type_intervention === 'jours_specifiques' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ajouter des jours</label>
                  <input type="date"
                    onChange={e => {
                      const date = e.target.value
                      if (!date) return
                      setInterventionEnEdition(i => ({
                        ...i,
                        jours_specifiques: (i.jours_specifiques || []).includes(date)
                          ? (i.jours_specifiques || []).filter(j => j !== date)
                          : [...(i.jours_specifiques || []), date].sort()
                      }))
                      e.target.value = ''
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2" />
                  <div className="flex flex-wrap gap-1">
                    {(interventionEnEdition.jours_specifiques || []).map(j => (
                      <span key={j} className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        {new Date(j).toLocaleDateString('fr-FR')}
                        <button onClick={() => setInterventionEnEdition(i => ({ ...i, jours_specifiques: i.jours_specifiques.filter(d => d !== j) }))}
                          className="text-blue-400 hover:text-red-500 ml-1">×</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={interventionEnEdition.notes || ''} onChange={e => setInterventionEnEdition(i => ({ ...i, notes: e.target.value }))}
                  rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setModalInterventionOuvert(false); setInterventionEnEdition(null) }} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
                <button onClick={modifierInterventionDossier} className="flex-1 bg-blue-800 text-white py-2 rounded-lg text-sm hover:bg-blue-900">Enregistrer</button>
              </div>
            </div>
          </div>
        )}

        {/* Comptes-rendus — bientôt */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 opacity-60">
          <p className="font-medium text-gray-700 mb-1">📝 Comptes-rendus</p>
          <p className="text-xs text-gray-400">CR de visites</p>
          <p className="text-xs text-blue-400 mt-2">Bientôt disponible</p>
        </div>


        {/* ── ESPACE CLIENT AMO ── */}
        {dossier?.typologie === 'amo' && (
          <div className="space-y-4">

            {/* Comptes-rendus */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-800">
                  Comptes-rendus de visite
                  {comptesRendus.length > 0 && (
                    <span className="ml-2 text-sm font-normal text-gray-400">({comptesRendus.length})</span>
                  )}
                </h2>
                <button onClick={() => setAjouterCR(!ajouterCR)}
                  className="text-sm text-blue-600 hover:underline">
                  {ajouterCR ? 'Annuler' : '+ Nouveau CR'}
                </button>
              </div>

              {/* Formulaire nouveau CR */}
              {ajouterCR && (
                <div className="border border-blue-100 rounded-xl p-4 bg-blue-50 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Type de visite *</label>
                      <select value={nouveauCR.type_visite}
                        onChange={e => setNouveauCR(c => ({ ...c, type_visite: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">— Choisir —</option>
                        <option value="r1">R1 — Visite client</option>
                        <option value="r2">R2 — Visite avec artisan</option>
                        <option value="r3">R3 — Présentation devis</option>
                        <option value="suivi">Visite de suivi</option>
                        <option value="reception">Réception chantier</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Date de visite</label>
                      <input type="date" value={nouveauCR.date_visite}
                        onChange={e => setNouveauCR(c => ({ ...c, date_visite: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Notes brutes (terrain)</label>
                    <textarea value={nouveauCR.notes_brutes}
                      onChange={e => setNouveauCR(c => ({ ...c, notes_brutes: e.target.value }))}
                      rows={3} placeholder="Notes prises sur place..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Compte-rendu final (visible client si publié)</label>
                    <textarea value={nouveauCR.contenu_final}
                      onChange={e => setNouveauCR(c => ({ ...c, contenu_final: e.target.value }))}
                      rows={4} placeholder="Rédaction finale du compte-rendu..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={nouveauCR.valide}
                        onChange={e => setNouveauCR(c => ({ ...c, valide: e.target.checked }))}
                        className="w-4 h-4 accent-blue-700" />
                      <span className="text-xs text-gray-600">Publier au client maintenant</span>
                    </label>
                    <button onClick={sauvegarderCR} disabled={savingCR || !nouveauCR.type_visite}
                      className="bg-blue-800 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-900 disabled:opacity-50">
                      {savingCR ? 'Enregistrement...' : 'Enregistrer'}
                    </button>
                  </div>
                </div>
              )}

              {/* Liste CRs */}
              {comptesRendus.length === 0 && !ajouterCR ? (
                <p className="text-sm text-gray-400 text-center py-4">Aucun compte-rendu pour ce chantier</p>
              ) : (
                <div className="space-y-2">
                  {comptesRendus.map(cr => (
                    <div key={cr.id} className="border border-gray-100 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-gray-800">
                              {{ r1: 'R1 — Visite client', r2: 'R2 — Visite avec artisan', r3: 'R3 — Présentation devis', suivi: 'Visite de suivi', reception: 'Réception chantier' }[cr.type_visite] || cr.type_visite || 'Compte-rendu'}
                            </p>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${cr.valide ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {cr.valide ? '👁 Publié client' : '🔒 Brouillon'}
                            </span>
                          </div>
                          {cr.date_visite && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              Visite du {new Date(cr.date_visite).toLocaleDateString('fr-FR')}
                            </p>
                          )}
                          {cr.notes_brutes && !cr.contenu_final && (
                            <p className="text-xs text-gray-400 mt-2 italic">Notes brutes — {cr.notes_brutes.slice(0, 80)}{cr.notes_brutes.length > 80 ? '...' : ''}</p>
                          )}
                          {cr.contenu_final && (
                            <p className="text-xs text-gray-600 mt-2 leading-relaxed whitespace-pre-wrap">{cr.contenu_final.slice(0, 120)}{cr.contenu_final.length > 120 ? '...' : ''}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button onClick={() => toggleValide(cr.id, !cr.valide)}
                            className="text-xs text-gray-400 hover:text-blue-600">
                            {cr.valide ? 'Masquer' : 'Publier'}
                          </button>
                          <button onClick={() => supprimerCR(cr.id)}
                            className="text-xs text-red-400 hover:text-red-600">Supprimer</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Messagerie */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-800">
                  Messagerie client
                </h2>
                {nbMsgNonLus > 0 && (
                  <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full font-medium">
                    {nbMsgNonLus} message{nbMsgNonLus > 1 ? 's' : ''} non lu{nbMsgNonLus > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Messages */}
              <div className="border border-gray-100 rounded-xl p-3 max-h-72 overflow-y-auto space-y-3 bg-gray-50">
                {messages.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">Aucun message</p>
                ) : (
                  messages.map(msg => {
                    const isClient = msg.auteur_role === 'client'
                    return (
                      <div key={msg.id} className={`flex ${isClient ? 'justify-start' : 'justify-end'}`}>
                        <div className={`max-w-xs rounded-2xl px-3 py-2 ${isClient ? 'bg-white border border-gray-200' : 'bg-blue-800 text-white'}`}>
                          <p className={`text-xs font-medium mb-0.5 ${isClient ? 'text-gray-500' : 'text-blue-200'}`}>
                            {isClient ? `${msg.auteur?.prenom || 'Client'} (client)` : `${msg.auteur?.prenom || 'Équipe'}`}
                          </p>
                          <p className="text-sm">{msg.contenu}</p>
                          <p className={`text-xs mt-1 opacity-60`}>
                            {new Date(msg.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Répondre */}
              <div className="flex gap-2">
                <input type="text" value={reponseMsg}
                  onChange={e => setReponseMsg(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && envoyerReponse()}
                  placeholder="Répondre au client..."
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button onClick={envoyerReponse} disabled={!reponseMsg.trim() || sendingMsg}
                  className="bg-blue-800 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-900 disabled:opacity-50">
                  {sendingMsg ? '...' : 'Envoyer'}
                </button>
              </div>
            </div>

          </div>
        )}

      {/* Modal Créer Intervention */}
      {modalCreerIntervOuvert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={() => setModalCreerIntervOuvert(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="font-semibold text-gray-800">Planifier une intervention</h2>

            {/* Sélecteur artisan (si pas pré-sélectionné depuis un devis) */}
            {!nouvIntervArtisanId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Artisan *</label>
                <select
                  value={nouvIntervArtisanId || ''}
                  onChange={e => setNouvIntervArtisanId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Choisir un artisan —</option>
                  {devis.filter(d => d.statut === 'accepte').map(d => (
                    <option key={d.artisan_id} value={d.artisan_id}>{d.artisan?.entreprise}</option>
                  ))}
                </select>
              </div>
            )}
            {nouvIntervArtisanId && (
              <p className="text-sm font-medium text-green-700">
                🔨 {devis.find(d => d.artisan_id === nouvIntervArtisanId)?.artisan?.entreprise}
              </p>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type d&apos;intervention</label>
              <div className="flex gap-3">
                {[{ value: 'periode', label: 'Période continue' }, { value: 'jours_specifiques', label: 'Jours spécifiques' }].map(({ value, label }) => (
                  <label key={value} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="nouv_type_int" value={value}
                      checked={nouvIntervForm.type_intervention === value}
                      onChange={e => setNouvIntervForm(f => ({ ...f, type_intervention: e.target.value, jours_specifiques: [] }))}
                      className="accent-blue-700" />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {nouvIntervForm.type_intervention === 'periode' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date de début *</label>
                  <input type="date" value={nouvIntervForm.date_debut}
                    onChange={e => setNouvIntervForm(f => ({ ...f, date_debut: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date de fin *</label>
                  <input type="date" value={nouvIntervForm.date_fin}
                    onChange={e => setNouvIntervForm(f => ({ ...f, date_fin: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            )}

            {nouvIntervForm.type_intervention === 'jours_specifiques' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ajouter des jours</label>
                <input type="date"
                  onChange={e => {
                    const date = e.target.value
                    if (!date) return
                    setNouvIntervForm(f => ({
                      ...f,
                      jours_specifiques: f.jours_specifiques.includes(date)
                        ? f.jours_specifiques.filter(j => j !== date)
                        : [...f.jours_specifiques, date].sort()
                    }))
                    e.target.value = ''
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2" />
                <div className="flex flex-wrap gap-1">
                  {nouvIntervForm.jours_specifiques.map(j => (
                    <span key={j} className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                      {new Date(j).toLocaleDateString('fr-FR')}
                      <button onClick={() => setNouvIntervForm(f => ({ ...f, jours_specifiques: f.jours_specifiques.filter(d => d !== j) }))}>×</button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea value={nouvIntervForm.notes}
                onChange={e => setNouvIntervForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div className="flex gap-2">
              <button onClick={() => { setModalCreerIntervOuvert(false); setNouvIntervArtisanId(null) }}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
              <button onClick={creerInterventionDossier}
                disabled={!nouvIntervArtisanId || saving || (nouvIntervForm.type_intervention === 'periode' && (!nouvIntervForm.date_debut || !nouvIntervForm.date_fin))}
                className="flex-1 bg-green-700 text-white py-2 rounded-lg text-sm hover:bg-green-800 disabled:opacity-50">
                {saving ? 'Enregistrement...' : 'Planifier'}
              </button>
            </div>
          </div>
        </div>
      )}

      </main>
    </div>
  )
}