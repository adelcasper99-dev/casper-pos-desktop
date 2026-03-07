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
                        balance: typeof c.balance === 'number' ? c.balance : Number(c.balance || 0)
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
                <Search className="absolute start-4 top-1/2 -translate-y-1/2 h-5 w-5 text-cyan-500/50 group-focus-within/autocomplete:text-cyan-400 transition-all pointer-events-none" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => {
                        if (results.length > 0) setOpen(true);
                    }}
                    onBlur={() => setTimeout(() => setOpen(false), 200)}
                    placeholder={placeholder}
                    className="ps-12 solid-input h-14 bg-black/50 border-white/10 text-white text-base placeholder:text-zinc-600 focus:border-cyan-500/50 transition-all font-medium rounded-xl shadow-inner shadow-cyan-500/5"
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
                <div className="absolute top-full mt-3 w-full z-50 glass-card border-cyan-500/20 shadow-2xl shadow-cyan-900/60 overflow-hidden animate-in fade-in slide-in-from-top-3 duration-300">
                    <div className="p-2 max-h-[400px] overflow-y-auto custom-scrollbar">
                        <div className="px-4 py-3 border-b border-white/5 mb-1">
                            <p className="text-[11px] font-black text-cyan-500 uppercase tracking-[0.3em]">
                                {results.length} Matches Found
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
                                    className="w-full group/item cursor-pointer hover:bg-cyan-500/10 p-4 min-h-[64px] flex items-center gap-4 rounded-xl transition-all text-start border border-transparent hover:border-cyan-500/30"
                                >
                                    <div className="h-12 w-12 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 group-hover/item:bg-cyan-500 group-hover/item:text-black transition-all shadow-lg shadow-cyan-500/5 group-hover/item:shadow-cyan-500/20">
                                        <User className="h-6 w-6" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2 mb-0.5">
                                            <p className="font-bold text-base text-white group-hover/item:text-cyan-400 transition-colors truncate">
                                                {customer.name}
                                            </p>
                                            {customer.balance !== undefined && customer.balance > 0 && (
                                                <span className="text-[10px] bg-red-500/20 text-red-100 px-2 py-1 rounded-md border border-red-500/40 font-mono font-bold">
                                                    {customer.balance}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 text-sm text-zinc-400">
                                            <div className="flex items-center gap-2">
                                                <Phone className="h-3.5 w-3.5 text-cyan-500/60" />
                                                <span className="font-mono tracking-wider">{customer.phone}</span>
                                            </div>
                                            {customer.email && (
                                                <div className="hidden sm:flex items-center gap-2 truncate">
                                                    <span className="text-zinc-700">•</span>
                                                    <span className="truncate opacity-50">{customer.email}</span>
                                                </div>
                                            )}
                                        </div>
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
