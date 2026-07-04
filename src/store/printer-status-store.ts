import { create } from 'zustand';
import { printService } from '@/lib/print-service';

export type PrinterStatusStateName = 'UNKNOWN' | 'ONLINE' | 'PRINTING' | 'ERROR_OFFLINE' | 'ERROR_NO_PAPER' | 'FAILED_PERMANENT' | 'RECONNECTING';

export interface QueueCounts {
  pending: number;
  processing: number;
  failed: number;
}

interface PrinterStatusState {
  status: PrinterStatusStateName;
  printerName: string | null;
  printersList: string[];
  queueCounts: QueueCounts;
  lastChecked: number | null;
  
  setStatus: (status: PrinterStatusStateName) => void;
  setPrinterName: (name: string | null) => void;
  setQueueCounts: (counts: QueueCounts) => void;
  updateStatus: () => Promise<void>;
}

export const usePrinterStatusStore = create<PrinterStatusState>((set, get) => ({
  status: 'UNKNOWN',
  printerName: null,
  printersList: [],
  queueCounts: { pending: 0, processing: 0, failed: 0 },
  lastChecked: null,

  setStatus: (status) => set({ status }),
  setPrinterName: (name) => set({ printerName: name }),
  setQueueCounts: (counts) => set({ queueCounts: counts }),

  updateStatus: async () => {
    if (typeof window === 'undefined') return;

    try {
      const statusData = await printService.getStatus();
      
      const registry = printService.getRegistry();
      const currentPrinterName = registry?.thermalPrinter || registry?.receiptPrinter || localStorage.getItem('printer_receipt') || null;

      let currentQueue = get().queueCounts;
      if (window.electronAPI && window.electronAPI.printQueue) {
        const queueRes = await window.electronAPI.printQueue.getStatus();
        if (queueRes && queueRes.success && queueRes.data) {
          currentQueue = queueRes.data;
        }
      }

      let nextStatus: PrinterStatusStateName = 'ONLINE';
      if (!statusData.online) {
        nextStatus = 'ERROR_OFFLINE';
      } else if (currentQueue.failed > 0) {
        nextStatus = 'FAILED_PERMANENT';
      } else if (currentQueue.pending > 0 || currentQueue.processing > 0) {
        nextStatus = 'PRINTING';
      }

      set({
        status: nextStatus,
        printerName: currentPrinterName,
        printersList: statusData.printers || [],
        queueCounts: currentQueue,
        lastChecked: Date.now()
      });
    } catch (err) {
      console.warn('[PrinterStore] Failed to update printer status:', err);
      set({ status: 'ERROR_OFFLINE', lastChecked: Date.now() });
    }
  }
}));
