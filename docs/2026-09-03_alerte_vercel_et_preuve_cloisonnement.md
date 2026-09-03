# Deux gestes qui restent — mode d'emploi

*Écrit le 03/09/2026. Les deux tiennent en un quart d'heure à toi deux.*

---

## 1. La règle d'alerte Vercel

### Ce que je t'avais dit de faux

Je t'avais envoyée dans `Settings → Cron Jobs → notifications d'échec`. **Ça n'existe pas.**
Vercel ne propose aucune case « préviens-moi quand un cron échoue ». Il raisonne en
*règles d'alerte* posées sur une requête d'observabilité.

Sources : [vercel.com/docs/cli/alerts](https://vercel.com/docs/cli/alerts) ·
[vercel.com/docs/alerts/configure-alerts](https://vercel.com/docs/alerts/configure-alerts)

### Par le tableau de bord (le chemin que je te conseille)

1. `Observability → Alerts` — c'est déjà dans ta barre latérale gauche.
2. Créer une règle.
3. La requête doit compter les **requêtes entrantes dont le statut HTTP est ≥ 500**,
   restreintes aux routes `/api/cron/`.
4. Seuil : **plus de 0 sur 1 heure**. Un seul échec doit sonner — tes crons tournent
   quatre fois par heure au maximum, il n'y a aucun bruit à filtrer.
5. Canal : ton e-mail. (Slack possible, tu n'en as pas besoin.)

### Par la ligne de commande, si le tableau de bord te résiste

⚠ **Je n'ai pas exécuté cette commande.** La structure vient de la documentation
officielle ; les noms de champs de la requête peuvent demander un ajustement à
l'exécution. Si elle est refusée, l'erreur nommera le champ fautif.

Fichier `regle-cron.json` :

```json
{
  "name": "Cron en echec — illico-app",
  "alertTypes": [{ "type": "custom_alert" }],
  "customAlert": {
    "queryJsonString": "{\"event\":\"incomingRequest\",\"rollups\":{\"erreurs\":{\"measure\":\"count\",\"aggregation\":\"sum\",\"filter\":\"httpStatus ge 500 and route like '/api/cron%'\"}},\"granularity\":{\"hours\":1}}",
    "triggerType": "threshold",
    "triggerOperator": "gt",
    "triggerThreshold": 0
  }
}
```

```bash
vercel alerts rules add --body ./regle-cron.json --project illico-app
vercel alerts rules ls          # pour vérifier qu'elle est bien posée
```

---

## 2. La preuve HTTP du cloisonnement

### Pourquoi elle n'était pas faisable avant, et l'est maintenant

Il fallait un **admin d'une autre société** pour tenter d'atteindre les données de CTP.
Il n'en existait pas. Depuis aujourd'hui, si : le compte de démonstration
(`annelisecaillet05@gmail.com`) est admin de la société de test, qui est un tenant
étranger à CTP au sens strict du code. C'est l'outil de test qui manquait.

### Ce qu'on prouve

Les routes Drive tournent en `service_role` : elles **contournent** les règles d'accès
de la base par construction. Aucune imitation de jeton SQL ne peut donc rien prouver à
leur sujet. Seul un vrai appel HTTP le peut.

Le garde `assertDossierAccessible` doit répondre **404 « Dossier non trouvé »** à un
admin d'une autre société — 404 et non 403, volontairement : on ne confirme même pas
l'existence de l'objet.

### La manipulation

1. **Fenêtre de navigation privée**, connecte-toi à l'application avec
   `annelisecaillet05@gmail.com` (le compte de démo, admin de la société de test).
2. Reste sur l'onglet de l'application. Ouvre la console (`F12` → Console).
3. Colle ce bloc et valide.

```js
// PREUVE DE CLOISONNEMENT — à lancer connectée comme admin de la société de TEST.
// N'écrit rien : les trois appels doivent être REFUSÉS avant toute action.
const jeton = JSON.parse(localStorage.getItem('sb-tfqtzfyavitrcsgbuueq-auth-token')).access_token

// Objets appartenant à CTP (société étrangère pour ce compte)
const DOSSIER_CTP = '770f2b6e-434b-4eb5-881d-06d59495a5a2' // 2026-AM-045
const DEVIS_CTP   = '88ad066c-83b6-47e9-928f-e2a124e81a5e' // devis de 2026-CT-044

async function essai(nom, url, corps) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jeton },
    body: JSON.stringify(corps),
  })
  let t = ''; try { t = JSON.stringify(await r.json()) } catch {}
  const attendu = r.status === 404 || r.status === 403
  console.log(`${attendu ? '✅' : '❌ FUITE'}  ${nom} → ${r.status} ${t}`)
}

await essai('push-devis   (devis CTP)',   '/api/drive/push-devis',   { devis_id: DEVIS_CTP })
await essai('move-chantier (dossier CTP)', '/api/drive/move-chantier', { dossierId: DOSSIER_CTP })
await essai('sync-dossier  (dossier CTP)', '/api/drive/sync-dossier',  { dossier_id: DOSSIER_CTP })
```

### Comment lire le résultat

- **Trois ✅ avec 404 « Dossier non trouvé »** → le cloisonnement des routes Drive est
  **prouvé**, plus déduit. C'est le dernier point ouvert de la section 03 de l'audit.
- **Un seul ❌** → note le nom de la route et envoie-le moi : la garde manque à cet
  endroit précis.

### Le contrôle inverse — ne le saute pas

Un test qui refuse tout passerait aussi. Il faut donc vérifier que la garde **laisse
passer** ce qu'elle doit laisser passer : reconnecte-toi avec ton compte **CTP**
(`anne-lise.caillet@illico-travaux.com`), rejoue le même bloc, et regarde le message.

Tu dois y voir **autre chose que « Dossier non trouvé »** — une erreur de compte Drive,
un chemin, un succès, peu importe. Tant que le message change, c'est que la garde a été
franchie, donc qu'elle discrimine au lieu de tout bloquer.
