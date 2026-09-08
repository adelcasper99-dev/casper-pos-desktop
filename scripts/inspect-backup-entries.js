const fs = require('fs');

const content = fs.readFileSync('/var/backups/casper_pre_fix_20260908_051202.sql', 'utf8');
const lines = content.split('\n');

let inJournalEntry = false;
console.log('--- BACKUP JOURNAL ENTRY COPY SECTION ---');
for (const line of lines) {
  if (line.startsWith('COPY public."JournalEntry"')) {
    inJournalEntry = true;
    console.log(line);
    continue;
  }
  if (inJournalEntry) {
    if (line.startsWith('\\.')) {
      inJournalEntry = false;
      break;
    }
    console.log(line);
  }
}
