import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ReactNode } from "react";

export default async function HQLayout({ children }: { children: ReactNode }) {
    const session = await getSession();

    if (!session?.user?.isGlobalAdmin) {
        redirect("/login");
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 font-cairo" dir="ltr">
            <header className="bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-white/10 p-4">
                <div className="container mx-auto flex items-center justify-between">
                    <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-widest uppercase">
                        Casper <span className="text-blue-600 dark:text-blue-400">HQ</span>
                    </h1>
                    <div className="flex items-center gap-4">
                        <span className="text-sm font-semibold text-slate-500">Super Admin</span>
                        <a href="/api/auth/logout" className="text-sm font-bold text-red-600 hover:underline">Logout</a>
                    </div>
                </div>
            </header>
            <main className="container mx-auto p-6">
                {children}
            </main>
        </div>
    );
}
