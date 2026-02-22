export interface ReceiptSettings {
    name: string;
    address?: string | null;
    phone?: string | null;
    logoUrl?: string | null;
    receiptFooter?: string | null;
    printHeader?: string | null;
    currency: string;
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
    amountPaid: number;
    expectedDuration?: number | null;
    createdAt: Date | string;
}
