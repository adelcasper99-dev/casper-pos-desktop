import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';

// CSV Export
export function exportToCSV(data: any[], filename: string) {
  if (!data || data.length === 0) {
    toast.error('No data to export');
    return;
  }

  // Convert to CSV
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row =>
      headers.map(h => {
        const value = row[h];
        // Escape quotes and wrap in quotes if contains comma
        const escaped = String(value || '').replace(/"/g, '""');
        return escaped.includes(',') ? `"${escaped}"` : escaped;
      }).join(',')
    )
  ].join('\n');

  // Trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// PDF Export for Treasury
interface TreasuryTransaction {
  id: string;
  type: string;
  description: string | null;
  amount: number;
  paymentMethod: string;
  createdAt: string;
}

interface TreasuryData {
  byMethod: {
    CASH: number;
    VISA: number;
    WALLET: number;
    INSTAPAY: number;
  };
  transactions: TreasuryTransaction[];
}

export function exportTreasuryToPDF(data: TreasuryData, filename: string, filters?: {
  startDate?: string;
  endDate?: string;
  paymentMethod?: string;
}) {
  const doc = new jsPDF();

  // Header
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Treasury Report', 14, 20);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);

  // Add filter information if applied
  let yPosition = 35;
  if (filters?.startDate || filters?.endDate || filters?.paymentMethod) {
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text('Filters Applied:', 14, yPosition);
    yPosition += 5;

    if (filters.startDate) {
      doc.text(`  Start Date: ${new Date(filters.startDate).toLocaleDateString()}`, 14, yPosition);
      yPosition += 5;
    }
    if (filters.endDate) {
      doc.text(`  End Date: ${new Date(filters.endDate).toLocaleDateString()}`, 14, yPosition);
      yPosition += 5;
    }
    if (filters.paymentMethod) {
      doc.text(`  Payment Method: ${filters.paymentMethod}`, 14, yPosition);
      yPosition += 5;
    }
    yPosition += 5;
  }

  doc.setTextColor(0);

  // Summary Section
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Balance Summary', 14, yPosition);
  yPosition += 8;

  const summaryData = [
    ['Cash', `$${data.byMethod.CASH.toLocaleString('en-US', { minimumFractionDigits: 2 })}`],
    ['Visa', `$${data.byMethod.VISA.toLocaleString('en-US', { minimumFractionDigits: 2 })}`],
    ['Wallet', `$${data.byMethod.WALLET.toLocaleString('en-US', { minimumFractionDigits: 2 })}`],
    ['InstaPay', `$${data.byMethod.INSTAPAY.toLocaleString('en-US', { minimumFractionDigits: 2 })}`]
  ];

  const totalBalance = Object.values(data.byMethod).reduce((sum, val) => sum + val, 0);
  summaryData.push(['Total Balance', `$${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`]);

  autoTable(doc, {
    startY: yPosition,
    head: [['Payment Method', 'Balance']],
    body: summaryData,
    theme: 'grid',
    headStyles: { fillColor: [99, 102, 241] }, // Indigo
    footStyles: { fillColor: [229, 231, 235], textColor: [0, 0, 0], fontStyle: 'bold' }
  });

  // Transactions Section
  const transactionsY = (doc as any).lastAutoTable.finalY + 15;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Transactions', 14, transactionsY);

  if (data.transactions.length === 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(150);
    doc.text('No transactions found', 14, transactionsY + 10);
  } else {
    const transactionData = data.transactions.map(t => {
      const isPositive = ['IN', 'CAPITAL', 'SALE'].includes(t.type);
      return [
        new Date(t.createdAt).toLocaleString(),
        t.type,
        t.paymentMethod,
        t.description || '-',
        `${isPositive ? '+' : '-'}$${t.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
      ];
    });

    autoTable(doc, {
      startY: transactionsY + 5,
      head: [['Date', 'Type', 'Method', 'Description', 'Amount']],
      body: transactionData,
      theme: 'striped',
      headStyles: { fillColor: [99, 102, 241] },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 25 },
        2: { cellWidth: 25 },
        3: { cellWidth: 60 },
        4: { cellWidth: 30, halign: 'right' }
      }
    });
  }

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Page ${i} of ${pageCount}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }

  doc.save(filename);
}

// Export transactions to CSV
export function exportTransactionsToCSV(transactions: TreasuryTransaction[], filename: string) {
  const csvData = transactions.map(t => ({
    Date: new Date(t.createdAt).toLocaleString(),
    Type: t.type,
    'Payment Method': t.paymentMethod,
    Description: t.description || '-',
    Amount: t.amount
  }));

  exportToCSV(csvData, filename);
}
