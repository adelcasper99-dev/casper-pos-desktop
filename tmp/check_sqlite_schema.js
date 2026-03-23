const { execSync } = require('child_process');
try {
    console.log("Listing PRAGMA foreign_key_list('Transaction'):");
    const output = execSync('sqlite3 prisma/local.db "PRAGMA foreign_key_list(\'Transaction\');"').toString();
    console.log(output);

    console.log("\nListing table info for 'Transaction':");
    const info = execSync('sqlite3 prisma/local.db "PRAGMA table_info(\'Transaction\');"').toString();
    console.log(info);

    console.log("\nListing table creation SQL for 'Transaction':");
    const sql = execSync('sqlite3 prisma/local.db ".schema Transaction"').toString();
    console.log(sql);
} catch (e) {
    console.error("Failed to run sqlite3 command. Ensure it is in PATH.", e.message);
}
