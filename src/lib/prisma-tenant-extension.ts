import { Prisma } from '@prisma/client';
import type { AsyncLocalStorage } from 'async_hooks';

export type TenantContext = {
    tenantId: string;
};

// AsyncLocalStorage to maintain the current tenant context during request lifecycle
// Safe instantiation for environments where async_hooks is mocked/unavailable (e.g. Next.js Client Components)
let asyncHooks: any = {};
try {
    asyncHooks = require('async_hooks');
} catch (e) {}

export const tenantStorage = (asyncHooks.AsyncLocalStorage 
    ? new asyncHooks.AsyncLocalStorage() 
    : null) as unknown as AsyncLocalStorage<TenantContext>;

export function getTenantId(): string | undefined {
    if (!tenantStorage) return undefined;
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
    if (!tenantStorage) return callback();
    return tenantStorage.run({ tenantId }, callback);
}

// List of models in schema.prisma that have a tenantId field
const TENANT_AWARE_MODELS = [
    'Account',
    'ActionLog',
    'Attribute',
    'AuditLog',
    'BackupLog',
    'Branch',
    'BundleItem',
    'CashCategory',
    'Category',
    'CommissionRule',
    'Customer',
    'CustomerTransaction',
    'DailyWorkLog',
    'DeviceMovement',
    'DevicePreset',
    'EmployeeTransaction',
    'Expense',
    'Feedback',
    'Floor',
    'JournalEntry',
    'JournalLine',
    'LocalBackup',
    'Model',
    'NotificationLog',
    'Partner',
    'PartnerTransaction',
    'Product',
    'PurchaseInvoice',
    'PurchaseItem',
    'ReorderRule',
    'RepairPayment',
    'Role',
    'Sale',
    'SaleItem',
    'SalePayment',
    'Session',
    'Shift',
    'ShiftAdjustment',
    'SparePart',
    'Stock',
    'StockMovement',
    'StockRequest',
    'StockRequestItem',
    'StockWastage',
    'StoreSettings',
    'Supplier',
    'SupplierPayment',
    'Table',
    'Technician',
    'Ticket',
    'TicketCollaborator',
    'TicketNote',
    'TicketPart',
    'TicketPreset',
    'Transaction',
    'Treasury',
    'UnitOfMeasure',
    'User',
    'Warehouse'
];

export const prismaTenantExtension =
    typeof window === 'undefined'
        ? Prisma.defineExtension((client) => {
              const isPostgres =
                  process.env.DATABASE_URL?.startsWith('postgres') ||
                  process.env.DATABASE_URL?.startsWith('postgresql');

              return client.$extends({
                  query: {
                      $allModels: {
                          async $allOperations({ model, operation, args, query }) {
                              const tenantId = getTenantId();

                              // If tenant context is missing, or is explicitly set to 'SYSTEM' (Super Admin), OR if not running on Postgres (e.g. local SQLite), bypass RLS-like filters
                              if (!tenantId || tenantId === 'SYSTEM' || !isPostgres) {
                                  return query(args);
                              }

                              if (TENANT_AWARE_MODELS.includes(model)) {
                                  // 1. Inject tenantId filter for query/update/delete operations that have a 'where' clause
                                  if ([
                                      'findFirst',
                                      'findFirstOrThrow',
                                      'findMany',
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
                                      (args as any).where = (args as any).where || {};

                                      // Special handling: Prisma findUnique only accepts unique fields.
                                      // Convert it to findFirst to allow injecting custom non-unique filters (tenantId).
                                      if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
                                          const newOperation = operation === 'findUnique' ? 'findFirst' : 'findFirstOrThrow';
                                          
                                          let finalWhere = { ...(args as any).where };
                                          // Flatten composite keys because findFirst does not accept them
                                          for (const key of Object.keys(finalWhere)) {
                                              if (typeof finalWhere[key] === 'object' && finalWhere[key] !== null && key.includes('_')) {
                                                  const nestedObj = finalWhere[key];
                                                  const parts = key.split('_');
                                                  const isComposite = parts.every(part => part in nestedObj);
                                                  if (isComposite) {
                                                      for (const part of parts) {
                                                          finalWhere[part] = nestedObj[part];
                                                      }
                                                      delete finalWhere[key];
                                                  }
                                              }
                                          }

                                          // @ts-ignore
                                          return client[model][newOperation]({
                                              ...args,
                                              where: {
                                                  ...finalWhere,
                                                  tenantId: tenantId
                                              }
                                          });
                                      }

                                      (args as any).where.tenantId = tenantId;
                                  }

                                  // 2. Inject tenantId for write/create operations
                                  if (operation === 'create') {
                                      (args as any).data = (args as any).data || {};
                                      (args as any).data.tenantId = tenantId;
                                  }

                                  if (operation === 'createMany') {
                                      if (Array.isArray((args as any).data)) {
                                          (args as any).data = (args as any).data.map((item: any) => ({
                                              ...item,
                                              tenantId: tenantId
                                          }));
                                      } else {
                                          (args as any).data = (args as any).data || {};
                                          (args as any).data.tenantId = tenantId;
                                      }
                                  }

                                  if (operation === 'upsert') {
                                      (args as any).create = (args as any).create || {};
                                      (args as any).create.tenantId = tenantId;
                                      (args as any).update = (args as any).update || {};
                                      (args as any).update.tenantId = tenantId;
                                  }
                              }

                              return query(args);
                          }
                      }
                  }
              });
          })
        // Browser: webpack alias in next.config.js redirects @/lib/prisma to a stub,
        // so this branch is unreachable in practice. null satisfies the type without
        // crashing at module evaluation time if the alias ever misses.
        : null as any;

