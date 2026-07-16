-- AlterTable
ALTER TABLE "RepairPayment" ADD COLUMN "journalEntryId" TEXT;

-- AddForeignKey
ALTER TABLE "RepairPayment" ADD CONSTRAINT "RepairPayment_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
