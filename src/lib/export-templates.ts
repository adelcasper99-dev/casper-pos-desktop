import * as XLSX from 'xlsx';

/**
 * Common helper to style and download the workbook
 */
function downloadWorkbook(workbook: XLSX.WorkBook, filename: string) {
    XLSX.writeFile(workbook, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

/**
 * Generate Excel import template for Inventory (Products & Spare Parts)
 */
export function generateInventoryTemplate(
    categories: string[] = [],
    models: string[] = [],
    attributes: string[] = []
) {
    const workbook = XLSX.utils.book_new();

    // 1. Data Sheet (البيانات)
    const dataHeaders = [
        'الكود (SKU)',
        'اسم المنتج',
        'الماركة/التصنيف (Brand)',
        'الكمية (Quantity)',
        'سعر التكلفة (Cost Price)',
        'سعر البيع (Sell Price)',
        'سعر فرعي 1 (Price 1)',
        'سعر فرعي 2 (Price 2)',
        'سعر فرعي 3 (Price 3)'
    ];

    const instructions = [
        'اختياري (نص)', // SKU
        'مطلوب (نص)', // Name
        'مطلوب (نص)', // Brand
        'مطلوب (رقم)', // Qty
        'مطلوب (رقم)', // Cost
        'مطلوب (رقم)', // Sell
        'اختياري (رقم)', // P1
        'اختياري (رقم)', // P2
        'اختياري (رقم)'  // P3
    ];

    const example1 = [
        'SP-001',
        'شاشة أيفون 13 برو',
        'Apple',
        '10',
        '150',
        '250',
        '240',
        '230',
        '220'
    ];

    const dataSheet = XLSX.utils.aoa_to_sheet([dataHeaders, instructions, example1]);
    dataSheet['!views'] = [{ rightToLeft: true }];
    XLSX.utils.book_append_sheet(workbook, dataSheet, 'البيانات');

    // 2. Reference Sheet (مرجع)
    const refData: any[][] = [['الأقسام المتاحة (Categories)', 'الموديلات المتاحة (Models)', 'الصفات المتاحة (Attributes)']];
    
    const maxLen = Math.max(categories.length, models.length, attributes.length);
    for (let i = 0; i < maxLen; i++) {
        refData.push([
            categories[i] || '',
            models[i] || '',
            attributes[i] || ''
        ]);
    }

    if (refData.length > 1) {
        const refSheet = XLSX.utils.aoa_to_sheet(refData);
        refSheet['!views'] = [{ rightToLeft: true }];
        XLSX.utils.book_append_sheet(workbook, refSheet, 'مرجع');
    }

    downloadWorkbook(workbook, 'نموذج_استيراد_المخزون.xlsx');
}

/**
 * Generate Excel import template for Purchase Invoices
 */
export function generatePurchaseTemplate(
    suppliers: string[] = [],
    warehouses: string[] = []
) {
    const workbook = XLSX.utils.book_new();

    // 1. Data Sheet (البيانات)
    const dataHeaders = [
        'المورد (Supplier)',
        'رقم الفاتورة (Invoice Number)',
        'كود المنتج (Product SKU)',
        'اسم المنتج (Product Name)',
        'القسم (Category)',
        'الكمية (Quantity)',
        'سعر التكلفة (Unit Cost)',
        'سعر البيع 1 (Sell Price 1)',
        'سعر البيع 2 (Sell Price 2)',
        'سعر البيع 3 (Sell Price 3)',
        'رسوم التوصيل (Delivery Charge)',
        'المبلغ المدفوع (Paid Amount)',
        'طريقة الدفع (Payment Method)',
        'المستودع (Warehouse)'
    ];

    const instructions = [
        'مطلوب (نص - مطابق للمرجع)', // Supplier
        'اختياري (نص)', // Invoice Number
        'مطلوب (نص)', // SKU
        'مطلوب (نص)', // Name
        'اختياري (نص)', // Category
        'مطلوب (رقم بدون فواصل أو رموز)', // Qty
        'مطلوب (رقم بدون فواصل أو رموز)', // Cost
        'مطلوب (رقم بدون فواصل أو رموز)', // Sell 1
        'اختياري (رقم)', // Sell 2
        'اختياري (رقم)', // Sell 3
        'اختياري (رقم للفاتورة كاملة)', // Delivery
        'اختياري (رقم للفاتورة كاملة)', // Paid
        'مطلوب (CASH/CARD/BANK_TRANSFER)', // Payment
        'اختياري (نص - مطابق للمرجع)' // Warehouse
    ];

    const example1 = [
        suppliers[0] || 'شركة أبل',
        'INV-2023-001',
        'IPH-15-PRO-256',
        'iPhone 15 Pro 256GB',
        'هواتف ذكية',
        '5',
        '900',
        '1000',
        '980',
        '950',
        '50',
        '4550',
        'BANK_TRANSFER',
        warehouses[0] || 'المستودع الرئيسي'
    ];

    const example2 = [
        suppliers[0] || 'شركة أبل',
        'INV-2023-001',
        'IPH-15-CASE-BLK',
        'iPhone 15 Case Black',
        'إكسسوارات',
        '20',
        '10',
        '25',
        '',
        '',
        '0', // Already charged on first line
        '0', // Already paid on first line
        'BANK_TRANSFER',
        warehouses[0] || 'المستودع الرئيسي'
    ];

    const dataSheet = XLSX.utils.aoa_to_sheet([dataHeaders, instructions, example1, example2]);
    dataSheet['!views'] = [{ rightToLeft: true }];
    XLSX.utils.book_append_sheet(workbook, dataSheet, 'البيانات');

    // 2. Reference Sheet (مرجع)
    const refData: any[][] = [['الموردين المتاحين (Suppliers)', 'المستودعات المتاحة (Warehouses)', 'طرق الدفع المتاحة (Payment Methods)']];
    
    const paymentMethods = ['CASH', 'CARD', 'BANK_TRANSFER'];
    const maxLen = Math.max(suppliers.length, warehouses.length, paymentMethods.length);
    
    // Cap at 500 rows to prevent huge Excel files
    const limit = Math.min(maxLen, 500);
    
    for (let i = 0; i < limit; i++) {
        refData.push([
            suppliers[i] || '',
            warehouses[i] || '',
            paymentMethods[i] || ''
        ]);
    }

    if (maxLen > 500) {
        refData.push(['... المزيد (Showing first 500)', '', '']);
    }

    const refSheet = XLSX.utils.aoa_to_sheet(refData);
    refSheet['!views'] = [{ rightToLeft: true }];
    XLSX.utils.book_append_sheet(workbook, refSheet, 'مرجع');

    downloadWorkbook(workbook, 'نموذج_استيراد_المشتريات.xlsx');
}
