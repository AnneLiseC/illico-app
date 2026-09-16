import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import globals from "globals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // ═══════════════════════════════════════════════════════════════════════════════════
  // no-undef — ajouté le 16/09, après DEUX pannes de production dans la même journée.
  //
  //   · `getLogoBase64 is not defined` → plus aucun dossier de suivi ni PDF de compte
  //     rendu généré ;
  //   · `TVA_FRAIS is not defined` → récapitulatif financier, suivi financier, et la
  //     pièce jointe de la demande d'acompte envoyée par le cron.
  //
  // Les deux fois, le même geste : du code déplacé de api/pdf/route.js vers lib/pdf/, un
  // symbole laissé derrière, et rien pour le voir avant la mise en ligne. `next build`
  // ne l'attrape pas, les tests non plus — ces fichiers ne sont pas couverts.
  //
  // `eslint-config-next/core-web-vitals` n'active PAS cette règle : elle vient de
  // `eslint:recommended`, qui n'est pas étendu ici. Il faut donc la poser à la main, avec
  // les globales du navigateur et de Node, sans quoi `window`, `document`, `process` et
  // `fetch` remontent en faux positifs.
  // ═══════════════════════════════════════════════════════════════════════════════════
  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
        React: "readonly",
      },
    },
    rules: { "no-undef": "error" },
  },
  {
    // Fichiers de test : les globales de Vitest (describe, it, expect, vi…).
    files: ["**/__tests__/**/*.{js,jsx}", "**/*.test.{js,jsx}"],
    languageOptions: { globals: { ...globals.vitest } },
  },
]);

export default eslintConfig;
