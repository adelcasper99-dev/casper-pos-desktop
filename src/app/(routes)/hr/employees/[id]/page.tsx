import { Suspense } from 'react'
import { getEmployeeProfileData } from '@/actions/hr-profile'
import EmployeeProfileClient from '@/components/hr/EmployeeProfileClient'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default async function EmployeeProfilePage({ params }: { params: { id: string } }) {
    const session = await getSession()
    if (!session) redirect('/auth/login')

    const { id } = params
    const monthStr = new Date().toISOString().substring(0, 7) // Default to current month

    const res = await getEmployeeProfileData(id, monthStr)

    if (!res.success || !res.data) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <h1 className="text-2xl font-bold text-red-400">Error Loading Profile</h1>
                <p className="text-zinc-400">{res.error || 'Unknown error occurred'}</p>
            </div>
        )
    }

    return (
        <div className="p-6 max-w-none mx-auto space-y-6">
            <Suspense fallback={<div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-cyan-500" /></div>}>
                <EmployeeProfileClient 
                    initialData={res.data} 
                    userId={id} 
                    monthStr={monthStr}
                />
            </Suspense>
        </div>
    )
}
