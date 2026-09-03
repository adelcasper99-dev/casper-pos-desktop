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
import { RefreshCw, Unplug, CloudOff, AlertCircle, Wifi, WifiOff } from "lucide-react";
import { useBridgeStatus } from "@/hooks/useBridgeStatus";

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
    { key: "reports_main", href: "/reports", icon: BarChart3, permission: PERMISSION_REGISTRY.REPORTS.VIEW },
    { key: "maintenance", href: "/maintenance/tickets", icon: Wrench, permission: PERMISSION_REGISTRY.TICKET.VIEW },
    { key: "returns", href: "/returns", icon: Undo2, permission: undefined },
];

interface BridgeStatusBadgeProps {
    isExpanded: boolean;
    locale: string;
    router: any;
}

function BridgeStatusBadge({ isExpanded, locale, router }: BridgeStatusBadgeProps) {
    const { state, version, printerConfigured, recheck, isMounted } = useBridgeStatus();
    const t = useTranslations('Bridge');

    if (!isMounted) return null;

    const isRtl = locale === 'ar';

    let bgStyle = "";
    let icon: React.ReactNode = null;
    let label = "";
    let tooltip = "";
    let onClick: (() => void) | undefined = undefined;

    switch (state) {
        case 'checking':
            bgStyle = "bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400";
            icon = <RefreshCw className="w-5 h-5 animate-spin" />;
            label = t('status.connecting', 'Checking...');
            tooltip = isRtl ? "جاري التحقق من جسر الطباعة..." : "Checking bridge status...";
            break;
        case 'no_ip':
            bgStyle = "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 cursor-pointer";
            icon = <AlertCircle className="w-5 h-5 text-amber-500 animate-pulse" />;
            label = t('status.no_ip', 'Setup Bridge');
            tooltip = isRtl ? "لم يتم إعداد عنوان جسر الطباعة. اضغط للضبط." : "Bridge IP not configured. Click to configure.";
            onClick = () => router.push('/settings');
            break;
        case 'offline':
            bgStyle = "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/20 cursor-pointer";
            icon = <WifiOff className="w-5 h-5 text-red-500" />;
            label = t('status.offline', 'Bridge Offline');
            tooltip = isRtl ? "جسر الطباعة غير متصل. اضغط لإعادة المحاولة." : "Bridge offline. Click to retry.";
            onClick = () => {
                recheck();
            };
            break;
        case 'online':
            if (!printerConfigured) {
                bgStyle = "bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400 hover:bg-orange-500/20 cursor-pointer";
                icon = <AlertCircle className="w-5 h-5 text-orange-500" />;
                label = t('status.unconfigured', 'Setup Printers');
                tooltip = isRtl ? "جسر الطباعة متصل ولكن لم يتم إعداد أي طابعة. اضغط للضبط." : "Bridge online but no printers configured. Click to configure.";
                onClick = () => router.push('/settings');
            } else {
                bgStyle = "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400";
                icon = <Wifi className="w-5 h-5 text-emerald-500" />;
                label = t('status.active', 'Bridge Online');
                tooltip = isRtl ? `جسر الطباعة متصل (${version})` : `Bridge online (${version})`;
            }
            break;
    }

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={!onClick}
            className={cn(
                "relative flex items-center justify-center rounded-xl transition-all duration-300 group overflow-hidden border-2 w-full text-left",
                bgStyle,
                isExpanded ? "px-3 py-2.5 gap-3" : "h-10 p-0",
                !onClick && "cursor-default"
            )}
            title={tooltip}
        >
            {icon}
            
            {isExpanded && (
                <div className="flex flex-col items-start leading-none gap-1 min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-tighter">
                        {isRtl ? "جسر الأجهزة" : "HARDWARE BRIDGE"}
                    </span>
                    <span className="text-[12px] font-black truncate max-w-full">
                        {label}
                    </span>
                </div>
            )}
        </button>
    );
}

function Sidebar({ user, settings }: { user: any, settings?: any }) {
    const t = useTranslations('Sidebar');
    const [isExpanded, setIsExpanded] = useState(false);
    const rawPathname = usePathname();
    const pathname = rawPathname || '';
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
                className="px-3 py-2 flex items-center justify-between overflow-hidden border-b border-zinc-200/60 dark:border-white/5 transition-all duration-300 h-14"
            >
                <div className="flex items-center gap-2.5 mx-auto">
                    <CasperLogo
                        width={isExpanded ? 30 : 26}
                        height={isExpanded ? 30 : 26}
                        className="shrink-0 transition-all duration-300"
                    />
                    <span className={cn(
                        "font-black text-xs tracking-[0.25em] whitespace-nowrap text-foreground transition-all duration-300 uppercase",
                        isExpanded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-3 w-0 hidden pointer-events-none"
                    )}>
                        CASPER
                    </span>
                </div>
            </div>

            <nav className="flex-1 px-2 py-2 space-y-1 overflow-y-auto no-scrollbar">
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
                                title={!isExpanded ? t(item.key) : undefined}
                                className={cn(
                                    "relative flex items-center rounded-xl transition-all duration-200 group overflow-hidden",
                                    isExpanded ? "w-full gap-3 px-3 py-2 h-10" : "w-10 h-10 justify-center p-0 mx-auto",
                                    isActive
                                        ? "bg-slate-900 text-white shadow-sm dark:bg-cyan-500 dark:text-black dark:shadow-[0_0_15px_rgba(6,182,212,0.35)]"
                                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
                                )}
                            >
                                {isActive && (
                                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-pink-400 dark:hidden" />
                                )}
                                <item.icon strokeWidth={1.5} className={cn("w-5 h-5 shrink-0 relative z-10 transition-transform duration-200 group-hover:scale-105")} />
                                <span className={cn(
                                    "text-xs font-bold transition-all duration-200 whitespace-nowrap relative z-10 tracking-tight",
                                    isExpanded ? "opacity-100" : "opacity-0 w-0 hidden"
                                )}>
                                    {t(item.key)}
                                </span>
                            </Link>
                        );
                    })
                )}
            </nav>

            <div className="p-2 border-t border-zinc-200/60 dark:border-white/5 space-y-1.5 shrink-0">
                {/* Ultra-compact Language & Theme & Money Counter Row */}
                <div className={cn(
                    "flex items-center justify-center rounded-xl bg-slate-100/70 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 p-1 transition-all duration-200",
                    isExpanded ? "gap-1.5 px-2" : "gap-1"
                )}>
                    <LanguageSwitcher compact={true} />
                    <div className="w-[1px] h-3.5 bg-slate-300/60 dark:bg-white/10 shrink-0" />
                    <ModeToggle compact={true} />
                    
                    {/* Money Counter Popover */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <button
                                className="flex items-center justify-center rounded-md transition-all h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 shrink-0"
                                title="Money Counter"
                            >
                                <Calculator className="w-3.5 h-3.5" />
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
                </div>

                {/* Offline Sync Badge */}
                {(total > 0 || !isOnline) && (
                    <button
                        onClick={() => manualSync()}
                        className={cn(
                            "relative flex items-center justify-center rounded-xl transition-all duration-200 group overflow-hidden border",
                            !isOnline 
                                ? "bg-red-500/10 border-red-500/30 text-red-500" 
                                : "bg-orange-500/10 border-orange-500/30 text-orange-500",
                            isExpanded ? "w-full px-2.5 py-1.5 gap-2 h-9" : "w-10 h-8 p-0 mx-auto"
                        )}
                        title={isOnline ? `${total} pending syncs` : "Offline"}
                    >
                        {isOnline ? (
                            <RefreshCw className={cn("w-4 h-4", total > 0 && "animate-spin-slow")} />
                        ) : (
                            <Unplug className="w-4 h-4" />
                        )}
                        
                        {isExpanded && (
                            <div className="flex items-center gap-1.5 text-xs font-black">
                                <span>{!isOnline ? "Offline" : "Syncing"}</span>
                                {total > 0 && <span className="text-[10px] opacity-75">({total})</span>}
                            </div>
                        )}

                        {total > 0 && !isExpanded && (
                            <div className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                        )}
                    </button>
                )}

                {/* Hardware Bridge Connection Badge */}
                {mounted && !window.electronAPI?.isElectron && (
                    <BridgeStatusBadge isExpanded={isExpanded} locale={locale} router={router} />
                )}

                {/* Settings Link */}
                {(isAdmin || hasPermission(user?.permissions, PERMISSION_REGISTRY.ADMIN.MANAGE_SETTINGS) || hasPermission(user?.permissions, PERMISSION_REGISTRY.ADMIN.MANAGE_USERS)) && (
                    <Link
                        href={`/settings`}
                        title={!isExpanded ? t('settings') : undefined}
                        className={cn(
                            "relative flex items-center rounded-xl transition-all duration-200 group overflow-hidden",
                            isExpanded ? "w-full gap-3 px-3 py-2 h-10" : "w-10 h-10 justify-center p-0 mx-auto",
                            isSettingsActive
                                ? "bg-slate-900 text-white shadow-sm dark:bg-cyan-500 dark:text-black dark:shadow-[0_0_15px_rgba(6,182,212,0.35)]"
                                : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
                        )}
                    >
                        {isSettingsActive && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-pink-400 dark:hidden" />
                        )}
                        <Settings strokeWidth={1.5} className={cn("w-5 h-5 shrink-0 relative z-10 transition-transform duration-200 group-hover:rotate-45")} />
                        <span className={cn(
                            "text-xs font-bold transition-all duration-200 whitespace-nowrap relative z-10 tracking-tight",
                            isExpanded ? "opacity-100" : "opacity-0 w-0 hidden"
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
