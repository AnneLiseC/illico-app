import { defineConfig } from 'vitest/config'

// Variables d'env factices pour les tests unitaires : plusieurs modules calendrier
// (google.js, pull-engine.js…) instancient un client Supabase au chargement, qui exige
// une URL. Aucune connexion réelle n'est faite dans les tests (fonctions pures testées).
export default defineConfig({
  test: {
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder-anon',
      SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-role',
      CALDAV_ENC_KEY: 'yNLyf2O+krKdJOlN7AhzfNfXkr1aroCasrUv6l8igf0=', // 32o base64 (clé de TEST uniquement)
    },
  },
})
