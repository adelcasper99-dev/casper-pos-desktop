---
name: Casper POS & ERP Design System (Google Material 3 & High-End Glassmorphic Edition)
description: State-of-the-art enterprise design system uniting Google Design / Material 3 principles with dark glassmorphic tactical aesthetics for POS, ERP, and hybrid desktop applications.
colors:
  # Base Voids & Backgrounds
  void-black: "#05070a"
  obsidian-surface: "#0b0f19"
  surface-container-low: "#0e1422"
  surface-container: "#131b2e"
  surface-container-high: "#1c263e"
  surface-container-highest: "#263352"
  
  # Light Mode Surfaces (Silk Pearl)
  light-pearl-bg: "#f8fafc"
  light-surface-card: "#ffffff"
  light-surface-muted: "#f1f5f9"
  light-border: "#e2e8f0"
  
  # Google Material 3 Calibrated Brand & Accents
  electric-iris: "#818cf8"
  electric-iris-dark: "#6366f1"
  cyber-cyan: "#00f0ff"
  cyan-glow: "rgba(0, 240, 255, 0.25)"
  emerald-teal: "#10b981"
  emerald-glow: "rgba(16, 185, 129, 0.25)"
  saffron-amber: "#f59e0b"
  saffron-glow: "rgba(245, 158, 11, 0.25)"
  crimson-coral: "#f43f5e"
  
  # Text Hierarchy
  text-primary-dark: "#f8fafc"
  text-secondary-dark: "#94a3b8"
  text-muted-dark: "#64748b"
  text-primary-light: "#0f172a"
  text-secondary-light: "#475569"
  
  # Borders & Double Bezel
  border-subtle: "rgba(255, 255, 255, 0.08)"
  border-highlight: "rgba(255, 255, 255, 0.16)"
  border-active-cyan: "rgba(0, 240, 255, 0.5)"
  border-active-iris: "rgba(129, 140, 248, 0.5)"

typography:
  font-primary: "Cairo, Plus Jakarta Sans, -apple-system, BlinkMacSystemFont, sans-serif"
  font-mono: "JetBrains Mono, SF Mono, Menlo, monospace"
  scale:
    display-large: { size: "2.25rem", weight: "900", lineHeight: "1.2" }
    headline: { size: "1.5rem", weight: "800", lineHeight: "1.3" }
    title: { size: "1.125rem", weight: "700", lineHeight: "1.4" }
    body: { size: "0.9375rem", weight: "500", lineHeight: "1.5" }
    caption: { size: "0.75rem", weight: "700", letterSpacing: "0.05em" }
    numeric-badge: { size: "0.875rem", weight: "800", font: "mono" }

iconography:
  strokeWidth: 1.75
  sizes:
    xs: "14px"
    sm: "18px"
    md: "22px"
    lg: "28px"
  containers:
    pill: "p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
    neutral: "p-2 rounded-xl bg-white/5 text-zinc-400 border border-white/10"
    danger: "p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20"

motion:
  spring: "cubic-bezier(0.16, 1, 0.3, 1)"
  active-scale: "scale-[0.98]"
  duration: "150ms"
---

# Casper ERP & POS: Design System & Taste Guidelines

## 1. Design Vision & Philosophy
Casper marries **Google Material 3 tokenized structure** with **Tactile Glassmorphism**:
* **High-Contrast Dark Void (`#05070a`)**: Optimized for OLED & POS touch monitors to reduce cashier eye strain.
* **Double-Bezel Surfaces**: Layered container depths (Low -> Normal -> High) separated by 1px subtle borders (`rgba(255,255,255,0.08)`).
* **Tactile Spring Feedback**: Every interactive target responds with instant active scaling (`scale-[0.98]`) and glowing perimeter rings.

## 2. Iconography & Visual Hierarchy
* **Unified Stroke**: All Lucide / Google Material symbols enforce `strokeWidth={1.75}`.
* **Pill-Encapsulated Icons**: Primary action icons sit inside dedicated 10% opacity color containers with matching 20% border glow.
* **Status Badges**: Dual-layer animated pulse dots (`relative flex h-2 w-2`) indicate network connectivity, SQLite sync status, and hardware thermal printing bridges.

## 3. Financial & Monospace Typography
* All monetary values, quantities, serials, and timestamps **strictly use font-mono** (`JetBrains Mono` / `SF Mono`) with right-alignment and decimal precision.
* Clear visual distinction between positive revenue (Emerald `#10b981`), discounts (Saffron `#f59e0b`), and debt/losses (Crimson `#f43f5e`).
