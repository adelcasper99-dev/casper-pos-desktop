'use server';

import { prisma } from '@/lib/prisma';

/**
 * Branch Hierarchy Utility Functions
 * Supports multi-HQ architecture with parent-child relationships
 */

export interface BranchTreeNode {
    id: string;
    name: string;
    code: string;
    type: string;
    territoryCode: string | null;
    region: string | null;
    sortOrder: number;
    parentBranchId: string | null;
    childBranches: BranchTreeNode[];
    _count?: {
        warehouses?: number;
        users?: number;
        stockRequests?: number;
    };
}

/**
 * Get the parent HQ for a given store/branch
 * @param branchId - ID of the branch to get parent for
 * @returns Parent HQ branch or null if none/is root
 */
export async function getParentHQ(branchId: string) {
    const branch = await prisma.branch.findUnique({
        where: { id: branchId },
        include: {
            parentBranch: {
                include: {
                    warehouses: true,
                },
            },
        },
    });

    return branch?.parentBranch || null;
}

/**
 * Get all child stores for a given HQ center
 * @param hqId - ID of the HQ center
 * @returns Array of child branches/stores
 */
export async function getChildStores(hqId: string) {
    const children = await prisma.branch.findMany({
        where: {
            parentBranchId: hqId,
            deletedAt: null,
        },
        include: {
            warehouses: {
                select: {
                    id: true,
                    name: true,
                    isDefault: true,
                },
            },
            users: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
        orderBy: {
            sortOrder: 'asc',
        },
    });

    return children;
}

/**
 * Get the complete branch hierarchy tree
 * Returns HQ centers with nested child stores
 * @returns Array of root HQ branches with nested children
 */
export async function getBranchTree(): Promise<BranchTreeNode[]> {
    // Get all branches
    const allBranches = await prisma.branch.findMany({
        where: {
            deletedAt: null,
        },
        include: {
            _count: {
                select: {
                    warehouses: true,
                    users: true,
                    stockRequests: true,
                },
            },
        },
        orderBy: [
            { type: 'desc' }, // CENTER first, then STORE
            { sortOrder: 'asc' },
            { name: 'asc' },
        ],
    });

    // Build tree structure
    const branchMap = new Map<string, BranchTreeNode>();
    const rootBranches: BranchTreeNode[] = [];

    // First pass: Create all nodes
    allBranches.forEach((branch) => {
        branchMap.set(branch.id, {
            id: branch.id,
            name: branch.name,
            code: branch.code,
            type: branch.type,
            territoryCode: branch.territoryCode,
            region: branch.region,
            sortOrder: branch.sortOrder || 0,
            parentBranchId: branch.parentBranchId,
            childBranches: [],
            _count: branch._count,
        });
    });

    // Second pass: Build hierarchy
    branchMap.forEach((node) => {
        if (node.parentBranchId) {
            // This is a child branch - add to parent's children
            const parent = branchMap.get(node.parentBranchId);
            if (parent) {
                parent.childBranches.push(node);
            }
        } else {
            // This is a root branch (HQ with no parent)
            rootBranches.push(node);
        }
    });

    return rootBranches;
}

/**
 * Get all HQ centers (branches with type "CENTER")
 * @returns Array of HQ center branches
 */
export async function getAllHQCenters() {
    const hqs = await prisma.branch.findMany({
        where: {
            type: 'CENTER',
            deletedAt: null,
        },
        include: {
            warehouses: true,
            childBranches: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                },
            },
            _count: {
                select: {
                    warehouses: true,
                    users: true,
                    childBranches: true,
                },
            },
        },
        orderBy: {
            sortOrder: 'asc',
        },
    });

    return hqs;
}

/**
 * Find the nearest HQ with stock availability for a product
 * Used for intelligent stock request routing
 * @param requestingBranchId - Branch requesting the stock
 * @param productId - Product being requested
 * @param quantity - Quantity needed
 * @returns HQ ID and warehouse ID with available stock, or null
 */
export async function findNearestHQWithStock(
    requestingBranchId: string,
    productId: string,
    quantity: number
) {
    // Get the requesting branch's parent HQ first
    const parentHQ = await getParentHQ(requestingBranchId);

    if (parentHQ) {
        // Check if parent HQ has stock
        const stock = await prisma.stock.findFirst({
            where: {
                productId,
                warehouse: {
                    branchId: parentHQ.id,
                },
                quantity: {
                    gte: quantity,
                },
            },
            include: {
                warehouse: true,
            },
        });

        if (stock) {
            return {
                hqId: parentHQ.id,
                warehouseId: stock.warehouseId,
                availableQuantity: stock.quantity,
                routingMethod: 'AUTO' as const,
            };
        }
    }

    // Fallback: Check other HQ centers for stock
    const allHQs = await getAllHQCenters();

    for (const hq of allHQs) {
        if (hq.id === parentHQ?.id) continue; // Already checked

        const stock = await prisma.stock.findFirst({
            where: {
                productId,
                warehouse: {
                    branchId: hq.id,
                },
                quantity: {
                    gte: quantity,
                },
            },
            include: {
                warehouse: true,
            },
        });

        if (stock) {
            return {
                hqId: hq.id,
                warehouseId: stock.warehouseId,
                availableQuantity: stock.quantity,
                routingMethod: 'FALLBACK' as const,
                fallbackReason: parentHQ
                    ? 'Primary HQ out of stock'
                    : 'No parent HQ assigned',
            };
        }
    }

    return null; // No HQ has the requested stock
}

/**
 * Assign a store to an HQ center (update parent relationship)
 * @param storeId - ID of the store to assign
 * @param hqId - ID of the HQ center (or null to unassign)
 * @returns Updated branch
 */
export async function assignStoreToHQ(storeId: string, hqId: string | null) {
    const updatedBranch = await prisma.branch.update({
        where: { id: storeId },
        data: {
            parentBranchId: hqId,
        },
        include: {
            parentBranch: true,
        },
    });

    return updatedBranch;
}

/**
 * Update territory information for a branch
 * @param branchId - ID of the branch
 * @param territoryCode - Territory code (e.g., "NORTH", "SOUTH")
 * @param region - Region name (e.g., "Cairo", "Alexandria")
 * @returns Updated branch
 */
export async function updateBranchTerritory(
    branchId: string,
    territoryCode: string | null,
    region: string | null
) {
    const updatedBranch = await prisma.branch.update({
        where: { id: branchId },
        data: {
            territoryCode,
            region,
        },
    });

    return updatedBranch;
}
