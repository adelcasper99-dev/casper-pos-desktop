/**
 * Real Code128B barcode SVG generator.
 * Ported from ThermalReceiptTemplate — identical implementation used by POS.
 */
export function generateCode128SVG(text: string): string {
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
    'X': '11011110110', 'Y': '11110110110', 'Z': '10101111000',
  };
  const START_B = '11010010000';
  const STOP = '1100011101011';
  const upper = text.toUpperCase().replace(/[^A-Z0-9 !"#$%&'()*+,\-./:;<=>?@]/g, '');
  let pattern = START_B;
  let checksum = 104;
  for (let i = 0; i < upper.length; i++) {
    const code = CODE128B[upper[i]];
    if (code) { pattern += code; checksum += (upper.charCodeAt(i) - 32) * (i + 1); }
  }
  const csChar = String.fromCharCode((checksum % 103) + 32);
  if (CODE128B[csChar]) pattern += CODE128B[csChar];
  pattern += STOP;
  const bw = 1.2; const h = 30;
  const w = pattern.length * bw;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><rect width="100%" height="100%" fill="white"/>`;
  let x = 0;
  for (const bit of pattern) { if (bit === '1') svg += `<rect x="${x}" y="0" width="${bw}" height="${h}" fill="black"/>`; x += bw; }
  return svg + '</svg>';
}

export function generateTicketLabelHTML(ticket: any, storeName = "CASPER POS", translations?: any): string {
  const t = translations || {};
  const barcodeValue = ticket.barcode || ticket.id?.substring(0, 8) || '';
  const durationText = (() => {
    const d = Number(ticket.expectedDuration);
    if (!d) return '';
    return d >= 60 ? `${(d / 60).toFixed(1)} س` : `${d} د`;
  })();
  const patternText = ticket.patternData
    ? ticket.patternData.split(',').map((n: string) => n.trim()).filter(Boolean).join('→')
    : '';
  const barcodeSvg = generateCode128SVG(barcodeValue);

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: 38.1mm 25.4mm; margin: 0; }
    body { 
        margin: 0; padding: 0; font-family: Arial, Tahoma, sans-serif; 
        background: #fff; color: #000; overflow: hidden;
        width: 38.1mm; height: 25.4mm; display: flex;
        justify-content: center; align-items: center;
    }
    .thermal-label-page { 
        width: 34mm; height: 23.5mm; box-sizing: border-box; overflow: hidden;
        padding: 0.1mm 0.3mm; display: flex; flex-direction: column;
        justify-content: space-between; gap: 0;
    }
    .header-row { 
        display: flex; justify-content: space-between; align-items: center; width: 100%; 
        border-bottom: 0.5px solid #000; padding-bottom: 0.1mm; margin-bottom: 0.1mm;
    }
    .text-truncate { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .label-id {
        font-size: 8.5px; font-weight: 950; background: #000; color: #fff; 
        padding: 0.1mm 0.5mm; border-radius: 1px;
    }
    .main-text { font-size: 9px; font-weight: 950; line-height: 1; }
    .sub-text { font-size: 8px; font-weight: 900; line-height: 0.95; color: #000; }
    .issue-text { font-size: 8.5px; font-weight: 950; color: #000; line-height: 1; }
    .pattern-text { font-size: 7px; font-weight: 950; color: #000; line-height: 0.95; }
    .barcode-container { width: 100%; height: 3mm; display: flex; justify-content: center; align-items: center; }
  </style>
</head>
<body>
<div class="thermal-label-page">
    <div class="header-row">
        <div class="text-truncate" style="font-size: 8px; font-weight: 950; max-width: 65%;">${storeName}</div>
        <div class="label-id">#${barcodeValue}</div>
    </div>
    <div style="display: flex; justify-content: space-between; width: 100%; margin-bottom: 0.1mm;">
        <div class="text-truncate" style="font-size: 8.5px; font-weight: 950; max-width: 60%;">${ticket.customerName || ticket.customer?.name || t.name || ''}</div>
        <div class="sub-text text-truncate" style="font-weight: 950;">${ticket.customerPhone || ''}</div>
    </div>
    <div style="display: flex; justify-content: space-between; width: 100%;">
        <div class="sub-text text-truncate" style="max-width: 75%; font-weight: 900;">${ticket.deviceBrand || ''} ${ticket.deviceModel || ''} ${ticket.deviceColor ? `(${ticket.deviceColor})` : ''}</div>
        ${durationText ? `<div class="sub-text text-truncate" style="font-weight: 950;">${durationText}</div>` : ''}
    </div>
    <div style="display: flex; justify-content: space-between; width: 100%;">
        <div class="sub-text text-truncate">${ticket.securityCode ? `${t.security || 'رمز'}: ${ticket.securityCode}` : ''}</div>
    </div>
    <div style="display: flex; justify-content: space-between; width: 100%;">
        <div class="pattern-text text-truncate" style="max-width: 100%;">${patternText}</div>
    </div>
    <div class="issue-text text-truncate" style="margin-bottom: 0.3mm;">
        ${ticket.issueDescription ? `🔑: ${ticket.issueDescription}` : ''}
    </div>
    ${ticket.notes ? `<div class="sub-text text-truncate" style="color: #000; margin-bottom: 0.1mm;">🖊️: ${ticket.notes}</div>` : ''}
    <div class="barcode-container">
        <div style="width: 28mm; height: 100%;">${barcodeSvg}</div>
    </div>
</div>
</body>
</html>`;
}

export function generateTicketReceiptHTML(ticket: any, settings: any): string {
  const paperSize = settings?.paperSize || '80mm';
  const is58 = paperSize === '58mm';
  const pageW = is58 ? '58' : '80';
  const bodyW = is58 ? '48mm' : '70mm';
  const currency = settings?.currency || 'EGP';
  const storeName = settings?.name || 'CASPER POS';
  const logoUrl = settings?.logoUrl || '';
  const footer = settings?.receiptFooter || 'شكراً لثقتكم بنا';
  const printHeader = settings?.printHeader || '';

  const dateStr = new Date(ticket.createdAt).toLocaleDateString('ar-EG', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true
  });

  const formatAmt = (n: number) => {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ' + currency;
  };

  const balanceDue = Math.max(0, (ticket.repairPrice || 0) - (ticket.amountPaid || 0));
  const patternText = ticket.patternData
    ? ticket.patternData.split(',').map((n: string) => n.trim()).filter(Boolean).join('→')
    : '';
  const barcodeSvg = generateCode128SVG(ticket.barcode?.replace(/[^A-Z0-9]/gi, '').slice(-12) || '000000');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: ${pageW}mm auto; margin: 0; }
    body {
      font-family: Arial, Tahoma, sans-serif;
      width: ${bodyW};
      margin: 0 auto;
      padding: 3mm 3mm 3mm 7mm;
      background: #fff;
      color: #000;
      font-size: 12px;
      line-height: 1.4;
      font-weight: 600;
      word-break: break-word;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      transform: translateX(-12mm);
    }
    .receipt-container { 
        width: 100%; 
        display: block; 
    }
    .header { width:100%; text-align:center; padding-bottom:3mm; border-bottom:0.1mm solid #000; margin-bottom:2mm; display:flex; flex-direction:column; align-items:center; }
    .shop-logo { max-width:35mm; max-height:15mm; margin-bottom:1.5mm; object-fit:contain; filter:grayscale(1) contrast(1.5); }
    .shop-name { font-size:16px; font-weight:700; letter-spacing:0.5mm; }
    .ticket-badge { margin-top:3mm; border:0.15mm solid #000; padding:1.5mm 4mm; font-size:20px; font-weight:900; background:#000; color:#fff; display:inline-block; }
    .section { padding:2mm 1mm; border-bottom:0.1mm solid #000; font-size:11px; page-break-inside: avoid; break-inside: avoid; }
    .section-title { font-size:10px; font-weight:900; text-transform:uppercase; opacity:.7; margin-bottom:1mm; }
    .row { display:flex; justify-content:space-between; align-items:center; }
    .total-box { background:#000; color:#fff; margin:3mm 0; padding:3mm 2mm; border-radius:1mm; page-break-inside: avoid; break-inside: avoid; }
    .total-box .row { font-size:11px; border-bottom:0.5px dashed rgba(255,255,255,.3); padding-bottom:1mm; margin-bottom:1mm; }
    .total-box .grand { font-size:15px; font-weight:900; padding-top:1mm; }
    .footer { text-align:center; padding-top:3mm; margin-top:2mm; border-top:0.3mm solid #000; page-break-inside: avoid; break-inside: avoid; }
  </style>
</head>
<body>
  <div class="header">
            ${logoUrl && logoUrl !== 'undefined' ? `<img src="${logoUrl}" class="shop-logo" alt="Logo" />` : ''}
            ${printHeader ? `<div style="font-size:10px;font-weight:bold;margin-bottom:1mm;white-space:pre-wrap;">${printHeader}</div>` : ''}
            <div class="shop-name">${storeName}</div>
            ${settings?.phone ? `<div style="font-size:11px;margin-top:1mm;">☎ ${settings.phone}</div>` : ''}
            ${settings?.address ? `<div style="font-size:10px;">📍 ${settings.address}</div>` : ''}
            <div class="ticket-badge">#${ticket.barcode}</div>
            <div style="font-size:10px;margin-top:1mm;font-weight:700;">${dateStr}</div>
          </div>
          <div class="section">
            <div class="section-title">العميل</div>
            <div style="font-size:14px;font-weight:900;">${ticket.customerName || ''}</div>
            ${ticket.customerPhone ? `<div style="font-size:11px;">${ticket.customerPhone}</div>` : ''}
          </div>
          <div class="section">
            <div class="section-title">الجهاز</div>
            <div class="row">
              <span style="font-size:13px;font-weight:900;">${ticket.deviceBrand || ''} ${ticket.deviceModel || ''}</span>
              ${ticket.deviceColor ? `<span style="background:#000;color:#fff;padding:0 2mm;font-size:10px;">${ticket.deviceColor}</span>` : ''}
            </div>
            ${ticket.deviceImei ? `<div style="font-size:10px;font-family:monospace;">IMEI: ${ticket.deviceImei}</div>` : ''}
            ${ticket.securityCode ? `<div style="font-size:10px;margin-top:1mm;">رمز: <strong>${ticket.securityCode}</strong></div>` : ''}
            ${patternText ? `<div style="font-size:10px;">نمط: ${patternText}</div>` : ''}
            ${ticket.conditionNotes ? `<div style="font-size:10px;margin-top:1mm;">الحالة: ${ticket.conditionNotes}</div>` : ''}
          </div>
          <div class="section" style="border-bottom:none;">
            <div class="section-title">المشكلة</div>
            <div style="font-size:12px;font-weight:700;font-style:italic;padding:1mm 0;">${ticket.issueDescription || ''}</div>
          </div>
          ${ticket.expectedDuration ? `
          <div style="text-align:center;margin:2mm 0;padding:1.5mm;border:0.5mm dashed #000;">
            <div style="font-size:10px;font-weight:700;">موعد الاستلام المتوقع:</div>
            <div style="font-size:13px;font-weight:900;">${Number(ticket.expectedDuration) >= 60 ? `${(Number(ticket.expectedDuration) / 60).toFixed(1)} ساعة` : `${ticket.expectedDuration} دقيقة`}</div>
          </div>` : ''}
          ${(ticket.repairPrice > 0 || ticket.amountPaid > 0) ? `
          <div class="total-box">
            <div class="row"><span>التكلفة</span><span>${formatAmt(ticket.repairPrice || 0)}</span></div>
            <div class="row"><span>المدفوع</span><span>${formatAmt(ticket.amountPaid || 0)}</span></div>
            <div class="row grand"><span>المتبقي</span><span>${formatAmt(balanceDue)}</span></div>
          </div>` : ''}
          <div class="footer">
            <div style="font-size:10px;">${footer}</div>
          </div>
    </div>
</body>
</html>`;
}

export function generateEngineerReceiptHTML(ticket: any, settings: any): string {
  const paperSize = settings?.paperSize || '80mm';
  const is58 = paperSize === '58mm';
  const pageW = is58 ? '58' : '80';
  const bodyW = is58 ? '48mm' : '70mm';
  const storeName = settings?.name || 'CASPER POS';
  const logoUrl = settings?.logoUrl || '';
  const printHeader = settings?.printHeader || '';

  const dateStr = new Date(ticket.createdAt).toLocaleDateString('ar-EG', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true
  });

  const barcodeSvg = generateCode128SVG(ticket.barcode?.replace(/[^A-Z0-9]/gi, '').slice(-12) || '000000');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: ${pageW}mm auto; margin: 0; }
    body {
      font-family: Arial, Tahoma, sans-serif;
      width: ${bodyW};
      margin: 0 auto;
      padding: 3mm 3mm 3mm 7mm;
      background: #fff;
      color: #000;
      font-size: 12px;
      line-height: 1.4;
      font-weight: 600;
      word-break: break-word;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      transform: translateX(-12mm);
    }
    .receipt-container { 
        width: 100%; 
        display: block; 
    }
    .header { width:100%; text-align:center; padding-bottom:1mm; border-bottom:0.1mm solid #000; margin-bottom:1.5mm; display:flex; flex-direction:column; align-items:center; justify-content: flex-start; }
    .shop-logo { max-width:35mm; max-height:15mm; margin-bottom:1.5mm; object-fit:contain; filter:grayscale(1) contrast(1.5); }
    .shop-name { font-size:16px; font-weight:700; letter-spacing:0.5mm; line-height: 1.2; }
    .ticket-badge { margin-top:2.5mm; border:0.15mm solid #000; padding:1.5mm 4mm; font-size:20px; font-weight:900; background:#000; color:#fff; display:inline-block; }
    .copy-type { margin-top:1mm; font-size:11px; font-weight:900; background:#fff; color:#000; border:0.1mm solid #000; padding:0.5mm 3mm; border-radius:1mm; text-transform:uppercase; }
    .section { padding:2mm 1mm; border-bottom:0.1mm solid #000; font-size:11px; page-break-inside: avoid; break-inside: avoid; }
    .section-title { font-size:9px; font-weight:900; text-transform:uppercase; opacity:1; margin-bottom:1mm; color: #555; }
    .row { display:flex; justify-content:space-between; align-items:center; }
    .entry-field { margin-top:1mm; border-bottom:0.1mm solid #000; height:10mm; display:flex; align-items:center; font-size:8px; color:#000; page-break-inside: avoid; break-inside: avoid; }
    .entry-label { white-space:nowrap; margin-left:1mm; font-weight: 700; }
    .entry-line { flex-grow:1; border-bottom:0.05mm dotted #000; margin-bottom:1.5mm; margin-right:1mm; opacity:1; }
  </style>
</head>
<body>
  <div class="header">
      ${logoUrl && logoUrl !== 'undefined' ? `<img src="${logoUrl}" class="shop-logo" alt="Logo" />` : ''}
      ${printHeader ? `<div style="font-size:10px;font-weight:bold;margin-bottom:1mm;white-space:pre-wrap;">${printHeader}</div>` : ''}
      <div class="shop-name">${storeName}</div>
      ${settings?.phone ? `<div style="font-size:11px;margin-top:1mm;">☎ ${settings.phone}</div>` : ''}
      <div class="ticket-badge">#${ticket.barcode}</div>
      <div class="copy-type">نسخة المهندس / داخلي</div>
      <div style="font-size:10px;margin-top:1mm;font-weight:700;">${dateStr}</div>
    </div>
    <div class="section">
      <div class="section-title">بيانات العميل</div>
      <div class="row" style="font-size:13px; font-weight:900;">
        <span>${ticket.customerName || ''}</span>
        ${ticket.customerPhone ? `<span style="font-size:11px; font-weight:700;">📱 ${ticket.customerPhone}</span>` : ''}
      </div>
    </div>
    <div class="section">
      <div class="section-title">بيانات الجهاز</div>
      <div class="row">
        <span style="font-size:12px; font-weight:900;">${ticket.deviceBrand || ''} ${ticket.deviceModel || ''}</span>
        ${ticket.deviceColor ? `<span style="background:#000;color:#fff;padding:0 2mm;font-size:10px;">${ticket.deviceColor}</span>` : ''}
      </div>
      ${ticket.deviceImei ? `<div style="font-size:10px;font-family:monospace;margin-top:0.5mm;">IMEI: ${ticket.deviceImei}</div>` : ''}
    </div>
    <div class="section">
      <div class="section-title">الأمان والمشكلة</div>
      ${ticket.securityCode ? `<div style="font-size:11px;">الرمز: <strong>${ticket.securityCode}</strong></div>` : ''}
      <div style="font-size:12px;font-weight:700;padding:1mm 0;">🔧 ${ticket.issueDescription || ''}</div>
      ${ticket.conditionNotes ? `<div style="font-size:10px;opacity:.8;">📝 ${ticket.conditionNotes}</div>` : ''}
    </div>
    <div class="section" style="background:#f9f9f9; border:0.4mm solid #000; margin:2mm 0; border-radius:1mm; padding:0 2mm;">
      <div class="section-title" style="opacity:1; color:#000; border-bottom:0.2mm solid #000; padding:1.5mm 0 1mm 0;">قسم الفني / الاستخدام الداخلي</div>
      <div class="entry-field"><span class="entry-label">اسم المهندس:</span><div class="entry-line"></div></div>
      <div class="entry-field"><span class="entry-label">وقت الإصلاح:</span><div class="entry-line"></div></div>
      <div class="entry-field"><span class="entry-label">قطع الغيار:</span><div class="entry-line"></div></div>
      <div class="entry-field"><span class="entry-label">التكلفة النهائية:</span><div class="entry-line"></div></div>
      <div class="entry-field"><span class="entry-label">ملاحظات إضافية:</span><div class="entry-line"></div></div>
    </div>
    <div style="text-align:center; margin-top:4mm;">
      <div style="width:100%; margin:0 auto;">${barcodeSvg}</div>
      <div style="font-family:monospace; font-size:10px; margin-top:1mm; font-weight:900;">${ticket.barcode}</div>
      <div style="font-size:8px; opacity:0.5; margin-top:2mm; text-transform:uppercase;">Engineer Copy - Internal Record</div>
    </div>
</body>
</html>`;
}

export function generatePaidTicketReceiptHTML(ticket: any, settings: any, translations?: any): string {
  const paperSize = settings?.paperSize || '80mm';
  const is58 = paperSize === '58mm';
  const pageW = is58 ? '58' : '80';
  const bodyW = is58 ? '48mm' : '70mm';
  const currency = settings?.currency || 'EGP';
  const storeName = settings?.name || 'CASPER POS';
  const logoUrl = settings?.logoUrl || '';
  const footer = settings?.receiptFooter || 'شكراً لثقتكم بنا';
  const printHeader = settings?.printHeader || '';
  const t = translations || {};

  const dateStr = new Date().toLocaleDateString('ar-EG', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true
  });

  const formatAmt = (n: number) => {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ' + currency;
  };

  const barcodeSvg = generateCode128SVG(ticket.barcode?.replace(/[^A-Z0-9]/gi, '').slice(-12) || '000000');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: ${pageW}mm auto; margin: 0; }
    body {
      font-family: Arial, Tahoma, sans-serif;
      width: ${bodyW};
      margin: 0 auto;
      padding: 3mm 3mm 3mm 7mm;
      background: #fff;
      color: #000;
      font-size: 12px;
      line-height: 1.4;
      font-weight: 600;
      word-break: break-word;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      transform: translateX(-12mm);
    }
    .header { width:100%; text-align:center; padding-bottom:3mm; border-bottom:0.1mm solid #000; margin-bottom:2mm; display:flex; flex-direction:column; align-items:center; }
    .shop-logo { max-width:35mm; max-height:15mm; margin-bottom:1.5mm; object-fit:contain; filter:grayscale(1) contrast(1.5); }
    .shop-name { font-size:16px; font-weight:700; letter-spacing:0.5mm; }
    .ticket-badge { margin-top:3mm; border:0.15mm solid #000; padding:1.5mm 4mm; font-size:20px; font-weight:900; background:#000; color:#fff; display:inline-block; }
    .section { padding:2mm 1mm; border-bottom:0.1mm solid #000; font-size:11px; page-break-inside: avoid; break-inside: avoid; }
    .section-title { font-size:10px; font-weight:900; text-transform:uppercase; opacity:1; margin-bottom:1mm; color: #555; }
    .row { display:flex; justify-content:space-between; align-items:center; }
    .total-box { background:#000; color:#fff; margin:3mm 0; padding:3mm 2mm; border-radius:1mm; page-break-inside: avoid; break-inside: avoid; }
    .total-box .row { font-size:11px; border-bottom:0.5px dashed rgba(255,255,255,.3); padding-bottom:1mm; margin-bottom:1mm; }
    .total-box .grand { font-size:15px; font-weight:900; padding-top:1mm; }
    .footer { text-align:center; padding-top:3mm; margin-top:2mm; border-top:0.3mm solid #000; page-break-inside: avoid; break-inside: avoid; }
    .warranty-card { border: 0.5mm solid #000; margin: 2mm 0; padding: 2mm; border-radius: 1mm; text-align: center; background: #f9f9f9; }
    .paid-stamp { border: 2px solid #000; color: #000; font-size: 14px; font-weight: 900; padding: 1mm 4mm; display: inline-block; margin-top: 1mm; text-transform: uppercase; transform: rotate(-5deg); }
  </style>
</head>
<body>
  <div class="header">
    ${logoUrl && logoUrl !== 'undefined' ? `<img src="${logoUrl}" class="shop-logo" alt="Logo" />` : ''}
    ${printHeader ? `<div style="font-size:10px;font-weight:bold;margin-bottom:1mm;white-space:pre-wrap;">${printHeader}</div>` : ''}
    <div class="shop-name">${storeName}</div>
    ${settings?.phone ? `<div style="font-size:11px;margin-top:1mm;">☎ ${settings.phone}</div>` : ''}
    <div class="ticket-badge">#${ticket.barcode}</div>
    <div class="paid-stamp">مدفوع / PAID</div>
    <div style="font-size:10px;margin-top:1mm;font-weight:700;">${dateStr}</div>
  </div>

  <div class="section">
    <div class="section-title">بيانات العميل</div>
    <div style="font-size:14px;font-weight:900;">${ticket.customerName || ''}</div>
    ${ticket.customerPhone ? `<div style="font-size:11px;">${ticket.customerPhone}</div>` : ''}
  </div>

  <div class="section">
    <div class="section-title">الجهاز والأمان</div>
    <div class="row">
      <span style="font-size:13px;font-weight:900;">${ticket.deviceBrand || ''} ${ticket.deviceModel || ''}</span>
      ${ticket.deviceColor ? `<span style="background:#000;color:#fff;padding:0 2mm;font-size:10px;">${ticket.deviceColor}</span>` : ''}
    </div>
    ${ticket.deviceImei ? `<div style="font-size:10px;font-family:monospace;">IMEI: ${ticket.deviceImei}</div>` : ''}
    <div style="font-size:12px;font-weight:700;padding:1mm 0;">🔧 ${ticket.issueDescription || ''}</div>
  </div>

  <div class="section">
    <div class="section-title">تفاصيل الدفع</div>
    <div class="row"><span>طريقة الدفع:</span><span>${ticket.lastPaymentMethod || 'CASH'}</span></div>
    ${ticket.reference ? `<div class="row"><span>المرجع:</span><span>${ticket.reference}</span></div>` : ''}
    <div class="total-box">
        <div class="row"><span>التكلفة الإجمالية</span><span>${formatAmt(ticket.repairPrice || 0)}</span></div>
        <div class="row"><span>إجمالي المدفوع</span><span>${formatAmt(ticket.amountPaid || 0)}</span></div>
        <div class="row grand"><span>المتبقي</span><span>${formatAmt(0)}</span></div>
    </div>
  </div>

  ${ticket.warranty ? `
  <div class="warranty-card">
    <div style="font-size:12px;font-weight:950;margin-bottom:1mm;">🛡️ شهادة الضمان</div>
    <div style="font-size:11px;">مدة الضمان: <strong>${ticket.warranty.warrantyDays} يوم</strong></div>
    <div style="font-size:11px;">ينتهي في: <strong>${new Date(ticket.warranty.warrantyExpiryDate).toLocaleDateString('ar-EG')}</strong></div>
    <div style="font-size:9px;margin-top:1mm;opacity:.8;">الضمان يشمل العيب المصلح فقط ولا يشمل الكسر أو السوائل</div>
  </div>` : ''}

  <div class="section" style="border-bottom:none; font-size:9px; text-align:center; opacity:.8;">
    <div style="font-weight:900;margin-bottom:1mm;">${t.termsHeader || 'الشروط والأحكام'}</div>
    <div>${t.terms1 || ''}</div>
    <div>${t.terms2 || ''}</div>
    <div>${t.terms3 || ''}</div>
  </div>

  <div class="footer">
    <div style="font-size:10px;font-weight:900;">${footer}</div>
    <div style="width:100%; margin:2mm auto 0;">${barcodeSvg}</div>
    <div style="font-family:monospace; font-size:10px; margin-top:1mm; font-weight:900;">${ticket.barcode}</div>
    <div style="font-size:8px; opacity:0.5; margin-top:2mm; text-transform:uppercase;">Thank you for your business</div>
  </div>
</body>
</html>`;
}
