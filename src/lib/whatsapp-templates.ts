/**
 * WhatsApp Message Templates for Ticket Status Notifications
 * 
 * Templates use placeholders that are replaced at runtime:
 * - {name} - Customer name
 * - {device} - Device brand + model
 * - {barcode} - Ticket barcode
 * - {price} - Repair price
 * - {branch} - Branch name
 */

export const WHATSAPP_TEMPLATES: Record<string, { ar: string }> = {
    NEW: {
        ar: "مرحباً {name}! 👋\n\nتم استلام جهازك {device} للإصلاح.\n📋 رقم التذكرة: {barcode}\n🔧 المشكلة: {issue}\n\nسنقوم بإعلامك بأي تحديثات. شكراً لثقتك!"
    },
    IN_TRANSIT_TO_CENTER: {
        ar: "مرحباً {name}!\n\nجهازك {device} في الطريق إلى مركز الصيانة الرئيسي.\n📋 رقم التذكرة: {barcode}"
    },
    AT_CENTER: {
        ar: "مرحباً {name}!\n\nجهازك {device} وصل إلى مركز الصيانة وسيتم فحصه قريباً.\n📋 رقم التذكرة: {barcode}"
    },
    DIAGNOSING: {
        ar: "مرحباً {name}!\n\n🔍 جاري فحص جهازك {device} الآن لتحديد الأعطال بدقة.\nسنتواصل معك فور الانتهاء من الفحص."
    },
    IN_PROGRESS: {
        ar: "مرحباً {name}!\n\n🔧 بدأنا في إصلاح جهازك {device}.\n📝 ملاحظات: {notes}\nسيتم إعلامك فور الجاهزية."
    },
    WAITING_FOR_PARTS: {
        ar: "مرحباً {name}!\n\n⏳ جهازك {device} في انتظار وصول قطع الغيار المطلوبة.\nسنخبرك فور استلامها واستكمال الإصلاح."
    },
    COMPLETED: {
        ar: "مرحباً {name}! ✅\n\nتم إصلاح جهازك {device} بنجاح!\n💰 المبلغ: {price} جنيه\n\nجهازك جاهز للاستلام."
    },
    READY_AT_BRANCH: {
        ar: "مرحباً {name}! 📦\n\nجهازك {device} جاهز للاستلام من فرع {branch}.\n💰 المبلغ: {price} جنيه\n\nنتشرف بخدمتك!"
    },
    PICKED_UP: {
        ar: "شكراً لزيارتك {name}! 🙏\n\nنتمنى أن نكون عند حسن ظنك بخدمة {device}.\nلا تتردد في التواصل معنا في أي وقت."
    },
    PAID_DELIVERED: {
        ar: "شكراً لزيارتك {name}! 🙏\n\nتم تسليم جهازك {device} وإغلاق الطلب.\nننتظر تقييمك لخدمتنا. يومك سعيد!"
    },
    REJECTED: {
        ar: "مرحباً {name}!\n\nبخصوص جهازك {device}، نعتذر عن إعلامكم بأنه تعذر الإصلاح.\nنرجو استلام الجهاز من الفرع. شكراً لتفهمك."
    }
};

/**
 * Generate WhatsApp URL with pre-filled message
 */
export function generateWhatsAppUrl(
    phone: string,
    template: string,
    replacements: Record<string, string>
): string {
    // Clean phone number (remove non-digits, ensure no leading zero for international)
    let cleanPhone = phone.replace(/\D/g, '');

    // If starts with 0, assume Egypt (+20) and replace
    if (cleanPhone.startsWith('0')) {
        cleanPhone = '20' + cleanPhone.substring(1);
    }

    // Replace placeholders in template
    let message = template;
    for (const [key, value] of Object.entries(replacements)) {
        message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }

    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

/**
 * Get template for a specific status
 */
export function getStatusTemplate(status: string, _lang?: 'ar' | 'en'): string {
    const statusKey = status.toUpperCase().replace(/ /g, '_');
    const template = WHATSAPP_TEMPLATES[statusKey];

    if (!template) {
        return `مرحباً {name}! حالة جهازك {device}: ${status}`;
    }

    return template.ar;
}
