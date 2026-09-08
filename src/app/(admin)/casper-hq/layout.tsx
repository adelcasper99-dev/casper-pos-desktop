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
            <header className="bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-white/10 px-4 py-3 sm:px-6 sm:py-4 sticky top-0 z-30 shadow-sm backdrop-blur-md bg-white/95 dark:bg-zinc-900/95">
                <div className="container mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black text-sm border border-blue-500/20">
                            HQ
                        </div>
                        <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-widest uppercase">
                            Casper <span className="text-blue-600 dark:text-blue-400">Control</span>
                        </h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="hidden sm:inline-block text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-zinc-300">
                            Super Admin
                        </span>
                        <a
                            href="/api/auth/logout"
                            className="text-xs sm:text-sm font-bold text-rose-600 hover:text-rose-700 dark:text-rose-400 p-2 sm:px-3 sm:py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors min-h-[44px] flex items-center"
                        >
                            تسجيل الخروج
                        </a>
                    </div>
                </div>
            </header>
            <main className="container mx-auto px-3 py-4 sm:px-6 sm:py-6">
                {children}
            </main>
        </div>
    );
}
