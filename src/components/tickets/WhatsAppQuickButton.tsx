'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, ExternalLink, Loader2, Copy, Check } from 'lucide-react';
import { generateWhatsAppLink, WHATSAPP_TEMPLATES, isPhoneValid } from '@/lib/whatsapp-utils';
import { logTicketNotification } from '@/actions/ticket-actions';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface WhatsAppQuickButtonProps {
  ticketId: string;
  customerPhone: string;
  customerName: string;
  ticketNumber: string;
  totalCost: string | number;
  status?: string;
  onSuccess?: () => void;
  className?: string;
}



/**
 * A premium WhatsApp button that uses deep links for instant redirection.
 * Includes manual logging to the database and Electron native bridge.
 */
export default function WhatsAppQuickButton({
  ticketId,
  customerPhone,
  customerName,
  ticketNumber,
  totalCost,
  status = 'READY',
  onSuccess,
  className
}: WhatsAppQuickButtonProps) {
  const [isOpening, setIsOpening] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSendMessage = async () => {
    if (!customerPhone) {
      toast.error('رقم هاتف العميل غير متوفر');
      return;
    }

    if (!isPhoneValid(customerPhone)) {
      toast.error('رقم الهاتف غير صالح');
      return;
    }

    setIsOpening(true);

    // Determine template based on status
    let message = '';
    if (status === 'REJECTED') {
      message = WHATSAPP_TEMPLATES.REJECTED(ticketNumber);
    } else if (['COMPLETED', 'READY_AT_BRANCH'].includes(status)) {
      message = WHATSAPP_TEMPLATES.READY(ticketNumber, totalCost);
    } else {
      message = WHATSAPP_TEMPLATES.GENERAL(ticketNumber);
    }
    
    const deepLink = generateWhatsAppLink(customerPhone, message, false);
    const webLink = generateWhatsAppLink(customerPhone, message, true);

    try {
      // Logic for notification payload
      const notificationData = {
        ticketId,
        type: 'WHATSAPP' as const,
        status: 'SENT' as const,
        metadata: { messageType: status, target: 'QUICK_BUTTON' }
      };

      if (window.electronAPI) {
        const res = await window.electronAPI.shell.openExternal(deepLink);
        if (res.success) {
          await logTicketNotification(notificationData);
          onSuccess?.();
        } else {
          console.warn('Electron openExternal failed, falling back to webLink:', res.error);
          window.open(webLink, '_blank');
          toast.info('جاري فتح واتساب ويب...');
          // Optional: We could log a different status or skip logging here since it's a fallback
        }
      } else {
        // Standard Web handling with fallback
        window.location.href = deepLink;
        const timeout = setTimeout(() => {
          window.open(webLink, '_blank');
          toast.info('جاري فتح واتساب ويب...');
        }, 2500);

        const handleBlur = async () => {
          clearTimeout(timeout);
          window.removeEventListener('blur', handleBlur);
          await logTicketNotification(notificationData);
          onSuccess?.();
          setIsOpening(false); // Cleanup early on success
        };
        window.addEventListener('blur', handleBlur);
      }
    } catch (error) {
      console.error('WhatsApp trigger failed:', error);
    } finally {
      setIsOpening(false);
    }
  };

  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    const message = WHATSAPP_TEMPLATES.READY(ticketNumber, totalCost);
    const webLink = generateWhatsAppLink(customerPhone, message, true);
    navigator.clipboard.writeText(webLink);
    setCopied(true);
    toast.success('تم نسخ الرابط');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-1">
      <motion.button
        whileHover={{ scale: 1.02, translateY: -2 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleSendMessage}
        disabled={isOpening}
        title="إرسال رسالة واتساب للعميل"
        className={cn(
          "group relative flex items-center gap-3 px-6 h-11 rounded-xl font-bold transition-all overflow-hidden",
          status === 'REJECTED' 
            ? "bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg shadow-orange-500/20"
            : "bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg shadow-emerald-500/20",
          "hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed",
          className
        )}
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        
        <div className="relative">
          {isOpening ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <MessageCircle className="w-5 h-5 fill-white/20" />
          )}
        </div>

        <span className="relative z-10 whitespace-nowrap text-sm">
          {isOpening ? 'جاري الاتصال...' : status === 'REJECTED' ? 'إبلاغ بالرفض' : 'إبلاغ بالجاهزية'}
        </span>

        <ExternalLink className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
        <div className="absolute inset-0 rounded-xl border border-white/20 group-hover:border-white/40 transition-colors" />
      </motion.button>

      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={handleCopyLink}
        className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
        title="نسخ رابط المحادثة"
      >
        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
      </motion.button>
    </div>
  );
}


