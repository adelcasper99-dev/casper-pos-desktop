
"use client";

import GlassModal from "@/components/ui/GlassModal";
import Image from "next/image";
import { Printer, CheckCircle, Loader2 } from "lucide-react";
import { useTranslations } from "@/lib/i18n-mock";
import { useState, useEffect } from "react";
import { getStoreSettings } from "@/actions/settings";
import { qzTrayService } from "@/lib/qz-tray-service";
import { printService } from "@/lib/print-service";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { formatArabicPrintText } from "@/lib/arabic-reshaper";
import { MM_TO_PX, PAPER_SIZES } from "@/lib/constants";
import html2canvas from "html2canvas";

interface ReceiptModalProps {
    isOpen: boolean;
    onClose: () => void;
    saleData: any;
    settings?: any; // New prop for optimization
}

export default function ReceiptModal({ isOpen, onClose, saleData, settings: settingsProp }: ReceiptModalProps) {
    const t = useTranslations("POS");
    // Initialize from prop if available
    const [settings, setSettings] = useState<any>(settingsProp || null);
    const [printAttempted, setPrintAttempted] = useState(false);
    const [copyCount, setCopyCount] = useState(1);
    const [saveAsDefault, setSaveAsDefault] = useState(false);

    useEffect(() => {
        const savedCopies = localStorage.getItem('casper_default_print_copies');
        if (savedCopies) {
            setCopyCount(parseInt(savedCopies, 10));
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            setPrintAttempted(false); // Reset on open
            // Only fetch if not provided via props
            if (settingsProp) {
                setSettings(settingsProp);
            } else {
                getStoreSettings().then(res => {
                    if (res.success) setSettings(res.data);
                });
            }
        }
    }, [isOpen, settingsProp]);

    // Auto-Print Logic
    useEffect(() => {
        if (isOpen && settings?.autoPrint && saleData && !printAttempted) {
            setPrintAttempted(true);
            // Small delay to ensure DOM is ready
            setTimeout(() => {
                handlePrint();
            }, 500);
        }
    }, [isOpen, settings, saleData, printAttempted]);

    if (!saleData) return null;

    const handlePrint = async () => {
        if (!settings) return;

        const printContent = document.getElementById("receipt-content");
        if (!printContent) return;

        // Save as default if checked
        if (saveAsDefault) {
            localStorage.setItem('casper_default_print_copies', copyCount.toString());
        }

        const paperWidthMm = settings.paperSize === '58mm' ? PAPER_SIZES.MOBILE : (settings.paperSize === '100mm' ? PAPER_SIZES.WIDE : PAPER_SIZES.STANDARD);
        const width = `${paperWidthMm}mm`; // CRITICAL: Use MM for correct physical sizing

        const receiptPrinter = localStorage.getItem('casper_receipt_printer');

        const printJob = async () => {
            // New instructions implementation: printReceipt()
            await printReceipt();
        };

        const printReceipt = async () => {
            const container = document.getElementById("receipt-container");
            if (!container) return;

            try {
                // Remove hidden class temporarily for capture if needed, 
                // but we'll use a permanent hidden container strategy
                const canvas = await html2canvas(container, {
                    scale: 2, // High clarity for print as requested
                    useCORS: true,
                    backgroundColor: "#ffffff",
                    logging: false
                });

                const base64Image = canvas.toDataURL('image/png');

                const response = await fetch('http://localhost:3002/print', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ image: base64Image }),
                });

                if (!response.ok) {
                    throw new Error(`Server responded with ${response.status}`);
                }

                console.log('Receipt sent to print server successfully');
            } catch (error) {
                console.error('Error during capture or print:', error);
                throw error; // Let the toast handle the error display
            }
        };

        toast.promise(printJob(), {
            loading: t('printing') || 'Printing...',
            success: t('sentToPrinter') || 'Sent to printer',
            error: (err) => `Print failed: ${err.message || 'Unknown error'}`
        });
    };

    return (
        <GlassModal isOpen={isOpen} onClose={onClose} title={t('printReceipt')}>
            <div className="flex flex-col items-center justify-center p-6 space-y-6">
                <div className="flex flex-col items-center gap-2">
                    <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center text-white shadow-[0_0_20px_rgba(34,197,94,0.5)] animate-bounce-in">
                        <CheckCircle className="w-10 h-10" />
                    </div>
                    <h2 className="text-2xl font-bold text-foreground tracking-wide">{t('saleCompleted')}</h2>
                </div>



                {/* Hidden Receipt Container for HTML-to-Image Pipeline */}
                <div id="receipt-container" dir="rtl" className="fixed -left-[9999px] top-0 bg-white text-black p-4 w-[300px]" style={{ fontFamily: 'Arial, sans-serif' }}>
                    <div className="text-center border-b border-dashed border-black pb-2 mb-2">
                        <h3 className="text-lg font-bold uppercase">{settings?.name || "CASPER POS"}</h3>
                        <p className="text-xs">{settings?.address}</p>
                        <p className="text-[10px]">{new Date(saleData.date).toLocaleString('ar-EG')}</p>
                    </div>

                    <div className="space-y-1 mb-2">
                        {saleData.items.map((item: any, i: number) => (
                            <div key={i} className="flex justify-between text-xs">
                                <span>{item.name}</span>
                                <span>{item.quantity} x {formatCurrency(item.price, settings?.currency)}</span>
                            </div>
                        ))}
                    </div>

                    <div className="border-t border-black pt-2 flex justify-between font-bold">
                        <span>المجموع (Total)</span>
                        <span>{formatCurrency(saleData.totalAmount, settings?.currency)}</span>
                    </div>

                    <div className="text-center text-[10px] mt-4 border-t border-dashed border-black pt-2">
                        {settings?.receiptFooter || "شكراً لزيارتكم"}
                    </div>
                </div>

                {/* Print Controls */}
                <div className="w-full bg-muted/30 p-4 rounded-2xl border border-border/50 space-y-4">
                    <div className="flex items-center justify-between">
                        <label className="text-sm font-bold opacity-70">{t('copyCount') || 'Number of Copies'}</label>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setCopyCount(Math.max(1, copyCount - 1))}
                                className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
                            >-</button>
                            <span className="w-8 text-center font-black">{copyCount}</span>
                            <button
                                onClick={() => setCopyCount(copyCount + 1)}
                                className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
                            >+</button>
                        </div>
                    </div>

                    <label className="flex items-center gap-3 cursor-pointer group">
                        <input
                            type="checkbox"
                            checked={saveAsDefault}
                            onChange={(e) => setSaveAsDefault(e.target.checked)}
                            className="w-5 h-5 rounded-lg border-2 border-muted bg-transparent transition-all checked:bg-cyan-500 checked:border-cyan-500"
                        />
                        <span className="text-sm font-bold opacity-70 group-hover:opacity-100 transition-opacity">
                            {t('saveAsDefault') || 'Save as Default'}
                        </span>
                    </label>
                </div>

                <div className="flex gap-3 w-full">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors text-foreground">
                        {t('close')}
                    </button>
                    <button onClick={handlePrint} disabled={!settings} className="flex-1 py-3 rounded-xl bg-cyan-500 text-black font-bold hover:bg-cyan-400 transition-colors flex items-center justify-center gap-2">
                        <Printer className="w-4 h-4" />
                        {t('print')}
                    </button>
                </div>
            </div>
        </GlassModal >
    );
}
