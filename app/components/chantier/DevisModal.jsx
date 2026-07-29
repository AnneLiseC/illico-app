'use client'
// Modal d'ajout / édition d'un devis — extrait de chantiers/[id]/page.js et chargé
// à la demande (next/dynamic, ssr:false) : son code sort du bundle initial de la page
// et ne se télécharge qu'à l'ouverture de la modale. Composant purement piloté par props.
import { useState, useEffect } from 'react'
import ModalShell from '../ModalShell'
import { TVA_TRAVAUX } from '../../lib/finance'

export default function DevisModal({ open, devis, onClose, onSave, artisans }) {
  const isEdit = !!devis
  const initForm = () => ({
    artisan_id: devis?.artisan_id || '',
    montant_ht: devis?.montant_ht ?? '',
    montant_ttc: devis?.montant_ttc ?? '',
    ttc_manuel: devis?.ttc_manuel ?? false,
    commission_pourcentage: devis?.commission_pourcentage != null ? (devis.commission_pourcentage * 100).toFixed(1) : '',
    sans_commission: devis?.commission_pourcentage === 0,
    date_reception: devis?.date_reception || '',
    date_limite: devis?.date_limite || '',
    notes: devis?.notes || '',
    acompte_pourcentage: devis?.acompte_pourcentage ?? 30,
    acompte_montant_fixe: devis?.acompte_montant_fixe ?? '',
    fichier: null,
  })
  const [form, setForm] = useState(initForm)

  useEffect(() => {
    if (open) setForm(initForm())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, devis?.id])

  const set = (champ, val) => setForm(f => ({ ...f, [champ]: val }))
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
        <button onClick={onClose} className="btn btn-ghost">Annuler</button>
        <button onClick={() => onSave(form)} className="btn btn-primary" disabled={!canSave}>
          {isEdit ? 'Enregistrer' : 'Créer le devis'}
        </button>
      </>}
    >
        <div style={{padding:24, overflow:'auto', display:'flex', flexDirection:'column', gap:14}}>
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

          {!isEdit && (
            <div>
              <label className="eyebrow" style={{display:'block', marginBottom:6}}>PDF du devis (optionnel)</label>
              <label className="btn btn-ghost" style={{cursor:'pointer', justifyContent:'center', borderStyle:'dashed', padding:'10px 14px'}}>
                {form.fichier ? `✓ ${form.fichier.name}` : '📎 Choisir un PDF'}
                <input type="file" accept=".pdf" style={{display:'none'}}
                  onChange={e => set('fichier', e.target.files[0] || null)} />
              </label>
              {form.fichier && (
                <button onClick={() => set('fichier', null)} className="btn btn-ghost" style={{fontSize:11, padding:'4px 10px', marginTop:6, color:'#b91c1c'}}>
                  Supprimer le fichier
                </button>
              )}
            </div>
          )}
        </div>
    </ModalShell>
  )
}
