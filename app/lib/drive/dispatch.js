// app/lib/drive/dispatch.js
// Aiguillage du drive par fournisseur (modèle « alternative » : chaque utilisateur a
// AU PLUS un drive connecté — OneDrive 'microsoft' OU Google Drive 'googledrive').
// microsoft.js et google-drive.js exposent la MÊME interface (getValidAccessToken,
// getMyDriveId, listFolders, listSharedFolders, createFolder, ensureChildFolder,
// ensureFolderPath, uploadSmallFile, moveItem, deleteItem, downloadItemContent), donc
// les routes drive appellent mod.<fn>(…) sans se soucier du fournisseur.

import * as microsoft from './microsoft'
import * as googledrive from './google-drive'

const MODULES = { microsoft, googledrive }
const DRIVE_FOURNISSEURS = ['microsoft', 'googledrive']

// Module d'accès pour un fournisseur donné (null si inconnu).
export function driveModule(fournisseur) {
  return MODULES[fournisseur] || null
}

// Compte drive connecté du user (l'un OU l'autre fournisseur). `adminClient` = client
// Supabase service_role. Renvoie la ligne (avec `fournisseur`) ou null.
export async function loadDriveCompte(
  adminClient,
  userId,
  fields = 'id, fournisseur, access_token, refresh_token, expiry_date, drive_root_drive_id, drive_root_id, drive_root_path'
) {
  const { data } = await adminClient.from('comptes_oauth').select(fields)
    .eq('user_id', userId).in('fournisseur', DRIVE_FOURNISSEURS)
    .order('updated_at', { ascending: false }).limit(1)
  return (data && data[0]) || null
}
