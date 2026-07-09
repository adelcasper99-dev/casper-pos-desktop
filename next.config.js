const withBundleAnalyzer = require('@next/bundle-analyzer')({
    enabled: process.env.ANALYZE === 'true',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "standalone",
    productionBrowserSourceMaps: false,
    compress: true,
    images: {
        unoptimized: true,
    },
    experimental: {
        instrumentationHook: true,
        serverComponentsExternalPackages: ["bcryptjs", "zod"],
        serverActions: {
            allowedOrigins: ["localhost:3000", "127.0.0.1:3000"],
            bodySizeLimit: '10mb',
        }
    },
    webpack: (config, { isServer }) => {
        if (!isServer) {
            config.resolve.fallback = {
                ...config.resolve.fallback,
                fs: false,
                path: false,
                os: false,
                child_process: false,
                async_hooks: false,
            };
        }
        return config;
    },
};

module.exports = withBundleAnalyzer(nextConfig);
// Touch to force rebuild
