'use client'

import { useState, useRef, useEffect } from "react"
import GlassModal from "@/components/ui/GlassModal"
import { Button } from "@/components/ui/button"
import { Printer, StickyNote, CheckCircle, Loader2, Settings as SettingsIcon, User as UserIcon } from "lucide-react"
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
import { 
    generateTicketLabelHTML, 
    generateTicketReceiptHTML, 
    generateEngineerReceiptHTML,
    generateCode128SVG
} from "@/lib/ticket-print-helpers";
import EngineerTicketReceipt from "./EngineerTicketReceipt";

// Using shared generateTicketLabelHTML and generateCode128SVG

// Using shared generateTicketReceiptHTML

// Using shared generateEngineerReceiptHTML

interface TicketPrintOptionsModalProps {
    isOpen: boolean
    onClose: () => void
    ticket: any
    settings?: any
    defaultMode?: 'receipt' | 'label' | 'engineer'
    silent?: boolean
    singleDocument?: boolean  // when true, only print defaultMode (no full receipt+engineer+label sequence)
}

export default function TicketPrintOptionsModal({ isOpen, onClose, ticket, settings, defaultMode = 'receipt', silent = false, singleDocument = false }: TicketPrintOptionsModalProps) {
    const t = useTranslations('Common')
    const tPrint = useTranslations('Purchasing.Print.Ticket')
    const tTicket = useTranslations('Tickets')
    const [isPrintingReceipt, setIsPrintingReceipt] = useState(false)
    const [isPrintingEngineer, setIsPrintingEngineer] = useState(false)
    const [isPrintingLabel, setIsPrintingLabel] = useState(false)
    const [printers, setPrinters] = useState<string[]>([])
    const [selectedPrinter, setSelectedPrinter] = useState<string>("")
    const [selectedLabelPrinter, setSelectedLabelPrinter] = useState<string>("")
    const [qzStatus, setQzStatus] = useState<'loading' | 'connected' | 'error'>('loading')
    const printContentRef = useRef<HTMLDivElement>(null)
    const [previewMode, setPreviewMode] = useState<'receipt' | 'label' | 'engineer'>(defaultMode)

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
        let timerId: any = null;

        const doAutoPrint = async () => {
            if (!isOpen) return;

            // 🔍 [DIAGNOSTIC] Provide early feedback if requested but stalling
            if (silent) {
                console.log("[AutoPrint] Sequence initiated (silent mode)");
                toast.info("Preparing and checking printers...", {
                    id: "preparing-print",
                    duration: 1500
                });
            }

            // 🛡️ Wait for both ticket and settings to be ready
            if (!ticket || !settings) {
                if (silent) {
                    console.log("[AutoPrint] Waiting for ticket/settings data...", { ticket: !!ticket, settings: !!settings });
                    toast.info("Waiting for data to load...", { id: "autoprint-loading", duration: 1000 });
                }
                // 🛡️ FIX: Don't return - schedule another attempt
                if (isMounted) {
                    timerId = setTimeout(() => {
                        if (isMounted && isOpen) doAutoPrint();
                    }, 1500);
                }
                return;
            }

            // 🛡️ FIX: Check if running in Electron mode (desktop)
            const isElectron = printService.isElectron();
            if (isElectron) {
                console.log("[AutoPrint] Running in Electron mode - using native print");
            }

            // For Electron mode, we can skip the isServerOnline check since Electron has its own print channel
            const isOnline = isElectron ? true : await printService.isServerOnline();

            // 🛡️ Show error if print service is offline (not just QZ)
            if (!isOnline && (settings?.autoPrintTicket || silent)) {
                toast.error("الطابعة غير متصلة. يرجى تشغيل برنامج الطباعة.", {
                    id: "printer-offline-warning"
                });
                return;
            }

            if ((settings?.autoPrintTicket || silent) && isOnline) {
                const hasAutoPrintedSession = sessionStorage.getItem(`ticket_autoprint_${ticket?.id}`);

                if (!hasAutoPrintedSession) {
                    try {
                        toast.info("Printing Ticket # " + (ticket?.barcode || ""), {
                            description: defaultMode === 'engineer' ? "Sending engineer copy..." : defaultMode === 'label' ? "Sending label..." : "Sending Receipt & Label to printers...",
                            duration: 4000
                        });

                        // 🛡️ [CONSISTENCY] Resolve printers once for the whole sequence
                        const registry = printService.getRegistry();
                        const receiptPrinter = selectedPrinter || 
                                              registry?.thermalPrinter || 
                                              registry?.receiptPrinter || 
                                              localStorage.getItem('thermal_printer') || 
                                              localStorage.getItem('casper_receipt_printer');
                                              
                        const labelPrinter = selectedLabelPrinter || 
                                            registry?.labelPrinter || 
                                            localStorage.getItem('printer_label') || 
                                            localStorage.getItem('printer_barcode');

                        if (!receiptPrinter && !silent) {
                            toast.error("No receipt printer configured. Please set one in settings.");
                        }

                        if (singleDocument) {
                            // 🎯 Manual button: print ONLY the requested document
                            if (defaultMode === 'engineer') {
                                await handlePrintEngineer(true);
                            } else if (defaultMode === 'label') {
                                if (!labelPrinter || labelPrinter === 'none') {
                                    toast.error("No label printer configured.");
                                } else {
                                    await handlePrintLabel(true);
                                }
                            } else {
                                // receipt only — no engineer, no label
                                await handlePrintReceipt(true, false);
                            }
                        } else {
                            // 🔁 Full auto-print sequence: receipt + engineer (optional) + label
                            await handlePrintReceipt(true, settings?.autoPrintEngineerCopy || false);

                            if (isMounted) {
                                await new Promise(resolve => setTimeout(resolve, 800));
                            }

                            if (isMounted) {
                                setPreviewMode('label');
                                if (!labelPrinter || labelPrinter === 'none') {
                                    toast.error("No label printer configured. Skipping label auto-print.");
                                } else {
                                    await handlePrintLabel(true);
                                }
                            }
                        }

                        // Mark as printed only AFTER successful sequence
                        sessionStorage.setItem(`ticket_autoprint_${ticket?.id}`, 'true');

                        // Close automatically after successful print
                        if (isMounted) {
                            setTimeout(() => {
                                onClose();
                            }, 1500);
                        }

                    } catch (error) {
                        console.error("Auto print sequence failed", error);
                        toast.error("Auto-print failed. Please try manually.");
                    }
                } else {
                    if (silent) {
                        console.log("[AutoPrint] Skipped: already printed in this session.");
                        toast.info("Ticket already printed. Skipping auto-print.", { id: "autoprint-skipped", duration: 2000 });
                    }
                }
            }
        };

        if (isOpen && (settings?.autoPrintTicket || silent)) {
            if (silent) {
                toast.info("Auto-print starting...", {
                    id: "autoprint-start",
                    duration: 2000
                });
            }
            
            // ⏳ [FIX] Shorter delay (1s) for better responsiveness
            timerId = setTimeout(() => {
                if (isMounted) doAutoPrint();
            }, 1000);
        }

        return () => { 
            isMounted = false; 
            if (timerId) clearTimeout(timerId);
        };
    }, [isOpen, settings, silent, qzStatus, ticket, ticket?.id, defaultMode, singleDocument]);


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


    const handlePrintReceipt = async (isAutoPrint = false, includeEngineer = true) => {
        setIsPrintingReceipt(true);
        try {
            // 1. Customer Receipt
            const fullReceiptHtml = generateTicketReceiptHTML(ticket, settings);

            let isQzConnected = false;
            try {
                isQzConnected = typeof window !== 'undefined' && await printService.isServerOnline();
            } catch (err) {
                console.warn("QZ Connection check failed:", err);
            }

            if (isQzConnected) {
                const registry = printService.getRegistry();
                const printer = selectedPrinter || 
                               registry?.thermalPrinter || 
                               registry?.receiptPrinter || 
                               localStorage.getItem('thermal_printer') || 
                               localStorage.getItem('casper_receipt_printer');
                if (printer) {
                    try {
                        if (!isAutoPrint) toast.info("Printing receipt...");
                        const paperWidthMm = settings?.paperSize === '58mm' ? 58 : 80;
                        console.log('[AutoPrint] handlePrintReceipt - paperWidthMm:', paperWidthMm);
                        const success = await printService.printThermal(fullReceiptHtml, printer, paperWidthMm);
                        if (!success && !printService.isElectron()) {
                            // Non-Electron fallback only: QZ / Agent
                            await printService.printHTML(fullReceiptHtml, printer, { paperWidthMm, strictlySilent: isAutoPrint });
                        } else if (!success && printService.isElectron()) {
                            console.warn('[PrintReceipt] Electron thermal failed — skipping fallback to avoid broken A4 job');
                            if (!isAutoPrint) toast.error("فشلت الطباعة — تحقق من إعدادات الطابعة");
                        }
                        if (!isAutoPrint) toast.success("Receipt sent to printer");
                        
                        // 2. Engineer Copy (Sequential)
                        if (includeEngineer) {
                            await new Promise(resolve => setTimeout(resolve, 800));
                            await handlePrintEngineer(isAutoPrint);
                        }
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

    const handlePrintEngineer = async (isAutoPrint = false) => {
        setIsPrintingEngineer(true);
        try {
            const fullEngineerHtml = generateEngineerReceiptHTML(ticket, settings);

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
                        if (!isAutoPrint) toast.info("Printing engineer copy...");
                        const paperWidthMm = settings?.paperSize === '58mm' ? 58 : 80;
                        const success = await printService.printThermal(fullEngineerHtml, receiptPrinter, paperWidthMm);
                        if (!success && !printService.isElectron()) {
                            await printService.printHTML(fullEngineerHtml, receiptPrinter, { paperWidthMm, strictlySilent: isAutoPrint });
                        } else if (!success && printService.isElectron()) {
                            console.warn('[PrintEngineer] Electron thermal failed — skipping fallback');
                            if (!isAutoPrint) toast.error("فشلت طباعة نسخة المهندس — تحقق من إعدادات الطابعة");
                        }
                        if (!isAutoPrint) toast.success("Engineer copy sent to printer");
                        return;
                    } catch (qzError) {
                        console.error("Print error:", qzError);
                    }
                }
            }

            if (isAutoPrint) return;

            const printWindow = window.open('', '_blank', 'width=800,height=600');
            if (printWindow) {
                printWindow.document.write(fullEngineerHtml.replace('</body>', `
                    <script>
                        window.onload = function() {
                            setTimeout(function() {
                                window.print();
                                window.close();
                            }, 500);
                        };
                    </script>
                    </body>
                `));
                printWindow.document.close();
            }
        } catch (error) {
            console.error("Print engineer error:", error);
            toast.error("Printing failed.");
        } finally {
            setIsPrintingEngineer(false);
        }
    }

    const handlePrintLabel = async (isAutoPrint = false) => {
        setIsPrintingLabel(true);
        try {
            const isQzConnected = typeof window !== 'undefined' && await printService.isServerOnline();
            if (isQzConnected) {
                const registry = printService.getRegistry();
                const labelPrinter = selectedLabelPrinter || 
                                    registry?.labelPrinter || 
                                    localStorage.getItem('printer_label') || 
                                    localStorage.getItem('printer_barcode');
                if (labelPrinter && labelPrinter !== 'none') {
                    // 🛡️ [FIX] Generate label HTML directly from ticket data.
                    // Previously this scraped printContentRef.current.innerHTML which:
                    //   (a) included unstyled Tailwind wrapper divs (no stylesheet in print doc)
                    //   (b) had a body translateX(-2mm) that clipped content off the 50mm page
                    //   (c) raced with react-barcode's async SVG render during auto-print
                    const storeName = settings?.name || 'CASPER POS';
                    const fullLabelHtml = generateTicketLabelHTML(ticket, storeName, translations);

                    // 🛡️ [FIX] Force Native Electron Priority
                    // The hardware feeds length-wise. We tell Electron it's 30mm wide and 50mm tall (portrait role).
                    if (typeof window !== 'undefined' && window.electronAPI?.printStandard) {
                        const result = await (window as any).electronAPI.printStandard(fullLabelHtml, labelPrinter, {
                            pageSize: { width: 38100, height: 25400 }, // in microns for 38.1mm x 25.4mm
                            margins: { marginType: 'none' },
                            printBackground: true,
                            silent: true,
                            deviceName: labelPrinter
                        });
                        if (!result?.success) throw new Error(result?.error || 'Label print failed');
                    } else {
                        const success = await printService.printSilentHTML(fullLabelHtml, labelPrinter);
                        if (!success) throw new Error('Label print fallback failed');
                    }
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

    // 🚀 Suppress UI only if in silent mode AND we have a printer to actually do the job
    const registry = printService.getRegistry();
    const hasPrinter = (defaultMode === 'receipt' && (selectedPrinter || registry?.thermalPrinter || localStorage.getItem('thermal_printer'))) ||
                       (defaultMode === 'label' && (selectedLabelPrinter || registry?.labelPrinter || localStorage.getItem('printer_label'))) ||
                       (defaultMode === 'engineer' && (selectedPrinter || registry?.thermalPrinter || localStorage.getItem('thermal_printer')));

    if (silent && hasPrinter) return null;

    return (
        <GlassModal
            isOpen={isOpen}
            onClose={onClose}
            title="Ticket Created"
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
                        onClick={() => setPreviewMode('engineer')}
                        className={`flex-1 flex items-center justify-center py-2 px-3 rounded-lg text-xs font-bold transition-all ${previewMode === 'engineer'
                            ? 'bg-orange-500 text-black shadow-lg shadow-orange-500/20'
                            : 'hover:bg-white/5 text-zinc-400 hover:text-white'
                            }`}
                    >
                        <SettingsIcon className="w-4 h-4 mr-2" />
                        ENGINEER
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
                                ) : previewMode === 'engineer' ? (
                                    <EngineerTicketReceipt
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
                        <div className="flex-[2] flex gap-2">
                            <Button
                                onClick={() => handlePrintReceipt(false, true)}
                                disabled={isPrintingReceipt || isPrintingEngineer}
                                className="flex-1 py-6 rounded-xl bg-cyan-500 text-black font-bold hover:bg-cyan-400 text-lg gap-2 shadow-lg shadow-cyan-500/20"
                            >
                                {isPrintingReceipt ? <Loader2 className="w-5 h-5 animate-spin" /> : <Printer className="w-5 h-5" />}
                                {isPrintingReceipt ? "Printing..." : "Print Both"}
                            </Button>
                            <Button
                                onClick={() => handlePrintReceipt(false, false)}
                                disabled={isPrintingReceipt}
                                variant="outline"
                                className="px-4 py-6 rounded-xl border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                                title="Print Customer Copy Only"
                            >
                                <UserIcon className="w-5 h-5" />
                            </Button>
                        </div>
                    ) : previewMode === 'engineer' ? (
                        <Button
                            onClick={() => handlePrintEngineer()}
                            disabled={isPrintingEngineer}
                            className="flex-[2] py-6 rounded-xl bg-orange-500 text-black font-bold hover:bg-orange-400 text-lg gap-2 shadow-lg shadow-orange-500/20"
                        >
                            {isPrintingEngineer ? <Loader2 className="w-5 h-5 animate-spin" /> : <SettingsIcon className="w-5 h-5" />}
                            {isPrintingEngineer ? t('loading') : tTicket('details.printOptions.printEngineer')}
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

