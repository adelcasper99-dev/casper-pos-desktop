import { describe, it, expect } from 'vitest';
import { shouldAutoPrint } from '../lib/print-guard';

describe('shouldAutoPrint', () => {
  it('should return false when settings are null or undefined', () => {
    expect(shouldAutoPrint(null)).toBe(false);
    expect(shouldAutoPrint(undefined)).toBe(false);
  });

  it('should return true when autoPrintTicket is true', () => {
    expect(shouldAutoPrint({ autoPrintTicket: true }, 'ticket')).toBe(true);
  });

  it('should return false when autoPrintTicket is false', () => {
    expect(shouldAutoPrint({ autoPrintTicket: false }, 'ticket')).toBe(false);
  });

  it('should return false when settings are malformed', () => {
    // autoPrintTicket is string "yes", which is not a boolean, should fail validation
    expect(shouldAutoPrint({ autoPrintTicket: 'yes' as any }, 'ticket')).toBe(false);
  });

  it('should coerce string "true" or "1" to boolean true due to z.coerce.boolean()', () => {
    expect(shouldAutoPrint({ autoPrintTicket: 'true' as any }, 'ticket')).toBe(true);
    expect(shouldAutoPrint({ autoPrintTicket: '1' as any }, 'ticket')).toBe(true);
    expect(shouldAutoPrint({ autoPrintTicket: 1 as any }, 'ticket')).toBe(true);
  });

  it('should return false for unrecognized context', () => {
    expect(shouldAutoPrint({ autoPrintTicket: true }, 'invalid_context' as any)).toBe(false);
  });
});
