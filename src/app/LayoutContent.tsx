"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";

export default function LayoutContent({
    children,
    user
}: {
    children: React.ReactNode;
    user: any;
}) {
    const pathname = usePathname();
    const isLoginPage = pathname === "/";

    if (isLoginPage) {
        return <>{children}</>;
    }

    return (
        <div className="flex h-screen w-full overflow-hidden bg-background">
            {user && <Sidebar user={user} />}
            <main className="flex-1 overflow-y-auto custom-scrollbar relative">
                {children}
            </main>
        </div>
    );
}
