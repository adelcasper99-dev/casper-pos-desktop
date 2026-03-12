import HRClient from "./HRClient"
import { getSession } from "@/lib/auth"
import { getCSRFToken } from "@/lib/csrf"
import { PERMISSIONS } from "@/lib/permissions/registry"
import { redirect } from "next/navigation"

export const metadata = {
    title: 'HR Management - Casper POS',
    description: 'Manage staff directory and attendance'
}

export default async function HRPage({ params: { locale } }: { params: { locale: string } }) {
    const session = await getSession()

    if (!session?.user) {
        redirect(`/${locale}/login`)
    }

    const hasAccess = session.user.permissions?.includes(PERMISSIONS.HR_VIEW_ATTENDANCE) || session.user.role === 'ADMIN'

    if (!hasAccess) {
        redirect(`/${locale}/dashboard`)
    }

    const csrfToken = await getCSRFToken() || ""

    return <HRClient csrfToken={csrfToken} />
}
