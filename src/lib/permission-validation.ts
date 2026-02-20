/**
 * Permission Validation Utilities
 * 
 * Server-side validation for permission dependencies and conflicts
 */

import { PERMISSION_DEPENDENCIES } from './permissions';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate that all permission dependencies are satisfied
 */
export function validatePermissions(permissions: string[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check dependencies
  permissions.forEach(perm => {
    const deps = PERMISSION_DEPENDENCIES[perm] || [];
    deps.forEach(dep => {
      if (!permissions.includes(dep)) {
        errors.push(`Permission '${perm}' requires '${dep}' but it's not included`);
      }
    });
  });
  
  // Check for suspicious combinations
  if (permissions.includes('TICKET_DELETE') && !permissions.includes('TICKET_EDIT')) {
    warnings.push('User can DELETE tickets but not EDIT them - this is unusual');
  }
  
  if (permissions.includes('HR_MANAGE_PAYROLL') && !permissions.includes('HR_VIEW_PAYROLL')) {
    errors.push('Cannot manage payroll without viewing it');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Auto-resolve dependencies - adds missing required permissions
 */
export function resolvePermissionDependencies(permissions: string[]): string[] {
  const resolved = new Set(permissions);
  let changed = true;
  
  // Keep iterating until no more dependencies are added  
  while (changed) {
    changed = false;
    const current = Array.from(resolved);
    
    current.forEach(perm => {
      const deps = PERMISSION_DEPENDENCIES[perm] || [];
      deps.forEach(dep => {
        if (!resolved.has(dep)) {
          resolved.add(dep);
          changed = true;
        }
      });
    });
  }
  
  return Array.from(resolved);
}

/**
 * Get missing dependencies for a set of permissions
 */
export function getMissingDependencies(permissions: string[]): Map<string, string[]> {
  const missing = new Map<string, string[]>();
  
  permissions.forEach(perm => {
    const deps = PERMISSION_DEPENDENCIES[perm] || [];
    const missingDeps = deps.filter(dep => !permissions.includes(dep));
    
    if (missingDeps.length > 0) {
      missing.set(perm, missingDeps);
    }
  });
  
  return missing;
}
