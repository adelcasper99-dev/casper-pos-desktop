"use client";

import { useEffect, useRef } from 'react';
import bwipjs from 'bwip-js';

interface PNGBarcodeProps {
  value: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
}

/**
 * PNG-based barcode component for thermal printer compatibility
 * Uses bwip-js to render barcode as canvas/image instead of SVG
 */
export function PNGBarcode({ 
  value, 
  width = 2, 
  height = 40, 
  displayValue = true 
}: PNGBarcodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    try {
      bwipjs.toCanvas(canvasRef.current, {
        bcid: 'code128',       // Barcode type
        text: value,            // Text to encode
        scale: width,           // Bar width multiplier
        height: height,         // Bar height in pixels
        includetext: displayValue, // Show text below barcode
        textxalign: 'center',   // Center text
        textsize: 10,           // Text size
      });
    } catch (e) {
      console.error('Barcode generation failed:', e);
    }
  }, [value, width, height, displayValue]);

  return (
    <canvas 
      ref={canvasRef}
      style={{
        display: 'block',
        margin: '0 auto',
      }}
    />
  );
}
