import React, { useRef } from 'react';
import Barcode from 'react-barcode';
import { Printer } from 'lucide-react';
import type { LabelProduct, LabelTemplate } from '@/lib/label-commands';
import { printService } from '@/lib/print-service';
import { useFormatCurrency } from "@/contexts/SettingsContext";

interface ProductToPrint extends LabelProduct {
    quantity: number;
}

interface ThermalPrintLabelProps {
    products: ProductToPrint[];
    storeName?: string;
    template?: LabelTemplate;
    autoPrint?: boolean;
    forceBrowser?: boolean; // New prop
    onAfterPrint?: () => void;
}

// 1mm ~ 3.78px at 96 DPI
const MM_TO_PX = 3.78;

/**
 * Thermal Print Label Component
 * Renders labels into a hidden container and uses a temporary iframe to print them.
 * This ensures strict isolation from global app styles and guarantees correct page sizing.
 */
export function ThermalPrintLabel({
    products,
    storeName = "CASPER POS",
    template,
    autoPrint = false,
    forceBrowser = false,
    onAfterPrint
}: ThermalPrintLabelProps) {
    const formatCurrency = useFormatCurrency();
    const printContentRef = useRef<HTMLDivElement>(null);
    const totalLabels = products.reduce((acc, p) => acc + p.quantity, 0);

    const handlePrint = React.useCallback(async () => {
        const content = printContentRef.current;
        if (!content) {
            console.error("Print content not found");
            return;
        }

        // Check for QZ Printer Setting
        let usedQZ = false;
        if (typeof window !== 'undefined' && !forceBrowser) {
            const barcodePrinter = localStorage.getItem('casper_barcode_printer');
            // We only use QZ if autoPrint is true (Quick Print) to avoid confusing behavior
            // Or if user explicitly clicked the button (autoPrint=false)
            if (barcodePrinter) {
                if (barcodePrinter) {
                    // Construct HTML for Silent Print (Agent or QZ)
                    const pageW = template?.page?.width || 58;
                    const pageH = template?.page?.height || 30;
                    // const orientation = pageW > pageH ? 'landscape' : 'portrait'; // Not needed for HTML string logic here

                    const printStyle = `
                    body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
                    .thermal-label-page { 
                        width: ${pageW}mm; height: ${pageH}mm; 
                        position: relative; page-break-after: always; 
                        box-sizing: border-box; overflow: hidden; 
                    }
                    .printable-area { position: absolute; width: 100%; height: 100%; top: 0; left: 0; }
                `;

                    const htmlContent = `
                    <html>
                    <head><meta charset="utf-8"><style>${printStyle}</style></head>
                    <body>${content.innerHTML}</body>
                    </html>
                `;

                    // Try compatible silent print services
                    const success = await printService.printSilentHTML(htmlContent, barcodePrinter);
                    if (success) {
                        if (onAfterPrint) onAfterPrint();
                        return;
                    }
                }
            }
        }

        // --- Browser Fallback (Iframe) ---
        // Create a hidden iframe
        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.width = '1px'; // Give it dimension to ensure layout engine wakes up
        iframe.style.height = '1px';
        iframe.style.border = 'none';
        iframe.style.opacity = '0.01'; // Hidden but technically rendered
        iframe.style.pointerEvents = 'none';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document;
        if (!doc) {
            document.body.removeChild(iframe);
            return;
        }

        // Safe accessors for dimensions
        const pageW = template?.page?.width || 58;
        const pageH = template?.page?.height || 30;
        const mT = template?.margin?.top || 0;
        const mR = template?.margin?.right || 0;
        const mB = template?.margin?.bottom || 0;
        const mL = template?.margin?.left || 0;

        // Determine orientation
        const orientation = pageW > pageH ? 'landscape' : 'portrait';

        // Generate clean CSS for the iframe
        const printStyle = `
            @page {
                size: ${pageW}mm ${pageH}mm ${orientation};
                margin: 0;
            }
            body {
                margin: 0;
                padding: 0;
                font-family: Arial, sans-serif;
            }
            .thermal-label-page {
                width: ${pageW}mm;
                height: ${pageH}mm;
                position: relative;
                page-break-after: always;
                box-sizing: border-box;
                overflow: hidden;
            }
            .printable-area {
                position: absolute;
                top: ${mT}mm;
                left: ${mL}mm;
                width: calc(100% - ${mL + mR}mm);
                height: calc(100% - ${mT + mB}mm);
            }
        `;

        // Get innerHTML
        // Use cloneNode to be safe against modifying the live ref if we needed to
        const contentHtml = content.outerHTML;

        // Write content to iframe
        doc.open();
        doc.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Print Labels</title>
                <style>${printStyle}</style>
            </head>
            <body>
                ${contentHtml}
            </body>
            </html>
        `);
        doc.close();

        // Print after slight delay to ensure rendering (esp. SVG/Fonts)
        setTimeout(() => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();

            // Cleanup after delay
            setTimeout(() => {
                if (document.body.contains(iframe)) {
                    document.body.removeChild(iframe);
                }
                if (onAfterPrint) onAfterPrint();
            }, 2000);
        }, 500);
    }, [template, onAfterPrint]);

    React.useEffect(() => {
        if (autoPrint && products.length > 0) {
            // Small timeout to ensure DOM is ready
            const timer = setTimeout(() => {
                handlePrint();
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [autoPrint, products, handlePrint]);

    const renderElementContent = (el: any, product: LabelProduct) => {
        const style = {
            fontSize: `${el.fontSize}pt`,
            fontWeight: el.fontWeight,
            whiteSpace: 'nowrap' as const,
            lineHeight: 1,
            fontFamily: 'Arial, sans-serif'
        };

        if (el.type === 'barcode') {
            return (
                <div style={{ transformOrigin: 'top left' }}>
                    <Barcode
                        value={product.sku}
                        width={1.5}
                        height={el.height ? el.height * MM_TO_PX : 40}
                        fontSize={0}
                        margin={0}
                        displayValue={false}
                        renderer="svg"
                    />
                </div>
            );
        }

        let text = '';
        const id = el.id?.toLowerCase() || '';

        if (id === 'productname') text = product.name;
        else if (id === 'price') text = formatCurrency(Number(product.price));
        else if (id === 'sku') text = product.sku;
        else if (id === 'storename') text = storeName;
        else text = el.label;

        if (id === 'sku' && !text.startsWith('SKU') && (el.label && el.label.includes('SKU'))) {
            text = `SKU: ${text}`;
        }

        return <div style={style}>{text}</div>;
    };

    // Helper to render a single label based on template
    const renderTemplateLabel = (product: LabelProduct) => {
        if (!template) return null;

        return (
            <div className="thermal-label-page">
                <div className="printable-area">
                    {template.elements.filter(el => el.visible).map(el => (
                        <div
                            key={el.id}
                            style={{
                                position: 'absolute',
                                left: `${el.x}mm`,
                                top: `${el.y}mm`,
                                transform: `rotate(${el.rotation || 0}deg)`,
                                transformOrigin: 'top left',
                                width: el.width ? `${el.width}mm` : 'auto',
                            }}
                        >
                            {renderElementContent(el, product)}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // Legacy Render (Flexbox) - Fallback
    const renderLegacyLabel = (product: LabelProduct) => {
        return (
            <div className="thermal-label-page" style={{
                width: '58mm',
                height: '30mm',
                padding: '2mm',
                boxSizing: 'border-box',
                border: '1px solid rgba(0,0,0,0.1)'
            }}>
                <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                    {/* Left Side: SKU (Vertical) */}
                    <div style={{
                        width: '15%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRight: '1px solid black',
                        marginRight: '2px'
                    }}>
                        <div style={{
                            fontSize: '10px',
                            fontWeight: 'bold',
                            whiteSpace: 'nowrap',
                            writingMode: 'vertical-rl',
                            transform: 'rotate(180deg)'
                        }}>
                            {product.sku}
                        </div>
                    </div>

                    {/* Right Side: Content */}
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        textAlign: 'center',
                        height: '100%',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            fontSize: '9px',
                            fontWeight: 'bold',
                            lineHeight: 1,
                            marginBottom: '4px',
                            width: '100%',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>
                            {storeName}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
                            <Barcode
                                value={product.sku}
                                width={1}
                                height={25}
                                fontSize={8}
                                margin={0}
                                displayValue={false}
                                renderer="svg"
                            />
                        </div>
                        <div style={{
                            fontSize: '9px',
                            lineHeight: 1,
                            marginBottom: '2px',
                            width: '100%',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                        }}>
                            {product.name}
                        </div>
                        <div style={{ fontSize: '10px', fontWeight: 'bold', lineHeight: 1 }}>
                            {formatCurrency(Number(product.price))}
                        </div>
                    </div>
                </div>
            </div>
        )
    };

    return (
        <>
            {/* Screen-only print button */}
            <button
                onClick={handlePrint}
                className="no-print px-6 py-2 bg-cyan-500 hover:bg-cyan-600 text-black font-bold rounded-lg flex items-center gap-2 transition-colors"
                type="button"
            >
                <Printer className="w-5 h-5" />
                Print {totalLabels} Label{totalLabels > 1 ? 's' : ''}
            </button>

            {/* 
                Hidden Source of Truth. 
                Use fixed position with opacity 0 to ensure it is part of the layout tree (not display: none)
                and fully rendered by the browser before we clone it.
            */}
            <div style={{ position: 'fixed', left: 0, top: 0, zIndex: -100, opacity: 0, pointerEvents: 'none' }}>
                <div ref={printContentRef}>
                    {products.flatMap((product) =>
                        Array.from({ length: product.quantity }).map((_, qtyIndex) => (
                            <div key={`${product.sku}-${qtyIndex}`}>
                                {template ? renderTemplateLabel(product) : renderLegacyLabel(product)}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </>
    );
}
