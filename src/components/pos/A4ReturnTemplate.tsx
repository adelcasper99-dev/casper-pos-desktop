import { formatCurrency } from "@/lib/utils";

interface TemplateProps {
    saleData: any;
    settings?: any;
}

export const generateA4ReturnHTML = ({ saleData, settings }: TemplateProps): string => {
    const items = saleData._partialItems || saleData.items || [];
    const total = Math.abs(saleData.totalAmount);
    const currency = settings?.currency || 'EGP';
    const date = new Date(saleData.createdAt || saleData.date || new Date());
    const dateStr = date.toLocaleDateString('ar-EG');
    const timeStr = date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    // Store settings
    const storeName = settings?.name || 'CASPER POS';
    const storePhone = settings?.phone || '';
    const storeAddress = settings?.address || '';
    const taxRate = settings?.taxRate ? Number(settings.taxRate) : 0;
    const vatNumber = settings?.vatNumber || '';
    const logoUrl = settings?.logoUrl || '';

    // Customer details
    const customerName = saleData.customerName || '';
    const customerPhone = saleData.customerPhone || '';
    const customerAddress = saleData.customerAddress || '';

    // Calculate tax backwards (Refunds are usually inclusive)
    const baseTotal = taxRate > 0 ? (total / (1 + (taxRate / 100))) : total;
    const taxAmount = taxRate > 0 ? (total - baseTotal) : 0;

    const returnLabel = "إشعار دائن (مرتجع)";
    const invoiceNumber = saleData.invoiceNumber || saleData.id.slice(0, 8).toUpperCase();

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
                padding: 2cm;
                color: #1a1a1a;
                background: #ffffff;
                line-height: 1.4;
                font-size: 14px;
            }
            .document {
                width: 100%;
                max-width: 100%;
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
                border-bottom: 3px solid #ef4444; /* Red for returns */
                padding-bottom: 15px;
                margin-bottom: 25px;
            }
            .header-info {
                text-align: right;
            }
            .header-logo img {
                max-height: 70px;
                max-width: 200px;
                object-fit: contain;
            }
            h1.store-name {
                font-size: 26px;
                font-weight: 900;
                margin: 0 0 5px 0;
                color: #000;
            }
            .return-title {
                text-align: center;
                margin-bottom: 25px;
            }
            .return-title h2 {
                display: inline-block;
                background: #ef4444;
                color: #fff;
                padding: 10px 30px;
                border-radius: 8px;
                margin: 0;
                font-size: 22px;
            }
            .bill-to {
                display: flex;
                justify-content: space-between;
                margin-bottom: 25px;
                background-color: #fef2f2; /* Light red background */
                padding: 15px;
                border-radius: 10px;
                border: 1px solid #fee2e2;
            }
            .section-title {
                font-size: 13px;
                font-weight: 900;
                color: #ef4444;
                text-transform: uppercase;
                margin-bottom: 6px;
                border-bottom: 1px solid #fecaca;
                padding-bottom: 3px;
            }
            .info-value {
                font-size: 16px;
                font-weight: bold;
                color: #333;
            }
            table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 30px;
            }
            th {
                background-color: #444;
                color: #fff;
                padding: 10px 15px;
                text-align: right;
                font-size: 15px;
                font-weight: bold;
            }
            td {
                padding: 10px 15px;
                border-bottom: 1px solid #eee;
                vertical-align: middle;
            }
            .summary-container {
                display: flex;
                justify-content: flex-start;
            }
            .summary {
                width: 320px;
                background: #f9f9f9;
                padding: 15px;
                border-radius: 10px;
                border: 2px solid #ef4444;
            }
            .summary-row {
                display: flex;
                justify-content: space-between;
                margin-bottom: 8px;
                font-size: 14px;
            }
            .summary-row.total {
                font-size: 20px;
                font-weight: 900;
                color: #ef4444;
                border-top: 2px solid #ef4444;
                padding-top: 12px;
                margin-top: 12px;
            }
            .footer {
                margin-top: 40px;
                text-align: center;
                border-top: 1px solid #eee;
                padding-top: 20px;
                color: #666;
                font-size: 12px;
            }
            .reason-box {
                margin-top: 20px;
                padding: 15px;
                background: #fff5f5;
                border-right: 5px solid #ef4444;
                border-radius: 4px;
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

            <div class="return-title">
                <h2>${returnLabel}</h2>
            </div>

            <div class="bill-to">
                <div style="flex: 1.5;">
                    <div class="section-title">بيانات العميل</div>
                    <div class="info-value">${customerName || 'عميل نقدي'}</div>
                    ${customerPhone ? `<div style="color: #666;">📞 ${customerPhone}</div>` : ''}
                    ${customerAddress ? `<div style="color: #666;">📍 ${customerAddress}</div>` : ''}
                </div>
                
                <div style="flex: 1; text-align: left; padding-right: 20px; border-right: 1px solid #fecaca;">
                    <div class="section-title">تفاصيل المستند</div>
                    <div style="margin-bottom: 5px;">الرقم المرجعي: <span class="info-value">#${invoiceNumber}</span></div>
                    <div style="margin-bottom: 5px;">التاريخ: <span class="info-value">${dateStr}</span></div>
                    <div>الحالة: <span class="info-value" style="color: #ef4444;">مرتجع</span></div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th style="width: 50px;">#</th>
                        <th>الصنف</th>
                        <th style="text-align:center; width: 100px;">الكمية</th>
                        <th style="width: 150px;">سعر الوحدة</th>
                        <th style="text-align:left; width: 150px;">الإجمالي</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map((item: any, i: number) => {
        const name = item.product?.name || item.name || "منتج";
        const qty = Math.abs(item.quantity);
        const price = Number(item.unitPrice || item.price || 0);
        return `
                            <tr>
                                <td style="text-align: center; color: #666;">${i + 1}</td>
                                <td>
                                    <strong>${name}</strong>
                                    ${item.product?.sku ? `<div style="font-size:11px;color:#999;">SKU: ${item.product.sku}</div>` : ''}
                                </td>
                                <td style="text-align: center;">${qty}</td>
                                <td>${formatCurrency(price, currency)}</td>
                                <td style="text-align: left;"><strong>${formatCurrency(price * qty, currency)}</strong></td>
                            </tr>
                        `;
    }).join('')}
                </tbody>
            </table>

            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="flex: 1; margin-left: 30px;">
                    ${saleData.refundReason || saleData.reason ? `
                        <div class="reason-box">
                            <strong>سبب الارتجاع:</strong><br/>
                            <div style="margin-top: 5px; font-size: 15px;">${saleData.refundReason || saleData.reason}</div>
                        </div>
                    ` : ''}
                    
                    <div style="margin-top: 20px; font-size: 12px; color: #888;">
                        * هذا المستند إثبات لعملية رد البضاعة واستلام المبلغ المذكور أدناه.
                    </div>
                </div>

                <div class="summary">
                    <div class="summary-row">
                        <span>المجموع (قبل الضريبة):</span>
                        <span>${formatCurrency(baseTotal, currency)}</span>
                    </div>
                    ${taxRate > 0 ? `
                        <div class="summary-row">
                            <span>الضريبة المستردة (${taxRate}%):</span>
                            <span>${formatCurrency(taxAmount, currency)}</span>
                        </div>
                    ` : ''}
                    <div class="summary-row total">
                        <span>المبلغ المسترد:</span>
                        <span>${formatCurrency(total, currency)}</span>
                    </div>
                </div>
            </div>

            <div class="footer">
                ${settings?.receiptFooter || 'شكراً لتعاملكم معنا ونتمنى رؤيتكم قريباً'}
                <div style="margin-top: 15px; font-size: 14px; color: #aaa;">
                    Powered by Casper POS | ${new Date().toLocaleString('ar-EG')}
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
};
