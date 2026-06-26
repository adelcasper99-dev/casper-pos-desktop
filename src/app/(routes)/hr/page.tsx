import HRClient from "./HRClient"
import { getSession } from "@/lib/auth"
import { getCSRFToken } from "@/lib/csrf"
import { PERMISSIONS, hasPermission } from "@/lib/permissions"
import { redirect } from "next/navigation"

export const metadata = {
    title: 'HR Management - Casper POS',
    description: 'Manage staff directory and attendance'
}

export default async function HRPage() {
    const session = await getSession()

    if (!session?.user) {
        redirect(`/login`)
    }

    const hasAccess = hasPermission(session.user.permissions, PERMISSIONS.HR_VIEW_ATTENDANCE) || session.user.role === 'ADMIN'

    if (!hasAccess) {
        redirect(`/dashboard`)
    }

    const csrfToken = await getCSRFToken() || ""

    return <HRClient csrfToken={csrfToken} currentUserId={session.user.id} branchId={session.user.branchId || ""} />
}
