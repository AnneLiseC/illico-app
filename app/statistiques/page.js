// Module neutralisé pour le sprint multi-tenant (lot L11).
// Code complet (Chart.js + 5 onglets + calculs) conservé dans l'historique git au commit 3dbd6f1.
// À réactiver et adapter au multi-tenant post-test — voir docs/07 §5.4.

export default function Statistiques() {
  return (
    <div className="page-enter page-pad" style={{display:'flex', flexDirection:'column', gap:18}}>
      <div>
        <div className="eyebrow" style={{marginBottom:4}}>Analyse</div>
        <h1 className="page">Statistiques</h1>
      </div>
      <div className="card" style={{padding:48, textAlign:'center'}}>
        <div style={{fontSize:18, fontWeight:800, color:'var(--ink-900)', marginBottom:8}}>Bientôt disponible</div>
        <div style={{fontSize:13, color:'var(--ink-500)'}}>Ce module est en cours de développement.</div>
      </div>
    </div>
  )
}
