// app/lib/invitation-email.js
// Email d'invitation Batils (envoyé par NOUS via la boîte d'envoi, plus par
// Supabase). Le lien `actionLink` est le lien d'action Supabase (generateLink),
// qui reste 100 % Supabase pour l'auth — on ne change QUE le facteur.

const BRAND = '#00578e'

// Construit { subject, html } selon le rôle ('agente' | 'admin').
export function buildInvitationEmail({ prenom, nom, actionLink, role }) {
  const estAdmin = role === 'admin'
  const bonjour = prenom ? `Bonjour ${prenom},` : 'Bonjour,'
  const intro = estAdmin
    ? "Vous êtes invité·e à rejoindre <strong>Batils</strong> en tant que franchisé·e. Créez votre accès pour configurer votre société et votre première agence."
    : "Vous êtes invité·e à rejoindre <strong>Batils</strong>. Créez votre accès pour rejoindre votre espace agent."
  const cta = estAdmin ? 'Créer mon accès' : 'Rejoindre mon espace'

  const subject = estAdmin
    ? 'Batils — Invitation franchisé·e'
    : 'Batils — Invitation à rejoindre votre espace'

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
      <div style="width:34px;height:34px;border-radius:8px;background:${BRAND};color:#fff;display:inline-grid;place-items:center;font-weight:800">Co</div>
      <div style="font-size:16px;font-weight:800;color:#111827">Batils</div>
    </div>
    <p style="font-size:14px;line-height:1.6">${bonjour}</p>
    <p style="font-size:14px;line-height:1.6">${intro}</p>
    <p style="margin:24px 0">
      <a href="${actionLink}" style="background:${BRAND};color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:700;display:inline-block">${cta}</a>
    </p>
    <p style="font-size:12px;color:#6b7280;line-height:1.6">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
      <span style="word-break:break-all">${actionLink}</span></p>
    <p style="font-size:12px;color:#9ca3af;margin-top:24px">Ce lien est personnel et à usage unique. Si vous n'êtes pas concerné·e, ignorez ce message.</p>
  </div>`

  return { subject, html }
}
