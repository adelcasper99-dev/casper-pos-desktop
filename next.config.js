/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "standalone",
    productionBrowserSourceMaps: false,
    compress: true,
    images: {
        unoptimized: true,
    },
    experimental: {
        serverComponentsExternalPackages: ["bcryptjs"],
    },
};

module.exports = nextConfig;
