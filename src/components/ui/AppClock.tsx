"use client";

import { useState, useEffect, memo } from "react";
import { Clock, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppClockProps {
    isExpanded: boolean;
}

function AppClock({ isExpanded }: AppClockProps) {
    const [time, setTime] = useState<Date | null>(null);

    useEffect(() => {
        setTime(new Date());
        const timer = setInterval(() => {
            setTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    if (!time) return null;

    const timeString = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    const dateString = time.toLocaleDateString([], { day: '2-digit', month: 'short' });
    const dayName = time.toLocaleDateString([], { weekday: 'short' });

    return (
        <div className={cn(
            "flex flex-col gap-1 px-3 py-2 rounded-xl transition-all duration-300 ease-in-out",
            "bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10",
            isExpanded ? "items-start" : "items-center justify-center p-2"
        )}>
            <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
                <Clock className={cn("w-3.5 h-3.5 text-cyan-500", !isExpanded && "w-5 h-5")} />
                {isExpanded && (
                    <span className="text-xs font-bold tracking-tight font-mono">
                        {timeString}
                    </span>
                )}
            </div>
            {isExpanded && (
                <div className="flex items-center gap-2 text-zinc-400 dark:text-zinc-500">
                    <Calendar className="w-3 h-3 uppercase" />
                    <span className="text-[10px] font-medium uppercase tracking-wider">
                        {dayName}, {dateString}
                    </span>
                </div>
            )}
        </div>
    );
}

export default memo(AppClock);
