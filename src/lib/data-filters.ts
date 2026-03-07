/**
 * Data Filtering Utilities
 * 
 * Provides branch-level and user-level data isolation to prevent
 * unauthorized access to data from other branches.
 */

import { UserSession } from './auth';

/**
 * Returns a Prisma filter object to restrict queries to the user's branch.
 * Admin users bypass the filter and can see all data.
 * 
 * @param user - Current user session
 * @returns Prisma where clause object
 * 
 * @example
 * const tickets = await prisma.ticket.findMany({
 *   where: {
 *     ...getBranchFilter(currentUser),
 *     status: 'NEW'
 *   }
 * });
 */
export function getBranchFilter(user: UserSession | null) {
  // Admin sees all data across all branches
  if (!user || user.role === 'ADMIN' || user.role === 'Admin' || user.role === 'مدير النظام' || user.role === 'المالك') {
    return {};
  }

  // All other users only see data from their assigned branch
  if (!user.branchId) {
    // User has no branch assigned - shouldn't happen, but fail safe
    throw new Error("User must be assigned to a branch");
  }

  return { currentBranchId: user.branchId };
}

/**
 * Returns a filter for models that use 'branchId' instead of 'currentBranchId'
 */
export function getBranchFilterAlt(user: UserSession | null) {
  if (!user || user.role === 'ADMIN' || user.role === 'Admin' || user.role === 'مدير النظام' || user.role === 'المالك') {
    return {};
  }

  if (!user.branchId) {
    throw new Error("User must be assigned to a branch");
  }

  return { branchId: user.branchId };
}

/**
 * Check if a user can access data from a specific branch
 */
export function canAccessBranch(user: UserSession | null, branchId: string): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN' || user.role === 'Admin' || user.role === 'مدير النظام' || user.role === 'المالك') return true;
  return user.branchId === branchId;
}

/**
 * Get list of branch IDs the user can access
 */
export function getAccessibleBranches(user: UserSession | null): string[] | 'all' {
  if (!user) return [];
  if (user.role === 'ADMIN' || user.role === 'Admin' || user.role === 'مدير النظام' || user.role === 'المالك') return 'all';
  return user.branchId ? [user.branchId] : [];
}
