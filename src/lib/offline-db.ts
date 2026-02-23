import Dexie, { Table } from 'dexie';

// ============================================================================
// INTERFACES
// ============================================================================

export interface OfflineProduct {
    id: string;
    name: string;
    barcode: string;
    price: number;
    stock: number;
    categoryId: string | null;
    categoryName: string;
    costPrice: number;
    image?: string;
    lastSynced: Date;
    syncPriority: number; // Higher = sync first
}

export interface OfflineSale {
    id: string;
    items: {
        productId: string;
        productName: string;
        quantity: number;
        unitPrice: number;
        unitCost: number;
    }[];
    totalAmount: number;
    taxAmount: number;
    paymentMethod: string;
    treasuryId?: string; // 🆕 Added field
    customerName?: string;
    customerPhone?: string;
    createdAt: Date;
    userId?: string;
    shiftId?: string; // Original shift ID if known, else handled during sync
    synced: number; // 0 = false, 1 = true (IndexedDB friendly)
    syncRetries: number;
    syncError?: string;
}

export interface OfflineTicket {
    id: string;
    barcode: string;
    customerName: string;
    customerPhone: string;
    deviceBrand: string; // 🆕 Changed from deviceType
    deviceModel: string; // 🆕 Added field
    issue: string;
    estimatedCost: number;
    parts: any[];
    createdAt: Date;
    userId?: string;
    synced: number; // 0 = false, 1 = true
    syncRetries: number;
    syncError?: string;
}

export interface SyncMetadata {
    key: string;
    lastSyncTime: Date;
    syncStatus: 'success' | 'pending' | 'failed';
    recordCount?: number;
    errorMessage?: string;
}

// ============================================================================
// DATABASE CLASS
// ============================================================================

class OfflineDatabase extends Dexie {
    products!: Table<OfflineProduct, string>;
    sales!: Table<OfflineSale, string>;
    tickets!: Table<OfflineTicket, string>;
    syncMetadata!: Table<SyncMetadata, string>;

    constructor() {
        super('CasperPOSOffline');

        this.version(1).stores({
            products: 'id, barcode, name, categoryId, syncPriority',
            sales: 'id, createdAt, synced, syncRetries',
            tickets: 'id, barcode, createdAt, synced, syncRetries',
            syncMetadata: 'key, lastSyncTime'
        });

        // 🆕 Version 2: Added treasuryId to sales
        this.version(2).stores({
            products: 'id, barcode, name, categoryId, syncPriority',
            sales: 'id, createdAt, synced, syncRetries, treasuryId',
            tickets: 'id, barcode, createdAt, synced, syncRetries',
            syncMetadata: 'key, lastSyncTime'
        }).upgrade(tx => {
            return tx.table('sales').toCollection().modify(sale => {
                if (!sale.treasuryId) sale.treasuryId = undefined;
            });
        });
    }

    // 🛡️ RELIABILITY: Graceful error handling
    async safeGet<T>(table: Table<T, string>, key: string): Promise<T | null> {
        try {
            const result = await table.get(key);
            return result || null;
        } catch (error) {
            console.error(`IndexedDB get error for ${table.name}:`, error);
            return null;
        }
    }

    // ⚡ SPEED: Bulk operations
    async safeBulkPut<T>(table: Table<T, string>, items: T[]): Promise<boolean> {
        try {
            await table.bulkPut(items);
            return true;
        } catch (error) {
            console.error(`IndexedDB bulk put error for ${table.name}:`, error);
            return false;
        }
    }

    // 🛡️ RELIABILITY: Check quota before operations
    async checkQuota(): Promise<{ available: number; used: number; percentage: number }> {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            const estimate = await navigator.storage.estimate();
            const used = estimate.usage || 0;
            const quota = estimate.quota || 0;
            const percentage = quota > 0 ? (used / quota) * 100 : 0;

            return {
                used,
                available: quota - used,
                percentage
            };
        }
        return { used: 0, available: Infinity, percentage: 0 };
    }
}

export const offlineDB = new OfflineDatabase();

// 🛡️ RELIABILITY: Initialize DB and handle errors
export async function initializeOfflineDB(): Promise<boolean> {
    try {
        await offlineDB.open();
        console.log('✅ IndexedDB initialized successfully');
        return true;
    } catch (error) {
        console.error('❌ IndexedDB initialization failed:', error);
        return false;
    }
}
