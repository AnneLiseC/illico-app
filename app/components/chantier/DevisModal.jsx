'use client'
// Modal d'ajout / édition d'un devis — extrait de chantiers/[id]/page.js et chargé
// à la demande (next/dynamic, ssr:false) : son code sort du bundle initial de la page
// et ne se télécharge qu'à l'ouverture de la modale. Composant purement piloté par props.
import { useState, useEffect } from 'react'
import ModalShell from '../ModalShell'
import { TVA_TRAVAUX } from '../../lib/finance'
import { matchArtisanParNom } from '../../lib/devis'

export default function DevisModal({ open, devis, onClose, onSave, onAutofill, artisans }) {
  const isEdit = !!devis
  const initForm = () => ({
    artisan_id: devis?.artisan_id || '',
    montant_ht: devis?.montant_ht ?? '',
    montant_ttc: devis?.montant_ttc ?? '',
    ttc_manuel: devis?.ttc_manuel ?? false,
    commission_pourcentage: devis?.commission_pourcentage != null ? (devis.commission_pourcentage * 100).toFixed(1) : '',
    // Ne JAMAIS cocher « sans commission » en création : uniquement en édition d'un
    // devis dont la commission a été explicitement mise à 0.
    sans_commission: !!devis && devis.commission_pourcentage === 0,
    date_reception: devis?.date_reception || '',
    date_limite: devis?.date_limite || '',
    notes: devis?.notes || '',
    acompte_pourcentage: devis?.acompte_pourcentage ?? 30,
    acompte_montant_fixe: devis?.acompte_montant_fixe ?? '',
    fichier: null,
  })
  const [form, setForm] = useState(initForm)
  const [saving, setSaving] = useState(false)          // anti double-submit
  const [autofilling, setAutofilling] = useState(false) // extraction IA en cours
  const [autofillInfo, setAutofillInfo] = useState(null) // { tone, texte } sous le PDF

  useEffect(() => {
    if (open) { setForm(initForm()); setSaving(false); setAutofilling(false); setAutofillInfo(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, devis?.id])

  const set = (champ, val) => setForm(f => ({ ...f, [champ]: val }))

  // Pré-remplissage IA : envoie le PDF sélectionné, applique l'extraction au formulaire.
  // On préserve le TTC réel du devis (ttc_manuel=true) au lieu du calcul auto HT×1.10.
  const remplirDepuisPdf = async () => {
    if (!form.fichier || !onAutofill) return
    setAutofilling(true); setAutofillInfo(null)
    const data = await onAutofill(form.fichier)
    setAutofilling(false)
    if (!data?.extraction) { setAutofillInfo({ tone: 'bad', texte: 'Extraction impossible — saisis à la main.' }); return }
    const ex = data.extraction
    let artisanNote = null
    setForm(f => {
      const next = { ...f }
      if (ex.montant_ht != null) next.montant_ht = String(ex.montant_ht)
      if (ex.montant_ttc != null) { next.montant_ttc = String(ex.montant_ttc); next.ttc_manuel = true }
      if (ex.date_reception) next.date_reception = ex.date_reception
      if (ex.date_limite) next.date_limite = ex.date_limite
      if (ex.description) next.notes = ex.description
      // Artisan : suggestion par nom (l'humaine confirme). Ne force pas si déjà choisi.
      if (!f.artisan_id && ex.entreprise) {
        const m = matchArtisanParNom(ex.entreprise, artisans || [])
        if (m.id) { next.artisan_id = m.id; artisanNote = `Artisan pré-sélectionné : ${(artisans || []).find(a => a.id === m.id)?.entreprise || ''}${m.exact ? '' : ' (à vérifier)'}` }
        else artisanNote = `Artisan « ${ex.entreprise} » non trouvé — sélectionne-le.`
      }
      return next
    })
    const parts = []
    if (data.avertissement) parts.push(data.avertissement)
    if (artisanNote) parts.push(artisanNote)
    setAutofillInfo({ tone: data.avertissement ? 'warn' : 'ok', texte: parts.join(' · ') || 'Champs pré-remplis — vérifie avant d\'enregistrer.' })
  }

  if (!open) return null

  const htNum  = parseFloat(form.montant_ht)
  const ttcNum = parseFloat(form.montant_ttc)
  const ttcInferieurHt = Number.isFinite(htNum) && Number.isFinite(ttcNum) && ttcNum < htNum
  const canSave = !!form.artisan_id && form.montant_ht !== '' && !ttcInferieurHt

  return (
    <ModalShell
      title={isEdit ? 'Modifier le devis' : 'Nouveau devis'}
      onClose={onClose}
      width={600}
      footer={<>
        <button onClick={onClose} className="btn btn-ghost" disabled={saving}>Annuler</button>
        <button
          onClick={async () => {
            if (saving) return
            setSaving(true)
            const ok = await onSave(form)   // true = enregistré (modale se ferme) ; false = erreur
            if (!ok) setSaving(false)       // erreur → on réactive le bouton
          }}
          className="btn btn-primary" disabled={!canSave || saving}>
          {saving ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer le devis'}
        </button>
      </>}
    >
        <div style={{padding:24, overflow:'auto', display:'flex', flexDirection:'column', gap:14}}>
          {!isEdit && (
            <div style={{background:'var(--surface-2)', border:'1px solid var(--ink-100)', borderRadius:10, padding:14}}>
              <label className="eyebrow" style={{display:'block', marginBottom:8}}>PDF du devis (optionnel)</label>
              <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
                <label className="btn btn-ghost" style={{cursor:'pointer', borderStyle:'dashed', padding:'8px 14px', flex:'1 1 170px', justifyContent:'center'}}>
                  {form.fichier ? `✓ ${form.fichier.name}` : '📎 Choisir un PDF'}
                  <input type="file" accept=".pdf" style={{display:'none'}}
                    onChange={e => { set('fichier', e.target.files[0] || null); setAutofillInfo(null) }} />
                </label>
                {onAutofill && (
                  <button onClick={remplirDepuisPdf} disabled={!form.fichier || autofilling}
                    title={form.fichier ? 'Lire le devis et pré-remplir le formulaire' : 'Choisis d’abord un PDF de devis'}
                    className="btn btn-primary" style={{padding:'8px 12px', background:'#4f46e5', borderColor:'#4f46e5', opacity:(!form.fichier || autofilling) ? 0.55 : 1}}>
                    {autofilling ? 'Lecture du PDF…' : '✨ Pré-remplir depuis le PDF'}
                  </button>
                )}
                {form.fichier && (
                  <button onClick={() => { set('fichier', null); setAutofillInfo(null) }} className="btn btn-ghost" style={{fontSize:11, padding:'4px 10px', color:'#b91c1c'}}>
                    Retirer
                  </button>
                )}
              </div>
              <div style={{fontSize:11.5, color:'var(--ink-500)', marginTop:6}}>
                L’IA lit le PDF et remplit montants, dates et description — tu vérifies avant d’enregistrer.
              </div>
              {autofillInfo && (
                <div style={{
                  marginTop:8, borderRadius:8, padding:'8px 12px', fontSize:12.5, fontWeight:500,
                  background: autofillInfo.tone === 'bad' ? '#fef2f2' : autofillInfo.tone === 'warn' ? '#fffbeb' : '#f0fdf4',
                  border: `1px solid ${autofillInfo.tone === 'bad' ? '#fecaca' : autofillInfo.tone === 'warn' ? '#fde68a' : '#bbf7d0'}`,
                  color: autofillInfo.tone === 'bad' ? '#b91c1c' : autofillInfo.tone === 'warn' ? '#92400e' : '#166534',
                }}>
                  {autofillInfo.texte}
                </div>
              )}
            </div>
          )}

          {!isEdit && (
            <div>
              <label className="eyebrow" style={{display:'block', marginBottom:6}}>Artisan *</label>
              <select className="input" value={form.artisan_id} onChange={e => set('artisan_id', e.target.value)} style={{height:40, width:'100%'}}>
                <option value="">— Choisir un artisan —</option>
                {artisans.map(a => (
                  <option key={a.id} value={a.id}>{a.entreprise}{a.metier ? ` (${a.metier})` : ''}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
            <div>
              <label className="eyebrow" style={{display:'block', marginBottom:6}}>Montant HT (€)</label>
              <input type="number" step="0.01" min="0" className="input"
                value={form.montant_ht}
                onChange={e => {
                  const ht = e.target.value
                  setForm(f => f.ttc_manuel
                    ? { ...f, montant_ht: ht }
                    : { ...f, montant_ht: ht, montant_ttc: ht !== '' ? (parseFloat(ht) * TVA_TRAVAUX).toFixed(2) : '' })
                }}
                style={{height:40, width:'100%'}} />
            </div>
            <div>
              <label className="eyebrow" style={{display:'block', marginBottom:6}}>Montant TTC (€) <span style={{color:'var(--ink-500)', fontWeight:400, textTransform:'none'}}>{form.ttc_manuel ? 'figé / manuel' : 'auto +10%'}</span></label>
              <input type="number" step="0.01" min="0" className="input"
                value={form.montant_ttc}
                onChange={e => setForm(f => ({ ...f, montant_ttc: e.target.value, ttc_manuel: true }))}
                style={{height:40, width:'100%'}} />
            </div>
          </div>

          {ttcInferieurHt && (
            <div style={{background:'#fef2f2', border:'1px solid #fecaca', color:'#b91c1c', borderRadius:8, padding:'8px 12px', fontSize:13, fontWeight:600}}>
              Le TTC ne peut pas être inférieur au HT.
            </div>
          )}

          <div>
            <label className="eyebrow" style={{display:'block', marginBottom:6}}>Commission (%)</label>
            <input type="number" step="0.1" min="0" max="100" className="input"
              value={form.sans_commission ? '0' : form.commission_pourcentage}
              placeholder="ex: 15"
              disabled={form.sans_commission}
              onChange={e => set('commission_pourcentage', e.target.value)}
              style={{height:40, width:'100%', opacity: form.sans_commission ? 0.5 : 1}} />
            <label style={{display:'flex', alignItems:'center', gap:8, marginTop:8, cursor:'pointer'}}>
              <input type="checkbox" checked={form.sans_commission}
                onChange={e => set('sans_commission', e.target.checked)}
                style={{width:14, height:14, accentColor:'#4f46e5'}} />
              <span style={{fontSize:12, color:'var(--ink-500)'}}>Sans commission ni honoraires</span>
            </label>
          </div>

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
            <div>
              <label className="eyebrow" style={{display:'block', marginBottom:6}}>Date de réception</label>
              <input type="date" className="input" value={form.date_reception} onChange={e => set('date_reception', e.target.value)} style={{height:40, width:'100%'}} />
            </div>
            <div>
              <label className="eyebrow" style={{display:'block', marginBottom:6}}>Date limite</label>
              <input type="date" className="input" value={form.date_limite} onChange={e => set('date_limite', e.target.value)} style={{height:40, width:'100%'}} />
            </div>
          </div>

          <div style={{paddingTop:14, borderTop:'1px solid var(--ink-100)'}}>
            <label className="eyebrow" style={{display:'block', marginBottom:8}}>Acompte</label>
            <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
              <select className="input" value={form.acompte_pourcentage}
                onChange={e => set('acompte_pourcentage', parseFloat(e.target.value))}
                style={{height:36, width:130}}>
                <option value={30}>30 %</option>
                <option value={40}>40 %</option>
                <option value={-1}>Montant fixe</option>
                <option value={0}>Sans acompte</option>
              </select>
              {form.acompte_pourcentage === -1 && (
                <input type="number" step="0.01" min="0" className="input"
                  placeholder="Montant TTC"
                  value={form.acompte_montant_fixe}
                  onChange={e => set('acompte_montant_fixe', e.target.value)}
                  style={{height:36, width:140}} />
              )}
            </div>
          </div>

          <div>
            <label className="eyebrow" style={{display:'block', marginBottom:6}}>Description</label>
            <textarea className="input" value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={3} placeholder="Description des travaux…"
              style={{width:'100%', padding:'10px 12px', lineHeight:1.5, resize:'vertical'}} />
          </div>
        </div>
    </ModalShell>
  )
}
