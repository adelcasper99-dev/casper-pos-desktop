import { formatCurrency } from "@/lib/utils";

interface ZReportTemplateProps {
    shift: any;
    settings?: any;
}

/**
 * Generates Thermal HTML for Z-Report (80mm)
 */
export const generateZReportThermalHTML = ({ shift, settings }: ZReportTemplateProps): string => {
    const currency = settings?.currency ?? 'EGP';

    const expectedCash = (
        Number(shift.startCash) +
        Number(shift.totalCashSales || 0) -
        Number(shift.totalExpenses || 0) +
        Number(shift.crossShiftRefundsReceived || 0) -
        Number(shift.crossShiftRefundsIssued || 0)
    ).toFixed(2);

    const variance = (Number(shift.actualCash || 0) - Number(expectedCash)).toFixed(2);
    const totalSales = (
        Number(shift.totalCashSales || 0) +
        Number(shift.totalCardSales || 0) +
        Number(shift.totalWalletSales || 0) +
        Number(shift.totalInstapay || 0)
    ).toFixed(2);

    const netRevenue = (Number(totalSales) - Number(shift.totalRefunds || 0)).toFixed(2);

    return `
    <!DOCTYPE html>
    <html dir="ltr">
    <head>
        <meta charset="utf-8">
        <style>
            body { font-family: monospace; font-size: 10px; margin: 0; padding: 2mm; width: 80mm; background: white; color: black; box-sizing: border-box; direction: ltr; text-align: right; }
            .center { text-align: center; }
            .line { border-bottom: 1px dashed #000; margin: 5px 0; }
            .double-line { border-bottom: 2px solid #000; margin: 5px 0; }
            .row { display: flex; justify-content: space-between; flex-direction: row-reverse; margin: 2px 0; }
            .bold { font-weight: bold; }
            .large { font-size: 14px; }
            .section { margin: 10px 0; }
            .text-green-600 { color: #16a34a; }
            .text-red-600 { color: #dc2626; }
            .text-xs { font-size: 9px; }
        </style>
    </head>
    <body>
        <div class="center double-line pb-2">
            <div class="large bold">DAILY CLOSING REPORT</div>
            <div>(Z-REPORT)</div>
        </div>

        <div class="section">
            <div class="row"><span>Shift ID:</span> <span>#${shift.id.slice(0, 8).toUpperCase()}</span></div>
            ${shift.registerName ? `<div class="row"><span>🆕 Register:</span> <span>${shift.registerName}</span></div>` : ''}
            <div class="row"><span>Cashier:</span> <span>${shift.cashierName || 'N/A'}</span></div>
            <div class="row"><span>Date:</span> <span>${new Date(shift.openedAt).toLocaleDateString()}</span></div>
            <div class="row"><span>Opened:</span> <span>${new Date(shift.openedAt).toLocaleTimeString()}</span></div>
            <div class="row"><span>Closed:</span> <span>${shift.closedAt ? new Date(shift.closedAt).toLocaleTimeString() : 'Open'}</span></div>
        </div>

        <div class="line"></div>

        <div class="section">
            <div class="center bold">💰 CASH RECONCILIATION</div>
            <div class="line"></div>
            <div class="row"><span>Opening Cash:</span> <span>${formatCurrency(shift.startCash, currency)}</span></div>
            <div class="row"><span>+ Cash Sales:</span> <span>${formatCurrency(shift.totalCashSales || 0, currency)}</span></div>
            <div class="row"><span>- Cash Expenses:</span> <span>${formatCurrency(shift.totalExpenses || 0, currency)}</span></div>
            ${Number(shift.crossShiftRefundsReceived || 0) > 0 ? `<div class="row"><span>🆕 + Cross-Shift Refunds:</span> <span>${formatCurrency(shift.crossShiftRefundsReceived, currency)}</span></div>` : ''}
            ${Number(shift.crossShiftRefundsIssued || 0) > 0 ? `<div class="row"><span>🆕 - Refunds Issued:</span> <span>${formatCurrency(shift.crossShiftRefundsIssued, currency)}</span></div>` : ''}
            <div class="line"></div>
            <div class="row bold"><span>= Expected Cash:</span> <span>${formatCurrency(expectedCash, currency)}</span></div>
            <div class="row"><span>Actual Counted:</span> <span>${formatCurrency(shift.actualCash || 0, currency)}</span></div>
            <div class="line"></div>
            <div class="row bold large ${Number(variance) === 0 ? '' : Number(variance) > 0 ? 'text-green-600' : 'text-red-600'}">
                <span>VARIANCE:</span>
                <span>${Number(variance) > 0 ? '+' : ''}${formatCurrency(variance, currency)}</span>
            </div>
            ${Number(variance) !== 0 ? `<div class="center text-xs">(${Number(variance) > 0 ? 'Overage' : 'Shortage'})</div>` : ''}
        </div>

        <div class="double-line"></div>

        <div class="section">
            <div class="center bold">📊 SALES BREAKDOWN</div>
            <div class="line"></div>
            <div class="row"><span>Cash:</span> <span>${formatCurrency(shift.totalCashSales || 0, currency)}</span></div>
            <div class="row"><span>Card:</span> <span>${formatCurrency(shift.totalCardSales || 0, currency)}</span></div>
            ${Number(shift.totalWalletSales || 0) > 0 ? `<div class="row"><span>🆕 Mobile Wallet:</span> <span>${formatCurrency(shift.totalWalletSales, currency)}</span></div>` : ''}
            ${Number(shift.totalInstapay || 0) > 0 ? `<div class="row"><span>🆕 InstaPay:</span> <span>${formatCurrency(shift.totalInstapay, currency)}</span></div>` : ''}
            <div class="line"></div>
            <div class="row bold"><span>Total Sales:</span> <span>${formatCurrency(totalSales, currency)}</span></div>
            <div class="row"><span>Total Tickets:</span> <span>${shift.totalTickets || 0}</span></div>
            <div class="row"><span>Total Refunds:</span> <span>-${formatCurrency(shift.totalRefunds || 0, currency)}</span></div>
            <div class="line"></div>
            <div class="row bold"><span>Net Revenue:</span> <span>${formatCurrency(netRevenue, currency)}</span></div>
        </div>

        ${shift.hasAdjustments && shift.adjustments?.length > 0 ? `
            <div class="double-line"></div>
            <div class="section">
                <div class="center bold">🆕 ⚠️ ADJUSTMENTS</div>
                <div class="line"></div>
                ${shift.adjustments.map((adj: any, idx: number) => `
                    <div class="mb-2">
                        <div class="row"><span>#${idx + 1}:</span> <span>${formatCurrency(adj.amount, currency)}</span></div>
                        <div class="text-xs ml-4">${adj.reason}</div>
                    </div>
                `).join('')}
            </div>
        ` : ''}

        <div class="double-line"></div>
        <div class="section">
            <div class="row"><span>Generated:</span> <span>${new Date().toLocaleString()}</span></div>
            <div class="center mt-2" style="font-size: 8px;">Powered by Casper POS</div>
            <div class="center mt-4">Signature: _______________</div>
        </div>
    </body>
    </html>
    `;
};

/**
 * Generates A4 HTML for Z-Report
 */
export const generateZReportA4HTML = ({ shift, settings }: ZReportTemplateProps): string => {
    const currency = settings?.currency ?? 'EGP';
    const storeName = settings?.name || 'CASPER POS';

    const expectedCash = (
        Number(shift.startCash) +
        Number(shift.totalCashSales || 0) -
        Number(shift.totalExpenses || 0) +
        Number(shift.crossShiftRefundsReceived || 0) -
        Number(shift.crossShiftRefundsIssued || 0)
    ).toFixed(2);

    const variance = (Number(shift.actualCash || 0) - Number(expectedCash)).toFixed(2);
    const totalSales = (
        Number(shift.totalCashSales || 0) +
        Number(shift.totalCardSales || 0) +
        Number(shift.totalWalletSales || 0) +
        Number(shift.totalInstapay || 0)
    ).toFixed(2);

    const netRevenue = (Number(totalSales) - Number(shift.totalRefunds || 0)).toFixed(2);

    return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <style>
            @page { size: A4; margin: 20mm; }
            body { font-family: 'Arial', sans-serif; color: #1a1a1a; line-height: 1.6; font-size: 14px; }
            .container { width: 100%; max-width: 800px; margin: 0 auto; }
            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
            .report-title { font-size: 28px; font-weight: bold; margin: 10px 0; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px; }
            .card { background: #f9f9f9; padding: 20px; border-radius: 8px; border: 1px solid #eee; }
            .card-title { font-size: 18px; font-weight: bold; border-bottom: 1px solid #ddd; padding-bottom: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 8px; }
            .bold { font-weight: bold; }
            .total-row { border-top: 2px solid #ddd; padding-top: 10px; margin-top: 10px; font-size: 16px; }
            .variance-positive { color: #16a34a; }
            .variance-negative { color: #dc2626; }
            .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 20px; }
            .signature-space { margin-top: 40px; display: flex; justify-content: space-around; }
            .sig-box { border-top: 1px solid #333; width: 200px; padding-top: 5px; text-align: center; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>${storeName}</h1>
                <div class="report-title">تقرير إغلاق الوردية (Z-REPORT)</div>
                <div>رقم الوردية: #${shift.id.slice(0, 8).toUpperCase()}</div>
            </div>

            <div class="grid">
                <div class="card">
                    <div class="card-title">📅 تفاصيل الوردية</div>
                    <div class="row"><span>أمين الصندوق:</span> <span class="bold">${shift.cashierName || 'N/A'}</span></div>
                    <div class="row"><span>الجهاز:</span> <span>${shift.registerName || 'N/A'}</span></div>
                    <div class="row"><span>وقت الفتح:</span> <span>${new Date(shift.openedAt).toLocaleString('ar-EG')}</span></div>
                    <div class="row"><span>وقت الإغلاق:</span> <span>${shift.closedAt ? new Date(shift.closedAt).toLocaleString('ar-EG') : 'لا تزال مفتوحة'}</span></div>
                </div>

                <div class="card">
                    <div class="card-title">💰 ملخص النقدية</div>
                    <div class="row"><span>نقدية البداية:</span> <span>${formatCurrency(shift.startCash, currency)}</span></div>
                    <div class="row"><span>+ مبيعات نقداً:</span> <span>${formatCurrency(shift.totalCashSales || 0, currency)}</span></div>
                    <div class="row"><span>- مصروفات:</span> <span>${formatCurrency(shift.totalExpenses || 0, currency)}</span></div>
                    <div class="row bold total-row"><span>= النقدية المتوقعة:</span> <span>${formatCurrency(expectedCash, currency)}</span></div>
                    <div class="row"><span>النقدية الفعلية:</span> <span>${formatCurrency(shift.actualCash || 0, currency)}</span></div>
                    <div class="row bold ${Number(variance) >= 0 ? 'variance-positive' : 'variance-negative'}">
                        <span>الفارق (الزيادة/العجز):</span>
                        <span>${Number(variance) > 0 ? '+' : ''}${formatCurrency(variance, currency)}</span>
                    </div>
                </div>
            </div>

            <div class="grid">
                <div class="card">
                    <div class="card-title">📊 تحليل المبيعات</div>
                    <div class="row"><span>مبيعات نقداً:</span> <span>${formatCurrency(shift.totalCashSales || 0, currency)}</span></div>
                    <div class="row"><span>مبيعات شبكة:</span> <span>${formatCurrency(shift.totalCardSales || 0, currency)}</span></div>
                    ${Number(shift.totalWalletSales || 0) > 0 ? `<div class="row"><span>محفظة إلكترونية:</span> <span>${formatCurrency(shift.totalWalletSales, currency)}</span></div>` : ''}
                    ${Number(shift.totalInstapay || 0) > 0 ? `<div class="row"><span>إنستا باي:</span> <span>${formatCurrency(shift.totalInstapay, currency)}</span></div>` : ''}
                    <div class="row bold total-row"><span>إجمالي المبيعات:</span> <span>${formatCurrency(totalSales, currency)}</span></div>
                    <div class="row"><span>إجمالي المسترجعات:</span> <span>-${formatCurrency(shift.totalRefunds || 0, currency)}</span></div>
                    <div class="row bold"><span>صافي الإيرادات:</span> <span>${formatCurrency(netRevenue, currency)}</span></div>
                </div>

                <div class="card">
                    <div class="card-title">📝 ملاحظات وتعديلات</div>
                    <div class="row"><span>عدد الفواتير:</span> <span>${shift.totalTickets || 0}</span></div>
                    <div class="row"><span>إجمالي المصروفات:</span> <span>${formatCurrency(shift.totalExpenses || 0, currency)}</span></div>
                    ${shift.notes ? `<div class="row"><span>ملاحظات:</span> <span>${shift.notes}</span></div>` : ''}
                </div>
            </div>

            ${shift.hasAdjustments && shift.adjustments?.length > 0 ? `
                <div class="card" style="margin-bottom: 30px;">
                    <div class="card-title">⚠️ التعديلات (Adjustments)</div>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="text-align: right; border-bottom: 2px solid #ddd;">
                                <th style="padding: 10px;">المبلغ</th>
                                <th style="padding: 10px;">السبب</th>
                                <th style="padding: 10px;">بواسطة</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${shift.adjustments.map((adj: any) => `
                                <tr style="border-bottom: 1px solid #eee;">
                                    <td style="padding: 10px;">${formatCurrency(adj.amount, currency)}</td>
                                    <td style="padding: 10px;">${adj.reason}</td>
                                    <td style="padding: 10px;">${adj.approvedBy}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : ''}

            <div class="signature-space">
                <div class="sig-box">توقيع المحاسب</div>
                <div class="sig-box">توقيع المشرف</div>
            </div>

            <div class="footer">
                تم إنشاء هذا التقرير آلياً بواسطة Casper POS في ${new Date().toLocaleString('ar-EG')}
                <div style="margin-top: 10px; font-size: 14px; color: #aaa;">
                    Powered by Casper POS
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
};
