
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import SetupWizard from "@/components/setup/SetupWizard";

export default async function SetupPage() {
    // 1. Double check: if users already exist, redirect away to dashboard
    const userCount = await prisma.user.count();
    if (userCount > 0) {
        redirect("/dashboard");
    }

    // 2. Clear any accidental session cookie
    cookies().delete("session");

    return (
        <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="w-full max-w-4xl">
                <SetupWizard />
            </div>
        </main>
    );
}
