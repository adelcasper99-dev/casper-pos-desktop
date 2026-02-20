import { getUsersForPage } from "@/actions/users";
import UserManagement from "@/components/settings/UserManagement";
import { prisma } from "@/lib/prisma";

export default async function UsersPage() {
    const users = await getUsersForPage();
    const roles = await prisma.role.findMany({ orderBy: { name: 'asc' } });
    const branches = await prisma.branch.findMany({ orderBy: { name: 'asc' } });

    return (
        <UserManagement
            users={users}
            roles={roles}
            branches={branches}
        />
    );
}
