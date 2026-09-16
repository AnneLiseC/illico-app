// ═══════════════════════════════════════════════════════════════════════════════════════
// CONTRÔLE DES SYMBOLES NON DÉFINIS — configuration dédiée, volontairement minuscule.
//
// POURQUOI UNE CONFIG À PART, et pas la règle dans eslint.config.mjs pour la CI :
// `eslint-config-next/core-web-vitals` remonte déjà 19 erreurs sur ce dépôt
// (react-hooks/set-state-in-effect). Une CI rouge dès le premier jour est une CI qu'on
// apprend à ignorer. Celle-ci ne vérifie QU'UNE chose, elle est verte aujourd'hui, et le
// jour où elle passe au rouge c'est qu'un symbole n'existe pas.
//
// CE QU'ELLE AURAIT ÉVITÉ, le 16/09, en une seconde :
//   · getLogoBase64  → plus aucun dossier de suivi ni PDF de compte rendu ;
//   · TVA_FRAIS      → récapitulatif financier, suivi financier, et la pièce jointe de la
//                      demande d'acompte envoyée par le cron ;
//   · nomDossier     → tous les rappels de rendez-vous aux artisans, et par ricochet les
//                      rendez-vous suivants de la même exécution. Zéro rappel artisan
//                      envoyé depuis la mise en service, vérifié en base.
//
// Ni `next build` ni les tests ne voient ces trois-là : ce sont des variables lues à
// l'exécution, dans des fichiers que les tests ne couvrent pas.
// ═══════════════════════════════════════════════════════════════════════════════════════
import globals from 'globals'

// Le code porte des commentaires `eslint-disable` visant des règles de Next et de
// react-hooks. On ne charge pas ces plugins ici — on les déclare donc en règles vides,
// sinon chaque directive remonterait en « Definition for rule not found ».
const vide = { create: () => ({}) }
const factice = (noms) => ({ rules: Object.fromEntries(noms.map(n => [n, vide])) })

export default [
  {
    files: ['**/*.{js,jsx,mjs}'],
    ignores: ['node_modules/**', '.next/**', 'out/**', 'build/**'],
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    plugins: {
      '@next/next': factice(['no-img-element', 'no-html-link-for-pages', 'no-sync-scripts', 'no-page-custom-font']),
      'react-hooks': factice(['exhaustive-deps', 'rules-of-hooks', 'set-state-in-effect']),
      'react': factice(['no-unescaped-entities', 'display-name', 'jsx-key']),
    },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node, ...globals.es2021, React: 'readonly' },
    },
    rules: { 'no-undef': 'error' },
  },
  {
    files: ['**/__tests__/**/*.{js,jsx}', '**/*.test.{js,jsx}'],
    languageOptions: { globals: { ...globals.vitest } },
  },
]
