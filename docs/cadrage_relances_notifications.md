# Cadrage — relances, envois et notifications

*Écrit le 03/09/2026. Décisions d'Anne-Lise intégrées. À valider avant d'écrire une ligne de code.*

---

## 1. Le transport : il fonctionne déjà, le commentaire ment

`app/lib/email.js` envoie par **Microsoft Graph en délégué** (`/me/sendMail`), depuis la
boîte Outlook connectée. Trois routes s'en servent **en production** : la réinitialisation
de mot de passe, les demandes d'agent, et la diffusion d'un compte rendu de visite.

Le cron de relances est le **seul** à ne pas s'en servir. Il porte encore :

```js
// import { sendEmail } from '.../lib/email' // TODO: activer après config HEXAOM (admin consent Azure)
const sendEmail = async ({ to, subject }) => { /* emails désactivés temporairement */ }
```

Ce TODO est **périmé** : il vise l'ancienne authentification app-only, abandonnée depuis
au profit du délégué. Rien ne bloque techniquement. Rebrancher l'import est une ligne.

### Mais une conséquence non traitée

Le cron passe `from: referente?.email` à chaque appel. **`sendEmail` ignore ce champ** —
sa signature est `{ to, subject, html, attachments }`. Avec le délégué, *tous* les mails
partent de la boîte connectée, pas de celle de la référente.

Le cahier des charges avait prévu un contournement (Décision 2) : `Reply-To` vers la
référente.

> ✅ **TRANCHÉ (03/09, après essai) — on FAIT le contournement.** L'essai de connexion
> d'une boîte `@illico-travaux.com` s'est heurté à « Approbation requise » : le locataire
> d'illiCO interdit à ses utilisateurs de consentir seuls (détail en §3 bis). Le `Reply-To`
> redevient donc la solution, exactement comme le cahier des charges l'avait prévu.

---

## 2. Les huit automatisations : état actuel → décision

| # | Aujourd'hui dans le code | Décision | Reste à faire |
|---|---|---|---|
| 1 | **Devis artisan non reçu**, J−7 avant la date limite → mail artisan | ✅ **Garder l'automatique** ET **ajouter un bouton « Relancer »** manuel | Rien à retirer. Ajouter le bouton sur la ligne de devis |
| 2 | **Deadline devis dossier** J−7 → notification interne référente | ✅ Garder | Rien (mais voir §3 : la table est vide) |
| 3 | **Demande d'acompte** → mail client, sur échéances `en_attente` | 🔄 **J+5 après la date de signature du devis**, avec avertissement interne à J+4 | Nouveau déclencheur + notification J+4 |
| 4 | **Facture finale non réglée**, J+7 après échéance → mail client | ⏸ **Mis de côté** — à cadrer | Rien pour l'instant. Ne pas rebrancher |
| 5 | **Rappel RDV client** J−1 → mail client | 🔄 **Étendre à l'artisan du RDV** | Ajouter `rendez_vous.artisan_id` aux destinataires |
| 6 | **Décennale expirante** J−30 → mail artisan | 🔄 **J−14** | Changer une constante |
| 7 | **Nouveau CR validé** → mail client AMO | ⏸ **Mis de côté** — c'est un *envoi*, pas une relance | Voir §4 : l'envoi manuel existe déjà |
| 8 | **Désactivation des accès client** expirés depuis +14 j | ✅ Garder | Rien. Ce n'est pas un mail, c'est du ménage |

### Le double chemin de la relance de devis (#1)

Décision du 03/09 : **les deux coexistent.** L'automatique à J−7 est le plancher — elle
part sur tout devis dont la date limite approche, sans rien demander à personne. Le bouton
est pour les cas que le calendrier ne couvre pas : un artisan qui traîne, un chantier
pressé, un devis sans date limite.

Deux conséquences à assumer :

- **Un artisan peut recevoir deux mails le même jour** si tu cliques « Relancer » un J−7.
  Le cron ne garde aucune trace de ce qu'il a envoyé — il n'y a pas de journal des relances
  en base. Ajouter une garde (« pas d'automatique si une relance manuelle est partie dans
  les N derniers jours ») suppose de créer ce journal. À faire seulement si le cas se
  produit vraiment.
- **Les devis sans date limite ne reçoivent jamais d'automatique.** Sur 37 dossiers, 13
  seulement portent une `date_limite_devis`. Pour les 24 autres, le bouton est le seul
  chemin — ce qui rend son ajout d'autant plus utile.

### Le garde-fou de la demande d'acompte (#3)

Anne-Lise : *« relancer l'utilisateur avant l'envoi du mail car peut-être un oubli de
l'utilisateur sur le remplissage du sous-onglet finance »*.

Deux façons de le faire, elles ne coûtent pas la même chose :

- **(a) Avertissement non bloquant.** J+4 : notification interne « L'acompte de [client]
  part demain, vérifie le suivi financier ». J+5 : le mail part quoi qu'il arrive.
- **(b) Validation bloquante.** J+5 : le mail est **préparé** et attend un clic. Rien ne
  part sans validation humaine. Aucun risque d'envoyer un montant faux — mais si personne
  ne clique, rien ne part, et l'automatisation ne sert plus à rien.

> ✅ **TRANCHÉ (03/09) — avertir la veille SEULEMENT si le suivi est incomplet, et
> envoyer quand même le lendemain.**
>
> - **J+4, suivi incomplet** → notification interne : « Le mail pour le paiement de
>   l'acompte de [client] part demain, vérifie le suivi financier. »
> - **J+4, suivi complet** → rien. Pas de notification pour dire que tout va bien.
> - **J+5** → le mail part, et **ne liste que les acomptes non encore réglés**. Une case
>   déjà cochée ne figure pas dans le mail : on ne réclame pas ce qui est payé.
> - **Tous les acomptes réglés → aucun mail.** Il n'y a rien à demander.
>
> **Définition de « complet », à valider :** chaque devis signé du dossier a sa ligne
> `suivi_financier` de type `acompte_artisan`. S'il en manque une, le mail listerait un
> artisan de moins que la réalité — c'est exactement l'oubli qu'on veut attraper.
>
> Conséquence assumée : quand le suivi est complet, rien ne t'avertit et le mail part en
> silence. C'est le prix de ne pas être notifiée pour rien.

### Le rappel de rendez-vous aux artisans (#5)

> ✅ **TRANCHÉ (03/09) — `rendez_vous.artisan_id`, l'artisan DU rendez-vous.**
> Pas les intervenants du jour. Conséquence assumée : un rendez-vous de suivi sans artisan
> désigné ne prévient aucun artisan. Si un jour tu veux prévenir les intervenants d'une
> journée de chantier, ce sera une seconde règle, pas une extension de celle-ci.

---

## 3. Les notifications internes : la cloche est vide

`notifyUser` n'est appelée **qu'une seule fois** dans tout le cron — l'échéance de devis à
J−7 (#2). Et la table `notifications` contient **zéro ligne** dans toute la base : sur 37
dossiers, 13 seulement ont une date limite de devis, et il faut qu'elle tombe pile à J−7
un jour de passage du cron.

La mécanique existe (table, page `/notifications`, cloche dans l'en-tête, préférences par
canal dans `profiles`). Ce qui manque, c'est **la liste de ce qui mérite une notification**.

> ✅ **ARRÊTÉE (03/09).**
>
> | Notification | Quand | Qui la reçoit |
> |---|---|---|
> | Acompte qui part demain | J+4, **seulement si le suivi est incomplet** | La référente |
> | Réponse d'un client dans la messagerie | à la réception du message | La référente |
> | Décennale — mail artisan demain | **J−15** (la veille du mail J−14) | **Tout le monde** |
>
> **Écartées :**
> - *Devis reçu d'un artisan* — les devis arrivent par mail et sont saisis à la main dans
>   l'application. Notifier quelqu'un de ce qu'il vient de faire n'a aucun sens.
> - *Cron en échec* — **couverte autrement depuis le 03/09** : la règle d'alerte Vercel
>   (Error Anomaly sur les 5xx) envoie un mail dès qu'une tâche automatique échoue. Une
>   notification interne ferait doublon avec un canal qui, lui, fonctionne même quand
>   l'application est en panne.

---

## 3 bis. La boîte d'envoi — l'essai a tranché contre la conception souhaitée

### Ce qu'on voulait, et pourquoi ce n'est pas possible

Décision initiale du 03/09 : chaque utilisateur envoie depuis **sa propre boîte**. Essai
fait le jour même, après passage de l'application Azure en multi-locataire et correction
des URL de redirection. Résultat, à la connexion de `anne-lise.caillet@illico-travaux.com` :

> **Approbation requise** — Batilis (non vérifié)
> Cette application nécessite l'approbation de votre administrateur pour :
> conserver l'accès aux données, activer la connexion et lire le profil,
> **envoyer un e-mail en tant qu'utilisateur**.

Le locataire Entra d'illiCO (HEXARESO) **n'autorise pas ses utilisateurs à consentir
seuls**. Aucune boîte `@illico-travaux.com` ne peut donc être connectée tant que leur
informatique n'a pas approuvé BATILIS. Ce n'est pas un défaut de configuration : c'est leur
politique, et elle ne dépend pas d'Anne-Lise.

### La conception retenue à la place

> ✅ **TRANCHÉ (03/09, après essai) — UNE boîte d'envoi BATILIS + `Reply-To` vers la
> personne concernée.**
>
> - L'expéditeur technique est la boîte unique connectée dans `/super-admin`.
> - Le `Reply-To` porte l'adresse de la **référente** du dossier pour les mails clients et
>   artisans, et celle du **franchisé** pour la décennale.
> - Quand un client ou un artisan répond, sa réponse arrive chez la bonne personne.
>
> C'est la Décision 2 du cahier des charges v6, écartée le matin même sur un raisonnement,
> et rétablie l'après-midi sur une preuve. `email_sender_oauth` garde donc sa contrainte
> `id = 'default'` — elle n'est plus une dette, elle est la conception.

**Conséquence heureuse : le lot rétrécit.** Plus de migration OAuth par utilisateur, plus de
consentement à obtenir, plus de règle « boîte non connectée ». Il reste à ajouter un champ
`replyTo` à `sendEmail` — quelques lignes — et tout le reste du lot est intact.

### Ce qui devient le vrai point bloquant, et ce n'est pas du code

La boîte connectée aujourd'hui est **`anne-lise.caillet@outlook.com`**, une adresse
personnelle. Tant qu'elle reste l'expéditrice, les relances de tes clients partiront d'une
adresse `outlook.com`. Acceptable pour la mise au point, pas pour un réseau de franchise.

**Cible : une boîte sur `batilis-app.fr`.** Microsoft 365 sur ton propre domaine te rend
administratrice de ton propre locataire — tu accordes toi-même le consentement à ta propre
application, sans dépendre de personne. C'est aussi ce qui règle, au passage, le fait que
l'inscription Azure vive encore chez ton ancienne école.

### En parallèle, la demande à illiCO reste ouverte

Rien n'empêche de demander l'approbation à leur informatique. Deux choses à savoir avant :

1. L'écran affiche **« Batilis — non vérifié »**. Un service informatique approuve
   rarement une application dont l'éditeur n'est pas vérifié par Microsoft. La
   *vérification d'éditeur* (Microsoft Publisher Verification) est le levier, et il
   dépend de toi, pas d'eux.
2. Si un jour ils approuvent, la conception « une boîte par utilisateur » redevient
   possible — le magasin de jetons `comptes_oauth` la supporte déjà. On la fera à ce
   moment-là, pas avant.

## 4. Le compte rendu : l'envoi existe déjà

`POST /api/cr/visite-diffuser` envoie le PDF de la visite **aux artisans des lots
sélectionnés** (PDF filtré à leur lot si demandé) et **au client** si la case est cochée.
Déclenché par un bouton, jamais tout seul.

> ✅ **TRANCHÉ (03/09).**
> - Le **#7 disparaît** : plus de mail automatique à chaque CR validé.
> - En revanche, le clic sur **« Publier au client »** (`sauvegarderCRManuel(true)`, qui
>   pose déjà `valide: true` et pousse le CR dans le Drive) doit envoyer au client un
>   **mail court d'avis** : « Votre compte rendu de visite est disponible dans votre
>   espace », avec le lien. **Pas le PDF en pièce jointe** — la diffusion du PDF reste le
>   travail de `visite-diffuser`, déclenché à part.
> - La **notification sur le téléphone** du client viendra avec l'application mobile.
>   Plus tard, pas dans ce lot.
>
> **Bénéfice de bord :** l'espace client ne rafraîchit pas les CR en temps réel (l'abonnement
> a été retiré, la table est fermée au client au profit d'une vue). Le mail règle donc au
> passage l'irritant « le CR n'apparaît qu'après actualisation » : le client est prévenu au
> lieu d'avoir à recharger la page.

---

## 5. Ordre de travail proposé

1. **`replyTo` dans `sendEmail`** (§3 bis) — quelques lignes, préalable à tout envoi.
2. **Le mode d'essai**, dans la foulée : c'est lui qui permet de rebrancher sans risque.
3. **Rebrancher l'import** et retirer la coquille vide.
4. **Les deux réglages simples** : décennale J−14, RDV étendu à l'artisan du rendez-vous.
5. **Le bouton « Relancer »** sur la ligne de devis (s'ajoute au #1, ne le remplace pas).
6. **Le déclencheur J+5 de l'acompte** + la notification d'avertissement à J+4.
7. **Les notifications internes** — la liste est arrêtée (§3).
8. **Le mail d'avis au clic « Publier au client »**.
9. *(plus tard)* Facture finale, après cadrage. Envoi Google. Notification mobile.

**Rien ne part tant que les points 1 et 2 ne sont pas faits.** Un mail de relance envoyé
depuis la boîte de quelqu'un d'autre est pire que pas de mail — et un premier envoi réel
sans filet est le meilleur moyen de découvrir un défaut sur un vrai client.
