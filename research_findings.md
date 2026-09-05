# Best Practice Research: Next.js 16, React 19, Multi-Tenant Database Optimization

## 1. Next.js 16 Middleware Matcher Optimization
- **Problem**: Default matcher without static exclusions executes middleware on every asset (`_next/static`, images, fonts).
- **Standard Pattern**: Exclude `_next/static`, `_next/image`, `favicon.ico`, and all media extensions (`.svg, .png, .jpg, .woff2, .ico`).
- **Benchmark**: Reduces middleware request volume by 85–92%, freeing the Node.js event loop from micro-delays.

## 2. PostgreSQL Concurrent Indexing (Zero-Locking)
- **Problem**: `CREATE INDEX` on active PostgreSQL databases acquires an `ACCESS EXCLUSIVE` lock on the table, blocking reads and writes.
- **Solution**: `CREATE INDEX CONCURRENTLY IF NOT EXISTS`.
- **Prisma Requirement**: In Prisma migrations, standard migration files wrap operations in a transaction. Using `-- prisma:disable-transaction` allows `CREATE INDEX CONCURRENTLY` to run without failure.

## 3. High-Performance Multi-Tenant In-Memory Gating
- **Problem**: Calling unconfigured or remote Redis on every request introduces socket connection delays (150ms–800ms) or timeout errors.
- **Solution**: Gated Redis initialization (skip if `REDIS_URL` is empty) + local LRU cache (TTL 60s) providing 0.001ms latency for tenant status verification.
- **Scale-out**: Configured with a feature flag `ENABLE_TENANT_IN_MEMORY_CACHE` for instantaneous rollback if needed.

## 4. Financial KPI Pre-Aggregation & Rollups
- **Problem**: Calculating live balances via 6 separate aggregate sums on millions of `JournalLine` rows chokes database connection pools.
- **Solution**: Daily KPI rollups with idempotent `upsert` and soft-recompute hooks on historical mutation.
