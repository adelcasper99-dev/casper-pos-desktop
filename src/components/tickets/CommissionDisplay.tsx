'use client';

interface CommissionDisplayProps {
    repairPrice: number;
    partsCost: number;
    commissionRate: number;
    commissionAmount: number;
    technicianName?: string;
}

export function CommissionDisplay({
    repairPrice,
    partsCost,
    commissionRate,
    commissionAmount,
    technicianName
}: CommissionDisplayProps) {
    const netProfit = repairPrice - partsCost;

    if (commissionAmount === 0) {
        return null; // Don't show if no commission
    }

    return (
        <div className="commission-section p-4 border rounded-lg bg-card">
            <h4 className="font-semibold mb-3 flex items-center gap-2">
                <span className="text-primary">💰</span>
                Commission Breakdown
            </h4>

            <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                    <span className="text-muted-foreground">Repair Price:</span>
                    <span className="font-medium">SAR {repairPrice.toFixed(2)}</span>
                </div>

                <div className="flex justify-between">
                    <span className="text-muted-foreground">Parts Cost:</span>
                    <span className="font-medium">- SAR {partsCost.toFixed(2)}</span>
                </div>

                <div className="flex justify-between pt-2 border-t">
                    <span className="font-medium">Net Profit:</span>
                    <span className="font-semibold">SAR {netProfit.toFixed(2)}</span>
                </div>

                <div className="flex justify-between">
                    <span className="text-muted-foreground">Commission Rate:</span>
                    <span className="font-medium">{commissionRate}%</span>
                </div>

                <div className="flex justify-between pt-2 border-t bg-primary/5 -mx-4 px-4 py-2 rounded">
                    <span className="font-semibold">Commission Earned:</span>
                    <span className="text-lg font-bold text-primary">SAR {commissionAmount.toFixed(2)}</span>
                </div>

                {technicianName && (
                    <div className="pt-2 text-xs text-muted-foreground">
                        Paid to: {technicianName}
                    </div>
                )}
            </div>
        </div>
    );
}
