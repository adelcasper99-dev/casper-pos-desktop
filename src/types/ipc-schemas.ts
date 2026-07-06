import { z } from 'zod';

export const PrintStandardSchema = z.object({
  html: z.string().max(200000, 'HTML payload too large (max 200KB)'),
  printerName: z.string().min(1, 'Printer name is required'),
  options: z.any().optional(),
});

export const PrintThermalSchema = z.object({
  html: z.string().max(200000, 'HTML payload too large (max 200KB)'),
  printerName: z.string().min(1, 'Printer name is required'),
  paperWidthMm: z.number().int().min(40).max(300),
});

export const KickDrawerSchema = z.object({
  printerName: z.string().optional(),
});

export const CloudConfigSchema = z.object({
  enabled: z.boolean(),
  cloudUrl: z.string().url().or(z.literal('')),
  branchId: z.string(),
  syncSecret: z.string(),
});

export const NodeConfigSchema = z.object({
  nodeRole: z.string(),
  masterIp: z.string().or(z.literal('')),
});

const CoercedBoolean = z.preprocess((val) => {
  if (typeof val === 'string') {
    const lower = val.toLowerCase().trim();
    if (lower === 'true' || lower === '1') return true;
    if (lower === 'false' || lower === '0' || lower === '') return false;
    return val; // Let z.boolean() fail validation
  }
  if (typeof val === 'number') {
    if (val === 1) return true;
    if (val === 0) return false;
  }
  return val;
}, z.boolean());

export const PrintSettingsSchema = z.object({
  autoPrintTicket: CoercedBoolean,
  autoPrintInvoice: CoercedBoolean.optional(),
  autoPrintReport: CoercedBoolean.optional(),
  paperSize: z.enum(['58mm', '80mm']).optional(),
  thermalPrinter: z.string().optional(),
  labelPrinter: z.string().optional(),
  a4Printer: z.string().optional(),
  bridgeIpAddress: z.string().optional(),
});
export type PrintSettings = z.infer<typeof PrintSettingsSchema>;
