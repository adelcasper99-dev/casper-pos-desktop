'use client'

import { useState, useRef, useEffect } from "react"
import GlassModal from "@/components/ui/GlassModal"
import { Button } from "@/components/ui/button"
import { Printer, StickyNote, CheckCircle, Loader2, Settings as SettingsIcon } from "lucide-react"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import TicketStickerLabel from "./TicketStickerLabel"
import { useTranslations } from "@/lib/i18n-mock"
import { toast } from "sonner";
import { formatArabicPrintText } from "@/lib/arabic-reshaper";
import TicketPrintTemplate from "./TicketPrintTemplate";
import { printService } from "@/lib/print-service";

interface TicketPrintOptionsModalProps {
    isOpen: boolean
    onClose: () => void
    ticket: any
    settings?: any
    defaultMode?: 'receipt' | 'label'
    silent?: boolean
}

export default function TicketPrintOptionsModal({ isOpen, onClose, ticket, settings, defaultMode = 'receipt', silent = false }: TicketPrintOptionsModalProps) {
    const t = useTranslations('Common')
    const tPrint = useTranslations('Purchasing.Print.Ticket')
    const [isPrintingReceipt, setIsPrintingReceipt] = useState(false)
    const [isPrintingLabel, setIsPrintingLabel] = useState(false)
    const [printers, setPrinters] = useState<string[]>([])
    const [selectedPrinter, setSelectedPrinter] = useState<string>("")
    const [selectedLabelPrinter, setSelectedLabelPrinter] = useState<string>("")
    const [qzStatus, setQzStatus] = useState<'loading' | 'connected' | 'error'>('loading')
    const printContentRef = useRef<HTMLDivElement>(null)
    const [previewMode, setPreviewMode] = useState<'receipt' | 'label'>(defaultMode)

    useEffect(() => {
        if (isOpen) {
            setPreviewMode(defaultMode)

            // Load saved printers - Exhaustive check to avoid missing state
            const registry = printService.getRegistry();
            const savedPrinter = registry?.thermalPrinter
                || localStorage.getItem('thermal_printer')
                || localStorage.getItem('casper_receipt_printer')
                || localStorage.getItem('casper_ticket_printer');
            if (savedPrinter) setSelectedPrinter(savedPrinter);

            const savedLabelPrinter = registry?.labelPrinter
                || localStorage.getItem('printer_label')
                || localStorage.getItem('casper_barcode_printer')
                || localStorage.getItem('casper_label_printer');
            if (savedLabelPrinter) setSelectedLabelPrinter(savedLabelPrinter);

            fetchPrinters();
        }
    }, [isOpen, defaultMode]);

    const fetchPrinters = async () => {
        setQzStatus('loading');
        if (typeof window !== 'undefined') {
            try {
                const printerList = await printService.getPrinters();
                setPrinters(printerList);
                setQzStatus('connected');
            } catch (e) {
                console.error("Failed to load printers", e);
                setQzStatus('error');
            }
        }
    };

    // Auto-Print Effect
    useEffect(() => {
        let isMounted = true;

        const doAutoPrint = async () => {
            const isOnline = await printService.isServerOnline();

            // 🛡️ Show error if QZ Tray is offline
            if (isOpen && (settings?.autoPrintTicket || silent) && !isOnline) {
                toast.error("الطابعة غير متصلة. يرجى تشغيل QZ Tray أو برنامج الطباعة.");
                return;
            }

            // 🛡️ Wait for settings to be loaded before checking auto-print
            if (!settings && isOpen) {
                // Settings not yet loaded, skip auto-print to avoid race condition
                return;
            }

            if (isOpen && (settings?.autoPrintTicket || silent) && isOnline) {
                const hasAutoPrintedSession = sessionStorage.getItem(`ticket_autoprint_${ticket?.id}`);

                if (!hasAutoPrintedSession) {
                    try {
                        // 🔔 [NOTIFICATION] User wants a popup after ticket creation
                        toast.info("Auto-printing Ticket # " + (ticket?.barcode || ""), {
                            description: "Sending Receipt & Label to printers...",
                            duration: 4000
                        });

                        // 🛡️ PRINTER CHECK: Alert if no printer is set
                        const registry = printService.getRegistry();
                        const receiptPrinter = selectedPrinter || registry?.thermalPrinter || localStorage.getItem('thermal_printer') || localStorage.getItem('casper_receipt_printer');
                        const labelPrinter = selectedLabelPrinter || registry?.labelPrinter || localStorage.getItem('printer_label') || localStorage.getItem('printer_barcode');

                        if (!receiptPrinter) {
                            toast.error("No receipt printer configured. Please set one in settings.");
                            // Don't continue with printing if no printer is configured
                            return;
                        }

                        // 1. Print Receipt immediately
                        await handlePrintReceipt(true); // pass true for silent

                        // 2. Short delay so QZ doesn't choke on sequential jobs
                        if (isMounted) {
                            await new Promise(resolve => setTimeout(resolve, 800));
                        }

                        // 3. Print Label
                        if (isMounted) {
                            setPreviewMode('label'); // Switch view for context
                            // 🛡️ [FIX] Short delay for React to re-render the label component before innerHTML capture
                            await new Promise(resolve => setTimeout(resolve, 500));

                            if (!labelPrinter || labelPrinter === 'none') {
                                toast.error("No label printer configured. Skipping label auto-print.");
                            } else {
                                await handlePrintLabel(true); // pass true for silent
                            }
                        }

                        // Mark as printed only AFTER successful sequence
                        sessionStorage.setItem(`ticket_autoprint_${ticket?.id}`, 'true');

                        // 4. Close automatically after successful auto-print
                        if (isMounted) {
                            setTimeout(() => {
                                onClose();
                            }, 1500);
                        }

                    } catch (error) {
                        console.error("Auto print sequence failed", error);
                        toast.error("Auto-print failed. Please try manually.");
                    }
                }
            }
        };

        if (isOpen && (settings?.autoPrintTicket || silent)) {
            // ⏳ [FIX] Longer delay (2.2s) to allow "Ticket created" toast to be seen/start fading
            // and ensure the page is fully ready
            setTimeout(() => {
                if (isMounted) doAutoPrint();
            }, 2200);
        }

        return () => { isMounted = false; };
    }, [isOpen, settings?.autoPrintTicket, silent, qzStatus, ticket?.id]);


    const handlePrinterChange = (value: string) => {
        setSelectedPrinter(value);
        // [DEFINITIVE FIX] Use global registry method
        printService.updateRegistry({ thermalPrinter: value });
        toast.success(`Ticket printer set to: ${value}`);
    };

    const handleLabelPrinterChange = (value: string) => {
        setSelectedLabelPrinter(value);
        // [DEFINITIVE FIX] Use global registry method
        printService.updateRegistry({ labelPrinter: value });
        toast.success(`Label printer set to: ${value}`);
    };

    const translations = {
        customerInfo: tPrint('customerHeader'),
        name: tPrint('name'),
        phone: tPrint('phone'),
        deviceDetails: tPrint('deviceHeader'),
        device: tPrint('device'),
        imei: tPrint('imei'),
        detail: tPrint('detail'),
        security: tPrint('security'),
        pattern: tPrint('pattern'),
        issueLabel: tPrint('issueHeader'),
        financialsHeader: tPrint('financialHeader'),
        repairCost: tPrint('repairCost'),
        paid: tPrint('paid'),
        balanceDue: tPrint('due'),
        conditionHeader: tPrint('conditionHeader'),
        expectedTime: tPrint('expectedTime'),
        hour: tPrint('hour'),
        min: tPrint('min'),
        termsHeader: tPrint('termsHeader'),
        terms1: tPrint('terms1'),
        terms2: tPrint('terms2'),
        terms3: tPrint('terms3'),
    };


    const handlePrintReceipt = async (isAutoPrint = false) => {
        setIsPrintingReceipt(true);
        try {
            const contentHtml = printContentRef.current?.innerHTML || "";
            const paperWidth = settings?.paperSize === '58mm' ? '58mm' : (settings?.paperSize === '100mm' ? '100mm' : '80mm');
            const sharedStyles = `
                @page { margin: 0; }
                * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                body { 
                    font-family: sans-serif; 
                    padding: 0; 
                    margin: 0; 
                    margin-left: 4mm;
                    width: ${paperWidth}; 
                    direction: rtl; 
                    background: transparent; 
                    color: black;
                    font-weight: 900;
                }
                .ticket-print-root {
                    width: 100%;
                    padding: 1mm;
                }
                .header { text-align: center; border-bottom: 2px solid black; margin-bottom: 10px; padding-bottom: 5px; }
                .flex { display: flex; }
                .justify-between { justify-content: space-between; }
                .items-center { align-items: center; }
                .flex-col { flex-direction: column; }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
                .font-bold { font-weight: bold; }
                .font-black { font-weight: 900; }
                .text-xs { font-size: 10px; }
                .text-sm { font-size: 12px; }
                .text-lg { font-size: 16px; }
                .text-base { font-size: 14px; }
                .bg-black { background-color: black !important; color: white !important; }
                .text-white { color: white !important; }
                .mb-1 { margin-bottom: 4px; }
                .mb-2 { margin-bottom: 8px; }
                .mb-3 { margin-bottom: 12px; }
                .mb-4 { margin-bottom: 16px; }
                .mt-1 { margin-top: 4px; }
                .mt-2 { margin-top: 8px; }
                .mt-3 { margin-top: 12px; }
                .mt-4 { margin-top: 16px; }
                .p-1 { padding: 4px; }
                .p-2 { padding: 8px; }
                .border-b { border-bottom: 1px solid black; }
                .border-b-2 { border-bottom: 2px solid black; }
                .border-t { border-top: 1px solid black; }
                .border-2 { border: 2px solid black; }
                .border-dashed { border-style: dashed; }
                .rounded-sm { border-radius: 2px; }
                .whitespace-pre-wrap { white-space: pre-wrap; }
                .leading-tight { line-height: 1.2; }
                .leading-none { line-height: 1; }
                .italic { font-style: italic; }
                .opacity-80 { opacity: 0.8; }
                .opacity-90 { opacity: 0.9; }
                .uppercase { text-transform: uppercase; }
            `;

            const fullReceiptHtml = `
                <html>
                <head>
                    <title>Print Receipt</title>
                    <style>${sharedStyles}</style>
                </head>
                <body>
                    <div class="content">
                        ${contentHtml}
                    </div>
                </body>
                </html>
            `;

            let isQzConnected = false;
            try {
                isQzConnected = typeof window !== 'undefined' && await printService.isServerOnline();
            } catch (err) {
                console.warn("QZ Connection check failed:", err);
            }

            if (isQzConnected) {
                const registry = printService.getRegistry();
                const receiptPrinter = selectedPrinter || registry?.thermalPrinter || localStorage.getItem('thermal_printer');
                if (receiptPrinter) {
                    try {
                        if (!isAutoPrint) toast.info("Printing via QZ Tray...");
                        const isOnline = await printService.isServerOnline();
                        if (isOnline) {
                            // 🛡️ [DEFINITIVE] Use strictlySilent to avoid dialogs
                            await printService.printHTML(fullReceiptHtml, receiptPrinter, { strictlySilent: isAutoPrint });
                        }
                        if (!isAutoPrint) toast.success("Receipt sent to printer");
                        return;
                    } catch (qzError) {
                        console.error("Print error:", qzError);
                        if (!isAutoPrint) toast.warning("Print failed, falling back to browser...");
                    }
                }
            }

            if (isAutoPrint) {
                // Return early if auto-printing and QZ failed or wasn't connected,
                // we don't want to spam browser print popups
                return;
            }

            const browserHtml = fullReceiptHtml.replace('</body>', `
                <script>
                    window.onload = function() {
                        setTimeout(function() {
                            window.print();
                            window.close();
                        }, 500);
                    };
                </script>
                </body>
            `);
            const printWindow = window.open('', '_blank', 'width=800,height=600');
            if (printWindow) {
                printWindow.document.write(browserHtml);
                printWindow.document.close();
            }
        } catch (error) {
            console.error("Print receipt error:", error);
            toast.error("Printing failed.");
        } finally {
            setIsPrintingReceipt(false);
        }
    }

    const handlePrintLabel = async (isAutoPrint = false) => {
        setIsPrintingLabel(true);
        try {
            const isQzConnected = typeof window !== 'undefined' && await printService.isServerOnline();
            if (isQzConnected) {
                const registry = printService.getRegistry();
                const labelPrinter = selectedLabelPrinter || registry?.labelPrinter || localStorage.getItem('printer_label');
                if (labelPrinter && labelPrinter !== 'none') {
                    const labelHtml = printContentRef.current?.innerHTML || "";
                    const fullLabelHtml = `
                        <html>
                        <head>
                            <style>
                                @page { size: 50mm 30mm; margin: 0; }
                                body { margin: 0; padding: 0; background: transparent; transform: translateX(-2mm); }
                                table { width: 100%; height: 100%; }
                            </style>
                        </head>
                        <body>${labelHtml}</body>
                        </html>
                    `;
                    // 🛡️ [DEFINITIVE] Use strictlySilent to avoid dialogs
                    await printService.printHTML(fullLabelHtml, labelPrinter, { strictlySilent: isAutoPrint });
                    if (!isAutoPrint) toast.success("Label printed successfully");
                } else {
                    if (!isAutoPrint) await printStickLabelFallback();
                }
            } else {
                if (!isAutoPrint) await printStickLabelFallback();
            }
        } catch (error) {
            console.error("Print label error:", error);
            if (!isAutoPrint) await printStickLabelFallback();
        } finally {
            setIsPrintingLabel(false);
        }
    };

    const printStickLabelFallback = () => {
        return new Promise<void>((resolve) => {
            const contentHtml = printContentRef.current?.innerHTML || "";
            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.left = '0';
            iframe.style.top = '0';
            iframe.style.width = '1px';
            iframe.style.height = '1px';
            iframe.style.border = 'none';
            iframe.style.opacity = '0';
            document.body.appendChild(iframe);

            const doc = iframe.contentWindow?.document;
            if (!doc) {
                document.body.removeChild(iframe);
                resolve();
                return;
            }

            const printStyle = `
                @page { size: 50mm 30mm landscape; margin: 0; }
                body { margin: 0; padding: 0; background: transparent; transform: translateX(-2mm); }
                table { width: 100%; height: 100%; }
            `;

            doc.open();
            doc.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Print Label</title>
                    <style>${printStyle}</style>
                </head>
                <body>
                    ${contentHtml}
                </body>
                </html>
            `);
            doc.close();

            setTimeout(() => {
                iframe.contentWindow?.focus();
                iframe.contentWindow?.print();
                setTimeout(() => {
                    if (document.body.contains(iframe)) document.body.removeChild(iframe);
                    resolve();
                }, 1000);
            }, 500);
        });
    }

    return (
        <GlassModal
            isOpen={isOpen}
            onClose={onClose}
            title="Ticket Created"
            className={silent ? "opacity-0 pointer-events-none" : ""}
        >
            <div className="flex flex-col items-center justify-center p-6 space-y-6">
                <div className="flex flex-col items-center gap-2">
                    <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center text-white shadow-[0_0_20px_rgba(34,197,94,0.5)]">
                        <CheckCircle className="w-10 h-10" />
                    </div>
                    <h2 className="text-2xl font-bold text-white tracking-wide">Ticket Created!</h2>
                </div>

                <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 w-full max-w-[320px]">
                    <button
                        onClick={() => setPreviewMode('receipt')}
                        className={`flex-1 flex items-center justify-center py-2 px-3 rounded-lg text-xs font-bold transition-all ${previewMode === 'receipt'
                            ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20'
                            : 'hover:bg-white/5 text-zinc-400 hover:text-white'
                            }`}
                    >
                        <Printer className="w-4 h-4 mr-2" />
                        RECEIPT
                    </button>
                    <button
                        onClick={() => setPreviewMode('label')}
                        className={`flex-1 flex items-center justify-center py-2 px-3 rounded-lg text-xs font-bold transition-all ${previewMode === 'label'
                            ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                            : 'hover:bg-white/5 text-zinc-400 hover:text-white'
                            }`}
                    >
                        <StickyNote className="w-4 h-4 mr-2" />
                        LABEL
                    </button>
                </div>

                {ticket && settings ? (
                    <div className={`bg-white text-black w-full max-w-[320px] shadow-[0_0_30px_rgba(0,0,0,0.5)] relative overflow-hidden transform rotate-1 transition-all duration-300 ${previewMode === 'receipt' ? '' : 'rounded-sm ring-1 ring-zinc-300'
                        }`}>
                        <div className="max-h-[400px] overflow-y-auto pt-4 pb-4 px-2">
                            <div ref={printContentRef}>
                                {previewMode === 'receipt' ? (
                                    <TicketPrintTemplate
                                        ticket={ticket}
                                        settings={settings}
                                        translations={translations}
                                    />
                                ) : (
                                    <div className="flex items-center justify-center p-4 bg-zinc-50 min-h-[150px]">
                                        <div className="shadow-lg border border-zinc-200">
                                            <TicketStickerLabel
                                                ticket={ticket}
                                                storeName={settings?.name}
                                                translations={translations}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="h-[300px] flex items-center justify-center">
                        <Loader2 className="animate-spin text-zinc-500" />
                    </div>
                )}

                <div className="w-full max-w-[320px] bg-white/5 p-4 rounded-xl border border-white/10">
                    {qzStatus === 'loading' && (
                        <div className="flex items-center justify-center gap-2 text-sm text-zinc-400 py-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Connecting to QZ Tray...</span>
                        </div>
                    )}

                    {qzStatus === 'error' && (
                        <div className="flex flex-col items-center gap-2 text-center py-1">
                            <div className="text-sm text-orange-500 font-medium flex items-center gap-2">
                                <Printer className="w-4 h-4" />
                                QZ Tray Not Detected
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={fetchPrinters}
                                className="mt-1 h-7 text-xs bg-transparent border-white/10 text-white"
                            >
                                Retry Connection
                            </Button>
                        </div>
                    )}

                    {qzStatus === 'connected' && printers.length > 0 && (
                        <div className="flex flex-col gap-3">
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                                        <Printer className="w-3 h-3" />
                                        <span>Receipt Printer</span>
                                    </div>
                                </div>
                                <Select value={selectedPrinter} onValueChange={handlePrinterChange}>
                                    <SelectTrigger className="w-full bg-black/40 border-white/10 h-9 text-white">
                                        <SelectValue placeholder="Select receipt printer" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-white/10 text-white">
                                        {printers.map((p) => (
                                            <SelectItem key={p} value={p}>{p}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <div className="flex items-center gap-2 mb-1.5 text-sm text-zinc-400">
                                    <StickyNote className="w-3 h-3" />
                                    <span>Barcode Printer</span>
                                </div>
                                <Select value={selectedLabelPrinter} onValueChange={handleLabelPrinterChange}>
                                    <SelectTrigger className="w-full bg-black/40 border-white/10 h-9 text-white">
                                        <SelectValue placeholder="Select barcode printer" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-white/10 text-white">
                                        {printers.map((p) => (
                                            <SelectItem key={p} value={p}>{p}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex gap-3 w-full">
                    <Button onClick={onClose} variant="ghost" className="flex-1 py-6 rounded-xl text-lg text-white hover:bg-white/10">
                        Close
                    </Button>
                    {previewMode === 'receipt' ? (
                        <Button
                            onClick={() => handlePrintReceipt()}
                            disabled={isPrintingReceipt}
                            className="flex-[2] py-6 rounded-xl bg-cyan-500 text-black font-bold hover:bg-cyan-400 text-lg gap-2 shadow-lg shadow-cyan-500/20"
                        >
                            {isPrintingReceipt ? <Loader2 className="w-5 h-5 animate-spin" /> : <Printer className="w-5 h-5" />}
                            {isPrintingReceipt ? "Printing..." : "Print Receipt"}
                        </Button>
                    ) : (
                        <Button
                            onClick={() => handlePrintLabel()}
                            disabled={isPrintingLabel}
                            className="flex-[2] py-6 rounded-xl bg-purple-600 text-white font-bold hover:bg-purple-500 text-lg gap-2 shadow-lg shadow-purple-600/20"
                        >
                            {isPrintingLabel ? <Loader2 className="w-5 h-5 animate-spin" /> : <StickyNote className="w-5 h-5" />}
                            {isPrintingLabel ? "Printing..." : "Print Label"}
                        </Button>
                    )}
                </div>
            </div>
        </GlassModal>
    );
}

