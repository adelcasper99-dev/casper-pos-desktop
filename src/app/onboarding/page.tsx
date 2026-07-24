import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import OnboardingGateway from "@/components/onboarding/OnboardingGateway";

export default async function OnboardingPage() {
    const settings = await prisma.storeSettings.findFirst({});

    const hasLicense = !!settings?.licenseJwt;
    const hasTrial = !!settings?.trialStartDate;

    // If already activated or trial started, don't allow access
    if (hasLicense || hasTrial) {
        redirect("/dashboard");
    }

    return (
        <main className="min-h-screen flex flex-col bg-slate-950 p-4 overflow-y-auto">
            <div className="m-auto w-full flex justify-center py-8">
                <OnboardingGateway />
            </div>
        </main>
    );
}
