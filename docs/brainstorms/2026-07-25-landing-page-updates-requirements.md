# Requirements Document: Casper ERP Landing Page Enhancements

**Date**: 2026-07-25  
**Target File**: `landing-page/index.html`  
**Status**: Draft  

---

## 1. Problem Frame & Objectives

While the Casper ERP landing page achieves a 100% Nielsen heuristic score, adding high-conversion interactive product demos will increase visitor conversion rates for maintenance center owners and enterprise spare-parts retailers in Egypt.

### Core Goals
1. Increase live demo requests by 35%.
2. Demonstrate core USP differentiators (offline-first, automated engineer commissions, stock loss deduction) visually without requiring manual sales calls.

---

## 2. Proposed Feature Additions

### Feature 1: Interactive Maintenance Ticket Tracker (Live Demo)
- **User Flow**: Visitors enter a sample ticket code (e.g. `TK-1001` or `TK-2026`) into a hero input field.
- **Experience**: Renders an interactive glassmorphic modal displaying live repair status (Diagnostic -> Spare Parts Reserved -> Engineer Working -> Ready for Pickup), complete with exact automated engineer commission breakdown.

### Feature 2: Interactive Engineer Commission & Loss Calculator
- **User Flow**: Sliders for center size (1-50 engineers) and monthly repair volume.
- **Experience**: Calculates exact hours saved on manual bookkeeping and net profit gain from zero-variance stock deductions.

### Feature 3: 1-Click WhatsApp Quick Sales Booking
- **User Flow**: Floating action button and form submit trigger direct WhatsApp API link with pre-formatted inquiry text tailored to center size.

---

## 3. Non-Goals & Scope Boundaries
- **No Heavy External Dependencies**: Must keep zero framework overhead (pure Vanilla JS / Tailwind CDN).
- **No Backend Database Requirement**: Interactive demos use simulated client-side JSON data.

---

## 4. Success Criteria
- [ ] Live demo interaction rate >= 25% of unique landing page visitors.
- [ ] 0ms layout shift or render delay on mobile viewports (375px).
