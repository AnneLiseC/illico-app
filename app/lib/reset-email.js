// app/lib/reset-email.js
// Email de réinitialisation de mot de passe Batilis, envoyé par NOUS via la boîte
// d'envoi (Microsoft Graph, cf. email.js) — plus par Supabase. `actionLink` est le
// lien d'action Supabase (generateLink type recovery) : l'auth reste 100 % Supabase,
// on ne change QUE le facteur d'envoi (même expéditeur que les invitations agentes).

const BRAND = '#00578e'

// Construit { subject, html } pour un email de réinitialisation.
export function buildResetEmail({ actionLink }) {
  const subject = 'Batilis — Réinitialisation de votre mot de passe'

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
      <div style="width:34px;height:34px;border-radius:8px;background:${BRAND};color:#fff;display:inline-grid;place-items:center;font-weight:800">Ba</div>
      <div style="font-size:16px;font-weight:800;color:#111827">Batilis</div>
    </div>
    <p style="font-size:14px;line-height:1.6">Bonjour,</p>
    <p style="font-size:14px;line-height:1.6">Vous avez demandé la réinitialisation de votre mot de passe Batilis. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.</p>
    <p style="margin:24px 0">
      <a href="${actionLink}" style="background:${BRAND};color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:700;display:inline-block">Réinitialiser mon mot de passe</a>
    </p>
    <p style="font-size:12px;color:#6b7280;line-height:1.6">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
      <span style="word-break:break-all">${actionLink}</span></p>
    <p style="font-size:12px;color:#9ca3af;margin-top:24px">Ce lien est personnel et à usage unique. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.</p>
  </div>`

  return { subject, html }
}
