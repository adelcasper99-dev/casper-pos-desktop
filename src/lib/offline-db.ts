import Dexie, { type EntityTable } from 'dexie';

export interface OfflineProduct {
    id: string;
    name: string;
    sku: string;
    barcode: string;
    price: number;       // maps to sellPrice
    stock: number;
    categoryId?: string | null;
    categoryName: string;
    costPrice: number;
    trackStock: boolean;
    isBundle: boolean;
    image?: string | null;
    lastSynced: Date;
    syncPriority: number;
}

export interface OfflineTicket {
    id: string;
    customerName: string;
    customerPhone: string;
    deviceBrand: string;
    deviceModel: string;
    issueDescription: string;
    initialQuote?: number;
    deposit?: number;
    status: string;
    totalAmount?: number;
    synced: number;
    syncRetries: number;
    syncError?: string;
    createdAt: number;
    idempotencyKey?: string; // 🆕 Added for replay protection
    items?: any[];
    syncStatus?: 'PENDING' | 'SYNCED' | 'ERROR';
    repairPrice?: number;
    expectedDuration?: number | null;
}

export interface SyncMetadata {
    key: string;
    lastSyncTime: Date;
    syncStatus: string;
    recordCount: number;
}

export interface OfflineSale {
    id: string;
    customerName?: string;
    customerPhone?: string;
    customerAddress?: string;
    warehouseId: string;
    totalAmount: number;
    paymentMethod: string;
    status: string;
    taxAmount: number;
    subTotal: number;
    createdAt: number;
    items: any[];
    syncStatus?: 'PENDING' | 'SYNCED' | 'ERROR';
    synced?: number;
    syncRetries?: number;
    syncError?: string;
    offlineFlag: boolean;
    idempotencyKey?: string; // 🆕 Added for replay protection
    discountAmount: number;
    discountPercentage: number;
    isTimeSuspicious?: boolean;
}

export interface OfflineTreasuryTransaction {
    id: string;
    type: string;
    amount: number;
    description?: string;
    paymentMethod: string;
    treasuryId?: string;
    idempotencyKey: string;
    createdAt: number;
    syncStatus?: 'PENDING' | 'SYNCED' | 'ERROR';
    synced?: number;
    syncRetries?: number;
    syncError?: string;
    shiftId?: string;
    categoryId?: string;
    isTimeSuspicious?: boolean;
}

export interface OfflineInventoryMovement {
    id: string;
    type: string;
    productId: string;
    fromWarehouseId?: string;
    toWarehouseId?: string;
    quantity: number;
    reason?: string;
    idempotencyKey: string;
    createdAt: number;
    syncStatus?: 'PENDING' | 'SYNCED' | 'ERROR';
    synced?: number;
    syncRetries?: number;
    syncError?: string;
    performedById?: string;
    branchId?: string;
}

export interface OfflineReturn {
    id: string;
    originalSaleId: string;
    returnType: string;
    amount: number;
    reason: string;
    items: any[];
    idempotencyKey: string;
    createdAt: number;
    syncStatus?: 'PENDING' | 'SYNCED' | 'ERROR';
    synced?: number;
    syncRetries?: number;
    syncError?: string;
    customerPhone?: string;
}

class CasperOfflineDB extends Dexie {
    sales!: EntityTable<OfflineSale, 'id'>;
    products!: EntityTable<OfflineProduct, 'id'>;
    tickets!: EntityTable<OfflineTicket, 'id'>;
    syncMetadata!: EntityTable<SyncMetadata, 'key'>;
    treasuryTransactions!: EntityTable<OfflineTreasuryTransaction, 'id'>;
    inventoryMovements!: EntityTable<OfflineInventoryMovement, 'id'>;
    returns!: EntityTable<OfflineReturn, 'id'>;

    constructor() {
        super('CasperOfflineDB');
        this.version(5).stores({
            sales: 'id, syncStatus, offlineFlag, createdAt, synced, isTimeSuspicious',
            products: 'id, barcode, syncPriority',
            tickets: 'id, syncStatus, idempotencyKey, createdAt, synced',
            syncMetadata: 'key',
            treasuryTransactions: 'id, syncStatus, idempotencyKey, createdAt, synced, isTimeSuspicious',
            inventoryMovements: 'id, syncStatus, idempotencyKey, createdAt, synced',
            returns: 'id, syncStatus, idempotencyKey, createdAt, synced'
        });
    }

    // Helper for safe bulk put
    async safeBulkPut<T>(table: any, items: T[]) {
        try {
            await table.bulkPut(items);
            return true;
        } catch (error) {
            console.error('safeBulkPut failed', error);
            return false;
        }
    }

    // Helper for safe get
    async safeGet<T>(table: any, key: string) {
        try {
            return await table.get(key);
        } catch (error) {
            console.error('safeGet failed', error);
            return null;
        }
    }
}

export const offlineDB = new CasperOfflineDB();
// Export db reference for backwards compatibility
export const db = offlineDB;
