// Fallback de transition (App Router) : affiché INSTANTANÉMENT pendant que le
// gros chunk JS de la fiche chantier se charge, au lieu de figer la page
// précédente. Améliore la vitesse PERÇUE à la navigation.
export default function Loading() {
  return <div className="page-loading" aria-label="Chargement…" />
}
