# Sauvegarde et restauration — BATILIS

**Document d'exploitation.** À tenir à jour, et à pouvoir montrer à un franchisé qui
demande « et si vous perdez tout ? ». Écrit le 3 septembre 2026.

---

## 1. Ce qui est sauvegardé aujourd'hui, et ce qui ne l'est pas

| Ce qu'il y a | Où c'est | Sauvegardé par Supabase ? |
|---|---|---|
| La base de données (clients, dossiers, devis, finance…) | Postgres | **Oui** — une fois par jour, 7 jours de recul |
| Les photos de chantier — **892 fichiers, 2,6 Go** | Storage, bucket `photos` | **NON** |
| Les documents — devis signés, PV, factures, Kbis, RIB — **473 fichiers, 405 Mo** | Storage, bucket `documents` | **NON** |

> **Le point à retenir.** La documentation Supabase est explicite : *« Database backups do
> not include objects you store via the Storage API »*. La base contient les **chemins**
> des fichiers, pas les fichiers. Une restauration ramènerait donc une application qui
> connaît l'existence de 1 365 documents et n'en possède aucun : chaque devis signé, chaque
> PV de réception, chaque attestation décennale deviendrait un lien mort.
>
> C'est le trou que personne ne voit, parce que « je suis en Pro, je suis sauvegardé »
> semble suffire.

---

## 2. Ce qu'on peut promettre à un franchisé

À écrire tel quel dans le contrat d'abonnement. Ne promets rien de plus : chaque promesse
supplémentaire devra être tenue le jour où ça arrive.

- **Perte de données maximale : 24 heures.** Les sauvegardes sont quotidiennes. Un incident
  à 18 h fait perdre le travail de la journée.
- **Délai de remise en service : une demi-journée.** La restauration remplace le projet
  entier ; l'application est **inaccessible pendant l'opération**.
- **Réversibilité : à tout moment**, par le bouton « Télécharger l'export complet » dans
  Paramètres — sans passer par l'éditrice.

Ce qu'il ne faut **pas** promettre tant que ce document n'a pas changé : une restauration
à la minute (c'est le PITR, 100 $/mois, écarté le 03/09), ni une restauration sans
interruption de service.

---

## 3. La sauvegarde mensuelle à faire soi-même

Les sauvegardes Supabase protègent d'un incident technique. Elles ne protègent **pas** de
la perte du compte Supabase lui-même — facturation impayée, compte suspendu, fournisseur
en panne longue. Une copie hors plateforme est le seul remède, et elle couvre au passage
le trou du Storage.

**À faire une fois par mois. Compter vingt minutes.**

### 3.1 La base

```bash
# Une seule fois : installer la CLI
npm install -g supabase
supabase login

# Chaque mois, dans un dossier de sauvegarde
supabase db dump --project-ref tfqtzfyavitrcsgbuueq -f base_AAAA-MM-JJ.sql

# Les données seules (utile pour recharger sans recréer le schéma)
supabase db dump --project-ref tfqtzfyavitrcsgbuueq --data-only -f donnees_AAAA-MM-JJ.sql
```

⚠️ Ce fichier contient **toutes** les données de tous les franchisés. Il se range chiffré,
sur un disque que toi seule ouvres. Pas dans un dossier Drive partagé.

### 3.2 Les fichiers — la partie que Supabase ne fait pas

Les 1 365 fichiers représentent environ **3 Go**. Le plus simple est de les tirer depuis
le Storage vers un disque externe :

```bash
# Depuis le tableau de bord Supabase → Storage, chaque bucket peut être téléchargé
# dossier par dossier. Pour l'automatiser, la CLI convient aussi :
supabase storage download --project-ref tfqtzfyavitrcsgbuueq --recursive photos ./sauvegarde/photos
supabase storage download --project-ref tfqtzfyavitrcsgbuueq --recursive documents ./sauvegarde/documents
```

**Raccourci qui existe déjà :** pour les chantiers dont le miroir Drive est actif, les
documents sont déjà chez toi, dans OneDrive. Ce n'est pas une sauvegarde complète — au
3 septembre, 7 chantiers sur 37 sont miroités — mais c'est autant de moins à retélécharger.
Activer le miroir sur tous les chantiers réduirait mécaniquement ce travail.

---

## 4. L'essai de restauration — à faire UNE fois, et c'est le plus important

Une sauvegarde qu'on n'a jamais restaurée n'est pas une sauvegarde : c'est un fichier dont
on espère quelque chose. L'essai se fait **une fois**, et il vaut plus que tout ce qui
précède.

**Ne restaure jamais par-dessus la production pour t'entraîner.** La restauration
Supabase remplace le projet entier.

Marche à suivre :

1. Créer un **projet Supabase gratuit** de test (n'importe quel nom, région Europe).
2. Y charger le dump du mois :
   ```bash
   psql "<chaîne de connexion du projet de test>" -f base_AAAA-MM-JJ.sql
   ```
3. Vérifier trois choses, pas plus :
   - le nombre de dossiers correspond à celui de la production ;
   - un client au hasard a bien son téléphone et son adresse ;
   - une ligne de suivi financier porte le bon montant.
4. Noter dans ce document la **date de l'essai** et le **temps qu'il a pris**.
5. Supprimer le projet de test.

**Dernier essai réalisé : _______________ · durée : _______**

Tant que cette ligne est vide, la promesse du point 2 n'est pas vérifiée.

---

## 5. Vérification mensuelle, deux minutes

- [ ] Supabase → Database → Backups : la dernière sauvegarde date de moins de 24 h
- [ ] Le dump du mois est fait et rangé
- [ ] Les fichiers du Storage sont copiés
- [ ] `/api/sante` répond 200 (le surveillant extérieur le fait pour toi, mais vérifie
      qu'il est bien actif)
- [ ] Les alertes Vercel n'ont rien remonté d'ignoré

---

## 6. Si ça arrive vraiment

1. **Ne restaure rien tout de suite.** Constate d'abord l'étendue : est-ce une table, un
   dossier, ou toute la base ? Une restauration complète pour rattraper une suppression
   isolée détruit le travail de tout le monde depuis la sauvegarde.
2. Une suppression isolée se répare mieux **à la main**, depuis le dump du mois, en
   réinsérant les lignes concernées.
3. Une perte totale : Supabase → Database → Backups → restaurer la plus récente. Prévenir
   les franchisés **avant**, l'application est inaccessible pendant l'opération.
4. Après restauration : vérifier que les fichiers du Storage sont toujours là. Ils ne sont
   pas affectés par une restauration de base, mais un lien mort se voit vite sur un dossier
   de restitution.

---

*Sources : documentation Supabase sur les sauvegardes (plan Pro : quotidiennes, 7 jours,
non téléchargeables, restauration remplaçant le projet, Storage non inclus). Volumes
mesurés sur la base le 3 septembre 2026.*
