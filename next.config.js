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
        serverComponentsExternalPackages: ["@prisma/client", "prisma", "bcryptjs"],
        instrumentationHook: true,
        serverActions: {
            allowedOrigins: [
                "localhost:3000",
                "127.0.0.1:3000",
                "casper-erp.com",
                "*.casper-erp.com",
                "casper-hq.casper-erp.com",
                "hq.casper-erp.com",
                "109.123.247.119",
                "109.123.247.119:3000"
            ],
            bodySizeLimit: '10mb',
        }
    },
    webpack: (config, { isServer, dev }) => {
        if (dev) {
            config.watchOptions = {
                ...config.watchOptions,
                ignored: ['**/node_modules', '**/prisma/*.db', '**/prisma/*.db-wal', '**/prisma/*.db-shm', '**/*.log']
            };
        }
        if (!isServer) {
            config.resolve.fallback = {
                ...config.resolve.fallback,
                fs: false,
                path: false,
                os: false,
                child_process: false,
                async_hooks: false,
            };
            // Stub @prisma/client for client builds so it never reaches the browser bundle.
            // Bare package names (e.g. '@prisma/client') are intercepted by webpack's alias
            // system BEFORE Next.js's JsConfigPathsPlugin expands path aliases — which is why
            // aliasing '@/lib/prisma$' (a path alias) failed: the path plugin runs first.
            config.resolve.alias = {
                ...config.resolve.alias,
                '@prisma/client': require('path').resolve(
                    __dirname,
                    'src/lib/__stubs__/prisma-client-pkg.browser.stub.js'
                ),
            };
        }
        return config;
    },
};

module.exports = withBundleAnalyzer(nextConfig);
// Touch to force rebuild
