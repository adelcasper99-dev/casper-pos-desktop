'use server';

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from 'zod';
import { Decimal } from "@prisma/client/runtime/library";
import { AccountingEngine } from "@/lib/accounting/transaction-factory";
import { secureAction } from "@/lib/safe-action";
import { getNextAtomicId } from "@/lib/id-generator";
import { financialRepo } from '@/lib/repositories/financial-repo';
import { GL, PAYMENT_METHOD_GL_MAP } from '@/shared/constants/accounting-mappings';

import { productSchema, supplierSchema, categorySchema, purchaseSchema, warehouseSchema, unitOfMeasureSchema } from "@/lib/validation/inventory";
import { CACHE_TAGS } from "@/lib/cache-keys";
import { logger } from "@/lib/logger";
import { toDecimal, toNumber } from "@/lib/decimal-utils";
import { AppError, ErrorCodes } from "@/lib/errors"; 
import { getCurrentUser } from "./auth";
import { getTranslations } from "@/lib/i18n-mock";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

// --- Suppliers ---

export const createSupplier = secureAction(async (data: z.infer<typeof supplierSchema> & { csrfToken?: string }) => {
    const validated = supplierSchema.parse(data);

    if (validated.phone) {
        const { checkGlobalPhoneUniqueness } = await import('@/lib/phone-validation');
        const phoneCheck = await checkGlobalPhoneUniqueness(validated.phone, 'SUPPLIER');
        if (!phoneCheck.unique) {
            const t = await getTranslations('SystemMessages.Errors');

            // Try to find the actual supplier if it's a supplier duplicate
            let existingSupplier: any = null;
            if (phoneCheck.usedBy === 'SUPPLIER' && phoneCheck.entityId) {
                existingSupplier = await prisma.supplier.findUnique({
                    where: { id: phoneCheck.entityId }
                });
            }

            return {
                success: false,
                error: t('phoneInUse', { usedBy: phoneCheck.entityName || 'Unknown' }),
                duplicateSupplier: existingSupplier ? {
                    id: existingSupplier.id,
                    name: existingSupplier.name,
                    phone: existingSupplier.phone
                } : null
            };
        }
    }

    const supplier = await prisma.$transaction(async (tx) => {
        const { openingBalance, linkedEmployeeId, ...supplierData } = validated;

        const s = await tx.supplier.create({
            data: {
                ...supplierData,
                balance: new Decimal(openingBalance || 0),
                linkedEmployee: linkedEmployeeId ? { connect: { id: linkedEmployeeId } } : undefined
            },
        });

        if (validated.openingBalance && validated.openingBalance !== 0) {
            // 1. Create opening transaction record - with auto journal
            await financialRepo.createSupplierPayment(tx, {
                supplierId: s.id,
                amount: validated.openingBalance,
                method: 'OPENING_BALANCE',
                notes: 'Initial Opening Balance',
                branchId: (await getCurrentUser())?.branchId || null
            });

            // 2. Accounting Sync: DR 3000 (Equity) / CR 2000 (AP)
            const { AccountingEngine } = await import('@/lib/accounting/transaction-factory');
            const currentUser = await getCurrentUser();
            await AccountingEngine.recordTransaction({
                description: `Opening Balance: ${s.name}`,
                reference: s.id,
                branchId: currentUser?.branchId ?? undefined,
                lines: [
                    { accountCode: GL.EQUITY.CAPITAL, debit: validated.openingBalance, credit: 0, description: 'Opening Balance Equity' },
                    { accountCode: GL.LIABILITIES.PAYABLES, debit: 0, credit: validated.openingBalance, description: 'Initial Accounts Payable' }
                ]
            }, tx);
        }

        return s;
    });

    revalidatePath("/inventory", 'page');
    return { success: true, supplier };
}, { permission: 'INVENTORY_MANAGE' });

export const updateSupplier = secureAction(async (data: { id: string } & z.infer<typeof supplierSchema> & { csrfToken?: string }) => {
    const { id, ...updateData } = data;
    const validated = supplierSchema.parse(updateData);

    if (validated.phone) {
        const { checkGlobalPhoneUniqueness } = await import('@/lib/phone-validation');
        const phoneCheck = await checkGlobalPhoneUniqueness(validated.phone, 'SUPPLIER', id);
        if (!phoneCheck.unique) {
            const t = await getTranslations('SystemMessages.Errors');

            let existingSupplier = null;
            if (phoneCheck.usedBy === 'SUPPLIER' && phoneCheck.entityId) {
                existingSupplier = await prisma.supplier.findUnique({
                    where: { id: phoneCheck.entityId }
                });
            }

            return {
                success: false,
                error: t('phoneInUse', { usedBy: phoneCheck.entityName || 'Unknown' }),
                duplicateSupplier: existingSupplier
            };
        }
    }

    const { openingBalance, linkedEmployeeId, ...validUpdateData } = validated;

    await prisma.supplier.update({
        where: { id },
        data: {
            ...validUpdateData,
            linkedEmployee: linkedEmployeeId ? { connect: { id: linkedEmployeeId } } : { disconnect: true }
        }
    });
    revalidatePath("/inventory", 'page');
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

// --- Units of Measure ---

export const getUnitsOfMeasure = secureAction(async (data?: { csrfToken?: string }) => {
    const units = await prisma.unitOfMeasure.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' }
    });
    return { success: true, units };
});

export const createUnitOfMeasure = secureAction(async (data: z.infer<typeof unitOfMeasureSchema> & { csrfToken?: string }) => {
    const validated = unitOfMeasureSchema.parse(data);
    
    // Check for duplicate code
    const existing = await prisma.unitOfMeasure.findUnique({
        where: { code: validated.code }
    });
    
    if (existing) {
        const t = await getTranslations('SystemMessages.Errors');
        return { success: false, error: t('duplicate') || "الوحدة موجودة بالفعل" };
    }

    const unit = await prisma.unitOfMeasure.create({
        data: {
            ...validated,
            category: 'GENERAL'
        }
    });

    revalidateTag(CACHE_TAGS.INVENTORY);
    return { success: true, unit };
}, { permission: 'INVENTORY_MANAGE' });

export const getDefaultWarehouses = secureAction(async () => {
    const [posDefault, maintenanceDefault] = await Promise.all([
        prisma.warehouse.findFirst({ where: { isDefault: true, deletedAt: null } }),
        prisma.warehouse.findFirst({ where: { isMaintenanceDefault: true, deletedAt: null } })
    ]);

    return {
        success: true,
        posDefault: posDefault ? { id: posDefault.id, name: posDefault.name } : null,
        maintenanceDefault: maintenanceDefault ? { id: maintenanceDefault.id, name: maintenanceDefault.name } : null
    };
}, { permission: 'INVENTORY_VIEW', requireCSRF: false });

export const deleteSupplier = secureAction(async (data: { id: string, csrfToken?: string }) => {
    try {
        await prisma.supplier.delete({ where: { id: data.id } });
    } catch (error: any) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2025') {
            throw error;
        }
    }
    revalidatePath("/inventory", 'page');
    return { success: true };
}, { permission: 'INVENTORY_MANAGE', requireCSRF: false });

export const paySupplier = secureAction(async (data: { supplierId: string, amount: number | string | Decimal, method?: string, csrfToken?: string }) => {
    const { supplierId, amount, method = "CASH" } = data;
    const amountDec = new Decimal(amount.toString());
    // 0. Find Default Treasury for this branch (Critical for Treasury Tracking)
    const { getCurrentUser } = await import('./auth');
    const user = await getCurrentUser();
    let defaultTreasuryId: string | null = null;

    if (user?.branchId) {
        const defaultTreasury = await prisma.treasury.findFirst({
            where: { branchId: user.branchId, isDefault: true }
        });
        if (defaultTreasury) defaultTreasuryId = defaultTreasury.id;
    }

    await prisma.$transaction(async (tx) => {
        // 1. Create Payment Record - with auto journal
        const payment = await financialRepo.createSupplierPayment(tx, {
            supplierId,
            amount: amountDec,
            method: method,
            notes: `Manual Payment - ${method}`,
            branchId: user?.branchId || null
        });

        // 2. Decrease Supplier Balance (Debt decreases when we pay)
        await tx.supplier.update({
            where: { id: supplierId },
            data: {
                balance: {
                    decrement: amountDec
                }
            }
        });

        // 3. Treasury Transaction (Money Out)
        // Only record cash/bank transactions if they affect our immediate treasury
        await tx.transaction.create({
            data: {
                type: 'OUT',
                amount: amountDec,
                description: `Supplier Payment (${method})`,
                paymentMethod: method,
                treasuryId: defaultTreasuryId // 🔗 LINKED
            }
        });

        // 🆕 Update Treasury Balance (Real Money Movement)
        if (defaultTreasuryId) {
            const treasury = await tx.treasury.findUnique({ where: { id: defaultTreasuryId } });
            const currentBalance = new Decimal(treasury?.balance?.toString() || "0");
            if (currentBalance.lt(amountDec)) {
                const canGoNegative = hasPermission(user?.permissions, PERMISSIONS.TREASURY_ALLOW_NEGATIVE_BALANCE);
                if (!canGoNegative) {
                    throw new Error(`رصيد الخزنة غير كافٍ (${currentBalance.toFixed(2)}). ولا تملك صلاحية السحب بالسالب.`);
                }
            }
            await tx.treasury.update({
                where: { id: defaultTreasuryId },
                data: { balance: { decrement: amountDec } }
            });
        }

        // 🆕 Accounting Entry: DR 2000 (AP) / CR Cash/Bank
        const creditAccount = PAYMENT_METHOD_GL_MAP[method] ?? GL.ASSETS.CASH;

        const { AccountingEngine } = await import('@/lib/accounting/transaction-factory');
        await AccountingEngine.recordTransaction({
            description: `Supplier Payment: ${method}`,
            reference: payment.id,
            branchId: user?.branchId ?? undefined,
            lines: [
                { accountCode: GL.LIABILITIES.PAYABLES, debit: amountDec.toNumber(), credit: 0, description: `Accounts Payable Reduced` },
                { accountCode: creditAccount, debit: 0, credit: amountDec.toNumber(), description: `Payment via ${method}` }
            ]
        }, tx);

        // 4. Auto-Allocate Payment to Pending Invoices (FIFO)
        const pendingInvoices = await tx.purchaseInvoice.findMany({
            where: {
                supplierId: supplierId,
                status: { in: ['PENDING', 'PARTIAL'] }
            },
            orderBy: {
                purchaseDate: 'asc'
            }
        });

        let remainingAllocation = amountDec;

        for (const invoice of pendingInvoices) {
            if (remainingAllocation.lte(0)) break;

            const total = new Decimal(invoice.totalAmount);
            const paid = new Decimal(invoice.paidAmount);
            const needed = total.minus(paid);

            if (needed.lte(0)) continue; // Defensive programming

            let paymentToApply = new Decimal(0);
            let newStatus = invoice.status;

            if (remainingAllocation.gte(needed)) {
                // We can fully pay this invoice
                paymentToApply = needed;
                newStatus = 'PAID';
                remainingAllocation = remainingAllocation.minus(needed);
            } else {
                // We can partially pay this invoice
                paymentToApply = remainingAllocation;
                newStatus = 'PARTIAL';
                remainingAllocation = new Decimal(0);
            }

            await tx.purchaseInvoice.update({
                where: { id: invoice.id },
                data: {
                    paidAmount: paid.plus(paymentToApply).toNumber(),
                    status: newStatus
                }
            });

            // Log to audit that this payment was auto-allocated
            await tx.auditLog.create({
                data: {
                    entityType: 'PURCHASE',
                    entityId: invoice.id,
                    action: 'AUTO_PAYMENT_ALLOCATION',
                    previousData: JSON.stringify({ paidAmount: paid.toNumber(), status: invoice.status }),
                    newData: JSON.stringify({ paidAmount: paid.plus(paymentToApply).toNumber(), status: newStatus }),
                    reason: `Auto-allocated from generic supplier payment of ${amount}`,
                    user: user?.id === 'super-admin' ? 'super-admin' : (user?.username || user?.name || 'system'),
                    hqId: payment.id // Store Payment ID here for easy reversal
                }
            });
        }
    });


    revalidatePath("/inventory", 'page');
    revalidatePath(`/inventory/suppliers/${supplierId}`, 'page');
    revalidatePath("/purchasing", 'page');
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

/**
 * Void a supplier payment and reverse all its effects
 */
export const voidSupplierPayment = secureAction(async (data: { paymentId: string, csrfToken?: string }) => {
    const { paymentId } = data;
    const { getCurrentUser } = await import('./auth');
    const user = await getCurrentUser();

    const result = await prisma.$transaction(async (tx) => {
        // 1. Fetch the payment
        const payment = await tx.supplierPayment.findUnique({
            where: { id: paymentId }
        });
        if (!payment) throw new Error("Payment not found");

        // 2. Find all auto-allocations triggered by this payment
        // We stored the paymentId in hqId field as a hack/link
        const allocations = await tx.auditLog.findMany({
            where: {
                hqId: paymentId,
                action: 'AUTO_PAYMENT_ALLOCATION'
            }
        });

        // 3. Revert each allocation on the invoices
        for (const log of allocations) {
            const prevData = JSON.parse(log.previousData || '{}');
            await tx.purchaseInvoice.update({
                where: { id: log.entityId },
                data: {
                    paidAmount: prevData.paidAmount,
                    status: prevData.status
                }
            });
        }

        // 4. Reverse Supplier Balance
        await tx.supplier.update({
            where: { id: payment.supplierId },
            data: { balance: { increment: payment.amount } }
        });

        // 5. Reverse Treasury Transaction
        // Find the OUT transaction created during payment
        const treasuryTx = await tx.transaction.findFirst({
            where: {
                type: 'OUT',
                amount: payment.amount,
                paymentMethod: payment.method,
                description: { contains: 'Supplier Payment' },
                createdAt: { gte: new Date(payment.paymentDate.getTime() - 10000), lte: new Date(payment.paymentDate.getTime() + 10000) }
            }
        });

        if (treasuryTx?.treasuryId) {
            // Restore funds to treasury
            await tx.treasury.update({
                where: { id: treasuryTx.treasuryId },
                data: { balance: { increment: payment.amount } }
            });

            // Create a reversal IN transaction
            await tx.transaction.create({
                data: {
                    type: 'IN',
                    amount: payment.amount,
                    description: `Reversal of Supplier Payment #${paymentId.substring(0, 5)}`,
                    paymentMethod: payment.method,
                    treasuryId: treasuryTx.treasuryId,
                    referenceId: paymentId,
                    referenceType: 'SUPPLIER_PAYMENT_VOID'
                }
            });
        }

        // 6. Record Accounting Reversal — throws on failure to abort the transaction
        const creditAccount = PAYMENT_METHOD_GL_MAP[payment.method] ?? GL.ASSETS.CASH;
        const paymentAmountDec = new Decimal(payment.amount.toString());
        await AccountingEngine.recordTransaction({
            description: `VOID Supplier Payment - ${payment.supplierId.substring(0, 8)}`,
            reference: payment.supplierId,
            branchId: user?.branchId ?? undefined,
            lines: [
                { accountCode: GL.LIABILITIES.PAYABLES, debit: 0, credit: paymentAmountDec.toNumber(), description: 'Accounts Payable Restored' },
                { accountCode: creditAccount, debit: paymentAmountDec.toNumber(), credit: 0, description: 'Cash/Bank Restored' }
            ]
        }, tx);

        // 7. Delete the payment record
        await tx.supplierPayment.delete({
            where: { id: paymentId }
        });

        // 8. Log the voiding event
        await tx.auditLog.create({
            data: {
                entityType: 'SUPPLIER_PAYMENT',
                entityId: paymentId,
                action: 'VOID_PAYMENT',
                previousData: JSON.stringify(payment),
                reason: 'User manual void',
                user: user?.username || 'system'
            }
        });

        return { supplierId: payment.supplierId };
    });

    revalidatePath("/inventory", 'page');
    revalidatePath(`/inventory/suppliers/${result.supplierId}`, 'page');
    revalidatePath("/purchasing", 'page');
    return { success: true };
}, { permission: 'INVENTORY_MANAGE', requireCSRF: false });

// --- Products ---

export const createProduct = secureAction(async (data: z.infer<typeof productSchema>) => {
    const startTime = Date.now();
    const validated = productSchema.parse(data);

    // Check SKU uniqueness
    const existing = await prisma.product.findUnique({
        where: { sku: data.sku }
    });

    if (existing) {
        const { getTranslations } = await import('@/lib/i18n-mock');
        const t = await getTranslations('SystemMessages.Errors');
        throw new AppError(ErrorCodes.VALIDATION_ERROR, t('skuExists'));
    }

    const { categoryId, bundleItems, isBundle, unitOfMeasureId, ...productData } = validated;

    // Bundles don't carry their own physical stock
    const effectiveStock = isBundle ? 0 : (productData.stock ?? 0);
    const effectiveTrackStock = isBundle ? false : (productData.trackStock ?? true);

    // I-02: Static Name Concatenation for Model and Attribute
    let finalProductName = productData.name;

    if (validated.modelId) {
        const model = await prisma.model.findUnique({ where: { id: validated.modelId } });
        if (model && !finalProductName.includes(model.name)) {
            finalProductName += ` - ${model.name}`;
        }
    }

    if (validated.attributeId) {
        const attr = await prisma.attribute.findUnique({ where: { id: validated.attributeId } });
        if (attr && !finalProductName.includes(attr.name)) {
            finalProductName += ` - ${attr.name}`;
        }
    }
    
    productData.name = finalProductName;

    // TRANSACTION: Ensure Product + Stock + BundleItems are created together
    const product = await prisma.$transaction(async (tx) => {
        // 1. Create Product
        const newProduct = await (tx.product.create as any)({
            data: {
                ...productData,
                stock: effectiveStock,
                trackStock: effectiveTrackStock,
                isBundle: isBundle ?? false,
                unitOfMeasureId: unitOfMeasureId || null,
                ...(categoryId ? { category: { connect: { id: categoryId } } } : {}),
                ...(validated.modelId ? { model: { connect: { id: validated.modelId } } } : {}),
                ...(validated.attributeId ? { attribute: { connect: { id: validated.attributeId } } } : {})
            }
        });

        // 2. Bundle Items — create component links
        if (isBundle && bundleItems && bundleItems.length > 0) {
            await (tx as any).bundleItem.createMany({
                data: bundleItems.map((bi: any) => ({
                    bundleProductId: newProduct.id,
                    componentProductId: bi.componentProductId,
                    quantityIncluded: bi.quantityIncluded,
                }))
            });
        }

        // 3. Initial Stock Logic (non-bundle only)
        if (!isBundle && effectiveStock > 0) {
            let mainWarehouse = await tx.warehouse.findFirst({ where: { isDefault: true } });

            if (!mainWarehouse) {
                let defaultBranch = await tx.branch.findFirst();
                if (!defaultBranch) {
                    defaultBranch = await tx.branch.create({
                        data: { name: "Main Store", code: "MAIN", type: "STORE" }
                    });
                }
                mainWarehouse = await tx.warehouse.create({
                    data: {
                        name: "Main Store",
                        address: "Primary Location",
                        isDefault: true,
                        branchId: defaultBranch.id
                    }
                });
            }

            await tx.stock.create({
                data: {
                    productId: newProduct.id,
                    warehouseId: mainWarehouse.id,
                    quantity: effectiveStock
                }
            });

            await tx.stockMovement.create({
                data: {
                    type: 'ADJUSTMENT',
                    productId: newProduct.id,
                    toWarehouseId: mainWarehouse.id,
                    quantity: effectiveStock,
                    reason: 'Initial Stock',
                    branchId: mainWarehouse.branchId || null
                } as any
            });
        }

        return newProduct;
    });

    revalidatePath("/inventory", 'page');
    revalidatePath("/pos", 'page');
    revalidateTag(CACHE_TAGS.PRODUCTS);
    revalidateTag(CACHE_TAGS.INVENTORY);
    revalidateTag("dashboard");

    if (product) {
        logger.info('Product created', {
            productId: product.id,
            sku: product.sku,
            name: product.name,
            isBundle: isBundle ?? false,
            duration: Date.now() - startTime,
        });
    }

    return product;
}, { permission: 'INVENTORY_MANAGE' });

export const updateProduct = secureAction(async (data: { id: string } & z.infer<typeof productSchema> & { csrfToken?: string }) => {
    const startTime = Date.now();
    const { id, ...productData } = data;
    const validated = productSchema.parse(productData);
    const { bundleItems, isBundle, unitOfMeasureId, ...productFields } = validated;

    const effectiveTrackStock = isBundle ? false : (productFields.trackStock ?? true);
    const effectiveStock = isBundle ? 0 : (productFields.stock ?? 0);

    const oldProduct = await prisma.product.findUnique({
        where: { id },
        select: { 
            trackStock: true,
            stock: true,
            _count: {
                select: {
                    purchaseItems: true,
                    saleItems: true,
                    stockMovements: true,
                    wastages: true,
                    ticketParts: true,
                }
            }
        }
    });

    if (oldProduct && oldProduct.trackStock !== effectiveTrackStock) {
        const hasHistory = (oldProduct._count.purchaseItems + oldProduct._count.saleItems + oldProduct._count.stockMovements + oldProduct._count.wastages + oldProduct._count.ticketParts) > 0 || !new Decimal(oldProduct.stock.toString()).isZero();
        if (hasHistory) {
            throw new Error("لا يمكن تغيير نوع تتبع المخزون لهذا المنتج لوجود حركات سابقة أو كمية متوفرة. يرجى أرشفة المنتج وإنشاء صنف جديد بدلاً منه.");
        }
    }

    // I-03: Static Name Concatenation for Model and Attribute
    let finalProductName = productFields.name;

    if (validated.modelId) {
        const model = await prisma.model.findUnique({ where: { id: validated.modelId } });
        if (model && !finalProductName.includes(model.name)) {
            finalProductName += ` - ${model.name}`;
        }
    }

    if (validated.attributeId) {
        const attr = await prisma.attribute.findUnique({ where: { id: validated.attributeId } });
        if (attr && !finalProductName.includes(attr.name)) {
            finalProductName += ` - ${attr.name}`;
        }
    }

    productFields.name = finalProductName;

    await prisma.$transaction(async (tx) => {
        // Update core product fields
        await (tx.product.update as any)({
            where: { id },
            data: {
                ...productFields,
                stock: effectiveStock,
                trackStock: effectiveTrackStock,
                isBundle: isBundle ?? false,
                unitOfMeasureId: unitOfMeasureId || null,
                modelId: validated.modelId || null,
                attributeId: validated.attributeId || null,
            }
        });

        // Replace bundle items atomically (delete old, insert new)
        if (isBundle) {
            await (tx as any).bundleItem.deleteMany({ where: { bundleProductId: id } });
            if (bundleItems && bundleItems.length > 0) {
                await (tx as any).bundleItem.createMany({
                    data: bundleItems.map((bi: any) => ({
                        bundleProductId: id,
                        componentProductId: bi.componentProductId,
                        quantityIncluded: bi.quantityIncluded,
                    }))
                });
            }
        }
    });

    revalidatePath("/inventory", 'page');
    revalidatePath("/pos", 'page');
    revalidateTag(CACHE_TAGS.PRODUCTS);
    revalidateTag(CACHE_TAGS.INVENTORY);
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

export const deleteProduct = secureAction(async (data: { id: string; csrfToken?: string }) => {
    const { id } = data;
    try {
        await prisma.$transaction(async (tx) => {
            // I-01: Soft Delete Implementation for Inventory Hardening
            // Fetch product first to get current SKU for suffixing
            const product = await tx.product.findUnique({
                where: { id },
                select: { sku: true }
            });

            if (product) {
                // Ghost SKU Suffixing: Frees up the original SKU for reuse while preserving history
                const ghostSku = `${product.sku}_del_${Date.now()}`;
                
                await tx.product.update({
                    where: { id },
                    data: {
                        deletedAt: new Date(),
                        archived: true,
                        sku: ghostSku
                    }
                });
            }
        });

        revalidatePath("/inventory", 'page');
        revalidatePath("/pos", 'page');
        revalidateTag(CACHE_TAGS.PRODUCTS);
        revalidateTag(CACHE_TAGS.INVENTORY);
        return { success: true };
    } catch (e: unknown) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
            const t = await getTranslations('SystemMessages.Errors');
            throw new Error(t('deleteProductError'));
        }
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
            return { success: true };
        }
        throw e;
    }
}, { permission: 'INVENTORY_MANAGE' });

/**
 * Idempotently ensures the "العروض والباقات" bundle category exists.
 * Safe to call on every app startup or from the setup flow.
 */
export const seedBundleCategory = secureAction(async (data?: { csrfToken?: string }) => {
    const existing = await prisma.category.findFirst({
        where: { name: 'العروض والباقات' }
    });
    if (existing) return { success: true, category: existing };

    const category = await prisma.category.create({
        data: { name: 'العروض والباقات', color: '#f59e0b' }
    });
    revalidatePath('/inventory', 'page');
    revalidateTag(CACHE_TAGS.CATEGORIES);
    return { success: true, category };
}, { permission: 'INVENTORY_MANAGE' });

/**
 * Fetches components for a bundle product with their current stock levels.
 * Used by POS to attach component data to cart items for receipt printing
 * and by the bundle availability calculation.
 */
export async function getBundleComponents(bundleProductId: string) {
    try {
        const items = await (prisma as any).bundleItem.findMany({
            where: { 
                bundleProductId,
                componentProduct: { deletedAt: null }
            },
            include: {
                componentProduct: {
                    select: {
                        id: true,
                        name: true,
                        sku: true,
                        costPrice: true,
                        stock: true,
                        trackStock: true,
                    }
                }
            }
        });

        return {
            success: true,
            components: items.map((item: any) => ({
                id: item.id,
                componentProductId: item.componentProductId,
                quantityIncluded: item.quantityIncluded,
                name: item.componentProduct.name,
                sku: item.componentProduct.sku,
                costPrice: Number(item.componentProduct.costPrice),
                stock: item.componentProduct.stock,
                trackStock: item.componentProduct.trackStock,
                // How many bundles can be made from this component's stock
                availableBundles: item.componentProduct.trackStock
                    ? Math.floor(item.componentProduct.stock / item.quantityIncluded)
                    : Infinity,
            }))
        };
    } catch (error: any) {
        console.error('[getBundleComponents] Error:', error);
        return { success: false, components: [] };
    }
}

/**
 * Computes the maximum number of bundles available based on
 * the minimum available quantity across all components.
 */
export async function getBundleAvailability(bundleProductId: string): Promise<number> {
    const result = await getBundleComponents(bundleProductId);
    if (!result.success || result.components.length === 0) return 0;
    const availabilities = result.components.map((c: any) => c.availableBundles);
    const finite = availabilities.filter((a: number) => isFinite(a));
    return finite.length === 0 ? Infinity : Math.min(...finite);
}

// --- Categories ---

export const getAllCategories = secureAction(async () => {
    const categories = await prisma.category.findMany({
        orderBy: { name: 'asc' },
    });
    return { success: true, categories };
}, { permission: 'INVENTORY_VIEW' });

export const getAllModels = secureAction(async () => {
    const models = await prisma.model.findMany({
        orderBy: { name: 'asc' },
        include: { category: { select: { id: true, name: true } } }
    });
    return { success: true, models };
}, { permission: 'INVENTORY_VIEW' });

export const getAllUnits = secureAction(async () => {
    const units = await prisma.unitOfMeasure.findMany({
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    return { success: true, units };
}, { permission: 'INVENTORY_VIEW' });

export const getAllAttributes = secureAction(async () => {
    const attributes = await prisma.attribute.findMany({
        orderBy: { name: 'asc' },
    });
    return { success: true, attributes };
}, { permission: 'INVENTORY_VIEW' });

export const createCategory = secureAction(async (data: z.infer<typeof categorySchema> & { csrfToken?: string }) => {
    const { csrfToken: _csrf, ...categoryData } = data;
    const validated = categorySchema.parse(categoryData);
    const category = await prisma.category.create({
        data: {
            name: validated.name,
            color: validated.color || "#06b6d4",
            parentId: validated.parentId || null
        }
    });
    revalidatePath('/inventory', 'page');
    revalidatePath('/pos', 'page');
    revalidateTag(CACHE_TAGS.CATEGORIES);
    revalidateTag("dashboard");
    return { success: true, category };
}, { permission: 'INVENTORY_MANAGE' });

export const createModel = secureAction(async (data: { name: string; categoryId: string; csrfToken?: string }) => {
    const model = await prisma.model.create({
        data: {
            name: data.name,
            categoryId: data.categoryId
        },
        include: { category: true }
    });
    revalidatePath('/inventory', 'page');
    revalidateTag(CACHE_TAGS.INVENTORY);
    return { success: true, model };
}, { permission: 'INVENTORY_MANAGE' });

export const createAttribute = secureAction(async (data: { name: string; csrfToken?: string }) => {
    const attribute = await prisma.attribute.create({
        data: {
            name: data.name.trim(),
        }
    });
    revalidatePath('/inventory', 'page');
    revalidateTag(CACHE_TAGS.INVENTORY);
    return { success: true, attribute };
}, { permission: 'INVENTORY_MANAGE' });

export const updateCategory = secureAction(async (data: { id: string } & z.infer<typeof categorySchema> & { csrfToken?: string }) => {
    const { id, ...categoryData } = data;
    const validated = categorySchema.parse(categoryData);
    
    // Prevent self-referencing and circular deps at a basic level
    if (validated.parentId === id) {
        throw new Error("Category cannot be its own parent.");
    }

    await prisma.category.update({
        where: { id },
        data: {
            name: validated.name,
            color: validated.color,
            isHidden: validated.isHidden,
            parentId: validated.parentId || null
        }
    });
    revalidatePath('/inventory', 'page');
    revalidatePath('/pos', 'page');
    revalidateTag(CACHE_TAGS.CATEGORIES);
    revalidateTag("dashboard");
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

/**
 * Toggle visibility of a category (used for quick right-click hiding in POS)
 */
export const toggleCategoryVisibility = secureAction(async (data: { id: string, isHidden: boolean, csrfToken?: string }) => {
    await prisma.category.update({
        where: { id: data.id },
        data: { isHidden: data.isHidden }
    });
    revalidatePath('/pos', 'page');
    revalidatePath('/inventory', 'page');
    revalidateTag(CACHE_TAGS.CATEGORIES);
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

export const deleteCategory = secureAction(async (data: { id: string; csrfToken?: string }) => {
    const { id } = data;
    try {
        await prisma.category.delete({ where: { id } });
    } catch (error: any) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2025') {
            throw error;
        }
    }
    revalidatePath('/inventory', 'page');
    revalidatePath('/pos', 'page');
    revalidateTag(CACHE_TAGS.CATEGORIES);
    revalidateTag("dashboard");
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

// --- Purchases ---

export const createPurchase = secureAction(async (data: z.infer<typeof purchaseSchema> & { csrfToken?: string }) => {
    // 1. Pre-computation & Reads (Outside Transaction)
    const startTime = Date.now();
    const { csrfToken: _csrf, ...purchaseData } = data;
    const validated = purchaseSchema.parse(purchaseData);
    const { items, treasuryId, ...header } = validated;

    // Get User for audit/treasury
    const { getCurrentUser } = await import('./auth');
    const user = await getCurrentUser();

    // Calculate Totals
    const subtotal = items.reduce((acc: Decimal, item) => acc.plus(new Decimal(String(item.unitCost)).times(item.quantity)), new Decimal(0));
    const deliveryChargeDec = new Decimal(header.deliveryCharge || 0);
    const totalAmountDec = subtotal.plus(deliveryChargeDec);
    const paidAmountDec = new Decimal(header.paidAmount || 0);

    let status = "PENDING";
    if (paidAmountDec.gte(totalAmountDec)) status = "PAID";
    else if (paidAmountDec.gt(0)) status = "PARTIAL";

    // Prepare Products Lookup (Batch Read - Defensive against stale IDs)
    const skusToCheck = items.map(i => i.sku).filter(Boolean) as string[];
    const idsToCheck = items.map(i => i.productId).filter(Boolean) as string[];

    const existingProducts = (skusToCheck.length > 0 || idsToCheck.length > 0)
        ? await prisma.product.findMany({ 
            where: { 
                OR: [
                    { id: { in: idsToCheck } },
                    { sku: { in: skusToCheck } }
                ]
            } 
        })
        : [];

    const idMap = new Map(existingProducts.map(p => [p.id, p]));
    const skuMap = new Map(existingProducts.map(p => [p.sku, p]));

    // Prepare Warehouse ID
    let warehouseId = header.warehouseId;
    if (!warehouseId) {
        const main = await prisma.warehouse.findFirst({ where: { isDefault: true } });
        if (!main) {
            throw new Error("Main warehouse not found. Please ensure a default warehouse exists.");
        }
        warehouseId = main.id;
    }

    // 2. Transaction (Optimized Writes)
    await prisma.$transaction(async (tx) => {
        // A. Warehouse resolution (Already resolved outside transaction for efficiency)

        // B. Resolve Item IDs (Create missing products in parallel)
        const productsToCreate: any[] = [];
        const processedItems: any[] = [];

        // Identify what needs creation or mapping
        for (const item of items) {
            let pid = item.productId;
            
            // 1. Validate provided ID if exists
            const productById = pid ? idMap.get(pid) : null;
            
            if (productById) {
                // Verified ID exists
                pid = productById.id;
            } else if (item.sku) {
                // ID missing or invalid -> fallback to SKU lookup
                const productBySku = skuMap.get(item.sku);
                if (productBySku) {
                    pid = productBySku.id;
                } else {
                    // Truly new item (no ID, no SKU in DB) -> Queue for creation
                    productsToCreate.push({ ...item });
                    continue;
                }
            } else {
                // Terminal case: Item has no ID and no SKU
                throw new Error(String(await getTranslations('SystemMessages.Errors').then(t => t('productMissingIdentifiers') || "Product lacks both ID and SKU")));
            }

            if (pid) {
                processedItems.push({ ...item, productId: pid });
            }
        }

        // Create new products in Parallel
        if (productsToCreate.length > 0) {
            const createdProducts = await Promise.all(productsToCreate.map(item =>
                tx.product.create({
                    data: {
                        name: item.name!,
                        sku: item.sku!,
                        costPrice: new Decimal(String(item.unitCost)).div(item.conversionFactor || 1),
                        sellPrice: item.sellPrice || 0,
                        sellPrice2: item.sellPrice2 || 0,
                        sellPrice3: item.sellPrice3 || 0,
                        stock: 0,
                        isDevice: item.isDevice || false,
                        deviceType: item.deviceType || undefined,
                        condition: item.condition || undefined,
                        ...(item.categoryId ? { category: { connect: { id: item.categoryId } } } : {}),
                        ...(item.modelId ? { model: { connect: { id: item.modelId } } } : {}),
                        ...(item.attributeId ? { attribute: { connect: { id: item.attributeId } } } : {}),
                        ...(item.unitOfMeasureId ? { unitOfMeasure: { connect: { id: item.unitOfMeasureId } } } : {})
                    } as any
                })
            ));

            // Merge back
            createdProducts.forEach((p, idx) => {
                const originalItem = productsToCreate[idx];
                processedItems.push({ ...originalItem, productId: p.id });
            });
        }

        // C. Generate Invoice Number (Atomic & Unique)
        let finalInvoiceNumber = header.invoiceNumber;
        if (!finalInvoiceNumber) {
            const seq = await getNextAtomicId('purchase_invoice');
            finalInvoiceNumber = `P-${seq.toString().padStart(5, '0')}`;
        }

        // D. Create Invoice & Items
        // D. Create Invoice & Items
        // Note: Using nested createMany is faster than looping
        const wh = await tx.warehouse.findUnique({
            where: { id: warehouseId! },
            select: { branchId: true }
        });

        // Resolve Supplier ID for Walk-ins
        let finalSupplierId = header.supplierId;
        if (header.isWalkin) {
            let walkinSupplier = await tx.supplier.findFirst({
                where: { name: "عميل نقدي (شراء مباشر)" }
            });
            if (!walkinSupplier) {
                walkinSupplier = await tx.supplier.create({
                    data: {
                        name: "عميل نقدي (شراء مباشر)",
                        address: "System Default for Walk-in Purchases",
                        balance: 0
                    }
                });
            }
            finalSupplierId = walkinSupplier.id;
        }

        const invoice = await tx.purchaseInvoice.create({
            data: {
                supplierId: finalSupplierId,
                isWalkin: header.isWalkin || false,
                walkinName: header.walkinName,
                walkinPhone: header.walkinPhone,
                walkinNationalId: header.walkinNationalId,
                attachmentUrl: header.attachmentUrl,
                invoiceNumber: finalInvoiceNumber,
                warehouseId: warehouseId!, // We ensured it exists
                totalAmount: totalAmountDec,
                deliveryCharge: deliveryChargeDec,
                paidAmount: paidAmountDec,
                status: status,
                paymentMethod: header.paymentMethod || "CASH",
                branchId: wh?.branchId || null,
                items: {
                    createMany: {
                        data: processedItems.map(i => ({
                            productId: i.productId,
                            quantity: i.quantity,
                            unitCost: i.unitCost,
                            imei: i.imei,
                            condition: i.condition,
                            color: i.color,
                            deviceType: i.deviceType,
                            unitOfMeasureId: i.unitOfMeasureId,
                            conversionFactor: i.conversionFactor || 1.0
                        }))
                    }
                }
            } as any
        });

        // E. Update Supplier Balance
        await tx.supplier.update({
            where: { id: finalSupplierId },
            data: { balance: { increment: totalAmountDec.minus(paidAmountDec) } }
        });

        // F. Record Payment (Optimized) - with auto journal
        if (paidAmountDec.gt(0)) {
            await financialRepo.createSupplierPayment(tx, {
                supplierId: finalSupplierId,
                amount: paidAmountDec,
                method: header.paymentMethod || "CASH",
                notes: header.isWalkin ? `Walk-in Purchase Payment: ${header.walkinName}` : `Invoice Payment #${finalInvoiceNumber}`,
                branchId: user?.branchId || null
            });

            // Treasury Logic
            if (user?.branchId || treasuryId) {
                // If explicit treasury given, use it. Otherwise fallback to branch default
                let treasury: any = null;
                if (treasuryId) {
                    treasury = await tx.treasury.findUnique({
                        where: { id: treasuryId },
                        select: { id: true }
                    });
                }

                if (!treasury && user?.branchId) {
                    treasury = await tx.treasury.findFirst({
                        where: { branchId: user.branchId, isDefault: true },
                        select: { id: true }
                    });
                }

                if (treasury) {
                    await tx.transaction.create({
                        data: {
                            type: 'OUT',
                            amount: paidAmountDec,
                            description: `Supplier Payment: Invoice #${finalInvoiceNumber}`,
                            paymentMethod: header.paymentMethod || "CASH",
                            treasuryId: treasury.id
                        }
                    });

                    await tx.treasury.update({
                        where: { id: treasury.id },
                        data: { balance: { decrement: paidAmountDec } }
                    });
                }
            }
        }

        // G. Stock Updates (CONSOLIDATED / THREAD-SAFE)
        // ---------------------------------------------------------------------
        
        // 1. Aggregate duplicates to prevent parallel-update collisions on the same ID
        // This is the CRITICAL fix for "Record to update not found" in SQLite/Prisma
        const aggregatedMap = new Map<string, {
            productId: string,
            totalQuantity: Decimal,
            latestUnitCost: number,
            latestSellPrice?: number,
            latestSellPrice2?: number,
            latestSellPrice3?: number,
        }>();

        for (const item of processedItems) {
            const existing = aggregatedMap.get(item.productId);
            const factor = new Decimal(String(item.conversionFactor || 1));
            const qty = new Decimal(String(item.quantity)).times(factor);

            if (existing) {
                existing.totalQuantity = existing.totalQuantity.plus(qty);
                existing.latestUnitCost = item.unitCost; // Last line wins for pricing
                if (item.sellPrice) existing.latestSellPrice = item.sellPrice;
                if (item.sellPrice2) existing.latestSellPrice2 = item.sellPrice2;
                if (item.sellPrice3) existing.latestSellPrice3 = item.sellPrice3;
            } else {
                aggregatedMap.set(item.productId, {
                    productId: item.productId,
                    totalQuantity: qty,
                    latestUnitCost: item.unitCost,
                    latestSellPrice: item.sellPrice,
                    latestSellPrice2: item.sellPrice2,
                    latestSellPrice3: item.sellPrice3,
                });
            }
        }

        const aggregatedItems = Array.from(aggregatedMap.values());

        // 2. Prepare Stock Movements (keep per-line for audit trail granularity)
        const movementsData = processedItems.map(item => ({
            type: 'PURCHASE',
            productId: item.productId,
            fromWarehouseId: null,
            toWarehouseId: warehouseId!,
            quantity: new Decimal(String(item.quantity)).times(item.conversionFactor || 1),
            reason: `Purchase Invoice #${finalInvoiceNumber}`,
            branchId: wh?.branchId || null
        }));

        await tx.stockMovement.createMany({
            data: movementsData
        });

        // 3. Perform Consolidated Updates (One per Product ID)
        await Promise.all([
            // Update Products
            ...aggregatedItems.map(item =>
                tx.product.update({
                    where: { id: item.productId },
                    data: {
                        stock: { increment: item.totalQuantity.toNumber() },
                        // Cost should reflect the unit cost (already adjusted for factor if needed, 
                        // but here we use the line's unitCost as per existing logic)
                        costPrice: item.latestUnitCost, 
                        ...(item.latestSellPrice ? { sellPrice: item.latestSellPrice } : {}),
                        ...(item.latestSellPrice2 ? { sellPrice2: item.latestSellPrice2 } : {}),
                        ...(item.latestSellPrice3 ? { sellPrice3: item.latestSellPrice3 } : {})
                    }
                })
            ),
            // Update Warehouse Stock
            ...aggregatedItems.map(item =>
                tx.stock.upsert({
                    where: {
                        productId_warehouseId: {
                            productId: item.productId,
                            warehouseId: warehouseId!
                        }
                    },
                    update: { quantity: { increment: item.totalQuantity.toNumber() } },
                    create: {
                        productId: item.productId,
                        warehouseId: warehouseId!,
                        quantity: item.totalQuantity.toNumber()
                    }
                })
            )
        ]);

        // H. Record Purchasing Accounting (Phase 2.2)
        await AccountingEngine.recordPurchase(
            invoice.id,
            finalInvoiceNumber || 'PURCHASE',
            totalAmountDec,
            paidAmountDec,
            new Decimal(header.taxAmount || 0),
            user?.branchId ?? undefined,
            tx
        );


    }, { maxWait: 5000, timeout: 20000 });

    const duration = Date.now() - startTime;
    logger.info("Purchase Created", { duration, itemsCount: items.length });

    revalidatePath("/inventory", 'page');
    revalidatePath("/pos", 'page');
    revalidatePath("/logs", 'page');
    revalidatePath("/reports", 'page');
    revalidateTag(CACHE_TAGS.INVENTORY);
    revalidateTag("dashboard");
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

export const updatePurchase = secureAction(async (data: { id: string; data: z.infer<typeof purchaseSchema>; csrfToken?: string }) => {
    const startTime = Date.now();
    const { id, data: purchaseData, csrfToken: _csrf } = data;
    const validated = purchaseSchema.parse(purchaseData);
    const { items, treasuryId, ...header } = validated;

    const { getCurrentUser } = await import('./auth');
    const user = await getCurrentUser();

    const skusToCheck = items.filter(i => !i.productId && i.sku).map(i => i.sku as string);
    const existingProducts = skusToCheck.length > 0
        ? await prisma.product.findMany({ where: { sku: { in: skusToCheck } } })
        : [];
    const existingProductMap = new Map(existingProducts.map(p => [p.sku, p]));

    let warehouseId = header.warehouseId;
    if (!warehouseId) {
        const main = await prisma.warehouse.findFirst({ where: { isDefault: true } });
        if (!main) throw new Error("Main warehouse not found.");
        warehouseId = main.id;
    }

    await prisma.$transaction(async (tx) => {
        const oldInvoice = await tx.purchaseInvoice.findUnique({
            where: { id },
            include: { items: true }
        });

        const { getTranslations } = await import('@/lib/i18n-mock');
        const t = await getTranslations('SystemMessages.Errors');

        if (!oldInvoice) throw new Error(t('notFound'));
        if (['CANCELLED', 'VOIDED', 'RETURNED'].includes(oldInvoice.status)) {
            throw new Error(t('voidedInvoice'));
        }

        await Promise.all([
            ...oldInvoice.items.map(item =>
                tx.product.update({
                    where: { id: item.productId },
                    data: { stock: { decrement: new Decimal(String(item.quantity)).times(new Decimal(String(item.conversionFactor || 1))) } }
                })
            ),
            ...oldInvoice.items.map(item =>
                tx.stock.updateMany({
                    where: { productId: item.productId, warehouseId: oldInvoice.warehouseId! },
                    data: { quantity: { decrement: new Decimal(String(item.quantity)).times(new Decimal(String(item.conversionFactor || 1))) } }
                })
            )
        ]);

        const oldNet = new Decimal(oldInvoice.totalAmount.toString()).minus(oldInvoice.paidAmount.toString());
        await tx.supplier.update({
            where: { id: oldInvoice.supplierId },
            data: { balance: { decrement: oldNet } }
        });

        await tx.purchaseItem.deleteMany({ where: { purchaseInvoiceId: id } });

        // APPLY NEW
        const productsToCreate: any[] = [];
        const processedItems: any[] = [];
        for (const item of items) {
            let pid = item.productId;
            if (!pid && item.sku) {
                const existing = existingProductMap.get(item.sku);
                if (existing) pid = existing.id;
                else productsToCreate.push({ ...item });
            }
            if (pid) processedItems.push({ ...item, productId: pid });
        }

        if (productsToCreate.length > 0) {
            const createdProducts = await Promise.all(productsToCreate.map(item =>
                tx.product.create({
                    data: {
                        name: item.name!,
                        sku: item.sku!,
                        costPrice: item.unitCost,
                        sellPrice: item.sellPrice || 0,
                        sellPrice2: item.sellPrice2 || 0,
                        sellPrice3: item.sellPrice3 || 0,
                        stock: 0,
                        isDevice: item.isDevice || false,
                        deviceType: item.deviceType || undefined,
                        condition: item.condition || undefined,
                        ...(item.categoryId ? { category: { connect: { id: item.categoryId } } } : {}),
                        ...(item.modelId ? { model: { connect: { id: item.modelId } } } : {}),
                        ...(item.attributeId ? { attribute: { connect: { id: item.attributeId } } } : {}),
                    } as any
                })
            ));
            createdProducts.forEach((p, idx) => {
                processedItems.push({ ...productsToCreate[idx], productId: p.id });
            });
        }

        const subtotal = processedItems.reduce((acc: Decimal, i) => acc.plus(new Decimal(String(i.unitCost)).times(i.quantity)), new Decimal(0));
        const deliveryChargeDec = new Decimal(header.deliveryCharge || 0);
        const totalAmountDec = subtotal.plus(deliveryChargeDec);
        const paidAmountDec = new Decimal(header.paidAmount || 0);
        let status = "PENDING";
        if (paidAmountDec.gte(totalAmountDec)) status = "PAID";
        else if (paidAmountDec.gt(0)) status = "PARTIAL";

        // Resolve Supplier ID for Walk-ins
        let finalSupplierId = header.supplierId;
        if (header.isWalkin) {
            let walkinSupplier = await tx.supplier.findFirst({
                where: { name: "عميل نقدي (شراء مباشر)" }
            });
            if (!walkinSupplier) {
                walkinSupplier = await tx.supplier.create({
                    data: {
                        name: "عميل نقدي (شراء مباشر)",
                        address: "System Default for Walk-in Purchases",
                        balance: 0
                    }
                });
            }
            finalSupplierId = walkinSupplier.id;
        }

        await tx.purchaseInvoice.update({
            where: { id },
            data: {
                supplierId: finalSupplierId,
                isWalkin: header.isWalkin || false,
                walkinName: header.walkinName,
                walkinPhone: header.walkinPhone,
                walkinNationalId: header.walkinNationalId,
                attachmentUrl: header.attachmentUrl,
                invoiceNumber: header.invoiceNumber,
                warehouseId: warehouseId!,
                totalAmount: totalAmountDec,
                deliveryCharge: deliveryChargeDec,
                paidAmount: paidAmountDec,
                status,
                paymentMethod: header.paymentMethod,
                items: {
                    createMany: {
                        data: processedItems.map(i => ({
                            productId: i.productId,
                            quantity: i.quantity,
                            unitCost: i.unitCost,
                            imei: i.imei,
                            condition: i.condition,
                            color: i.color,
                            deviceType: i.deviceType,
                            unitOfMeasureId: i.unitOfMeasureId,
                            conversionFactor: i.conversionFactor || 1
                        }))
                    }
                }
            }
        });

        if (paidAmountDec.gt(oldInvoice.paidAmount.toString())) {
            const diffAmountDec = paidAmountDec.minus(oldInvoice.paidAmount.toString());
            // Update payment - with auto journal
            await financialRepo.createSupplierPayment(tx, {
                supplierId: header.supplierId,
                amount: diffAmountDec,
                method: header.paymentMethod || "CASH",
                notes: `Update Invoice Payment #${header.invoiceNumber || id}`,
                branchId: user?.branchId || null
            });

            if (user?.branchId || treasuryId) {
                let treasury: any = null;
                if (treasuryId) {
                    treasury = await tx.treasury.findUnique({ where: { id: treasuryId }, select: { id: true } });
                }
                if (!treasury && user?.branchId) {
                    treasury = await tx.treasury.findFirst({ where: { branchId: user.branchId, isDefault: true }, select: { id: true } });
                }
                if (treasury) {
                    await tx.transaction.create({
                        data: {
                            type: 'OUT',
                            amount: diffAmountDec,
                            description: `Supplier Payment: Update Invoice #${header.invoiceNumber || id}`,
                            paymentMethod: header.paymentMethod || "CASH",
                            treasuryId: treasury.id
                        }
                    });
                    await tx.treasury.update({ where: { id: treasury.id }, data: { balance: { decrement: diffAmountDec } } });
                }
            }
        }

        await tx.supplier.update({
            where: { id: finalSupplierId },
            data: { balance: { increment: totalAmountDec.minus(paidAmountDec) } }
        });

        const sortedItems = [...processedItems].sort((a, b) => a.productId.localeCompare(b.productId));
        await Promise.all([
            ...sortedItems.map(item =>
                tx.product.update({
                    where: { id: item.productId },
                    data: { 
                        stock: { increment: new Decimal(String(item.quantity)).times(item.conversionFactor || 1).toNumber() }, 
                        costPrice: new Decimal(String(item.unitCost)).div(item.conversionFactor || 1) 
                    }
                })
            ),
            ...sortedItems.map(item =>
                tx.stock.upsert({
                    where: { productId_warehouseId: { productId: item.productId, warehouseId: warehouseId! } },
                    update: { quantity: { increment: new Decimal(String(item.quantity)).times(item.conversionFactor || 1).toNumber() } },
                    create: { productId: item.productId, warehouseId: warehouseId!, quantity: new Decimal(String(item.quantity)).times(item.conversionFactor || 1).toNumber() }
                })
            )
        ]);

        // H. Record Purchasing Accounting (Phase 2.2)
        const { FinancialReversalService } = await import("@/lib/financial-reversal-service");
        await FinancialReversalService.reverseAccountingEntries(tx, id, "Purchase updated");

        await AccountingEngine.recordPurchase(
            id,
            header.invoiceNumber || 'PURCHASE',
            totalAmountDec,
            paidAmountDec,
            new Decimal(header.taxAmount || 0),
            user?.branchId ?? undefined,
            tx
        );
    });

    revalidatePath("/inventory", 'page');
    revalidatePath("/logs", 'page');
    revalidateTag(CACHE_TAGS.INVENTORY);
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

export const deletePurchase = secureAction(async (data: { id: string; csrfToken?: string }) => {
    const { id } = data;
    const old = await prisma.purchaseInvoice.findUnique({ where: { id }, include: { items: true } });
    if (!old) throw new Error("Invoice not found.");

    await prisma.$transaction(async (tx) => {
        for (const item of old.items) {
            const factor = new Decimal(String(item.conversionFactor || 1));
            const effectiveQty = new Decimal(String(item.quantity)).times(factor).toNumber();

            await tx.product.update({ where: { id: item.productId }, data: { stock: { decrement: effectiveQty } } });
            await tx.stock.updateMany({
                where: { productId: item.productId, warehouseId: old.warehouseId! },
                data: { quantity: { decrement: effectiveQty } }
            });
        }
        const netDec = new Decimal(old.totalAmount.toString()).minus(old.paidAmount.toString());
        await tx.supplier.update({ where: { id: old.supplierId }, data: { balance: { decrement: netDec } } });
        
        const { FinancialReversalService } = await import("@/lib/financial-reversal-service");
        await FinancialReversalService.reverseAccountingEntries(tx, id, "Purchase voided");
        
        await tx.purchaseInvoice.update({ where: { id }, data: { status: 'CANCELLED' } });
    });

    revalidatePath("/inventory", 'page');
    revalidateTag(CACHE_TAGS.INVENTORY);
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });



// Redundant refundPurchase removed in favor of voidPurchase in purchase-actions.ts 


// --- Stock Ops ---

export const adjustStock = secureAction(async (data: {
    productId: string;
    warehouseId: string;
    newQuantity: number;
    reason: string;
    csrfToken?: string;
}) => {
    await prisma.$transaction(async (tx) => {
        // 1. Get Old Quantity & Branch Info
        const warehouse = await tx.warehouse.findUnique({
            where: { id: data.warehouseId },
            select: { branchId: true }
        });
        if (!warehouse) throw new Error("Warehouse not found");

        const currentStock = await tx.stock.findUnique({
            where: { productId_warehouseId: { productId: data.productId, warehouseId: data.warehouseId } },
            select: { quantity: true }
        });
        const oldQty = toDecimal(currentStock?.quantity || 0);
        const newQty = toDecimal(data.newQuantity);
        const delta = newQty.minus(oldQty);

        if (delta.isZero()) return; // No change

        // 2. Set Warehouse Stock (One Source of Truth)
        await tx.stock.upsert({
            where: { productId_warehouseId: { productId: data.productId, warehouseId: data.warehouseId } },
            update: { quantity: newQty },
            create: { productId: data.productId, warehouseId: data.warehouseId, quantity: newQty }
        });

        // 3. Log Movement (Technical Ledger)
        await tx.stockMovement.create({
            data: {
                type: 'ADJUSTMENT',
                productId: data.productId,
                fromWarehouseId: data.warehouseId,
                quantity: delta.abs(),
                reason: `${data.reason} (Count: ${oldQty} -> ${newQty})`,
                branchId: warehouse.branchId || null
            } as any
        });

        // 4. Create AuditLog (Administrative Audit Trail - I-03)
        const currentUser = await getCurrentUser();
        await tx.auditLog.create({
            data: {
                action: 'MANUAL_STOCK_ADJUSTMENT',
                entityType: 'PRODUCT',
                entityId: data.productId,
                user: currentUser?.username || 'system',
                branchId: warehouse.branchId || null,
                reason: `Manual stock adjustment for product ${data.productId} in warehouse ${data.warehouseId}. Qty: ${oldQty} -> ${newQty}. Reason: ${data.reason}`,
            }
        });

        // 4. Recalculate Global Product Stock & Record GL (B31)
        const product = await tx.product.findUnique({
            where: { id: data.productId },
            select: { costPrice: true }
        });
        const costPrice = toDecimal(product?.costPrice || 0);
        const totalValueDelta = delta.mul(costPrice);

        if (totalValueDelta.lt(0)) {
            // Shrinkage (Loss)
            await AccountingEngine.recordWastage({
                wastageId: data.productId,
                amount: totalValueDelta.abs(),
                description: `Stock Shrinkage Adjustment: ${data.reason}`,
                branchId: warehouse.branchId
            }, tx);
        } else if (totalValueDelta.gt(0)) {
            // Surplus (Gain)
            await AccountingEngine.recordStockGain({
                productId: data.productId,
                amount: totalValueDelta,
                description: `Stock Surplus Adjustment: ${data.reason}`,
                branchId: warehouse.branchId
            }, tx);
        }

        const aggregation = await tx.stock.aggregate({
            where: { productId: data.productId },
            _sum: { quantity: true }
        });
        const trueTotal = Number(aggregation._sum.quantity) || 0;

        await tx.product.update({
            where: { id: data.productId },
            data: { stock: trueTotal }
        });
    });

    revalidatePath("/inventory", 'page');
    revalidatePath("/pos", 'page');
    revalidateTag(CACHE_TAGS.INVENTORY);
    revalidateTag(CACHE_TAGS.PRODUCTS);
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

// --- Helpers ---

export const getWarehouses = secureAction(async () => {
    const user = await getCurrentUser();
    if (!user) throw new Error("Not authenticated");

    // Check if HQ user: has cross-branch visibility via HQ_VIEW permission or '*'
    const isHQUser = hasPermission(user.permissions, PERMISSIONS.HQ_VIEW) ||
        hasPermission(user.permissions, '*') ||
        user.branchType === 'CENTER';

    // Self-healing removed from read path for safety (BUG-01). 
    // Use fixDuplicateWarehouses() admin action instead.

    const warehouses = await prisma.warehouse.findMany({
        where: isHQUser ? { deletedAt: null } : { branchId: user.branchId || '', deletedAt: null },
        include: { branch: true },
        orderBy: { isDefault: 'desc' }
    });

    return { data: warehouses, isHQUser };
}, { requireCSRF: false });

/**
 * Admin action to fix duplicate default warehouses caused by sync/manual errors.
 * (Extracted from getWarehouses for safety - BUG-01)
 */
export const fixDuplicateWarehouses = secureAction(async () => {
    const allBranches = await prisma.branch.findMany({ select: { id: true } });
    let fixed = 0;
    
    await prisma.$transaction(async (tx) => {
        for (const b of allBranches) {
            const defaultWarehouses = await tx.warehouse.findMany({
                where: { branchId: b.id, isDefault: true, deletedAt: null },
                orderBy: { createdAt: 'asc' }
            });

            if (defaultWarehouses.length > 1) {
                // Keep the oldest, soft-delete others
                for (let i = 1; i < defaultWarehouses.length; i++) {
                    const duplicateWh = defaultWarehouses[i];
                    await tx.warehouse.update({
                        where: { id: duplicateWh.id },
                        data: { 
                            isDefault: false, 
                            deletedAt: new Date(),
                            name: `${duplicateWh.name} (Deleted)` 
                        }
                    });
                    fixed++;
                }
            }
        }
    });

    revalidatePath("/inventory");
    return { success: true, fixed };
}, { permission: 'INVENTORY_MANAGE' });

export const getWarehousesByBranch = secureAction(async (branchId: string) => {
    const warehouses = await prisma.warehouse.findMany({
        where: { branchId, deletedAt: null },
        include: { branch: true },
        orderBy: { name: 'asc' }
    });
    return { success: true, data: warehouses };
}, { requireCSRF: false });

export const getWarehouseStock = secureAction(async (warehouseId: string) => {
    const stock = await prisma.stock.findMany({
        where: { warehouseId },
        include: { 
            product: {
                include: { 
                    category: true,
                    model: true 
                }
            }
        },
        orderBy: { product: { name: 'asc' } }
    });

    const mapped = stock.map(s => ({
        id: s.id,
        productId: s.productId,
        name: s.product.name,
        sku: s.product.sku,
        quantity: s.quantity,
        unitCost: Number(s.product.costPrice),
        sellPrice: Number(s.product.sellPrice),
        categoryId: s.product.categoryId,
        categoryName: s.product.category?.name || 'Uncategorized',
        modelId: s.product.modelId,
        modelName: s.product.model?.name || '-'
    }));

    return { success: true, data: mapped };
}, { requireCSRF: false });

// ... WarehouseStock ...

export const getPurchase = secureAction(async (id: string) => {
    const purchase = await prisma.purchaseInvoice.findUnique({
        where: { id },
        include: {
            items: { 
                include: { 
                    product: {
                        include: {
                            category: true,
                            model: true
                        }
                    },
                    unitOfMeasure: true
                } 
            },
            supplier: true,
            warehouse: {
                include: { branch: true }
            },

        }
    });

    if (!purchase) return { success: false, error: "Purchase not found" };

    return { success: true, data: purchase };
}, { requireCSRF: false });

export const createWarehouse = secureAction(async (data: { name: string; address?: string; branchId?: string; csrfToken?: string }) => {
    let targetBranchId = data.branchId;

    if (!targetBranchId) {
        // Fallback: get the first available branch
        let firstBranch = await prisma.branch.findFirst({ select: { id: true } });

        if (!firstBranch) {
            // Create default branch if strictly no branches exist
            firstBranch = await prisma.branch.create({
                data: {
                    name: "Main Branch",
                    code: "MAIN",
                    type: "STORE",
                    phone: "",
                    address: "Main Location"
                },
                select: { id: true }
            });
        }

        targetBranchId = firstBranch.id;
    }

    // ── Duplicate name check ──────────────────────────────────────────
    const existing = await prisma.warehouse.findFirst({
        where: {
            branchId: targetBranchId,
            name: { equals: data.name.trim() },
            deletedAt: null
        }
    });
    if (existing) {
        return { success: false, error: `يوجد مخزن بنفس الاسم "${data.name}" في هذا الفرع بالفعل.` };
    }
    // ─────────────────────────────────────────────────────────────────

    await prisma.warehouse.create({
        data: {
            name: data.name.trim(),
            address: data.address || null,
            branchId: targetBranchId,
            isDefault: false
        }
    });

    revalidatePath("/inventory");
    revalidatePath(`/branches/${targetBranchId}/warehouses`);
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

export const updateWarehouse = secureAction(async (data: { id: string } & z.infer<typeof warehouseSchema> & { csrfToken?: string }) => {
    const { id, ...warehouseData } = data;
    const validated = warehouseSchema.parse(warehouseData);

    const warehouse = await prisma.warehouse.update({
        where: { id },
        data: {
            name: validated.name,
            address: validated.address || null,
        }
    });

    revalidatePath("/inventory");
    revalidatePath(`/branches/${warehouse.branchId}/warehouses`);
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

export const deleteWarehouse = secureAction(async (data: { id: string; csrfToken?: string }) => {
    const { id } = data;
    const t = await getTranslations('Inventory.warehouses');
    const targetWarehouse = await prisma.warehouse.findUnique({
        where: { id },
        select: { id: true, branchId: true }
    });

    if (!targetWarehouse) {
        return { success: true };
    }

    // 1. Check for stock availability
    const stockCount = await prisma.stock.count({
        where: { warehouseId: id, quantity: { gt: 0 } }
    });

    if (stockCount > 0) {
        return { success: false, error: t('warehouseHasStock', { defaultValue: "Warehouse has stock and cannot be deleted" }) };
    }

    // 2. Check for Invoices
    const invoiceCount = await prisma.purchaseInvoice.count({
        where: { warehouseId: id }
    });

    if (invoiceCount > 0) {
        return { success: false, error: t('warehouseHasInvoices', { defaultValue: "Warehouse is linked to invoices and cannot be deleted" }) };
    }

    // 3. Check for Sales (Critical for Audit)
    const saleCount = await prisma.sale.count({
        where: { warehouseId: id }
    });

    if (saleCount > 0) {
        return { success: false, error: t('warehouseHasSales', { defaultValue: "Warehouse is linked to sales and cannot be deleted" }) };
    }

    // 4. Check for Stock Movements (Audit Trail)
    const movementCount = await prisma.stockMovement.count({
        where: {
            OR: [
                { fromWarehouseId: id },
                { toWarehouseId: id }
            ]
        }
    });

    if (movementCount > 0) {
        return { success: false, error: t('warehouseHasMovements', { defaultValue: "Warehouse has historical stock movements and cannot be deleted" }) };
    }

    // 5. Check for Wastage
    const wastageCount = await prisma.stockWastage.count({
        where: { warehouseId: id }
    });

    if (wastageCount > 0) {
        return { success: false, error: t('warehouseHasWastages', { defaultValue: "Warehouse has wastage reports and cannot be deleted" }) };
    }

    // 6. Check for Stock Requests
    const requestCount = await prisma.stockRequest.count({
        where: { warehouseId: id }
    });

    if (requestCount > 0) {
        return { success: false, error: t('warehouseHasRequests', { defaultValue: "Warehouse has stock requests and cannot be deleted" }) };
    }

    // 7. Cleanup & Delete
    await prisma.$transaction(async (tx) => {
        // Delete zero-quantity stock records first to satisfy FK
        await tx.stock.deleteMany({
            where: { warehouseId: id }
        });

        // Delete Technicians assigned to this warehouse if any
        await tx.technician.deleteMany({
            where: { warehouseId: id }
        });

        try {
            await tx.warehouse.delete({
                where: { id }
            });
        } catch (error: any) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2025') {
                throw error;
            }
        }
    });

    revalidatePath("/inventory");
    revalidatePath(`/branches/${targetWarehouse.branchId}/warehouses`);
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

export const generateNextSku = secureAction(async (options?: {
    prefix?: string;
    length?: number;
    existingSKUs?: string[]; // Client-side cart SKUs to avoid duplicates
}) => {
    // Default configuration: SKU-000001 format
    const prefix = options?.prefix || 'C';
    const length = options?.length || 2;

    // Efficient query: only fetch SKUs matching our prefix pattern
    // This is MUCH faster than fetching all products
    const products = await prisma.product.findMany({
        where: {
            sku: {
                startsWith: prefix
            }
        },
        select: { sku: true },
        orderBy: { createdAt: 'desc' },
        take: 100 // Safety limit - only need recent ones
    });

    // Combine database SKUs with cart SKUs for comprehensive checking
    const allSKUs = [
        ...products.map(p => p.sku),
        ...(options?.existingSKUs || [])
    ];

    // Extract numeric portions from formatted SKUs and find maximum
    // Handles formats like: "SKU-001", "SKU_042", "SKU-0123", etc.
    let maxNum = 0;
    const pattern = new RegExp(`^${prefix}[-_]?(\\d+)$`, 'i');

    for (const sku of allSKUs) {
        const match = sku.match(pattern);
        if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxNum) {
                maxNum = num;
            }
        }
    }

    // Generate next SKU with professional zero-padding
    const nextNum = maxNum + 1;
    const paddedNum = nextNum.toString().padStart(length, '0');
    const newSku = `${prefix}-${paddedNum}`;

    // Safety check: verify the generated SKU is actually unique
    // This prevents race conditions in concurrent environments
    const existing = await prisma.product.findUnique({
        where: { sku: newSku }
    });

    if (existing) {
        // Collision detected - use timestamp as fallback for uniqueness
        const timestamp = Date.now().toString().slice(-4);
        return {
            success: true,
            sku: `${prefix}-${paddedNum}-${timestamp}`,
            warning: 'Used timestamp fallback due to collision'
        };
    }

    return { success: true, sku: newSku };
}, { requireCSRF: false }); // No permission required - safe read-only operation

export const getUnits = secureAction(async (category?: string) => {
    const where = category ? { category, isActive: true } : { isActive: true };
    const units = await prisma.unitOfMeasure.findMany({
        where,
        orderBy: [{ category: 'asc' }, { name: 'asc' }]
    });
    return { success: true, units };
}, { requireCSRF: false });

export const getProducts = secureAction(async (params: { 
    search?: string; 
    page?: number; 
    limit?: number; 
    categoryId?: string; 
    stockStatus?: string;
    warehouseId?: string;
    startDate?: string;
    endDate?: string;
    sortBy?: 'name' | 'createdAt' | 'stock' | 'sku' | 'sellPrice';
    sortOrder?: 'asc' | 'desc';
} = {}) => {
    const page = params.page || 1;
    const limit = params.limit || 50;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
        deletedAt: null
    };

    if (params.search) {
        where.OR = [
            { name: { contains: params.search } },
            { sku: { contains: params.search } },
            { model: { name: { contains: params.search } } }
        ];
    }

    if (params.categoryId) {
        where.categoryId = params.categoryId;
    }

    if (params.startDate || params.endDate) {
        where.createdAt = {};
        if (params.startDate) where.createdAt.gte = new Date(params.startDate);
        if (params.endDate) where.createdAt.lte = new Date(params.endDate);
    }

    // Stock Status Logic (Conditional on Warehouse)
    if (params.stockStatus) {
        const statusWhere: any = {};
        if (params.stockStatus === 'in_stock') statusWhere.gte = 5;
        else if (params.stockStatus === 'low_stock') statusWhere.gt = 0, statusWhere.lt = 5;
        else if (params.stockStatus === 'out_of_stock') statusWhere.lte = 0;
        
        if (params.stockStatus !== 'services') {
            where.trackStock = true;
            if (params.warehouseId) {
                where.stocks = {
                    some: {
                        warehouseId: params.warehouseId,
                        quantity: statusWhere
                    }
                };
            } else {
                where.stock = statusWhere;
            }
        } else {
            where.trackStock = false;
        }
    } else if (params.warehouseId) {
        // Just filter by warehouse presence if no status given but wh is
        where.stocks = {
            some: { warehouseId: params.warehouseId }
        };
    }

    const orderBy: any = {};
    if (params.sortBy) {
        orderBy[params.sortBy] = params.sortOrder || 'asc';
    } else {
        orderBy.name = 'asc';
    }

    const [products, total] = await Promise.all([
        prisma.product.findMany({
            where,
            skip,
            take: limit,
            orderBy,
            include: {
                category: { select: { name: true } },
                model: { select: { name: true } },
                attribute: { select: { name: true } },
                unitOfMeasure: { select: { code: true, name: true, abbreviation: true } },
                stocks: params.warehouseId ? {
                    where: { warehouseId: params.warehouseId }
                } : false,
                _count: {
                    select: {
                        purchaseItems: true,
                        saleItems: true,
                        stockMovements: true,
                        wastages: true,
                        ticketParts: true,
                    }
                }
            }
        }),
        prisma.product.count({ where })
    ]);

    return {
        success: true,
        data: products.map((p: any) => ({
            ...p,
            stock: params.warehouseId ? (p.stocks?.[0]?.quantity || 0) : p.stock,
            categoryName: p.category?.name || null,
            modelName: p.model?.name || null,
            attributeName: p.attribute?.name || null,
            unitCode: p.unitOfMeasure?.code || null,
            unitName: p.unitOfMeasure?.name || null,
            unitAbbreviation: p.unitOfMeasure?.abbreviation || null,
            costPrice: p.costPrice.toNumber(),
            sellPrice: p.sellPrice.toNumber(),
            sellPrice2: p.sellPrice2?.toNumber() || 0,
            sellPrice3: p.sellPrice3?.toNumber() || 0,
            createdAt: p.createdAt.toISOString(),
            updatedAt: p.updatedAt.toISOString(),
            deletedAt: p.deletedAt ? p.deletedAt.toISOString() : null,
            hasHistory: (p._count.purchaseItems + p._count.saleItems + p._count.stockMovements + p._count.wastages + p._count.ticketParts) > 0 || (p.stock !== 0),
        })),
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        }
    };
}, { requireCSRF: false });

// --- Sprint 1: Stock Wastage Tracking ---

/**
 * Report stock wastage (damaged, expired, theft, quality issues)
 * Automatically adjusts stock levels and creates audit trail
 */
export const reportWastage = secureAction(async (data: {
    productId: string;
    warehouseId: string;
    quantity: number;
    reason: 'DAMAGED' | 'EXPIRED' | 'THEFT' | 'QUALITY_ISSUE' | 'OTHER';
    notes?: string;
    csrfToken?: string;
}) => {
    // Validation
    if (data.quantity <= 0) {
        const t = await getTranslations('SystemMessages.Errors');
        throw new Error(t('quantityPositive'));
    }

    const result = await prisma.$transaction(async (tx) => {
        // 1. Verify product and warehouse exist
        const product = await tx.product.findUnique({
            where: { id: data.productId },
            select: { id: true, name: true, sku: true, stock: true, costPrice: true }
        });

        if (!product) {
            const t = await getTranslations('SystemMessages.Errors');
            throw new Error(t('productNotFound'));
        }

        const warehouseStock = await tx.stock.findUnique({
            where: {
                productId_warehouseId: {
                    productId: data.productId,
                    warehouseId: data.warehouseId
                }
            }
        });

        if (!warehouseStock || Number(warehouseStock.quantity) < Number(data.quantity)) {
            const t = await getTranslations('SystemMessages.Errors');
            throw new Error(t('insufficientStockWarehouse', { item: product.name }));
        }

        // 2. Get current user for audit
        const { getCurrentUser } = await import('@/actions/auth');
        const user = await getCurrentUser();
        if (!user) {
            const t = await getTranslations('SystemMessages.Errors');
            throw new Error(t('unauthorized'));
        }

        // V-06 audit fix: handle required reportedBy for super-admin virtual ID
        let reportedBy: string = user.id;
        if (reportedBy === 'super-admin') {
            const fallback = await tx.user.findFirst({ where: { isGlobalAdmin: true } }) || await tx.user.findFirst();
            if (fallback) {
                reportedBy = fallback.id;
            } else {
                // If no users exist yet (fresh install), we might need a dummy user or allow it to fail, 
                // but usually there's at least one admin. 
                // Alternatively, we could create a system user. 
                // For now, let's keep it as is or throw a better error.
                throw new Error("Cannot report wastage as super-admin: No real users exist in the database for attribution.");
            }
        }

        // 3. Create wastage record
        const wastage = await tx.stockWastage.create({
            data: {
                productId: data.productId,
                warehouseId: data.warehouseId,
                quantity: data.quantity,
                reason: data.reason,
                notes: data.notes,
                reportedBy: reportedBy,
            },
            include: { product: true },
        });

        // 4. Deduct from global stock
        await tx.product.update({
            where: { id: data.productId },
            data: { stock: { decrement: data.quantity } },
        });

        // 5. Deduct from warehouse stock  
        await tx.stock.update({
            where: {
                productId_warehouseId: {
                    productId: data.productId,
                    warehouseId: data.warehouseId,
                },
            },
            data: { quantity: { decrement: new Decimal(data.quantity) } },
        });

        const warehouse = await tx.warehouse.findUnique({
            where: { id: data.warehouseId },
            select: { branchId: true }
        });

        // 6. Create stock movement for audit trail
        await tx.stockMovement.create({
            data: {
                type: 'WASTAGE',
                productId: data.productId,
                fromWarehouseId: data.warehouseId,
                quantity: data.quantity,
                reason: `Wastage - ${data.reason}: ${data.notes || 'No notes'}`,
                branchId: warehouse?.branchId || null
            } as any,
        });

        // 7. Accounting Entry for Spoilage (B11)
        const totalCostDec = new Decimal(product.costPrice?.toString() || "0").times(data.quantity);
        if (totalCostDec.gt(0)) {
            const { AccountingEngine } = await import('@/lib/accounting/transaction-factory');
            await AccountingEngine.recordWastage({
                wastageId: wastage.id,
                amount: totalCostDec,
                description: `إهلاك مخزون (${product.name}) - ${data.reason}`,
                branchId: warehouse?.branchId || undefined
            }, tx);
        }

        return wastage;
    });

    revalidatePath('/inventory', 'page');
    revalidatePath('/pos', 'page');

    revalidateTag(CACHE_TAGS.INVENTORY);
    revalidateTag(CACHE_TAGS.PRODUCTS);
    revalidateTag('dashboard');

    return { success: true, wastage: result };
}, { permission: 'INVENTORY_EDIT' });

export const getPurchaseInvoices = secureAction(async (tabFilter?: 'ACTIVE' | 'ALL' | 'RETURNS') => {
    let whereClause: Prisma.PurchaseInvoiceWhereInput = {};
    if (tabFilter === 'ACTIVE') {
        whereClause = { 
            status: { notIn: ['CANCELLED', 'VOIDED', 'RETURNED', 'RETURN'] }, 
            voidedAt: null 
        };
    } else if (tabFilter === 'RETURNS') {
        whereClause = { 
            OR: [
                { isReturn: true },
                { status: { in: ['RETURN', 'RETURNED', 'PARTIAL_RETURN'] } },
                { voidedAt: { not: null } }
            ]
        };
    }

    const invoices = await prisma.purchaseInvoice.findMany({
        where: whereClause,
        orderBy: { purchaseDate: 'desc' },
        include: {
            supplier: { select: { name: true } },
            warehouse: {
                select: {
                    name: true,
                    branch: {
                        select: {
                            name: true,
                            code: true
                        }
                    }
                }
            }
        }
    });

    // Transform to match simplified interface if needed, or return as is 
    // The frontend expects specific fields, Prisma return should match cleanly
    return {
        data: invoices.map(inv => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            supplier: { name: inv.supplier.name },
            totalAmount: Number(inv.totalAmount),
            paidAmount: Number(inv.paidAmount),
            deliveryCharge: Number(inv.deliveryCharge),
            status: inv.status,
            paymentMethod: inv.paymentMethod,
            purchaseDate: inv.purchaseDate,
            warehouse: inv.warehouse ? {
                name: inv.warehouse.name,
                branch: inv.warehouse.branch ? {
                    name: inv.warehouse.branch.name,
                    code: inv.warehouse.branch.code
                } : undefined
            } : undefined
        }))
    };
}, { permission: 'INVENTORY_VIEW', requireCSRF: false });

// --- Bulk CSV Import ---

/**
 * Bulk import purchase invoices from CSV
 * Each invoice is processed in its own transaction for rollback safety
 */
export const bulkImportPurchases = secureAction(async (data: {
    invoices: Array<{
        supplier: string;
        invoiceNumber?: string;
        items: Array<{
            productSku: string;
            productName: string;
            category?: string;
            quantity: number;
            unitCost: number;
            sellPrice?: number;
            sellPrice2?: number;
            sellPrice3?: number;
        }>;
        deliveryCharge: number;
        paidAmount: number;
        paymentMethod: string;
        warehouse?: string;
    }>;
    csrfToken?: string;
}) => {
    const startTime = Date.now();
    const results = {
        total: data.invoices.length,
        successful: 0,
        failed: 0,
        successRating: 0,
        errors: [] as { invoice: string; error: string }[],
        gaps: [] as { type: 'SKU' | 'CATEGORY' | 'SUPPLIER' | 'SYSTEM', message: string, item?: string }[],
        createdInvoices: [] as string[],
        performance: {
            durationMs: 0,
            itemsProcessed: 0
        }
    };

    // 1. Extraction & Pre-Fetching (READ Phase)
    // ---------------------------------------------------------
    const allSkus = new Set<string>();
    const allCategories = new Set<string>();
    const allSupplierNames = new Set<string>();
    const allWarehouseNames = new Set<string>();

    let totalItems = 0;

    data.invoices.forEach(inv => {
        allSupplierNames.add(inv.supplier);
        if (inv.warehouse) allWarehouseNames.add(inv.warehouse);
        inv.items.forEach(item => {
            if (item.productSku) allSkus.add(item.productSku);
            if (item.category) allCategories.add(item.category);
            totalItems++;
        });
    });

    // Bulk Fetch Data
    const [existingProducts, existingCategories, existingSuppliers, existingWarehouses, defaultWarehouse] = await Promise.all([
        prisma.product.findMany({ where: { sku: { in: Array.from(allSkus) } } }),
        prisma.category.findMany({ where: { name: { in: Array.from(allCategories) } } }),
        prisma.supplier.findMany({ where: { name: { in: Array.from(allSupplierNames) } } }),
        prisma.warehouse.findMany({ where: { name: { in: Array.from(allWarehouseNames) } } }),
        prisma.warehouse.findFirst({ where: { isDefault: true } })
    ]);

    // Maps for O(1) Lookup
    const productMap = new Map(existingProducts.map(p => [p.sku, p]));
    const categoryMap = new Map(existingCategories.map(c => [c.name, c]));
    const supplierMap = new Map(existingSuppliers.map(s => [s.name, s]));
    const warehouseMap = new Map(existingWarehouses.map(w => [w.name, w]));

    // 2. Data Preparation (WRITE Phase - Pre-Transaction)
    // ---------------------------------------------------------

    // Create Missing Categories
    const missingCategories = Array.from(allCategories).filter(name => !categoryMap.has(name));
    if (missingCategories.length > 0) {
        await prisma.category.createMany({
            data: missingCategories.map(name => ({ name, color: '#6b7280' }))
        });

        const newCats = await prisma.category.findMany({ where: { name: { in: missingCategories } } });
        newCats.forEach(c => categoryMap.set(c.name, c));
    }

    // Create Missing Suppliers (BUG-07)
    const missingSuppliers = Array.from(allSupplierNames).filter(name => !supplierMap.has(name));
    if (missingSuppliers.length > 0) {
        await prisma.supplier.createMany({
            data: missingSuppliers.map(name => ({ name, balance: 0 }))
        });
        const newSuppliers = await prisma.supplier.findMany({ where: { name: { in: missingSuppliers } } });
        newSuppliers.forEach(s => supplierMap.set(s.name, s));
        
        results.gaps.push(...missingSuppliers.map(name => ({
            type: 'SUPPLIER' as const,
            message: `Auto-created missing supplier: '${name}'`,
            item: name
        })));
    }

    // Identify Missing Products for Batch Creation
    const productsToCreate: any[] = [];
    const processedNewSkus = new Set<string>();

    data.invoices.forEach(inv => {
        inv.items.forEach(item => {
            if (item.productSku && !productMap.has(item.productSku) && !processedNewSkus.has(item.productSku)) {
                let categoryId: string | null = null;
                if (item.category && categoryMap.has(item.category)) {
                    categoryId = categoryMap.get(item.category)!.id;
                }
                // Fallback to Uncategorized if needed or leave null
                if (!categoryId) {
                    const uncat = categoryMap.get('Uncategorized');
                    if (uncat) categoryId = uncat.id;
                }

                productsToCreate.push({
                    name: item.productName,
                    sku: item.productSku,
                    categoryId,
                    costPrice: item.unitCost,
                    sellPrice: item.sellPrice || 0,
                    sellPrice2: item.sellPrice2 || 0,
                    sellPrice3: item.sellPrice3 || 0,
                    stock: 0
                });
                processedNewSkus.add(item.productSku);
            }
        });
    });

    if (productsToCreate.length > 0) {
        // Ensure 'Uncategorized' exists if we rely on it
        const needsUncategorized = productsToCreate.some(p => !p.categoryId);
        if (needsUncategorized && !categoryMap.has('Uncategorized')) {
            const uncat = await prisma.category.create({ data: { name: 'Uncategorized', color: '#6b7280' } });
            categoryMap.set('Uncategorized', uncat);
            productsToCreate.forEach(p => { if (!p.categoryId) p.categoryId = uncat.id; });
        } else if (needsUncategorized) {
            const uncat = categoryMap.get('Uncategorized')!;
            productsToCreate.forEach(p => { if (!p.categoryId) p.categoryId = uncat.id; });
        }

        await prisma.product.createMany({
            data: productsToCreate
        });

        const createdProducts = await prisma.product.findMany({
            where: { sku: { in: productsToCreate.map(p => p.sku) } }
        });
        createdProducts.forEach(p => productMap.set(p.sku, p));
    }

    // 3. Invoice Execution (Transaction Per Invoice)
    // ---------------------------------------------------------

    for (const invoice of data.invoices) {
        try {
            const supplier = supplierMap.get(invoice.supplier);
            if (!supplier) {
                // Should never happen due to auto-creation above
                throw new Error(`Supplier '${invoice.supplier}' logic error.`);
            }

            let warehouseId = invoice.warehouse ? warehouseMap.get(invoice.warehouse)?.id : defaultWarehouse?.id;
            if (!warehouseId) throw new Error(`Default warehouse not found.`);

            const finalItems: any[] = [];
            for (const item of invoice.items) {
                const product = productMap.get(item.productSku);
                if (!product) {
                    results.gaps.push({ type: 'SKU', message: `SKU '${item.productSku}' could not be registered.`, item: item.productSku });
                    throw new Error(`Product SKU '${item.productSku}' failed logic.`);
                }
                finalItems.push({
                    productId: product.id,
                    quantity: item.quantity,
                    unitCost: item.unitCost,
                    sellPrice: item.sellPrice,
                    sellPrice2: item.sellPrice2,
                    sellPrice3: item.sellPrice3
                });
            }

            const subtotal = finalItems.reduce((acc: Decimal, i) => acc.plus(new Decimal(String(i.unitCost)).times(i.quantity)), new Decimal(0));
            const totalAmountDec = subtotal.plus(new Decimal(String(invoice.deliveryCharge)));
            const paidAmountDec = new Decimal(String(invoice.paidAmount));
            let status = "PENDING";
            if (paidAmountDec.gte(totalAmountDec)) status = "PAID";
            else if (paidAmountDec.gt(0)) status = "PARTIAL";

            await prisma.$transaction(async (tx) => {
                const newInvoice = await tx.purchaseInvoice.create({
                    data: {
                        supplierId: supplier.id,
                        invoiceNumber: invoice.invoiceNumber || `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                        warehouseId: warehouseId!,
                        totalAmount: totalAmountDec,
                        deliveryCharge: invoice.deliveryCharge,
                        paidAmount: invoice.paidAmount,
                        status,
                        paymentMethod: invoice.paymentMethod,
                        items: {
                            createMany: {
                                data: finalItems.map(i => ({
                                    productId: i.productId,
                                    quantity: i.quantity,
                                    unitCost: i.unitCost
                                }))
                            }
                        }
                    }
                });

                await tx.supplier.update({
                    where: { id: supplier.id },
                    data: { balance: { increment: totalAmountDec.minus(paidAmountDec) } }
                });

                // Parallel stock updates allowed here since they target different products usually
                await Promise.all(finalItems.map(async (item) => {
                    await tx.product.update({
                        where: { id: item.productId },
                        data: {
                            stock: { increment: item.quantity },
                            costPrice: item.unitCost,
                            ...(item.sellPrice ? { sellPrice: item.sellPrice } : {}),
                            ...(item.sellPrice2 ? { sellPrice2: item.sellPrice2 } : {}),
                            ...(item.sellPrice3 ? { sellPrice3: item.sellPrice3 } : {}),
                        }
                    });

                    await tx.stock.upsert({
                        where: { productId_warehouseId: { productId: item.productId, warehouseId: warehouseId! } },
                        update: { quantity: { increment: item.quantity } },
                        create: { productId: item.productId, warehouseId: warehouseId!, quantity: item.quantity }
                    });
                }));

                results.createdInvoices.push(newInvoice.id);
            }, {
                maxWait: 20000,
                timeout: 30000
            });

            results.successful++;

        } catch (error: any) {
            results.failed++;
            results.errors.push({
                invoice: invoice.invoiceNumber || 'Unknown',
                error: error.message
            });
            if (!results.gaps.some(g => g.message === error.message)) {
                results.gaps.push({
                    type: 'SYSTEM',
                    message: error.message,
                    item: invoice.invoiceNumber
                });
            }
        }
    }

    results.successRating = results.total > 0 ? (results.successful / results.total) * 100 : 0;
    results.performance.durationMs = Date.now() - startTime;
    results.performance.itemsProcessed = totalItems;

    revalidatePath('/inventory');
    revalidateTag(CACHE_TAGS.INVENTORY);
    revalidateTag(CACHE_TAGS.PRODUCTS);
    revalidateTag('dashboard');

    return {
        success: true,
        results
    };
}, { permission: 'INVENTORY_MANAGE' });
export const getProductPriceHistory = secureAction(async (productId: string) => {
    const history = await prisma.purchaseItem.findMany({
        where: { productId },
        take: 5,
        orderBy: { invoice: { createdAt: 'desc' } },
        include: {
            invoice: {
                include: { supplier: { select: { name: true } } }
            }
        }
    });

    return {
        success: true,
        history: history.map(h => ({
            id: h.id,
            date: h.invoice.createdAt,
            supplierName: h.invoice.supplier.name,
            unitCost: h.unitCost.toNumber(),
            invoiceNumber: h.invoice.invoiceNumber
        }))
    };
}, { permission: 'INVENTORY_VIEW' });

export const setDefaultWarehouse = secureAction(async (data: { warehouseId: string; branchId?: string; type?: 'pos' | 'maintenance'; csrfToken?: string }) => {
    const { warehouseId, branchId, type = 'pos' } = data;

    await prisma.$transaction(async (tx) => {
        if (type === 'maintenance') {
            // Unset existing maintenance default for this branch
            await tx.warehouse.updateMany({
                where: {
                    branchId: branchId || undefined,
                    isMaintenanceDefault: true
                },
                data: { isMaintenanceDefault: false }
            });
            // Set new maintenance default
            await tx.warehouse.update({
                where: { id: warehouseId },
                data: { isMaintenanceDefault: true }
            });
        } else {
            // Unset existing POS default for this branch
            await tx.warehouse.updateMany({
                where: {
                    branchId: branchId || undefined,
                    isDefault: true
                },
                data: { isDefault: false }
            });
            // Set new POS default
            await tx.warehouse.update({
                where: { id: warehouseId },
                data: { isDefault: true }
            });
        }
    });

    revalidatePath('/inventory', 'page');
    revalidatePath('/pos', 'page');
    revalidatePath('/settings', 'page');
    revalidatePath('/maintenance', 'page');

    return { success: true };
}, { permission: 'INVENTORY_MANAGE', requireCSRF: false });

// --- New Management Actions (Direct CRUD) ---

export const updateModel = secureAction(async (data: { id: string, name: string, categoryId: string, csrfToken?: string }) => {
    await prisma.model.update({
        where: { id: data.id },
        data: { 
            name: data.name.trim(),
            categoryId: data.categoryId
        }
    });
    revalidateTag(CACHE_TAGS.INVENTORY);
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

export const deleteModel = secureAction(async (data: { id: string, csrfToken?: string }) => {
    try {
        await prisma.model.delete({
            where: { id: data.id }
        });
    } catch (error: any) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
            throw new Error("لا يمكن حذف الموديل لأنه مرتبط بمنتجات حالية.");
        }
        throw error;
    }
    revalidateTag(CACHE_TAGS.INVENTORY);
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

export const updateAttribute = secureAction(async (data: { id: string, name: string, csrfToken?: string }) => {
    await prisma.attribute.update({
        where: { id: data.id },
        data: { name: data.name.trim() }
    });
    revalidateTag(CACHE_TAGS.INVENTORY);
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

export const deleteAttribute = secureAction(async (data: { id: string, csrfToken?: string }) => {
    try {
        await prisma.attribute.delete({
            where: { id: data.id }
        });
    } catch (error: any) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
            throw new Error("لا يمكن حذف هذه الصفة لأنها مرتبطة بمنتجات حالية.");
        }
        throw error;
    }
    revalidateTag(CACHE_TAGS.INVENTORY);
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

export const updateUnitOfMeasure = secureAction(async (data: { id: string } & z.infer<typeof unitOfMeasureSchema> & { csrfToken?: string }) => {
    const { id, ...updateData } = data;
    const validated = unitOfMeasureSchema.parse(updateData);
    await prisma.unitOfMeasure.update({
        where: { id },
        data: validated
    });
    revalidateTag(CACHE_TAGS.INVENTORY);
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

export const deleteUnitOfMeasure = secureAction(async (data: { id: string, csrfToken?: string }) => {
    try {
        await prisma.unitOfMeasure.delete({
            where: { id: data.id }
        });
    } catch (error: any) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
            throw new Error("لا يمكن حذف هذه الوحدة لأنها مرتبطة بمنتجات أو فواتير حالية.");
        }
        throw error;
    }
    revalidateTag(CACHE_TAGS.INVENTORY);
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

