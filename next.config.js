/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ensure remote textures can load from threejs.org and githubusercontent
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'threejs.org' },
      { protocol: 'https', hostname: 'raw.githubusercontent.com' }
    ]
  }
};

module.exports = nextConfig;

