/**
 * CSV Invoice Import Parser
 * Handles parsing and validation of CSV files for bulk invoice import
 */

export interface CSVInvoiceRow {
    supplier: string;
    invoiceNumber?: string;
    productSku: string;
    productName: string;
    category?: string;
    quantity: number;
    unitCost: number;
    sellPrice1?: number;
    sellPrice2?: number;
    sellPrice3?: number;
    deliveryCharge?: number;
    paidAmount?: number;
    paymentMethod?: string;
    warehouse?: string;
}

export interface InvoiceItem {
    productSku: string;
    productName: string;
    category?: string;
    quantity: number;
    unitCost: number;
    sellPrice?: number;
    sellPrice2?: number;
    sellPrice3?: number;
}

export interface ParsedInvoice {
    supplier: string;
    invoiceNumber?: string;
    items: InvoiceItem[];
    deliveryCharge: number;
    paidAmount: number;
    paymentMethod: string;
    warehouse?: string;
}

export interface ValidationError {
    row: number;
    field: string;
    message: string;
}

export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
}

/**
 * Parse a single CSV line with proper quote handling
 * Handles: quoted fields, commas inside quotes, escaped quotes ("")
 */
function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
        const char = line[i];

        if (inQuotes) {
            if (char === '"') {
                // Check for escaped quote ("")
                if (i + 1 < line.length && line[i + 1] === '"') {
                    current += '"';
                    i += 2;
                    continue;
                }
                // End of quoted field
                inQuotes = false;
            } else {
                current += char;
            }
        } else {
            if (char === '"') {
                // Start of quoted field
                inQuotes = true;
            } else if (char === ',') {
                // Field separator
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        i++;
    }

    // Push last field
    result.push(current.trim());

    return result;
}

/**
 * Remove BOM (Byte Order Mark) from string
 * Excel often adds BOM to CSV files
 */
function removeBOM(text: string): string {
    // UTF-8 BOM
    if (text.charCodeAt(0) === 0xFEFF) {
        return text.slice(1);
    }
    // UTF-8 BOM as bytes (\ufeff)
    if (text.startsWith('\ufeff')) {
        return text.slice(1);
    }
    return text;
}

/**
 * Parse CSV text into row objects
 * Handles: quoted fields, commas in values, BOM characters, mixed line endings
 */
export function parseCSV(csvText: string): CSVInvoiceRow[] {
    // Remove BOM and normalize line endings
    const cleanText = removeBOM(csvText).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = cleanText.trim().split('\n');

    if (lines.length < 2) {
        throw new Error('CSV file must contain a header row and at least one data row');
    }

    // Parse header with quote handling
    const header = parseCSVLine(lines[0]).map(h => h.toLowerCase());

    // Map header names to object keys (case-insensitive, trim)
    const fieldMap: Record<string, keyof CSVInvoiceRow> = {
        'supplier': 'supplier',
        'invoice number': 'invoiceNumber',
        'invoicenumber': 'invoiceNumber',
        'product sku': 'productSku',
        'productsku': 'productSku',
        'sku': 'productSku',
        'product name': 'productName',
        'productname': 'productName',
        'name': 'productName',
        'category': 'category',
        'quantity': 'quantity',
        'qty': 'quantity',
        'unit cost': 'unitCost',
        'unitcost': 'unitCost',
        'cost': 'unitCost',
        'sell price 1': 'sellPrice1',
        'sellprice1': 'sellPrice1',
        'price': 'sellPrice1',
        'sell price 2': 'sellPrice2',
        'sellprice2': 'sellPrice2',
        'sell price 3': 'sellPrice3',
        'sellprice3': 'sellPrice3',
        'delivery charge': 'deliveryCharge',
        'deliverycharge': 'deliveryCharge',
        'delivery': 'deliveryCharge',
        'paid amount': 'paidAmount',
        'paidamount': 'paidAmount',
        'paid': 'paidAmount',
        'payment method': 'paymentMethod',
        'paymentmethod': 'paymentMethod',
        'payment': 'paymentMethod',
        'warehouse': 'warehouse',
    };

    const rows: CSVInvoiceRow[] = [];

    // Parse data rows with proper quote handling
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; // Skip empty lines

        const values = parseCSVLine(line);
        const row: any = {};

        for (let j = 0; j < header.length; j++) {
            const fieldKey = fieldMap[header[j]];
            if (!fieldKey) continue;

            const value = values[j] || '';

            // Parse numeric fields
            if (['quantity', 'unitCost', 'sellPrice1', 'sellPrice2', 'sellPrice3', 'deliveryCharge', 'paidAmount'].includes(fieldKey)) {
                // Remove thousand separators and currency symbols
                const cleanValue = value.replace(/[$,\s]/g, '');
                const num = parseFloat(cleanValue);
                row[fieldKey] = isNaN(num) ? undefined : num;
            } else {
                row[fieldKey] = value || undefined;
            }
        }

        rows.push(row as CSVInvoiceRow);
    }

    return rows;
}

/**
 * Group CSV rows into invoices
 * Rows with same supplier + invoice number = same invoice
 */
export function groupIntoInvoices(rows: CSVInvoiceRow[]): ParsedInvoice[] {
    const invoiceMap = new Map<string, ParsedInvoice>();

    for (const row of rows) {
        // Generate key: supplier + invoiceNumber (or auto for missing)
        const key = `${row.supplier}|${row.invoiceNumber || 'AUTO'}`;

        let invoice = invoiceMap.get(key);

        if (!invoice) {
            // Create new invoice
            invoice = {
                supplier: row.supplier,
                invoiceNumber: row.invoiceNumber,
                items: [],
                deliveryCharge: row.deliveryCharge || 0,
                paidAmount: row.paidAmount || 0,
                paymentMethod: row.paymentMethod || 'CASH',
                warehouse: row.warehouse,
            };
            invoiceMap.set(key, invoice);
        }

        // Add item to invoice
        invoice.items.push({
            productSku: row.productSku,
            productName: row.productName,
            category: row.category,
            quantity: row.quantity,
            unitCost: row.unitCost,
            sellPrice: row.sellPrice1,
            sellPrice2: row.sellPrice2,
            sellPrice3: row.sellPrice3,
        });
    }

    return Array.from(invoiceMap.values());
}

/**
 * Validate parsed invoices
 */
export function validateCSVData(invoices: ParsedInvoice[]): ValidationResult {
    const errors: ValidationError[] = [];
    let rowIndex = 1; // Start from 1 (after header)

    for (const invoice of invoices) {
        // Validate supplier
        if (!invoice.supplier || invoice.supplier.trim() === '') {
            errors.push({
                row: rowIndex,
                field: 'supplier',
                message: 'Supplier name is required'
            });
        }

        // Validate payment method
        const validMethods = ['CASH', 'CARD', 'BANK_TRANSFER'];
        if (invoice.paymentMethod && !validMethods.includes(invoice.paymentMethod.toUpperCase())) {
            errors.push({
                row: rowIndex,
                field: 'paymentMethod',
                message: `Payment method must be one of: ${validMethods.join(', ')}`
            });
        }

        // Validate items
        if (invoice.items.length === 0) {
            errors.push({
                row: rowIndex,
                field: 'items',
                message: 'Invoice must have at least one item'
            });
        }

        for (const item of invoice.items) {
            // Validate SKU
            if (!item.productSku || item.productSku.trim() === '') {
                errors.push({
                    row: rowIndex,
                    field: 'productSku',
                    message: 'Product SKU is required'
                });
            }

            // Validate name
            if (!item.productName || item.productName.trim() === '') {
                errors.push({
                    row: rowIndex,
                    field: 'productName',
                    message: 'Product name is required'
                });
            }

            // Validate quantity
            if (!item.quantity || item.quantity <= 0) {
                errors.push({
                    row: rowIndex,
                    field: 'quantity',
                    message: 'Quantity must be greater than 0'
                });
            }

            // Validate unit cost
            if (item.unitCost === undefined || item.unitCost < 0) {
                errors.push({
                    row: rowIndex,
                    field: 'unitCost',
                    message: 'Unit cost must be a valid positive number'
                });
            }

            // Validate sell price (required for new products)
            if (item.sellPrice === undefined || item.sellPrice <= 0) {
                errors.push({
                    row: rowIndex,
                    field: 'sellPrice',
                    message: 'Sell price is required and must be greater than 0'
                });
            }

            // Validate sell price >= cost (profit check)
            if (item.sellPrice !== undefined && item.unitCost !== undefined && item.sellPrice < item.unitCost) {
                errors.push({
                    row: rowIndex,
                    field: 'sellPrice',
                    message: `Sell price (${item.sellPrice}) cannot be less than cost (${item.unitCost})`
                });
            }

            rowIndex++;
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Check for duplicate SKUs within the CSV
 */
export function checkDuplicateSKUs(invoices: ParsedInvoice[]): string[] {
    const skuSet = new Set<string>();
    const duplicates = new Set<string>();

    for (const invoice of invoices) {
        for (const item of invoice.items) {
            if (skuSet.has(item.productSku)) {
                duplicates.add(item.productSku);
            } else {
                skuSet.add(item.productSku);
            }
        }
    }

    return Array.from(duplicates);
}
