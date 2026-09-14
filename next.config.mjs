import { fileURLToPath } from 'url'
import { dirname } from 'path'
const projectRoot = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Épingle la racine du projet : sinon Next peut la déduire à tort du dossier
  // parent (un package.json/package-lock.json parasite dans C:\Users\anne-\ le
  // faisait résoudre tailwindcss & co au mauvais endroit).
  turbopack: {
    root: projectRoot,
  },
  // Garantit l'inclusion des polices TTF (lues via fs au runtime) dans le bundle
  // serverless de la route PDF — sans ça, le traçage statique peut les omettre.
  outputFileTracingIncludes: {
    'app/api/pdf/route.js': ['./public/fonts/**'],
  },
  // CONSOLE DU NAVIGATEUR — nettoyée en production (14/09).
  //
  // Précision utile : ce réglage ne ferme AUCUNE faille. Ce qui s'affiche dans la console
  // du navigateur est de la donnée que l'utilisateur connecté a déjà sous les yeux dans la
  // page. La vraie fuite était ailleurs, dans les messages d'erreur bruts affichés à
  // l'écran, qui livraient les noms des tables et des contraintes — réglée par
  // app/lib/erreurs.js.
  //
  // `console.error` est CONSERVÉ : c'est lui qui porte le détail technique dont Anne-Lise
  // a besoin quand une cliente lui envoie une capture d'écran. Le supprimer rendrait le
  // diagnostic aveugle, ce qui est exactement le contraire du but.
  compiler: {
    removeConsole: { exclude: ['error'] },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'tfqtzfyavitrcsgbuueq.supabase.co',
      },
    ],
  },
};

export default nextConfig;