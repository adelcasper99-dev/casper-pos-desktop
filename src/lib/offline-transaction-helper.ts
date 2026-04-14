import { offlineDB } from './offline-db';
import { logger } from './logger';

// ── Key Generation ─────────────────────────────────────────────────────────────
// Always generate BEFORE any network call — the key is stored locally first,
// then sent to the server so the server can detect replays.
export function generateIdempotencyKey(type: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `${type}-${timestamp}-${random}`;
}

export function isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

// ── Treasury: Offline-Safe Deposit / Withdrawal ────────────────────────────────
// Behaviour:
//   • ALWAYS generates an idempotencyKey so callers can pass it to the server action.
//   • If offline → persists to IndexedDB (PENDING) and returns offline:true.
//   • If online  → returns immediately (caller is expected to call addTreasuryTransaction
//                  with the returned idempotencyKey for server-side replay protection).
export async function saveTreasuryTransactionOffline(
    type: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER',
    amount: number,
    description: string,
    paymentMethod: string,
    treasuryId?: string,
    shiftId?: string,
    categoryId?: string
): Promise<{ success: boolean; id: string; idempotencyKey: string; offline: boolean }> {
    const idempotencyKey = generateIdempotencyKey(type);
    const id = `tx_${idempotencyKey}`;

    // ── Online path: caller must use idempotencyKey with the server action ──────
    if (isOnline()) {
        return { success: true, id, idempotencyKey, offline: false };
    }

    // ── Offline path: persist to IndexedDB ────────────────────────────────────
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
            categoryId,
        });

        logger.info(`📱 Offline treasury transaction queued: ${id}`);
        return { success: true, id, idempotencyKey, offline: true };
    } catch (error) {
        logger.error('Failed to save offline treasury transaction', error);
        return { success: false, id: '', idempotencyKey, offline: true };
    }
}

// ── Inventory Movement ─────────────────────────────────────────────────────────
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
            branchId,
        });

        logger.info(`📱 Offline inventory movement queued: ${id}`);
        return { success: true, id, offline: true };
    } catch (error) {
        logger.error('Failed to save offline inventory movement', error);
        return { success: false, id: '', offline: true };
    }
}

// ── Sales Return ───────────────────────────────────────────────────────────────
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
            customerPhone,
        });

        logger.info(`📱 Offline return queued: ${id}`);
        return { success: true, id, offline: true };
    } catch (error) {
        logger.error('Failed to save offline return', error);
        return { success: false, id: '', offline: true };
    }
}

// ── Queue Status Helpers ───────────────────────────────────────────────────────
export async function hasPendingOfflineTransactions(): Promise<boolean> {
    try {
        const count = await offlineDB.treasuryTransactions.where('synced').equals(0).count();
        return count > 0;
    } catch {
        return false;
    }
}

export async function getPendingQueueSummary(): Promise<{
    treasury: number;
    inventory: number;
    returns: number;
    total: number;
}> {
    try {
        const [treasury, inventory, returns] = await Promise.all([
            offlineDB.treasuryTransactions.where('synced').equals(0).count(),
            offlineDB.inventoryMovements.where('synced').equals(0).count(),
            offlineDB.returns.where('synced').equals(0).count(),
        ]);
        return { treasury, inventory, returns, total: treasury + inventory + returns };
    } catch {
        return { treasury: 0, inventory: 0, returns: 0, total: 0 };
    }
}
