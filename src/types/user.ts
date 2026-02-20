/**
 * Shared TypeScript type definitions for User and Authentication
 * Used across auth, RBAC, and user management
 */

/**
 * User session data (from JWT or Redis)
 */
export interface UserSession {
    id: string;
    username: string;
    name: string | null;
    roleStr: string; // Legacy role
    roleId: string | null;
    branchId: string;
    branchType?: string; // "STORE" | "CENTER"
    permissions?: string[];
}

/**
 * Full user data from database
 */
export interface User {
    id: string;
    username: string;
    name: string | null;
    roleStr: string;
    roleId: string | null;
    branchId: string;
    createdAt: Date;
    deletedAt: Date | null;
    salary: number | null;
    annualLeaveBalance: number;
    monthlyOffDays: number;
}
