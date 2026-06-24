/** @type {import('next').NextConfig} */
const nextConfig = {
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