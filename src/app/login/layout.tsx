import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function LoginLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    try {
        const userCount = await prisma.user.count();
        if (userCount === 0) {
            redirect("/setup");
        }
    } catch (error) {
        // If DB isn't initialized yet or throws, it's safer to redirect to setup
        console.error("Failed to count users for setup intercept:", error);
        redirect("/setup");
    }

    return <>{children}</>;
}
