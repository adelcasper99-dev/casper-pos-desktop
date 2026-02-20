'use client';

/**
 * Hidden input field for CSRF token
 * Include this in all forms that perform state-changing operations
 * 
 * Usage:
 * <form action={serverAction}>
 *   <CSRFInput token={csrfToken} />
 *   {/* other inputs *\/}
 * </form>
 */
export function CSRFInput({ token }: { token: string }) {
  return (
    <input 
      type="hidden" 
      name="csrfToken" 
      value={token}
      aria-hidden="true"
    />
  );
}
