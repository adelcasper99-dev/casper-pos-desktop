import path from 'path';

// Generate a unique ID for this test worker's database to prevent locking collisions
const suiteId = Math.random().toString(36).substring(7);
const dbPath = path.resolve(process.cwd(), 'prisma', `test-${suiteId}.db`);

// Set DATABASE_URL immediately before any imports (e.g. prisma) are resolved
process.env.DATABASE_URL = `file:${dbPath.replace(/\\/g, '/')}`;
console.log(`[TEST SETUP] Set DATABASE_URL to: ${process.env.DATABASE_URL}`);
