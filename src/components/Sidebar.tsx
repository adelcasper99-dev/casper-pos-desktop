"use client";

import { useState, useMemo, memo, useEffect } from "react";
import { CasperLogo } from "@/components/ui/CasperLogo";
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
    Briefcase,
    Clock,
    History as HistoryIcon,
    Undo2,
    TrendingUp,
    Info,
    FileText,
    type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import MoneyCounter from "@/components/shift/MoneyCounter";

import { hasPermission, PERMISSIONS, PERMISSION_REGISTRY } from "@/lib/permissions";
import { logout } from "@/actions/auth";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { ModeToggle } from "@/components/mode-toggle";
import StaffProfileBadge from "@/components/staff/StaffProfileBadge";
import AppClock from "@/components/ui/AppClock";
import { useOfflineQueueStatus } from "@/hooks/useOfflineQueueStatus";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { RefreshCw, Unplug, CloudOff, AlertCircle } from "lucide-react";

import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { SortableSidebarItem } from "./SortableSidebarItem";

const MENU_ITEMS = [
    { key: "dashboard", href: "/dashboard", icon: LayoutDashboard, permission: PERMISSION_REGISTRY.DASHBOARD.VIEW },
    { key: "pos", href: "/pos", icon: ShoppingCart, permission: PERMISSION_REGISTRY.POS.ACCESS },
    { key: "hr", href: "/hr", icon: Briefcase, permission: PERMISSION_REGISTRY.HR.VIEW_ATTENDANCE },
    { key: "inventory", href: "/inventory", icon: Box, permission: PERMISSION_REGISTRY.INVENTORY.VIEW },
    { key: "spareParts", href: "/spare-parts", icon: Smartphone, permission: null },
    { key: "customers", href: "/customers", icon: Users, permission: PERMISSION_REGISTRY.CUSTOMER.VIEW },
    { key: "purchasing", href: "/purchasing", icon: Truck, permission: PERMISSION_REGISTRY.PURCHASING.VIEW },
    { key: "treasury", href: "/treasury", icon: Landmark, permission: PERMISSION_REGISTRY.TREASURY.VIEW },
    { key: "accounting_partners", href: "/accounting/partners", icon: Users, permission: PERMISSION_REGISTRY.PARTNERS.VIEW },
    { key: "accounting_balance_sheet", href: "/accounting/balance-sheet", icon: FileText, permission: PERMISSION_REGISTRY.ACCOUNTING.VIEW },
    { key: "logs", href: "/logs", icon: HistoryIcon as LucideIcon, permission: PERMISSION_REGISTRY.LOGS.VIEW },
    // Reports Section
    { key: "reports_main", href: "/reports", icon: BarChart3, permission: PERMISSION_REGISTRY.REPORTS.VIEW },
    { key: "reports_profit_loss", href: "/reports/profit-loss", icon: TrendingUp, permission: PERMISSION_REGISTRY.REPORTS.VIEW },
    { key: "reports_inventory", href: "/reports/inventory", icon: Package, permission: PERMISSION_REGISTRY.REPORTS.VIEW },
    { key: "reports_cash_flow", href: "/reports/cash-flow", icon: Landmark, permission: PERMISSION_REGISTRY.REPORTS.VIEW },
    { key: "maintenance_dashboard", href: "/dashboard/reports/maintenance-profit", icon: Activity, permission: PERMISSION_REGISTRY.REPORTS.VIEW },
    { key: "maintenance", href: "/maintenance/tickets", icon: Wrench, permission: PERMISSION_REGISTRY.TICKET.VIEW },
    { key: "returns", href: "/returns", icon: Undo2, permission: undefined },
];

function Sidebar({ user, settings }: { user: any, settings?: any }) {
    const t = useTranslations('Sidebar');
    const [isExpanded, setIsExpanded] = useState(false);
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const router = useRouter();
    const locale = useLocale();
    const { isOnline } = useNetworkStatus();
    const { total, hasDeadLetter, manualSync, refresh } = useOfflineQueueStatus();

    const [mounted, setMounted] = useState(false);
    const [itemsOrder, setItemsOrder] = useState<string[]>(MENU_ITEMS.map(i => i.key));

    const features = useMemo(() => {
        try {
            return JSON.parse(settings?.features || "{}");
        } catch (e) {
            return {};
        }
    }, [settings?.features]);

    useEffect(() => {
        setMounted(true);
        if (typeof window !== 'undefined') {
            const storageKey = user?.id ? `sidebar_order_${user.id}` : 'sidebar_order';
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    // Filter out stale keys that no longer exist in MENU_ITEMS
                    const validKeys = parsed.filter((key: string) => MENU_ITEMS.some(item => item.key === key));

                    // Add any missing new items to the end (backfilling)
                    const missingKeys = MENU_ITEMS.filter(item => !validKeys.includes(item.key)).map(i => i.key);
                    
                    const finalOrder = [...validKeys, ...missingKeys];
                    setItemsOrder(finalOrder);
                } catch (e) {
                    console.error("Failed to parse sidebar order", e);
                }
            }
        }
    }, [user?.id]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const isSettingsActive = pathname === `/settings` || pathname.startsWith(`/settings/`);
    const isAdminLicensesActive = pathname === `/admin/licenses` || pathname.startsWith(`/admin/licenses`);
    const isAdmin = user?.role === 'ADMIN' || user?.role === 'Admin';

    const filteredItems = useMemo(() => {
        const visibleItems = MENU_ITEMS.filter(item => {
            // 1. Check Feature Toggle (Enabled by default if not specified)
            // Handle linked modules
            const featureKey = item.key.includes('maintenance') ? 'maintenance' :
                item.key === 'returns' ? 'returns' :
                    item.key === 'logs' ? 'reports' :
                        item.key;

            if (item.key === 'returns') {
                // Returns should be visible if POS OR Maintenance OR Purchasing is enabled
                const isPosEnabled = features['pos'] !== false;
                const isMaintenanceEnabled = features['maintenance'] !== false;
                const isPurchasingEnabled = features['purchasing'] !== false;
                if (!isPosEnabled && !isMaintenanceEnabled && !isPurchasingEnabled) return false;

                // Also check if user has permission for ANY of these
                if (isAdmin) return true;
                const hasPosAccess = hasPermission(user?.permissions, PERMISSION_REGISTRY.POS.ACCESS);
                const hasMaintAccess = hasPermission(user?.permissions, PERMISSION_REGISTRY.TICKET.VIEW);
                const hasPurchAccess = hasPermission(user?.permissions, PERMISSION_REGISTRY.PURCHASING.VIEW);
                if (!hasPosAccess && !hasMaintAccess && !hasPurchAccess) return false;

                return true;
            } else if (features[featureKey] === false) {
                return false;
            }

            // 2. Check Permissions
            if (!item.permission) return true;
            if (isAdmin) return true;
            return hasPermission(user?.permissions, item.permission);
        });

        // Sort visible items according to itemsOrder
        return [...visibleItems].sort((a, b) => {
            const indexA = itemsOrder.indexOf(a.key);
            const indexB = itemsOrder.indexOf(b.key);
            return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
        });
    }, [user, isAdmin, itemsOrder, features]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            setItemsOrder((items) => {
                const oldIndex = items.indexOf(active.id as string);
                const newIndex = items.indexOf(over.id as string);
                const newOrder = arrayMove(items, oldIndex, newIndex);

                if (typeof window !== 'undefined') {
                    const storageKey = user?.id ? `sidebar_order_${user.id}` : 'sidebar_order';
                    localStorage.setItem(storageKey, JSON.stringify(newOrder));
                }

                return newOrder;
            });
        }
    };

    return (
        <aside
            className={cn(
                "h-full bg-white dark:bg-zinc-900 z-50 flex flex-col transition-all duration-300 ease-in-out relative print:hidden border-r-2 border-dashed border-zinc-400/50 dark:border-r dark:border-solid dark:border-white/5 shadow-none dark:shadow-[4px_0_15px_rgba(0,0,0,0.2)]",
                isExpanded ? "w-64" : "w-20"
            )}
            onMouseEnter={() => setIsExpanded(true)}
            onMouseLeave={() => setIsExpanded(false)}
        >
            <div
                className="p-4 flex items-center justify-between overflow-hidden border-b-2 border-dashed border-zinc-300 dark:border-b dark:border-solid dark:border-white/5 transition-all duration-300"
                style={{ height: isExpanded ? '112px' : '80px' }}
            >
                <div className="flex items-center gap-3">
                    <CasperLogo
                        width={isExpanded ? 80 : 40}
                        height={isExpanded ? 80 : 40}
                        className="shrink-0 transition-all duration-300"
                    />
                    <span className={cn(
                        "font-bold text-lg tracking-tight whitespace-nowrap transition-all duration-300",
                        isExpanded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4 pointer-events-none"
                    )}>
                        CASPER
                    </span>
                </div>
            </div>

            <nav className="flex-1 px-3 py-6 space-y-3 overflow-y-auto no-scrollbar">
                {mounted ? (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={filteredItems.map(i => i.key)}
                            strategy={verticalListSortingStrategy}
                        >
                            {filteredItems.map((item) => {
                                let isActive = false;
                                const targetPath = item.href;

                                if (targetPath === '/') {
                                    isActive = pathname === '/';
                                } else {
                                    isActive = pathname.startsWith(targetPath) || pathname.startsWith(`/${locale}${targetPath}`);
                                }

                                return (
                                    <SortableSidebarItem
                                        key={item.key}
                                        id={item.key}
                                        href={item.href}
                                        icon={item.icon}
                                        label={t(item.key)}
                                        isActive={isActive}
                                        isExpanded={isExpanded}
                                        locale={locale}
                                    />
                                );
                            })}
                        </SortableContext>
                    </DndContext>
                ) : (
                    // Static fallback for SSR and first client render
                    filteredItems.map((item) => {
                        let isActive = false;
                        const targetPath = item.href;
                        if (targetPath === '/') isActive = pathname === '/';
                        else isActive = pathname.startsWith(targetPath) || pathname.startsWith(`/${locale}${targetPath}`);

                        return (
                            <Link
                                key={item.key}
                                href={item.href.startsWith('/maintenance') || item.href.startsWith('/returns') ? `/${locale}${item.href}` : item.href}
                                className={cn(
                                    "relative flex items-center gap-4 p-3 rounded-lg transition-all duration-200 group overflow-hidden",
                                    isActive
                                        ? "bg-slate-900 text-white shadow-sm dark:bg-cyan-500 dark:text-black dark:shadow-[0_0_15px_rgba(6,182,212,0.4)]"
                                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-muted-foreground dark:hover:bg-white/10 dark:hover:text-white"
                                )}
                            >
                                {isActive && (
                                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-pink-400 dark:hidden" />
                                )}
                                <item.icon strokeWidth={1.25} className={cn("w-6 h-6 shrink-0 relative z-10")} />
                                <span className={cn(
                                    "text-sm font-semibold transition-opacity duration-200 whitespace-nowrap relative z-10 tracking-wide",
                                    isExpanded ? "opacity-100" : "opacity-0 w-0"
                                )}>
                                    {t(item.key)}
                                </span>
                            </Link>
                        );
                    })
                )}
            </nav>

            <div className="p-3 border-t-2 border-dashed border-zinc-300 dark:border-t dark:border-solid dark:border-white/5 space-y-2">
                <div className={cn("flex gap-2 transition-all duration-300", isExpanded ? "flex-row" : "flex-col items-center")}>
                    <LanguageSwitcher />
                    <ModeToggle />
                    
                    {/* Money Counter Popover */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <button
                                className={cn(
                                    "flex items-center justify-center rounded-md transition-all duration-300 h-9 bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground",
                                    isExpanded ? "flex-1" : "w-10"
                                )}
                                title="Money Counter"
                            >
                                <Calculator className="w-4 h-4" />
                            </button>
                        </PopoverTrigger>
                        <PopoverContent 
                            side={isExpanded ? "top" : "right"} 
                            align="center" 
                            className="w-80 p-0 border-none bg-transparent shadow-none"
                        >
                            <div className="glass-card bg-zinc-900/95 backdrop-blur-xl border border-white/10 p-1 shadow-2xl rounded-2xl overflow-hidden">
                                <MoneyCounter 
                                    showToggle={false} 
                                    defaultExpanded={true} 
                                    currency="EGP" 
                                />
                            </div>
                        </PopoverContent>
                    </Popover>
                    
                    {/* Offline Sync Badge */}
                    {(total > 0 || !isOnline) && (
                        <button
                            onClick={() => manualSync()}
                            className={cn(
                                "relative flex items-center justify-center rounded-xl transition-all duration-300 group overflow-hidden border-2",
                                !isOnline 
                                    ? "bg-red-500/10 border-red-500/50 text-red-500" 
                                    : "bg-orange-500/10 border-orange-500/50 text-orange-500",
                                isExpanded ? "flex-1 px-3 py-2 gap-2" : "w-10 h-10 p-0"
                            )}
                            title={isOnline ? `${total} pending syncs` : "Offline"}
                        >
                            {isOnline ? (
                                <RefreshCw className={cn("w-5 h-5", total > 0 && "animate-spin-slow")} />
                            ) : (
                                <Unplug className="w-5 h-5" />
                            )}
                            
                            {isExpanded && (
                                <div className="flex flex-col items-start leading-none gap-1">
                                    <span className="text-[10px] font-black uppercase tracking-tighter">
                                        {!isOnline ? "Offline" : "Syncing"}
                                    </span>
                                    {total > 0 && (
                                        <span className="text-[12px] font-black">{total} pending</span>
                                    )}
                                </div>
                            )}

                            {/* Notification Dot */}
                            {total > 0 && !isExpanded && (
                                <div className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-zinc-900 animate-pulse" />
                            )}
                        </button>
                    )}
                </div>

                {/* Training Button */}
                <button
                    onClick={() => {
                        // Trigger the fixed button in TrainingModal component
                        // The TrainingModal already has a fixed button that opens the modal
                    }}
                    className={cn(
                        "relative flex items-center gap-4 p-3 rounded-lg w-full transition-all duration-200 group overflow-hidden",
                        "text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-muted-foreground dark:hover:bg-white/10 dark:hover:text-white"
                    )}
                >
                    <Info strokeWidth={1.25} className={cn("w-5 h-5 shrink-0 relative z-10")} />
                    <span className={cn(
                        "text-sm font-semibold transition-opacity duration-200 whitespace-nowrap relative z-10 tracking-wide",
                        isExpanded ? "opacity-100" : "opacity-0 w-0"
                    )}>
                        التدريب
                    </span>
                </button>

                {isAdmin && (
                    <Link
                        href={`/admin/licenses`}
                        className={cn(
                            "relative flex items-center gap-4 p-3 rounded-lg w-full transition-all duration-200 group overflow-hidden",
                            isAdminLicensesActive
                                ? "bg-slate-900 text-white shadow-sm dark:bg-cyan-500 dark:text-black dark:shadow-[0_0_15px_rgba(6,182,212,0.4)]"
                                : "text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-muted-foreground dark:hover:bg-white/10 dark:hover:text-white"
                        )}
                    >
                        {isAdminLicensesActive && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-pink-400 dark:hidden" />
                        )}
                        <ShieldCheck strokeWidth={1.25} className={cn("w-6 h-6 shrink-0 relative z-10 text-cyan-500")} />
                        <span className={cn(
                            "text-sm font-semibold transition-opacity duration-200 whitespace-nowrap relative z-10 tracking-wide",
                            isExpanded ? "opacity-100" : "opacity-0 w-0"
                        )}>
                            Client Licenses
                        </span>
                    </Link>
                )}

                {(isAdmin || hasPermission(user?.permissions, PERMISSION_REGISTRY.ADMIN.MANAGE_SETTINGS) || hasPermission(user?.permissions, PERMISSION_REGISTRY.ADMIN.MANAGE_USERS)) && (
                    <Link
                        href={`/settings`}
                        className={cn(
                            "relative flex items-center gap-4 p-3 rounded-lg w-full transition-all duration-200 group overflow-hidden",
                            isSettingsActive
                                ? "bg-slate-900 text-white shadow-sm dark:bg-cyan-500 dark:text-black dark:shadow-[0_0_15px_rgba(6,182,212,0.4)]"
                                : "text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-muted-foreground dark:hover:bg-white/10 dark:hover:text-white"
                        )}
                    >
                        {isSettingsActive && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-pink-400 dark:hidden" />
                        )}
                        <Settings strokeWidth={1.25} className={cn("w-6 h-6 shrink-0 relative z-10")} />
                        <span className={cn(
                            "text-sm font-semibold transition-opacity duration-200 whitespace-nowrap relative z-10 tracking-wide",
                            isExpanded ? "opacity-100" : "opacity-0 w-0"
                        )}>
                            {t('settings')}
                        </span>
                    </Link>
                )}

                <AppClock isExpanded={isExpanded} />
                <StaffProfileBadge user={user} isExpanded={isExpanded} />
            </div>
        </aside>
    );
}

export default memo(Sidebar);
