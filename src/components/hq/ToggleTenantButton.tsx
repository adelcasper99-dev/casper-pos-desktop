"use client";

import { useState } from "react";
import { toggleTenantStatus } from "@/actions/hq-tenant-actions";
import { generateCSRFToken } from "@/lib/csrf-client";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function ToggleTenantButton({ tenantId, isActive }: { tenantId: string, isActive: boolean }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleToggle() {
    setLoading(true);
    try {
      const csrfToken = await generateCSRFToken();
      const res = await toggleTenantStatus({ tenantId, csrfToken });
      
      if (res?.success) {
        router.refresh();
      } else {
        alert(res?.error || "Failed to toggle status");
      }
    } catch (err: any) {
      alert(err.message || "Failed to toggle status");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button 
      onClick={handleToggle}
      disabled={loading}
      className={`text-sm font-bold flex items-center gap-1 justify-end ml-auto ${
        isActive ? 'text-red-600 hover:text-red-700' : 'text-green-600 hover:text-green-700'
      } disabled:opacity-50`}
    >
      {loading && <Loader2 className="w-3 h-3 animate-spin" />}
      {isActive ? 'Suspend' : 'Activate'}
    </button>
  );
}
