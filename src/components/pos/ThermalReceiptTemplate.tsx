
import { formatCurrency } from "@/lib/utils";

interface ThermalReceiptTemplateProps {
  saleData: any;
  settings: any;
  mode?: 'receipt' | 'order';
}

/**
 * Generates the "perfect" HTML string for thermal printers,
 * based on the optimized design extracted from ELOS Accounting.
 */
export function generateThermalReceiptHTML({ saleData, settings, mode = 'receipt' }: ThermalReceiptTemplateProps): string {
  const { items = [], totalAmount = 0, date, invoiceNumber, paymentMethod, remaining = 0, paidAmount, tableName, customerName, customerBalance, customerPhone } = saleData;

  const isOrder = mode === 'order';
  const storeName = settings?.name ?? "CASPER POS";
  const address = settings?.address ?? "";
  const phone = settings?.phone ?? "";
  const currency = settings?.currency ?? "SAR";
  const footer = settings?.receiptFooter ?? "شكراً لزيارتكم";
  const paperSize = settings?.paperSize ?? "80mm";

  // Formatting for thermal printers: High contrast.
  const paperWidth = paperSize === "58mm" ? "50mm" : "69mm";
  const pageSize = paperSize === "58mm" ? "58" : "80";
  const dateObj = date ? new Date(date) : new Date();
  const dateStr = dateObj.toLocaleDateString("ar-EG");
  const timeStr = dateObj.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });

  // Item rendering logic
  const itemsHTML = items.map((item: any) => {
    const itemTotal = item.price * (item.quantity || 1);
    const details = [item.storage, item.color, item.condition].filter(Boolean).join(" - ");

    return `
            <div class="item">
                <div class="item-header">
                    <span>${item.name || "صنف"}</span>
                    ${!isOrder ? `<span>${formatCurrency(itemTotal, currency)}</span>` : `<span class="qty-badge">x${item.quantity}</span>`}
                </div>
                ${details ? `<div class="item-details">${details}</div>` : ""}
                ${item.imei ? `<div class="item-imei">IMEI: ${item.imei}</div>` : ""}
                ${!isOrder && item.quantity > 1 ? `<div class="item-details">الكمية: ${item.quantity} x ${formatCurrency(item.price, currency)}</div>` : ""}
                ${isOrder && item.note ? `<div class="item-details" style="color: #000; border: 0.2mm solid #000; padding: 1mm; margin-top: 1mm;">ملاحظة: ${item.note}</div>` : ""}
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
      max-width: ${paperWidth};
      margin: 0 auto;
      margin-left: -3mm;
      padding: 3mm 5mm;
      background: #fff;
      color: #000;
      font-size: 12px;
      line-height: 1.4;
      font-weight: 600;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    .header {
      text-align: center;
      padding-bottom: 3mm;
      border-bottom: 0.5mm solid #000;
      margin-bottom: 2mm;
    }
    .shop-name { font-size: 16px; font-weight: 700; letter-spacing: 0.5mm; }
    
    .info {
      display: flex;
      justify-content: space-between;
      padding: 2mm 0;
      font-size: 11px;
      font-weight: 600;
      color: #000;
      border-bottom: 0.3mm solid #000;
    }
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
    .qty-badge {
        font-family: monospace;
        font-size: 16px;
        border: 0.5mm solid #000;
        padding: 0 2mm;
        border-radius: 1mm;
    }
    
    .total {
      background: #000;
      color: #fff;
      margin: 3mm -2mm;
      padding: 4mm 2mm;
      text-align: center;
    }
    .total-label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 1mm;
      text-transform: uppercase;
    }
    .total-amount {
      font-size: 18px;
      font-weight: 700;
      margin-top: 1mm;
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
    <div class="shop-name">${isOrder ? "طـلـب مـفـتـوح" : storeName}</div>
    ${tableName ? `<div style="font-size: 20px; font-weight: 900; border: 1mm solid #000; padding: 2mm; margin-top: 2mm;">${tableName}</div>` : ""}
    ${customerName ? `
      <div style="margin-top: 2mm; padding: 2mm 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000;">
        <div style="font-size: 14px; font-weight: bold;">👤 ${customerName}</div>
        ${customerPhone ? `<div style="font-size: 11px; font-weight: bold; margin-top: 1mm;">📞 ${customerPhone}</div>` : ""}
        ${customerBalance !== undefined && customerBalance !== null ? `
          <div style="font-size: 12px; font-weight: bold; margin-top: 1mm;">
            الرصيد: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EGP' }).format(customerBalance)}
          </div>
        ` : ""}
      </div>
    ` : ""}
    ${!isOrder && phone ? `<div style="font-size: 11px; margin-top: 2mm;">📞 ${phone}</div>` : ""}
    ${!isOrder && address ? `<div style="font-size: 10px;">📍 ${address}</div>` : ""}
  </div>

  <div class="info">
    <div>
      <div class="info-num">#${invoiceNumber || "0000"}</div>
      <div>${dateStr} - ${timeStr}</div>
    </div>
    ${isOrder ? `<div style="text-align: left; font-size: 14px; font-weight: 900;">طلب</div>` : ""}
  </div>

  <div class="items">
    ${itemsHTML}
  </div>

  ${!isOrder ? `
  <div class="total">
    <div class="total-label">الإجمالي</div>
    <div class="total-amount">${formatCurrency(totalAmount, currency)}</div>
  </div>

  <div class="payment" style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; padding: 2mm 0; color: #000;">
    <span>طريقة الدفع:</span>
    <span>${paymentMethod || "نقداً"}</span>
  </div>

  ${remaining > 0 ? `
  <div style="background: #ddd; margin: 0 -3mm; padding: 2mm 3mm; display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; color: #000;">
    <span>المدفوع</span>
    <span>${formatCurrency(paidAmount || 0, currency)}</span>
  </div>
  <div style="background: #000; color: #fff; margin: 0 -3mm; padding: 3mm; display: flex; justify-content: space-between; font-size: 13px; font-weight: 700;">
    <span>المتبقي</span>
    <span>${formatCurrency(remaining, currency)}</span>
  </div>
  ` : ""}
  ` : ""}

  <div class="footer">
    <div class="footer-msg">${isOrder ? "إيصال طلب - يتم المحاسبة عند الكاشير" : footer}</div>
    ${!isOrder ? `
    <div style="margin-top: 2mm;">
        ${generateBarcodeSVG(invoiceNumber?.replace(/[^A-Z0-9]/gi, "").slice(-12) || "000000000000")}
    </div>
    <div style="font-family: monospace; font-size: 10px; margin-top: 1mm;">${invoiceNumber || ""}</div>
    ` : ""}
  </div>
</body>
</html>`;
}

/**
 * Lightweight Code128B barcode generator for thermal printers.
 * Ported and simplified from ELOS Accounting for minimal dependencies.
 */
function generateBarcodeSVG(text: string): string {
  const CODE128B: Record<string, string> = {
    ' ': '11011001100', '!': '11001101100', '"': '11001100110', '#': '10010011000',
    '$': '10010001100', '%': '10001001100', '&': '10011001000', "'": '10011000100',
    '(': '10001100100', ')': '11001001000', '*': '11001000100', '+': '11000100100',
    ',': '10110011100', '-': '10011011100', '.': '10011001110', '/': '10111001100',
    '0': '10011101100', '1': '11001011100', '2': '11001001110', '3': '11011100100',
    '4': '11001110100', '5': '11101101110', '6': '11101001100', '7': '11100101100',
    '8': '11100100110', '9': '11101100100', ':': '11100110100', ';': '11100110010',
    '<': '11011011000', '=': '11011000110', '>': '11000110110', '?': '10100011000',
    '@': '10001011000', 'A': '10001000110', 'B': '10110001000', 'C': '10001101000',
    'D': '10001100010', 'E': '11010001000', 'F': '11000101000', 'G': '11000100010',
    'H': '10110111000', 'I': '10110001110', 'J': '10001101110', 'K': '10111011000',
    'L': '10111000110', 'M': '10001110110', 'N': '11101110110', 'O': '11010001110',
    'P': '11000101110', 'Q': '11011101000', 'R': '11011100010', 'S': '11011101110',
    'T': '11101011000', 'U': '11101000110', 'V': '11100010110', 'W': '11011011110',
    'X': '11011110110',
    'Y': '11110110110',
    'Z': '10101111000',
    '{': '10100011110',
    '|': '10001011110',
    '}': '10111101000',
    '~': '10111100010'
  };

  const START_B = '11010010000';
  const STOP = '1100011101011';
  const upperText = text.toUpperCase();
  let pattern = START_B;
  let checksum = 104;

  for (let i = 0; i < upperText.length; i++) {
    const char = upperText[i];
    const code = CODE128B[char];
    if (code) {
      pattern += code;
      const charValue = char.charCodeAt(0) - 32;
      checksum += charValue * (i + 1);
    }
  }

  const checksumChar = String.fromCharCode((checksum % 103) + 32);
  if (CODE128B[checksumChar]) {
    pattern += CODE128B[checksumChar];
  }

  pattern += STOP;

  const barWidth = 1.2;
  const height = 30;
  const width = pattern.length * barWidth;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  svg += '<rect width="100%" height="100%" fill="white"/>';

  let x = 0;
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '1') {
      svg += `<rect x="${x}" y="0" width="${barWidth}" height="${height}" fill="black"/>`;
    }
    x += barWidth;
  }

  svg += '</svg>';
  return svg;
}
