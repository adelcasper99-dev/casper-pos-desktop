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
    return (
        <Card className="col-span-1 lg:col-span-3">
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-slate-500" />
                        Branch Performance Matrix
                    </CardTitle>
                    <div className="text-xs text-slate-400">KPI comparisons across active locations</div>
                </div>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-20 bg-slate-50 animate-pulse rounded" />
                        ))}
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {data?.map((branch) => (
                            <div key={branch.branchId} className="border rounded-xl p-4 bg-white hover:border-blue-200 transition-all group relative">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="font-bold text-slate-700">{branch.branchName}</div>
                                    <div className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-mono">
                                        ID: {branch.branchId.slice(0, 4)}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 text-xs">
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-1 text-slate-400">
                                            <Briefcase className="h-3 w-3" />
                                            Active
                                        </div>
                                        <button
                                            onClick={() => onDrillDown(branch.branchId, 'BRANCH_ACTIVE')}
                                            className="font-bold text-blue-600 hover:underline text-left"
                                        >
                                            {branch.activeTickets} Tickets
                                        </button>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-1 text-slate-400">
                                            <Clock className="h-3 w-3" />
                                            Avg Time
                                        </div>
                                        <div className="font-bold text-slate-700">{branch.avgRepairTime}h</div>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-1 text-slate-400">
                                            <DollarSign className="h-3 w-3" />
                                            Revenue
                                        </div>
                                        <div className="font-bold text-green-600">{Number(branch.serviceRevenue).toLocaleString()} EGP</div>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-1 text-slate-400 text-[10px]">
                                            Net Profit
                                        </div>
                                        <div className={`font-bold ${branch.netProfit > 0 ? 'text-blue-600' : 'text-amber-600'}`}>
                                            {Number(branch.netProfit).toLocaleString()} EGP
                                        </div>
                                    </div>
                                </div>

                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <ArrowRight className="h-4 w-4 text-slate-300" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {(!data || data.length === 0) && !loading && (
                    <div className="p-12 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed">
                        No branch data available for this range
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
