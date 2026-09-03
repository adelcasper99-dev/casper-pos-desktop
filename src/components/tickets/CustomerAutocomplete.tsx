'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { searchCustomers } from '@/actions/customer-actions';
import { Search, User, Phone, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Customer {
    id: string;
    name: string;
    phone: string;
    email?: string;
    balance?: number;
    linkedEmployeeId?: string | null;
}

interface CustomerAutocompleteProps {
    onSelect: (customer: Customer) => void;
    onNewCustomer?: (phoneOrName: string) => void;
    placeholder?: string;
    className?: string;
}

export function CustomerAutocomplete({ onSelect, onNewCustomer, placeholder = "Search existing customers...", className }: CustomerAutocompleteProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Customer[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (query.length < 2) {
            setResults([]);
            setOpen(false);
            return;
        }

        setLoading(true);
        const search = async () => {
            const res = await searchCustomers(query);
            if (res.success && res.customers) {
                // Filter out customers with null IDs (need to be created) and map to Customer type
                const validCustomers: Customer[] = res.customers
                    .filter(c => c.id !== null)
                    .map(c => ({
                        id: c.id as string,
                        name: c.name,
                        phone: c.phone,
                        email: c.email || undefined,
                        balance: typeof c.balance === 'number' ? c.balance : Number(c.balance || 0),
                        linkedEmployeeId: c.linkedEmployeeId
                    }));
                setResults(validCustomers);
                setOpen(true);
            }
            setLoading(false);
        };

        const debounce = setTimeout(search, 250);
        return () => clearTimeout(debounce);
    }, [query]);

    const handleQuickNew = (val: string) => {
        if (onNewCustomer) {
            onNewCustomer(val);
        }
        setQuery('');
        setOpen(false);
    };

    return (
        <div className="relative group/autocomplete w-full">
            <div className="relative">
                <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within/autocomplete:text-cyan-500 transition-colors pointer-events-none z-10" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => {
                        if (query.length >= 2) setOpen(true);
                    }}
                    onBlur={() => setTimeout(() => setOpen(false), 250)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && query.trim()) {
                            e.preventDefault();
                            if (results.length > 0) {
                                onSelect(results[0]);
                                setQuery('');
                                setOpen(false);
                            } else if (onNewCustomer) {
                                handleQuickNew(query.trim());
                            }
                        }
                    }}
                    placeholder={placeholder}
                    className={cn(
                        "ps-9 pe-9 h-10 bg-white/70 dark:bg-zinc-950/60 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-xs placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:border-cyan-500/50 dark:focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all font-medium rounded-xl shadow-sm",
                        className
                    )}
                />
                {loading ? (
                    <div className="absolute end-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                        <Loader2 className="h-4 w-4 text-cyan-500 animate-spin" />
                    </div>
                ) : query ? (
                    <button
                        type="button"
                        onClick={() => { setQuery(''); setResults([]); setOpen(false); }}
                        className="absolute end-3 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-md hover:bg-slate-200/50 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                ) : null}
            </div>

            {open && (results.length > 0 || (onNewCustomer && query.length >= 2)) && (
                <div className="absolute top-full mt-2 w-full z-[100] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-slate-200 dark:border-white/10 shadow-2xl rounded-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-2 max-h-[340px] overflow-y-auto custom-scrollbar space-y-1">
                        {results.length > 0 && (
                            <div className="px-3 py-1.5 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                    نتائج العملاء المسجلين ({results.length})
                                </p>
                                <span className="text-[10px] text-zinc-400 font-mono">اضغط Enter للاختيار</span>
                            </div>
                        )}

                        {results.map((customer) => (
                            <button
                                key={customer.id}
                                type="button"
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    onSelect(customer);
                                    setQuery('');
                                    setOpen(false);
                                }}
                                className="w-full group/item cursor-pointer hover:bg-slate-100/80 dark:hover:bg-white/5 p-2.5 flex items-center gap-3 rounded-xl transition-all text-start border border-transparent hover:border-slate-200/60 dark:hover:border-white/5"
                            >
                                <div className="h-9 w-9 rounded-lg bg-cyan-500/10 dark:bg-cyan-500/15 flex items-center justify-center text-cyan-600 dark:text-cyan-400 group-hover/item:scale-105 transition-transform shrink-0">
                                    <User className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="font-bold text-sm text-slate-900 dark:text-white group-hover/item:text-cyan-600 dark:group-hover/item:text-cyan-400 transition-colors truncate">
                                            {customer.name}
                                        </p>
                                        {customer.balance !== undefined && customer.balance > 0 && (
                                            <span className="text-[10px] bg-red-500/10 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded border border-red-500/20 font-mono font-bold">
                                                عليه: {Number(customer.balance)}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <Phone className="h-3 w-3 opacity-60" />
                                        <span className="font-mono">{customer.phone}</span>
                                        {customer.linkedEmployeeId && (
                                            <span className="text-[9px] bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 px-1.5 py-0.2 rounded">
                                                موظف
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </button>
                        ))}

                        {onNewCustomer && query.trim().length >= 2 && (
                            <button
                                type="button"
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleQuickNew(query.trim());
                                }}
                                className="w-full flex items-center justify-between p-2.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 transition-all font-bold text-xs group/new"
                            >
                                <div className="flex items-center gap-2">
                                    <User className="w-3.5 h-3.5 text-cyan-500" />
                                    <span>تسجيل كعميل جديد: <span className="font-mono font-black underline">{query}</span></span>
                                </div>
                                <span className="text-[10px] bg-cyan-500/20 px-2 py-0.5 rounded-md font-semibold group-hover/new:scale-105 transition-transform">
                                    تعبئة فورية ↵
                                </span>
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
