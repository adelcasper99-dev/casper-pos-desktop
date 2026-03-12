"use client";

import { useState, useMemo, memo, useEffect } from "react";
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
    Briefcase,
    Clock,
    History as HistoryIcon,
    type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

import { hasPermission, PERMISSIONS, PERMISSION_REGISTRY } from "@/lib/permissions";
import { logout } from "@/actions/auth";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { ModeToggle } from "@/components/mode-toggle";
import StaffProfileBadge from "@/components/staff/StaffProfileBadge";

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
    { key: "shifts", href: "/shifts", icon: Clock, permission: PERMISSION_REGISTRY.SHIFT.VIEW },
    { key: "hr", href: "/hr", icon: Briefcase, permission: PERMISSION_REGISTRY.HR.VIEW_ATTENDANCE },
    { key: "inventory", href: "/inventory", icon: Box, permission: PERMISSION_REGISTRY.INVENTORY.VIEW },
    { key: "customers", href: "/customers", icon: Users, permission: PERMISSION_REGISTRY.CUSTOMER.VIEW },
    { key: "purchasing", href: "/purchasing", icon: Truck, permission: PERMISSION_REGISTRY.PURCHASING.VIEW },
    { key: "treasury", href: "/treasury", icon: Landmark, permission: PERMISSION_REGISTRY.TREASURY.VIEW },
    { key: "logs", href: "/logs", icon: HistoryIcon as LucideIcon, permission: PERMISSION_REGISTRY.LOGS.VIEW },
    { key: "reports", href: "/reports", icon: BarChart3, permission: PERMISSION_REGISTRY.REPORTS.VIEW },
    { key: "maintenance_dashboard", href: "/maintenance/dashboard", icon: Activity, permission: PERMISSION_REGISTRY.REPORTS.VIEW },
    { key: "maintenance", href: "/maintenance/tickets", icon: Wrench, permission: PERMISSION_REGISTRY.TICKET.VIEW },
];

function Sidebar({ user }: { user: any }) {
    const t = useTranslations('Sidebar');
    const [isExpanded, setIsExpanded] = useState(false);
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const router = useRouter();
    const locale = useLocale();

    const [mounted, setMounted] = useState(false);
    const [itemsOrder, setItemsOrder] = useState<string[]>(MENU_ITEMS.map(i => i.key));

    useEffect(() => {
        setMounted(true);
        const saved = localStorage.getItem('sidebar_order');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                const validKeys = parsed.filter((key: string) => MENU_ITEMS.some(item => item.key === key));

                // Add any missing new items to the end
                const missingKeys = MENU_ITEMS.filter(item => !validKeys.includes(item.key)).map(i => i.key);
                setItemsOrder([...validKeys, ...missingKeys]);
            } catch (e) {
                console.error("Failed to parse sidebar order", e);
            }
        }
    }, []);

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
    const isAdmin = user?.role === 'ADMIN' || user?.role === 'Admin';

    const filteredItems = useMemo(() => {
        const visibleItems = MENU_ITEMS.filter(item => {
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
    }, [user, isAdmin, itemsOrder]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            setItemsOrder((items) => {
                const oldIndex = items.indexOf(active.id as string);
                const newIndex = items.indexOf(over.id as string);
                const newOrder = arrayMove(items, oldIndex, newIndex);

                if (typeof window !== 'undefined') {
                    localStorage.setItem('sidebar_order', JSON.stringify(newOrder));
                }

                return newOrder;
            });
        }
    };

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
                                    isActive = pathname.startsWith(targetPath);
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
                        else isActive = pathname.startsWith(targetPath);

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
                    })
                )}
            </nav>

            <div className="p-3 border-t border-border space-y-2">
                <div className={cn("flex gap-2 transition-all duration-300", isExpanded ? "flex-row" : "flex-col")}>
                    <LanguageSwitcher />
                    <ModeToggle />
                </div>

                {(isAdmin || hasPermission(user?.permissions, PERMISSION_REGISTRY.ADMIN.MANAGE_SETTINGS) || hasPermission(user?.permissions, PERMISSION_REGISTRY.ADMIN.MANAGE_USERS)) && (
                    <Link
                        href={`/settings`}
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
