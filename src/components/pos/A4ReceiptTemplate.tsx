import { formatCurrency } from "@/lib/utils";

interface TemplateProps {
    saleData: any;
    settings?: any;
}

export const generateA4ReceiptHTML = ({ saleData, settings }: TemplateProps): string => {
    const items = saleData.items ?? [];
    const total = saleData.totalAmount ?? 0;
    const currency = settings?.currency ?? 'EGP';
    const date = new Date(saleData.date || new Date());
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
    const customerBalance = saleData.customerBalance !== undefined ? saleData.customerBalance : null;
    const customerAddress = saleData.customerAddress || '';

    // Calculate tax backwards (assuming prices are tax-inclusive by default in this template logic context,
    // though this depends on your actual standard. Adapting the existing POS logic)
    const baseTotal = taxRate > 0 ? (total / (1 + (taxRate / 100))) : total;
    const taxAmount = taxRate > 0 ? (total - baseTotal) : 0;

    const receiptLabel = saleData.invoiceNumber === "DRAFT" ? "معاينة الفاتورة - غير مدفوعة" : "فاتورة ضريبية مبسطة";
    const invoiceNumber = saleData.invoiceNumber || "0000";

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
                padding: 20px;
                color: #1a1a1a;
                background: #ffffff;
                line-height: 1.4;
                font-size: 14px;
            }
            .document {
                width: 210mm;
                max-width: 100%;
                margin: 0;
                background: #ffffff;
                color: #000000 !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .header {
                display: flex;
                flex-direction: column;
                align-items: center;
                text-align: center;
                border-bottom: 2px solid #333;
                padding-bottom: 10px;
                margin-bottom: 15px;
            }
            .header-info {
                width: 100%;
            }
            .header-logo {
                margin-bottom: 10px;
            }
            .header-logo img {
                max-height: 60px;
                max-width: 180px;
            }
            h1.store-name {
                font-size: 24px;
                font-weight: 900;
                margin: 0 0 5px 0;
                color: #000;
            }
            .bill-to {
                display: flex;
                justify-content: space-between;
                margin-bottom: 15px;
                background-color: #f9f9f9;
                padding: 10px;
                border-radius: 8px;
            }
            .bill-to-section {
                flex: 1;
            }
            .section-title {
                font-size: 14px;
                font-weight: 900;
                color: #666;
                text-transform: uppercase;
                margin-bottom: 4px;
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
                background-color: #333;
                color: #fff;
                padding: 8px 12px;
                text-align: right;
                font-size: 14px;
                font-weight: bold;
            }
            th:first-child { border-top-right-radius: 8px; border-bottom-right-radius: 8px; }
            th:last-child { border-top-left-radius: 8px; border-bottom-left-radius: 8px; }
            td {
                padding: 8px 12px;
                border-bottom: 1px solid #eee;
            }
            .items-table tr:last-child td {
                border-bottom: none;
            }
            .summary {
                width: 300px;
                margin-right: auto;
                background: #f9f9f9;
                padding: 15px;
                border-radius: 8px;
            }
            .summary-row {
                display: flex;
                justify-content: space-between;
                margin-bottom: 8px;
                font-size: 14px;
            }
            .summary-row.total {
                font-size: 18px;
                font-weight: 900;
                color: #000;
                border-top: 3px solid #ccc;
                padding-top: 14px;
                margin-top: 14px;
            }
            .footer {
                margin-top: 20px;
                text-align: center;
                border-top: 2px solid #eee;
                padding-top: 15px;
                color: #666;
                font-size: 12px;
            }
            .notes-box {
                margin-top: 15px;
                padding: 12px;
                background: #fdfdfd;
                border-right: 4px solid #ccc;
                font-size: 13px;
                color: #555;
            }
            .inline-list {
                display: flex;
                flex-wrap: wrap;
                gap: 15px;
                align-items: center;
                justify-content: center;
            }
            .inline-item {
                display: flex;
                align-items: center;
                gap: 5px;
            }
            .separator {
                color: #ccc;
                margin: 0 5px;
            }
            .credit-label {
                background: #fee2e2;
                color: #b91c1c;
                padding: 2px 8px;
                border-radius: 4px;
                font-weight: bold;
                font-size: 14px;
                margin-right: 10px;
            }
        </style>
    </head>
    <body>
        <div class="document">
            <div class="header">
                <div class="header-logo">
                    ${logoUrl ? `<img src="${logoUrl}" alt="Logo" />` : ''}
                </div>
                <div class="header-info">
                    <h1 class="store-name">${storeName}</h1>
                    <div class="inline-list" style="font-size: 13px; color: #444;">
                        ${storePhone ? `<div class="inline-item">📞 ${storePhone}</div>` : ''}
                        ${storeAddress ? `<span class="separator">|</span><div class="inline-item">📍 ${storeAddress}</div>` : ''}
                        ${vatNumber ? `<span class="separator">|</span><div class="inline-item">الرقم الضريبي: ${vatNumber}</div>` : ''}
                    </div>
                </div>
            </div>

            <div class="bill-to" style="display: flex; justify-content: space-between; align-items: flex-end;">
                <div style="flex: 2; border-left: 1px solid #eee; padding-left: 15px;">
                    <div class="section-title">بيانات العميل</div>
                    <div class="inline-list">
                        ${customerName ? `
                            <div class="inline-item">👤 <strong>${customerName}</strong></div>
                            ${customerPhone ? `
                                <span class="separator">|</span>
                                <div class="inline-item">📞 ${customerPhone}</div>
                            ` : ''}
                            ${customerAddress ? `
                                <span class="separator">|</span>
                                <div class="inline-item">📍 ${customerAddress}</div>
                            ` : ''}
                        ` : '<div class="info-value" style="color:#999;">عميل نقدي</div>'}
                    </div>
                </div>
                
                <div style="flex: 1.5; text-align: left;">
                    <div class="section-title">تفاصيل الفاتورة</div>
                    <div class="inline-list" style="justify-content: flex-end; gap: 8px;">
                        <div class="inline-item">رقم: <span class="info-value">#${invoiceNumber}</span></div>
                        <span class="separator">/</span>
                        <div class="inline-item">التاريخ: <span class="info-value">${dateStr}</span></div>
                        <span class="separator">/</span>
                        <div class="inline-item">الوقت: <span class="info-value">${timeStr}</span></div>
                        ${saleData.invoiceNumber === "DRAFT" ? `<span class="credit-label">آجل</span>` : ''}
                    </div>
                </div>
            </div>

            <table class="items-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>الصنف</th>
                        <th style="text-align:center;">الكمية</th>
                        <th>سعر الوحدة</th>
                        <th style="text-align:left;">الإجمالي</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map((item: any, i: number) => `
                        <tr>
                            <td style="color:#666;">${i + 1}</td>
                            <td>
                                <strong style="font-size: 14px;">${item.name}</strong>
                                ${(item.storage || item.color) ? `<br><span style="font-size:12px;color:#666;">${[item.storage, item.color].filter(Boolean).join(' - ')}</span>` : ''}
                            </td>
                            <td style="text-align:center;">${item.quantity || 1}</td>
                            <td>${formatCurrency(item.price, currency)}</td>
                            <td style="text-align:left;"><strong>${formatCurrency(item.price * (item.quantity || 1), currency)}</strong></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div style="display: flex; justify-content: space-between;">
                <div style="flex:1;">
                    ${customerBalance !== null ? `
                        <div class="notes-box">
                            <strong>كشف حساب مختصر للعميل:</strong><br/>
                            الرصيد المتبقي: <span style="color: ${customerBalance > 0 ? '#b91c1c' : '#15803d'}; font-weight: bold;">
                                ${new Intl.NumberFormat('en-US', { style: 'currency', currency: currency }).format(customerBalance)}
                            </span>
                        </div>
                    ` : ''}
                    
                    ${saleData.tableName ? `
                         <div class="notes-box">
                            <strong>معلومات الطلب:</strong><br/>
                            الطاولة: <strong>${saleData.tableName}</strong>
                        </div>
                    ` : ''}
                </div>

                <div class="summary">
                    <div class="summary-row">
                        <span>المجموع الفرعي:</span>
                        <span>${formatCurrency(saleData.subTotal || baseTotal, currency)}</span>
                    </div>
                    ${(saleData.discountAmount && Number(saleData.discountAmount) > 0) ? `
                        <div class="summary-row" style="color: #ef4444; font-weight: bold;">
                            <span>الخصم:</span>
                            <span>${formatCurrency(Number(saleData.discountAmount), currency)} -</span>
                        </div>
                    ` : ''}
                    ${taxRate > 0 ? `
                        <div class="summary-row">
                            <span>الضريبة (${taxRate}%):</span>
                            <span>${formatCurrency(saleData.taxAmount || taxAmount, currency)}</span>
                        </div>
                    ` : ''}
                    <div class="summary-row total">
                        <span>الإجمالي المطلوب:</span>
                        <span>${formatCurrency(total, currency)}</span>
                    </div>
                </div>
            </div>

            <div class="footer">
                ${settings?.receiptFooter || 'شكراً لزيارتكم ونتمنى رؤيتكم قريباً'}
                <div style="margin-top: 12px; font-size: 14px; color: #aaa;">
                    Powered by Casper POS
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
};
