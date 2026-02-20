"use client";

import React, { useEffect, useState } from 'react';
import { X, Printer, CheckCircle, AlertCircle, Download, Globe } from 'lucide-react';
import { printService } from '@/lib/print-service';
import { type LabelTemplate, migrateTemplate } from '@/lib/label-commands';
import { getEffectiveStoreSettings } from '@/actions/settings';
import { useTranslations } from '@/lib/i18n-mock';
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
  const t = useTranslations('Inventory.labels');
  const tCommon = useTranslations('Common');

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
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-zinc-900 rounded-xl border border-white/10 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl" dir="rtl">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-white/10 bg-zinc-800/50">
            <div>
              <h2 className="text-2xl font-bold text-white">{t('printTitle')}</h2>
              <p className="text-sm text-zinc-400 mt-1">
                {t('labelsCount', { products: products.length, labels: totalLabels })}
              </p>
            </div>

            <div className="flex items-center gap-4">
              {/* QZ Tray Status Indicator */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-950/50 rounded-full border border-white/5">
                {qzStatus === 'online' && (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-xs font-bold text-green-500">{t('qzOnline')}</span>
                  </>
                )}
                {qzStatus === 'offline' && (
                  <>
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span className="text-xs font-bold text-red-500">{t('qzOffline')}</span>
                  </>
                )}
                {qzStatus === 'checking' && (
                  <span className="text-xs text-zinc-400">{tCommon('loading') || 'Checking...'}</span>
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
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Right: Editable Fields (Arabic RTL - Right side) */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <span className="w-2 h-6 bg-cyan-500 rounded-full" />
                  {t('editContent')}
                </h3>
                {products.map((product) => (
                  <div
                    key={product.id}
                    className="bg-white/5 rounded-xl p-5 border border-white/10 space-y-4 hover:bg-white/10 transition-colors"
                  >
                    <div className="flex flex-col gap-4">
                      {/* Editable Product Name */}
                      <div>
                        <label className="text-xs font-bold text-zinc-400 mb-1.5 block uppercase tracking-wider">{t('productName')}</label>
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
                          className="w-full px-4 py-2.5 bg-zinc-800 border border-white/10 rounded-xl text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none transition-all"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        {/* Editable SKU */}
                        <div>
                          <label className="text-xs font-bold text-zinc-400 mb-1.5 block uppercase tracking-wider">{t('skuBarcode')}</label>
                          <input
                            type="text"
                            dir="ltr"
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
                            className="w-full px-4 py-2.5 bg-zinc-800 border border-white/10 rounded-xl text-white font-mono text-center focus:ring-2 focus:ring-cyan-500 focus:outline-none transition-all"
                          />
                        </div>

                        {/* Editable Price */}
                        <div>
                          <label className="text-xs font-bold text-zinc-400 mb-1.5 block uppercase tracking-wider">{t('price')}</label>
                          <input
                            type="number"
                            step="0.01"
                            dir="ltr"
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
                            className="w-full px-4 py-2.5 bg-zinc-800 border border-white/10 rounded-xl text-white text-center focus:ring-2 focus:ring-cyan-500 focus:outline-none transition-all"
                          />
                        </div>
                      </div>

                      {/* Quantity Selector */}
                      <div className="flex items-center justify-between gap-4 pt-2 border-t border-white/5">
                        <label className="text-sm font-bold text-zinc-300">{t('qty')}</label>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setQuantities(prev => ({ ...prev, [product.id]: Math.max(1, prev[product.id] - 1) }))}
                            className="w-10 h-10 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white flex items-center justify-center font-bold"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            max="500"
                            dir="ltr"
                            value={quantities[product.id]}
                            onChange={(e) =>
                              setQuantities((prev) => ({
                                ...prev,
                                [product.id]: Math.max(1, parseInt(e.target.value) || 1),
                              }))
                            }
                            className="w-16 h-10 bg-zinc-800 border border-white/10 rounded-lg text-white text-center font-bold focus:ring-2 focus:ring-cyan-500 focus:outline-none transition-all"
                          />
                          <button
                            onClick={() => setQuantities(prev => ({ ...prev, [product.id]: prev[product.id] + 1 }))}
                            className="w-10 h-10 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white flex items-center justify-center font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Left: Live Preview (Arabic RTL - Left side) */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <span className="w-2 h-6 bg-cyan-500 rounded-full" />
                  {t('previewTitle')}
                </h3>
                <div className="bg-zinc-950/50 rounded-2xl p-8 border border-white/10 flex items-center justify-center min-h-[400px]">
                  <div className="space-y-8">
                    {products.map((product) => (
                      <div key={product.id} className="bg-white rounded-lg p-1 border-4 border-zinc-400 overflow-hidden shadow-2xl relative" style={{ width: '250px', height: '130px' }}>
                        {/* Preview of 58mm x 30mm label (scaled for screen) */}
                        <div className="flex h-full text-black" dir="rtl">
                          {/* Right Side: SKU (Vertical) for RTL */}
                          <div className="w-[15%] h-full flex items-center justify-center border-l border-black ml-1 bg-gray-50">
                            <div
                              className="text-[10px] font-bold whitespace-nowrap text-zinc-800 font-mono"
                              style={{ writingMode: 'vertical-rl', transform: 'rotate(0deg)' }}
                            >
                              {editableData[product.id]?.sku || product.sku}
                            </div>
                          </div>

                          {/* Left Side: Content */}
                          <div className="flex-1 flex flex-col items-center justify-start h-full pt-1 overflow-hidden">
                            {/* Store Name */}
                            <div className="text-[10px] font-bold text-center leading-none mb-1 w-full truncate px-1 uppercase tracking-tight">
                              {storeName}
                            </div>

                            {/* Barcode */}
                            <div className="flex justify-center mb-1 scale-110">
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
                            <div className="text-[11px] font-bold text-center leading-tight line-clamp-2 px-1 mb-1 h-8 flex items-center justify-center">
                              {(editableData[product.id]?.name || product.name)}
                            </div>

                            {/* Price */}
                            <div className="text-[14px] font-black leading-tight text-cyan-700 bg-cyan-50 px-3 rounded-full border border-cyan-100">
                              LE {(editableData[product.id]?.price ?? product.sellPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="bg-cyan-500/5 p-4 rounded-xl border border-cyan-500/10 max-w-[250px]">
                      <p className="text-xs text-zinc-400 text-center leading-relaxed">
                        {t('previewNote')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="p-6 border-t border-white/10 space-y-4 bg-zinc-800/50">
            {/* Print Method Selection */}
            <div className="flex items-center gap-6 pb-4 border-b border-white/5">
              <span className="text-sm font-bold text-zinc-400 uppercase tracking-widest">{t('printMethod')}</span>
              <div className="flex gap-3">
                <button
                  onClick={() => setPrintMethod('browser')}
                  className={`px-6 py-2.5 rounded-xl flex items-center gap-3 transition-all font-bold ${printMethod === 'browser'
                    ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20 active:scale-95'
                    : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                    }`}
                >
                  <Globe className="w-5 h-5" />
                  {t('browserPrint')}
                </button>
                <button
                  onClick={() => setPrintMethod('qz')}
                  className={`px-6 py-2.5 rounded-xl flex items-center gap-3 transition-all font-bold ${printMethod === 'qz'
                    ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20 active:scale-95'
                    : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                    }`}
                >
                  <Printer className="w-5 h-5" />
                  {t('qzTrayPrint')}
                  {qzStatus === 'offline' && <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full ml-1">OFFLINE</span>}
                </button>
              </div>
            </div>

            {/* Print Action Buttons */}
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                {printMethod === 'browser'
                  ? t('browserPrintNote')
                  : t('qzPrintNote')
                }
              </div>

              <div className="flex items-center gap-4">
                <button
                  onClick={onClose}
                  className="px-6 py-3 bg-zinc-700 hover:bg-zinc-600 text-white font-bold rounded-xl transition-all active:scale-95"
                >
                  {tCommon('cancel') || 'إلغاء'}
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
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] backdrop-blur-md p-4">
          <div className="bg-zinc-900 rounded-2xl border border-white/10 w-full max-w-md p-8 shadow-3xl text-center" dir="rtl">
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-12 h-12 text-red-500 flex-shrink-0" />
            </div>

            <h3 className="text-2xl font-bold text-white mb-3">{t('qzNotRunningTitle')}</h3>
            <p className="text-zinc-400 mb-8 leading-relaxed">
              {t('qzNotRunningDesc')}
            </p>

            <div className="bg-white/5 rounded-2xl p-5 mb-8 border border-white/5 group hover:border-cyan-500/30 transition-all">
              <a
                href="https://qz.io/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-3 text-cyan-400 hover:text-cyan-300 text-base font-bold"
              >
                <Download className="w-5 h-5" />
                {t('qzDownload')}
              </a>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setShowQzModal(false)}
                className="flex-1 px-6 py-3 bg-zinc-700 hover:bg-zinc-600 text-white font-bold rounded-xl transition-all active:scale-95"
              >
                {tCommon('cancel') || 'إلغاء'}
              </button>
              <button
                onClick={() => {
                  setShowQzModal(false);
                  checkQzTrayStatus();
                }}
                className="flex-1 px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-black font-bold rounded-xl shadow-lg shadow-cyan-500/20 transition-all active:scale-95"
              >
                {t('retryConnection')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
