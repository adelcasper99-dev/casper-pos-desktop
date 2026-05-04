'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, ShieldCheck, Loader2, Copy, Check } from 'lucide-react';
import { isPhoneValid, generateWhatsAppLink, resolveQuickTemplate } from '@/lib/whatsapp-utils';
import { useWhatsAppAutoNotify } from '@/hooks/useWhatsAppAutoNotify';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface WhatsAppQuickButtonProps {
  ticketId: string;
  customerPhone: string;
  customerName: string;
  ticketNumber: string;
  totalCost: string | number;
  status?: string;
  device?: string;
  issue?: string;
  onSuccess?: () => void;
  className?: string;
  whatsappTemplates?: { 
    NEW?: string; 
    READY?: string; 
    PAID_DELIVERED?: string;
    enabled?: {
      NEW?: boolean;
      READY?: boolean;
      PAID_DELIVERED?: boolean;
    }
  } | null;
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
  device,
  issue,
  onSuccess,
  className,
  whatsappTemplates
}: WhatsAppQuickButtonProps) {
  const [isOpening, setIsOpening] = useState(false);
  const [copied, setCopied] = useState(false);
  const autoNotify = useWhatsAppAutoNotify();

  // Determine current template type for display and logic
  const type: any = 
               status === 'NEW' ? 'NEW' :
               status === 'REJECTED' ? 'REJECTED' : 
               (status === 'PAID_DELIVERED' ? 'PAID_DELIVERED' : 
               (['COMPLETED', 'READY_AT_BRANCH'].includes(status) ? 'READY' : 'COMPLETED'));
  
  const isTemplateEnabled = whatsappTemplates?.enabled ? (whatsappTemplates.enabled[type as keyof typeof whatsappTemplates.enabled] !== false) : true;

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

        try {
            // 1. Check if the Native Engine is READY
            const statusRes = await window.electronAPI?.whatsapp?.getStatus();
            const isNativeReady = statusRes?.success && statusRes.data.status === 'READY';

            if (isNativeReady) {
                // 🚀 Option A: Using the Native Background Engine
                await autoNotify(type, {
                    customerPhone,
                    customerName,
                    barcode: ticketNumber,
                    deviceBrand: device || '',
                    deviceModel: '', 
                    repairPrice: totalCost,
                    issueDescription: issue || ''
                }, {
                    whatsappEnabled: true,
                    whatsappTemplates: whatsappTemplates || undefined
                });
                toast.success('جارِ إرسال الرسالة في الخلفية...');
            } else {
                // 🌐 Option B: Fallback to Manual Link (wa.me)
                const message = resolveQuickTemplate(
                    type,
                    whatsappTemplates || undefined,
                    ticketNumber,
                    totalCost,
                    { name: customerName, device, issue }
                ) || '';
                
                const link = generateWhatsAppLink(customerPhone, message);
                
                if (window.electronAPI?.shell) {
                    await window.electronAPI.shell.openExternal(link);
                } else {
                    window.open(link, '_blank');
                }
                toast.success('تم فتح واتساب للإرسال اليدوي');
            }
            
            onSuccess?.();
        } catch (error) {
            console.error('WhatsApp trigger failed:', error);
            toast.error('فشل إرسال الرسالة');
        } finally {
            setIsOpening(false);
        }
    };

  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    const message = resolveQuickTemplate(
      type,
      whatsappTemplates || undefined,
      ticketNumber,
      totalCost,
      { name: customerName, device, issue }
    ) || '';
    const webLink = generateWhatsAppLink(customerPhone, message, true);
    navigator.clipboard.writeText(webLink);
    setCopied(true);
    toast.success('تم نسخ الرابط');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-1">
      <motion.button
        whileHover={isTemplateEnabled ? { scale: 1.02, translateY: -2 } : {}}
        whileTap={isTemplateEnabled ? { scale: 0.98 } : {}}
        onClick={handleSendMessage}
        disabled={isOpening || !isTemplateEnabled}
        title={!isTemplateEnabled ? "هذا النوع من الرسائل معطل من الإعدادات" : "إرسال رسالة واتساب للعميل"}
        className={cn(
          "group relative flex items-center gap-3 px-6 h-11 rounded-xl font-bold transition-all overflow-hidden",
          !isTemplateEnabled 
            ? "bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed opacity-60 grayscale"
            : status === 'REJECTED' 
              ? "bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg shadow-orange-500/20"
              : status === 'PAID_DELIVERED'
                ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20"
                : status === 'NEW'
                  ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/20"
                  : "bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg shadow-emerald-500/20",
          "hover:shadow-lg disabled:opacity-70",
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
          {isOpening 
            ? 'جاري الاتصال...' 
            : status === 'NEW'
              ? 'إرسال رسالة ترحيب'
              : status === 'REJECTED' 
                ? 'إبلاغ بالرفض' 
                : status === 'PAID_DELIVERED'
                  ? 'إرسال رسالة شكر'
                  : 'إبلاغ بالجاهزية'}
        </span>

        <ShieldCheck className="w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity" />
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
