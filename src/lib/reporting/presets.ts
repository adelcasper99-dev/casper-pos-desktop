
import { REPORTABLE_MODELS } from './constants';

export type PresetConfig = {
    id: string;
    name: string;
    description: string;
    model: keyof typeof REPORTABLE_MODELS;
    defaultFilters?: any;
    columns: string[];
};

export const REPORT_PRESETS: PresetConfig[] = [
    {
        id: 'daily-sales',
        name: 'Daily Sales Report',
        description: 'All approved sales for the selected period',
        model: 'SALES',
        defaultFilters: { status: { not: 'REFUNDED' } },
        columns: ['id', 'totalAmount', 'paymentMethod', 'createdAt']
    },
    {
        id: 'technician-perf',
        name: 'Technician Performance',
        description: 'Completed tickets by technician',
        model: 'TICKETS',
        defaultFilters: { status: 'COMPLETED' },
        columns: ['id', 'deviceModel', 'technicianId', 'repairPrice', 'completedAt']
    },
    {
        id: 'inventory-low',
        name: 'Low Stock Alert',
        description: 'Products with stock below minimum level',
        model: 'INVENTORY',
        defaultFilters: { stock: { lte: 5 } }, // Standard Low Stock Threshold (5). For dynamic 'minStock' checks, use the Main Dashboard.
        columns: ['name', 'sku', 'stock', 'minStock']
    },
    {
        id: 'general-ledger',
        name: 'General Ledger (Accountant)',
        description: 'Raw journal entries for auditing',
        model: 'JOURNAL',
        defaultFilters: {},
        columns: ['date', 'description', 'reference', 'lines']
    }
];
