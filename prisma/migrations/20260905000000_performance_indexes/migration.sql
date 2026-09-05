-- prisma:disable-transaction
-- High-Performance Composite Indexes for Multi-Tenant Query Acceleration
-- Executed concurrently with zero table locking in PostgreSQL

CREATE INDEX CONCURRENTLY IF NOT EXISTS "JournalLine_tenantId_accountId_idx" ON "JournalLine"("tenantId", "accountId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "JournalEntry_tenantId_date_idx" ON "JournalEntry"("tenantId", "date");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Sale_tenantId_branchId_createdAt_idx" ON "Sale"("tenantId", "branchId", "createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Product_tenantId_sku_idx" ON "Product"("tenantId", "sku");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Product_tenantId_categoryId_idx" ON "Product"("tenantId", "categoryId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Product_tenantId_deletedAt_archived_idx" ON "Product"("tenantId", "deletedAt", "archived");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Stock_tenantId_warehouseId_productId_idx" ON "Stock"("tenantId", "warehouseId", "productId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Ticket_tenantId_status_createdAt_idx" ON "Ticket"("tenantId", "status", "createdAt");
