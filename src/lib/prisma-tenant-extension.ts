import { Prisma } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';

export type TenantContext = {
    tenantId: string;
};

// AsyncLocalStorage to maintain the current tenant context during request lifecycle
export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function getTenantId(): string | undefined {
    const storeTenant = tenantStorage.getStore()?.tenantId;
    if (storeTenant) return storeTenant;

    // Read dynamically from Next.js headers if in request context
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { headers } = require('next/headers');
        const reqHeaders = headers();
        return reqHeaders.get('x-tenant-id') || undefined;
    } catch (e) {
        // Bypassed outside Next.js request contexts (e.g. Electron background threads, tests)
        return undefined;
    }
}

export function runWithTenant<T>(tenantId: string, callback: () => Promise<T>): Promise<T> {
    return tenantStorage.run({ tenantId }, callback);
}

// List of models in schema.prisma that have a tenantId field
const TENANT_AWARE_MODELS = [
    'User',
    'Role',
    'Session',
    'Branch',
    'Warehouse',
    'Customer',
    'CustomerTransaction',
    'Supplier',
    'SupplierPayment',
    'Account',
    'JournalEntry',
    'JournalLine',
    'Category',
    'Model',
    'Attribute',
    'UnitOfMeasure',
    'Product',
    'BundleItem',
    'Stock',
    'StockMovement',
    'StockRequest',
    'StockRequestItem',
    'StockWastage',
    'PurchaseInvoice',
    'PurchaseItem',
    'Sale',
    'SaleItem',
    'Shift',
    'Treasury',
    'Transaction',
    'Expense',
    'Ticket',
    'TicketPart',
    'TicketCollaborator',
    'TicketNote',
    'RepairPayment',
    'TechnicianPerformance',
    'Feedback',
    'DeviceMovement',
    'DailyWorkLog',
    'EmployeeTransaction',
    'AuditLog',
    'BackupLog',
    'Floor',
    'Table',
    'LocalBackup',
    'SparePart',
    'CashCategory',
    'CommissionRule',
    'Partner',
    'PartnerTransaction',
    'StoreSettings'
];

export const prismaTenantExtension = Prisma.defineExtension((client) => {
    return client.$extends({
        query: {
            $allModels: {
                async $allOperations({ model, operation, args, query }) {
                    const tenantId = getTenantId();

                    // If tenant context is missing, or is explicitly set to 'SYSTEM' (Super Admin), bypass RLS-like application filters
                    if (!tenantId || tenantId === 'SYSTEM') {
                        return query(args);
                    }

                    if (TENANT_AWARE_MODELS.includes(model)) {
                        // 1. Inject tenantId filter for query/update/delete operations that have a 'where' clause
                        if ([
                            'findMany',
                            'findFirst',
                            'findFirstOrThrow',
                            'count',
                            'aggregate',
                            'groupBy',
                            'updateMany',
                            'deleteMany',
                            'update',
                            'delete',
                            'findUnique',
                            'findUniqueOrThrow'
                        ].includes(operation)) {
                            args.where = args.where || {};

                            // Special handling: Prisma findUnique only accepts unique fields. 
                            // Convert it to findFirst to allow injecting custom non-unique filters (tenantId).
                            if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
                                const newOperation = operation === 'findUnique' ? 'findFirst' : 'findFirstOrThrow';
                                // @ts-ignore
                                return client[model][newOperation]({
                                    ...args,
                                    where: {
                                        ...args.where,
                                        tenantId: tenantId
                                    }
                                });
                            }

                            args.where.tenantId = tenantId;
                        }

                        // 2. Inject tenantId for write/create operations
                        if (operation === 'create') {
                            args.data = args.data || {};
                            args.data.tenantId = tenantId;
                        }

                        if (operation === 'createMany') {
                            if (Array.isArray(args.data)) {
                                args.data = args.data.map((item: any) => ({
                                    ...item,
                                    tenantId: tenantId
                                }));
                            } else {
                                args.data = args.data || {};
                                args.data.tenantId = tenantId;
                            }
                        }

                        if (operation === 'upsert') {
                            args.create = args.create || {};
                            args.create.tenantId = tenantId;
                            args.update = args.update || {};
                            args.update.tenantId = tenantId;
                        }
                    }

                    return query(args);
                }
            }
        }
    });
});
