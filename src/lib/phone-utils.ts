/**
 * Pure Phone Normalization & Formatting Utility for Casper POS & ERP
 * Safe for Client Components, Server Components, and Server Actions.
 */

/**
 * Normalizes phone numbers to standard international format (no leading '+')
 * E.g. "01012345678" -> "201012345678"
 */
export function normalizePhone(rawPhone: string): string {
    if (!rawPhone) return "";
    let cleaned = rawPhone.replace(/[^\d+]/g, "");
    if (cleaned.startsWith("00")) {
        cleaned = "+" + cleaned.substring(2);
    }
    if (cleaned.startsWith("01")) {
        cleaned = "+20" + cleaned.substring(1);
    }
    if (cleaned.startsWith("20") && !cleaned.startsWith("+")) {
        cleaned = "+" + cleaned;
    }
    return cleaned.replace(/\+/g, "").trim();
}
