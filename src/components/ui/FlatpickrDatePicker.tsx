"use client"

import * as React from "react"
import { useEffect, useRef } from "react"
import flatpickr from "flatpickr"
import "flatpickr/dist/flatpickr.min.css"
import "flatpickr/dist/themes/dark.css"
import { Arabic } from "flatpickr/dist/l10n/ar.js"
import { Calendar as CalendarIcon, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface FlatpickrDatePickerProps {
    onChange?: (date: Date | null) => void
    onClear?: () => void
    defaultValue?: string
    placeholder?: string
    className?: string
    name?: string
}

export function FlatpickrDatePicker({
    onChange,
    onClear,
    defaultValue,
    placeholder = "اختر التاريخ...",
    className,
    name
}: FlatpickrDatePickerProps) {
    const inputRef = useRef<HTMLInputElement>(null)
    const flatpickrRef = useRef<flatpickr.Instance | null>(null)

    useEffect(() => {
        if (inputRef.current) {
            flatpickrRef.current = flatpickr(inputRef.current as HTMLInputElement, {
                mode: "single",
                dateFormat: "Y-m-d",
                altInput: true,
                altFormat: "d-m-Y",
                locale: Arabic,
                defaultDate: defaultValue || undefined,
                onChange: (selectedDates: Date[]) => {
                    if (onChange) {
                        onChange(selectedDates.length > 0 ? selectedDates[0] : null)
                    }
                }
            })
        }

        const handleSetToday = () => {
            if (flatpickrRef.current) {
                flatpickrRef.current.setDate(new Date(), true)
                if (onChange) onChange(new Date())
            }
        }

        window.addEventListener('set-flatpickr-today', handleSetToday)

        return () => {
            flatpickrRef.current?.destroy()
            window.removeEventListener('set-flatpickr-today', handleSetToday)
        }
    }, [onChange, defaultValue])

    return (
        <div className={cn("relative flex items-center gap-2", className)}>
            <div className="relative flex-1 group">
                <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-zinc-500 group-hover:text-slate-700 dark:group-hover:text-zinc-300 transition-colors pointer-events-none z-10" />
                <input
                    ref={inputRef}
                    name={name}
                    readOnly
                    placeholder={placeholder}
                    className="w-full h-10 pr-10 pl-10 bg-slate-100 dark:bg-zinc-900/50 border border-slate-300 dark:border-white/10 rounded-lg text-sm font-black text-slate-900 dark:text-zinc-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 hover:bg-slate-200 dark:hover:bg-zinc-800/50 transition-all cursor-pointer shadow-sm"
                />
                {flatpickrRef.current && flatpickrRef.current.selectedDates.length > 0 && (
                    <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        className="absolute left-1 top-1/2 -translate-y-1/2 h-8 w-8 text-slate-500 dark:text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                            e.stopPropagation()
                            flatpickrRef.current?.clear()
                            if (onClear) onClear()
                        }}
                    >
                        <X className="w-3 h-3" />
                    </Button>
                )}
            </div>
        </div>
    )
}
