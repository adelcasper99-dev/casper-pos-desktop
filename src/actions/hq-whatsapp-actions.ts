"use server";

import { secureAction } from "@/lib/safe-action";
import { getSession } from "@/lib/auth";
import { z } from "zod";

const WHATSAPP_SERVICE_URL = process.env.WHATSAPP_PROVIDER_URL || "http://127.0.0.1:3005/api/internal/whatsapp/send-otp";
const WHATSAPP_STATUS_URL = "http://127.0.0.1:3005/api/whatsapp/status";
const WHATSAPP_RESET_URL = "http://127.0.0.1:3005/api/internal/whatsapp/reset";

export interface WhatsAppGatewayStatusResponse {
  success: boolean;
  status: "CONNECTED" | "SCAN_QR" | "DISCONNECTED" | "UNKNOWN";
  qrCode?: string | null;
  phoneNumber?: string | null;
  error?: string;
}

export const getWhatsAppGatewayStatus = secureAction(
  async (): Promise<WhatsAppGatewayStatusResponse> => {
    const session = await getSession();
    if (!session?.user?.isGlobalAdmin) {
      throw new Error("Forbidden: Super Admin access required.");
    }

    try {
      const res = await fetch(WHATSAPP_STATUS_URL, {
        cache: "no-store",
        signal: AbortSignal.timeout(4000)
      });
      if (!res.ok) {
        return { success: false, status: "DISCONNECTED", error: `HTTP ${res.status}` };
      }
      const data = (await res.json()) as { status?: string; qrCode?: string | null; phoneNumber?: string | null };
      const rawStatus = data.status || "UNKNOWN";
      const normalizedStatus: "CONNECTED" | "SCAN_QR" | "DISCONNECTED" | "UNKNOWN" =
        rawStatus === "CONNECTED"
          ? "CONNECTED"
          : rawStatus === "SCAN_QR"
          ? "SCAN_QR"
          : "DISCONNECTED";

      return {
        success: true,
        status: normalizedStatus,
        qrCode: data.qrCode || null,
        phoneNumber: data.phoneNumber || null
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, status: "DISCONNECTED", error: msg };
    }
  }
);

export const resetWhatsAppGateway = secureAction(
  async (): Promise<{ success: boolean; message?: string; error?: string }> => {
    const session = await getSession();
    if (!session?.user?.isGlobalAdmin) {
      throw new Error("Forbidden: Super Admin access required.");
    }

    try {
      const res = await fetch(WHATSAPP_RESET_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(5000)
      });
      const data = (await res.json()) as { success?: boolean; message?: string; error?: string };
      return {
        success: Boolean(data.success),
        message: data.message || "تمت إعادة تعيين الجلسة بنجاح"
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }
);

const testMessageSchema = z.object({
  phone: z.string().min(8).max(20),
  message: z.string().min(1).max(500),
  csrfToken: z.string().optional()
});

export const sendWhatsAppTestMessage = secureAction(
  async (payload: z.infer<typeof testMessageSchema>): Promise<{ success: boolean; message?: string; error?: string }> => {
    const session = await getSession();
    if (!session?.user?.isGlobalAdmin) {
      throw new Error("Forbidden: Super Admin access required.");
    }

    const { phone, message } = testMessageSchema.parse(payload);

    try {
      const res = await fetch(WHATSAPP_SERVICE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: phone, message }),
        signal: AbortSignal.timeout(6000)
      });
      if (!res.ok) {
        const errText = await res.text();
        return { success: false, error: `فشل الإرسال: ${errText || res.statusText}` };
      }
      return { success: true, message: `تم إرسال الرسالة التجريبية بنجاح إلى ${phone}` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }
);
