"use client";

import React from 'react';
import { PNGBarcode } from './PNGBarcode';
import { ExtendedLabelData } from '@/types/barcode';

interface BarcodeLabel2Props extends ExtendedLabelData {
  showProductName?: boolean;
  showSKU?: boolean;
  showBarcode?: boolean;
  priceField?: 'price1' | 'price2' | 'price3' | 'cost' | 'none';
  showDate?: boolean;
  showBrand?: boolean;
  showStore?: boolean;
  showCategory?: boolean;
}

/**
 * Enhanced barcode label with all configurable fields
 * 50x25mm format
 */
export function BarcodeLabel2({
  productName,
  sku,
  price1,
  price2,
  price3,
  costPrice,
  date,
  brandName,
  storeName,
  category,
  quantity = 1,
  // Display toggles
  showProductName = true,
  showSKU = true,
  showBarcode = true,
  priceField = 'price1',
  showDate = false,
  showBrand = false,
  showStore = false,
  showCategory = false,
}: BarcodeLabel2Props) {
  const labels = Array.from({ length: quantity }, (_, i) => i);

  // Get price based on selection
  const getPrice = () => {
    switch (priceField) {
      case 'price1': return price1;
      case 'price2': return price2;
      case 'price3': return price3;
      case 'cost': return costPrice;
      default: return undefined;
    }
  };

  const selectedPrice = getPrice();

  return (
    <>
      {labels.map((index) => (
        <div
          key={index}
          className="barcode-label-extended"
          style={{
            width: '50mm',
            height: '25mm',
            padding: '2mm',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            alignItems: 'center',
            pageBreakInside: 'avoid',
            border: '1px dashed #ccc',
            marginBottom: '2mm',
            backgroundColor: 'white',
            color: 'black',
            gap: '1mm',
          }}
        >
          {/* Header Section */}
          <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            {/* Store Name (top left) */}
            {showStore && storeName && (
              <div style={{ fontSize: '6pt', color: '#666', fontWeight: 'bold' }}>
                {storeName}
              </div>
            )}
            
            {/* Date (top right) */}
            {showDate && date && (
              <div style={{ fontSize: '6pt', color: '#666', marginLeft: 'auto' }}>
                {date}
              </div>
            )}
          </div>

          {/* Product Name */}
          {showProductName && (
            <div
              style={{
                fontSize: '9pt',
                fontWeight: 'bold',
                textAlign: 'center',
                width: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {productName}
            </div>
          )}

          {/* Brand & Category */}
          {(showBrand || showCategory) && (
            <div style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '4mm', fontSize: '7pt', color: '#666' }}>
              {showBrand && brandName && <span>{brandName}</span>}
              {showBrand && showCategory && brandName && category && <span>•</span>}
              {showCategory && category && <span>{category}</span>}
            </div>
          )}

          {/* Barcode */}
          {showBarcode && (
            <div style={{ margin: '1mm 0' }}>
              <PNGBarcode
                value={sku}
                width={2}
                height={30}
                displayValue={showSKU}
              />
            </div>
          )}

          {/* Price */}
          {priceField !== 'none' && selectedPrice !== undefined && (
            <div
              style={{
                fontSize: '11pt',
                fontWeight: 'bold',
                textAlign: 'center',
                marginTop: 'auto',
              }}
            >
              ${selectedPrice.toFixed(2)}
              {priceField === 'cost' && (
                <span style={{ fontSize: '6pt', color: '#999', marginLeft: '2mm' }}>COST</span>
              )}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

/**
 * Print-ready wrapper for extended labels
 * Optimized for both standard printers and thermal printers (XP-200B)
 */
export const BarcodeLabel2Sheet = React.forwardRef<
  HTMLDivElement,
  { labels: BarcodeLabel2Props[] }
>(({ labels }, ref) => {
  return (
    <>
      {/* Thermal Printer CSS */}
      <style>{`
        @media print {
          @page {
            size: 58mm auto;
            margin: 0;
          }
          
          body {
            margin: 0 !important;
            padding: 0 !important;
          }
          
          .thermal-label-container {
            width: 100% !important;
            max-width: 58mm !important;
            margin: 0 !important;
            padding: 0 !important;
            display: block !important;
          }
          
          .barcode-label-extended {
            width: 56mm !important;
            margin: 0 auto 2mm auto !important;
            padding: 2mm !important;
            border: none !important;
            background: white !important;
            page-break-inside: avoid !important;
          }
          
          /* Ensure black barcodes on white */
          svg {
            background: white !important;
          }
          
          svg rect[fill="#000000"],
          svg rect[fill="#000"],
          svg rect[fill="black"] {
            fill: #000 !important;
          }
          
          svg path,
          svg line {
            stroke: #000 !important;
            fill: #000 !important;
          }
        }
        
        @media screen {
          .thermal-label-container {
            display: grid;
            grid-template-columns: repeat(3, 50mm);
            gap: 2mm;
            padding: 10mm;
            background: white;
          }
        }
      `}</style>
      
      <div ref={ref} className="thermal-label-container">
        {labels.map((label, index) => (
          <BarcodeLabel2 key={index} {...label} />
        ))}
      </div>
    </>
  );
});

BarcodeLabel2Sheet.displayName = 'BarcodeLabel2Sheet';
