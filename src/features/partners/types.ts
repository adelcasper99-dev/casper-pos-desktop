import { Partner } from "@prisma/client";

export interface PartnerWithBalances extends Omit<Partner, "profitShare"> {
    profitShare: number;
    capitalBalance: number;
    currentBalance: number;
}
