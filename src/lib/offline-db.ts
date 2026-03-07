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
    status: string;
    totalAmount: number;
    synced: number;
    syncRetries: number;
    syncError?: string;
    createdAt: number;
    items?: any[];
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
}

class CasperOfflineDB extends Dexie {
    sales!: EntityTable<OfflineSale, 'id'>;
    products!: EntityTable<OfflineProduct, 'id'>;
    tickets!: EntityTable<OfflineTicket, 'id'>;
    syncMetadata!: EntityTable<SyncMetadata, 'key'>;

    constructor() {
        super('CasperOfflineDB');
        this.version(2).stores({
            sales: 'id, syncStatus, offlineFlag, createdAt, synced',
            products: 'id, barcode, syncPriority',
            tickets: 'id, synced, createdAt',
            syncMetadata: 'key'
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
