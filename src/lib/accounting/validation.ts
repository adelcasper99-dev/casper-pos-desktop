import { Decimal } from '@prisma/client/runtime/library';
import { TransactionLineInput } from './transaction-factory';

export interface ValidationResult {
    isValid: boolean;
    totalDebit: Decimal;
    totalCredit: Decimal;
    error?: string;
}

/**
 * Validates that a journal entry is perfectly balanced (Total Debits === Total Credits).
 * Uses Decimal.js to prevent JavaScript floating-point arithmetic errors.
 * 
 * @param lines Array of journal entry lines containing debit and credit values
 * @returns ValidationResult object containing boolean validity and computed totals
 */
export function validateDoubleEntryBalance(lines: TransactionLineInput[]): ValidationResult {
    const defaultDecimal = new Decimal(0);

    // Sum debits
    const totalDebit = lines.reduce(
        (sum, line) => sum.add(new Decimal(line.debit || 0)),
        defaultDecimal
    );

    // Sum credits
    const totalCredit = lines.reduce(
        (sum, line) => sum.add(new Decimal(line.credit || 0)),
        defaultDecimal
    );

    // Validate equality
    const isValid = totalDebit.equals(totalCredit);

    return {
        isValid,
        totalDebit,
        totalCredit,
        error: isValid ? undefined : `Unbalanced Transaction: Debits (${totalDebit.toFixed(2)}) ≠ Credits (${totalCredit.toFixed(2)})`
    };
}
