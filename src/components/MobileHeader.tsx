"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, X, Settings, ShieldCheck, LogOut } from "lucide-react";
import { CasperLogo } from "@/components/ui/CasperLogo";
import { ModeToggle } from "@/components/mode-toggle";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useFilteredNavItems, type NavUser, type NavSettings } from "@/hooks/useFilteredNavItems";
import { useTranslations } from "@/lib/i18n-mock";
import { logout } from "@/actions/auth";
import { cn } from "@/lib/utils";

interface MobileHeaderProps {
    user?: NavUser | null;
    settings?: NavSettings | null;
}

export default function MobileHeader({ user, settings }: MobileHeaderProps) {
    const [open, setOpen] = useState(false);
    const pathname = usePathname() || "";
    const t = useTranslations("Sidebar");
    const { filteredItems, isAdmin } = useFilteredNavItems(user, settings);

    const isSettingsActive = pathname === "/settings" || pathname.startsWith("/settings/");
    const isAdminLicensesActive = pathname === "/admin/licenses" || pathname.startsWith("/admin/licenses/");

    return (
        <header className="flex md:hidden items-center justify-between px-3 h-14 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-white/10 shrink-0 z-40 select-none">
            {/* Left: Brand & Menu Trigger */}
            <div className="flex items-center gap-2">
                <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
                    <DialogPrimitive.Trigger asChild>
                        <button
                            type="button"
                            aria-label="Open navigation menu"
                            className="p-2 -mr-1 rounded-xl text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95 transition-all"
                        >
                            <Menu className="w-5 h-5" />
                        </button>
                    </DialogPrimitive.Trigger>

                    <DialogPrimitive.Portal>
                        {/* Overlay */}
                        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

                        {/* Slide-over Drawer */}
                        <DialogPrimitive.Content
                            className="fixed inset-y-0 right-0 z-50 w-[280px] max-w-[85vw] bg-white dark:bg-zinc-900 border-l border-slate-200 dark:border-white/10 shadow-2xl flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right duration-200"
                            dir="rtl"
                        >
                            {/* Drawer Header */}
                            <div className="flex items-center justify-between px-4 h-14 border-b border-slate-200 dark:border-white/10 shrink-0">
                                <div className="flex items-center gap-2">
                                    <CasperLogo width={26} height={26} className="shrink-0" />
                                    <span className="font-black text-xs tracking-widest text-foreground uppercase">CASPER</span>
                                </div>
                                <DialogPrimitive.Close asChild>
                                    <button
                                        type="button"
                                        aria-label="Close menu"
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-foreground hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </DialogPrimitive.Close>
                            </div>

                            {/* Nav Items List */}
                            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                                {filteredItems.map((item) => {
                                    const Icon = item.icon;
                                    const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

                                    return (
                                        <Link
                                            key={item.key}
                                            href={item.href}
                                            onClick={() => setOpen(false)}
                                            className={cn(
                                                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all",
                                                isActive
                                                    ? "bg-slate-900 text-white dark:bg-white dark:text-black shadow-sm"
                                                    : "text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/5"
                                            )}
                                        >
                                            <Icon className={cn("w-4 h-4 shrink-0", isActive ? "text-cyan-400 dark:text-cyan-600" : "text-slate-400 dark:text-zinc-400")} />
                                            <span className="truncate">{t(item.key)}</span>
                                        </Link>
                                    );
                                })}

                                {/* Admin / Settings links */}
                                <div className="pt-2 mt-2 border-t border-slate-200/80 dark:border-white/10 space-y-1">
                                    {isAdmin && (
                                        <Link
                                            href="/admin/licenses"
                                            onClick={() => setOpen(false)}
                                            className={cn(
                                                "flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold transition-all",
                                                isAdminLicensesActive
                                                    ? "bg-slate-900 text-white dark:bg-white dark:text-black shadow-sm"
                                                    : "text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/5"
                                            )}
                                        >
                                            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                                            <span className="truncate">{t("adminLicenses") || "Licenses"}</span>
                                        </Link>
                                    )}

                                    <Link
                                        href="/settings"
                                        onClick={() => setOpen(false)}
                                        className={cn(
                                            "flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold transition-all",
                                            isSettingsActive
                                                ? "bg-slate-900 text-white dark:bg-white dark:text-black shadow-sm"
                                                : "text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/5"
                                        )}
                                    >
                                        <Settings className="w-4 h-4 text-slate-400 shrink-0" />
                                        <span className="truncate">{t("settings") || "Settings"}</span>
                                    </Link>
                                </div>
                            </div>

                            {/* Drawer Footer */}
                            <div className="p-3 border-t border-slate-200 dark:border-white/10 shrink-0 flex items-center justify-between gap-2 pb-safe bg-slate-50/50 dark:bg-black/20">
                                <div className="flex items-center gap-1.5">
                                    <ModeToggle />
                                    <LanguageSwitcher />
                                </div>
                                <button
                                    onClick={() => logout()}
                                    className="p-2 rounded-xl text-rose-500 hover:bg-rose-500/10 transition-colors"
                                    title={t("logout") || "Logout"}
                                >
                                    <LogOut className="w-4 h-4" />
                                </button>
                            </div>
                        </DialogPrimitive.Content>
                    </DialogPrimitive.Portal>
                </DialogPrimitive.Root>

                {/* Brand Logo */}
                <Link href="/" className="flex items-center gap-2">
                    <CasperLogo width={24} height={24} className="shrink-0" />
                    <span className="font-black text-xs tracking-wider text-foreground">CASPER</span>
                </Link>
            </div>

            {/* Right: Quick actions */}
            <div className="flex items-center gap-1.5">
                <ModeToggle />
                <LanguageSwitcher />
            </div>
        </header>
    );
}
