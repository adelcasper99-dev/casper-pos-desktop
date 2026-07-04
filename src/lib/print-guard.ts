import { PrintSettingsSchema, type PrintSettings } from '../types/ipc-schemas';

export type PrintContext = 'ticket' | 'invoice' | 'receipt' | 'report';

/**
 * Evaluates whether the system is authorized to automatically print a document
 * based on the current global settings and the context.
 * 
 * @param settings The global app settings object (from context or database)
 * @param context The type of document being printed (default: 'ticket')
 * @returns boolean indicating if auto-print is allowed
 */
export const shouldAutoPrint = (settings: PrintSettings | null | undefined, context: PrintContext = 'ticket'): boolean => {
  if (!settings) {
    return false;
  }

  const parsed = PrintSettingsSchema.safeParse(settings);
  if (!parsed.success) {
    console.warn('[print-guard] Malformed settings object - defaulting to no auto-print', parsed.error);
    return false;
  }

  const validatedSettings = parsed.data;

  switch (context) {
    case 'ticket':
      return validatedSettings.autoPrintTicket === true;
      
    // Add additional contexts here as needed
    // case 'invoice':
    //   return settings.autoPrintInvoice === true;
      
    default:
      return false;
  }
};
