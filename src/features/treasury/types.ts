export type TreasuryDirection = 'IN' | 'OUT';

export interface TreasuryLogEntry {
    id: string;
    createdAt: Date;
    categoryLabel: string; // Arabic label e.g., "مبيعات", "مصاريف"
    description: string | null;
    direction: TreasuryDirection;
    amount: number;
    balanceAfter: number;
    referenceId: string | null;  // e.g., Invoice Number or Journal Entry ID
    paymentMethod: string;       // "CASH", "BANK", etc. (though focus is Account 1000)
}

export interface TreasuryLogFilters {
    startDate?: string;
    endDate?: string;
    direction?: TreasuryDirection | 'ALL';
    category?: string;
    search?: string; // For referenceId or description
}

export interface TreasurySummary {
    totalIn: number;
    totalOut: number;
    netChange: number;
    currentBalance: number;
}
