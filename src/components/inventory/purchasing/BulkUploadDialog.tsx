"use client";

import { useState, ChangeEvent } from "react";
import { Upload, Download, X, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { parseCSV, groupIntoInvoices, validateCSVData, checkDuplicateSKUs, type ParsedInvoice } from "@/lib/utils/csvParser";
import { bulkImportPurchases } from "@/actions/inventory";
import { toast } from "sonner";
import { useTranslations } from "@/lib/i18n-mock";

interface BulkUploadDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUploadComplete: () => void;
    csrfToken?: string;
}

export function BulkUploadDialog({
    open,
    onOpenChange,
    onUploadComplete,
    csrfToken
}: BulkUploadDialogProps) {
    const t = useTranslations('Purchasing.bulkImport');

    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<ParsedInvoice[]>([]);
    const [validationErrors, setValidationErrors] = useState<any[]>([]);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState<any | null>(null);

    const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        setFile(selectedFile);
        setResult(null);
        setValidationErrors([]);

        try {
            const text = await selectedFile.text();
            const rows = parseCSV(text);
            const invoices = groupIntoInvoices(rows);

            // Validate
            const validation = validateCSVData(invoices);
            const duplicates = checkDuplicateSKUs(invoices);

            if (!validation.valid) {
                setValidationErrors(validation.errors);
                toast.error(t('errorsFound', { count: validation.errors.length }));
            } else if (duplicates.length > 0) {
                toast.warning(`Warning: Duplicate SKUs found: ${duplicates.join(', ')}`);
                setPreview(invoices);
            } else {
                setPreview(invoices);
                toast.success(t('success', { count: invoices.length }));
            }
        } catch (error: any) {
            toast.error(`Failed to parse CSV: ${error.message}`);
            setFile(null);
        }
    };

    const handleUpload = async () => {
        if (preview.length === 0) return;

        setUploading(true);
        try {
            const res = await bulkImportPurchases({ invoices: preview, csrfToken });

            if (res.success && res.results) {
                setResult(res.results);

                if (res.results.failed === 0) {
                    toast.success(t('success', { count: res.results.successful }));
                    setTimeout(() => {
                        onUploadComplete();
                        onOpenChange(false);
                    }, 2000);
                } else {
                    toast.warning(t('failedCount', { successful: res.results.successful, failed: res.results.failed }));
                }
            } else {
                toast.error(t('importFailed'));
            }
        } catch (error: any) {
            toast.error(`Import error: ${error.message}`);
        } finally {
            setUploading(false);
        }
    };

    const handleDownloadTemplate = () => {
        window.open('/templates/purchase-invoice-template.csv', '_blank');
    };

    const handleClose = () => {
        setFile(null);
        setPreview([]);
        setValidationErrors([]);
        setResult(null);
        onOpenChange(false);
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in"
            onClick={handleClose}
        >
            <div
                className="bg-card border border-border rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
                dir="rtl"
            >
                {/* Header */}
                <div className="p-6 border-b border-border flex justify-between items-center bg-muted/20">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <Upload className="w-5 h-5 text-indigo-400" />
                            {t('title')}
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            {t('description')}
                        </p>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 hover:bg-muted rounded-full text-muted-foreground transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* File Upload */}
                    {!result && (
                        <div className="space-y-4">
                            <div className="flex gap-3">
                                <label className="flex-1 cursor-pointer">
                                    <div className="glass-card p-8 border-2 border-dashed border-border hover:border-cyan-500 transition-colors text-center">
                                        <Upload className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                                        <p className="font-bold text-foreground">
                                            {file ? file.name : t('selectFile')}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {t('maxSizeNote', { size: '10MB', count: 500 })}
                                        </p>
                                    </div>
                                    <input
                                        type="file"
                                        accept=".csv"
                                        onChange={handleFileSelect}
                                        className="hidden"
                                    />
                                </label>

                                <button
                                    onClick={handleDownloadTemplate}
                                    className="bg-muted hover:bg-muted/80 text-foreground font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                                >
                                    <Download className="w-4 h-4" />
                                    {t('templateButton')}
                                </button>
                            </div>

                            {/* Validation Errors */}
                            {validationErrors.length > 0 && (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <AlertCircle className="w-5 h-5 text-red-500" />
                                        <span className="font-bold text-red-500">{t('errorsFound', { count: validationErrors.length })}</span>
                                    </div>
                                    <div className="max-h-40 overflow-y-auto space-y-1">
                                        {validationErrors.slice(0, 10).map((err, idx) => (
                                            <div key={idx} className="text-sm text-red-400">
                                                {t('row')} {err.row}, {t('field')} {err.field}: {err.message}
                                            </div>
                                        ))}
                                        {validationErrors.length > 10 && (
                                            <div className="text-sm text-red-400 italic">
                                                ...
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Preview */}
                            {preview.length > 0 && validationErrors.length === 0 && (
                                <div className="glass-card p-4 space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="font-bold">{t('preview', { count: preview.length })}</span>
                                        <span className="text-sm text-muted-foreground">
                                            {t('totalItems', { count: preview.reduce((acc, inv) => acc + inv.items.length, 0) })}
                                        </span>
                                    </div>

                                    <div className="max-h-64 overflow-y-auto space-y-2">
                                        {preview.slice(0, 5).map((invoice, idx) => (
                                            <div key={idx} className="bg-muted/30 p-3 rounded-lg text-sm">
                                                <div className="font-bold">{invoice.supplier}</div>
                                                <div className="text-muted-foreground text-xs">
                                                    {invoice.invoiceNumber || 'Auto'} • {invoice.items.length} items • {invoice.paymentMethod}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Results */}
                    {result && (
                        <div className="space-y-4">
                            <div className={`p-6 rounded-lg border-2 ${result.failed === 0 ? 'bg-green-500/10 border-green-500/20' : 'bg-yellow-500/10 border-yellow-500/20'}`}>
                                <div className="flex items-center gap-3 mb-3">
                                    {result.failed === 0 ? (
                                        <CheckCircle2 className="w-8 h-8 text-green-500" />
                                    ) : (
                                        <AlertCircle className="w-8 h-8 text-yellow-500" />
                                    )}
                                    <div>
                                        <div className="text-2xl font-bold">
                                            {t('success', { successful: result.successful, total: result.total })}
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            {result.failed} failed
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {result.errors.length > 0 && (
                                <div className="glass-card p-4 space-y-2">
                                    <div className="font-bold text-red-400">{t('failedInvoices')}</div>
                                    <div className="max-h-48 overflow-y-auto space-y-2">
                                        {result.errors.map((err: any, idx: number) => (
                                            <div key={idx} className="bg-red-500/10 p-2 rounded text-sm">
                                                <div className="font-bold">{err.invoice}</div>
                                                <div className="text-red-400 text-xs">{err.error}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-border bg-muted/20 flex justify-between items-center">
                    <button
                        onClick={handleClose}
                        className="bg-muted hover:bg-muted/80 text-foreground font-bold px-6 py-2 rounded-lg transition-colors"
                    >
                        {result ? t('close') : t('cancel')}
                    </button>

                    {!result && preview.length > 0 && validationErrors.length === 0 && (
                        <button
                            onClick={handleUpload}
                            disabled={uploading}
                            className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold px-8 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50 transition-all shadow-lg shadow-cyan-500/20"
                        >
                            {uploading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    {t('importing')}
                                </>
                            ) : (
                                <>
                                    <Upload className="w-5 h-5" />
                                    {t('importButton', { count: preview.length })}
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
