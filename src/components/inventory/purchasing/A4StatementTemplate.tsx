import { formatCurrency } from "@/lib/utils";

interface Transaction {
    id: string;
    date: Date;
    type: 'INVOICE' | 'PAYMENT';
    reference: string;
    amount: number;
    status: string;
    isCredit: boolean;
    method?: string;
}

interface TemplateProps {
    supplierData: {
        name: string;
        phone?: string | null;
        address?: string | null;
        balance: number;
    };
    transactions: Transaction[];
    settings?: any;
}

export const generateA4StatementHTML = ({ supplierData, transactions, settings }: TemplateProps): string => {
    const currency = settings?.currency ?? 'EGP';
    const dateStr = new Date().toLocaleDateString('ar-EG');

    // Store settings
    const storeName = settings?.name || 'CASPER POS';
    const storePhone = settings?.phone || '';
    const storeAddress = settings?.address || '';
    const vatNumber = settings?.vatNumber || '';
    const logoUrl = settings?.logoUrl || '';

    const statementLabel = "كشف حساب مورد";

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
                padding: 1.5cm; /* Reduced from 2.5cm */
                color: #1a1a1a;
                background: #ffffff;
                line-height: 1.3; /* More compact line height */
                font-size: 13px; /* Slightly smaller base font */
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
                padding-bottom: 10px; /* Reduced */
                margin-bottom: 15px; /* Reduced */
            }
            .header-info {
                text-align: right;
            }
            .header-info h1 {
                font-size: 22px; /* Reduced from 28px */
                font-weight: 900;
                margin: 0 0 4px 0;
                color: #000;
            }
            .header-logo img {
                max-height: 80px;
                max-width: 250px;
                object-fit: contain;
            }
            .title-box {
                background: #0891b2;
                color: #fff;
                padding: 6px 20px; /* Reduced */
                border-radius: 6px;
                display: inline-block;
                margin-bottom: 15px; /* Reduced */
                font-size: 18px; /* Reduced */
                font-weight: bold;
                text-align: center;
            }
            .supplier-card {
                display: flex;
                justify-content: space-between;
                margin-bottom: 20px; /* Reduced */
                background-color: #f9f9f9;
                padding: 12px 20px; /* Reduced */
                border-radius: 10px;
                border: 1px solid #eee;
            }
            .section-title {
                font-size: 11px; /* Reduced from 14px */
                font-weight: 900;
                color: #555;
                text-transform: uppercase;
                margin-bottom: 4px;
                border-bottom: 1px solid #ddd;
                padding-bottom: 2px;
            }
            .balance-box {
                text-align: left;
                padding-right: 30px;
                border-right: 1px solid #ddd;
            }
            .balance-value {
                font-size: 20px; /* Reduced from 24px */
                font-weight: 900;
                color: ${supplierData.balance > 0 ? '#b91c1c' : '#15803d'};
            }
            table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 20px; /* Reduced */
            }
            th {
                background-color: #f4f4f4;
                color: #333;
                padding: 8px 12px; /* Reduced */
                text-align: right;
                font-size: 13px; /* Reduced */
                font-weight: 900;
                border: 1px solid #ddd;
            }
            td {
                padding: 6px 12px; /* Reduced */
                border: 1px solid #ddd;
                font-size: 12px; /* Denser table content */
            }
            .footer {
                margin-top: 50px;
                text-align: center;
                border-top: 1px solid #eee;
                padding-top: 20px;
                color: #777;
                font-size: 12px;
            }
        </style>
    </head>
    <body>
        <div class="document">
            <div class="header">
                <div class="header-info">
                    <h1>${storeName}</h1>
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
                <div class="title-box">${statementLabel}</div>
            </div>

            <div class="supplier-card">
                <div style="flex: 1.5;">
                    <div class="section-title">بيانات المورد</div>
                    <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px;">${supplierData.name}</div>
                    ${supplierData.phone ? `<div style="color: #555;">📞 ${supplierData.phone}</div>` : ''}
                    ${supplierData.address ? `<div style="color: #555;">📍 ${supplierData.address}</div>` : ''}
                </div>
                
                <div class="balance-box" style="flex: 1;">
                    <div class="section-title">إجمالي الرصيد المستحق</div>
                    <div class="balance-value">${formatCurrency(supplierData.balance, currency)}</div>
                    <div style="font-size: 12px; color: #666; margin-top: 4px;">
                        تاريخ التقرير: ${dateStr}
                    </div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th style="width: 100px;">التاريخ</th>
                        <th>البيان / الوصف</th>
                        <th style="width: 100px;">المرجع</th>
                        <th style="width: 100px;">الطريقة</th>
                        <th style="width: 120px; text-align: left;">مدين (+)</th>
                        <th style="width: 120px; text-align: left;">دائن (-)</th>
                    </tr>
                </thead>
                <tbody>
                    ${transactions.map((tx) => `
                        <tr style="height: 25px;">
                            <td style="font-size: 12px;">${new Date(tx.date).toLocaleDateString('ar-EG')}</td>
                            <td style="padding: 4px 12px;">
                                <div style="font-weight: bold; font-size: 12px;">
                                    ${tx.type === 'INVOICE' ? 'فاتورة مشتريات' : 'دفعة مسددة'}
                                </div>
                            </td>
                            <td style="font-family: monospace; font-size: 11px; color: #666; padding: 4px 12px;">${tx.reference}</td>
                            <td style="font-size: 11px; padding: 4px 12px;">${tx.method || '-'}</td>
                            <td style="text-align: left; color: #b91c1c; font-size: 12px; padding: 4px 12px;">
                                ${!tx.isCredit ? `<strong>${formatCurrency(tx.amount, currency)}</strong>` : ''}
                            </td>
                            <td style="text-align: left; color: #15803d; font-size: 12px; padding: 4px 12px;">
                                ${tx.isCredit ? `<strong>${formatCurrency(tx.amount, currency)}</strong>` : ''}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="footer">
                ${settings?.receiptFooter || 'كشف حساب آلي من نظام Casper POS'}
                <div style="margin-top: 10px; font-size: 14px; color: #aaa;">
                    Powered by Casper POS
                </div>
                <div style="margin-top: 10px; font-size: 11px;">
                    تمت الطباعة في: ${new Date().toLocaleString('ar-EG')}
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
};
