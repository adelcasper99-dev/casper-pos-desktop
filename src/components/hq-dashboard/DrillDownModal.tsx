'use client';

import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Loader2, ExternalLink } from "lucide-react";
import Link from 'next/link';

interface DrillDownProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    data: any[] | null;
    loading: boolean;
}

export const DrillDownModal: React.FC<DrillDownProps> = ({ isOpen, onClose, title, data, loading }) => {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-between">
                        <span>{title}</span>
                        {data && <Badge variant="secondary">{data.length} Results</Badge>}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto min-h-[400px]">
                    {loading ? (
                        <div className="flex items-center justify-center h-full min-h-[400px]">
                            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
                                <TableRow>
                                    <TableHead>Ticket #</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Device</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Technician</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data?.map((ticket) => (
                                    <TableRow key={ticket.id} className="hover:bg-slate-50 text-xs">
                                        <TableCell className="font-bold">{ticket.ticketNumber}</TableCell>
                                        <TableCell>{ticket.customerName}</TableCell>
                                        <TableCell className="max-w-[150px] truncate">{ticket.deviceName}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={`text-[10px] ${ticket.status === 'REJECTED' ? 'border-red-500 text-red-500' :
                                                    ticket.status === 'COMPLETED' ? 'border-green-500 text-green-500' :
                                                        'border-blue-500 text-blue-500'
                                                }`}>
                                                {ticket.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-slate-500">{ticket.technicianName}</TableCell>
                                        <TableCell className="text-slate-400">
                                            {format(new Date(ticket.createdAt), 'dd/MM/yyyy')}
                                        </TableCell>
                                        <TableCell>
                                            <Link
                                                href={`/ar/maintenance/tickets/${ticket.id}`}
                                                className="p-1 hover:bg-blue-50 text-blue-600 rounded inline-block transition-colors"
                                                title="View Detail"
                                            >
                                                <ExternalLink className="h-4 w-4" />
                                            </Link>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {(!data || data.length === 0) && (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-20 text-slate-400">
                                            No tickets found for this criteria
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
