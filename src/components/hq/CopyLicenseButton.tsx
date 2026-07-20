"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface CopyLicenseButtonProps {
  licenseKey: string;
}

export function CopyLicenseButton({ licenseKey }: CopyLicenseButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(licenseKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy license key:", err);
    }
  }

  return (
    <div className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 w-fit">
      <span className="font-mono text-xs font-bold text-slate-800 dark:text-zinc-200 select-all">
        {licenseKey}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        title="Copy License Key"
        className="p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded transition-colors text-slate-500 dark:text-zinc-400"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400 animate-in zoom-in-50 duration-150" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}
