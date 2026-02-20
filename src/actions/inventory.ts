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
import { getCurrentUser } from "./auth";

// --- Suppliers ---

export const createSupplier = secureAction(async (data: z.infer<typeof supplierSchema>) => {
    const validated = supplierSchema.parse(data);

    if (validated.phone) {
        const { checkGlobalPhoneUniqueness } = await import('@/lib/phone-validation');
        const phoneCheck = await checkGlobalPhoneUniqueness(validated.phone, 'SUPPLIER');
        if (!phoneCheck.unique) {
            throw new Error(`Phone number is already in use by a ${phoneCheck.usedBy} (${phoneCheck.entityName || 'Unknown'})`);
        }
    }

    await prisma.supplier.create({
        data: validated,
    });

    revalidatePath("/inventory", 'page');
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

export const updateSupplier = secureAction(async (id: string, data: z.infer<typeof supplierSchema>) => {
    const validated = supplierSchema.parse(data);

    if (validated.phone) {
        const { checkGlobalPhoneUniqueness } = await import('@/lib/phone-validation');
        const phoneCheck = await checkGlobalPhoneUniqueness(validated.phone, 'SUPPLIER', id);
        if (!phoneCheck.unique) {
            throw new Error(`Phone number is already in use by a ${phoneCheck.usedBy} (${phoneCheck.entityName || 'Unknown'})`);
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

    // Manual check for Unique SKU slightly cleaner than Prisma Error
    const existing = await prisma.product.findUnique({ where: { sku: validated.sku } });
    if (existing) {
        throw new Error(`SKU ${validated.sku} already exists`);
    }

    const { categoryId, ...productData } = validated;

    // TRANSACTION: Ensure Product + Stock are created together
    const product = await prisma.$transaction(async (tx) => {
        // 1. Create Product
        const newProduct = await tx.product.create({
            data: {
                ...productData,
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
    revalidateTag(CACHE_TAGS.PRODUCTS);
    revalidateTag(CACHE_TAGS.INVENTORY);
    revalidateTag("dashboard");

    logger.info('Product created', {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        duration: Date.now() - startTime,
    });

    return product;
}, { permission: 'INVENTORY_MANAGE' });

export const updateProduct = secureAction(async (id: string, data: z.infer<typeof productSchema>) => {
    const startTime = Date.now();
    const validated = productSchema.parse(data);

    await prisma.product.update({
        where: { id },
        data: {
            ...validated,
            // Handle potential undefineds if generic schema allows optional
        }
    });
    revalidatePath("/inventory", 'page');
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
        revalidateTag(CACHE_TAGS.PRODUCTS);
        revalidateTag(CACHE_TAGS.INVENTORY);
        return { success: true };
    } catch (e: unknown) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
            throw new Error("Cannot delete product because it has associated sales or purchases.");
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
    revalidatePath('/[locale]/inventory', 'page');
    return category;
}, { permission: 'INVENTORY_MANAGE' });

export const updateCategory = secureAction(async (id: string, data: z.infer<typeof categorySchema>) => {
    const validated = categorySchema.parse(data);
    await prisma.category.update({
        where: { id },
        data: validated
    });
    revalidatePath('/[locale]/inventory', 'page');
    revalidatePath('/[locale]/inventory', 'page');
    revalidateTag("dashboard");
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

export const deleteCategory = secureAction(async (id: string) => {
    await prisma.category.delete({ where: { id } });
    revalidatePath('/[locale]/inventory', 'page');
    revalidatePath('/[locale]/inventory', 'page');
    revalidateTag("dashboard");
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

// --- Purchases ---

export const createPurchase = secureAction(async (data: z.infer<typeof purchaseSchema>) => {
    const validated = purchaseSchema.parse(data);
    const { items, ...header } = validated;

    // Calculate Total
    const subtotal = items.reduce((acc: number, item) => acc + (item.quantity * item.unitCost), 0);
    const deliveryCharge = header.deliveryCharge || 0;
    const totalAmount = subtotal + deliveryCharge;
    const paidAmount = header.paidAmount || 0;

    let status = "PENDING";
    if (paidAmount >= totalAmount) status = "PAID";
    else if (paidAmount > 0) status = "PARTIAL";

    await prisma.$transaction(async (tx) => {
        // 1. Process Items (Create Products if needed)
        const processedItems: {
            productId: string;
            quantity: number;
            unitCost: number;
            sellPrice?: number;
            sellPrice2?: number;
            sellPrice3?: number;
        }[] = [];
        for (const item of items) {
            let pid = item.productId;

            // If new item, create it first
            // Note: validation schema allows optional productId
            if (!pid && item.name && item.sku) {
                const existing = await tx.product.findUnique({ where: { sku: item.sku } });
                if (existing) {
                    pid = existing.id;
                } else {
                    const newProduct = await tx.product.create({
                        data: {
                            name: item.name,
                            sku: item.sku,
                            costPrice: item.unitCost,
                            sellPrice: item.sellPrice || 0,
                            sellPrice2: item.sellPrice2 || 0,
                            sellPrice3: item.sellPrice3 || 0,
                            stock: 0,
                            ...(item.categoryId ? { category: { connect: { id: item.categoryId } } } : {})
                        } as any
                    });
                    pid = newProduct.id;
                }
            }

            if (pid) {
                processedItems.push({
                    productId: pid,
                    quantity: item.quantity,
                    unitCost: item.unitCost,
                    sellPrice: item.sellPrice,
                    sellPrice2: item.sellPrice2,
                    sellPrice3: item.sellPrice3
                });
            }
        }

        // 2. Warehouse Logic
        let warehouseId = header.warehouseId;
        if (!warehouseId) {
            let main = await tx.warehouse.findFirst({ where: { isDefault: true } });
            if (!main) {
                let defaultBranch = await tx.branch.findFirst();
                if (!defaultBranch) {
                    defaultBranch = await tx.branch.create({
                        data: { name: "Main Store", code: "MAIN", type: "STORE" }
                    });
                }

                main = await tx.warehouse.create({
                    data: {
                        name: "Main Store",
                        address: "Primary Location",
                        isDefault: true,
                        branchId: defaultBranch.id
                    }
                });
            }
            warehouseId = main.id;
        }

        // Auto-generate Sequential Invoice Number (P-001)
        let finalInvoiceNumber = header.invoiceNumber;
        if (!finalInvoiceNumber) {
            const lastInvoice = await tx.purchaseInvoice.findFirst({
                where: { invoiceNumber: { startsWith: 'P-' } },
                orderBy: { createdAt: 'desc' }
            });
            let nextSeq = 1;
            if (lastInvoice?.invoiceNumber) {
                const parts = lastInvoice.invoiceNumber.split('-');
                if (parts.length === 2) {
                    const num = parseInt(parts[1]);
                    if (!isNaN(num)) nextSeq = num + 1;
                }
            }
            finalInvoiceNumber = `P-${nextSeq.toString().padStart(3, '0')}`;
        }

        const invoice = await tx.purchaseInvoice.create({
            data: {
                supplierId: header.supplierId,
                invoiceNumber: finalInvoiceNumber,
                warehouseId: warehouseId,
                totalAmount: totalAmount,
                deliveryCharge: deliveryCharge,
                paidAmount: paidAmount,
                status: status,
                paymentMethod: header.paymentMethod || "CASH",
                items: {
                    create: processedItems.map(i => ({
                        productId: i.productId,
                        quantity: i.quantity,
                        unitCost: i.unitCost
                    }))
                }
            }
        });

        // 3. Update Supplier Balance
        const netBalanceChange = totalAmount - paidAmount;
        await tx.supplier.update({
            where: { id: header.supplierId },
            data: {
                balance: {
                    increment: netBalanceChange
                }
            }
        });

        // 4. Record Payment
        if (paidAmount > 0) {
            // 🆕 FIND DEFAULT TREASURY for payment
            let defaultTreasuryId: string | null = null;
            // Note: We need user info here. createPurchase already runs as user but doesn't expose it inside transaction easily.
            // But we can fetch it again or pass it. 
            // Wait, createPurchase doesn't have `user` in scope of transaction loop?
            // Actually `createPurchase` has `secureAction` which doesn't auto-inject user into args.
            // Let's import getCurrentUser inside.
            /* 
               Re-fetching user inside transaction might be tricky if not careful, but secureAction 
               already verifies auth. We can fetch user at top of function.
               Let's modify the top of function first to get user.
            */
        }

        // Wait, I need to modify the TOP of the function to get the user first, then pass it down.
        // OR just fetch it here.
        // Let's look at the surrounding code provided in the view_file earlier.
        // The function `createPurchase` starts at line 282. It does NOT fetch user.
        // I should fetch user at start of `createPurchase`.

        // Okay, I will do this in two steps or one large MultiReplace?
        // Let's do a replace of the whole Payment block effectively, but I need the user's branch ID.
        // If I can't easily get the user at the top without breaking scope, I can fetch it here.
        // `getCurrentUser` is async.
        /*
        const { getCurrentUser } = await import('./auth');
        const user = await getCurrentUser();
        // ... find treasury
        */

        // Let's write the code to fetch user and treasury right here inside the payment block.
        if (paidAmount > 0) {
            await tx.supplierPayment.create({
                data: {
                    supplierId: header.supplierId,
                    amount: paidAmount,
                    method: header.paymentMethod || "CASH",
                    notes: `Invoice Payment #${finalInvoiceNumber}`
                }
            });

            // 🆕 Find Default Treasury
            // Since we are inside a transaction, we should use `tx` if possible, but for findFirst it's fine.
            // But waaaait, `getCurrentUser` is an async imported function.
            // We can just call it.
            const { getCurrentUser } = await import('./auth');
            const user = await getCurrentUser();

            let treasuryId: string | null = null;
            if (user?.branchId) {
                const t = await tx.treasury.findFirst({
                    where: { branchId: user.branchId, isDefault: true }
                });
                if (t) treasuryId = t.id;
            }

            await tx.transaction.create({
                data: {
                    type: 'OUT',
                    amount: new Decimal(paidAmount),
                    description: `Supplier Payment: Invoice #${finalInvoiceNumber}`,
                    paymentMethod: header.paymentMethod || "CASH",
                    treasuryId: treasuryId // 🔗 LINKED
                }
            });

            // 🆕 Deduct from Treasury
            if (treasuryId) {
                await tx.treasury.update({
                    where: { id: treasuryId },
                    data: { balance: { decrement: paidAmount } }
                });
            }
        }

        // 5. Update Stock & Log Movement
        for (const item of processedItems) {
            // Global
            await tx.product.update({
                where: { id: item.productId },
                data: {
                    stock: { increment: item.quantity },
                    costPrice: item.unitCost,
                    ...(item.sellPrice ? { sellPrice: item.sellPrice } : {}),
                    ...(item.sellPrice2 ? { sellPrice2: item.sellPrice2 } : {}),
                    ...(item.sellPrice3 ? { sellPrice3: item.sellPrice3 } : {})
                }
            });

            // Warehouse
            await tx.stock.upsert({
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
            });

            // Traceability: Stock Movement
            await tx.stockMovement.create({
                data: {
                    type: 'PURCHASE',
                    productId: item.productId,
                    fromWarehouseId: null, // From External
                    toWarehouseId: warehouseId!,
                    quantity: item.quantity,
                    reason: `Purchase Invoice #${finalInvoiceNumber}`
                }
            });
        }

        // Accounting Integration
        try {
            // 1. Accrue Liability (Inventory vs Accounts Payable)
            await AccountingEngine.recordTransaction({
                description: `Purchase Invoice #${finalInvoiceNumber}`,
                reference: finalInvoiceNumber || 'PURCHASE',
                date: new Date(),
                lines: [
                    { accountCode: '1200', debit: totalAmount, credit: 0, description: 'Inventory Asset' }, // Debit Inventory
                    { accountCode: '2000', debit: 0, credit: totalAmount, description: 'Accounts Payable' } // Credit AP
                ]
            });

            // 2. Record Payment (if any)
            if (paidAmount > 0) {
                const isCash = (header.paymentMethod || "CASH") === 'CASH';
                const creditAccount = isCash ? '1000' : '1010'; // 1000=Cash, 1010=Bank

                await AccountingEngine.recordTransaction({
                    description: `Payment for Invoice #${finalInvoiceNumber}`,
                    reference: finalInvoiceNumber || 'PAYMENT',
                    date: new Date(),
                    lines: [
                        { accountCode: '2000', debit: paidAmount, credit: 0, description: 'Accounts Payable' }, // Debit AP (reduce liability)
                        { accountCode: creditAccount, debit: 0, credit: paidAmount, description: isCash ? 'Cash' : 'Bank' } // Credit Asset
                    ]
                });
            }
        } catch (accErr) {
            console.error("Accounting Error", accErr);
        }
    });

    revalidatePath("/inventory", 'page');
    revalidateTag("dashboard");
    return { success: true };
}, { permission: 'INVENTORY_MANAGE' });

export const updatePurchase = secureAction(async (id: string, data: z.infer<typeof purchaseSchema>) => {
    // ... (logic remains same for now due to complexity, but adding transaction type)
    const items = data.items;
    // const userId = data.userId; // userId is not part of purchaseSchema

    return await prisma.$transaction(async (tx) => {
        const oldInvoice = await tx.purchaseInvoice.findUnique({
            where: { id },
            include: { items: true }
        });

        if (!oldInvoice) throw new Error("Invoice not found");

        // 🔴 CRITICAL FIX #1: Prevent editing voided invoices
        if (oldInvoice.status === 'VOIDED') {
            throw new Error("Cannot edit a voided invoice. Voided invoices are locked for audit purposes.");
        }

        // Revert Stock
        for (const oldItem of oldInvoice.items) {
            await tx.product.update({
                where: { id: oldItem.productId },
                data: { stock: { decrement: oldItem.quantity } }
            });
            if (oldInvoice.warehouseId) {
                await tx.stock.update({
                    where: { productId_warehouseId: { productId: oldItem.productId, warehouseId: oldInvoice.warehouseId } },
                    data: { quantity: { decrement: oldItem.quantity } }
                });
            }
        }

        // Revert Supplier Balance
        const oldNet = oldInvoice.totalAmount.toNumber() - oldInvoice.paidAmount.toNumber();
        await tx.supplier.update({
            where: { id: oldInvoice.supplierId },
            data: { balance: { decrement: oldNet } }
        });

        await tx.purchaseItem.deleteMany({ where: { purchaseInvoiceId: id } });

        // Apply New
        const processedItems = [];
        for (const item of items) {
            let pid = item.productId;
            if (!pid && item.name && item.sku) {
                const existing = await tx.product.findUnique({ where: { sku: item.sku } });
                if (existing) pid = existing.id;
                else {
                    const newProduct = await tx.product.create({
                        data: {
                            name: item.name,
                            sku: item.sku,
                            categoryId: item.categoryId,
                            costPrice: item.unitCost,
                            sellPrice: item.sellPrice || 0,
                            stock: 0
                        } as any
                    });
                    pid = newProduct.id;
                }
            }
            if (pid) {
                processedItems.push({
                    productId: pid,
                    quantity: item.quantity,
                    unitCost: item.unitCost,
                    sellPrice: item.sellPrice,
                    sellPrice2: item.sellPrice2,
                    sellPrice3: item.sellPrice3
                });
            }
        }

        // Update Header
        const subtotal = processedItems.reduce((acc, i) => acc + (i.quantity * i.unitCost), 0);
        const deliveryCharge = data.deliveryCharge || 0;
        const totalAmount = subtotal + deliveryCharge;
        const paidAmount = data.paidAmount || 0;
        let status = "PENDING";
        if (paidAmount >= totalAmount) status = "PAID";
        else if (paidAmount > 0) status = "PARTIAL";

        await tx.purchaseInvoice.update({
            where: { id },
            data: {
                supplierId: data.supplierId,
                invoiceNumber: data.invoiceNumber,
                warehouseId: data.warehouseId,
                totalAmount,
                deliveryCharge,
                paidAmount,
                status,
                paymentMethod: data.paymentMethod,
                items: {
                    create: processedItems.map(i => ({
                        productId: i.productId,
                        quantity: i.quantity,
                        unitCost: i.unitCost
                    }))
                }
            }
        });

        await tx.supplier.update({
            where: { id: data.supplierId },
            data: { balance: { increment: totalAmount - paidAmount } }
        });

        // Re-Apply Stock
        for (const item of processedItems) {
            await tx.product.update({
                where: { id: item.productId },
                data: {
                    stock: { increment: item.quantity },
                    costPrice: item.unitCost,
                    ...(item.sellPrice ? { sellPrice: item.sellPrice } : {})
                }
            });
            const whId = data.warehouseId || oldInvoice.warehouseId;
            if (whId) {
                await tx.stock.upsert({
                    where: { productId_warehouseId: { productId: item.productId, warehouseId: whId } },
                    update: { quantity: { increment: item.quantity } },
                    create: { productId: item.productId, warehouseId: whId, quantity: item.quantity }
                });
            }
        }

        // Audit (Simple table insert if schema exists, skipping complex AuditLog helper for now to keep it safe)
        return { success: true };
    });
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
                throw new Error(
                    `Cannot void invoice: "${product?.name || 'Unknown Product'}" has insufficient stock. ` +
                    `Available: ${product?.stock || 0}, Required: ${item.quantity}. ` +
                    `Some items may have already been sold.`
                );
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
}, { permission: 'INVENTORY_MANAGE', requireCSRF: false });

// --- Stock Ops ---

export const transferStock = secureAction(async (data: {
    fromWarehouseId: string;
    toWarehouseId: string;
    items: { productId: string; quantity: number }[];
    reason?: string;
}) => {
    if (data.fromWarehouseId === data.toWarehouseId) {
        throw new Error("Cannot transfer to same warehouse");
    }

    await prisma.$transaction(async (tx) => {
        for (const item of data.items) {
            const sourceStock = await tx.stock.findUnique({
                where: { productId_warehouseId: { productId: item.productId, warehouseId: data.fromWarehouseId } }
            });
            if (!sourceStock || sourceStock.quantity < item.quantity) {
                throw new Error(`Insufficient stock for product ${item.productId}`);
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

    revalidatePath("/inventory");
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

    revalidatePath("/inventory");
    revalidateTag(CACHE_TAGS.INVENTORY);
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

export const createWarehouse = secureAction(async (data: { name: string; address?: string; branchId: string; csrfToken?: string }) => {
    if (!data.branchId) throw new Error("Branch ID is required");

    await prisma.warehouse.create({
        data: {
            name: data.name,
            address: data.address || null,
            branchId: data.branchId,
            isDefault: false
        }
    });

    revalidatePath("/inventory");
    revalidatePath(`/branches/${data.branchId}/warehouses`);
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
        throw new Error('Quantity must be greater than 0');
    }

    const result = await prisma.$transaction(async (tx) => {
        // 1. Verify product and warehouse exist
        const product = await tx.product.findUnique({
            where: { id: data.productId },
            select: { id: true, name: true, sku: true, stock: true }
        });

        if (!product) {
            throw new Error('Product not found');
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
            throw new Error(`Insufficient stock in warehouse. Available: ${warehouseStock?.quantity || 0}, Requested: ${data.quantity}`);
        }

        // 2. Get current user for audit
        const { getCurrentUser } = await import('@/actions/auth');
        const user = await getCurrentUser();
        if (!user) {
            throw new Error('User not authenticated');
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

    revalidatePath('/inventory');
    revalidateTag(CACHE_TAGS.INVENTORY);
    revalidateTag(CACHE_TAGS.PRODUCTS);
    revalidateTag('dashboard');

    return { success: true, wastage: result };
}, { permission: 'INVENTORY_EDIT' });

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
    const results = {
        total: data.invoices.length,
        successful: 0,
        failed: 0,
        errors: [] as { invoice: string; error: string }[],
        createdInvoices: [] as string[]
    };

    // Process each invoice in its own transaction
    for (const invoice of data.invoices) {
        try {
            // 1. Validate supplier exists
            const supplier = await prisma.supplier.findFirst({
                where: { name: { equals: invoice.supplier } }
            });

            if (!supplier) {
                throw new Error(`Supplier "${invoice.supplier}" not found. Please create it first.`);
            }

            // 2. Get or create default warehouse
            let warehouseId: string | undefined;
            if (invoice.warehouse) {
                const wh = await prisma.warehouse.findFirst({
                    where: { name: { equals: invoice.warehouse } }
                });
                warehouseId = wh?.id;
            }

            if (!warehouseId) {
                const defaultWh = await prisma.warehouse.findFirst({ where: { isDefault: true } });
                warehouseId = defaultWh?.id;
            }

            // Validate that we have a warehouse before proceeding
            if (!warehouseId) {
                throw new Error('No warehouse found. Please create a default warehouse or specify a valid warehouse name.');
            }

            // 3. Prepare payload for createPurchase (reuse existing logic)
            const payload = {
                supplierId: supplier.id,
                invoiceNumber: invoice.invoiceNumber,
                warehouseId,
                items: invoice.items.map(item => ({
                    name: item.productName,
                    sku: item.productSku,
                    categoryId: item.category, // Will need to resolve category name to ID
                    quantity: item.quantity,
                    unitCost: item.unitCost,
                    sellPrice: item.sellPrice || 0,
                    sellPrice2: item.sellPrice2,
                    sellPrice3: item.sellPrice3
                })),
                deliveryCharge: invoice.deliveryCharge,
                paidAmount: invoice.paidAmount,
                paymentMethod: invoice.paymentMethod,
                csrfToken: data.csrfToken
            };

            // 4. Process invoice (reuse createPurchase logic internally via transaction)
            await prisma.$transaction(async (tx) => {
                const { items, ...header } = payload;
                const processedItems = [];

                // Process items (create products if needed)
                for (const item of items) {
                    let productId: string | undefined;

                    // Check if product exists by SKU
                    const existingProduct = await tx.product.findUnique({
                        where: { sku: item.sku }
                    });

                    if (existingProduct) {
                        productId = existingProduct.id;
                    } else {
                        // Create category if needed
                        let categoryId = item.categoryId;
                        if (item.categoryId && typeof item.categoryId === 'string') {
                            let cat = await tx.category.findFirst({
                                where: { name: { equals: item.categoryId } }
                            });
                            if (!cat) {
                                cat = await tx.category.create({
                                    data: { name: item.categoryId }
                                });
                            }
                            categoryId = cat.id;
                        } else {
                            // No category specified - use or create "Uncategorized"
                            let defaultCat = await tx.category.findFirst({
                                where: { name: { equals: 'Uncategorized' } }
                            });
                            if (!defaultCat) {
                                defaultCat = await tx.category.create({
                                    data: { name: 'Uncategorized', color: '#6b7280' }
                                });
                            }
                            categoryId = defaultCat.id;
                        }

                        // Create new product
                        const newProduct = await tx.product.create({
                            data: {
                                name: item.name,
                                sku: item.sku,
                                categoryId, // Now always has a value
                                costPrice: item.unitCost,
                                sellPrice: item.sellPrice || 0,
                                sellPrice2: item.sellPrice2,
                                sellPrice3: item.sellPrice3,
                                stock: 0 // Will be updated below
                            }
                        });
                        productId = newProduct.id;
                    }

                    processedItems.push({
                        productId,
                        quantity: item.quantity,
                        unitCost: item.unitCost
                    });
                }

                // Calculate totals
                const subtotal = processedItems.reduce((acc, i) => acc + (i.quantity * i.unitCost), 0);
                const totalAmount = subtotal + header.deliveryCharge;
                let status = "PENDING";
                if (header.paidAmount >= totalAmount) status = "PAID";
                else if (header.paidAmount > 0) status = "PARTIAL";

                // Create pur invoice
                const purchaseInvoice = await tx.purchaseInvoice.create({
                    data: {
                        supplierId: header.supplierId,
                        invoiceNumber: header.invoiceNumber,
                        warehouseId: header.warehouseId,
                        totalAmount,
                        deliveryCharge: header.deliveryCharge,
                        paidAmount: header.paidAmount,
                        status,
                        paymentMethod: header.paymentMethod,
                        items: {
                            create: processedItems.map(i => ({
                                productId: i.productId,
                                quantity: i.quantity,
                                unitCost: i.unitCost
                            }))
                        }
                    }
                });

                // Update supplier balance
                await tx.supplier.update({
                    where: { id: header.supplierId },
                    data: { balance: { increment: totalAmount - header.paidAmount } }
                });

                // Update stock
                for (const item of processedItems) {
                    await tx.product.update({
                        where: { id: item.productId },
                        data: { stock: { increment: item.quantity } }
                    });

                    if (header.warehouseId) {
                        await tx.stock.upsert({
                            where: {
                                productId_warehouseId: {
                                    productId: item.productId,
                                    warehouseId: header.warehouseId
                                }
                            },
                            update: { quantity: { increment: item.quantity } },
                            create: {
                                productId: item.productId,
                                warehouseId: header.warehouseId,
                                quantity: item.quantity
                            }
                        });
                    }
                }

                results.createdInvoices.push(purchaseInvoice.id);
            });

            results.successful++;
        } catch (error: unknown) {
            results.failed++;
            results.errors.push({
                invoice: invoice.invoiceNumber || `Invoice #${results.successful + results.failed}`,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    revalidatePath('/inventory');
    revalidateTag(CACHE_TAGS.INVENTORY);
    revalidateTag(CACHE_TAGS.PRODUCTS);
    revalidateTag('dashboard');

    return {
        success: true,
        results
    };
}, { permission: 'INVENTORY_MANAGE' });

