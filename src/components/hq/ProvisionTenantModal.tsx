"use client";

import { useState } from "react";
import { provisionNewTenant } from "@/actions/hq-tenant-actions";
import { generateCSRFToken } from "@/lib/csrf-client";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function ProvisionTenantModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activationCode, setActivationCode] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const domain = formData.get("domain") as string;

    try {
      const csrfToken = await generateCSRFToken();
      const res = await provisionNewTenant({ name, domain, csrfToken });
      
      // `res` from safe-action is typed and flattened.
      if (res?.success) {
        setActivationCode(res.activationCode || "");
        router.refresh(); // Refresh table
      } else {
        setError(res?.error || "Unknown error occurred");
      }
    } catch (err: any) {
      setError(err.message || "Failed to provision");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="bg-slate-900 dark:bg-white text-white dark:text-zinc-900 font-bold px-4 py-2 rounded-xl text-sm"
      >
        + Provision Tenant
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 dark:border-white/5">
              <h3 className="text-xl font-black">Provision New Tenant</h3>
            </div>
            
            <div className="p-6">
              {activationCode ? (
                <div className="space-y-4">
                  <div className="bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 p-4 rounded-xl">
                    <p className="font-bold mb-2">Tenant Provisioned Successfully!</p>
                    <p className="text-sm opacity-90 mb-4">Please copy the activation code below. It will not be shown again.</p>
                    <div className="flex gap-2">
                      <input 
                        readOnly 
                        value={activationCode}
                        className="flex-1 bg-white dark:bg-zinc-950 border border-green-200 dark:border-green-500/20 rounded-lg px-3 py-2 font-mono text-center font-bold"
                      />
                      <button 
                        onClick={() => navigator.clipboard.writeText(activationCode)}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold text-sm"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setIsOpen(false);
                      setActivationCode("");
                    }}
                    className="w-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 font-bold py-3 rounded-xl transition-colors"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm font-bold">{error}</div>}
                  
                  <div>
                    <label className="block text-sm font-bold mb-1">Tenant Name</label>
                    <input 
                      name="name" 
                      required 
                      className="w-full border-2 border-slate-200 dark:border-white/10 bg-transparent rounded-xl px-4 py-3 font-semibold focus:border-blue-500 outline-none"
                      placeholder="e.g. KFC Branch 1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-1">Subdomain / Identifier</label>
                    <input 
                      name="domain" 
                      required 
                      className="w-full border-2 border-slate-200 dark:border-white/10 bg-transparent rounded-xl px-4 py-3 font-semibold focus:border-blue-500 outline-none"
                      placeholder="e.g. kfc-01"
                    />
                  </div>

                  <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-white/5 mt-6">
                    <button 
                      type="button" 
                      onClick={() => setIsOpen(false)}
                      className="flex-1 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 font-bold py-3 rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      disabled={loading}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    >
                      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                      Provision
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
