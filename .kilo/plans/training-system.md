# Casper POS Training System Plan

## Overview
Create a simple, interactive training system within the Casper POS desktop application to help users learn how to use the system through step-by-step guidance in Arabic.

## Components to Create/Modify

### 1. TrainingModal Component (`src/components/ui/TrainingModal.tsx`)
- A modal-based step-by-step training guide
- Features:
  - Step navigation (next/previous)
  - Progress indicator
  - Simple Arabic explanations for each step
  - Trigger button (fixed position)
  - Uses existing GlassModal and Button components

### 2. Training Content (Arabic)
Steps covering:
1. Welcome/Introduction
2. Navigating to Point of Sale (POS)
3. Adding products to cart (search/barcode)
4. Completing a sale (payment methods)
5. Managing treasury/finances
6. Inventory management basics
7. Completion/restart option

### 3. Integration Points
- Add trigger button to Sidebar or TitleBar for easy access
- Consider adding to user menu or help section
- Optional: Track completion to avoid repeated shows

## Implementation Steps

### Phase 1: Create TrainingModal Component
1. Create `src/components/ui/TrainingModal.tsx`
2. Implement step-by-step logic with state management
3. Design Arabic content for each training step
4. Style using existing UI components (GlassModal, Button)

### Phase 2: Add Trigger Mechanism
1. Add help/training button to Sidebar (preferred) or TitleBar
2. Connect button to open TrainingModal
3. Position button accessibly (fixed bottom-right as fallback)

### Phase 3: Test and Refine
1. Verify training steps align with actual UI elements
2. Test navigation flow
3. Ensure Arabic text displays correctly
4. Check responsiveness and accessibility

## Dependencies
- Uses existing: GlassModal, Button, lucide-react icons
- Requires: useState hook for state management
- No new external dependencies needed

## Notes
- Training steps use simplified selectors for highlighting (can be enhanced later)
- Content focused on most common user workflows
- Modal approach minimizes disruption to main application
- All text in Arabic as requested
- Designed to be extensible for additional training modules

## Files to Create
- `src/components/ui/TrainingModal.tsx`

## Files to Modify
- `src/components/Sidebar.tsx` (to add trigger button)