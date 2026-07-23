import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import LoginForm from "./LoginForm";
import { getSession } from "@/lib/auth";
import { headers } from "next/headers";

export default async function LoginPageServer() {
    const reqHeaders = await headers();
    const host = reqHeaders.get('host') || '';
    const isHq = host.startsWith('hq.') || host.startsWith('admin.');

    const session = await getSession();
    if (session) {
        redirect(isHq ? "/casper-hq" : "/dashboard");
    }

    if (isHq) {
        // HQ never shows onboarding, just login
        return <LoginForm />;
    }
    // 1. Check license / trial
    const settings = await prisma.storeSettings.findUnique({
        where: { id: "settings" }
    });

    const hasLicense = !!settings?.licenseJwt;
    const hasTrial = !!settings?.trialStartDate;

    if (!hasLicense && !hasTrial) {
        redirect("/onboarding");
    }

    // 2. Redirect to /setup if there are no users in the system
    const userCount = await prisma.user.count();
    if (userCount === 0) {
        redirect("/setup");
    }

    return <LoginForm />;
}
