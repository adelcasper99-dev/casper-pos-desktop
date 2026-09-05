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
        optimizePackageImports: [
            'lucide-react',
            'date-fns',
            'recharts',
            'framer-motion',
            '@tanstack/react-query',
            '@radix-ui/react-avatar',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-label',
            '@radix-ui/react-popover',
            '@radix-ui/react-progress',
            '@radix-ui/react-radio-group',
            '@radix-ui/react-select',
            '@radix-ui/react-separator',
            '@radix-ui/react-slot',
            '@radix-ui/react-tabs',
        ],
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
                ignored: [
                    '**/node_modules/**',
                    '**/.git/**',
                    '**/dist/**',
                    '**/build/**',
                    '**/release/**',
                    '**/.agents/**',
                    '**/knowledge/**',
                    '**/graphify-out/**',
                    '**/prisma/*.db*',
                    '**/*.log'
                ]
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
