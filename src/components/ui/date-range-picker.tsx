'use client';

import * as React from 'react';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface DateRangePickerProps {
    from?: Date;
    to?: Date;
    onSelect: (from: Date | undefined, to: Date | undefined) => void;
    className?: string;
}

export function DateRangePicker({ from, to, onSelect, className }: DateRangePickerProps) {
    const handleFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newFrom = e.target.value ? new Date(e.target.value) : undefined;
        onSelect(newFrom, to);
    };

    const handleToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newTo = e.target.value ? new Date(e.target.value) : undefined;
        onSelect(from, newTo);
    };

    return (
        <div className={cn('flex items-center gap-2', className)}>
            <div className="relative flex items-center">
                <Calendar className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                    type="date"
                    value={from ? format(from, 'yyyy-MM-dd') : ''}
                    onChange={handleFromChange}
                    className="h-10 pl-10 pr-4 rounded-md border border-input bg-background text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Start date"
                />
            </div>
            <span className="text-muted-foreground">-</span>
            <div className="relative flex items-center">
                <Calendar className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                    type="date"
                    value={to ? format(to, 'yyyy-MM-dd') : ''}
                    onChange={handleToChange}
                    className="h-10 pl-10 pr-4 rounded-md border border-input bg-background text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="End date"
                />
            </div>
        </div>
    );
}
