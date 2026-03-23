const { PrismaClient } = require('@prisma/client');
const path = require('path');
const dbPath = path.resolve('prisma/prisma/dev.db');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `file:${dbPath}`
    }
  }
});

async function check() {
  try {
    const treasuries = await prisma.treasury.findMany();
    console.log("TREASURIES:", JSON.stringify(treasuries, null, 2));
  } catch (err) {
    console.error("ERROR:", err);
  } finally {
    await prisma.$disconnect();
  }
}

check();
