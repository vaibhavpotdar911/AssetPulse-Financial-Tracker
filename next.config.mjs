/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    unoptimized: true, // Guarantees local image rendering without external image optimizer dependencies
  },
};

export default nextConfig;
