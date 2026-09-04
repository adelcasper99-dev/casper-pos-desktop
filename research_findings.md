# High-Density ERP & POS Inventory Data Grid Best Practices (Stage 0b Research)

## 1. Single-Viewport High-Volume Inventory Grid Architecture (Odoo / Toast / SAP Fiori)
- **Problem**: Inventory management systems with default web table padding (`px-6 py-4`) display only 3-4 products per 1080p desktop screen. Warehousing and retail managers cannot scan stock levels or spot low-inventory items effectively, causing severe visual fatigue and excessive scroll navigation.
- **Industry Standard**:
  - High-density row height target: **30px - 34px** with `px-3 py-1.5` cell padding.
  - Viewport-contained table container: `max-h-[calc(100vh-270px)] overflow-y-auto custom-scrollbar` allowing 12-16 items visible simultaneously on a standard 1080p desktop.
  - Pinned table header: `sticky top-0 z-20 bg-zinc-100/95 dark:bg-zinc-900/95 backdrop-blur-xs` preserving SKU, stock, and price column alignment at all times.

## 2. Multi-Tier Filter & Action Bar Ergonomics (Linear / Shopify Admin)
- **Problem**: Multi-level filter toolbars (Search, Category dropdown, Warehouse selector, Stock status, Date ranges, Add product, Template download) take up 3 vertical rows (>120px) when uncompacted, pushing table data below the fold.
- **Industry Standard**:
  - Compact search bar: `h-8 ps-9 pe-8 text-xs font-medium rounded-lg` with 14px search icon.
  - Clustered micro-actions: `h-8 px-3 text-xs font-bold rounded-lg` with subtle hover elevations.
  - Dropdown triggers: Standardized `h-7.5 px-2.5 text-xs font-bold rounded-lg border border-zinc-200/80 dark:border-white/10`.
  - Date quick buttons: Micro pills `h-7 px-2 text-[10px]` with flatpickr inline container.

## 3. Financial & Numeric Alignment in Multi-Price Retail Grids
- **Problem**: Products with multiple price tiers (Cost Price, Wholesale Price 1, Retail Price 2, Special Price 3) easily wrap decimals and currency symbols when column widths fluctuate.
- **Industry Standard**:
  - Right-aligned monetary values with tabular figures: `text-end font-mono font-bold text-xs tabular-nums whitespace-nowrap`.
  - Stock quantity highlighting: `font-mono font-black text-xs tabular-nums`, with color tokens:
    - Normal stock: `text-zinc-900 dark:text-white`
    - Shortage/Low stock (`stock <= minStock`): `text-rose-500 font-bold`
    - Service items (non-tracked): micro pill `h-5 px-1.5 text-[9px] font-bold text-cyan-600 bg-cyan-500/10`.

## 4. Concurrency & Action Safety in POS Desktop
- Retain all server action bindings (`deleteProduct`, `updateProduct`, `generateNextSku`, `generateInventoryTemplate`).
- Preserve CSRF tokens and TanStack Query refetch lifecycle without triggering unnecessary re-renders.
- Strict TypeScript: No `any` types; Decimal.js / numeric string sanitization.
