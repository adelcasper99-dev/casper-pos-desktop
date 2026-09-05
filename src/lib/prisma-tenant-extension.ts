import { Prisma } from '@prisma/client';
import type { AsyncLocalStorage } from 'async_hooks';

export type TenantContext = {
    tenantId: string;
};

interface AsyncHooksModule {
    AsyncLocalStorage?: typeof AsyncLocalStorage;
}

// AsyncLocalStorage to maintain the current tenant context during request lifecycle
// Safe instantiation for environments where async_hooks is mocked/unavailable (e.g. Next.js Client Components)
let asyncHooks: AsyncHooksModule = {};
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
        const raw = reqHeaders.get('x-tenant-id');
        if (!raw) return undefined;
        try {
            return decodeURIComponent(raw);
        } catch (e) {
            return raw;
        }
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

interface PrismaOperationArgs {
    where?: Record<string, unknown>;
    data?: Record<string, unknown> | Array<Record<string, unknown>>;
    create?: Record<string, unknown>;
    update?: Record<string, unknown>;
    [key: string]: unknown;
}

type DynamicPrismaClient = Record<string, Record<string, (args: unknown) => Promise<unknown>>>;

export const prismaTenantExtension =
    typeof window === 'undefined'
        ? Prisma.defineExtension((client) => {
              const isPostgresOrTest =
                  process.env.DATABASE_URL?.startsWith('postgres') ||
                  process.env.DATABASE_URL?.startsWith('postgresql') ||
                  process.env.NODE_ENV === 'test';

              return client.$extends({
                  query: {
                      $allModels: {
                          async $allOperations({ model, operation, args, query }) {
                              const tenantId = getTenantId();

                              // If tenant context is missing, or is explicitly set to 'SYSTEM' or 'casper-hq' (Super Admin Control Plane), bypass RLS-like filters
                              // Also bypass if running locally (SQLite/not Postgres in production desktop) because local schema has no tenantId fields
                              if (!tenantId || tenantId === 'SYSTEM' || tenantId === 'casper-hq' || !isPostgresOrTest) {
                                  return query(args);
                              }

                              if (TENANT_AWARE_MODELS.includes(model)) {
                                  const opArgs = (args || {}) as PrismaOperationArgs;

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
                                      opArgs.where = opArgs.where || {};

                                      // Special handling: Prisma findUnique only accepts unique fields.
                                      // Convert it to findFirst to allow injecting custom non-unique filters (tenantId).
                                      if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
                                          const newOperation = operation === 'findUnique' ? 'findFirst' : 'findFirstOrThrow';
                                          
                                          const finalWhere: Record<string, unknown> = { ...opArgs.where };
                                          // Flatten composite keys because findFirst does not accept them
                                          for (const key of Object.keys(finalWhere)) {
                                              const nestedObj = finalWhere[key];
                                              if (typeof nestedObj === 'object' && nestedObj !== null && key.includes('_')) {
                                                  const recordObj = nestedObj as Record<string, unknown>;
                                                  const parts = key.split('_');
                                                  const isComposite = parts.every(part => part in recordObj);
                                                  if (isComposite) {
                                                      for (const part of parts) {
                                                          finalWhere[part] = recordObj[part];
                                                      }
                                                      delete finalWhere[key];
                                                  }
                                              }
                                          }

                                          const camelModel = model.charAt(0).toLowerCase() + model.slice(1);
                                          const dynamicClient = client as unknown as DynamicPrismaClient;
                                          return dynamicClient[camelModel][newOperation]({
                                              ...opArgs,
                                              where: {
                                                  ...finalWhere,
                                                  tenantId: tenantId
                                              }
                                          });
                                      }

                                      opArgs.where.tenantId = tenantId;
                                  }

                                  // 2. Inject tenantId for write/create operations
                                  if (operation === 'create') {
                                      opArgs.data = (opArgs.data || {}) as Record<string, unknown>;
                                      opArgs.data.tenantId = tenantId;
                                  }

                                  if (operation === 'createMany') {
                                      if (Array.isArray(opArgs.data)) {
                                          opArgs.data = opArgs.data.map((item) => ({
                                              ...item,
                                              tenantId: tenantId
                                          }));
                                      } else {
                                          opArgs.data = (opArgs.data || {}) as Record<string, unknown>;
                                          opArgs.data.tenantId = tenantId;
                                      }
                                  }

                                  if (operation === 'upsert') {
                                      // Note: Do NOT inject tenantId into args.where for upsert, because Prisma translates
                                      // args.where fields directly into PostgreSQL ON CONFLICT target columns, which causes 42P10
                                      // if no compound unique constraint exists on (unique_field, tenantId).
                                      opArgs.create = opArgs.create || {};
                                      opArgs.create.tenantId = tenantId;
                                      opArgs.update = opArgs.update || {};
                                      opArgs.update.tenantId = tenantId;
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
        : (null as unknown as ReturnType<typeof Prisma.defineExtension>);

