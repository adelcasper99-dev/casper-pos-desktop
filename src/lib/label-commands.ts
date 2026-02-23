import { DOTS_PER_MM } from './constants';

export interface LabelProduct {
  sku: string;
  name: string;
  price: number;
  storeName?: string;
}

export interface LabelElement {
  id: string; // 'storeName', 'productName', 'price', 'sku', 'barcode'
  label: string;
  type: 'text' | 'barcode' | 'image';
  x: number; // mm
  y: number; // mm
  width?: number; // mm
  height?: number; // mm (for barcode)
  fontSize?: number; // pt (for text)
  fontFamily?: string;
  fontWeight?: 'normal' | 'bold';
  rotation?: 0 | 90 | 180 | 270;
  visible: boolean;
  sampleData?: string;
}

export interface LabelDimensions {
  width: number;
  height: number;
}

export interface PageDimensions {
  width: number;
  height: number;
}

export interface LabelMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LabelTemplate {
  // New fields
  page?: PageDimensions;
  margin?: LabelMargins;

  // Background image for tracing/reference
  backgroundImage?: {
    dataUrl: string;           // Base64 data URL of the image
    opacity: number;           // 0-1 (0.5 = 50% opacity)
    locked: boolean;           // Prevent accidental editing
    visible: boolean;          // Toggle visibility
    calibration?: {
      realWidth: number;       // Actual width in mm
      realHeight: number;      // Actual height in mm
    };
  };

  // Legacy fields (kept for compatibility, mapped to page/label dims)
  dimensions: LabelDimensions;
  elements: LabelElement[];
}

/**
 * Migrates a potential legacy template to the new structure
 * Defaults missing margins to 0
 */
export function migrateTemplate(template: any): LabelTemplate {
  if (!template) {
    return {
      dimensions: { width: 58, height: 30 },
      elements: [], // Will be filled with defaults by consumer if needed
      page: { width: 58, height: 30 },
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    };
  }

  // Ensure elements exist
  const elements = Array.isArray(template.elements) ? template.elements : [];

  // Ensure dimensions exist
  const dims = template.dimensions || { width: 58, height: 30 };

  // Determine page size (if not present, default to label size)
  const page = template.page || { width: dims.width, height: dims.height };

  // Determine margins (default to 0)
  const margin = template.margin || { top: 0, right: 0, bottom: 0, left: 0 };

  return {
    dimensions: dims,
    elements,
    page,
    margin
  };
}

/**
 * ESC/POS Control Characters
 */
const ESC = '\x1B';
const GS = '\x1D';
const LF = '\n';

/**
 * Generate ESC/POS commands for a single barcode label
 * 
 * Label Layout (58mm × 30mm):
 * Requested:
 *  - Store Name (Top)
 *  - Barcode
 *  - Item Name
 *  - Price
 *  - SKU on Left
 * 
 * ESC/POS Implementation Attempt (Standard Mode):
 * ┌────────────────────────┐
 * │ SKU: 123456            │
 * │      Store Name        │
 * │  ████████████████████  │
 * │  Product Name          │
 * │  Price: $9.99          │
 * └────────────────────────┘
 */
const FF = '\x0C'; // Form Feed (Print in Page Mode)

/**
 * Convert mm to dots using global constant
 */
const mmToDots = (mm: number) => Math.round(mm * DOTS_PER_MM);

/**
 * Generate ESC/POS commands for a single barcode label
 */
export function generateLabelCommands(product: LabelProduct, template?: LabelTemplate): string[] {
  // Fallback to default layout if no template provided
  if (!template) {
    return generateDefaultLegacyCommands(product);
  }

  const commands: string[] = [];
  const { width, height } = template.dimensions;

  // 1. Initialize & Page Mode
  commands.push(ESC + '@');
  commands.push(ESC + 'L'); // Enter Page Mode

  // 2. Set Print Area (x, y, w, h)
  // x,y = 0,0
  // w,h converted to dots
  const wDots = mmToDots(width);
  const hDots = mmToDots(height);

  // ESC W xL xH yL yH dxL dxH dyL dyH
  commands.push(ESC + 'W' +
    String.fromCharCode(0) + String.fromCharCode(0) + // x=0
    String.fromCharCode(0) + String.fromCharCode(0) + // y=0
    String.fromCharCode(wDots % 256) + String.fromCharCode(Math.floor(wDots / 256)) + // width
    String.fromCharCode(hDots % 256) + String.fromCharCode(Math.floor(hDots / 256))   // height
  );

  // 3. Render Elements
  template.elements.filter(el => el.visible).forEach(el => {
    // Set Rotation (ESC T n) - Direction of text
    // 0=0, 1=90, 2=180, 3=270 (relative to page)
    // Map degrees to 0-3
    let dir = 0;
    if (el.rotation === 90) dir = 1;
    if (el.rotation === 180) dir = 2;
    if (el.rotation === 270) dir = 3;
    commands.push(ESC + 'T' + String.fromCharCode(dir));

    // Set Position (ESC $ = x, GS $ = y)
    const xDots = mmToDots(el.x);
    const yDots = mmToDots(el.y);

    commands.push(ESC + '$' + String.fromCharCode(xDots % 256) + String.fromCharCode(Math.floor(xDots / 256)));
    commands.push(GS + '$' + String.fromCharCode(yDots % 256) + String.fromCharCode(Math.floor(yDots / 256)));

    // Render Content
    if (el.type === 'text') {
      // Font config
      const isBold = el.fontWeight === 'bold';
      commands.push(ESC + 'E' + String.fromCharCode(isBold ? 1 : 0));

      // Basic Font Selection (0=Font A, 1=Font B)
      const useFontB = (el.fontSize || 10) < 10;
      commands.push(ESC + 'M' + String.fromCharCode(useFontB ? 1 : 0));

      let text = '';
      if (el.id === 'productName') text = product.name;
      else if (el.id === 'price') text = `$${product.price.toFixed(2)}`;
      else if (el.id === 'sku') text = product.sku;
      else if (el.id === 'storeName') text = product.storeName || 'STORE';
      else text = el.sampleData || '';

      // Label Prefix logic (optional, user can bake it into label if they want, but let's be smart)
      if (el.id === 'sku' && !text.startsWith('SKU') && (el.label.includes('SKU'))) text = `SKU: ${text}`;

      commands.push(text + LF); // Text must end with LF to buffer
      commands.push(ESC + 'E' + String.fromCharCode(0)); // Reset bold
    }
    else if (el.type === 'barcode') {
      // Barcode
      const h = mmToDots(el.height || 10);
      const w = 2; // Fixed width for now

      commands.push(GS + 'H' + String.fromCharCode(0)); // No HRI
      commands.push(GS + 'h' + String.fromCharCode(h));
      commands.push(GS + 'w' + String.fromCharCode(w));

      const data = product.sku;
      commands.push(GS + 'k' + String.fromCharCode(73) + String.fromCharCode(data.length) + data);
    }
  });

  // 4. Print and Finish
  commands.push(FF); // Print Page
  commands.push(LF); // Feed a bit
  commands.push(ESC + 'S'); // Exit Page Mode (Standard Mode)

  // Cut
  commands.push(GS + 'V' + String.fromCharCode(0));

  return commands;
}

function generateDefaultLegacyCommands(product: LabelProduct): string[] {
  const commands = [];
  commands.push(ESC + '@');
  commands.push(ESC + '7' + String.fromCharCode(12) + String.fromCharCode(200));
  commands.push(ESC + '3' + String.fromCharCode(0));
  commands.push(ESC + 'a' + String.fromCharCode(1)); // Center

  // Store
  if (product.storeName) {
    commands.push(ESC + 'E' + String.fromCharCode(1));
    commands.push(product.storeName + LF);
    commands.push(ESC + 'E' + String.fromCharCode(0));
  }

  // Barcode
  commands.push(GS + 'H' + String.fromCharCode(0));
  commands.push(GS + 'f' + String.fromCharCode(0));
  commands.push(GS + 'h' + String.fromCharCode(50));
  commands.push(GS + 'w' + String.fromCharCode(2));
  commands.push(GS + 'k' + String.fromCharCode(73) + String.fromCharCode(product.sku.length) + product.sku);
  commands.push(LF);

  // Name
  commands.push(product.name.substring(0, 30) + LF);

  // Price
  commands.push(ESC + 'E' + String.fromCharCode(1));
  commands.push(`$${product.price.toFixed(2)}` + LF);
  commands.push(ESC + 'E' + String.fromCharCode(0));

  commands.push(LF);
  commands.push(GS + 'V' + String.fromCharCode(0));
  return commands;
}

/**
 * Generate commands for multiple labels
 * @param products - Array of products to print
 * @returns Combined array of ESC/POS commands for all labels
 */
export function generateMultipleLabelCommands(products: LabelProduct[], template?: LabelTemplate): string[] {
  const allCommands: string[] = [];

  products.forEach((product, index) => {
    const labelCommands = generateLabelCommands(product, template);
    allCommands.push(...labelCommands);

    // Small delay between labels (preventing feed issues)
    if (index < products.length - 1) {
      allCommands.push(LF);
    }
  });

  return allCommands;
}

/**
 * Generate test label command
 * Used for printer configuration testing
 */
export function generateTestLabel(): string[] {
  // Ultra-simple test - just plain text, no ESC/POS codes
  return [
    'HELLO FROM CASPER POS\n',
    'QZ TRAY TEST\n',
    'Printer Working!\n',
    '\n',
    '\n',
    '\n',
  ];
}

/**
 * Generate a self-contained HTML string for printing labels via Electron / browser.
 * Mirrors the layout of ThermalPrintLabel.tsx for consistent output.
 */
export function generateLabelHTML(products: LabelProduct[], template?: LabelTemplate): string {
  const pageW = template?.page?.width ?? 58;
  const pageH = template?.page?.height ?? 30;
  const mT = template?.margin?.top ?? 0;
  const mR = template?.margin?.right ?? 0;
  const mB = template?.margin?.bottom ?? 0;
  const mL = template?.margin?.left ?? 0;
  const orientation = pageW > pageH ? 'landscape' : 'portrait';

  const style = `
    @page { size: ${pageW}mm ${pageH}mm ${orientation}; margin: 0; }
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
    .label-page {
      width: ${pageW}mm; height: ${pageH}mm;
      position: relative; page-break-after: always;
      box-sizing: border-box; overflow: hidden;
    }
    .label-area {
      position: absolute;
      top: ${mT}mm; left: ${mL}mm;
      width: calc(100% - ${mL + mR}mm);
      height: calc(100% - ${mT + mB}mm);
    }
    .el { position: absolute; white-space: nowrap; line-height: 1; font-family: Arial, sans-serif; }
  `;

  const renderElement = (el: LabelElement, product: LabelProduct): string => {
    if (!el.visible) return '';
    const posStyle = `left:${el.x}mm;top:${el.y}mm;${el.width ? `width:${el.width}mm;` : ''}transform:rotate(${el.rotation ?? 0}deg);transform-origin:top left;`;
    const fontStyle = `font-size:${el.fontSize ?? 10}pt;font-weight:${el.fontWeight ?? 'normal'};`;

    if (el.type === 'barcode') {
      // Use a text fallback — SVG barcode requires a DOM library, so we show the SKU text
      return `<div class="el" style="${posStyle}font-size:8pt;">${product.sku}</div>`;
    }

    let text = '';
    const id = el.id?.toLowerCase() ?? '';
    if (id === 'productname') text = product.name;
    else if (id === 'price') text = `${product.price.toFixed(2)}`;
    else if (id === 'sku') text = product.sku;
    else if (id === 'storename') text = product.storeName ?? '';
    else text = el.label;

    return `<div class="el" style="${posStyle}${fontStyle}">${text}</div>`;
  };

  const renderLabel = (product: LabelProduct): string => {
    if (!template) {
      // Legacy layout fallback
      return `
        <div class="label-page" style="padding:2mm;box-sizing:border-box;">
          <div style="font-size:9px;font-weight:bold;text-align:center;">${product.storeName ?? ''}</div>
          <div style="font-size:9px;text-align:center;">${product.name}</div>
          <div style="font-size:10px;font-weight:bold;text-align:center;">${product.price.toFixed(2)}</div>
          <div style="font-size:8px;text-align:center;">SKU: ${product.sku}</div>
        </div>`;
    }
    const elements = template.elements.filter(el => el.visible).map(el => renderElement(el, product)).join('');
    return `<div class="label-page"><div class="label-area">${elements}</div></div>`;
  };

  const body = products.map(renderLabel).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${style}</style></head><body>${body}</body></html>`;
}

/**
 * ESC/POS Command Reference
 * For future enhancements and troubleshooting
 */
export const ESC_POS_COMMANDS = {
  // Printer control
  INIT: ESC + '@',
  RESET: ESC + '@',

  // Text formatting
  BOLD_ON: ESC + 'E' + String.fromCharCode(1),
  BOLD_OFF: ESC + 'E' + String.fromCharCode(0),
  UNDERLINE_ON: ESC + '-' + String.fromCharCode(1),
  UNDERLINE_OFF: ESC + '-' + String.fromCharCode(0),
  DOUBLE_STRIKE_ON: ESC + 'G' + String.fromCharCode(1),
  DOUBLE_STRIKE_OFF: ESC + 'G' + String.fromCharCode(0),

  // Alignment
  ALIGN_LEFT: ESC + 'a' + String.fromCharCode(0),
  ALIGN_CENTER: ESC + 'a' + String.fromCharCode(1),
  ALIGN_RIGHT: ESC + 'a' + String.fromCharCode(2),

  // Font size
  FONT_NORMAL: ESC + '!' + String.fromCharCode(0),
  FONT_LARGE: ESC + '!' + String.fromCharCode(0x30),

  // Line feed
  LINE_FEED: LF,

  // Paper control
  FEED_3_LINES: ESC + 'd' + String.fromCharCode(3),
  CUT_FULL: GS + 'V' + String.fromCharCode(0),
  CUT_PARTIAL: GS + 'V' + String.fromCharCode(1),
};
