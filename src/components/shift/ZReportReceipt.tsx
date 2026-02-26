"use client";

import { useRef, useState, useEffect } from "react";
import { printService } from "@/lib/print-service";
import { toast } from "sonner";
import { formatArabicPrintText } from "@/lib/arabic-reshaper";
import { generateZReportThermalHTML, generateZReportA4HTML } from "./ZReportTemplates";
import { FileText, Printer, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ZReportReceiptProps {
    shift: any;
}

export default function ZReportReceipt({ shift }: ZReportReceiptProps) {
    const [isPrinting, setIsPrinting] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [receiptFormat, setReceiptFormat] = useState<'thermal' | 'a4'>('thermal');

    useEffect(() => {
        const registry = printService.getRegistry();
        if (registry?.receiptFormat) {
            setReceiptFormat(registry.receiptFormat as 'thermal' | 'a4');
        }
    }, []);

    const processArabicHtml = (html: string) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);

        let node;
        while ((node = walker.nextNode())) {
            if (node.nodeValue && node.nodeValue.trim() !== '') {
                node.nodeValue = formatArabicPrintText(node.nodeValue);
            }
        }
        return doc.documentElement.outerHTML;
    };

    const handlePrint = async () => {
        if (isPrinting) return;
        setIsPrinting(true);

        try {
            // Get store settings for the template (can be passed from parent or fetched)
            // For now, we'll use empty settings which fall back to defaults in template
            const settings = {};

            let htmlContent = receiptFormat === 'a4'
                ? generateZReportA4HTML({ shift, settings })
                : generateZReportThermalHTML({ shift, settings });

            // Process Arabic text
            htmlContent = processArabicHtml(htmlContent);

            const registry = printService.getRegistry();
            const targetPrinter = receiptFormat === 'a4'
                ? registry?.a4Printer
                : registry?.thermalPrinter;

            await printService.printHTML(htmlContent, targetPrinter, {
                paperWidthMm: receiptFormat === 'a4' ? 210 : 80
            });

            toast.success(`Z-Report sent to ${receiptFormat.toUpperCase()} printer`);
        } catch (error) {
            console.error("Z-Report print failed:", error);
            toast.error("Failed to print Z-Report");
        } finally {
            setIsPrinting(false);
        }
    };

    const handleExportPDF = async () => {
        if (isExporting) return;
        setIsExporting(true);

        try {
            const settings = {};
            let htmlContent = generateZReportA4HTML({ shift, settings });
            htmlContent = processArabicHtml(htmlContent);

            const filename = `Z-Report-${shift.id.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.pdf`;
            const result = await printService.saveToPDF(htmlContent, filename);

            if (result.success) {
                toast.success("Z-Report exported as PDF successfully");
            } else {
                throw new Error(result.error);
            }
        } catch (error: any) {
            console.error("PDF export failed:", error);
            toast.error("Failed to export PDF: " + (error.message || "Unknown error"));
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="bg-white/5 border border-white/10 p-6 rounded-xl shadow-2xl max-w-md w-full backdrop-blur-md">
            <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-cyan-400" />
                Shift Report (Z-Report)
            </h3>

            <div className="space-y-3">
                <Button
                    onClick={handlePrint}
                    disabled={isPrinting}
                    className="w-full bg-cyan-600 hover:bg-cyan-500 text-white flex items-center justify-center gap-2 h-12 text-base shadow-lg shadow-cyan-900/20"
                >
                    {isPrinting ? (
                        <span className="flex items-center gap-2">
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                            Printing...
                        </span>
                    ) : (
                        <>
                            <Printer className="w-5 h-5" />
                            Print to {receiptFormat.toUpperCase()}
                        </>
                    )}
                </Button>

                <Button
                    variant="outline"
                    onClick={handleExportPDF}
                    disabled={isExporting}
                    className="w-full border-white/20 text-white hover:bg-white/5 flex items-center justify-center gap-2 h-12 text-base"
                >
                    {isExporting ? (
                        <span className="flex items-center gap-2">
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                            Exporting...
                        </span>
                    ) : (
                        <>
                            <FileDown className="w-5 h-5" />
                            Export as PDF
                        </>
                    )}
                </Button>

                <p className="text-[10px] text-zinc-500 text-center mt-2">
                    Default format: <span className="text-cyan-400 uppercase font-bold">{receiptFormat}</span>.
                    Change in printer settings.
                </p>
            </div>
        </div>
    );
}
