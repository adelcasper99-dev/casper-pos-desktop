import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";

export type SubscriptionStatus = {
  status: "ACTIVE" | "WARNING" | "EXPIRED_READ_ONLY";
  daysRemaining: number;
  expiresAt: Date | null;
  isTrial: boolean;
};

export async function getSubscriptionStatus(tenantId?: string): Promise<SubscriptionStatus> {
  try {
    const settings = await prisma.storeSettings.findFirst({});

    if (!settings?.licenseJwt) {
      return {
        status: "ACTIVE",
        daysRemaining: 14,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        isTrial: true
      };
    }

    // Decode JWT payload without verifying signature (for client display)
    const decoded = jwt.decode(settings.licenseJwt) as any;
    if (!decoded?.trial_ends_at) {
      return {
        status: "ACTIVE",
        daysRemaining: 365,
        expiresAt: null,
        isTrial: false
      };
    }

    const expiresAt = new Date(decoded.trial_ends_at);
    const now = new Date();
    const diffMs = expiresAt.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    if (diffMs <= 0) {
      return {
        status: "EXPIRED_READ_ONLY",
        daysRemaining: 0,
        expiresAt,
        isTrial: true
      };
    }

    if (daysRemaining <= 3) {
      return {
        status: "WARNING",
        daysRemaining,
        expiresAt,
        isTrial: true
      };
    }

    return {
      status: "ACTIVE",
      daysRemaining,
      expiresAt,
      isTrial: true
    };
  } catch (e) {
    console.error("Failed to calculate subscription status:", e);
    return {
      status: "ACTIVE",
      daysRemaining: 14,
      expiresAt: null,
      isTrial: false
    };
  }
}
