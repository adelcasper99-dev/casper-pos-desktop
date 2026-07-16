-- Add raw constraint to prevent StockMovement rows where both fromWarehouseId and toWarehouseId are null
-- (PostgreSQL only, SQLite ignores this via Prisma logic and relies on application-layer guards)

ALTER TABLE "StockMovement"
ADD CONSTRAINT "chk_stock_movement_warehouse_non_null"
CHECK ("fromWarehouseId" IS NOT NULL OR "toWarehouseId" IS NOT NULL);
