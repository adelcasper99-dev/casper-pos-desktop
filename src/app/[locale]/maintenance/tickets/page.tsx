import { getCurrentUser } from "@/actions/auth";
import TicketsClientPage from "@/components/tickets/TicketsClientPage";
import { redirect } from "next/navigation";

export default async function MaintenanceTicketsPage() {
    const user = await getCurrentUser();
    if (!user) redirect("/login");

    return <TicketsClientPage user={user} />;
}
