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
        serverActions: {
            allowedOrigins: ["localhost:3000", "127.0.0.1:3000"],
        }
    },
};

module.exports = nextConfig;
