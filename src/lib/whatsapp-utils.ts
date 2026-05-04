/**
 * Formats a phone number for WhatsApp deep links.
 * Strips all non-numeric characters and ensures international format.
 */
export function formatWhatsAppNumber(phone: string): string {
  // Strip all non-numeric characters except '+'
  let cleaned = phone.replace(/[^\d+]/g, '');

  // Handle leading 00 as +
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.substring(2);
  }

  // If it's an Egyptian number starting with 01...
  if (cleaned.startsWith('01')) {
    cleaned = '+20' + cleaned.substring(1);
  } 
  
  // Ensure it starts with '+' if it has the country code 20...
  if (cleaned.startsWith('20') && !cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }

  // Remove duplicate '+' if any
  return cleaned.startsWith('++') ? cleaned.substring(1) : cleaned;
}

/**
 * Basic validation for Egyptian phone numbers
 */
export function isPhoneValid(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '');
  // Egyptian mobile numbers are 11 digits (01x xxxx xxxx)
  // Or international format 201x xxxx xxxx (12 digits)
  return cleaned.length >= 11 && cleaned.length <= 15;
}

/**
 * Default message templates based on ticket status
 */
export const DEFAULT_QUICK_TEMPLATES = {
  NEW: (barcode: string) => 
    `مرحباً! 👋 تم استلام جهازك بنجاح. رقم التذكرة الخاص بك هو ${barcode}. سنقوم بإعلامك بأي تحديثات قريباً. شكراً لثقتك!`,
  READY: (barcode: string, total: string | number) => 
    `عميلنا العزيز، جهازك رقم ${barcode} جاهز للاستلام. التكلفة الإجمالية: ${total} ج.م. شكراً لتعاملك مع Casper POS.`,
  PAID_DELIVERED: (barcode: string) => 
    `شكراً لزيارتك! 🙏 تم تسليم جهازك رقم ${barcode} وإغلاق الطلب. ننتظر تقييمك لخدمتنا. يومك سعيد!`,
  REJECTED: (barcode: string) => 
    `عميلنا العزيز، نود إبلاغك بأن جهازك رقم ${barcode} غير قابل للإصلاح وهو جاهز للاستلام حالياً. شكراً لتعاملك معنا.`,
  GENERAL: (barcode: string) => 
    `مرحباً، بخصوص الجهاز رقم ${barcode}...`,
};

// Maintain compatibility
export const WHATSAPP_TEMPLATES = DEFAULT_QUICK_TEMPLATES;

/**
 * Resolve a quick template using optional overrides from settings.
 * Supports {barcode} and {price} placeholders for custom templates.
 */
export function resolveQuickTemplate(
  type: 'NEW' | 'READY' | 'PAID_DELIVERED' | 'REJECTED' | 'GENERAL',
  overrides?: any,
  barcode?: string,
  total?: string | number,
  data?: {
    name?: string;
    device?: string;
    issue?: string;
  }
): string | null {
  // Check if message is enabled (Default to true if flag is missing)
  if (overrides?.enabled && overrides.enabled[type] === false) {
    return null;
  }

  // If we have a valid override, use it and replace placeholders
  if (overrides && overrides[type] && overrides[type].trim().length > 0) {
    let message = overrides[type];
    
    const replacements: Record<string, string> = {
      barcode: barcode || '',
      price: total?.toString() || '',
      total: total?.toString() || '',
      name: data?.name || '',
      device: data?.device || '',
      issue: data?.issue || '',
    };
    
    for (const [key, value] of Object.entries(replacements)) {
      message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    
    return message;
  }

  // Fallback to defaults
  const template = DEFAULT_QUICK_TEMPLATES[type as keyof typeof DEFAULT_QUICK_TEMPLATES];
  if (type === 'READY') return (template as Function)(barcode || '', total || '');
  return (template as Function)(barcode || '');
}

/**
 * Generates a WhatsApp link (deep link or web link).
 */
export function generateWhatsAppLink(phone: string, message: string, forceWeb = false): string {
  const formatted = formatWhatsAppNumber(phone);
  const encodedMsg = encodeURIComponent(message);
  
  if (forceWeb) {
    // Web version works better without the '+' in the URL parameter for some browsers
    return `https://web.whatsapp.com/send?phone=${formatted.replace('+', '')}&text=${encodedMsg}`;
  }
  
  return `whatsapp://send?phone=${formatted}&text=${encodedMsg}`;
}


