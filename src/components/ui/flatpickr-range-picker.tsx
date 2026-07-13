"use client"

import * as React from "react"
import { useEffect, useRef } from "react"
import flatpickr from "flatpickr"
import "flatpickr/dist/flatpickr.min.css"
import "flatpickr/dist/themes/dark.css" // OzZa branding matches dark theme
import { Arabic } from "flatpickr/dist/l10n/ar.js"
import { Calendar as CalendarIcon, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface FlatpickrRangePickerProps {
    onRangeChange: (dates: Date[]) => void
    onClear: () => void
    initialDates?: Date[]
    placeholder?: string
    className?: string
}

export function FlatpickrRangePicker({
    onRangeChange,
    onClear,
    initialDates,
    placeholder = "اختر الفترة الزمنية...",
    className
}: FlatpickrRangePickerProps) {
    const inputRef = useRef<HTMLInputElement>(null)
    const flatpickrRef = useRef<flatpickr.Instance | null>(null)
    const onRangeChangeRef = useRef(onRangeChange)

    useEffect(() => {
        onRangeChangeRef.current = onRangeChange
    }, [onRangeChange])

    useEffect(() => {
        if (inputRef.current) {
            flatpickrRef.current = flatpickr(inputRef.current as HTMLInputElement, {
                mode: "range",
                dateFormat: "d-m-Y",
                locale: Arabic,
                onChange: (selectedDates: Date[]) => {
                    if (selectedDates.length === 2) {
                        onRangeChangeRef.current(selectedDates)
                        flatpickrRef.current?.close()
                    } else if (selectedDates.length === 0) {
                        onRangeChangeRef.current(selectedDates)
                    }
                },
            })
        }

        return () => {
            flatpickrRef.current?.destroy()
        }
    }, [])

    const prevInitialDatesRef = useRef<string>("")

    useEffect(() => {
        const serialized = (initialDates || []).map(d => d instanceof Date ? d.getTime() : new Date(d).getTime()).join(",")
        if (flatpickrRef.current && serialized !== prevInitialDatesRef.current) {
            flatpickrRef.current.setDate(initialDates || [], false)
            prevInitialDatesRef.current = serialized
        }
    }, [initialDates])

    return (
        <div className={cn("relative flex items-center gap-2", className)}>
            <div className="relative flex-1 group">
                <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-zinc-500 group-hover:text-slate-700 dark:group-hover:text-zinc-300 transition-colors pointer-events-none z-10" />
                <input
                    ref={inputRef}
                    readOnly
                    placeholder={placeholder}
                    className="w-full h-10 pr-10 pl-10 bg-slate-100 dark:bg-zinc-900/50 border border-slate-300 dark:border-white/10 rounded-lg text-sm font-black text-slate-900 dark:text-zinc-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 hover:bg-slate-200 dark:hover:bg-zinc-800/50 transition-all cursor-pointer shadow-sm"
                />
                {flatpickrRef.current && flatpickrRef.current.selectedDates.length > 0 && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute left-1 top-1/2 -translate-y-1/2 h-8 w-8 text-slate-500 dark:text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                            e.stopPropagation()
                            flatpickrRef.current?.clear()
                            onClear()
                        }}
                    >
                        <X className="w-3 h-3" />
                    </Button>
                )}
            </div>
        </div>
    )
}
