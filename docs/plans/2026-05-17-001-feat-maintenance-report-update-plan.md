---
title: "feat: Update Maintenance Profit Report"
type: "feat"
status: "active"
created: "2026-05-17"
---

# Update Maintenance Profit Report

We need to update the existing Maintenance Profit Report to include new financial KPIs and part/service aggregations as requested by the user.

## Requirements Traceability
- **Total Dues (إجمالي المستحقات):** Sum of the initial ticket costs (`initialQuote` / التكلفة المبدئية).
- **Total Paid (إجمالي المدفوع):** Sum of actual cash/card payments collected across tickets (excluding `ACCOUNT` payments).
- **Total Deferred (إجمالي الآجل):** Payments made using the `ACCOUNT` method (registered as a debt on the customer's account).
- **Labor Revenue (إجمالي الصيانة بدون قطع غيار أو خدمات):** The revenue generated strictly from labor/maintenance efforts, excluding the parts and services cost/revenue.
- **Engineer Profit (إجمالي ربح المهندسين):** The total commissions paid out to engineers (`totalCommissions`).
- **Center Profit (إجمالي ربح المركز):** The final net profit for the center (`totalNetProfit`).
- **Top Selling & Profitable Parts/Services (الأكثر مبيعاً والأكثر ربحاً كقطع غيار أو خدمات):** Aggregation of `TicketPart` entries to identify the most frequently used/sold parts and those yielding the highest profit.

## Gaps & Risks Analysis
> [!WARNING]
> - **Risk: Inaccurate "Paid" metrics due to missing data:** If a ticket was paid partially with CASH and partially with ACCOUNT, relying solely on `amountPaid` will blend real cash with deferred debt. We MUST query the `TicketPayment` or `RepairPayment` models (or inspect the ticket's payments array) to distinguish `ACCOUNT` from actual cash/card payments.
> - **Risk: Initial Quote vs Final Price:** If "إجمالي المستحقات" uses `initialQuote`, it might not match the final invoice value if the engineer changed the repair price later. We need to ensure we calculate the actual revenue for "Center Profit" using `finalCustomerPrice`, but display the "Dues" as the user requested.
> - **Gap: Database Query Load:** Extracting "Top Parts" requires iterating over `ticket.parts`. For a massive date range, pulling all nested relations might affect performance. We will optimize the Prisma query by only selecting necessary fields (`id`, `name`, `price`, `quantity`, `cost`).
> - **Success Ratio Logic:** The current success ratio counts "DELIVERED" and "PAID_DELIVERED" tickets vs overall closed tickets. We will retain this logic but ensure it accurately excludes cancelled tickets from the profit aggregations.

## UI / UX Considerations
> [!TIP]
> - **Visual Hierarchy:** The Dashboard will have 8-9 KPI cards now. We will use a responsive grid: `grid-cols-2 md:grid-cols-4 xl:grid-cols-4` (wrapping nicely) to prevent the cards from becoming too squeezed.
> - **Color Coding:** 
    - Total Paid: Emerald/Green (Positive Cashflow)
    - Total Deferred (الآجل): Amber/Orange (Pending Cash)
    - Total Dues: Cyan/Blue (Target)
> - **Top Parts Display:** We will add two sleek summary lists or small tables directly beneath the KPIs:
    1. **🏆 الأكثر مبيعاً (Top by Quantity)** - Shows Part Name and Total Qty.
    2. **💰 الأكثر ربحاً (Top by Profit)** - Shows Part Name and Total Profit.
    These will be styled with glassmorphism to match the existing dashboard aesthetic and will be fully reactive to the date/branch filters.

## Proposed Changes

### Backend: `src/actions/reports/maintenance.ts`

- **[MODIFY] `getMaintenanceProfitReport`**
  - **Include Payments Relation:** Add `payments: true` to the Prisma query for tickets to accurately identify `ACCOUNT` payments.
  - **Calculations per ticket:**
    - `ticketDues`: Use `initialQuote` (or fallback to `repairPrice` if empty). Add to `totalDues`.
    - `ticketDeferred`: Sum up amounts from `ticket.payments` where `method === 'ACCOUNT'`. Add to `totalDeferred`.
    - `ticketActualPaid`: Sum up amounts from `ticket.payments` where `method !== 'ACCOUNT'`. Add to `totalPaid`.
  - **Parts Aggregation:**
    - Loop over `ticket.parts` and populate `partsAggregation` map.
  - After mapping, sort `partsAggregation` to produce `topSellingParts` (by quantity) and `mostProfitableParts` (by profit).

### Frontend Components

- **[MODIFY] `src/components/reports/MaintenanceProfitKPIs.tsx`**
  - Update `KPIProps` to accept the new fields: `totalDues`, `totalPaid`, `totalDeferred`.
  - Add the new cards into the `kpis` array with appropriate icons and colors.

- **[NEW] `src/components/reports/MaintenanceTopParts.tsx`**
  - Create a new UI component displaying two columns: Top 5 Parts by Volume, Top 5 Parts by Profit.

- **[MODIFY] `src/app/(routes)/dashboard/reports/maintenance-profit/page.tsx`**
  - Import and place `<MaintenanceTopParts topParts={reportData.topParts} />` between the KPIs and the main table.

## Verification Plan

### Manual Verification
- Navigate to the Maintenance Profit report.
- Verify that `Total Paid + Total Deferred` logically aligns with the ticket revenues (taking into account partial payments).
- Test filtering by date: ensure Top Parts refresh instantly.
- Verify UI spacing and responsiveness on desktop and smaller screens.
