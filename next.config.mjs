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