

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { REPORTABLE_MODELS, type ReportModel } from './constants';


export type ReportConfig = {
    model: keyof typeof REPORTABLE_MODELS;
    select?: string[]; // Arrays of fields to include
    filters?: Record<string, any>; // Prisma WhereInput
    dateRange?: {
        field: string;
        start: Date;
        end: Date;
    };
    groupBy?: string; // For aggregation
};

export class ReportEngine {

    static async runQuery(config: ReportConfig) {
        const modelName = REPORTABLE_MODELS[config.model];
        if (!modelName) throw new Error(`Invalid Report Model: ${config.model}`);

        // @ts-ignore - Dynamic access to prisma delegate
        const delegate = (prisma as any)[modelName];

        // Build Where Clause
        let where: any = { ...config.filters };

        // Apply strict date range if provided
        if (config.dateRange) {
            where[config.dateRange.field] = {
                gte: config.dateRange.start,
                lte: config.dateRange.end
            };
        }

        // 1. Aggregation Mode (if groupBy is present)
        if (config.groupBy) {
            // Allow simple "count" or "sum" aggregation
            // For V1, we simply return raw data and let client group, OR simple count
            // Let's implementation basic grouping if needed, but safe raw data is better for flexible UI
        }

        // 2. Fetch Data
        // We limit to 1000 rows for performance safety
        const results = await delegate.findMany({
            where,
            orderBy: config.dateRange ? { [config.dateRange.field]: 'desc' } : undefined,
            take: 1000,
        });

        return results;
    }

    /**
     * Helper: Get Total Revenue (Sales)
     */
    static async getRevenue(start: Date, end: Date) {
        const sales = await prisma.sale.aggregate({
            where: {
                createdAt: { gte: start, lte: end },
                status: { not: 'REFUNDED' } // Exclude refunds
            },
            _sum: {
                totalAmount: true
            }
        });
        return sales._sum.totalAmount || 0;
    }
}
