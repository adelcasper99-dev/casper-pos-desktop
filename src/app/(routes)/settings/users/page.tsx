import { getUsersForPage } from "@/actions/users";
import UserManagement from "@/components/settings/UserManagement";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export default async function UsersPage() {
    const session = await getSession();
    const users = await getUsersForPage();
    const roles = await prisma.role.findMany({ orderBy: { name: 'asc' } });
    const branches = await prisma.branch.findMany({ orderBy: { name: 'asc' } });

    if (!session?.user) return null;

    return (
        <UserManagement
            users={users}
            roles={roles}
            branches={branches}
            currentUser={session.user}
        />
    );
}
