/**
 * Central Print Guard
 * 
 * Provides a single source of truth for authorization to auto-print.
 * Centralizing this logic prevents recurring bugs where different components
 * use different checks or fail to respect global settings.
 */

export type PrintContext = 'ticket' | 'invoice' | 'receipt' | 'report';

/**
 * Evaluates whether the system is authorized to automatically print a document
 * based on the current global settings and the context.
 * 
 * @param settings The global app settings object (from context or database)
 * @param context The type of document being printed (default: 'ticket')
 * @returns boolean indicating if auto-print is allowed
 */
export const shouldAutoPrint = (settings: any | null | undefined, context: PrintContext = 'ticket'): boolean => {
  if (!settings) {
    return false;
  }

  switch (context) {
    case 'ticket':
      // Ensure it explicitly strictly equals true
      return settings.autoPrintTicket === true;
      
    // Add additional contexts here as needed
    // case 'invoice':
    //   return settings.autoPrintInvoice === true;
      
    default:
      return false;
  }
};
