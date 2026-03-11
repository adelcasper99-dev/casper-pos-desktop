'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Building2,
    ArrowRight,
    Clock,
    Briefcase,
    DollarSign
} from 'lucide-react';
import { useTranslations } from "@/lib/i18n-mock";

interface BranchMatrixItem {
    branchId: string;
    branchName: string;
    activeTickets: number;
    avgRepairTime: string;
    sparePartsCost: number;
    serviceRevenue: number;
    netProfit: number;
}

interface MatrixProps {
    data: BranchMatrixItem[] | null;
    loading: boolean;
    onDrillDown: (branchId: string, type: string) => void;
}

export const BranchPerformanceMatrix: React.FC<MatrixProps> = ({ data, loading, onDrillDown }) => {
    const t = useTranslations("MaintenanceHQ.branchMatrix");
    return (
        <Card className="col-span-1 lg:col-span-3 border-border/50 shadow-2xl bg-zinc-950/40 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border/5 pr-6">
                <div>
                    <CardTitle className="text-xl font-bold flex items-center gap-3 tracking-tight text-white">
                        <Building2 className="h-5 w-5 text-cyan-500" />
                        {t('title')}
                    </CardTitle>
                    <div className="text-xs text-muted-foreground font-medium mt-1">{t('subtitle')}</div>
                </div>
            </CardHeader>
            <CardContent className="pt-6">
                {loading ? (
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-32 bg-zinc-900/50 animate-pulse rounded-2xl border border-border/20" />
                        ))}
                    </div>
                ) : (
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {data?.map((branch) => (
                            <div
                                key={branch.branchId}
                                className="border border-border/40 rounded-2xl p-5 bg-zinc-900/40 hover:bg-zinc-900 hover:border-cyan-500/50 transition-all duration-300 group relative shadow-lg"
                            >
                                <div className="flex justify-between items-start mb-6">
                                    <div className="font-bold text-white text-base tracking-tight">{branch.branchName}</div>
                                    <div className="text-[10px] bg-cyan-500/10 text-cyan-400 px-2.5 py-1 rounded-full font-mono border border-cyan-500/20">
                                        ID: {branch.branchId.slice(0, 4)}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-y-5 gap-x-4 text-xs">
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex items-center gap-1.5 text-zinc-500 font-medium">
                                            <Briefcase className="h-3.5 w-3.5" />
                                            {t('active')}
                                        </div>
                                        <button
                                            onClick={() => onDrillDown(branch.branchId, 'BRANCH_ACTIVE')}
                                            className="font-bold text-cyan-400 hover:text-cyan-300 transition-colors text-left text-sm"
                                        >
                                            {branch.activeTickets} {useTranslations('MaintenanceHQ.aging')('tickets')}
                                        </button>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex items-center gap-1.5 text-zinc-500 font-medium">
                                            <Clock className="h-3.5 w-3.5" />
                                            {t('avgTime')}
                                        </div>
                                        <div className="font-bold text-white text-sm">{branch.avgRepairTime}h</div>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex items-center gap-1.5 text-zinc-500 font-medium">
                                            <DollarSign className="h-3.5 w-3.5" />
                                            {t('revenue')}
                                        </div>
                                        <div className="font-bold text-emerald-400 text-sm">{Number(branch.serviceRevenue).toLocaleString()} <span className="text-[10px] font-normal opacity-50">EGP</span></div>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex items-center gap-1.5 text-zinc-500 font-medium text-[10px]">
                                            {t('netProfit')}
                                        </div>
                                        <div className={`font-bold text-base ${branch.netProfit > 0 ? 'text-cyan-400' : 'text-rose-400'}`}>
                                            {Number(branch.netProfit).toLocaleString()} <span className="text-[10px] font-normal opacity-50">EGP</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="absolute top-4 right-4 opacity-10 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                                    <ArrowRight className="h-4 w-4 text-cyan-500" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {(!data || data.length === 0) && !loading && (
                    <div className="py-16 text-center text-zinc-500 bg-zinc-900/20 rounded-2xl border border-dashed border-border/30">
                        <div className="text-sm italic">{t('noActivity')}</div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
