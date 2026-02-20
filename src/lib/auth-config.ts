/**
 * Authentication Configuration
 * Provides role-based default routes and helper functions for post-login redirects
 */

/**
 * Role-based default routes configuration
 * Users are redirected to their role's default page after login
 */
export const ROLE_DEFAULT_ROUTES: Record<string, string> = {
  'ADMIN': '/accounting',
  'Admin': '/accounting',
  'Manager': '/reports',
  'Cashier': '/pos',
  'Staff': '/pos',
  'Warehouse Staff': '/warehouse',
  'Accountant': '/accounting',
};

export const DEFAULT_ROUTE = '/';

/**
 * Validates return URL to prevent open redirect vulnerabilities
 * @param url - URL to validate
 * @returns true if URL is safe to redirect to
 */
export function isValidReturnUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  if (!url.startsWith('/')) return false;
  if (url.includes('://') || url.startsWith('//')) return false;
  if (url.startsWith('/login')) return false; // Prevent loop
  if (url.startsWith('/api/')) return false; // Don't redirect to APIs
  return true;
}

/**
 * Determines post-login redirect destination
 * Priority: returnUrl (if valid) > role default > fallback
 * @param userRole - User's role
 * @param returnUrl - Optional return URL from query params
 * @returns URL to redirect to
 */
export function getPostLoginRedirect(
  userRole: string,
  returnUrl?: string | null
): string {
  // Validate and use return URL if provided
  if (returnUrl && isValidReturnUrl(returnUrl)) {
    return returnUrl;
  }
  
  // Use role-based default
  const roleRoute = ROLE_DEFAULT_ROUTES[userRole];
  if (roleRoute) {
    return roleRoute;
  }
  
  // Fallback to dashboard
  return DEFAULT_ROUTE;
}
