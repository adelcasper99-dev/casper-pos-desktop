/**
 * Extended Label Data Types
 * Supports all possible fields for barcode labels
 */

export interface ExtendedLabelData {
  // Core fields
  productName: string;
  sku: string;
  
  // Price fields (user can select which to show)
  price1?: number;      // Sell price
  price2?: number;      // Alternate price 1
  price3?: number;      // Alternate price 2
  costPrice?: number;   // Cost price
  
  // Additional fields
  date?: string;        // Current date or custom
  brandName?: string;   // Product brand
  storeName?: string;   // From store settings
  category?: string;    // Product category
  
  // Display quantity (for multiple copies)
  quantity?: number;
}

export interface LabelFieldSettings {
  showProductName: boolean;
  showSKU: boolean;
  showBarcode: boolean;
  priceField: 'price1' | 'price2' | 'price3' | 'cost' | 'none';
  showDate: boolean;
  showBrand: boolean;
  showStore: boolean;
  showCategory: boolean;
  customDate?: string;
}

export const defaultFieldSettings: LabelFieldSettings = {
  showProductName: true,
  showSKU: true,
  showBarcode: true,
  priceField: 'price1',
  showDate: false,
  showBrand: false,
  showStore: false,
  showCategory: false,
};
