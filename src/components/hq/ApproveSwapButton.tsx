"use client";

import { useState } from "react";
import { approveHardwareSwap } from "@/actions/hq-tenant-actions";
import { generateCSRFToken } from "@/lib/csrf-client";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function ApproveSwapButton({ licenseId, newMac }: { licenseId: string, newMac: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleApprove() {
    if (!confirm(`Approve hardware swap for MAC: ${newMac}?`)) return;
    
    setLoading(true);
    try {
      const csrfToken = await generateCSRFToken();
      const res = await approveHardwareSwap({ licenseId, newMac, csrfToken });
      
      if (res?.success) {
        router.refresh();
      } else {
        alert(res?.error || "Failed to approve swap");
      }
    } catch (err: any) {
      alert(err.message || "Failed to approve swap");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button 
      onClick={handleApprove}
      disabled={loading}
      className="ml-3 px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-bold flex items-center gap-1 disabled:opacity-50"
    >
      {loading && <Loader2 className="w-3 h-3 animate-spin" />}
      Approve Swap
    </button>
  );
}
