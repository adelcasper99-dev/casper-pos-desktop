# plan: Hide Purchasing Unit and Packaging (العبوة) Columns

This plan outlines the steps to temporarily hide the "الوحدة" (Unit) and "العبوة" (Package Factor / conversionFactor) columns from the Purchasing Data Grid UI. This will simplify data entry, automatically defaulting units to `"قطعة"` and the conversion factor to `1`, while maintaining full backend and database compatibility.

## User Review Required

> [!IMPORTANT]
> - **Default Behaviors:** Hiding these columns means new items added via the purchase invoice will automatically default to `"قطعة"` as their unit, and `1` as their conversion factor.
> - **Reversibility:** The columns are being hidden at the UI level only; all logic remains fully compatible. They can be restored in the future by adding them back to the grid template and list of visible columns.
> - **Keyboard Navigation:** The Enter/Tab keyboard navigation flow is updated to transition directly from the **الوصف (الصفة)** (Attribute) column to the **الكمية** (Quantity) column, skipping the hidden fields entirely.

---

## Proposed Changes

### Purchasing Component

#### [MODIFY] [PurchaseDataGrid.tsx](file:///f:/casper%20desktop/casper-pos-desktop/src/components/inventory/purchasing/PurchaseDataGrid.tsx)

1. **Remove `"unit"` and `"conversionFactor"` from `ALL_EDITABLE_COLS`** (L103):
   ```ts
   const ALL_EDITABLE_COLS = [
       "itemCode",
       "categoryId",
       "modelId",
       "attributeId",
       "itemName",
       "quantity",
       "unitPrice",
       "sellPrice",
       "sellPrice2",
       "sellPrice3"
   ] as const;
   ```
2. **Update Keyboard Transition Skipping Rules:**
   Remove references to `conversionFactor` skip logic in `nextEditableCol` and `prevEditableCol` as it's no longer in the editable columns array.
3. **Hide Columns from Layout Widths (`DEFAULT_WIDTHS`):**
   Remove the widths `60` (unit) and `60` (conversionFactor) from `DEFAULT_WIDTHS` (L179).
4. **Remove Columns from Header Labels:**
   - Remove `"الوحدة"` and `"العبوة"` from the header labels array on line 1842.
   - Adjust `colMap` and `headerLabels` inside the `autoFitColumn` utility function (L1320) to reflect the new column indices.
5. **Update Dropdown OnChange Focus Transitions:**
   Inside `AttributeDropdown` onChange and onQuickCreate callbacks, update:
   - `setTimeout(() => focusInput(rowIdx, "unit"), 50);`
   - To: `setTimeout(() => focusInput(rowIdx, "quantity"), 50);`
6. **Omit Cell Renders in Grid Rows:**
   Completely remove the rendering of `<UnitDropdown>` and `<CellInput>` (conversionFactor) cell divs in the grid row mapping.

---

## Verification Plan

### Automated Tests
- Run TypeScript compilation validation:
  ```bash
  npx tsc --noEmit
  ```
- Run decimal precision tests:
  ```bash
  npx vitest run src/__tests__/decimal-precision.test.ts
  ```

### Manual Verification
1. Open the **New Purchase Invoice** screen.
2. Verify that the columns `"الوحدة"` (Unit) and `"العبوة"` (Package) are no longer visible.
3. Enter a code, select category/model/attribute.
4. Press **Enter** on the attribute field and verify that focus moves directly to **الكمية** (Quantity).
5. Complete entering a row and verify that total calculations function correctly (multiplying quantity by unit cost).
6. Save the invoice and confirm it persists to the database with a default unit of `"قطعة"` and conversion factor `1`.
