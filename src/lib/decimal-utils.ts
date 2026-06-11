import { Decimal } from 'decimal.js';

/**
 * Safely converts any numeric value (number, string, or Decimal) to a Prisma Decimal.
 * This handles "Serialization Ghosts" — objects that look like Decimals but lost their 
 * prototype methods during transit through Server Actions or JSON serialization.
 */
export function toDecimal(val: any): Decimal {
    if (val === null || val === undefined || val === '' || String(val).trim() === '') return new Decimal(0);
    
    // Proper Decimal instance
    if (val instanceof Decimal) return val;
    
    // If it's a "Ghost" Decimal (has properties but no methods)
    if (val && typeof val === 'object' && 's' in val && 'e' in val && 'd' in val) {
        try {
            return new Decimal(val.toString ? val.toString() : String(val));
        } catch (e) {
            console.error("Failed to convert Decimal Ghost:", val, e);
        }
    }
    
    try {
        return new Decimal(String(val));
    } catch (e) {
        console.error("Failed to convert value to Decimal:", val, e);
        return new Decimal(0);
    }
}

/**
 * Safely converts any value to a primitive number for use in UI or non-financial logic.
 */
export function toNumber(val: any): number {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    
    if (val && typeof val === 'object' && typeof val.toNumber === 'function') {
        return val.toNumber();
    }
    
    const num = Number(val);
    return isNaN(num) ? 0 : num;
}
