import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import OnboardingGateway from "@/components/onboarding/OnboardingGateway";

export default async function OnboardingPage() {
    const settings = await prisma.storeSettings.findUnique({
        where: { id: "settings" }
    });

    const hasLicense = !!settings?.licenseJwt;
    const hasTrial = !!settings?.trialStartDate;

    // If already activated or trial started, don't allow access
    if (hasLicense || hasTrial) {
        redirect("/dashboard");
    }

    return (
        <main className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
            <OnboardingGateway />
        </main>
    );
}
