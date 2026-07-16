const Database = require('./node_modules/better-sqlite3');
const fs = require('fs');
const db = new Database('prisma/local.db');
const sql = fs.readFileSync('prisma/migrations/20260712000000_add_reorder_rule/migration.sql', 'utf8');
db.exec(sql);
console.log('Migration applied successfully');
