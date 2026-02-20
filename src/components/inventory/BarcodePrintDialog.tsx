"use client";

import React, { useEffect, useRef, useState } from 'react';
import { X, Printer, CheckCircle, AlertCircle, Download, Globe } from 'lucide-react';
import { printService } from '@/lib/print-service';
import { type LabelProduct, type LabelTemplate, migrateTemplate } from '@/lib/label-commands';
import { getEffectiveStoreSettings } from '@/actions/settings';
import { toast } from 'sonner';
import { ThermalPrintLabel } from './ThermalPrintLabel';
import Barcode from 'react-barcode';

interface Product {
  id: string;
  name: string;
  sku: string;
  sellPrice: number;
}

interface BarcodePrintDialogProps {
  products: Product[];
  onClose: () => void;
}

export function BarcodePrintDialog({ products, onClose }: BarcodePrintDialogProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>(
    products.reduce((acc, p) => ({ ...acc, [p.id]: 1 }), {})
  );

  // Editable label data
  const [editableData, setEditableData] = useState<Record<string, { name?: string; sku?: string; price?: number }>>({});

  // QZ Tray connection status
  const [qzStatus, setQzStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [showQzModal, setShowQzModal] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [storeName, setStoreName] = useState("CASPER POS");
  const [labelTemplate, setLabelTemplate] = useState<LabelTemplate | undefined>(undefined);

  // Print method selection
  const [printMethod, setPrintMethod] = useState<'browser' | 'qz'>('browser'); // Default to browser

  // Check QZ Tray status on mount
  useEffect(() => {
    checkQzTrayStatus();
    loadStoreSettings();
  }, []);

  const loadStoreSettings = async () => {
    try {
      const result = await getEffectiveStoreSettings();
      if (result?.data?.name) {
        setStoreName(result.data.name);
      }
      if (result?.data?.labelTemplate) {
        try {
          const tpl = typeof result.data.labelTemplate === 'string'
            ? JSON.parse(result.data.labelTemplate)
            : result.data.labelTemplate;
          setLabelTemplate(migrateTemplate(tpl)); // Ensure migration
        } catch (e) {
          console.error("Error parsing label template", e);
        }
      }
    } catch (error) {
      console.error("Failed to load store settings", error);
    }
  };

  const checkQzTrayStatus = async () => {
    setQzStatus('checking');
    try {
      const isOnline = await printService.isServerOnline();
      setQzStatus(isOnline ? 'online' : 'offline');
    } catch (error) {
      setQzStatus('offline');
    }
  };

  // handleQzPrint removed - handled by ThermalPrintLabel now

  const totalLabels = Object.values(quantities).reduce((sum, qty) => sum + qty, 0);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-zinc-900 rounded-xl border border-white/10 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-white/10">
            <div>
              <h2 className="text-2xl font-bold text-white">Print Barcode Labels</h2>
              <p className="text-sm text-zinc-400 mt-1">
                {products.length} product{products.length !== 1 ? 's' : ''} • {totalLabels} label{totalLabels !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="flex items-center gap-4">
              {/* QZ Tray Status Indicator */}
              <div className="flex items-center gap-2">
                {qzStatus === 'online' && (
                  <>
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="text-sm text-green-500">QZ Tray Online</span>
                  </>
                )}
                {qzStatus === 'offline' && (
                  <>
                    <AlertCircle className="w-5 h-5 text-red-500" />
                    <span className="text-sm text-red-500">QZ Tray Offline</span>
                  </>
                )}
                {qzStatus === 'checking' && (
                  <span className="text-sm text-zinc-400">Checking...</span>
                )}
              </div>

              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-6 h-6 text-zinc-400" />
              </button>
            </div>
          </div>

          {/* Product List with Quantities and Editable Fields */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: Editable Fields */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white mb-4">Edit Label Content</h3>
                {products.map((product) => (
                  <div
                    key={product.id}
                    className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        {/* Editable Product Name */}
                        <div>
                          <label className="text-xs text-zinc-400 mb-1 block">Product Name</label>
                          <input
                            type="text"
                            value={editableData[product.id]?.name || product.name}
                            onChange={(e) =>
                              setEditableData((prev) => ({
                                ...prev,
                                [product.id]: {
                                  ...prev[product.id],
                                  name: e.target.value,
                                },
                              }))
                            }
                            className="w-full px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-white"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          {/* Editable SKU */}
                          <div>
                            <label className="text-xs text-zinc-400 mb-1 block">SKU / Barcode</label>
                            <input
                              type="text"
                              value={editableData[product.id]?.sku || product.sku}
                              onChange={(e) =>
                                setEditableData((prev) => ({
                                  ...prev,
                                  [product.id]: {
                                    ...prev[product.id],
                                    sku: e.target.value,
                                  },
                                }))
                              }
                              className="w-full px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-white font-mono"
                            />
                          </div>

                          {/* Editable Price */}
                          <div>
                            <label className="text-xs text-zinc-400 mb-1 block">Price</label>
                            <input
                              type="number"
                              step="0.01"
                              value={editableData[product.id]?.price ?? product.sellPrice}
                              onChange={(e) =>
                                setEditableData((prev) => ({
                                  ...prev,
                                  [product.id]: {
                                    ...prev[product.id],
                                    price: parseFloat(e.target.value) || 0,
                                  },
                                }))
                              }
                              className="w-full px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-white"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Quantity Selector */}
                      <div className="flex items-center gap-3">
                        <label className="text-sm text-zinc-400">Qty:</label>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={quantities[product.id]}
                          onChange={(e) =>
                            setQuantities((prev) => ({
                              ...prev,
                              [product.id]: Math.max(1, parseInt(e.target.value) || 1),
                            }))
                          }
                          className="w-20 px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-white text-center"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Right: Live Preview */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white mb-4">Live Preview (Standard Layout)</h3>
                <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <div className="space-y-4">
                    {products.map((product) => (
                      <div key={product.id} className="bg-white rounded-lg p-1 border-2 border-zinc-300 overflow-hidden" style={{ width: '220px', height: '113px' }}>
                        {/* Preview of 58mm x 30mm label (scaled for screen) 
                            NOTE: This preview currently shows standard layout.
                            Ideally, we should reuse ThermalPrintLabel logic for preview or LabelDesigner preview.
                            For now, we keep the static preview but warn user if they have custom template.
                        */}
                        <div className="flex h-full text-black">
                          {/* Left Side: SKU (Vertical) */}
                          <div className="w-[15%] h-full flex items-center justify-center border-r border-black mr-1 bg-gray-50">
                            <div
                              className="text-[9px] font-bold whitespace-nowrap text-zinc-800"
                              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                            >
                              {editableData[product.id]?.sku || product.sku}
                            </div>
                          </div>

                          {/* Right Side: Store, Barcode, Name, Price */}
                          <div className="flex-1 flex flex-col items-center justify-start h-full pt-1">
                            {/* Store Name */}
                            <div className="text-[8px] font-bold text-center leading-none mb-1 w-full truncate px-1">
                              {storeName}
                            </div>

                            {/* Barcode */}
                            <div className="flex justify-center mb-1">
                              <Barcode
                                value={editableData[product.id]?.sku || product.sku}
                                width={1}
                                height={35}
                                fontSize={8}
                                margin={0}
                                displayValue={false}
                              />
                            </div>

                            {/* Product Name */}
                            <div className="text-[9px] font-bold text-center leading-tight line-clamp-2 px-1 mb-1">
                              {(editableData[product.id]?.name || product.name)}
                            </div>

                            {/* Price */}
                            <div className="text-[10px] font-extrabold leading-tight">
                              ${(editableData[product.id]?.price ?? product.sellPrice).toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-zinc-400 mt-2">
                      ℹ️ Note: If you have a custom label design saved, it will be used for printing instead of this preview.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="p-6 border-t border-white/10 space-y-4">
            {/* Print Method Selection */}
            <div className="flex items-center gap-4 pb-4 border-b border-white/10">
              <span className="text-sm text-zinc-400">Print Method:</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPrintMethod('browser')}
                  className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${printMethod === 'browser'
                    ? 'bg-cyan-500 text-black font-medium'
                    : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                    }`}
                >
                  <Globe className="w-4 h-4" />
                  Browser Print
                </button>
                <button
                  onClick={() => setPrintMethod('qz')}
                  className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${printMethod === 'qz'
                    ? 'bg-cyan-500 text-black font-medium'
                    : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                    }`}
                >
                  <Printer className="w-4 h-4" />
                  QZ Tray
                  {qzStatus === 'offline' && <span className="text-xs text-red-400">(Offline)</span>}
                </button>
              </div>
            </div>

            {/* Print Action Buttons */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-zinc-400">
                {printMethod === 'browser'
                  ? '🖨️ System Dialog: Set Margins to "None" for best results.'
                  : '🖨️ Direct thermal printing via QZ Tray'
                }
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>

                {printMethod === 'browser' ? (
                  <ThermalPrintLabel
                    storeName={storeName}
                    template={labelTemplate}
                    forceBrowser={true}
                    products={products.map(p => ({
                      sku: editableData[p.id]?.sku || p.sku,
                      name: editableData[p.id]?.name || p.name,
                      price: editableData[p.id]?.price ?? p.sellPrice,
                      quantity: quantities[p.id] || 1,
                    }))}
                  />
                ) : (
                  <ThermalPrintLabel
                    storeName={storeName}
                    template={labelTemplate}
                    forceBrowser={false} // Silent mode (Agent/QZ)
                    products={products.map(p => ({
                      sku: editableData[p.id]?.sku || p.sku,
                      name: editableData[p.id]?.name || p.name,
                      price: editableData[p.id]?.price ?? p.sellPrice,
                      quantity: quantities[p.id] || 1,
                    }))}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* QZ Tray Offline Modal */}
      {showQzModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]">
          <div className="bg-zinc-900 rounded-xl border border-white/10 w-full max-w-md p-6">
            <div className="flex items-start gap-4">
              <AlertCircle className="w-12 h-12 text-red-500 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-xl font-bold text-white mb-2">QZ Tray Not Running</h3>
                <p className="text-zinc-400 mb-4">
                  Please start the QZ Tray Printer Service to enable direct thermal printing.
                </p>

                <div className="bg-white/5 rounded-lg p-4 mb-4">
                  <p className="text-sm text-zinc-300 mb-2">Don't have QZ Tray installed?</p>
                  <a
                    href="https://qz.io/download/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 text-sm font-medium"
                  >
                    <Download className="w-4 h-4" />
                    Download QZ Tray
                  </a>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowQzModal(false)}
                    className="flex-1 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setShowQzModal(false);
                      checkQzTrayStatus();
                    }}
                    className="flex-1 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-black font-bold rounded-lg transition-colors"
                  >
                    Retry Connection
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
