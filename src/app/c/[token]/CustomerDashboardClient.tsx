"use client";

import { useState } from 'react';
import { User, Receipt, Wrench, Wallet, Calendar, ChevronLeft } from 'lucide-react';

export default function CustomerDashboardClient({ customer }: { customer: any }) {
    const [activeTab, setActiveTab] = useState<'tickets' | 'sales' | 'ledger'>('tickets');
    
    // Balance color logic
    const balance = Number(customer.balance);
    const balanceColor = balance > 0 ? 'text-red-400' : balance < 0 ? 'text-green-400' : 'text-slate-300';
    const balanceGradient = balance > 0 ? 'from-red-500/20 to-transparent' : balance < 0 ? 'from-green-500/20 to-transparent' : 'from-blue-500/20 to-transparent';

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 pb-20 font-sans" dir="rtl">
            {/* Ambient Backgrounds */}
            <div className={`absolute top-0 right-0 w-full h-64 bg-gradient-to-b ${balanceGradient} opacity-50 pointer-events-none`} />

            {/* Header Profile */}
            <header className="px-6 pt-12 pb-6 flex flex-col items-center relative z-10">
                <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mb-4 border border-slate-700/50 shadow-xl">
                    <User className="w-8 h-8 text-slate-400" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-1">{customer.name}</h1>
                <p className="text-slate-400 text-sm mb-6">{customer.phone}</p>
                
                <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl w-full p-6 text-center shadow-2xl relative overflow-hidden">
                    <div className="absolute -right-4 -top-4 w-16 h-16 bg-blue-500/10 rounded-full blur-xl" />
                    <p className="text-sm text-slate-400 mb-2">رصيد الحساب الحالي</p>
                    <h2 className={`text-4xl flex items-center justify-center gap-1 font-black tracking-tight ${balanceColor}`}>
                        <span dir="ltr">{(-balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span> <span className="text-base font-normal opacity-70">ج.م</span>
                    </h2>
                    {balance > 0 && <p className="text-xs text-red-400/80 mt-2">مديونية مستحقة</p>}
                    {balance < 0 && <p className="text-xs text-green-400/80 mt-2">رصيد دائن لك</p>}
                </div>
            </header>

            {/* Segmented Control / Tabs */}
            <div className="px-6 mb-6 sticky top-4 z-20">
                <div className="flex bg-slate-900/80 backdrop-blur-md p-1 rounded-2xl border border-slate-800">
                    <button 
                        onClick={() => setActiveTab('tickets')}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'tickets' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        <Wrench className="w-4 h-4" /> الصيانة
                    </button>
                    <button 
                        onClick={() => setActiveTab('sales')}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'sales' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        <Receipt className="w-4 h-4" /> الفواتير
                    </button>
                    <button 
                        onClick={() => setActiveTab('ledger')}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'ledger' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        <Wallet className="w-4 h-4" /> كشف حساب
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <main className="px-6">
                {activeTab === 'tickets' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {customer.tickets.length === 0 ? (
                            <div className="text-center text-slate-500 py-10 bg-slate-900/30 rounded-2xl border border-slate-800 border-dashed">
                                لا توجد تذاكر صيانة حالياً
                            </div>
                        ) : (
                            customer.tickets.map((t: any) => (
                                <div key={t.id} className="bg-slate-900/60 backdrop-blur-sm border border-slate-800 p-5 rounded-2xl">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <h3 className="font-semibold text-white">{t.deviceBrand} {t.deviceModel}</h3>
                                            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                                                <Calendar className="w-3 h-3" /> 
                                                {new Date(t.createdAt).toLocaleDateString('ar-EG')}
                                            </p>
                                        </div>
                                        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                                            t.status === 'COMPLETED' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                                            t.status === 'IN_PROGRESS' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                            (t.status === 'DELIVERED' || t.status === 'PAID_DELIVERED') ? 'bg-slate-500/10 text-slate-400 border-slate-500/20' :
                                            'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                                        }`}>
                                            {t.status === 'COMPLETED' ? 'جاهز للاستلام' : 
                                             t.status === 'IN_PROGRESS' ? 'قيد الإصلاح' :
                                             (t.status === 'DELIVERED' || t.status === 'PAID_DELIVERED') ? 'تم التسليم' :
                                             t.status === 'CANCELLED' ? 'ملغي' : 'في الانتظار'}
                                        </span>
                                    </div>
                                    <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/50 text-sm">
                                        <p className="text-slate-300"><span className="text-slate-500">المشكلة:</span> {t.issueDescription}</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {activeTab === 'sales' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {customer.sales.length === 0 ? (
                            <div className="text-center text-slate-500 py-10 bg-slate-900/30 rounded-2xl border border-slate-800 border-dashed">
                                لا توجد فواتير سابقة
                            </div>
                        ) : (
                            customer.sales.map((s: any) => (
                                <div key={s.id} className="bg-slate-900/60 backdrop-blur-sm border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
                                    <div>
                                        <h3 className="font-semibold text-white mb-1">فاتورة مبيعات</h3>
                                        <p className="text-xs text-slate-400 flex items-center gap-1">
                                            <Calendar className="w-3 h-3" /> 
                                            {new Date(s.createdAt).toLocaleDateString('ar-EG')}
                                        </p>
                                    </div>
                                    <div className="text-left">
                                        <div className="text-lg font-bold text-white">
                                            {Number(s.totalAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                        </div>
                                        <span className="text-xs text-slate-500 block">ج.م</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {activeTab === 'ledger' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {customer.transactions.length === 0 ? (
                            <div className="text-center text-slate-500 py-10 bg-slate-900/30 rounded-2xl border border-slate-800 border-dashed">
                                لا توجد حركات مالية مسجلة
                            </div>
                        ) : (
                            <div className="relative border-r-2 border-slate-800 pr-4 mr-2 space-y-6">
                                {customer.transactions.map((tx: any) => (
                                    <div key={tx.id} className="relative">
                                        <div className={`absolute -right-[23px] top-1 w-3 h-3 rounded-full border-2 border-slate-950 ${tx.type === 'CREDIT' ? 'bg-green-500' : 'bg-red-500'}`} />
                                        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
                                            <div className="flex justify-between items-start mb-2">
                                                <h4 className="text-sm font-medium text-slate-200">{tx.description}</h4>
                                                <div className={`font-bold flex items-center gap-1 ${tx.type === 'CREDIT' ? 'text-green-400' : 'text-red-400'}`}>
                                                    <span dir="ltr">{tx.type === 'CREDIT' ? '+' : '-'}{Number(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                                </div>
                                            </div>
                                            <p className="text-xs text-slate-500">
                                                {new Date(tx.createdAt).toLocaleString('ar-EG')}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
