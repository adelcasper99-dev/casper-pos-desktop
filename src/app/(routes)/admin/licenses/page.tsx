import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import LicenseManagerPage from "@/components/admin/LicenseManagerPage";

export default async function AdminLicensesPage() {
    const session = await getSession();

    if (!session) {
        redirect("/login");
    }

    const isAdmin = session.user.role === "ADMIN" || 
                    session.user.role === "Admin" || 
                    session.user.role === "المالك" || 
                    session.user.isGlobalAdmin;

    if (!isAdmin) {
        redirect("/dashboard");
    }

    return (
        <main className="p-8 space-y-8 bg-slate-950/20 min-h-screen">
            <LicenseManagerPage />
        </main>
    );
}
