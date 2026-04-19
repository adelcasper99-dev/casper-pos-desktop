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
 * Message templates based on ticket status
 * Note: These can be moved to i18n translation files for full localization.
 */
export const WHATSAPP_TEMPLATES = {
  READY: (barcode: string, total: string | number) => 
    `عميلنا العزيز، جهازك رقم ${barcode} جاهز للاستلام. التكلفة الإجمالية: ${total} ج.م. شكراً لتعاملك مع Casper POS.`,
  REJECTED: (barcode: string) => 
    `عميلنا العزيز، نود إبلاغك بأن جهازك رقم ${barcode} غير قابل للإصلاح وهو جاهز للاستلام حالياً. شكراً لتعاملك معنا.`,
  GENERAL: (barcode: string) => 
    `مرحباً، بخصوص الجهاز رقم ${barcode}...`,
};

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


