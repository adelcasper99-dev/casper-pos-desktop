import { useMemo } from "react";
import {
    LayoutDashboard,
    ShoppingCart,
    Box,
    Users,
    Landmark,
    BarChart3,
    Truck,
    Wrench,
    Smartphone,
    Briefcase,
    History as HistoryIcon,
    Undo2,
    FileText,
    type LucideIcon
} from "lucide-react";
import { hasPermission, PERMISSION_REGISTRY } from "@/lib/permissions";

export interface NavItem {
    key: string;
    href: string;
    icon: LucideIcon;
    permission?: string | null;
}

export const MENU_ITEMS: NavItem[] = [
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

export interface NavUser {
    id?: string;
    username?: string;
    name?: string | null;
    role?: string;
    branchName?: string;
    permissions?: string | string[] | null;
    [key: string]: unknown;
}

export interface NavSettings {
    licenseJwt?: string | null;
    licenseKey?: string | null;
    features?: string | Record<string, boolean>;
    [key: string]: unknown;
}

export function useFilteredNavItems(user?: NavUser | null, settings?: NavSettings | null, customOrder?: string[]): {
    filteredItems: NavItem[];
    features: Record<string, boolean>;
    isAdmin: boolean;
} {
    const isAdmin = user?.role === "ADMIN" || user?.role === "Admin";

    const features: Record<string, boolean> = useMemo(() => {
        try {
            return typeof settings?.features === "string"
                ? JSON.parse(settings.features)
                : settings?.features || {};
        } catch {
            return {};
        }
    }, [settings?.features]);

    const filteredItems = useMemo(() => {
        const visibleItems = MENU_ITEMS.filter((item) => {
            // 1. Check Feature Toggle (Enabled by default if not specified)
            const featureKey = item.key.includes("maintenance")
                ? "maintenance"
                : item.key === "returns"
                ? "returns"
                : item.key === "logs"
                ? "reports"
                : item.key;

            if (item.key === "returns") {
                const isPosEnabled = features["pos"] !== false;
                const isMaintenanceEnabled = features["maintenance"] !== false;
                const isPurchasingEnabled = features["purchasing"] !== false;
                if (!isPosEnabled && !isMaintenanceEnabled && !isPurchasingEnabled) return false;

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

        // Sort items according to custom order if provided
        if (customOrder && customOrder.length > 0) {
            return [...visibleItems].sort((a, b) => {
                const indexA = customOrder.indexOf(a.key);
                const indexB = customOrder.indexOf(b.key);
                return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
            });
        }

        return visibleItems;
    }, [user, isAdmin, customOrder, features]);

    return { filteredItems, features, isAdmin };
}
