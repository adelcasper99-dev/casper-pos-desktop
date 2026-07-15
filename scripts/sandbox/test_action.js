// Mock next/headers before importing the action
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
    if (id === 'next/headers') {
        return {
            cookies: () => ({
                get: (name) => {
                    if (name === 'session') return { value: 'super-admin-token-test-1234' };
                    return undefined;
                }
            })
        };
    }
    return originalRequire.apply(this, arguments);
};

// Import generateNextSku and prisma
const { generateNextSku } = require('./src/actions/inventory');
const { prisma } = require('./src/lib/prisma');

async function main() {
    console.log('--- Testing generateNextSku ---');
    try {
        const res = await generateNextSku();
        console.log('generateNextSku() output:', res);

        const resWithCart = await generateNextSku({ existingSKUs: ['C-01', 'C-02'] });
        console.log('generateNextSku({ existingSKUs: [...] }) output:', resWithCart);

        const resWithNumeric = await generateNextSku({ prefix: '' });
        console.log('generateNextSku({ prefix: "" }) output:', resWithNumeric);
    } catch (err) {
        console.error('Error running action:', err);
    }
}

main().finally(() => prisma.$disconnect());
