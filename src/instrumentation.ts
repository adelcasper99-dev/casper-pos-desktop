/**
 * instrumentation.ts
 * 
 * Next.js startup hook that runs once when the server process starts.
 * This is the correct place for database initialization and seeding 
 * to avoid side-effects (mutations) during the Server Component render cycle.
 */

export async function register() {
    // Only run in the nodejs runtime (not Edge)
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        try {
            const { initDatabase } = await import('@/lib/db-init');
            console.log('[INSTRUMENTATION] Bootstrapping Casper POS Database...');
            await initDatabase();
            console.log('[INSTRUMENTATION] Database preparation complete.');
            
            // Initialize Background Sync & Mirroring exclusively on the server side
            const { SyncWorker } = await import('@/lib/sync-worker');
            SyncWorker.start(30000);
            console.log('[INSTRUMENTATION] Background SyncWorker started.');
        } catch (error) {
            console.error('[INSTRUMENTATION ERROR] Failed to initialize database:', error);
        }
    }
}
