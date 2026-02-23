import { printService } from "@/lib/print-service";
import { formatArabicPrintText } from "@/lib/arabic-reshaper";

export async function printZReport(shift: any) {
    try {
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

        // Pre-reshape any static Arabic strings we might use
        const titleText = formatArabicPrintText("تقرير الإغلاق اليومي");
        const zReportText = formatArabicPrintText("(Z-REPORT)");

        let printContent = `
            <div class="center double-line pb-2">
                <div class="large bold">${titleText}</div>
                <div>${zReportText}</div>
            </div>

            <div class="section">
                <div class="row"><span>Shift ID:</span> <span>#${shift.id.slice(0, 8).toUpperCase()}</span></div>
                ${shift.registerName ? `<div class="row"><span>Register:</span> <span>${shift.registerName}</span></div>` : ''}
                <div class="row"><span>Cashier:</span> <span>${shift.cashierName || 'N/A'}</span></div>
                <div class="row"><span>Date:</span> <span>${new Date(shift.openedAt).toLocaleDateString()}</span></div>
                <div class="row"><span>Opened:</span> <span>${new Date(shift.openedAt).toLocaleTimeString()}</span></div>
                <div class="row"><span>Closed:</span> <span>${shift.closedAt ? new Date(shift.closedAt).toLocaleTimeString() : 'Open'}</span></div>
            </div>

            <div class="line"></div>

            <div class="section">
                <div class="center bold">💰 CASH RECONCILIATION</div>
                <div class="line"></div>
                <div class="row"><span>Opening Cash:</span> <span>$${Number(shift.startCash).toFixed(2)}</span></div>
                <div class="row"><span>+ Cash Sales:</span> <span>$${Number(shift.totalCashSales || 0).toFixed(2)}</span></div>
                <div class="row"><span>- Cash Expenses:</span> <span>$${Number(shift.totalExpenses || 0).toFixed(2)}</span></div>
                <div class="line"></div>
                <div class="row bold"><span>= Expected Cash:</span> <span>$${expectedCash}</span></div>
                <div class="row"><span>Actual Counted:</span> <span>$${Number(shift.actualCash || 0).toFixed(2)}</span></div>
                <div class="line"></div>
                <div class="row bold large ${Number(variance) === 0 ? '' : Number(variance) > 0 ? 'text-green-600' : 'text-red-600'}">
                    <span>VARIANCE:</span>
                    <span>${Number(variance) > 0 ? '+' : ''}$${variance}</span>
                </div>
                ${Number(variance) !== 0 ? `<div class="center text-xs">(${Number(variance) > 0 ? 'Overage' : 'Shortage'})</div>` : ''}
            </div>

            <div class="double-line"></div>

            <div class="section">
                <div class="center bold">📊 SALES BREAKDOWN</div>
                <div class="line"></div>
                <div class="row"><span>Cash:</span> <span>$${Number(shift.totalCashSales || 0).toFixed(2)}</span></div>
                <div class="row"><span>Card:</span> <span>$${Number(shift.totalCardSales || 0).toFixed(2)}</span></div>
                ${Number(shift.totalWalletSales || 0) > 0 ? `<div class="row"><span>Mobile Wallet:</span> <span>$${Number(shift.totalWalletSales).toFixed(2)}</span></div>` : ''}
                ${Number(shift.totalInstapay || 0) > 0 ? `<div class="row"><span>InstaPay:</span> <span>$${Number(shift.totalInstapay).toFixed(2)}</span></div>` : ''}
                <div class="line"></div>
                <div class="row bold"><span>Total Sales:</span> <span>$${totalSales}</span></div>
                <div class="row"><span>Total Tickets:</span> <span>${shift.totalTickets || 0}</span></div>
                <div class="row"><span>Total Refunds:</span> <span>-$${Number(shift.totalRefunds || 0).toFixed(2)}</span></div>
                <div class="line"></div>
                <div class="row bold"><span>Net Revenue:</span> <span>$${(Number(totalSales) - Number(shift.totalRefunds || 0)).toFixed(2)}</span></div>
            </div>

            <div class="double-line"></div>

            <div class="section">
                <div class="center bold">📝 EXPENSES</div>
                <div class="line"></div>
                <div class="row bold"><span>Total:</span> <span>$${Number(shift.totalExpenses || 0).toFixed(2)}</span></div>
            </div>

            ${shift.notes ? `
                <div class="line"></div>
                <div class="section">
                    <div class="bold">Notes:</div>
                    <div class="text-xs">${shift.notes}</div>
                </div>
            ` : ''}

            <div class="line"></div>
            <div class="row"><span>Status:</span> <span>${shift.status}</span></div>

            <div class="double-line"></div>

            <div class="section">
                <div class="row"><span>Generated:</span> <span>${new Date().toLocaleString()}</span></div>
                <div class="center mt-4">Signature: _______________</div>
            </div>

            <div class="double-line mt-4"></div>
        `;

        const htmlContent = `
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
            ${printContent}
        </body>
        </html>
        `;

        const receiptPrinter = localStorage.getItem('casper_receipt_printer');
        await printService.printHTML(htmlContent, receiptPrinter || undefined, { paperWidthMm: 80 });
        return true;
    } catch (error) {
        console.error("Z-Report print failed:", error);
        return false;
    }
}
