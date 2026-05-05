/**
 * Standard utility for extracting data from safeHandle IPC responses.
 * safeHandle returns { success: boolean; data?: T; error?: string }
 */
export function extractIpcData<T>(
  result: { success: boolean; data?: T; error?: string },
  channel: string
): T {
  if (!result.success) {
    const errorMsg = result.error || 'Unknown IPC error';
    console.error(`[IPC:${channel}] failure:`, errorMsg);
    throw new Error(`[IPC:${channel}] ${errorMsg}`);
  }

  // Strict check: if success is true, data MUST be present
  if (result.data === undefined) {
    const msg = `Handler returned success with no data`;
    console.error(`[IPC:${channel}] failure:`, msg);
    throw new Error(`[IPC:${channel}] ${msg}`);
  }

  return result.data as T;
}

/**
 * Standard utility for validating IPC success without extracting data.
 * Useful for "fire and forget" or void-returning handlers.
 */
export function expectIpcOk(
  result: { success: boolean; error?: string },
  channel: string
): void {
  if (!result.success) {
    const errorMsg = result.error || 'Unknown IPC error';
    console.error(`[IPC:${channel}] failure:`, errorMsg);
    throw new Error(`[IPC:${channel}] ${errorMsg}`);
  }
}
