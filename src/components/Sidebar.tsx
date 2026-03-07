"use client";

import { useState, useMemo, memo } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "@/lib/i18n-mock";
import {
    LayoutDashboard,
    ShoppingCart,
    Box,
    Users,
    Landmark,
    BarChart3,
    Settings,
    Truck,
    Warehouse,
    Store,
    LogOut,
    Wrench,
    Phone,
    Megaphone,
    ShieldCheck,
    Calculator,
    Smartphone,
    Building2,
    Package,
    Activity,
    History as HistoryIcon,
    type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { logout } from "@/actions/auth";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { ModeToggle } from "@/components/mode-toggle";
import StaffProfileBadge from "@/components/staff/StaffProfileBadge";

const MENU_ITEMS = [
    { key: "dashboard", href: "/dashboard", icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD_VIEW },
    { key: "pos", href: "/pos", icon: ShoppingCart, permission: PERMISSIONS.POS_ACCESS },
    { key: "inventory", href: "/inventory", icon: Box, permission: PERMISSIONS.INVENTORY_VIEW },
    { key: "customers", href: "/customers", icon: Users, permission: PERMISSIONS.CUSTOMER_VIEW },
    { key: "purchasing", href: "/purchasing", icon: Truck, permission: PERMISSIONS.PURCHASING_VIEW },
    { key: "treasury", href: "/treasury", icon: Landmark, permission: PERMISSIONS.TREASURY_VIEW },
    { key: "logs", href: "/logs", icon: HistoryIcon as LucideIcon, permission: PERMISSIONS.LOGS_VIEW },
    { key: "reports", href: "/reports", icon: BarChart3, permission: PERMISSIONS.REPORTS_VIEW },
    { key: "maintenance_dashboard", href: "/maintenance/dashboard", icon: Activity, permission: PERMISSIONS.REPORTS_VIEW },
    { key: "maintenance", href: "/maintenance/tickets", icon: Wrench, permission: PERMISSIONS.TICKET_VIEW },
];

function Sidebar({ user }: { user: any }) {
    const t = useTranslations('Sidebar');
    const [isExpanded, setIsExpanded] = useState(false);
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const router = useRouter();
    const locale = useLocale();

    const isSettingsActive = pathname === `/${locale}/settings` || pathname.includes("/settings/");
    const isAdmin = user?.role === 'ADMIN' || user?.role === 'Admin';

    const filteredItems = useMemo(() => {
        return MENU_ITEMS.filter(item => {
            if (!item.permission) return true;
            if (isAdmin) return true;
            return hasPermission(user?.permissions, item.permission);
        });
    }, [user, isAdmin]);

    return (
        <aside
            className={cn(
                "h-full bg-zinc-900 z-50 flex flex-col transition-all duration-300 ease-in-out relative print:hidden",
                isExpanded ? "w-64" : "w-20"
            )}
            onMouseEnter={() => setIsExpanded(true)}
            onMouseLeave={() => setIsExpanded(false)}
        >
            <div className="p-4 flex items-center justify-between overflow-hidden h-20">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 flex items-center justify-center shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/assets/casper-icon.png" alt="Casper ERP" className="w-10 h-10 object-contain" />
                    </div>
                    <span className={cn(
                        "font-bold text-lg tracking-tight whitespace-nowrap transition-opacity duration-200",
                        isExpanded ? "opacity-100" : "opacity-0"
                    )}>
                        CASPER
                    </span>
                </div>
            </div>

            <nav className="flex-1 px-3 py-6 space-y-3 overflow-y-auto no-scrollbar">
                {filteredItems.map((item) => {
                    let isActive = false;
                    const targetPath = item.href;

                    if (targetPath === '/') {
                        isActive = pathname === '/';
                    } else {
                        isActive = pathname.startsWith(targetPath);
                    }

                    return (
                        <Link
                            key={item.key}
                            href={item.href.startsWith('/maintenance') ? `/${locale}${item.href}` : item.href}
                            className={cn(
                                "relative flex items-center gap-4 p-4 rounded-xl transition-all duration-300 group overflow-hidden border border-border/50 shadow-md",
                                isActive
                                    ? "bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.4)] scale-[1.02] ring-1 ring-white/20"
                                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground hover:scale-[1.02]"
                            )}
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none opacity-50" />
                            <item.icon className={cn("w-7 h-7 shrink-0 relative z-10", isActive && "text-black")} />
                            <span className={cn(
                                "text-base font-bold transition-opacity duration-200 whitespace-nowrap relative z-10 uppercase tracking-wide",
                                isExpanded ? "opacity-100" : "opacity-0 w-0"
                            )}>
                                {t(item.key)}
                            </span>
                        </Link>
                    );
                })}
            </nav>

            <div className="p-3 border-t border-border space-y-2">
                <div className={cn("flex gap-2 transition-all duration-300", isExpanded ? "flex-row" : "flex-col")}>
                    <LanguageSwitcher />
                    <ModeToggle />
                </div>

                {(isAdmin || hasPermission(user?.permissions, PERMISSIONS.MANAGE_SETTINGS) || hasPermission(user?.permissions, PERMISSIONS.MANAGE_USERS)) && (
                    <Link
                        href={`/${locale}/settings`}
                        className={cn(
                            "relative flex items-center gap-4 p-3 rounded-xl w-full transition-all duration-300 group overflow-hidden border border-white/5 shadow-md",
                            isSettingsActive
                                ? "bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.4)] scale-[1.02] ring-1 ring-white/20"
                                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground hover:scale-[1.02]"
                        )}
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none opacity-50" />
                        <Settings className={cn("w-6 h-6 shrink-0 relative z-10", isSettingsActive && "text-black")} />
                        <span className={cn(
                            "text-sm font-bold transition-opacity duration-200 whitespace-nowrap relative z-10 uppercase tracking-wide",
                            isExpanded ? "opacity-100" : "opacity-0 w-0"
                        )}>
                            {t('settings')}
                        </span>
                    </Link>
                )}

                <StaffProfileBadge user={user} isExpanded={isExpanded} />
            </div>
        </aside>
    );
}

export default memo(Sidebar);
