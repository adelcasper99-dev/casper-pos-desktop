import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        globalSetup: './vitest-global-setup.ts',
        setupFiles: ['./src/__tests__/sync/env-setup.ts', './src/__tests__/sync/setup.ts'],
        fileParallelism: false,
        hookTimeout: 60000, 
        include: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/__tests__/sync/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'dist/',
                '.next/',
                '**/*.d.ts',
                '**/*.config.ts',
                'electron/',
            ],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@prisma/client': path.resolve(__dirname, './node_modules/.prisma-test/client'),
        },
    },
});