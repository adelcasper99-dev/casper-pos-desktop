/**
 * Casper POS Mobile License Generator Engine
 * Generates offline-verifiable license keys matching mobile app client.
 */

const SECRET_SALT = 'CASPER_SECURE_POS_SALT_2026';

export type MobileLicenseDuration = 7 | 14 | 30 | 90 | 180 | 365 | 9999;

export interface MobileLicensePayload {
    deviceId: string;
    days: MobileLicenseDuration;
    customerName?: string;
    customerPhone?: string;
}

export interface GeneratedMobileLicense {
    key: string;
    tag: string;
    deviceId: string;
    days: number;
    durationLabel: string;
    whatsappUrl?: string;
}

/**
 * Computes deterministic checksum for device + duration.
 */
export function computeMobileChecksum(deviceId: string, durationTag: string): string {
    const combined = `${deviceId.trim().toUpperCase()}:${durationTag}:${SECRET_SALT}`;
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
        const char = combined.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32-bit integer
    }
    const hex = Math.abs(hash).toString(16).toUpperCase().padStart(6, '0');
    return hex.slice(0, 6);
}

/**
 * Generates an activation key for mobile app.
 * Format: CASPER-<TAG>-<CHECKSUM>
 */
export function generateMobileLicenseKey(deviceId: string, days: MobileLicenseDuration): string {
    const cleanDevice = deviceId.trim().toUpperCase();
    const tag = days >= 9999 ? 'LIFE' : `${days}D`;
    const checksum = computeMobileChecksum(cleanDevice, tag);
    return `CASPER-${tag}-${checksum}`;
}

export function getDurationLabel(days: MobileLicenseDuration): string {
    switch (days) {
        case 7:
            return '7 أيام (تجريبي)';
        case 14:
            return '14 يوم';
        case 30:
            return 'شهر (30 يوم)';
        case 90:
            return '3 شهور (90 يوم)';
        case 180:
            return '6 شهور (180 يوم)';
        case 365:
            return 'سنة كاملة (365 يوم)';
        case 9999:
            return 'مدى الحياة (Lifetime)';
        default:
            return `${days} يوم`;
    }
}

/**
 * Builds formatted WhatsApp message to send directly to customer.
 */
export function buildMobileLicenseWhatsAppUrl(phone: string, customerName: string, key: string, durationLabel: string): string {
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.startsWith('01') && cleanPhone.length === 11) {
        cleanPhone = `2${cleanPhone}`;
    }

    const greeting = customerName.trim() ? `أهلاً بك أستاذ ${customerName.trim()}` : 'أهلاً بك';
    const message = `${greeting}،\n\nإليك كود تفعيل تطبيق *Casper POS Mobile* الخاص بجهازك 🔑:\n\n*كود التفعيل:* \`${key}\`\n*المدة:* ${durationLabel}\n\n*خطوات التفعيل:*\n1. افتح تطبيق Casper POS على هاتفك\n2. الصق الكود أعلاه في خانة "كود التفعيل"\n3. اضغط على زر "تفعيل الترخيص" وسيفتح التطبيق فوراً ✅\n\nشكراً لثقتكم بنظام Casper ERP! 🚀`;

    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}
