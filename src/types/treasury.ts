/**
 * Treasury Domain Types
 * 
 * Centralized source of truth for all Treasury-related entities.
 * Ensures synchronization between backend actions (treasury.ts) 
 * and frontend components (TreasuryDashboard, WalletTransactionModal).
 */

export interface Treasury {
    id: string;
    name: string;
    balance: number;
    isDefault: boolean;
    branchId: string | null;
    paymentMethod: string | null | undefined;
    glCode?: string | null;
    deletedAt?: Date | string | null;
}

export interface TreasuryTransaction {
    id: string;
    type: string;
    description: string | null;
    amount: number;
    paymentMethod: string;
    treasuryId?: string | null;
    treasuryName?: string;
    categoryName?: string;
    createdAt: string | Date;
}

export interface TreasuryData {
    byMethod: Record<string, number>;
    transactions: TreasuryTransaction[];
    treasuries: Treasury[];
}

export interface CashCategory {
    id: string;
    name: string;
    type: string;
    glCode: string | null;
}
