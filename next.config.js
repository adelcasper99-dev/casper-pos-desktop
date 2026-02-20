/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "standalone",
    // distDir: "dist", // REMOVED to avoid conflict with electron-builder and simplify standalone path
    images: {
        unoptimized: true,
    },
    experimental: {
        serverComponentsExternalPackages: ["bcryptjs"],
    },
};

module.exports = nextConfig;
