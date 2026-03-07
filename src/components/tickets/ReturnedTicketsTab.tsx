'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Calendar, User, Wrench, AlertTriangle, Loader2, Search } from 'lucide-react';
import { useTranslations } from '@/lib/i18n-mock';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { getReturnedTickets } from '@/actions/ticket-actions';

interface ReturnedTicket {
    id: string;
    barcode: string;
    customerName: string;
    customerPhone: string;
    deviceBrand: string;
    deviceModel: string;
    warrantyExpiryDate: Date | null;
    returnCount: number;
    lastReturnedAt: Date | null;
    returnReason: string | null;
    issueDescription: string;
    status: string;
    technicianName: string | null;
}

export default function ReturnedTicketsTab() {
    const t = useTranslations('returns');
    const [tickets, setTickets] = useState<ReturnedTicket[]>([]);
    const [loading, setLoading] = useState(true);

    // Search & Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');

    useEffect(() => {
        fetchReturnedTickets();
    }, []);

    const fetchReturnedTickets = async () => {
        setLoading(true);
        try {
            const res = await getReturnedTickets();
            if (res.success) {
                setTickets(res.tickets || []);
            }
        } catch (error) {
            console.error('Failed to fetch returned tickets:', error);
        }
        setLoading(false);
    };

    const isUnderWarranty = (expiryDate: Date | null) => {
        if (!expiryDate) return false;
        return new Date(expiryDate) > new Date();
    };

    // Filter Logic
    const filteredTickets = tickets.filter(ticket => {
        // 1. Search Query
        const query = searchQuery.toLowerCase();
        const matchesSearch =
            ticket.customerName.toLowerCase().includes(query) ||
            ticket.customerPhone.includes(query) ||
            ticket.deviceBrand.toLowerCase().includes(query) ||
            ticket.deviceModel.toLowerCase().includes(query) ||
            ticket.barcode.toLowerCase().includes(query);

        if (!matchesSearch) return false;

        // 2. Status Filter
        const underWarranty = isUnderWarranty(ticket.warrantyExpiryDate);

        switch (filterStatus) {
            case 'warranty':
                return underWarranty;
            case 'outOfWarranty':
                return !underWarranty;
            case 'all':
            default:
                return true;
        }
    });

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (tickets.length === 0) {
        return (
            <Card className="p-12 text-center bg-muted/30 border-dashed">
                <RefreshCw className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-bold text-foreground mb-2">
                    {t('noReturns')}
                </h3>
                <p className="text-sm text-muted-foreground">
                    {t('noReturnsDesc')}
                </p>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-foreground">{t('tabTitle')}</h2>
                    <p className="text-sm text-muted-foreground">
                        {t('count', { count: filteredTickets.length })}
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-4 items-center glass-card p-4 flex-wrap">
                {/* Search Input */}
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <Input
                        placeholder={t('searchPlaceholder')}
                        className="pl-9 solid-input bg-zinc-900/50 border-white/10"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                {/* Filter Buttons */}
                <div className="flex gap-2 flex-wrap">
                    {['all', 'warranty', 'outOfWarranty'].map(status => (
                        <Button
                            key={status}
                            variant={filterStatus === status ? 'default' : 'outline'}
                            onClick={() => setFilterStatus(status)}
                            size="sm"
                            className={filterStatus === status
                                ? "bg-cyan-500 text-black hover:bg-cyan-400 border-0"
                                : "bg-transparent border-white/10 text-zinc-400 hover:text-white hover:bg-white/5"}
                        >
                            {t(`filter.${status}`)}
                        </Button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="glass-card overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead className="w-[50px] text-center">#</TableHead>
                            <TableHead>{t('table.device')}</TableHead>
                            <TableHead>{t('table.customer')}</TableHead>
                            <TableHead>{t('table.returnedAt')}</TableHead>
                            <TableHead>{t('table.reason')}</TableHead>
                            <TableHead>{t('table.status')}</TableHead>
                            <TableHead>{t('table.technician')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredTickets.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                    {t('noReturns')}
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredTickets.map((ticket, index) => {
                                const underWarranty = isUnderWarranty(ticket.warrantyExpiryDate);

                                return (
                                    <TableRow
                                        key={ticket.id}
                                        className="cursor-pointer hover:bg-muted/30 transition-colors group"
                                    // onClick={() => router.push(`/tickets/${ticket.id}`)} // If we want navigation
                                    >
                                        <TableCell className="text-center font-mono text-xs text-muted-foreground">
                                            {index + 1}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-foreground group-hover:text-cyan-400 transition-colors">{ticket.deviceBrand} {ticket.deviceModel}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-muted-foreground font-mono">{ticket.barcode}</span>
                                                    {ticket.returnCount > 1 && (
                                                        <Badge variant="secondary" className="text-[10px] h-4 px-1 bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                                                            {ticket.returnCount}x
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium">{ticket.customerName}</span>
                                                <span className="text-xs text-muted-foreground">{ticket.customerPhone}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2 text-muted-foreground">
                                                <Calendar className="w-3 h-3" />
                                                <span className="text-sm">
                                                    {ticket.lastReturnedAt ? new Date(ticket.lastReturnedAt).toLocaleDateString() : '-'}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                {ticket.returnReason ? (
                                                    <div className="flex items-center gap-1.5 text-orange-400">
                                                        <AlertTriangle className="w-3 h-3" />
                                                        <span className="text-sm truncate max-w-[150px]" title={ticket.returnReason}>
                                                            {ticket.returnReason}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground">-</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                className={`${underWarranty
                                                    ? 'bg-green-500/20 text-green-400 border-green-500/30'
                                                    : 'bg-red-500/20 text-red-400 border-red-500/30'
                                                    }`}
                                            >
                                                {underWarranty ? t('filter.warranty') : t('filter.outOfWarranty')}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {ticket.technicianName ? (
                                                <div className="flex items-center gap-2 text-purple-400">
                                                    <Wrench className="w-3 h-3" />
                                                    <span className="text-sm">{ticket.technicianName}</span>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
