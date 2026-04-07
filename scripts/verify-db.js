const { PrismaClient } = require('@prisma/client');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'casper-pos-desktop', 'local.db');
process.env.DATABASE_URL = `file:${dbPath.replace(/\\/g, '/')}`;

const prisma = new PrismaClient();

async function check() {
    const tables = ['PurchaseInvoice', 'Sale', 'Ticket', 'User'];
    for (const table of tables) {
        const info = await prisma.$queryRawUnsafe(`PRAGMA table_info("${table}")`);
        const cols = info.map(i => i.name);
        console.log(`${table}: ${cols.join(', ')}`);
    }
    await prisma.$disconnect();
}

check();
