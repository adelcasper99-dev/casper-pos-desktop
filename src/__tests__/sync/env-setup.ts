import path from 'path';

// Generate a unique ID for this test worker's database to prevent locking collisions
const suiteId = Math.random().toString(36).substring(7);
const dbPath = path.resolve(process.cwd(), 'prisma', `test-${suiteId}.db`);

// Use a relative path to avoid absolute path space parsing issues on Windows.
// Prisma resolves relative SQLite paths relative to the schema file.
process.env.DATABASE_URL = `file:./test-${suiteId}.db`;
console.log(`[TEST SETUP] Set DATABASE_URL to: ${process.env.DATABASE_URL}`);


