'use client';
import { formatWhatsAppNumber } from '@/lib/whatsapp-utils';
import { getStatusTemplate }    from '@/lib/whatsapp-templates';

const NOTIFIABLE = new Set([
  'NEW', 'DIAGNOSING', 'IN_PROGRESS', 'WAITING_FOR_PARTS',
  'COMPLETED', 'READY_AT_BRANCH', 'REJECTED', 'PAID_DELIVERED', 'READY',
]);

export interface NotifyCtx {
  customerPhone: string;
  customerName:  string;
  barcode:       string;
  deviceBrand:   string;
  deviceModel:   string;
  repairPrice?:   number | string;
  branchName?:   string;
  issueDescription?: string | null;
}

export function useWhatsAppAutoNotify() {
  return async (status: string, ctx: NotifyCtx, settings: any): Promise<void> => {
    // Guard 1: Feature disabled at store level
    if (!settings?.whatsappEnabled) return;
    // Guard 2: Not a notifiable status
    if (!NOTIFIABLE.has(status)) return;
    // Guard 3: No Electron IPC bridge (web/tablet deployment)
    const api = (window as any).electronAPI?.whatsapp;
    if (!api) return;
    // Guard 4: Invalid phone
    if (!ctx.customerPhone) return;

    try {
      const template = getStatusTemplate(status, 'ar', settings?.whatsappTemplates);
      if (!template) return;

      const message = template
        .replace(/\{name\}/g,   ctx.customerName)
        .replace(/\{device\}/g, `${ctx.deviceBrand} ${ctx.deviceModel}`)
        .replace(/\{barcode\}/g, ctx.barcode)
        .replace(/\{price\}/g,  String(ctx.repairPrice ?? ''))
        .replace(/\{branch\}/g, ctx.branchName ?? '')
        .replace(/\{issue\}/g,  ctx.issueDescription ?? '');

      // baileys JID format: {phone}@s.whatsapp.net (MUST BE NUMERIC ONLY, NO '+')
      const cleanPhone = formatWhatsAppNumber(ctx.customerPhone).replace(/\+/g, '');
      const jid = `${cleanPhone}@s.whatsapp.net`;

      // Non-blocking: notification failure NEVER propagates to ticket workflow
      const result = await api.sendMessage(jid, message);
      if (!result.success) {
        console.warn('[WhatsApp] Background send failed:', result.error);
      }
    } catch (e: any) {
      console.error('[WhatsApp] Auto-notify hook error (non-fatal):', e.message);
    }
  };
}
