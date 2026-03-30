/*
  Warnings:

  - You are about to alter the column `quantity` on the `PurchaseItem` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Decimal`.
  - You are about to alter the column `quantity` on the `SaleItem` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Decimal`.
  - You are about to alter the column `quantity` on the `Stock` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Decimal`.
  - You are about to alter the column `quantity` on the `StockMovement` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Decimal`.
  - You are about to alter the column `quantity` on the `StockRequestItem` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Decimal`.
  - You are about to alter the column `quantity` on the `StockWastage` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Decimal`.
  - Added the required column `name` to the `Technician` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Technician` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Technician` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Treasury" ADD COLUMN "glCode" TEXT DEFAULT '1000';

-- CreateTable
CREATE TABLE "UnitOfMeasure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "abbreviation" TEXT,
    "conversionFactor" DECIMAL NOT NULL DEFAULT 1.00,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BundleItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bundleProductId" TEXT NOT NULL,
    "componentProductId" TEXT NOT NULL,
    "quantityIncluded" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "BundleItem_componentProductId_fkey" FOREIGN KEY ("componentProductId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BundleItem_bundleProductId_fkey" FOREIGN KEY ("bundleProductId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TicketPreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DevicePreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "barcode" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerId" TEXT,
    "deviceBrand" TEXT NOT NULL,
    "deviceModel" TEXT NOT NULL,
    "deviceImei" TEXT,
    "deviceColor" TEXT,
    "securityCode" TEXT,
    "patternData" TEXT,
    "issueDescription" TEXT NOT NULL,
    "conditionNotes" TEXT,
    "warrantyExpiry" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "currentBranchId" TEXT NOT NULL,
    "movementId" TEXT,
    "technicianId" TEXT,
    "completedById" TEXT,
    "initialQuote" DECIMAL NOT NULL DEFAULT 0.00,
    "repairPrice" DECIMAL NOT NULL DEFAULT 0.00,
    "partsCost" DECIMAL NOT NULL DEFAULT 0.00,
    "deposit" DECIMAL NOT NULL DEFAULT 0.00,
    "commissionRate" DECIMAL NOT NULL DEFAULT 0.00,
    "commissionAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "netProfit" DECIMAL NOT NULL DEFAULT 0.00,
    "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "paymentMethod" TEXT,
    "amountPaid" DECIMAL NOT NULL DEFAULT 0.00,
    "finalCustomerPrice" DECIMAL NOT NULL DEFAULT 0.00,
    "techBillingPrice" DECIMAL NOT NULL DEFAULT 0.00,
    "partCostPrice" DECIMAL NOT NULL DEFAULT 0.00,
    "laborPoolAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "techCommissionAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "centerLaborProfit" DECIMAL NOT NULL DEFAULT 0.00,
    "centerPartProfit" DECIMAL NOT NULL DEFAULT 0.00,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "completedAt" DATETIME,
    "deliveredAt" DATETIME,
    "commissionClawback" DECIMAL NOT NULL DEFAULT 0.00,
    "lastReturnedAt" DATETIME,
    "originalTechId" TEXT,
    "returnCount" INTEGER NOT NULL DEFAULT 0,
    "returnReason" TEXT,
    "rejectionReason" TEXT,
    "rejectedAt" DATETIME,
    "rejectedBy" TEXT,
    "shiftId" TEXT,
    "warrantyExpiryDate" DATETIME,
    "expectedDuration" INTEGER,
    "startedAt" DATETIME,
    "clientUserId" TEXT,
    "clientSupplierId" TEXT,
    "previousStatus" TEXT,
    "parentTicketId" TEXT,
    "isWarrantyReturn" BOOLEAN NOT NULL DEFAULT false,
    "slaDeadlineAt" DATETIME,
    "slaBreachedAt" DATETIME,
    CONSTRAINT "Ticket_clientSupplierId_fkey" FOREIGN KEY ("clientSupplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "DeviceMovement" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_currentBranchId_fkey" FOREIGN KEY ("currentBranchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Ticket_parentTicketId_fkey" FOREIGN KEY ("parentTicketId") REFERENCES "Ticket" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "Technician" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationLog_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TicketPart" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT,
    "quantity" DECIMAL NOT NULL DEFAULT 1.00,
    "refundedQty" INTEGER NOT NULL DEFAULT 0,
    "cost" DECIMAL NOT NULL DEFAULT 0.00,
    "price" DECIMAL NOT NULL DEFAULT 0.00,
    "baseCostPrice" DECIMAL NOT NULL DEFAULT 0.00,
    "transferPrice" DECIMAL NOT NULL DEFAULT 0.00,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isDamaged" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "warehouseId" TEXT,
    "addedById" TEXT,
    CONSTRAINT "TicketPart_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TicketPart_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TicketPart_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TicketPart_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TicketCollaborator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ASSISTANT',
    "commissionRate" DECIMAL NOT NULL DEFAULT 0.00,
    "commissionAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketCollaborator_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TicketCollaborator_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TicketNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketNote_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RepairPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "recordedBy" TEXT,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL DEFAULT 'PAYMENT',
    CONSTRAINT "RepairPayment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TechnicianPerformance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "technicianId" TEXT NOT NULL,
    "repairCount" INTEGER NOT NULL DEFAULT 0,
    "avgRepairTime" REAL NOT NULL DEFAULT 0.0,
    "satisfactionScore" DECIMAL NOT NULL DEFAULT 0.0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TechnicianPerformance_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Feedback_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeviceMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromBranchId" TEXT NOT NULL,
    "toBranchId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_TRANSIT',
    "driverName" TEXT,
    "notes" TEXT,
    "shippedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" DATETIME,
    "createdById" TEXT NOT NULL,
    "receivedById" TEXT,
    CONSTRAINT "DeviceMovement_toBranchId_fkey" FOREIGN KEY ("toBranchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeviceMovement_fromBranchId_fkey" FOREIGN KEY ("fromBranchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyWorkLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PRESENT',
    "deduction" DECIMAL NOT NULL DEFAULT 0.00,
    "bonus" DECIMAL NOT NULL DEFAULT 0.00,
    "note" TEXT,
    "shift" TEXT,
    "checkIn" DATETIME,
    "checkOut" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "bonusNote" TEXT,
    "deductionNote" TEXT,
    CONSTRAINT "DailyWorkLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmployeeTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "description" TEXT,
    "referenceId" TEXT,
    "referenceType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "branchId" TEXT,
    CONSTRAINT "EmployeeTransaction_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EmployeeTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Floor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Table" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Table_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LocalBackup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "backupPath" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileSize" INTEGER NOT NULL,
    "integrityStatus" TEXT NOT NULL DEFAULT 'UNCHECKED',
    "lastRestoredAt" DATETIME
);

-- CreateTable
CREATE TABLE "SparePart" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT,
    "category" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "quantity" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "costPrice" TEXT NOT NULL DEFAULT '0',
    "sellPrice" TEXT NOT NULL DEFAULT '0',
    "price1" TEXT NOT NULL DEFAULT '0',
    "price2" TEXT NOT NULL DEFAULT '0',
    "price3" TEXT NOT NULL DEFAULT '0'
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Branch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "type" TEXT NOT NULL DEFAULT 'STORE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "parentBranchId" TEXT,
    "region" TEXT,
    "sortOrder" INTEGER DEFAULT 0,
    "territoryCode" TEXT,
    "glCode" TEXT DEFAULT '1200',
    CONSTRAINT "Branch_parentBranchId_fkey" FOREIGN KEY ("parentBranchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Branch" ("address", "code", "createdAt", "deletedAt", "id", "name", "parentBranchId", "phone", "region", "sortOrder", "territoryCode", "type", "updatedAt") SELECT "address", "code", "createdAt", "deletedAt", "id", "name", "parentBranchId", "phone", "region", "sortOrder", "territoryCode", "type", "updatedAt" FROM "Branch";
DROP TABLE "Branch";
ALTER TABLE "new_Branch" RENAME TO "Branch";
CREATE UNIQUE INDEX "Branch_code_key" ON "Branch"("code");
CREATE TABLE "new_Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT DEFAULT '#06b6d4',
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Category" ("color", "createdAt", "id", "name") SELECT "color", "createdAt", "id", "name" FROM "Category";
DROP TABLE "Category";
ALTER TABLE "new_Category" RENAME TO "Category";
CREATE TABLE "new_Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "balance" DECIMAL NOT NULL DEFAULT 0.00,
    "walletBalance" DECIMAL NOT NULL DEFAULT 0.00,
    "creditLimit" DECIMAL,
    "linkedEmployeeId" TEXT,
    CONSTRAINT "Customer_linkedEmployeeId_fkey" FOREIGN KEY ("linkedEmployeeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Customer" ("address", "balance", "createdAt", "creditLimit", "email", "id", "name", "phone", "updatedAt") SELECT "address", "balance", "createdAt", "creditLimit", "email", "id", "name", "phone", "updatedAt" FROM "Customer";
DROP TABLE "Customer";
ALTER TABLE "new_Customer" RENAME TO "Customer";
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");
CREATE UNIQUE INDEX "Customer_linkedEmployeeId_key" ON "Customer"("linkedEmployeeId");
CREATE TABLE "new_CustomerTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "branchId" TEXT,
    CONSTRAINT "CustomerTransaction_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CustomerTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CustomerTransaction" ("amount", "createdAt", "createdBy", "customerId", "description", "id", "reference", "type") SELECT "amount", "createdAt", "createdBy", "customerId", "description", "id", "reference", "type" FROM "CustomerTransaction";
DROP TABLE "CustomerTransaction";
ALTER TABLE "new_CustomerTransaction" RENAME TO "CustomerTransaction";
CREATE INDEX "CustomerTransaction_customerId_idx" ON "CustomerTransaction"("customerId");
CREATE INDEX "CustomerTransaction_createdAt_idx" ON "CustomerTransaction"("createdAt");
CREATE INDEX "CustomerTransaction_branchId_idx" ON "CustomerTransaction"("branchId");
CREATE TABLE "new_Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "category" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentMethod" TEXT NOT NULL DEFAULT 'CASH',
    "shiftId" TEXT,
    "branchId" TEXT,
    CONSTRAINT "Expense_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("amount", "category", "date", "description", "id", "paymentMethod", "shiftId") SELECT "amount", "category", "date", "description", "id", "paymentMethod", "shiftId" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE TABLE "new_JournalEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "branchId" TEXT,
    "saleId" TEXT,
    "purchaseId" TEXT,
    "expenseId" TEXT,
    "ticketId" TEXT,
    "customerTransactionId" TEXT,
    "supplierPaymentId" TEXT,
    "employeeTransactionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JournalEntry_employeeTransactionId_fkey" FOREIGN KEY ("employeeTransactionId") REFERENCES "EmployeeTransaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "JournalEntry_supplierPaymentId_fkey" FOREIGN KEY ("supplierPaymentId") REFERENCES "SupplierPayment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "JournalEntry_customerTransactionId_fkey" FOREIGN KEY ("customerTransactionId") REFERENCES "CustomerTransaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "JournalEntry_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "JournalEntry_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "JournalEntry_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "PurchaseInvoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "JournalEntry_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "JournalEntry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_JournalEntry" ("createdAt", "date", "description", "expenseId", "id", "purchaseId", "reference", "saleId", "updatedAt") SELECT "createdAt", "date", "description", "expenseId", "id", "purchaseId", "reference", "saleId", "updatedAt" FROM "JournalEntry";
DROP TABLE "JournalEntry";
ALTER TABLE "new_JournalEntry" RENAME TO "JournalEntry";
CREATE INDEX "JournalEntry_date_idx" ON "JournalEntry"("date");
CREATE INDEX "JournalEntry_branchId_idx" ON "JournalEntry"("branchId");
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "costPrice" DECIMAL NOT NULL DEFAULT 0.00,
    "sellPrice" DECIMAL NOT NULL DEFAULT 0.00,
    "sellPrice2" DECIMAL NOT NULL DEFAULT 0.00,
    "sellPrice3" DECIMAL NOT NULL DEFAULT 0.00,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "minStock" INTEGER NOT NULL DEFAULT 5,
    "trackStock" BOOLEAN NOT NULL DEFAULT true,
    "itemType" TEXT NOT NULL DEFAULT 'PHYSICAL',
    "isBundle" BOOLEAN NOT NULL DEFAULT false,
    "categoryId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "unitOfMeasureId" TEXT,
    CONSTRAINT "Product_unitOfMeasureId_fkey" FOREIGN KEY ("unitOfMeasureId") REFERENCES "UnitOfMeasure" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("archived", "categoryId", "costPrice", "createdAt", "deletedAt", "description", "id", "minStock", "name", "sellPrice", "sellPrice2", "sellPrice3", "sku", "stock", "updatedAt", "version") SELECT "archived", "categoryId", "costPrice", "createdAt", "deletedAt", "description", "id", "minStock", "name", "sellPrice", "sellPrice2", "sellPrice3", "sku", "stock", "updatedAt", "version" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
CREATE TABLE "new_PurchaseInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceNumber" TEXT,
    "supplierId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "paidAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentMethod" TEXT NOT NULL DEFAULT 'CASH',
    "purchaseDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryCharge" DECIMAL NOT NULL DEFAULT 0.00,
    "voidReason" TEXT,
    "branchId" TEXT,
    "voidedAt" DATETIME,
    "voidedBy" TEXT,
    "isReturn" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    CONSTRAINT "PurchaseInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseInvoice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PurchaseInvoice_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PurchaseInvoice" ("createdAt", "deliveryCharge", "id", "invoiceNumber", "paidAmount", "paymentMethod", "purchaseDate", "status", "supplierId", "totalAmount", "voidReason", "voidedAt", "voidedBy", "warehouseId") SELECT "createdAt", "deliveryCharge", "id", "invoiceNumber", "paidAmount", "paymentMethod", "purchaseDate", "status", "supplierId", "totalAmount", "voidReason", "voidedAt", "voidedBy", "warehouseId" FROM "PurchaseInvoice";
DROP TABLE "PurchaseInvoice";
ALTER TABLE "new_PurchaseInvoice" RENAME TO "PurchaseInvoice";
CREATE TABLE "new_PurchaseItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseInvoiceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL DEFAULT 0.00,
    "returnedQty" INTEGER NOT NULL DEFAULT 0,
    "unitCost" DECIMAL NOT NULL,
    CONSTRAINT "PurchaseItem_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PurchaseItem" ("id", "productId", "purchaseInvoiceId", "quantity", "unitCost") SELECT "id", "productId", "purchaseInvoiceId", "quantity", "unitCost" FROM "PurchaseItem";
DROP TABLE "PurchaseItem";
ALTER TABLE "new_PurchaseItem" RENAME TO "PurchaseItem";
CREATE TABLE "new_Sale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "customerAddress" TEXT,
    "warehouseId" TEXT NOT NULL,
    "totalAmount" DECIMAL NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "refundReason" TEXT,
    "taxAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "subTotal" DECIMAL NOT NULL DEFAULT 0.00,
    "discountAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shiftId" TEXT,
    "warrantyDays" INTEGER,
    "warrantyExpiryDate" DATETIME,
    "customerId" TEXT,
    "tableId" TEXT,
    "tableName" TEXT,
    "userId" TEXT,
    "syncStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "offlineFlag" BOOLEAN NOT NULL DEFAULT false,
    "discountPercentage" DECIMAL DEFAULT 0.00,
    "previousStatus" TEXT,
    "isReturn" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    "branchId" TEXT,
    "relatedSupplierId" TEXT,
    CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Sale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Sale" ("createdAt", "customerAddress", "customerId", "customerName", "customerPhone", "id", "paymentMethod", "refundReason", "shiftId", "status", "subTotal", "taxAmount", "totalAmount", "userId", "warehouseId", "warrantyDays", "warrantyExpiryDate") SELECT "createdAt", "customerAddress", "customerId", "customerName", "customerPhone", "id", "paymentMethod", "refundReason", "shiftId", "status", "subTotal", "taxAmount", "totalAmount", "userId", "warehouseId", "warrantyDays", "warrantyExpiryDate" FROM "Sale";
DROP TABLE "Sale";
ALTER TABLE "new_Sale" RENAME TO "Sale";
CREATE INDEX "Sale_shiftId_idx" ON "Sale"("shiftId");
CREATE INDEX "Sale_customerId_idx" ON "Sale"("customerId");
CREATE INDEX "Sale_status_createdAt_idx" ON "Sale"("status", "createdAt");
CREATE INDEX "Sale_warehouseId_status_idx" ON "Sale"("warehouseId", "status");
CREATE INDEX "Sale_syncStatus_idx" ON "Sale"("syncStatus");
CREATE TABLE "new_SaleItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "saleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL DEFAULT 0.00,
    "refundedQty" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL NOT NULL,
    "unitCost" DECIMAL NOT NULL DEFAULT 0.00,
    CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SaleItem" ("id", "productId", "quantity", "refundedQty", "saleId", "unitCost", "unitPrice") SELECT "id", "productId", "quantity", "refundedQty", "saleId", "unitCost", "unitPrice" FROM "SaleItem";
DROP TABLE "SaleItem";
ALTER TABLE "new_SaleItem" RENAME TO "SaleItem";
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");
CREATE TABLE "new_Shift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "startCash" DECIMAL NOT NULL DEFAULT 0.00,
    "endCash" DECIMAL NOT NULL DEFAULT 0.00,
    "actualCash" DECIMAL NOT NULL DEFAULT 0.00,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "cashierName" TEXT,
    "businessDate" TEXT,
    "cashVariance" DECIMAL NOT NULL DEFAULT 0.00,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "crossShiftRefundsIssued" DECIMAL NOT NULL DEFAULT 0.00,
    "crossShiftRefundsReceived" DECIMAL NOT NULL DEFAULT 0.00,
    "forceCloseReason" TEXT,
    "forceClosed" BOOLEAN NOT NULL DEFAULT false,
    "forceClosedBy" TEXT,
    "hasAdjustments" BOOLEAN NOT NULL DEFAULT false,
    "isOrphaned" BOOLEAN NOT NULL DEFAULT false,
    "lastHeartbeat" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "registerId" TEXT,
    "registerName" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "totalCardSales" DECIMAL NOT NULL DEFAULT 0.00,
    "totalCashSales" DECIMAL NOT NULL DEFAULT 0.00,
    "totalExpenses" DECIMAL NOT NULL DEFAULT 0.00,
    "totalInstapay" DECIMAL NOT NULL DEFAULT 0.00,
    "totalWalletSales" DECIMAL NOT NULL DEFAULT 0.00,
    "totalAccountSales" DECIMAL NOT NULL DEFAULT 0.00,
    "totalRefunds" DECIMAL NOT NULL DEFAULT 0.00,
    "totalCashRefunds" DECIMAL NOT NULL DEFAULT 0.00,
    "totalAccountRefunds" DECIMAL NOT NULL DEFAULT 0.00,
    "totalSales" INTEGER NOT NULL DEFAULT 0,
    "totalSplitPayments" INTEGER NOT NULL DEFAULT 0,
    "totalTickets" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    "totalTicketRevenueCard" DECIMAL NOT NULL DEFAULT 0.00,
    "totalTicketRevenueCash" DECIMAL NOT NULL DEFAULT 0.00,
    "totalTicketRevenueInstapay" DECIMAL NOT NULL DEFAULT 0.00,
    "totalTicketRevenueWallet" DECIMAL NOT NULL DEFAULT 0.00,
    "cashBreakdown" TEXT,
    CONSTRAINT "Shift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Shift" ("actualCash", "businessDate", "cashVariance", "cashierName", "closedAt", "createdAt", "crossShiftRefundsIssued", "crossShiftRefundsReceived", "endCash", "forceCloseReason", "forceClosed", "forceClosedBy", "hasAdjustments", "id", "isOrphaned", "lastHeartbeat", "notes", "openedAt", "registerId", "registerName", "startCash", "status", "timezone", "totalCardSales", "totalCashSales", "totalExpenses", "totalInstapay", "totalRefunds", "totalSales", "totalSplitPayments", "totalTicketRevenueCard", "totalTicketRevenueCash", "totalTicketRevenueInstapay", "totalTicketRevenueWallet", "totalTickets", "totalWalletSales", "updatedAt", "userId") SELECT "actualCash", "businessDate", "cashVariance", "cashierName", "closedAt", "createdAt", "crossShiftRefundsIssued", "crossShiftRefundsReceived", "endCash", "forceCloseReason", "forceClosed", "forceClosedBy", "hasAdjustments", "id", "isOrphaned", "lastHeartbeat", "notes", "openedAt", "registerId", "registerName", "startCash", "status", "timezone", "totalCardSales", "totalCashSales", "totalExpenses", "totalInstapay", "totalRefunds", "totalSales", "totalSplitPayments", "totalTicketRevenueCard", "totalTicketRevenueCash", "totalTicketRevenueInstapay", "totalTicketRevenueWallet", "totalTickets", "totalWalletSales", "updatedAt", "userId" FROM "Shift";
DROP TABLE "Shift";
ALTER TABLE "new_Shift" RENAME TO "Shift";
CREATE INDEX "Shift_userId_status_idx" ON "Shift"("userId", "status");
CREATE INDEX "Shift_registerId_status_idx" ON "Shift"("registerId", "status");
CREATE TABLE "new_Stock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL DEFAULT 0.00,
    CONSTRAINT "Stock_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Stock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Stock" ("id", "productId", "quantity", "warehouseId") SELECT "id", "productId", "quantity", "warehouseId" FROM "Stock";
DROP TABLE "Stock";
ALTER TABLE "new_Stock" RENAME TO "Stock";
CREATE UNIQUE INDEX "Stock_productId_warehouseId_key" ON "Stock"("productId", "warehouseId");
CREATE TABLE "new_StockMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "fromWarehouseId" TEXT,
    "toWarehouseId" TEXT,
    "quantity" DECIMAL NOT NULL,
    "condition" TEXT NOT NULL DEFAULT 'GOOD',
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedById" TEXT,
    "branchId" TEXT,
    CONSTRAINT "StockMovement_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "Warehouse" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "Warehouse" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_StockMovement" ("createdAt", "fromWarehouseId", "id", "performedById", "productId", "quantity", "reason", "toWarehouseId", "type") SELECT "createdAt", "fromWarehouseId", "id", "performedById", "productId", "quantity", "reason", "toWarehouseId", "type" FROM "StockMovement";
DROP TABLE "StockMovement";
ALTER TABLE "new_StockMovement" RENAME TO "StockMovement";
CREATE TABLE "new_StockRequestItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stockRequestId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL DEFAULT 0.00,
    CONSTRAINT "StockRequestItem_stockRequestId_fkey" FOREIGN KEY ("stockRequestId") REFERENCES "StockRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockRequestItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_StockRequestItem" ("id", "productId", "quantity", "stockRequestId") SELECT "id", "productId", "quantity", "stockRequestId" FROM "StockRequestItem";
DROP TABLE "StockRequestItem";
ALTER TABLE "new_StockRequestItem" RENAME TO "StockRequestItem";
CREATE UNIQUE INDEX "StockRequestItem_stockRequestId_productId_key" ON "StockRequestItem"("stockRequestId", "productId");
CREATE TABLE "new_StockWastage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "reportedBy" TEXT NOT NULL,
    "branchId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockWastage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockWastage_reportedBy_fkey" FOREIGN KEY ("reportedBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockWastage_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StockWastage_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_StockWastage" ("createdAt", "id", "notes", "productId", "quantity", "reason", "reportedBy", "warehouseId") SELECT "createdAt", "id", "notes", "productId", "quantity", "reason", "reportedBy", "warehouseId" FROM "StockWastage";
DROP TABLE "StockWastage";
ALTER TABLE "new_StockWastage" RENAME TO "StockWastage";
CREATE INDEX "StockWastage_productId_createdAt_idx" ON "StockWastage"("productId", "createdAt");
CREATE INDEX "StockWastage_warehouseId_createdAt_idx" ON "StockWastage"("warehouseId", "createdAt");
CREATE INDEX "StockWastage_branchId_idx" ON "StockWastage"("branchId");
CREATE TABLE "new_StoreSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'settings',
    "name" TEXT NOT NULL DEFAULT 'Casper Store',
    "phone" TEXT,
    "address" TEXT,
    "taxRate" DECIMAL NOT NULL DEFAULT 0.00,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "receiptFooter" TEXT NOT NULL DEFAULT 'Thank you for shopping with us!',
    "vatNumber" TEXT,
    "logoUrl" TEXT,
    "autoPrint" BOOLEAN NOT NULL DEFAULT false,
    "autoPrintTicket" BOOLEAN NOT NULL DEFAULT false,
    "autoPrintEngineerCopy" BOOLEAN NOT NULL DEFAULT false,
    "paperSize" TEXT NOT NULL DEFAULT '80mm',
    "features" TEXT NOT NULL DEFAULT '{}',
    "locationLat" REAL NOT NULL DEFAULT 24.7136,
    "locationLng" REAL NOT NULL DEFAULT 46.6753,
    "locationRadius" INTEGER NOT NULL DEFAULT 500,
    "labelTemplate" TEXT,
    "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false,
    "blindCloseEnabled" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_StoreSettings" ("address", "autoPrint", "currency", "features", "id", "labelTemplate", "locationLat", "locationLng", "locationRadius", "logoUrl", "name", "paperSize", "phone", "receiptFooter", "taxRate", "vatNumber") SELECT "address", "autoPrint", "currency", "features", "id", "labelTemplate", "locationLat", "locationLng", "locationRadius", "logoUrl", "name", "paperSize", "phone", "receiptFooter", "taxRate", "vatNumber" FROM "StoreSettings";
DROP TABLE "StoreSettings";
ALTER TABLE "new_StoreSettings" RENAME TO "StoreSettings";
CREATE TABLE "new_Supplier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "balance" DECIMAL NOT NULL DEFAULT 0.00,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linkedEmployeeId" TEXT,
    CONSTRAINT "Supplier_linkedEmployeeId_fkey" FOREIGN KEY ("linkedEmployeeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Supplier" ("address", "balance", "createdAt", "email", "id", "name", "phone") SELECT "address", "balance", "createdAt", "email", "id", "name", "phone" FROM "Supplier";
DROP TABLE "Supplier";
ALTER TABLE "new_Supplier" RENAME TO "Supplier";
CREATE UNIQUE INDEX "Supplier_phone_key" ON "Supplier"("phone");
CREATE UNIQUE INDEX "Supplier_linkedEmployeeId_key" ON "Supplier"("linkedEmployeeId");
CREATE TABLE "new_SupplierPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplierId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "notes" TEXT,
    "paymentDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "branchId" TEXT,
    CONSTRAINT "SupplierPayment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SupplierPayment" ("amount", "id", "method", "notes", "paymentDate", "supplierId") SELECT "amount", "id", "method", "notes", "paymentDate", "supplierId" FROM "SupplierPayment";
DROP TABLE "SupplierPayment";
ALTER TABLE "new_SupplierPayment" RENAME TO "SupplierPayment";
CREATE INDEX "SupplierPayment_supplierId_idx" ON "SupplierPayment"("supplierId");
CREATE INDEX "SupplierPayment_branchId_idx" ON "SupplierPayment"("branchId");
CREATE TABLE "new_Technician" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "skills" TEXT,
    "commissionRate" DECIMAL NOT NULL DEFAULT 0.00,
    "lossRate" DECIMAL NOT NULL DEFAULT 70.00,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "warehouseId" TEXT,
    "defaultPriceTier" TEXT NOT NULL DEFAULT 'COST',
    "deletedAt" DATETIME,
    CONSTRAINT "Technician_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Technician_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Technician" ("id", "warehouseId") SELECT "id", "warehouseId" FROM "Technician";
DROP TABLE "Technician";
ALTER TABLE "new_Technician" RENAME TO "Technician";
CREATE UNIQUE INDEX "Technician_userId_key" ON "Technician"("userId");
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "description" TEXT,
    "paymentMethod" TEXT NOT NULL DEFAULT 'CASH',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    "deletedBy" TEXT,
    "deletedReason" TEXT,
    "isTransfer" BOOLEAN NOT NULL DEFAULT false,
    "relatedTransactionId" TEXT,
    "shiftId" TEXT,
    "treasuryId" TEXT,
    "expenseId" TEXT,
    "referenceId" TEXT,
    "referenceType" TEXT,
    "isReversed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Transaction_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_treasuryId_fkey" FOREIGN KEY ("treasuryId") REFERENCES "Treasury" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("amount", "createdAt", "deletedAt", "deletedBy", "deletedReason", "description", "id", "isTransfer", "paymentMethod", "relatedTransactionId", "shiftId", "treasuryId", "type") SELECT "amount", "createdAt", "deletedAt", "deletedBy", "deletedReason", "description", "id", "isTransfer", "paymentMethod", "relatedTransactionId", "shiftId", "treasuryId", "type" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE INDEX "Transaction_treasuryId_createdAt_idx" ON "Transaction"("treasuryId", "createdAt");
CREATE INDEX "Transaction_referenceId_referenceType_idx" ON "Transaction"("referenceId", "referenceType");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "roleStr" TEXT NOT NULL DEFAULT 'STAFF',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "branchId" TEXT,
    "deletedAt" DATETIME,
    "phone" TEXT,
    "isFrozen" BOOLEAN NOT NULL DEFAULT false,
    "isGlobalAdmin" BOOLEAN NOT NULL DEFAULT false,
    "managedHQIds" TEXT,
    "roleId" TEXT,
    "maxDiscount" DECIMAL DEFAULT 0.00,
    "maxDiscountAmount" DECIMAL DEFAULT 0.00,
    "salary" DECIMAL DEFAULT 0.00,
    "monthlyOffDays" INTEGER DEFAULT 4,
    "hireDate" DATETIME,
    CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("branchId", "createdAt", "deletedAt", "id", "isGlobalAdmin", "managedHQIds", "name", "password", "phone", "roleId", "roleStr", "username") SELECT "branchId", "createdAt", "deletedAt", "id", "isGlobalAdmin", "managedHQIds", "name", "password", "phone", "roleId", "roleStr", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
CREATE TABLE "new_Warehouse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "type" TEXT NOT NULL DEFAULT 'SELLABLE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isMaintenanceDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "branchId" TEXT NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Warehouse_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Warehouse" ("address", "branchId", "createdAt", "deletedAt", "id", "isDefault", "name") SELECT "address", "branchId", "createdAt", "deletedAt", "id", "isDefault", "name" FROM "Warehouse";
DROP TABLE "Warehouse";
ALTER TABLE "new_Warehouse" RENAME TO "Warehouse";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "UnitOfMeasure_code_key" ON "UnitOfMeasure"("code");

-- CreateIndex
CREATE INDEX "UnitOfMeasure_category_idx" ON "UnitOfMeasure"("category");

-- CreateIndex
CREATE INDEX "BundleItem_bundleProductId_idx" ON "BundleItem"("bundleProductId");

-- CreateIndex
CREATE UNIQUE INDEX "BundleItem_bundleProductId_componentProductId_key" ON "BundleItem"("bundleProductId", "componentProductId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketPreset_type_name_key" ON "TicketPreset"("type", "name");

-- CreateIndex
CREATE UNIQUE INDEX "DevicePreset_brand_model_key" ON "DevicePreset"("brand", "model");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_barcode_key" ON "Ticket"("barcode");

-- CreateIndex
CREATE INDEX "Ticket_barcode_idx" ON "Ticket"("barcode");

-- CreateIndex
CREATE INDEX "Ticket_status_createdAt_idx" ON "Ticket"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Ticket_customerPhone_idx" ON "Ticket"("customerPhone");

-- CreateIndex
CREATE INDEX "Ticket_currentBranchId_idx" ON "Ticket"("currentBranchId");

-- CreateIndex
CREATE INDEX "Ticket_technicianId_idx" ON "Ticket"("technicianId");

-- CreateIndex
CREATE INDEX "Ticket_clientUserId_idx" ON "Ticket"("clientUserId");

-- CreateIndex
CREATE INDEX "Ticket_clientSupplierId_idx" ON "Ticket"("clientSupplierId");

-- CreateIndex
CREATE INDEX "Ticket_parentTicketId_idx" ON "Ticket"("parentTicketId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketCollaborator_ticketId_technicianId_key" ON "TicketCollaborator"("ticketId", "technicianId");

-- CreateIndex
CREATE UNIQUE INDEX "TechnicianPerformance_technicianId_key" ON "TechnicianPerformance"("technicianId");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_ticketId_key" ON "Feedback"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyWorkLog_userId_date_key" ON "DailyWorkLog"("userId", "date");

-- CreateIndex
CREATE INDEX "EmployeeTransaction_userId_idx" ON "EmployeeTransaction"("userId");

-- CreateIndex
CREATE INDEX "EmployeeTransaction_branchId_idx" ON "EmployeeTransaction"("branchId");

-- CreateIndex
CREATE INDEX "SparePart_sku_idx" ON "SparePart"("sku");

-- CreateIndex
CREATE INDEX "SparePart_brand_idx" ON "SparePart"("brand");

-- CreateIndex
CREATE INDEX "SparePart_category_idx" ON "SparePart"("category");

-- CreateIndex
CREATE INDEX "SparePart_productName_idx" ON "SparePart"("productName");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
