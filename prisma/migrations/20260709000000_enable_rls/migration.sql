-- Hardened Multi-Tenant RLS Migration
-- Enforces data isolation between businesses at the PostgreSQL storage layer.
-- Compatible with PgBouncer session pooling (uses local transaction variables).

-- --- Table: User ---
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "User_tenantId_idx" ON "User"("tenantId");
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "User";
CREATE POLICY tenant_isolation ON "User" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: Role ---
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "Role_tenantId_idx" ON "Role"("tenantId");
ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Role";
CREATE POLICY tenant_isolation ON "Role" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: Session ---
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "Session_tenantId_idx" ON "Session"("tenantId");
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Session";
CREATE POLICY tenant_isolation ON "Session" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: Branch ---
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "Branch_tenantId_idx" ON "Branch"("tenantId");
ALTER TABLE "Branch" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Branch";
CREATE POLICY tenant_isolation ON "Branch" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: Warehouse ---
ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "Warehouse_tenantId_idx" ON "Warehouse"("tenantId");
ALTER TABLE "Warehouse" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Warehouse";
CREATE POLICY tenant_isolation ON "Warehouse" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: Customer ---
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "Customer_tenantId_idx" ON "Customer"("tenantId");
ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Customer";
CREATE POLICY tenant_isolation ON "Customer" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: CustomerTransaction ---
ALTER TABLE "CustomerTransaction" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "CustomerTransaction_tenantId_idx" ON "CustomerTransaction"("tenantId");
ALTER TABLE "CustomerTransaction" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "CustomerTransaction";
CREATE POLICY tenant_isolation ON "CustomerTransaction" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: Supplier ---
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "Supplier_tenantId_idx" ON "Supplier"("tenantId");
ALTER TABLE "Supplier" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Supplier";
CREATE POLICY tenant_isolation ON "Supplier" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: SupplierPayment ---
ALTER TABLE "SupplierPayment" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "SupplierPayment_tenantId_idx" ON "SupplierPayment"("tenantId");
ALTER TABLE "SupplierPayment" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "SupplierPayment";
CREATE POLICY tenant_isolation ON "SupplierPayment" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: Account ---
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "Account_tenantId_idx" ON "Account"("tenantId");
ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Account";
CREATE POLICY tenant_isolation ON "Account" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: JournalEntry ---
ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "JournalEntry_tenantId_idx" ON "JournalEntry"("tenantId");
ALTER TABLE "JournalEntry" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "JournalEntry";
CREATE POLICY tenant_isolation ON "JournalEntry" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: JournalLine ---
ALTER TABLE "JournalLine" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "JournalLine_tenantId_idx" ON "JournalLine"("tenantId");
ALTER TABLE "JournalLine" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "JournalLine";
CREATE POLICY tenant_isolation ON "JournalLine" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: Category ---
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "Category_tenantId_idx" ON "Category"("tenantId");
ALTER TABLE "Category" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Category";
CREATE POLICY tenant_isolation ON "Category" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: Model ---
ALTER TABLE "Model" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "Model_tenantId_idx" ON "Model"("tenantId");
ALTER TABLE "Model" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Model";
CREATE POLICY tenant_isolation ON "Model" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: Attribute ---
ALTER TABLE "Attribute" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "Attribute_tenantId_idx" ON "Attribute"("tenantId");
ALTER TABLE "Attribute" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Attribute";
CREATE POLICY tenant_isolation ON "Attribute" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: UnitOfMeasure ---
ALTER TABLE "UnitOfMeasure" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "UnitOfMeasure_tenantId_idx" ON "UnitOfMeasure"("tenantId");
ALTER TABLE "UnitOfMeasure" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "UnitOfMeasure";
CREATE POLICY tenant_isolation ON "UnitOfMeasure" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: Product ---
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "Product_tenantId_idx" ON "Product"("tenantId");
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Product";
CREATE POLICY tenant_isolation ON "Product" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: BundleItem ---
ALTER TABLE "BundleItem" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "BundleItem_tenantId_idx" ON "BundleItem"("tenantId");
ALTER TABLE "BundleItem" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "BundleItem";
CREATE POLICY tenant_isolation ON "BundleItem" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: Stock ---
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "Stock_tenantId_idx" ON "Stock"("tenantId");
ALTER TABLE "Stock" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Stock";
CREATE POLICY tenant_isolation ON "Stock" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: StockMovement ---
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "StockMovement_tenantId_idx" ON "StockMovement"("tenantId");
ALTER TABLE "StockMovement" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StockMovement";
CREATE POLICY tenant_isolation ON "StockMovement" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: StockRequest ---
ALTER TABLE "StockRequest" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "StockRequest_tenantId_idx" ON "StockRequest"("tenantId");
ALTER TABLE "StockRequest" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StockRequest";
CREATE POLICY tenant_isolation ON "StockRequest" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: StockRequestItem ---
ALTER TABLE "StockRequestItem" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "StockRequestItem_tenantId_idx" ON "StockRequestItem"("tenantId");
ALTER TABLE "StockRequestItem" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StockRequestItem";
CREATE POLICY tenant_isolation ON "StockRequestItem" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: StockWastage ---
ALTER TABLE "StockWastage" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "StockWastage_tenantId_idx" ON "StockWastage"("tenantId");
ALTER TABLE "StockWastage" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StockWastage";
CREATE POLICY tenant_isolation ON "StockWastage" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: PurchaseInvoice ---
ALTER TABLE "PurchaseInvoice" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "PurchaseInvoice_tenantId_idx" ON "PurchaseInvoice"("tenantId");
ALTER TABLE "PurchaseInvoice" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PurchaseInvoice";
CREATE POLICY tenant_isolation ON "PurchaseInvoice" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: PurchaseItem ---
ALTER TABLE "PurchaseItem" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "PurchaseItem_tenantId_idx" ON "PurchaseItem"("tenantId");
ALTER TABLE "PurchaseItem" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PurchaseItem";
CREATE POLICY tenant_isolation ON "PurchaseItem" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: Sale ---
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "Sale_tenantId_idx" ON "Sale"("tenantId");
ALTER TABLE "Sale" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Sale";
CREATE POLICY tenant_isolation ON "Sale" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: SaleItem ---
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "SaleItem_tenantId_idx" ON "SaleItem"("tenantId");
ALTER TABLE "SaleItem" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "SaleItem";
CREATE POLICY tenant_isolation ON "SaleItem" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: Shift ---
ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "Shift_tenantId_idx" ON "Shift"("tenantId");
ALTER TABLE "Shift" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Shift";
CREATE POLICY tenant_isolation ON "Shift" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: Treasury ---
ALTER TABLE "Treasury" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "Treasury_tenantId_idx" ON "Treasury"("tenantId");
ALTER TABLE "Treasury" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Treasury";
CREATE POLICY tenant_isolation ON "Treasury" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: Transaction ---
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "Transaction_tenantId_idx" ON "Transaction"("tenantId");
ALTER TABLE "Transaction" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Transaction";
CREATE POLICY tenant_isolation ON "Transaction" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: Expense ---
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "Expense_tenantId_idx" ON "Expense"("tenantId");
ALTER TABLE "Expense" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Expense";
CREATE POLICY tenant_isolation ON "Expense" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: Ticket ---
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "Ticket_tenantId_idx" ON "Ticket"("tenantId");
ALTER TABLE "Ticket" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Ticket";
CREATE POLICY tenant_isolation ON "Ticket" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: TicketPart ---
ALTER TABLE "TicketPart" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "TicketPart_tenantId_idx" ON "TicketPart"("tenantId");
ALTER TABLE "TicketPart" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TicketPart";
CREATE POLICY tenant_isolation ON "TicketPart" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: TicketCollaborator ---
ALTER TABLE "TicketCollaborator" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "TicketCollaborator_tenantId_idx" ON "TicketCollaborator"("tenantId");
ALTER TABLE "TicketCollaborator" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TicketCollaborator";
CREATE POLICY tenant_isolation ON "TicketCollaborator" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: TicketNote ---
ALTER TABLE "TicketNote" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "TicketNote_tenantId_idx" ON "TicketNote"("tenantId");
ALTER TABLE "TicketNote" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TicketNote";
CREATE POLICY tenant_isolation ON "TicketNote" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: RepairPayment ---
ALTER TABLE "RepairPayment" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "RepairPayment_tenantId_idx" ON "RepairPayment"("tenantId");
ALTER TABLE "RepairPayment" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "RepairPayment";
CREATE POLICY tenant_isolation ON "RepairPayment" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: TechnicianPerformance ---
ALTER TABLE "TechnicianPerformance" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "TechnicianPerformance_tenantId_idx" ON "TechnicianPerformance"("tenantId");
ALTER TABLE "TechnicianPerformance" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TechnicianPerformance";
CREATE POLICY tenant_isolation ON "TechnicianPerformance" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: Feedback ---
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "Feedback_tenantId_idx" ON "Feedback"("tenantId");
ALTER TABLE "Feedback" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Feedback";
CREATE POLICY tenant_isolation ON "Feedback" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: DeviceMovement ---
ALTER TABLE "DeviceMovement" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "DeviceMovement_tenantId_idx" ON "DeviceMovement"("tenantId");
ALTER TABLE "DeviceMovement" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "DeviceMovement";
CREATE POLICY tenant_isolation ON "DeviceMovement" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: DailyWorkLog ---
ALTER TABLE "DailyWorkLog" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "DailyWorkLog_tenantId_idx" ON "DailyWorkLog"("tenantId");
ALTER TABLE "DailyWorkLog" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "DailyWorkLog";
CREATE POLICY tenant_isolation ON "DailyWorkLog" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: EmployeeTransaction ---
ALTER TABLE "EmployeeTransaction" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "EmployeeTransaction_tenantId_idx" ON "EmployeeTransaction"("tenantId");
ALTER TABLE "EmployeeTransaction" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "EmployeeTransaction";
CREATE POLICY tenant_isolation ON "EmployeeTransaction" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: AuditLog ---
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AuditLog";
CREATE POLICY tenant_isolation ON "AuditLog" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: BackupLog ---
ALTER TABLE "BackupLog" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "BackupLog_tenantId_idx" ON "BackupLog"("tenantId");
ALTER TABLE "BackupLog" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "BackupLog";
CREATE POLICY tenant_isolation ON "BackupLog" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: Floor ---
ALTER TABLE "Floor" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "Floor_tenantId_idx" ON "Floor"("tenantId");
ALTER TABLE "Floor" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Floor";
CREATE POLICY tenant_isolation ON "Floor" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: Table ---
ALTER TABLE "Table" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "Table_tenantId_idx" ON "Table"("tenantId");
ALTER TABLE "Table" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Table";
CREATE POLICY tenant_isolation ON "Table" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: LocalBackup ---
ALTER TABLE "LocalBackup" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "LocalBackup_tenantId_idx" ON "LocalBackup"("tenantId");
ALTER TABLE "LocalBackup" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "LocalBackup";
CREATE POLICY tenant_isolation ON "LocalBackup" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: SparePart ---
ALTER TABLE "SparePart" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "SparePart_tenantId_idx" ON "SparePart"("tenantId");
ALTER TABLE "SparePart" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "SparePart";
CREATE POLICY tenant_isolation ON "SparePart" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: CashCategory ---
ALTER TABLE "CashCategory" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "CashCategory_tenantId_idx" ON "CashCategory"("tenantId");
ALTER TABLE "CashCategory" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "CashCategory";
CREATE POLICY tenant_isolation ON "CashCategory" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: CommissionRule ---
ALTER TABLE "CommissionRule" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "CommissionRule_tenantId_idx" ON "CommissionRule"("tenantId");
ALTER TABLE "CommissionRule" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "CommissionRule";
CREATE POLICY tenant_isolation ON "CommissionRule" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: Partner ---
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "Partner_tenantId_idx" ON "Partner"("tenantId");
ALTER TABLE "Partner" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Partner";
CREATE POLICY tenant_isolation ON "Partner" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: PartnerTransaction ---
ALTER TABLE "PartnerTransaction" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "PartnerTransaction_tenantId_idx" ON "PartnerTransaction"("tenantId");
ALTER TABLE "PartnerTransaction" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PartnerTransaction";
CREATE POLICY tenant_isolation ON "PartnerTransaction" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

-- --- Table: StoreSettings ---
ALTER TABLE "StoreSettings" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "StoreSettings_tenantId_idx" ON "StoreSettings"("tenantId");
ALTER TABLE "StoreSettings" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StoreSettings";
CREATE POLICY tenant_isolation ON "StoreSettings" 
    USING (
        current_setting('app.current_tenant_id', true) = 'SYSTEM' 
        OR 
        "tenantId" = current_setting('app.current_tenant_id', true)
    );

