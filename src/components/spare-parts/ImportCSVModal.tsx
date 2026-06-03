'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from '@/lib/i18n-mock';
import { Upload, FileText, X, Check, AlertCircle, Download } from 'lucide-react';
import { toast } from 'sonner';
import { importSpareParts } from '@/actions/spare-parts';
import { generateInventoryTemplate } from '@/lib/export-templates';
import GlassModal from '@/components/ui/GlassModal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

interface ParsedPart {
    productName: string;
    brand: string;
    quantity: string;
    costPrice: string;
    sellPrice: string;
    price1?: string;
    price2?: string;
    price3?: string;
}

interface ImportResult {
    success: number;
    failed: number;
    errors: string[];
}

const BRANDS_MAP: Record<string, string> = {
    'apple': 'Apple', 'iphone': 'Apple', 'i phone': 'Apple', 'ipad': 'Apple', 'macbook': 'Apple',
    'samsung': 'Samsung', 'galaxy': 'Samsung',
    'huawei': 'Huawei', 'mate': 'Huawei', 'nova': 'Huawei',
    'honor': 'Honor',
    'alcatel': 'Alcatel', 'alecatel': 'Alcatel',
    'xiaomi': 'Xiaomi', 'redmi': 'Xiaomi', 'mi ': 'Xiaomi', 'poco': 'Xiaomi',
    'oppo': 'Oppo', 'reno': 'Oppo',
    'realme': 'Realme',
    'vivo': 'Vivo',
    'nokia': 'Nokia',
    'sony': 'Sony', 'xperia': 'Sony',
    'google': 'Google', 'pixel': 'Google',
    'oneplus': 'OnePlus',
    'infinix': 'Infinix',
    'tecno': 'Tecno',
    'itel': 'Itel',
    'joyroom': 'Joyroom',
};

const extractBrand = (name: string): string => {
    const lowerName = name.toLowerCase();
    for (const [key, value] of Object.entries(BRANDS_MAP)) {
        if (lowerName.includes(key)) return value;
    }
    return 'Other';
};

const cleanNumericString = (val: string): string => {
    if (!val) return '0';
    // Keep only digits, minus sign, and decimal point
    const cleaned = val.replace(/[^\d.-]/g, '');
    return isNaN(Number(cleaned)) || cleaned === '' ? '0' : cleaned;
};

export function ImportCSVModal({ open, onOpenChange }: Props) {
    const t = useTranslations('SpareParts');
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isPending, setIsPending] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [parsedData, setParsedData] = useState<ParsedPart[]>([]);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [errors, setErrors] = useState<string[]>([]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        setFile(selectedFile);
        setImportResult(null);
        setErrors([]);

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const XLSX = await import('xlsx');
                const arrayBuffer = event.target?.result as ArrayBuffer;
                const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const excelData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

                if (excelData.length < 2) {
                    setErrors(['File is empty or has no data rows']);
                    return;
                }

                const headers = (excelData[0] || []).map(h => String(h || '').trim());

                // Map Arabic column names to English
                const headerMap: Record<string, number> = {};
                headers.forEach((header, index) => {
                    const lowerHeader = header.toLowerCase();
                    if (lowerHeader.includes('مرجع') || lowerHeader.includes('ref') || lowerHeader.includes('sku') || lowerHeader.includes('كود')) {
                        headerMap['sku'] = index;
                    } else if (lowerHeader.includes('اسم') || lowerHeader.includes('name') || lowerHeader.includes('product') || lowerHeader.includes('صنف')) {
                        headerMap['productName'] = index;
                    } else if (lowerHeader.includes('كمية') || lowerHeader.includes('عدد') || lowerHeader.includes('quantity') || lowerHeader.includes('qty')) {
                        headerMap['quantity'] = index;
                    } else if (lowerHeader.includes('تكلفة') || lowerHeader.includes('cost') || lowerHeader.includes('شراء')) {
                        headerMap['costPrice'] = index;
                    } else if (lowerHeader.includes('بيع') || lowerHeader.includes('sell') || lowerHeader.includes('price') || lowerHeader.includes('سعر')) {
                        // Check for price variants
                        if (lowerHeader.includes('1') || lowerHeader.includes('فرعي 1')) headerMap['price1'] = index;
                        else if (lowerHeader.includes('2') || lowerHeader.includes('فرعي 2')) headerMap['price2'] = index;
                        else if (lowerHeader.includes('3') || lowerHeader.includes('فرعي 3')) headerMap['price3'] = index;
                        else if (!headerMap['sellPrice']) headerMap['sellPrice'] = index; // Main sell price
                    } else if (lowerHeader.includes('ماركة') || lowerHeader.includes('brand') || lowerHeader.includes('تصنيف') || lowerHeader.includes('category')) {
                        headerMap['brand'] = index;
                    }
                });

                const parts: ParsedPart[] = [];
                const parseErrors: string[] = [];

                for (let i = 1; i < excelData.length; i++) {
                    const values = (excelData[i] || []).map(v => String(v ?? '').trim());
                    if (values.every(v => !v)) continue;

                    const productName = headerMap['productName'] !== undefined ? values[headerMap['productName']] || '' : '';
                    let brand = headerMap['brand'] !== undefined ? values[headerMap['brand']] || '' : '';
                    const quantity = headerMap['quantity'] !== undefined ? cleanNumericString(values[headerMap['quantity']]) : '0';
                    const costPrice = headerMap['costPrice'] !== undefined ? cleanNumericString(values[headerMap['costPrice']]) : '0';
                    const sellPrice = headerMap['sellPrice'] !== undefined ? cleanNumericString(values[headerMap['sellPrice']]) : '0';
                    const price1 = headerMap['price1'] !== undefined ? cleanNumericString(values[headerMap['price1']]) : '0';
                    const price2 = headerMap['price2'] !== undefined ? cleanNumericString(values[headerMap['price2']]) : '0';
                    const price3 = headerMap['price3'] !== undefined ? cleanNumericString(values[headerMap['price3']]) : '0';
                    const sku = headerMap['sku'] !== undefined ? values[headerMap['sku']] || null : null;

                    if (!productName) {
                        parseErrors.push(`Row ${i + 1}: Missing product name`);
                        continue;
                    }

                    // Smart Extraction: If brand is empty or "Other", try to extract from name
                    const isExtracted = !brand || brand === 'Other';
                    if (isExtracted) {
                        brand = extractBrand(productName);
                    }

                    parts.push({
                        productName,
                        brand,
                        quantity,
                        costPrice,
                        sellPrice,
                        price1,
                        price2,
                        price3,
                        sku,
                        isExtractedBrand: isExtracted && brand !== 'Other',
                    } as any);
                }

                if (parseErrors.length > 0) {
                    setErrors(parseErrors.slice(0, 5));
                }

                setParsedData(parts);
            } catch (error) {
                console.error('Error parsing file:', error);
                setErrors(['Failed to parse the file']);
            }
        };

        reader.readAsArrayBuffer(selectedFile);
    };

    const handleImport = async () => {
        if (parsedData.length === 0) return;

        setIsPending(true);
        try {
            const result = await importSpareParts({ parts: parsedData });

            if (result.success && result.results) {
                setImportResult(result.results);
                toast.success(t('importSuccess'));
                router.refresh();
            } else {
                toast.error(t('importError'));
            }
        } catch (error) {
            toast.error(t('importError'));
            console.error('Error importing parts:', error);
        } finally {
            setIsPending(false);
        }
    };

    const handleClose = () => {
        setFile(null);
        setParsedData([]);
        setImportResult(null);
        setErrors([]);
        onOpenChange(false);
    };

    return (
        <GlassModal
            isOpen={open}
            onClose={handleClose}
            title={t('importCSV')}
        >
            <div className="space-y-4">
                {/* File Upload Area */}
                <div
                    className={cn(
                        "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors",
                        file
                            ? "border-cyan-500/50 bg-cyan-500/10"
                            : "border-border hover:border-cyan-500/50"
                    )}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={handleFileChange}
                        className="hidden"
                    />
                    
                    {!file && (
                        <div>
                            <p className="text-sm font-bold text-muted-foreground mr-1">{t('file')} (CSV, Excel)</p>
                            <label
                                htmlFor="file-upload"
                                className="flex items-center justify-center gap-2 cursor-pointer bg-muted/50 hover:bg-muted p-2 px-4 rounded-xl border border-border/50 text-sm font-medium transition-colors"
                            >
                                <Upload className="w-4 h-4 text-cyan-400" />
                                {t('selectFile')}
                            </label>
                            <input
                                id="file-upload"
                                type="file"
                                accept=".csv,.xlsx,.xls"
                                onChange={handleFileChange}
                                className="hidden"
                            />
                            <div className="mt-4 border-t border-border/30 pt-4">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        generateInventoryTemplate();
                                    }}
                                    className="flex items-center justify-center gap-2 mx-auto text-sm text-cyan-400 hover:text-cyan-300 font-bold transition-colors"
                                    title="تحميل ملف Excel جاهز للاستيراد"
                                >
                                    <Download className="w-4 h-4" />
                                    تحميل نموذج الاستيراد
                                </button>
                            </div>
                        </div>
                    )}

                    {file ? (
                        <div className="flex items-center justify-center gap-2">
                            <FileText className="w-8 h-8 text-cyan-400" />
                            <div className="text-left">
                                <p className="font-bold text-sm">{file.name}</p>
                                <p className="text-xs text-muted-foreground">
                                    {(file.size / 1024).toFixed(2)} KB
                                </p>
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setFile(null);
                                    setParsedData([]);
                                }}
                                className="ml-4 p-1 hover:bg-white/10 rounded"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2">
                            <Upload className="w-8 h-8 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">
                                {t('clickToUpload')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {t('supportedFormats')}
                            </p>
                        </div>
                    )}
                </div>

                {/* Parsed Data Preview */}
                {parsedData.length > 0 && !importResult && (
                    <div className="bg-muted/30 rounded-lg p-3">
                        <p className="text-sm font-bold text-cyan-400">
                            {parsedData.length} {t('rowsFound')}
                        </p>
                        <div className="mt-2 max-h-40 overflow-y-auto text-xs">
                            {parsedData.slice(0, 10).map((part, index) => (
                                <div key={index} className="flex gap-2 py-1.5 border-b border-border/30 items-center">
                                    <span className="truncate flex-1 font-bold">{part.productName}</span>
                                    <span className={cn(
                                        "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest",
                                        (part as any).isExtractedBrand 
                                            ? "bg-cyan-500/20 text-cyan-500 border border-cyan-500/30" 
                                            : "text-muted-foreground"
                                    )}>
                                        {part.brand}
                                    </span>
                                    <span className="text-green-400 font-bold ml-auto">{part.sellPrice}</span>
                                </div>
                            ))}
                            {parsedData.length > 10 && (
                                <p className="text-[10px] text-muted-foreground text-center py-2 italic">
                                    ... showing 10 of {parsedData.length} items
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Errors */}
                {errors.length > 0 && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-red-400">
                            <AlertCircle className="w-4 h-4" />
                            <p className="text-sm font-bold">{t('errors')}</p>
                        </div>
                        <ul className="mt-2 text-xs text-red-300/70 space-y-1">
                            {errors.map((error, index) => (
                                <li key={index}>{error}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Import Results */}
                {importResult && (
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-green-400">
                            <Check className="w-4 h-4" />
                            <p className="text-sm font-bold">{t('importComplete')}</p>
                        </div>
                        <div className="mt-2 text-sm">
                            <p className="text-green-300">{t('successfullyImported')}: {importResult.success}</p>
                            {(importResult as any).updated > 0 && (
                                <p className="text-cyan-300">Updated: {(importResult as any).updated}</p>
                            )}
                            {importResult.failed > 0 && (
                                <p className="text-red-300">{t('failedToImport')}: {importResult.failed}</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={handleClose}
                        className="flex-1"
                    >
                        {importResult ? t('close') : t('cancel')}
                    </Button>

                    {parsedData.length > 0 && !importResult && (
                        <Button
                            onClick={handleImport}
                            disabled={isPending}
                            className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-black font-bold"
                        >
                            {isPending ? t('importing') : t('importNow')}
                        </Button>
                    )}
                </div>
            </div>
        </GlassModal>
    );
}
