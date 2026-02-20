
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
import { MM_TO_PX, PAPER_SIZES } from "@/lib/constants";

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

        // Configurable width using standard MM
        const paperWidthMm = settings.paperSize === '58mm' ? PAPER_SIZES.MOBILE : (settings.paperSize === '100mm' ? PAPER_SIZES.WIDE : PAPER_SIZES.STANDARD);
        const width = `${paperWidthMm}mm`; // CRITICAL: Use MM for correct physical sizing

        // Generate the combined HTML
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    @page { margin: 0; }
                    body { font-family: 'Courier New', monospace; padding: 0; margin: 0 auto; width: ${width}; direction: ltr; background: white; text-align: center; transform: translateX(-4mm); }
                    .content { padding: 5mm; display: inline-block; width: 100%; text-align: left; box-sizing: border-box; }
                    .header { text-align: center; margin-bottom: 20px; border-bottom: 1px dashed black; padding-bottom: 10px; }
                    .logo { max-width: 60px; max-height: 60px; margin: 0 auto 10px auto; display: block; filter: grayscale(100%); }
                    .item { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 12px; }
                    .total { border-top: 1px dashed black; margin-top: 10px; padding-top: 10px; font-weight: bold; display: flex; justify-content: space-between; }
                    .footer { text-align: center; margin-top: 20px; font-size: 10px; white-space: pre-wrap; }
                    /* Hide screen-only styles */
                    .receipt-paper { box-shadow: none !important; transform: none !important; }
                    @media print {
                        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    }
                </style>
            </head>
            <body>
                <div class="content">
                    ${printContent.innerHTML}
                </div>
            </body>
            </html>
        `;

        const receiptPrinter = localStorage.getItem('casper_receipt_printer');

        toast.promise(printService.printHTML(htmlContent, receiptPrinter || undefined), {
            loading: t('printing') || 'Printing...',
            success: t('sentToPrinter') || 'Sent to printer',
            error: (err) => `Print failed: ${err.message || 'Unknown error'}`
        });
    };

    return (
        <GlassModal isOpen={isOpen} onClose={onClose} title="Receipt">
            <div className="flex flex-col items-center justify-center p-6 space-y-6">
                <div className="flex flex-col items-center gap-2">
                    <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center text-white shadow-[0_0_20px_rgba(34,197,94,0.5)] animate-bounce-in">
                        <CheckCircle className="w-10 h-10" />
                    </div>
                    <h2 className="text-2xl font-bold text-foreground tracking-wide">{t('saleCompleted')}</h2>
                </div>

                {/* Receipt Preview (Paper Style) */}
                {settings ? (
                    <div id="receipt-content" className="bg-white text-black p-6 w-full font-mono text-sm shadow-[0_0_30px_rgba(0,0,0,0.5)] relative overflow-hidden receipt-paper transform rotate-1"
                        style={{ maxWidth: `${(settings.paperSize === '58mm' ? PAPER_SIZES.MOBILE : (settings.paperSize === '100mm' ? PAPER_SIZES.WIDE : PAPER_SIZES.STANDARD)) * MM_TO_PX}px` }}>
                        {/* Zigzag Top */}
                        <div className="absolute top-0 left-0 w-full h-2 bg-[linear-gradient(45deg,transparent_33.333%,#ffffff_33.333%,#ffffff_66.667%,transparent_66.667%),linear-gradient(-45deg,transparent_33.333%,#ffffff_33.333%,#ffffff_66.667%,transparent_66.667%)] bg-[length:10px_20px]"></div>

                        <div className="header text-center border-b-2 border-dashed border-black/80 pb-4 mb-4 mt-2">
                            {settings?.logoUrl && settings.logoUrl !== "undefined" && (
                                <div className="relative w-16 h-16 mx-auto mb-2">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={settings.logoUrl}
                                        alt="Logo"
                                        className="logo opacity-80 grayscale object-contain w-16 h-16 mx-auto"
                                    />
                                </div>
                            )}
                            {settings.printHeader && (
                                <div className="text-xs font-bold mb-2 whitespace-pre-wrap">{settings.printHeader}</div>
                            )}
                            <h3 className="text-xl font-black tracking-widest uppercase">{settings.name || "CASPER POS"}</h3>
                            <p className="text-xs font-bold mt-1">{settings.address || "Ghost Retail System"}</p>
                            <p className="text-[10px] mt-2 text-zinc-600">{new Date(saleData.date).toLocaleString()}</p>
                            <p className="text-[10px] text-zinc-600">{t('saleNumber')} {saleData.saleId?.split('-')[0].toUpperCase()}</p>
                        </div>

                        <div className="items space-y-2 mb-4">
                            {saleData.items.map((item: any, i: number) => (
                                <div key={i} className="item flex justify-between items-end border-b border-dotted border-gray-300 pb-1">
                                    <div className="flex flex-col">
                                        <span className="font-bold">{item.name}</span>
                                        <span className="text-xs text-zinc-500">x{item.quantity} @ {formatCurrency(item.price, settings.currency)}</span>
                                    </div>
                                    <span className="font-bold">{formatCurrency(item.price * item.quantity, settings.currency)}</span>
                                </div>
                            ))}
                        </div>

                        <div className="total border-t-2 border-black pt-4 mb-6">
                            <div className="flex justify-between text-lg font-black">
                                <span>{t('total').toUpperCase()}</span>
                                <span>{formatCurrency(saleData.totalAmount, settings.currency)}</span>
                            </div>
                            <div className="flex justify-between text-xs font-bold mt-2 text-zinc-600 uppercase border-t border-dotted border-black/30 pt-2">
                                <span>{t('paidVia')}</span>
                                <span>{saleData.paymentMethod?.replace('_', ' ')}</span>
                            </div>
                        </div>

                        {/* Warranty Information */}
                        {saleData.warranty?.warrantyDays && (
                            <div className="warranty border-t border-dashed border-black/60 pt-3 mb-3 text-center">
                                <div className="flex items-center justify-center gap-2 mb-2">
                                    <span className="text-xs font-black uppercase">🛡️ {t('warranty.title')}</span>
                                </div>
                                <div className="text-[10px] space-y-1 text-zinc-700">
                                    <div className="flex justify-between">
                                        <span>{t('warranty.period')}:</span>
                                        <span className="font-bold">{saleData.warranty.warrantyDays} {t('warranty.days')}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>{t('warranty.expires')}:</span>
                                        <span className="font-bold">
                                            {new Date(saleData.warranty.warrantyExpiryDate).toLocaleDateString('ar-EG')}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="footer text-center text-[10px] font-bold text-zinc-500 space-y-1 whitespace-pre-wrap">{settings.receiptFooter || "THANK YOU FOR YOUR VISIT"}
                        </div>

                        {/* Zigzag Bottom */}
                        <div className="absolute bottom-0 left-0 w-full h-2 bg-[linear-gradient(45deg,transparent_33.333%,#ffffff_33.333%,#ffffff_66.667%,transparent_66.667%),linear-gradient(-45deg,transparent_33.333%,#ffffff_33.333%,#ffffff_66.667%,transparent_66.667%)] bg-[length:10px_20px]"></div>
                    </div>
                ) : (
                    <div className="h-[300px] flex items-center justify-center">
                        <Loader2 className="animate-spin text-muted-foreground" />
                    </div>
                )}

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
        </GlassModal>
    );
}
