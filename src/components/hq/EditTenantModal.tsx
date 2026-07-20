"use client";

import { useState } from "react";
import { editTenant } from "@/actions/hq-tenant-actions";
import { generateCSRFToken } from "@/lib/csrf-client";
import { Loader2, Lock, Edit2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface EditTenantModalProps {
  tenantId: string;
  initialName: string;
  slug: string;
}

export function EditTenantModal({ tenantId, initialName, slug }: EditTenantModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState(initialName);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (name.trim() === initialName) {
      setIsOpen(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const csrfToken = await generateCSRFToken();
      const res = await editTenant({ tenantId, name: name.trim(), csrfToken });

      if (res?.success) {
        setIsOpen(false);
        router.refresh();
      } else {
        setError(res?.error || "Failed to update tenant name");
      }
    } catch (err: any) {
      setError(err.message || "Failed to update tenant");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold text-xs flex items-center gap-1 transition-colors px-2 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-500/10"
      >
        <Edit2 className="w-3.5 h-3.5" />
        Edit
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-slate-900 dark:text-white">
            <div className="p-6 border-b border-slate-100 dark:border-white/5 flex justify-between items-center">
              <h3 className="text-xl font-black">Edit Tenant</h3>
              <button 
                onClick={() => setIsOpen(false)} 
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm font-bold">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-bold mb-1">Tenant Name</label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border-2 border-slate-200 dark:border-white/10 bg-transparent rounded-xl px-4 py-3 font-semibold focus:border-blue-500 outline-none"
                    placeholder="e.g. KFC Branch 1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold mb-1 flex items-center gap-1.5">
                    Subdomain / Identifier
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                  </label>
                  <input
                    disabled
                    readOnly
                    value={slug}
                    className="w-full border-2 border-slate-100 dark:border-white/5 bg-slate-100 dark:bg-zinc-800/50 text-slate-500 dark:text-zinc-400 rounded-xl px-4 py-3 font-mono font-semibold cursor-not-allowed outline-none select-none"
                  />
                  <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">
                    Subdomains are immutable identifiers for offline sync integrity and cannot be changed.
                  </p>
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-white/5 mt-6">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="flex-1 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 font-bold py-3 rounded-xl transition-colors text-slate-700 dark:text-zinc-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || name.trim() === initialName}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
