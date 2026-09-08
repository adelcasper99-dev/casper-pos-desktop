const fs = require('fs');

const content = fs.readFileSync('/var/backups/casper_pre_fix_20260908_051202.sql', 'utf8');
const lines = content.split('\n');

let inJournalLine = false;
console.log('--- BACKUP JOURNAL LINE COPY SECTION ---');
for (const line of lines) {
  if (line.startsWith('COPY public."JournalLine"')) {
    inJournalLine = true;
    console.log(line);
    continue;
  }
  if (inJournalLine) {
    if (line.startsWith('\\.')) {
      inJournalLine = false;
      break;
    }
    console.log(line);
  }
}
