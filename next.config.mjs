/** @type {import('next').NextConfig} */
const nextConfig = {
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