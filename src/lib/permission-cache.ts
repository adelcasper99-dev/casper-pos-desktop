/**
 * Permission Caching System
 * 
 * Caches user permissions in memory to reduce database queries.
 * Invalidates cache when roles are updated.
 */

interface PermissionCacheEntry {
  permissions: string[];
  expiresAt: number;
  roleId: string;
}

// In-memory cache (for single server - use Redis for multi-server)
const permissionCache = new Map<string, PermissionCacheEntry>();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached permissions for a user
 */
export function getCachedPermissions(userId: string): string[] | null {
  const cached = permissionCache.get(userId);
  
  if (!cached) {
    return null;
  }
  
  // Check if expired
  if (cached.expiresAt < Date.now()) {
    permissionCache.delete(userId);
    return null;
  }
  
  return cached.permissions;
}

/**
 * Cache permissions for a user
 */
export function setCachedPermissions(
  userId: string,
  roleId: string,
  permissions: string[]
): void {
  permissionCache.set(userId, {
    permissions,
    roleId,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
}

/**
 * Invalidate cache for a specific user
 */
export function invalidateUserCache(userId: string): void {
  permissionCache.delete(userId);
}

/**
 * Invalidate cache for all users with a specific role
 */
export function invalidateRoleCache(roleId: string): void {
  const toDelete: string[] = [];
  
  permissionCache.forEach((entry, userId) => {
    if (entry.roleId === roleId) {
      toDelete.push(userId);
    }
  });
  
  toDelete.forEach(userId => permissionCache.delete(userId));
}

/**
 * Clear entire cache (use sparingly)
 */
export function clearPermissionCache(): void {
  permissionCache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  const now = Date.now();
  let active = 0;
  let expired = 0;
  
  permissionCache.forEach(entry => {
    if (entry.expiresAt > now) {
      active++;
    } else {
      expired++;
    }
  });
  
  return {
    totalEntries: permissionCache.size,
    activeEntries: active,
    expiredEntries: expired,
    hitRate: 0 // TODO: Track hits/misses
  };
}
