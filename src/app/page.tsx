import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import LoginForm from "./LoginForm";

export default async function LoginPageServer() {
    const userCount = await prisma.user.count();

    // Redirect to /setup if there are no users in the system
    if (userCount === 0) {
        redirect("/setup");
    }

    return <LoginForm />;
}
