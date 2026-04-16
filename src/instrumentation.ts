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
        } catch (error) {
            console.error('[INSTRUMENTATION ERROR] Failed to initialize database:', error);
        }
    }
}
