'use server';

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from 'zod';
import { Decimal } from "@prisma/client/runtime/library";
import { AccountingEngine } from "@/lib/accounting/transaction-factory";
import { secureAction } from "@/lib/safe-action";

import { productSchema, supplierSchema, categorySchema, purchaseSchema } from "@/lib/validation/inventory";
import { CACHE_TAGS } from "@/lib/cache-keys";
import { logger } from "@/lib/logger";
import { AppError, ErrorCodes } from "@/lib/errors"; // Added import
import { getCurrentUser } from "./auth";
import { getTranslations } from "@/lib/i18n-mock";

// --- Suppliers ---

export const createSupplier = secureAction(async (data: z.infer<typeof supplierSchema>) => {
    const validated = supplierSchema.parse(data);

    if (validated.phone) {
        const { checkGlobalPhoneUniqueness } = await import('@/lib/phone-validation');
        const phoneCheck = await checkGlobalPhoneUniqueness(validated.phone, 'SUPPLIER');
        if (!phoneCheck.unique) {
            const t = await getTranslations('SystemMessages.Errors');

            // Try to find the actual supplier if it's a supplier duplicate
            let existingSupplier = null;
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

    const supplier = await prisma.supplier.create({
        data: validated,
    });

    revalidatePath("/inventory", 'page');
    return { success: true, supplier };
}, { permission: 'INVENTORY_MANAGE' });

export const updateSupplier = secureAction(async (id: string, data: z.infer<typeof supplierSchema>) => {
    const validated = supplierSchema.parse(data);

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

    await prisma.supplier.update({
        where: { id },
        data: validated
    });
    revalidatePath("/inventory", 'page');
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

export const deleteSupplier = secureAction(async (data: { id: string, csrfToken?: string }) => {
    await prisma.supplier.delete({ where: { id: data.id } });
    revalidatePath("/inventory", 'page');
    return { success: true };
}, { permission: 'INVENTORY_MANAGE', requireCSRF: false });

export const paySupplier = secureAction(async (supplierId: string, amount: number, method: string = "CASH") => {
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

    // 1. Create Payment Record
    await prisma.supplierPayment.create({
        data: {
            supplierId,
            amount: new Decimal(amount),
            method: method,
            notes: `Manual Payment - ${method}`
        }
    });

    // 2. Decrease Supplier Balance (Debt decreases when we pay)
    await prisma.supplier.update({
        where: { id: supplierId },
        data: {
            balance: {
                decrement: amount
            }
        }
    });

    // 3. Treasury Transaction (Money Out)
    // Only record cash/bank transactions if they affect our immediate treasury
    await prisma.transaction.create({
        data: {
            type: 'OUT',
            amount: new Decimal(amount),
            description: `Supplier Payment (${method})`,
            paymentMethod: method,
            treasuryId: defaultTreasuryId // 🔗 LINKED
        }
    });

    // 🆕 Update Treasury Balance (Real Money Movement)
    if (defaultTreasuryId) {
        await prisma.treasury.update({
            where: { id: defaultTreasuryId },
            data: { balance: { decrement: amount } }
        });
    }

    // --- Integrations ---
    try {
        // Map methods to GL Accounts
        // 1000 = Cash on Hand
        // 1010 = Bank / Transfer / Sadad
        const creditAccount = method === 'CASH' ? '1000' : '1010';
        const creditDesc = method === 'CASH' ? 'Cash' : 'Bank/Transfer';

        await AccountingEngine.recordTransaction({
            description: `Supplier Payment (${method}) - ${supplierId.substring(0, 8)}`,
            reference: supplierId,
            lines: [
                { accountCode: '2000', debit: amount, credit: 0, description: 'Accounts Payable' },
                { accountCode: creditAccount, debit: 0, credit: amount, description: creditDesc }
            ]
        });
    } catch (accErr) {
        console.error(accErr);
    }

    revalidatePath("/inventory", 'page');
    revalidatePath(`/inventory/suppliers/${supplierId}`, 'page');
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

// --- Products ---

export const createProduct = secureAction(async (data: z.infer<typeof productSchema>) => {
    const startTime = Date.now();
    const validated = productSchema.parse(data);

    // 1. Validate supplier exists
    // NOTE: This logic seems to be misplaced here. It refers to 'invoice.supplier' which is not defined in createProduct.
    // It might be intended for a 'bulkImportPurchases' function.
    // For now, it's commented out to maintain syntactical correctness.
    /*
    const supplier = await prisma.supplier.findFirst({
        where: { name: { equals: invoice.supplier } }
    });

    if (!supplier) {
        throw new Error(`Supplier "${invoice.supplier}" not found. Please create it first.`);
    }
    */

    // 2. Get or create default warehouse
    // NOTE: The original instruction had a malformed line here: "warehouseductData } = validated;"
    // It's corrected to "const { categoryId, ...productData } = validated;" which is the existing correct line.
    // Check SKU uniqueness
    const existing = await prisma.product.findUnique({
        where: { sku: data.sku }
    });

    if (existing) {
        const { getTranslations } = await import('@/lib/i18n-mock');
        const t = await getTranslations('SystemMessages.Errors');
        throw new AppError(ErrorCodes.VALIDATION_ERROR, t('skuExists'));
    }

    const { categoryId, ...productData } = validated;

    // TRANSACTION: Ensure Product + Stock are created together
    const product = await prisma.$transaction(async (tx) => {
        // 1. Create Product
        const newProduct = await tx.product.create({
            data: {
                ...productData,
                trackStock: validated.trackStock ?? true,
                ...(categoryId ? { category: { connect: { id: categoryId } } } : {})
            } as any
        });

        // 2. Initial Stock Logic
        // If stock > 0, we MUST assign it to a warehouse (Default)
        if (productData.stock > 0) {
            // Find or Create Default Warehouse
            let mainWarehouse = await tx.warehouse.findFirst({ where: { isDefault: true } });

            if (!mainWarehouse) {
                // Auto-seed default warehouse if missing (Critical fallback)
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

            // Create Stock Record
            await tx.stock.create({
                data: {
                    productId: newProduct.id,
                    warehouseId: mainWarehouse.id,
                    quantity: productData.stock
                }
            });

            // Optional: Log Movement for audit trail
            await tx.stockMovement.create({
                data: {
                    type: 'ADJUSTMENT',
                    productId: newProduct.id,
                    toWarehouseId: mainWarehouse.id,
                    quantity: productData.stock,
                    reason: 'Initial Stock'
                }
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
            duration: Date.now() - startTime,
        });
    }

    return product;
}, { permission: 'INVENTORY_MANAGE' });

export const updateProduct = secureAction(async (id: string, data: z.infer<typeof productSchema>) => {
    const startTime = Date.now();
    const validated = productSchema.parse(data);

    await prisma.product.update({
        where: { id },
        data: {
            ...validated,
            trackStock: validated.trackStock,
            // Handle potential undefineds if generic schema allows optional
        }
    });
    revalidatePath("/inventory", 'page');
    revalidatePath("/pos", 'page');
    revalidateTag(CACHE_TAGS.PRODUCTS);
    revalidateTag(CACHE_TAGS.INVENTORY);
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

export const deleteProduct = secureAction(async (id: string) => {
    try {
        await prisma.$transaction(async (tx) => {
            // Delete related Stock records first
            await tx.stock.deleteMany({
                where: { productId: id }
            });

            // Delete related StockMovement records
            await tx.stockMovement.deleteMany({
                where: { productId: id }
            });



            // Delete related StockWastage records
            await tx.stockWastage.deleteMany({
                where: { productId: id }
            });

            // Now delete the product
            await tx.product.delete({
                where: { id }
            });
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
        throw e;
    }
}, { permission: 'INVENTORY_MANAGE' });

// --- Categories ---

export const createCategory = secureAction(async (data: z.infer<typeof categorySchema>) => {
    const validated = categorySchema.parse(data);
    const category = await prisma.category.create({
        data: {
            name: validated.name,
            color: validated.color || "#06b6d4"
        }
    });
    revalidatePath('/inventory', 'page');
    revalidatePath('/pos', 'page');
    revalidateTag(CACHE_TAGS.CATEGORIES);
    revalidateTag("dashboard");
    return { success: true, category };
}, { permission: 'INVENTORY_MANAGE' });

export const updateCategory = secureAction(async (id: string, data: z.infer<typeof categorySchema>) => {
    const validated = categorySchema.parse(data);
    await prisma.category.update({
        where: { id },
        data: validated
    });
    revalidatePath('/inventory', 'page');
    revalidatePath('/pos', 'page');
    revalidateTag(CACHE_TAGS.CATEGORIES);
    revalidateTag("dashboard");
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

export const deleteCategory = secureAction(async (id: string) => {
    await prisma.category.delete({ where: { id } });
    revalidatePath('/inventory', 'page');
    revalidatePath('/pos', 'page');
    revalidateTag(CACHE_TAGS.CATEGORIES);
    revalidateTag("dashboard");
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

// --- Purchases ---

export const createPurchase = secureAction(async (data: z.infer<typeof purchaseSchema>) => {
    // 1. Pre-computation & Reads (Outside Transaction)
    const startTime = Date.now();
    const validated = purchaseSchema.parse(data);
    const { items, treasuryId, ...header } = validated;

    // Get User for audit/treasury
    const { getCurrentUser } = await import('./auth');
    const user = await getCurrentUser();

    // Calculate Totals
    const subtotal = items.reduce((acc: number, item) => acc + (item.quantity * item.unitCost), 0);
    const deliveryCharge = header.deliveryCharge || 0;
    const totalAmount = subtotal + deliveryCharge;
    const paidAmount = header.paidAmount || 0;

    let status = "PENDING";
    if (paidAmount >= totalAmount) status = "PAID";
    else if (paidAmount > 0) status = "PARTIAL";

    // Prepare Products Lookup (Batch Read)
    const skusToCheck = items.filter(i => !i.productId && i.sku).map(i => i.sku as string);
    const existingProducts = skusToCheck.length > 0
        ? await prisma.product.findMany({ where: { sku: { in: skusToCheck } } })
        : [];
    const existingProductMap = new Map(existingProducts.map(p => [p.sku, p]));

    // Prepare Warehouse ID
    let warehouseId = header.warehouseId;
    if (!warehouseId) {
        // Try to find default without transaction first
        const main = await prisma.warehouse.findFirst({ where: { isDefault: true } });
        if (main) warehouseId = main.id;
    }

    // 2. Transaction (Optimized Writes)
    await prisma.$transaction(async (tx) => {
        // A. Ensure Warehouse Exists (Rare write, okay to be serial)
        if (!warehouseId) {
            let defaultBranch = await tx.branch.findFirst();
            if (!defaultBranch) {
                defaultBranch = await tx.branch.create({
                    data: { name: "Main Store", code: "MAIN", type: "STORE" }
                });
            }
            const main = await tx.warehouse.create({
                data: {
                    name: "Main Store",
                    address: "Primary Location",
                    isDefault: true,
                    branchId: defaultBranch.id
                }
            });
            warehouseId = main.id;
        }

        // B. Resolve Item IDs (Create missing products in parallel)
        const productsToCreate: any[] = [];
        const processedItems: any[] = [];

        // Identify what needs creation
        for (const item of items) {
            let pid = item.productId;
            if (!pid && item.sku) {
                const existing = existingProductMap.get(item.sku);
                if (existing) {
                    pid = existing.id;
                } else {
                    // Queue for creation
                    productsToCreate.push({ ...item });
                    continue; // Skip adding to processed yet
                }
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
                        costPrice: item.unitCost,
                        sellPrice: item.sellPrice || 0,
                        sellPrice2: item.sellPrice2 || 0,
                        sellPrice3: item.sellPrice3 || 0,
                        stock: 0,
                        ...(item.categoryId ? { category: { connect: { id: item.categoryId } } } : {})
                    } as any
                })
            ));

            // Merge back
            createdProducts.forEach((p, idx) => {
                const originalItem = productsToCreate[idx];
                processedItems.push({ ...originalItem, productId: p.id });
            });
        }

        // C. Generate Invoice Number (Keep inside for sequence safety, but it's fast)
        let finalInvoiceNumber = header.invoiceNumber;
        if (!finalInvoiceNumber) {
            const lastInvoice = await tx.purchaseInvoice.findFirst({
                where: { invoiceNumber: { startsWith: 'P-' } },
                orderBy: { createdAt: 'desc' },
                select: { invoiceNumber: true } // Select only needed field
            });
            let nextSeq = 1;
            if (lastInvoice?.invoiceNumber) {
                const parts = lastInvoice.invoiceNumber.split('-');
                if (parts.length === 2 && !isNaN(parseInt(parts[1]))) {
                    nextSeq = parseInt(parts[1]) + 1;
                }
            }
            finalInvoiceNumber = `P-${nextSeq.toString().padStart(3, '0')}`;
        }

        // D. Create Invoice & Items
        // Note: Using nested createMany is faster than looping
        const invoice = await tx.purchaseInvoice.create({
            data: {
                supplierId: header.supplierId,
                invoiceNumber: finalInvoiceNumber,
                warehouseId: warehouseId!, // We ensured it exists
                totalAmount: totalAmount,
                deliveryCharge: deliveryCharge,
                paidAmount: paidAmount,
                status: status,
                paymentMethod: header.paymentMethod || "CASH",
                items: {
                    createMany: {
                        data: processedItems.map(i => ({
                            productId: i.productId,
                            quantity: i.quantity,
                            unitCost: i.unitCost
                        }))
                    }
                }
            }
        });

        // E. Update Supplier Balance
        await tx.supplier.update({
            where: { id: header.supplierId },
            data: { balance: { increment: totalAmount - paidAmount } }
        });

        // F. Record Payment (Optimized)
        if (paidAmount > 0) {
            await tx.supplierPayment.create({
                data: {
                    supplierId: header.supplierId,
                    amount: paidAmount,
                    method: header.paymentMethod || "CASH",
                    notes: `Invoice Payment #${finalInvoiceNumber}`
                }
            });

            // Treasury Logic
            if (user?.branchId || treasuryId) {
                // If explicit treasury given, use it. Otherwise fallback to branch default
                let treasury = null;
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
                            amount: new Decimal(paidAmount),
                            description: `Supplier Payment: Invoice #${finalInvoiceNumber}`,
                            paymentMethod: header.paymentMethod || "CASH",
                            treasuryId: treasury.id
                        }
                    });

                    await tx.treasury.update({
                        where: { id: treasury.id },
                        data: { balance: { decrement: paidAmount } }
                    });
                }
            }
        }

        // G. Stock Updates (PARALLEL & BATCHED)
        // 1. Sort items to prevent deadlocks (by productId)
        const sortedItems = [...processedItems].sort((a, b) => a.productId.localeCompare(b.productId));

        // 2. Prepare Stock Movements for Batch Insert
        const movementsData = sortedItems.map(item => ({
            type: 'PURCHASE',
            productId: item.productId,
            fromWarehouseId: null,
            toWarehouseId: warehouseId!,
            quantity: item.quantity,
            reason: `Purchase Invoice #${finalInvoiceNumber}`
        }));

        await tx.stockMovement.createMany({
            data: movementsData
        });

        // 3. Update Product & Warehouse Stock (Concurrent)
        // We use Promise.all for parallelism. Prisma handles connection pooling.
        await Promise.all([
            // Update Products
            ...sortedItems.map(item =>
                tx.product.update({
                    where: { id: item.productId },
                    data: {
                        stock: { increment: item.quantity },
                        costPrice: item.unitCost,
                        ...(item.sellPrice ? { sellPrice: item.sellPrice } : {}),
                        ...(item.sellPrice2 ? { sellPrice2: item.sellPrice2 } : {}),
                        ...(item.sellPrice3 ? { sellPrice3: item.sellPrice3 } : {})
                    }
                })
            ),
            // Update Warehouse Stock
            ...sortedItems.map(item =>
                tx.stock.upsert({
                    where: {
                        productId_warehouseId: {
                            productId: item.productId,
                            warehouseId: warehouseId!
                        }
                    },
                    update: { quantity: { increment: item.quantity } },
                    create: {
                        productId: item.productId,
                        warehouseId: warehouseId!,
                        quantity: item.quantity
                    }
                })
            )
        ]);

        // BL-10 fix: Accounting is inside the transaction with tx client.
        // Errors here will roll back inventory + supplier changes.
        await AccountingEngine.recordTransaction({
            description: `Purchase Invoice #${finalInvoiceNumber}`,
            reference: finalInvoiceNumber || 'PURCHASE',
            date: new Date(),
            lines: [
                { accountCode: '1200', debit: totalAmount, credit: 0, description: 'Inventory Asset' },
                { accountCode: '2000', debit: 0, credit: totalAmount, description: 'Accounts Payable' }
            ]
        }, tx); // ✅ tx passed: participates in same transaction

        if (paidAmount > 0) {
            const isCash = (header.paymentMethod || "CASH") === 'CASH';
            const creditAccount = isCash ? '1000' : '1010';
            await AccountingEngine.recordTransaction({
                description: `Payment for Invoice #${finalInvoiceNumber}`,
                reference: finalInvoiceNumber || 'PAYMENT',
                date: new Date(),
                lines: [
                    { accountCode: '2000', debit: paidAmount, credit: 0, description: 'Accounts Payable' },
                    { accountCode: creditAccount, debit: 0, credit: paidAmount, description: isCash ? 'Cash' : 'Bank' }
                ]
            }, tx); // ✅ tx passed
        }

    }, {
        maxWait: 5000,
        timeout: 20000 // Increased to 20s
    });

    const duration = Date.now() - startTime;
    logger.info("Purchase Created", { duration, itemsCount: items.length });

    revalidatePath("/inventory", 'page');
    revalidatePath("/pos", 'page');
    revalidatePath("/logs", 'page');
    revalidatePath("/reports", 'page');
    revalidateTag("dashboard");
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

export const updatePurchase = secureAction(async (id: string, data: z.infer<typeof purchaseSchema>) => {
    // 1. Pre-computation & Reads (Outside Transaction)
    const startTime = Date.now();
    const validated = purchaseSchema.parse(data);
    const { items, treasuryId, ...header } = validated;

    // Get User
    const { getCurrentUser } = await import('./auth');
    const user = await getCurrentUser();

    // Prepare Products Lookup (Batch Read)
    const skusToCheck = items.filter(i => !i.productId && i.sku).map(i => i.sku as string);
    const existingProducts = skusToCheck.length > 0
        ? await prisma.product.findMany({ where: { sku: { in: skusToCheck } } })
        : [];
    const existingProductMap = new Map(existingProducts.map(p => [p.sku, p]));

    // Prepare Warehouse ID (Reads)
    let warehouseId = header.warehouseId;
    if (!warehouseId) {
        const main = await prisma.warehouse.findFirst({ where: { isDefault: true } });
        if (main) warehouseId = main.id;
    }

    // 2. Transaction (Optimized Writes)
    await prisma.$transaction(async (tx) => {
        // Fetch Old Data
        const oldInvoice = await tx.purchaseInvoice.findUnique({
            where: { id },
            include: { items: true }
        });

        const t = await getTranslations('SystemMessages.Errors');

        if (!oldInvoice) throw new Error(t('notFound'));
        if (oldInvoice.status === 'VOIDED') throw new Error(t('voidedInvoice'));

        // REVERT STOCK (Parallel)
        // 1. Group by Product for Revert
        const revertItems = oldInvoice.items;
        await Promise.all([
            // Revert Global Stock
            ...revertItems.map(item =>
                tx.product.update({
                    where: { id: item.productId },
                    data: { stock: { decrement: item.quantity } }
                })
            ),
            // Revert Warehouse Stock
            ...(oldInvoice.warehouseId ? revertItems.map(item =>
                tx.stock.update({
                    where: { productId_warehouseId: { productId: item.productId, warehouseId: oldInvoice.warehouseId! } },
                    data: { quantity: { decrement: item.quantity } }
                })
            ) : [])
        ]);

        // Revert Supplier Balance
        const oldNet = oldInvoice.totalAmount.toNumber() - oldInvoice.paidAmount.toNumber();
        await tx.supplier.update({
            where: { id: oldInvoice.supplierId },
            data: { balance: { decrement: oldNet } }
        });

        // Delete Old Items (Batch)
        await tx.purchaseItem.deleteMany({ where: { purchaseInvoiceId: id } });

        // --- APPLY NEW ---

        // B. Resolve New Item IDs (Create missing products in parallel)
        const productsToCreate: any[] = [];
        const processedItems: any[] = [];

        for (const item of items) {
            let pid = item.productId;
            if (!pid && item.sku) {
                const existing = existingProductMap.get(item.sku);
                if (existing) {
                    pid = existing.id;
                } else {
                    productsToCreate.push({ ...item });
                    continue;
                }
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
                        ...(item.categoryId ? { category: { connect: { id: item.categoryId } } } : {})
                    } as any
                })
            ));

            createdProducts.forEach((p, idx) => {
                processedItems.push({ ...productsToCreate[idx], productId: p.id });
            });
        }

        // Calculate New Totals
        const subtotal = processedItems.reduce((acc, i) => acc + (i.quantity * i.unitCost), 0);
        const deliveryCharge = data.deliveryCharge || 0;
        const totalAmount = subtotal + deliveryCharge;
        const paidAmount = data.paidAmount || 0;
        let status = "PENDING";
        if (paidAmount >= totalAmount) status = "PAID";
        else if (paidAmount > 0) status = "PARTIAL";

        // Update Header & Create Items (Batch)
        await tx.purchaseInvoice.update({
            where: { id },
            data: {
                supplierId: data.supplierId,
                invoiceNumber: data.invoiceNumber,
                warehouseId: warehouseId || data.warehouseId, // Use resolved or provided
                totalAmount,
                deliveryCharge,
                paidAmount,
                status,
                paymentMethod: data.paymentMethod,
                items: {
                    createMany: {
                        data: processedItems.map(i => ({
                            productId: i.productId,
                            quantity: i.quantity,
                            unitCost: i.unitCost
                        }))
                    }
                }
            }
        });

        // E. Record Payment (Optimized)
        // If paidAmount increased or we need to record a new payment
        if (paidAmount > oldInvoice.paidAmount.toNumber()) {
            const diffAmount = paidAmount - oldInvoice.paidAmount.toNumber();

            await tx.supplierPayment.create({
                data: {
                    supplierId: data.supplierId,
                    amount: diffAmount,
                    method: data.paymentMethod || "CASH",
                    notes: `Update Invoice Payment #${data.invoiceNumber || id}`
                }
            });

            // Treasury Logic
            if (user?.branchId || treasuryId) {
                // If explicit treasury given, use it. Otherwise fallback to branch default
                let treasury = null;
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
                            amount: new Decimal(diffAmount),
                            description: `Supplier Payment: Update Invoice #${data.invoiceNumber || id}`,
                            paymentMethod: data.paymentMethod || "CASH",
                            treasuryId: treasury.id
                        }
                    });

                    await tx.treasury.update({
                        where: { id: treasury.id },
                        data: { balance: { decrement: diffAmount } }
                    });
                }
            }
        }

        // Update Supplier Balance
        await tx.supplier.update({
            where: { id: data.supplierId },
            data: { balance: { increment: totalAmount - paidAmount } }
        });

        // Re-Apply Stock (Parallel)
        const sortedItems = [...processedItems].sort((a, b) => a.productId.localeCompare(b.productId));
        const activeWhId = warehouseId || data.warehouseId || oldInvoice.warehouseId;

        await Promise.all([
            // Global Stock
            ...sortedItems.map(item =>
                tx.product.update({
                    where: { id: item.productId },
                    data: {
                        stock: { increment: item.quantity },
                        costPrice: item.unitCost,
                        ...(item.sellPrice ? { sellPrice: item.sellPrice } : {})
                    }
                })
            ),
            // Warehouse Stock
            ...(activeWhId ? sortedItems.map(item =>
                tx.stock.upsert({
                    where: { productId_warehouseId: { productId: item.productId, warehouseId: activeWhId } },
                    update: { quantity: { increment: item.quantity } },
                    create: { productId: item.productId, warehouseId: activeWhId, quantity: item.quantity }
                })
            ) : [])
        ]);

    });
    revalidatePath("/inventory", 'page');
    revalidatePath("/pos", 'page');
    revalidatePath("/logs", 'page');
    revalidatePath("/reports", 'page');
    revalidateTag(CACHE_TAGS.INVENTORY);
    revalidateTag("dashboard");
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

export const refundPurchase = secureAction(async (id: string, reason?: string, force: boolean = false) => {
    // Get current user for audit trail
    const { getCurrentUser } = await import('@/actions/auth');
    const user = await getCurrentUser();

    return await prisma.$transaction(async (tx) => {
        const invoice = await tx.purchaseInvoice.findUnique({
            where: { id },
            include: { items: true }
        });

        if (!invoice) throw new Error("Invoice not found");

        // Prevent refunding already voided invoices
        if (invoice.status === 'VOIDED') {
            throw new Error("Invoice is already voided");
        }

        // 🔴 CRITICAL FIX #2: Validate stock availability before voiding  
        for (const item of invoice.items) {
            const product = await tx.product.findUnique({
                where: { id: item.productId },
                select: { stock: true, name: true }
            });

            if (!product || product.stock < item.quantity) {
                const t = await getTranslations('SystemMessages.Errors');
                throw new Error(t('insufficientStockWarehouse', { item: product?.name || 'Unknown' }));
            }
        }

        // 🔴 CRITICAL FIX #3: Validate supplier balance to prevent negative balance
        const supplier = await tx.supplier.findUnique({
            where: { id: invoice.supplierId },
            select: { balance: true, name: true }
        });

        const netBalance = invoice.totalAmount.toNumber() - invoice.paidAmount.toNumber();

        if (supplier && supplier.balance.toNumber() < netBalance) {
            throw new Error(
                `Cannot void invoice: This would create a negative balance for ${supplier.name}. ` +
                `Current balance: $${supplier.balance.toNumber().toFixed(2)}, ` +
                `Attempting to deduct: $${netBalance.toFixed(2)}`
            );
        }

        // 1. Revert Stock (Reverse the purchase)
        for (const item of invoice.items) {
            const product = await tx.product.findUnique({
                where: { id: item.productId },
                select: { stock: true, name: true }
            });

            // If forcing and insufficient stock, only decrement what's available
            const actualDecrementQty = force && product
                ? Math.min(product.stock, item.quantity)
                : item.quantity;

            const stockDiscrepancy = item.quantity - actualDecrementQty;

            // Decrease global product stock
            await tx.product.update({
                where: { id: item.productId },
                data: { stock: { decrement: actualDecrementQty } }
            });

            // Decrease warehouse stock
            if (invoice.warehouseId) {
                const warehouseStock = await tx.stock.findUnique({
                    where: {
                        productId_warehouseId: {
                            productId: item.productId,
                            warehouseId: invoice.warehouseId
                        }
                    }
                });

                if (warehouseStock) {
                    const newQty = warehouseStock.quantity - item.quantity;
                    if (newQty <= 0) {
                        // Delete stock record if quantity becomes zero or negative
                        await tx.stock.delete({
                            where: { id: warehouseStock.id }
                        });
                    } else {
                        await tx.stock.update({
                            where: { id: warehouseStock.id },
                            data: { quantity: newQty }
                        });
                    }
                }
            }

            // Log the reversal
            await tx.stockMovement.create({
                data: {
                    type: 'ADJUSTMENT',
                    productId: item.productId,
                    fromWarehouseId: invoice.warehouseId,
                    quantity: item.quantity,
                    reason: `Purchase Invoice Voided #${invoice.invoiceNumber || invoice.id.slice(0, 8)}`
                }
            });
        }

        // 2. Revert Supplier Balance
        // netBalance already calculated above in validation
        await tx.supplier.update({
            where: { id: invoice.supplierId },
            data: { balance: { decrement: netBalance } }
        });

        // 3. Mark Invoice as VOIDED (Keep record, don't delete)
        await tx.purchaseInvoice.update({
            where: { id },
            data: {
                status: 'VOIDED',
                paidAmount: 0, // Reset paid amount since it's voided
                voidedAt: new Date(),
                voidedBy: user?.id || null,
                voidReason: reason || null,
            }
        });

        return { success: true };
    });
    revalidatePath("/inventory", 'page');
    revalidatePath("/pos", 'page');
    revalidatePath("/logs", 'page');
    revalidatePath("/reports", 'page');
    revalidateTag(CACHE_TAGS.INVENTORY);
    revalidateTag(CACHE_TAGS.PRODUCTS);
    revalidateTag("dashboard");
}, { permission: 'INVENTORY_MANAGE', requireCSRF: false });

// --- Stock Ops ---

export const transferStock = secureAction(async (data: {
    fromWarehouseId: string;
    toWarehouseId: string;
    items: { productId: string; quantity: number }[];
    reason?: string;
}) => {
    if (data.fromWarehouseId === data.toWarehouseId) {
        const t = await getTranslations('SystemMessages.Errors');
        throw new Error(t('transferSameWarehouse'));
    }

    await prisma.$transaction(async (tx) => {
        for (const item of data.items) {
            const sourceStock = await tx.stock.findUnique({
                where: { productId_warehouseId: { productId: item.productId, warehouseId: data.fromWarehouseId } }
            });
            if (!sourceStock || sourceStock.quantity < item.quantity) {
                const t = await getTranslations('SystemMessages.Errors');
                throw new Error(t('insufficientStockWarehouse', { item: item.productId }));
            }
            await tx.stock.update({
                where: { productId_warehouseId: { productId: item.productId, warehouseId: data.fromWarehouseId } },
                data: { quantity: { decrement: item.quantity } }
            });
            await tx.stock.upsert({
                where: { productId_warehouseId: { productId: item.productId, warehouseId: data.toWarehouseId } },
                update: { quantity: { increment: item.quantity } },
                create: { productId: item.productId, warehouseId: data.toWarehouseId, quantity: item.quantity }
            });
            await tx.stockMovement.create({
                data: {
                    type: 'TRANSFER',
                    productId: item.productId,
                    fromWarehouseId: data.fromWarehouseId,
                    toWarehouseId: data.toWarehouseId,
                    quantity: item.quantity,
                    reason: data.reason
                }
            });
        }
    });

    revalidatePath("/inventory", 'page');
    revalidatePath("/pos", 'page');
    revalidateTag(CACHE_TAGS.INVENTORY);
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

export const adjustStock = secureAction(async (data: {
    productId: string;
    warehouseId: string;
    newQuantity: number;
    reason: string;
    csrfToken?: string;
}) => {
    await prisma.$transaction(async (tx) => {
        // 1. Get Old Quantity for Logic/Logging
        const currentStock = await tx.stock.findUnique({
            where: { productId_warehouseId: { productId: data.productId, warehouseId: data.warehouseId } }
        });
        const oldQty = currentStock?.quantity || 0;
        const delta = data.newQuantity - oldQty;

        if (delta === 0) return; // No change

        // 2. Set Warehouse Stock (One Source of Truth)
        await tx.stock.upsert({
            where: { productId_warehouseId: { productId: data.productId, warehouseId: data.warehouseId } },
            update: { quantity: data.newQuantity },
            create: { productId: data.productId, warehouseId: data.warehouseId, quantity: data.newQuantity }
        });

        // 3. Log Movement
        await tx.stockMovement.create({
            data: {
                type: 'ADJUSTMENT',
                productId: data.productId,
                fromWarehouseId: data.warehouseId,
                quantity: Math.abs(delta),
                reason: `${data.reason} (Count: ${oldQty} -> ${data.newQuantity})`
            }
        });

        // 4. Recalculate Global Product Stock (Sum of all Warehouses)
        // This prevents drift because it doesn't rely on 'previous global + delta', but on 'sum(actuals)'
        const aggregation = await tx.stock.aggregate({
            where: { productId: data.productId },
            _sum: { quantity: true }
        });
        const trueTotal = aggregation._sum.quantity || 0;

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

    // Check if HQ user
    const isHQUser = user.role === 'ADMIN' ||
        user.role === 'Manager' ||
        user.branchType === 'CENTER';

    const warehouses = await prisma.warehouse.findMany({
        where: isHQUser ? {} : { branchId: user.branchId || '' },
        include: { branch: true },
        orderBy: { isDefault: 'desc' }
    });

    return { data: warehouses, isHQUser };
}, { requireCSRF: false });

export const getWarehousesByBranch = secureAction(async (branchId: string) => {
    const warehouses = await prisma.warehouse.findMany({
        where: { branchId },
        include: { branch: true },
        orderBy: { name: 'asc' }
    });
    return { success: true, data: warehouses };
}, { requireCSRF: false });

export const getWarehouseStock = secureAction(async (warehouseId: string) => {
    const stock = await prisma.stock.findMany({
        where: { warehouseId },
        include: { product: true },
        orderBy: { product: { name: 'asc' } }
    });

    const mapped = stock.map(s => ({
        id: s.id,
        productId: s.productId,
        name: s.product.name,
        sku: s.product.sku,
        quantity: s.quantity,
        unitCost: Number(s.product.costPrice),
        sellPrice: Number(s.product.sellPrice)
    }));

    return { success: true, data: mapped };
}, { requireCSRF: false });

// ... WarehouseStock ...

export const getPurchase = secureAction(async (id: string) => {
    const purchase = await prisma.purchaseInvoice.findUnique({
        where: { id },
        include: {
            items: { include: { product: true } },
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

    await prisma.warehouse.create({
        data: {
            name: data.name,
            address: data.address || null,
            branchId: targetBranchId,
            isDefault: false
        }
    });

    revalidatePath("/inventory");
    revalidatePath(`/branches/${targetBranchId}/warehouses`);
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

export const generateNextSku = secureAction(async (options?: {
    prefix?: string;
    length?: number;
    existingSKUs?: string[]; // Client-side cart SKUs to avoid duplicates
}) => {
    // Default configuration: SKU-000001 format
    const prefix = options?.prefix || 'SKU';
    const length = options?.length || 6;

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

export const getProducts = secureAction(async (params: { search?: string; page?: number; limit?: number } = {}) => {
    const page = params.page || 1;
    const limit = params.limit || 50;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {};
    if (params.search) {
        where.OR = [
            { name: { contains: params.search } },
            { sku: { contains: params.search } }
        ];
    }

    const [products, total] = await Promise.all([
        prisma.product.findMany({
            where,
            skip,
            take: limit,
            orderBy: { name: 'asc' }
        }),
        prisma.product.count({ where })
    ]);

    return {
        success: true,
        data: products.map(p => ({
            ...p,
            costPrice: p.costPrice.toNumber(),
            sellPrice: p.sellPrice.toNumber(),
            sellPrice2: p.sellPrice2.toNumber(),
            sellPrice3: p.sellPrice3.toNumber(),
            createdAt: p.createdAt.toISOString(),
            updatedAt: p.updatedAt.toISOString(),
            deletedAt: p.deletedAt ? p.deletedAt.toISOString() : null,
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
            select: { id: true, name: true, sku: true, stock: true }
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

        if (!warehouseStock || warehouseStock.quantity < data.quantity) {
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

        // 3. Create wastage record
        const wastage = await tx.stockWastage.create({
            data: {
                productId: data.productId,
                warehouseId: data.warehouseId,
                quantity: data.quantity,
                reason: data.reason,
                notes: data.notes,
                reportedBy: user.id,
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
            data: { quantity: { decrement: data.quantity } },
        });

        // 6. Create stock movement for audit trail
        await tx.stockMovement.create({
            data: {
                type: 'WASTAGE',
                productId: data.productId,
                fromWarehouseId: data.warehouseId,
                quantity: data.quantity,
                reason: `Wastage - ${data.reason}: ${data.notes || 'No notes'}`,
            },
        });

        return wastage;
    });

    revalidatePath('/inventory', 'page');
    revalidatePath('/pos', 'page');

    revalidateTag(CACHE_TAGS.INVENTORY);
    revalidateTag(CACHE_TAGS.PRODUCTS);
    revalidateTag('dashboard');

    return { success: true, wastage: result };
}, { permission: 'INVENTORY_EDIT' });

export const getPurchaseInvoices = secureAction(async () => {
    const invoices = await prisma.purchaseInvoice.findMany({
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

        // Re-fetch to get IDs
        const newCats = await prisma.category.findMany({ where: { name: { in: missingCategories } } });
        newCats.forEach(c => categoryMap.set(c.name, c));
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
                results.gaps.push({ type: 'SUPPLIER', message: `Supplier '${invoice.supplier}' not found.`, item: invoice.supplier });
                throw new Error(`Supplier '${invoice.supplier}' not found.`);
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

            const subtotal = finalItems.reduce((acc, i) => acc + (i.quantity * i.unitCost), 0);
            const totalAmount = subtotal + invoice.deliveryCharge;
            let status = "PENDING";
            if (invoice.paidAmount >= totalAmount) status = "PAID";
            else if (invoice.paidAmount > 0) status = "PARTIAL";

            await prisma.$transaction(async (tx) => {
                const newInvoice = await tx.purchaseInvoice.create({
                    data: {
                        supplierId: supplier.id,
                        invoiceNumber: invoice.invoiceNumber || `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                        warehouseId: warehouseId!,
                        totalAmount,
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
                    data: { balance: { increment: totalAmount - invoice.paidAmount } }
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
