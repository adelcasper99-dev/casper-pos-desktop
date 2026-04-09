import { formatCurrency } from "@/lib/utils";

/**
 * Generates an 80mm thermal receipt for a Purchase Invoice.
 */
export function generateThermalPurchaseHTML({ purchaseData, settings }: { purchaseData: any; settings: any }): string {
    const { items = [], totalAmount = 0, date, invoiceNumber, supplierName, paidAmount = 0, deliveryCharge = 0 } = purchaseData;

    const storeName = settings?.name ?? "CASPER POS";
    const logoUrl = settings?.logoUrl ?? "";
    const currency = settings?.currency ?? "EGP";
    const paperSize = settings?.paperSize ?? "80mm";
    
    const pageSize = paperSize === "58mm" ? "58" : "80";
    const paperWidth = paperSize === "58mm" ? "48mm" : "70mm";
    const dateObj = date ? new Date(date) : new Date();
    const dateStr = dateObj.toLocaleDateString("ar-EG");
    const timeStr = dateObj.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });

    const itemsHTML = items.map((item: any) => {
        const itemTotal = item.unitCost * (item.quantity || 1);
        return `
            <div class="item">
                <div class="item-header">
                    <span>${item.name || "صنف"}</span>
                    <span>${formatCurrency(itemTotal, currency)}</span>
                </div>
                ${item.sku ? `<div class="item-sku">SKU: ${item.sku}</div>` : ""}
                <div class="item-details">الكمية: ${item.quantity} x ${formatCurrency(item.unitCost, currency)}</div>
            </div>
        `;
    }).join("");

    return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: ${pageSize}mm auto; margin: 0; }
    
    body {
      font-family: Arial, Tahoma, sans-serif;
      width: ${paperWidth};
      margin: 0 auto 0 -2mm;
      padding: 3mm 4mm 3mm 2mm;
      background: #fff;
      color: #000;
      font-size: 12px;
      line-height: 1.4;
      font-weight: 600;
      word-break: break-word;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    .header {
      width: 100%;
      text-align: center;
      padding-bottom: 3mm;
      border-bottom: 0.5mm solid #000;
      margin-bottom: 2mm;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .shop-logo {
      max-width: 35mm;
      max-height: 15mm;
      margin-bottom: 1.5mm;
      object-fit: contain;
      filter: grayscale(1) contrast(1.5);
    }
    .shop-name { font-size: 16px; font-weight: 700; letter-spacing: 0.5mm; width: 100%; }
    
    .invoice-title {
      font-size: 14px;
      font-weight: 900;
      text-align: center;
      margin: 2mm 0;
      background: #000;
      color: #fff;
      border-radius: 1mm;
      padding: 2mm;
    }

    .info {
      display: flex;
      flex-direction: column;
      gap: 1mm;
      padding: 2mm 1mm;
      font-size: 11px;
      font-weight: 600;
      color: #000;
      border-bottom: 0.3mm solid #000;
    }
    .info-row { display: flex; justify-content: space-between; }
    .info-num { font-weight: 700; font-size: 12px; }
    
    .items { padding: 1mm 0; }
    .item {
      padding: 2mm 0;
      border-bottom: 0.3mm solid #000;
    }
    .item:last-child { border-bottom: none; }
    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 1mm;
      font-weight: 700;
      font-size: 14px;
      color: #000;
    }
    .item-details {
      font-size: 11px;
      font-weight: 600;
      color: #333;
      margin-top: 1mm;
    }
    .item-sku { font-size: 10px; font-family: monospace; color: #555; margin-top: 0.5mm; }
    
    .total {
      background: #000;
      color: #fff;
      margin: 4mm 0;
      padding: 4mm 2mm;
      border-radius: 2mm;
      width: 100%;
    }
    .total-row {
      display: flex; justify-content: space-between; align-items: center; font-size: 12px; font-weight: 600; margin-bottom: 1mm;
    }
    .total-amount {
      display: flex; justify-content: space-between; align-items: center; font-size: 16px; font-weight: 900; border-top: 1px dashed rgba(255,255,255,0.3); padding-top: 2mm; margin-top: 2mm;
    }
    
    .footer {
      text-align: center;
      padding-top: 3mm;
      margin-top: 2mm;
      border-top: 0.3mm solid #000;
    }
    .footer-msg {
      font-size: 11px;
      font-weight: 600;
      color: #000;
      margin-bottom: 2mm;
    }
  </style>
</head>
<body>
  <div class="header">
    ${logoUrl ? `<img src="${logoUrl}" class="shop-logo" alt="Logo" />` : ""}
    <div class="shop-name">${storeName}</div>
  </div>
  
  <div class="invoice-title">فاتورة مشتريات (إيصال استلام)</div>

  <div class="info">
    <div class="info-row">
      <span>رقم الفاتورة:</span>
      <span class="info-num">#${invoiceNumber || "0000"}</span>
    </div>
    <div class="info-row">
      <span>المورد:</span>
      <span>${supplierName}</span>
    </div>
    <div class="info-row">
      <span>التاريخ:</span>
      <span>${dateStr} - ${timeStr}</span>
    </div>
  </div>

  <div class="items">
    ${itemsHTML}
  </div>

  <div class="total">
    ${deliveryCharge > 0 ? `
    <div class="total-row text-zinc-300">
      <span>مصاريف الشحن</span>
      <span>${formatCurrency(deliveryCharge, currency)}</span>
    </div>
    ` : ""}
    <div class="total-amount">
      <span>الإجمالي:</span>
      <span>${formatCurrency(totalAmount, currency)}</span>
    </div>
  </div>

  <div style="background: #eee; margin: 2mm 0; padding: 2mm; display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; color: #000; border-radius: 1mm;">
    <span>المدفوع:</span>
    <span>${formatCurrency(paidAmount || 0, currency)}</span>
  </div>
  
  ${(totalAmount - paidAmount) > 0 ? `
  <div style="background: #000; color: #fff; margin: 1mm 0; padding: 3mm; display: flex; justify-content: space-between; font-size: 14px; font-weight: 900; border-radius: 1mm;">
    <span>المتبقي (آجل):</span>
    <span>${formatCurrency(totalAmount - paidAmount, currency)}</span>
  </div>
  ` : ""}

  <div class="footer">
    <div style="margin-top: 1.5mm; font-size: 10px; font-weight: bold; color: #333;">by Casper POS</div>
  </div>
</body>
</html>`;
}
