import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number | string, currency: string = 'EGP') {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2
  }).format(value);
}
// Safe UUID generator that works in insecure contexts (HTTP)
export function safeRandomUUID(): string {
  // 1. Try native randomUUID if available and we are in a secure context (or browser supports it)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Ignore and fall through
    }
  }

  // 2. Fallback to crypto.getRandomValues (widely available even in insecure contexts)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
      (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> (+c / 4)).toString(16)
    );
  }

  // 3. Last fallback: Math.random (Not cryptographically secure, but prevents crash)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
