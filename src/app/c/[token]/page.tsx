import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getPortalData } from '@/actions/customer-actions';
import CustomerDashboardClient from './CustomerDashboardClient';

export default async function CustomerPortalPage({ params }: { params: { token: string } }) {
    const token = params.token;
    
    // 1. Verify Authentication Cookie
    const cookieStore = cookies();
    const isAuthenticated = cookieStore.get(`c-auth-${token}`);
    
    if (!isAuthenticated?.value) {
        redirect(`/c/${token}/pin`);
    }

    // 2. Fetch Customer Data
    try {
        const customer = await getPortalData(token);
        
        // Pass to interactive client component
        return (
            <CustomerDashboardClient customer={customer} />
        );
    } catch (error) {
        return (
            <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4" dir="rtl">
                <h1 className="text-2xl font-bold text-red-400 mb-2">عذراً</h1>
                <p className="text-slate-400 text-center">لم يتم العثور على بيانات العميل أو الرابط منتهي الصلاحية.</p>
            </div>
        );
    }
}
