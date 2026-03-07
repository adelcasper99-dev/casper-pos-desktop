'use client';

import { useState, useEffect } from 'react';
import { Shield, Calendar, Clock, AlertCircle, Loader2, ArrowRight, Search, Filter } from 'lucide-react';
import { useTranslations } from '@/lib/i18n-mock';
import { Badge } from '@/components/ui/badge';
import { Input } from "@/components/ui/input";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { getWarrantyTickets } from '@/actions/ticket-actions';

interface WarrantyTicket {
    id: string;
    barcode: string;
    customerName: string;
    customerPhone: string;
    deviceBrand: string;
    deviceModel: string;
    warrantyExpiryDate: Date;
    deliveredAt: Date;
    issueDescription: string;
    status: string;
    returnCount: number;
}

export default function WarrantyTicketsTab() {
    const t = useTranslations('Tickets.warranty');
    const router = useRouter();
    const [tickets, setTickets] = useState<WarrantyTicket[]>([]);
    const [loading, setLoading] = useState(true);

    // Search & Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');

    useEffect(() => {
        fetchWarrantyTickets();
    }, []);

    const fetchWarrantyTickets = async () => {
        setLoading(true);
        try {
            const res = await getWarrantyTickets();
            if (res.success) {
                setTickets(res.tickets || []);
            }
        } catch (error) {
            console.error('Failed to fetch warranty tickets:', error);
        }
        setLoading(false);
    };

    const getDaysRemaining = (expiryDate: Date) => {
        const now = new Date();
        const expiry = new Date(expiryDate);
        const diff = expiry.getTime() - now.getTime();
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
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
        const daysRemaining = getDaysRemaining(ticket.warrantyExpiryDate);
        const isExpiringSoon = daysRemaining <= 7;
        const hasReturns = ticket.returnCount > 0;

        switch (filterStatus) {
            case 'expiring':
                return isExpiringSoon;
            case 'active':
                return !isExpiringSoon; // "Healthy" active warranties
            case 'returned':
                return hasReturns;
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
                <Shield className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-bold text-foreground mb-2">
                    {t('noDevices')}
                </h3>
                <p className="text-sm text-muted-foreground">
                    {t('noDevicesDesc')}
                </p>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
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
                    {['all', 'active', 'expiring', 'returned'].map(status => (
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

            <div className="glass-card overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead className="w-[50px] text-center">#</TableHead>
                            <TableHead>{t('table.device')}</TableHead>
                            <TableHead>{t('table.customer')}</TableHead>
                            <TableHead>{t('deliveredAt')}</TableHead>
                            <TableHead>{t('table.expiry')}</TableHead>
                            <TableHead className="text-center">{t('table.status')}</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredTickets.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                    {t('search.noResults')}
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredTickets.map((ticket, index) => {
                                const daysRemaining = getDaysRemaining(ticket.warrantyExpiryDate);
                                const isExpiringSoon = daysRemaining <= 7;

                                return (
                                    <TableRow
                                        key={ticket.id}
                                        className="cursor-pointer hover:bg-muted/30 transition-colors group"
                                        onClick={() => router.push(`/tickets/${ticket.id}`)}
                                    >
                                        <TableCell className="text-center font-mono text-xs text-muted-foreground">
                                            {index + 1}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-foreground group-hover:text-cyan-400 transition-colors">{ticket.deviceBrand} {ticket.deviceModel}</span>
                                                <span className="text-xs text-muted-foreground font-mono">{ticket.barcode}</span>
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
                                                    {new Date(ticket.deliveredAt).toLocaleDateString(loading ? 'en-US' : undefined)}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-sm font-bold flex items-center gap-1.5">
                                                    <Clock className={`w-3 h-3 ${isExpiringSoon ? 'text-orange-400' : 'text-green-400'}`} />
                                                    <span className={isExpiringSoon ? 'text-orange-400' : 'text-green-400'}>
                                                        {t('daysLeft', { days: daysRemaining })}
                                                    </span>
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    {new Date(ticket.warrantyExpiryDate).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <div className="flex flex-col gap-1 items-center">
                                                <Badge
                                                    variant="outline"
                                                    className={`${isExpiringSoon
                                                        ? 'bg-orange-500/10 text-orange-400 border-orange-500/30'
                                                        : 'bg-green-500/10 text-green-400 border-green-500/30'
                                                        }`}
                                                >
                                                    {isExpiringSoon ? t('expiringSoon') : t('active')}
                                                </Badge>
                                                {ticket.returnCount > 0 && (
                                                    <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                                                        <AlertCircle className="w-3 h-3 mr-1" />
                                                        {ticket.returnCount}
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <ArrowRight className="w-4 h-4 text-muted-foreground" />
                                            </Button>
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
