import { offlineDB } from './offline-db';
import { logger } from './logger';

export function generateIdempotencyKey(type: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `${type}-${timestamp}-${random}`;
}

export function isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export async function saveTreasuryTransactionOffline(
    type: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER',
    amount: number,
    description: string,
    paymentMethod: string,
    treasuryId?: string,
    shiftId?: string,
    categoryId?: string
): Promise<{ success: boolean; id: string; offline: boolean }> {
    const idempotencyKey = generateIdempotencyKey(type);
    const id = `tx_${idempotencyKey}`;

    if (isOnline()) {
        return { success: true, id, offline: false };
    }

    try {
        await offlineDB.treasuryTransactions.add({
            id,
            type,
            amount,
            description,
            paymentMethod,
            treasuryId,
            idempotencyKey,
            createdAt: Date.now(),
            syncStatus: 'PENDING',
            synced: 0,
            syncRetries: 0,
            shiftId,
            categoryId
        });

        logger.info(`📱 Offline treasury transaction saved: ${id}`);
        return { success: true, id, offline: true };
    } catch (error) {
        logger.error('Failed to save offline treasury transaction', error);
        return { success: false, id: '', offline: true };
    }
}

export async function saveInventoryMovementOffline(
    type: string,
    productId: string,
    quantity: number,
    fromWarehouseId?: string,
    toWarehouseId?: string,
    reason?: string,
    performedById?: string,
    branchId?: string
): Promise<{ success: boolean; id: string; offline: boolean }> {
    const idempotencyKey = generateIdempotencyKey('INVENTORY');
    const id = `inv_${idempotencyKey}`;

    if (isOnline()) {
        return { success: true, id, offline: false };
    }

    try {
        await offlineDB.inventoryMovements.add({
            id,
            type,
            productId,
            fromWarehouseId,
            toWarehouseId,
            quantity,
            reason,
            idempotencyKey,
            createdAt: Date.now(),
            syncStatus: 'PENDING',
            synced: 0,
            syncRetries: 0,
            performedById,
            branchId
        });

        logger.info(`📱 Offline inventory movement saved: ${id}`);
        return { success: true, id, offline: true };
    } catch (error) {
        logger.error('Failed to save offline inventory movement', error);
        return { success: false, id: '', offline: true };
    }
}

export async function saveReturnOffline(
    originalSaleId: string,
    returnType: string,
    amount: number,
    reason: string,
    items: any[],
    customerPhone?: string
): Promise<{ success: boolean; id: string; offline: boolean }> {
    const idempotencyKey = generateIdempotencyKey('RETURN');
    const id = `ret_${idempotencyKey}`;

    if (isOnline()) {
        return { success: true, id, offline: false };
    }

    try {
        await offlineDB.returns.add({
            id,
            originalSaleId,
            returnType,
            amount,
            reason,
            items,
            idempotencyKey,
            createdAt: Date.now(),
            syncStatus: 'PENDING',
            synced: 0,
            syncRetries: 0,
            customerPhone
        });

        logger.info(`📱 Offline return saved: ${id}`);
        return { success: true, id, offline: true };
    } catch (error) {
        logger.error('Failed to save offline return', error);
        return { success: false, id: '', offline: true };
    }
}

export async function hasPendingOfflineTransactions(): Promise<boolean> {
    try {
        const count = await offlineDB.treasuryTransactions.where('synced').equals(0).count();
        return count > 0;
    } catch {
        return false;
    }
}
