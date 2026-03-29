'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { searchCustomers } from '@/actions/customer-actions';
import { Search, User, Phone, Loader2, X } from 'lucide-react';

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
    placeholder?: string;
}

export function CustomerAutocomplete({ onSelect, placeholder = "Search existing customers..." }: CustomerAutocompleteProps) {
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
                setOpen(validCustomers.length > 0);
            }
            setLoading(false);
        };

        const debounce = setTimeout(search, 300);
        return () => clearTimeout(debounce);
    }, [query]);

    return (
        <div className="relative group/autocomplete">
            <div className="relative">
                <Search className="absolute start-4 top-1/2 -translate-y-1/2 h-5 w-5 text-black dark:text-white group-focus-within/autocomplete:text-slate-600 dark:group-focus-within/autocomplete:text-zinc-300 transition-all pointer-events-none z-10" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => {
                        if (results.length > 0) setOpen(true);
                    }}
                    onBlur={() => setTimeout(() => setOpen(false), 200)}
                    placeholder={placeholder}
                    className="ps-12 h-14 bg-slate-50 dark:bg-black/40 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white text-base placeholder:text-slate-400 focus:border-black dark:focus:border-white transition-all font-black rounded-xl shadow-inner"
                />
                {loading ? (
                    <div className="absolute end-4 top-1/2 -translate-y-1/2 pointer-events-none">
                        <Loader2 className="h-5 w-5 text-cyan-500 animate-spin" />
                    </div>
                ) : query && (
                    <button
                        onClick={() => { setQuery(''); setResults([]); setOpen(false); }}
                        className="absolute end-4 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center rounded-full hover:bg-white/10 text-zinc-500 hover:text-white transition-all active:scale-90"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            {open && results.length > 0 && (
                <div className="absolute top-full mt-3 w-full z-[100] bg-white dark:bg-zinc-900 border-2 border-slate-300 dark:border-zinc-700 shadow-2xl rounded-2xl overflow-hidden animate-in fade-in slide-in-from-top-3 duration-300">
                    <div className="p-2 max-h-[400px] overflow-y-auto custom-scrollbar">
                        <div className="px-4 py-3 border-b-2 border-slate-100 dark:border-white/5 mb-1">
                            <p className="text-[11px] font-black text-black dark:text-white uppercase tracking-[0.3em]">
                                تم العثور على {results.length} تطابق
                            </p>
                        </div>
                        <div className="space-y-1.5">
                            {results.map((customer) => (
                                <button
                                    key={customer.id}
                                    type="button"
                                    onMouseDown={(e) => {
                                        e.preventDefault(); // Prevents input from losing focus before selection
                                        onSelect(customer);
                                        setQuery('');
                                        setOpen(false);
                                    }}
                                    className="w-full group/item cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 p-4 min-h-[64px] flex items-center gap-4 rounded-xl transition-all text-start border border-transparent hover:border-black/10 dark:hover:border-white/10"
                                >
                                    <div className="h-12 w-12 rounded-xl bg-black/10 dark:bg-white/10 flex items-center justify-center text-black dark:text-white group-hover/item:bg-black group-hover/item:text-white dark:group-hover/item:bg-white dark:group-hover/item:text-black transition-all shadow-lg group-hover/item:shadow-black/20">
                                        <User className="h-6 w-6" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2 mb-0.5">
                                            <p className="font-black text-base text-slate-900 dark:text-white group-hover/item:text-black dark:group-hover/item:text-white transition-colors truncate">
                                                {customer.name}
                                            </p>
                                            {customer.balance !== undefined && customer.balance > 0 && (
                                                <span className="text-[10px] bg-slate-900 dark:bg-white text-white dark:text-black px-2 py-1 rounded-md border border-slate-900 dark:border-white font-mono font-bold shadow-lg shadow-black/10">
                                                    {customer.balance}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 text-sm text-zinc-400">
                                            <div className="flex items-center gap-2">
                                                <Phone className="h-3.5 w-3.5 text-black dark:text-white opacity-60" />
                                                <span className="font-mono tracking-wider">{customer.phone}</span>
                                            </div>
                                            {customer.email && (
                                                <div className="hidden sm:flex items-center gap-2 truncate">
                                                    <span className="text-zinc-700">•</span>
                                                    <span className="truncate opacity-50">{customer.email}</span>
                                                </div>
                                            )}
                                        </div>
                                        {customer.linkedEmployeeId && (
                                            <div className="mt-1">
                                                <span className="text-[10px] bg-slate-900 dark:bg-zinc-800 text-white dark:text-zinc-200 border border-slate-900 dark:border-zinc-700 px-2 py-0.5 rounded-full font-bold">
                                                    موظف داخلي
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
