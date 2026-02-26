import { formatCurrency } from "@/lib/utils";

interface TemplateProps {
    purchaseData: any;
    settings?: any;
}

export const generateA4PurchaseHTML = ({ purchaseData, settings }: TemplateProps): string => {
    const items = purchaseData.items ?? [];
    const total = purchaseData.totalAmount ?? 0;
    const currency = settings?.currency ?? 'EGP';
    const date = new Date(purchaseData.date || new Date());
    const dateStr = date.toLocaleDateString('ar-EG');
    const timeStr = date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    // Store settings
    const storeName = settings?.name || 'CASPER POS';
    const storePhone = settings?.phone || '';
    const storeAddress = settings?.address || '';
    const taxRate = settings?.taxRate ? Number(settings.taxRate) : 0;
    const vatNumber = settings?.vatNumber || '';
    const logoUrl = settings?.logoUrl || '';

    // Supplier details
    const supplierName = purchaseData.supplierName || '';
    const supplierPhone = purchaseData.supplierPhone || '';
    const supplierAddress = purchaseData.supplierAddress || '';

    // Calculate tax backwards if needed, but for purchases we usually have discrete fields
    // For now, let's keep it consistent with the sales logic if that's what's expected
    const baseTotal = taxRate > 0 ? (total / (1 + (taxRate / 100))) : total;
    const taxAmount = taxRate > 0 ? (total - baseTotal) : 0;

    const invoiceLabel = "فاتورة مشتريات";
    const invoiceNumber = purchaseData.invoiceNumber || "Auto";

    return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            @page {
                size: A4;
                margin: 0;
            }
            body {
                font-family: 'Arial', sans-serif;
                margin: 0;
                padding: 2.5cm; /* Standard A4 margin */
                color: #1a1a1a;
                background: #ffffff;
                line-height: 1.5;
                font-size: 14px;
            }
            .document {
                width: 100%;
                margin: 0;
                background: #ffffff;
                color: #000000 !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .header {
                display: flex;
                flex-direction: row;
                justify-content: space-between;
                align-items: center;
                border-bottom: 2px solid #333;
                padding-bottom: 20px;
                margin-bottom: 30px;
            }
            .header-info {
                text-align: right;
            }
            .header-logo img {
                max-height: 80px;
                max-width: 250px;
                object-fit: contain;
            }
            h1.store-name {
                font-size: 28px;
                font-weight: 900;
                margin: 0 0 8px 0;
                color: #000;
            }
            .invoice-title-box {
                background: #333;
                color: #fff;
                padding: 10px 20px;
                border-radius: 8px;
                display: inline-block;
                margin-bottom: 30px;
                font-size: 20px;
                font-weight: bold;
            }
            .bill-to {
                display: flex;
                justify-content: space-between;
                margin-bottom: 30px;
                background-color: #f9f9f9;
                padding: 20px;
                border-radius: 12px;
                border: 1px solid #eee;
            }
            .section-title {
                font-size: 14px;
                font-weight: 900;
                color: #555;
                text-transform: uppercase;
                margin-bottom: 8px;
                border-bottom: 1px solid #ddd;
                padding-bottom: 4px;
            }
            .info-value {
                font-size: 16px;
                font-weight: bold;
                color: #000;
            }
            table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 40px;
            }
            th {
                background-color: #f4f4f4;
                color: #333;
                padding: 12px 15px;
                text-align: right;
                font-size: 15px;
                font-weight: 900;
                border: 1px solid #ddd;
            }
            td {
                padding: 12px 15px;
                border: 1px solid #ddd;
                vertical-align: middle;
            }
            .summary-container {
                display: flex;
                justify-content: flex-start;
            }
            .summary {
                width: 350px;
                background: #f9f9f9;
                padding: 20px;
                border-radius: 12px;
                border: 2px solid #333;
            }
            .summary-row {
                display: flex;
                justify-content: space-between;
                margin-bottom: 12px;
                font-size: 15px;
            }
            .summary-row.total {
                font-size: 20px;
                font-weight: 900;
                color: #000;
                border-top: 2px solid #333;
                padding-top: 15px;
                margin-top: 15px;
            }
            .footer {
                margin-top: 50px;
                text-align: center;
                border-top: 1px solid #eee;
                padding-top: 20px;
                color: #777;
                font-size: 12px;
            }
            .barcode-placeholder {
                margin-top: 20px;
                text-align: center;
                opacity: 0.5;
            }
        </style>
    </head>
    <body>
        <div class="document">
            <div class="header">
                <div class="header-info">
                    <h1 class="store-name">${storeName}</h1>
                    <div style="font-size: 14px; color: #444;">
                        ${storePhone ? `<div>📞 ${storePhone}</div>` : ''}
                        ${storeAddress ? `<div>📍 ${storeAddress}</div>` : ''}
                        ${vatNumber ? `<div>الرقم الضريبي: ${vatNumber}</div>` : ''}
                    </div>
                </div>
                <div class="header-logo">
                    ${logoUrl ? `<img src="${logoUrl}" alt="Logo" />` : ''}
                </div>
            </div>

            <div style="text-align: center;">
                <div class="invoice-title-box">${invoiceLabel}</div>
            </div>

            <div class="bill-to">
                <div style="flex: 1.5;">
                    <div class="section-title">بيانات المورد</div>
                    <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px;">${supplierName}</div>
                    ${supplierPhone ? `<div style="color: #555;">📞 ${supplierPhone}</div>` : ''}
                    ${supplierAddress ? `<div style="color: #555;">📍 ${supplierAddress}</div>` : ''}
                </div>
                
                <div style="flex: 1; text-align: left; padding-right: 30px; border-right: 1px solid #ddd;">
                    <div class="section-title">تفاصيل الفاتورة</div>
                    <div style="margin-bottom: 5px;">رقم الفاتورة: <span class="info-value">#${invoiceNumber}</span></div>
                    <div style="margin-bottom: 5px;">التاريخ: <span class="info-value">${dateStr}</span></div>
                    <div>الحالة: <span class="info-value">${purchaseData.status || 'نشط'}</span></div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th style="width: 50px;">#</th>
                        <th>الصنف / البيان</th>
                        <th style="width: 100px; text-align: center;">الكمية</th>
                        <th style="width: 150px;">السعر</th>
                        <th style="width: 150px; text-align: left;">الإجمالي</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map((item: any, i: number) => `
                        <tr>
                            <td style="text-align: center; color: #666;">${i + 1}</td>
                            <td>
                                <div style="font-weight: bold;">${item.name}</div>
                                <div style="font-size: 12px; color: #666; font-family: monospace;">SKU: ${item.sku}</div>
                            </td>
                            <td style="text-align: center;">${item.quantity}</td>
                            <td>${formatCurrency(item.unitCost, currency)}</td>
                            <td style="text-align: left;"><strong>${formatCurrency(item.unitCost * item.quantity, currency)}</strong></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="summary-container">
                <div class="summary">
                    <div class="summary-row">
                        <span>المجموع الفرعي:</span>
                        <span>${formatCurrency(baseTotal, currency)}</span>
                    </div>
                    ${taxRate > 0 ? `
                        <div class="summary-row">
                            <span>ضريبة القيمة المضافة (${taxRate}%):</span>
                            <span>${formatCurrency(taxAmount, currency)}</span>
                        </div>
                    ` : ''}
                    ${purchaseData.deliveryCharge > 0 ? `
                        <div class="summary-row">
                            <span>مصاريف الشحن:</span>
                            <span>${formatCurrency(purchaseData.deliveryCharge, currency)}</span>
                        </div>
                    ` : ''}
                    <div class="summary-row total">
                        <span>الإجمالي كلي:</span>
                        <span>${formatCurrency(total, currency)}</span>
                    </div>
                    <div class="summary-row" style="margin-top: 10px; font-size: 13px; color: #555;">
                        <span>تم دفع:</span>
                        <span>${formatCurrency(purchaseData.paidAmount || 0, currency)}</span>
                    </div>
                    ${(total - (purchaseData.paidAmount || 0)) > 0 ? `
                        <div class="summary-row" style="font-size: 13px; font-weight: bold; color: #b91c1c;">
                            <span>المتبقي (آجل):</span>
                            <span>${formatCurrency(total - (purchaseData.paidAmount || 0), currency)}</span>
                        </div>
                    ` : ''}
                </div>
            </div>

            <div class="footer">
                ${settings?.receiptFooter || 'تم إنشاء هذه الفاتورة بواسطة نظام Casper POS'}
                <div style="margin-top: 10px; font-size: 14px; color: #aaa;">
                    Powered by Casper POS
                </div>
                <div style="margin-top: 10px; font-size: 11px;">
                    تاريخ الطباعة: ${new Date().toLocaleString('ar-EG')}
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
};
