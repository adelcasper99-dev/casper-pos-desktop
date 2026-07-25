---
name: Casper ERP Design System
description: Ultra-modern glassmorphic void design system for Casper ERP landing page & web app
colors:
  void: "#000000"
  bone-white: "#ffffff"
  electric-iris: "#8052ff"
  electric-iris-hover: "#6b3bff"
  electric-iris-deep: "#5824e6"
  saffron-spark: "#ffb829"
  saffron-bright-gold: "#ffd700"
  deep-verdant: "#15846e"
  emerald-400: "#34d399"
  emerald-500: "#10b981"
  emerald-700: "#047857"
  red-400: "#f87171"
  red-500: "#ef4444"
  red-600: "#dc2626"
  red-700: "#b91c1c"
  red-800: "#991b1b"
  red-50: "#fef2f2"
  indigo-50: "#e0e7ff"
  amber-600: "#d97706"
  cyan-accent: "#00f0ff"
  ash-gray: "#9a9a9a"
  silver-mist: "#bdbdbd"
  body-text-dark: "#e5e5e5"
  slate-obsidian: "#0f172a"
  light-pearl-bg: "#f1f3f8"
  slate-50: "#f8fafc"
  slate-100: "#f1f5f9"
  slate-200: "#e2e8f0"
  slate-300: "#cbd5e1"
  slate-400: "#94a3b8"
  slate-600: "#475569"
  slate-700: "#334155"
  slate-900: "#0f172a"
  dark-void-surface: "rgba(8, 9, 13, 0.95)"
  dark-card-surface: "rgba(11, 15, 25, 0.85)"
  purple-border-highlight: "rgba(192, 132, 252, 0.5)"
typography:
  display:
    fontFamily: "Cairo, Plus Jakarta Sans, sans-serif"
    fontWeight: 900
    lineHeight: "1.35"
  heading:
    fontFamily: "Cairo, Plus Jakarta Sans, sans-serif"
    fontWeight: 800
  body:
    fontFamily: "Cairo, Plus Jakarta Sans, sans-serif"
    fontWeight: 400
    fontSize: "18px"
    lineHeight: "1.6"
  code:
    fontFamily: "Plus Jakarta Sans, monospace"
rounded:
  sm: "12px"
  md: "24px"
  lg: "40px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "16px"
  md: "24px"
  lg: "32px"
  xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.electric-iris}"
    textColor: "{colors.bone-white}"
    rounded: "{rounded.full}"
    padding: "16px 32px"
  button-primary-hover:
    backgroundColor: "{colors.electric-iris-hover}"
  button-secondary:
    backgroundColor: "rgba(255, 255, 255, 0.03)"
    textColor: "{colors.bone-white}"
    rounded: "{rounded.full}"
    padding: "16px 32px"
  glass-input:
    backgroundColor: "rgba(15, 23, 42, 0.8)"
    textColor: "{colors.bone-white}"
    rounded: "{rounded.sm}"
    padding: "16px 20px"
---

# Casper ERP Design System

## Overview
Casper ERP uses a premium cosmic void & glassmorphic design system tailored for maintenance centers and enterprise resource planning. The system balances high-contrast dark void displays (`#000000`) with silky pearl slate light modes (`#f1f3f8`), illuminated by Electric Iris purple (`#8052ff`), Saffron Spark gold (`#ffb829`), Deep Verdant emerald (`#15846e`), and Cyan (`#00f0ff`) accents.

## Colors
- **Void Obsidian Black (`#000000`)**: Primary background for dark mode and bento cards.
- **Electric Iris (`#8052ff`)**: Primary brand accent used for action CTAs, halos, and glowing section portal effects.
- **Saffron Spark & Gold (`#ffb829`, `#ffd700`)**: Warm gold highlight used for key financial gain stats, animated text shimmers, pricing hero tags, and urgent indicators.
- **Deep Verdant & Emerald (`#15846e`, `#10b981`, `#34d399`)**: Emerald green indicator for verified status, WhatsApp links, and profit-saving cards.
- **Cyan Accent (`#00f0ff`)**: Secondary futuristic aura accent for inner mockup glows.
- **Red Loss Indicator (`#ef4444`, `#dc2626`, `#b91c1c`, `#991b1b`)**: Financial loss warnings and debt leakage indicators.
- **Silky Pearl Slate (`#f1f3f8`)**: Soft off-white theme palette for light mode readability without eye strain.
- **Body Text Color (`#e5e5e5`)**: High contrast body text for dark void background cards.
- **Slate Tonal Ramp (`#f8fafc`, `#e2e8f0`, `#cbd5e1`, `#94a3b8`, `#475569`, `#334155`, `#0f172a`)**: Full slate gray scale for borders, light mode card backgrounds, secondary labels, and high-contrast typography.

## Typography
- **Primary Font**: `Cairo` (Arabic headings and body text) combined with `Plus Jakarta Sans` (English numbers, code, and UI badges).
- **Hierarchy**:
  - `Hero Display`: 3rem to 3.75rem (48-60px), Font Weight 900 (Black), 1.35 line height.
  - `Section Headings (H2)`: 2.25rem (36px), Font Weight 800.
  - `Body Copy`: 1.125rem (18px), Font Weight 400, `#e5e5e5` in dark mode, `#334155` in light mode.

## Layout
- **Container Max-Width**: `1240px` (`max-w-7xl`).
- **Bento Grid Layout**: Multi-column responsive bento cards with 24px border radius and 24px-32px padding.
- **Mobile First**: Fluid 1-column mobile stack transitioning to 2 or 3-column desktop layouts (`md:grid-cols-2`, `lg:grid-cols-3`).

## Elevation & Depth
- **Glassmorphism**: `backdrop-filter: blur(24px) saturate(160%)` on floating navbar and cards.
- **Card Border Highlights**: `1px solid rgba(255, 255, 255, 0.08)` with subtle `inset 0 1px 0 rgba(255, 255, 255, 0.15)` top edge light reflection.
- **Electric Iris Glow**: `box-shadow: 0 0 25px rgba(128, 82, 255, 0.45)`.

## Shapes
- **Bento Cards**: `24px` border radius (`rounded-[24px]` or `rounded-[2.5rem]`).
- **CTAs & Badges**: Fully rounded pills (`rounded-full` / `9999px`).
- **Inputs**: Smooth 12px rounded corners (`rounded-xl`).

## Components
- **Primary Button (`.btn-indigo-primary`)**: Electric Iris background, 24px radius, white text, 30px glow shadow on hover.
- **Secondary Button (`.btn-glass-secondary`)**: Translucent glass background with 12% white border and subtle hover tint.
- **Floating Navbar (`.nav-scrolled`)**: Blur 24px glass pill floating 10px from top with subtle scroll shadow.
- **Social Toast Notification**: Floating fixed bottom-right card with instant entrance slide.

## Do's and Don'ts
- **DO** use exact `Decimal.js` formatting and `ar-EG` locale numbers for financial figures.
- **DO** maintain strict high contrast between Electric Iris text and dark void backgrounds.
- **DON'T** use heavy 100% black shadows in light mode; use soft slate micro-shadows (`rgba(15, 23, 42, 0.05)`).
- **DON'T** mix generic blue or neon red with Electric Iris; stick to the curated HSL palette.
