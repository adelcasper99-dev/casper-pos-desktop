export type PayrollRuleType = "DEDUCTION" | "ADDITION";
export type PayrollRuleUnit = "FIXED" | "DAILY_FRACTION" | "HOURLY_MULTIPLIER";
export type PayrollStatus = "DRAFT" | "PAID";

export interface PayrollSettings {
    id: string;
    roleName: string;
    baseSalary: number;
    workingDays: number;
    workingHours: number;
    rules: PayrollRule[];
}

export interface PayrollRule {
    id: string;
    payrollSettingsId: string;
    name: string;
    type: PayrollRuleType;
    condition: string;
    amount: number;
    unit: PayrollRuleUnit;
    isActive: boolean;
}

export interface PayrollEntry {
    id: string;
    userId: string;
    userName?: string; // Hydrated for UI
    userRole?: string; // Hydrated for UI
    periodStart: Date;
    periodEnd: Date;
    baseSalary: number;
    finalSalary: number;
    totalAdditions: number;
    totalDeductions: number;
    details: PayrollCalculationDetail[]; // Stored as JSON string in DB, parsed here
    status: PayrollStatus;
    paidAt?: Date;
    createdAt: Date;
    stats?: {
        lateDays: number;
        absentDays: number;
        totalManualBonus: number;
        totalManualDeduction: number;
    };
    commission?: number; // 🆕 Added for UI display
}

export interface PayrollCalculationDetail {
    name: string;
    type: PayrollRuleType;
    amount: number;
    rate: string;
    multiplier?: number; // e.g., 2 days or 5 hours
    unit?: string;
}

export interface Employee {
    id: string;
    name: string;
    role: string;
    // Dynamic fields for calculation inputs
    lateMinutes: number;
    lateDays?: number; // Count of late arrivals
    absentDays: number;
    offDays: number;
    extraOffDays: number;
    leaveDays: number;
    overtimeHours: number;
    bonus: number;
    deduct: number;
    manualDeduction: number;
    manualBonus: number;
    salary?: number;
    avatarSeed?: string;
    branch?: string;
    totalCommissionEarned?: number; // 🆕 Input for calculator
}
