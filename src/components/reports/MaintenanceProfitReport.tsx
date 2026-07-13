'use client';

import { useState, useEffect, useTransition } from "react";
import { getMaintenanceProfitReport, getTechnicians } from "@/actions/reports/maintenance";
import { MaintenanceProfitKPIs } from "@/components/reports/MaintenanceProfitKPIs";
import { MaintenanceProfitTable } from "@/components/reports/MaintenanceProfitTable";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from "@/components/ui/select";
import { Calendar } from "lucide-react";
import { startOfMonth, endOfMonth, format, subDays, startOfDay, endOfDay } from "date-fns";
import { CasperLoader } from "@/components/ui/CasperLoader";
import { FlatpickrRangePicker } from "@/components/ui/flatpickr-range-picker";
import { cn } from "@/lib/utils";

export function MaintenanceProfitReport({ isTab = false }: { isTab?: boolean }) {
    const [isPending, startTransition] = useTransition();
    const [reportData, setReportData] = useState<any>(null);
    const [technicians, setTechnicians] = useState<any[]>([]);
    
    // Filters State
    const [filters, setFilters] = useState({
        startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
        technicianId: 'all',
        customerName: ''
    });

    // Fetch Technicians on Mount
    useEffect(() => {
        getTechnicians().then(res => {
            if (res.success) setTechnicians(res.technicians);
        });
    }, []);

    // Fetch Report Data when filters change
    useEffect(() => {
        fetchReport();
    }, [filters.startDate, filters.endDate, filters.technicianId]);

    const fetchReport = () => {
        startTransition(async () => {
            const res = await getMaintenanceProfitReport(filters);
            if (res.success) {
                setReportData(res.data);
            }
        });
    };

    const handleDateRangeChange = (range: Date[]) => {
        if (range && range.length === 2) {
            setFilters(prev => ({
                ...prev,
                startDate: format(range[0], 'yyyy-MM-dd'),
                endDate: format(range[1], 'yyyy-MM-dd')
            }));
        }
    };

    const applyPreset = (preset: 'today' | 'yesterday' | 'month') => {
        const now = new Date();
        let start = now;
        let end = now;

        switch (preset) {
            case 'today':
                start = startOfDay(now);
                end = endOfDay(now);
                break;
            case 'yesterday':
                start = startOfDay(subDays(now, 1));
                end = endOfDay(subDays(now, 1));
                break;
            case 'month':
                start = startOfMonth(now);
                end = endOfMonth(now);
                break;
        }

        setFilters(prev => ({
            ...prev,
            startDate: format(start, 'yyyy-MM-dd'),
            endDate: format(end, 'yyyy-MM-dd')
        }));
    };

    return (
        <div className={cn(
            "space-y-8 transition-colors duration-300 max-w-[2400px] mx-auto",
            isTab ? "" : "p-6 min-h-screen"
        )}>
            {!isTab && (
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex flex-col gap-1">
                        <h1 className="text-3xl font-extrabold tracking-tight text-foreground leading-tight">
                            تقرير أرباح الصيانة
                        </h1>
                        <p className="text-muted-foreground text-sm font-medium">
                            تحليل تفصيلي لأرباح العمالة وقطع الغيار وعمولات المهندسين
                        </p>
                    </div>
                </div>
            )}

            {/* Filter Bar */}
            <div className="p-5 glass-card bg-card/50 backdrop-blur-md border border-border rounded-2xl shadow-2xl transition-all duration-300">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                    <div className="space-y-2.5">
                        <div className="flex items-center justify-between px-1">
                            <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">الفترة الزمنية</Label>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => applyPreset('today')}
                                    className="text-[9px] font-black text-muted-foreground hover:text-primary transition-all uppercase tracking-tighter bg-muted/50 px-2 py-1 rounded-lg border border-border hover:border-primary/30"
                                >
                                    اليوم
                                </button>
                                <button 
                                    onClick={() => applyPreset('yesterday')}
                                    className="text-[9px] font-black text-muted-foreground hover:text-primary transition-all uppercase tracking-tighter bg-muted/50 px-2 py-1 rounded-lg border border-border hover:border-primary/30"
                                >
                                    أمس
                                </button>
                                <button 
                                    onClick={() => applyPreset('month')}
                                    className="text-[9px] font-black text-muted-foreground hover:text-primary transition-all uppercase tracking-tighter bg-muted/50 px-2 py-1 rounded-lg border border-border hover:border-primary/30"
                                >
                                    الشهر
                                </button>
                            </div>
                        </div>
                        <FlatpickrRangePicker 
                            initialDates={[new Date(filters.startDate), new Date(filters.endDate)]}
                            onRangeChange={handleDateRangeChange}
                            onClear={() => {
                                // Default back to current month
                                setFilters(prev => ({
                                    ...prev,
                                    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
                                    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd')
                                }));
                            }}
                            placeholder="اختر الفترة"
                            className="bg-muted/30 border-border rounded-xl h-11"
                        />
                    </div>

                    <div className="space-y-2.5">
                        <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pr-1">المهندس المسئول</Label>
                        <Select 
                            value={filters.technicianId} 
                            onValueChange={(val) => setFilters(prev => ({ ...prev, technicianId: val }))}
                        >
                            <SelectTrigger className="bg-muted/30 border-border text-foreground h-11 rounded-xl focus:ring-primary/20 transition-all">
                                <SelectValue placeholder="كل المهندسين" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border text-foreground rounded-xl shadow-2xl">
                                <SelectItem value="all">كل المهندسين</SelectItem>
                                {technicians.map(tech => (
                                    <SelectItem key={tech.id} value={tech.id}>
                                        {tech.name || tech.username}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2.5">
                        <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pr-1">بحث بالعميل</Label>
                        <div className="relative group">
                            <Input 
                                className="pr-10 bg-muted/30 border-border text-foreground h-11 rounded-xl focus:ring-primary/20 placeholder:text-muted-foreground/40 transition-all font-medium"
                                placeholder="اسم أو هاتف العميل..."
                                value={filters.customerName}
                                onChange={(e) => setFilters(prev => ({ ...prev, customerName: e.target.value }))}
                                onKeyDown={(e) => e.key === 'Enter' && fetchReport()}
                            />
                            <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-muted-foreground/30 group-focus-within:text-primary transition-colors">
                                <Calendar className="w-4 h-4" />
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center">
                         <button 
                            onClick={fetchReport}
                            disabled={isPending}
                            className="w-full h-11 px-6 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-cyan-900/20 disabled:opacity-50 flex items-center justify-center gap-2"
                         >
                            {isPending ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
                            {isPending ? 'جاري التحميل...' : 'تحديث البيانات'}
                         </button>
                    </div>
                </div>
            </div>

            {/* Content Section */}
            {isPending && !reportData ? (
                <div className="flex items-center justify-center p-20">
                    <CasperLoader />
                </div>
            ) : reportData ? (
                <div className={isPending ? "opacity-50 transition-opacity" : ""}>
                    <MaintenanceProfitKPIs data={reportData.kpis} />
                    
                    <div className="flex flex-col gap-6">
                        <div className="flex items-center justify-between px-1">
                            <h3 className="text-xl font-bold text-foreground flex items-center gap-3">
                                <div className="w-2 h-8 bg-primary rounded-full shadow-[0_0_15px_rgba(var(--primary),0.5)]" />
                                تفاصيل التذاكر 
                                <span className="text-muted-foreground text-sm font-medium mr-2">({reportData.tickets.length})</span>
                            </h3>
                        </div>
                        <MaintenanceProfitTable tickets={reportData.tickets} />
                    </div>
                </div>
            ) : null}
        </div>
    );
}
