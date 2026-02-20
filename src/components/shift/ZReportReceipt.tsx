"use client";

import { useRef } from "react";

interface ZReportReceiptProps {
    shift: any;
}

export default function ZReportReceipt({ shift }: ZReportReceiptProps) {
    const printRef = useRef<HTMLDivElement>(null);

    const handlePrint = () => {
        if (printRef.current) {
            const printContent = printRef.current.innerHTML;
            const printWindow = window.open('', '', 'height=600,width=400');
            if (printWindow) {
                printWindow.document.write('<html><head><title>Z-Report</title>');
                printWindow.document.write('<style>');
                printWindow.document.write(`
                    body { font-family: monospace; font-size: 12px; margin: 20px; }
                    .center { text-align: center; }
                    .line { border-bottom: 1px dashed #000; margin: 5px 0; }
                    .double-line { border-bottom: 2px solid #000; margin: 5px 0; }
                    .row { display: flex; justify-content: space-between; margin: 2px 0; }
                    .bold { font-weight: bold; }
                    .large { font-size: 14px; }
                    .section { margin: 10px 0; }
                `);
                printWindow.document.write('</style></head><body>');
                printWindow.document.write(printContent);
                printWindow.document.write('</body></html>');
                printWindow.document.close();
                printWindow.print();
            }
        }
    };

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

    return (
        <div className="bg-white p-6 rounded-lg shadow max-w-md">
            <button
                onClick={handlePrint}
                className="mb-4 w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
                🖨️ Print Z-Report
            </button>

            <div ref={printRef} className="font-mono text-sm" style={{ maxWidth: '400px' }}>
                <div className="center double-line pb-2">
                    <div className="large bold">DAILY CLOSING REPORT</div>
                    <div>(Z-REPORT)</div>
                </div>

                <div className="section">
                    <div className="row"><span>Shift ID:</span> <span>#{shift.id.slice(0, 8).toUpperCase()}</span></div>
                    {shift.registerName && (
                        <div className="row"><span>🆕 Register:</span> <span>{shift.registerName}</span></div>
                    )}
                    <div className="row"><span>Cashier:</span> <span>{shift.cashierName || 'N/A'}</span></div>
                    <div className="row"><span>Date:</span> <span>{new Date(shift.openedAt).toLocaleDateString()}</span></div>
                    <div className="row"><span>Opened:</span> <span>{new Date(shift.openedAt).toLocaleTimeString()}</span></div>
                    <div className="row"><span>Closed:</span> <span>{shift.closedAt ? new Date(shift.closedAt).toLocaleTimeString() : 'Open'}</span></div>
                    {shift.timezone && shift.timezone !== 'UTC' && (
                        <div className="row"><span>🆕 Timezone:</span> <span>{shift.timezone}</span></div>
                    )}
                </div>

                <div className="line"></div>

                <div className="section">
                    <div className="center bold">💰 CASH RECONCILIATION</div>
                    <div className="line"></div>
                    <div className="row"><span>Opening Cash:</span> <span>${Number(shift.startCash).toFixed(2)}</span></div>
                    <div className="row"><span>+ Cash Sales:</span> <span>${Number(shift.totalCashSales || 0).toFixed(2)}</span></div>
                    <div className="row"><span>- Cash Expenses:</span> <span>${Number(shift.totalExpenses || 0).toFixed(2)}</span></div>
                    {Number(shift.crossShiftRefundsReceived || 0) > 0 && (
                        <div className="row"><span>🆕 + Cross-Shift Refunds:</span> <span>${Number(shift.crossShiftRefundsReceived).toFixed(2)}</span></div>
                    )}
                    {Number(shift.crossShiftRefundsIssued || 0) > 0 && (
                        <div className="row"><span>🆕 - Refunds Issued:</span> <span>${Number(shift.crossShiftRefundsIssued).toFixed(2)}</span></div>
                    )}
                    <div className="line"></div>
                    <div className="row bold"><span>= Expected Cash:</span> <span>${expectedCash}</span></div>
                    <div className="row"><span>Actual Counted:</span> <span>${Number(shift.actualCash || 0).toFixed(2)}</span></div>
                    <div className="line"></div>
                    <div className={`row bold large ${Number(variance) === 0 ? '' : Number(variance) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        <span>VARIANCE:</span>
                        <span>{Number(variance) > 0 ? '+' : ''}${variance}</span>
                    </div>
                    {Number(variance) !== 0 && (
                        <div className="center text-xs">
                            ({Number(variance) > 0 ? 'Overage' : 'Shortage'})
                        </div>
                    )}
                </div>

                <div className="double-line"></div>

                <div className="section">
                    <div className="center bold">📊 SALES BREAKDOWN</div>
                    <div className="line"></div>
                    <div className="row"><span>Cash:</span> <span>${Number(shift.totalCashSales || 0).toFixed(2)}</span></div>
                    <div className="row"><span>Card:</span> <span>${Number(shift.totalCardSales || 0).toFixed(2)}</span></div>
                    {Number(shift.totalWalletSales || 0) > 0 && (
                        <div className="row"><span>🆕 Mobile Wallet:</span> <span>${Number(shift.totalWalletSales).toFixed(2)}</span></div>
                    )}
                    {Number(shift.totalInstapay || 0) > 0 && (
                        <div className="row"><span>🆕 InstaPay:</span> <span>${Number(shift.totalInstapay).toFixed(2)}</span></div>
                    )}
                    {shift.totalSplitPayments > 0 && (
                        <div className="row"><span>🆕 Split Payments:</span> <span>({shift.totalSplitPayments})</span></div>
                    )}
                    <div className="line"></div>
                    <div className="row bold"><span>Total Sales:</span> <span>${totalSales}</span></div>
                    <div className="row"><span>Total Tickets:</span> <span>{shift.totalTickets || 0}</span></div>
                    <div className="row"><span>Total Refunds:</span> <span>-${Number(shift.totalRefunds || 0).toFixed(2)}</span></div>
                    <div className="line"></div>
                    <div className="row bold"><span>Net Revenue:</span> <span>${(Number(totalSales) - Number(shift.totalRefunds || 0)).toFixed(2)}</span></div>
                </div>

                <div className="double-line"></div>

                <div className="section">
                    <div className="center bold">📝 EXPENSES</div>
                    <div className="line"></div>
                    <div className="row bold"><span>Total:</span> <span>${Number(shift.totalExpenses || 0).toFixed(2)}</span></div>
                </div>

                {shift.hasAdjustments && shift.adjustments?.length > 0 && (
                    <>
                        <div className="double-line"></div>
                        <div className="section">
                            <div className="center bold">🆕 ⚠️ ADJUSTMENTS</div>
                            <div className="line"></div>
                            {shift.adjustments.map((adj: any, idx: number) => (
                                <div key={adj.id} className="mb-2">
                                    <div className="row"><span>#{idx + 1}:</span> <span>${Number(adj.amount).toFixed(2)}</span></div>
                                    <div className="text-xs ml-4">{adj.reason}</div>
                                    <div className="text-xs ml-4">Approved: {adj.approvedBy}</div>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {shift.notes && (
                    <>
                        <div className="line"></div>
                        <div className="section">
                            <div className="bold">Notes:</div>
                            <div className="text-xs">{shift.notes}</div>
                        </div>
                    </>
                )}

                <div className="line"></div>
                <div className="row"><span>🆕 Status:</span> <span>{shift.status}</span></div>
                {shift.forceClosed && (
                    <div className="row text-red-600"><span>🆕 Force Closed:</span> <span>Yes</span></div>
                )}

                <div className="double-line"></div>

                <div className="section">
                    <div className="row"><span>Generated:</span> <span>{new Date().toLocaleString()}</span></div>
                    <div className="center mt-4">Signature: _______________</div>
                </div>

                <div className="double-line mt-4"></div>
            </div>
        </div>
    );
}
