export interface ReceiptSettings {
    name: string;
    address?: string | null;
    phone?: string | null;
    logoUrl?: string | null;
    receiptFooter?: string | null;
    printHeader?: string | null;
    currency: string;
    paperSize?: string;
}

export interface Ticket {
    id: string;
    barcode: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string | null;
    deviceBrand: string;
    deviceModel: string;
    deviceImei?: string | null;
    deviceColor?: string | null;
    securityCode?: string | null;
    patternData?: string | null;
    issueDescription: string;
    conditionNotes?: string | null;
    warrantyExpiry?: Date | string | null;
    status: string;
    repairPrice: number;
    initialQuote?: number | null;
    partsCost?: number | null;
    amountPaid: number;
    expectedDuration?: number | null;
    createdAt: Date | string;
    employeeName?: string | null;
    createdBy?: {
        name: string;
    } | null;
    parts?: TicketPart[] | null;
}

export interface TicketPart {
    id: string;
    productId: string;
    quantity: number;
    cost: number;
    price: number;
    product?: {
        name: string;
        sku?: string | null;
    } | null;
}
