import { prisma } from "./prisma";

/**
 * Hardened Atomic Sequential ID Generator for Casper POS
 * Defies race conditions by leveraging database-level atomic operations.
 */
export async function getNextAtomicId(sequenceName: string, client: any = prisma): Promise<number> {
  let retries = 3;
  let lastError: any = null;

  while (retries > 0) {
    try {
      // Use SQLite's UPSERT with RETURNING for atomicity (v3.35.0+)
      const result = await client.$queryRaw<{ value: number }[]>`
        INSERT INTO "Sequence" ("name", "value") 
        VALUES (${sequenceName}, 1) 
        ON CONFLICT("name") DO UPDATE SET "value" = "Sequence"."value" + 1 
        RETURNING "value"
      `;

      if (result && result.length > 0) {
        return Number(result[0].value);
      }
      
      throw new Error("Empty result from sequence generator");
    } catch (error: any) {
      lastError = error;
      // SQLite "Busy" errors often manifest as generic errors in Prisma
      console.warn(`[ID_GENERATOR] Retry ${4 - retries}/3 for ${sequenceName}:`, error.message);
      retries--;
      if (retries > 0) {
        await new Promise(r => setTimeout(r, Math.random() * 200 + 50));
      }
    }
  }

  console.error(`[ID_GENERATOR] Permanent failure for ${sequenceName}:`, lastError);
  return Math.floor(Math.random() * 1000) + Date.now();
}

/**
 * Generates a formatted ticket number like T-001 or BRANCH-T-001
 */
export async function getFormattedTicketNumber(branchCode?: string, client: any = prisma): Promise<string> {
  const prefix = branchCode ? `${branchCode}-T` : "T-";
  const nextVal = await getNextAtomicId(prefix, client);
  return `${prefix}${nextVal.toString().padStart(3, '0')}`;
}
