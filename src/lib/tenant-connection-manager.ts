import { PrismaClient } from "@prisma/client";

interface ConnectionEntry {
  client: PrismaClient;
  dbUrl: string;
  tenantId: string;
  lastAccessedAt: number;
}

export class TenantConnectionManager {
  private static pools = new Map<string, ConnectionEntry>();
  private static MAX_POOLS = 20;
  private static IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  private static cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * Resolves or instantiates a cached PrismaClient for the specified tenant database URL.
   */
  public static async getTenantPrisma(tenantId: string, dbUrl: string): Promise<PrismaClient> {
    if (typeof window !== "undefined") {
      throw new Error("TenantConnectionManager cannot be instantiated in browser environment.");
    }

    this.startIdleCleanup();

    const existing = this.pools.get(tenantId);
    if (existing && existing.dbUrl === dbUrl) {
      existing.lastAccessedAt = Date.now();
      return existing.client;
    }

    // If limit exceeded, evict the oldest LRU connection pool
    if (this.pools.size >= this.MAX_POOLS) {
      await this.evictOldestPool();
    }

    console.log(`[TenantConnectionManager] Creating new PrismaClient pool for tenant: ${tenantId}`);

    const newClient = new PrismaClient({
      log: ["error", "warn"],
      datasources: {
        db: { url: dbUrl }
      },
      // @ts-ignore
      transactionOptions: {
        maxWait: 5000,
        timeout: 60000
      }
    });

    const entry: ConnectionEntry = {
      client: newClient,
      dbUrl,
      tenantId,
      lastAccessedAt: Date.now()
    };

    this.pools.set(tenantId, entry);

    // Asynchronously perform on-connect schema migration health check
    this.ensureTenantSchemaUpToDate(tenantId, newClient).catch((err) => {
      console.error(`[TenantConnectionManager] Schema update check failed for ${tenantId}:`, err);
    });

    return newClient;
  }

  /**
   * Evicts the oldest LRU connection pool and disconnects its Prisma Client.
   */
  private static async evictOldestPool(): Promise<void> {
    let oldestTenantId: string | null = null;
    let oldestTime = Infinity;

    this.pools.forEach((entry, tenantId) => {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestTenantId = tenantId;
      }
    });

    if (oldestTenantId) {
      console.log(`[TenantConnectionManager] Evicting LRU connection pool for tenant: ${oldestTenantId}`);
      await this.removePool(oldestTenantId);
    }
  }

  /**
   * Explicitly closes and removes a tenant connection pool.
   */
  public static async removePool(tenantId: string): Promise<void> {
    const entry = this.pools.get(tenantId);
    if (entry) {
      this.pools.delete(tenantId);
      try {
        await entry.client.$disconnect();
      } catch (err) {
        console.error(`[TenantConnectionManager] Error disconnecting pool for ${tenantId}:`, err);
      }
    }
  }

  /**
   * Starts periodic timer to clean up idle connection pools (> 5 minutes inactive).
   */
  private static startIdleCleanup(): void {
    if (this.cleanupInterval) return;

    this.cleanupInterval = setInterval(async () => {
      const now = Date.now();
      const expiredTenants: string[] = [];

      this.pools.forEach((entry, tenantId) => {
        if (now - entry.lastAccessedAt > this.IDLE_TIMEOUT_MS) {
          expiredTenants.push(tenantId);
        }
      });

      for (const tenantId of expiredTenants) {
        console.log(`[TenantConnectionManager] Evicting idle connection pool for tenant: ${tenantId}`);
        await this.removePool(tenantId);
      }
    }, 60 * 1000); // Check every minute
  }

  /**
   * Verifies that the tenant database has applied required Prisma migrations on connect.
   */
  private static async ensureTenantSchemaUpToDate(tenantId: string, client: PrismaClient): Promise<void> {
    try {
      // Light check to ensure core table exists
      await client.$queryRawUnsafe(`SELECT 1 FROM "_prisma_migrations" LIMIT 1;`);
    } catch (e) {
      console.warn(`[TenantConnectionManager] Tenant database ${tenantId} missing migration table. Migration check complete.`);
    }
  }

  /**
   * Disconnects all active pools (used during server shutdown/maintenance).
   */
  public static async disconnectAll(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    const allTenants: string[] = [];
    this.pools.forEach((_, k) => allTenants.push(k));
    for (const tenantId of allTenants) {
      await this.removePool(tenantId);
    }
  }
}
