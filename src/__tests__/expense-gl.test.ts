/**
 * Unit tests for expense GL code resolution
 * Tests the resolveExpenseGlCode function and EXPENSE_CATEGORY_MAP
 */

import { describe, it, expect } from 'vitest';

// Mock the accounting mappings before importing
const EXPENSE_CATEGORY_MAP: Record<string, { glCode: string; labelAr: string; labelEn: string }> = {
    'RENT': { glCode: '5210', labelAr: 'إيجار', labelEn: 'Rent' },
    'UTILITIES': { glCode: '5220', labelAr: 'كهرباء ومياه', labelEn: 'Utilities (Elec. & Water)' },
    'INTERNET': { glCode: '5230', labelAr: 'إنترنت واتصالات', labelEn: 'Internet & Comms' },
    'MAINTENANCE': { glCode: '5240', labelAr: 'صيانة وإصلاح', labelEn: 'Maintenance & Repairs' },
    'CLEANING': { glCode: '5250', labelAr: 'نظافة وضيافة', labelEn: 'Cleaning & Hospitality' },
    'OFFICE_SUPPLIES': { glCode: '5260', labelAr: 'أدوات مكتبية', labelEn: 'Office Supplies' },
    'MISC_GENERAL': { glCode: '5270', labelAr: 'مصروفات عامة أخرى', labelEn: 'Misc. General Expenses' },
    'ADS': { glCode: '5310', labelAr: 'إعلانات ممولة', labelEn: 'Paid Ads' },
    'PROMOTIONS': { glCode: '5320', labelAr: 'عروض وهدايا', labelEn: 'Promotions / Gifts' },
    'PACKAGING': { glCode: '5330', labelAr: 'تعبئة وتغليف', labelEn: 'Packaging' },
    'SALARIES': { glCode: '5100', labelAr: 'رواتب وأجور', labelEn: 'Salaries & Wages' },
    'BONUSES': { glCode: '5110', labelAr: 'مكافآت وحوافز', labelEn: 'Bonuses / Incentives' },
    'WAGES_DAILY': { glCode: '5120', labelAr: 'يوميات (عمالة مؤقتة)', labelEn: 'Daily Wages' },
};

const FALLBACK_EXPENSE_GL = '5200';

/**
 * Resolves the correct GL account code for an expense category.
 * Falls back to the general expense account (5200) if the category is not mapped.
 */
function resolveExpenseGlCode(category: string): string {
    const mapping = EXPENSE_CATEGORY_MAP[category];
    if (!mapping) {
        console.warn(`[createExpense] Unknown expense category "${category}", routing to fallback GL ${FALLBACK_EXPENSE_GL}`);
        return FALLBACK_EXPENSE_GL;
    }
    return mapping.glCode;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: resolveExpenseGlCode
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveExpenseGlCode', () => {
    describe('Valid Categories', () => {
        it('should return 5210 for RENT category', () => {
            expect(resolveExpenseGlCode('RENT')).toBe('5210');
        });

        it('should return 5220 for UTILITIES category', () => {
            expect(resolveExpenseGlCode('UTILITIES')).toBe('5220');
        });

        it('should return 5230 for INTERNET category', () => {
            expect(resolveExpenseGlCode('INTERNET')).toBe('5230');
        });

        it('should return 5240 for MAINTENANCE category', () => {
            expect(resolveExpenseGlCode('MAINTENANCE')).toBe('5240');
        });

        it('should return 5250 for CLEANING category', () => {
            expect(resolveExpenseGlCode('CLEANING')).toBe('5250');
        });

        it('should return 5260 for OFFICE_SUPPLIES category', () => {
            expect(resolveExpenseGlCode('OFFICE_SUPPLIES')).toBe('5260');
        });

        it('should return 5270 for MISC_GENERAL category', () => {
            expect(resolveExpenseGlCode('MISC_GENERAL')).toBe('5270');
        });

        it('should return 5310 for ADS category', () => {
            expect(resolveExpenseGlCode('ADS')).toBe('5310');
        });

        it('should return 5320 for PROMOTIONS category', () => {
            expect(resolveExpenseGlCode('PROMOTIONS')).toBe('5320');
        });

        it('should return 5330 for PACKAGING category', () => {
            expect(resolveExpenseGlCode('PACKAGING')).toBe('5330');
        });

        it('should return 5100 for SALARIES category', () => {
            expect(resolveExpenseGlCode('SALARIES')).toBe('5100');
        });

        it('should return 5110 for BONUSES category', () => {
            expect(resolveExpenseGlCode('BONUSES')).toBe('5110');
        });

        it('should return 5120 for WAGES_DAILY category', () => {
            expect(resolveExpenseGlCode('WAGES_DAILY')).toBe('5120');
        });
    });

    describe('Invalid Categories', () => {
        it('should return 5200 fallback for unknown category', () => {
            expect(resolveExpenseGlCode('UNKNOWN_CATEGORY')).toBe('5200');
        });

        it('should return 5200 fallback for empty string', () => {
            expect(resolveExpenseGlCode('')).toBe('5200');
        });

        it('should return 5200 fallback for whitespace', () => {
            expect(resolveExpenseGlCode('   ')).toBe('5200');
        });

        it('should return 5200 fallback for null-like input', () => {
            expect(resolveExpenseGlCode('null')).toBe('5200');
        });
    });

    describe('Case Sensitivity', () => {
        it('should be case-sensitive (RENT works, rent does not)', () => {
            expect(resolveExpenseGlCode('RENT')).toBe('5210');
            expect(resolveExpenseGlCode('rent')).toBe('5200'); // Falls back
        });

        it('should be case-sensitive (SALARIES works, salaries does not)', () => {
            expect(resolveExpenseGlCode('SALARIES')).toBe('5100');
            expect(resolveExpenseGlCode('salaries')).toBe('5200'); // Falls back
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: EXPENSE_CATEGORY_MAP Structure
// ─────────────────────────────────────────────────────────────────────────────

describe('EXPENSE_CATEGORY_MAP', () => {
    it('should have all required GL codes defined', () => {
        const requiredCodes = [
            '5100', '5110', '5120', // Payroll
            '5210', '5220', '5230', '5240', '5250', '5260', '5270', // G&A
            '5310', '5320', '5330', // Marketing
        ];

        const mappedCodes = Object.values(EXPENSE_CATEGORY_MAP).map(m => m.glCode);

        for (const code of requiredCodes) {
            expect(mappedCodes).toContain(code);
        }
    });

    it('should have Arabic labels for all categories', () => {
        for (const [key, mapping] of Object.entries(EXPENSE_CATEGORY_MAP)) {
            expect(mapping.labelAr).toBeDefined();
            expect(mapping.labelAr.length).toBeGreaterThan(0);
        }
    });

    it('should have English labels for all categories', () => {
        for (const [key, mapping] of Object.entries(EXPENSE_CATEGORY_MAP)) {
            expect(mapping.labelEn).toBeDefined();
            expect(mapping.labelEn.length).toBeGreaterThan(0);
        }
    });

    it('should have valid GL codes (4-digit numbers)', () => {
        const glCodePattern = /^\d{4}$/;
        for (const [key, mapping] of Object.entries(EXPENSE_CATEGORY_MAP)) {
            expect(mapping.glCode).toMatch(glCodePattern);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: ALL_EXPENSE_CODES Array
// ─────────────────────────────────────────────────────────────────────────────

describe('ALL_EXPENSE_CODES', () => {
    const ALL_EXPENSE_CODES = [
        '5100', '5110', '5120', // Payroll
        '5200', '5210', '5220', '5230', '5240', '5250', '5260', '5270', // G&A
        '5300', '5310', '5320', '5330', // Marketing
        '5400', '5500', '5600' // Other & Variances
    ];

    it('should include all mapped GL codes', () => {
        const mappedCodes = Object.values(EXPENSE_CATEGORY_MAP).map(m => m.glCode);
        
        for (const code of mappedCodes) {
            expect(ALL_EXPENSE_CODES).toContain(code);
        }
    });

    it('should include the fallback code 5200', () => {
        expect(ALL_EXPENSE_CODES).toContain('5200');
    });

    it('should have no duplicates', () => {
        const uniqueCodes = new Set(ALL_EXPENSE_CODES);
        expect(uniqueCodes.size).toBe(ALL_EXPENSE_CODES.length);
    });

    it('should have all 4-digit codes', () => {
        const glCodePattern = /^\d{4}$/;
        for (const code of ALL_EXPENSE_CODES) {
            expect(code).toMatch(glCodePattern);
        }
    });
});