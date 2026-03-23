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
    const tableInfo = await prisma.$queryRawUnsafe(`PRAGMA table_info(Transaction)`);
    console.log("TRANSACTION TABLE INFO:", JSON.stringify(tableInfo, null, 2));

    const fkList = await prisma.$queryRawUnsafe(`PRAGMA foreign_key_list(Transaction)`);
    console.log("TRANSACTION FK LIST:", JSON.stringify(fkList, null, 2));
  } catch (err) {
    console.error("ERROR:", err);
  } finally {
    await prisma.$disconnect();
  }
}

check();
