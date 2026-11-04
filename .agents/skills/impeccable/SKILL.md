---
name: impeccable
description: Design guidance for frontend interfaces and design systems. Use to shape, critique, audit, polish, typeset, and layout UIs with exceptional craft, proper typography, breathing room, no text overflowing, and flawless responsive containers.
---

# Impeccable Design Guidelines & Craft Floor

When designing or refining user interfaces:

## 1. Layout, Flex & Overflow Hygiene (Never Overflow)
- **Container Structure**: Always use explicit flex layouts with `flex flex-col max-h-[85vh]` or `h-full`.
- **Inner Scroll Bounds**: The scrollable body MUST have `flex-1 min-h-0 overflow-y-auto` so headers and footers remain fixed (`shrink-0`) and NEVER get clipped or overflow the container.
- **Word Wrapping & Text Length**: 
  - Ensure labels, descriptions, and buttons have adequate horizontal width (`max-w-3xl` or appropriate grid columns).
  - Use `text-balance` or `leading-relaxed` for multi-line explanations.
  - Never place detailed 2-line descriptions in columns narrower than 300px.

## 2. Typography & Visual Hierarchy
- **Font Harmony**: Clean sans-serif (`font-sans`) for UI, numbers and metadata in tabular monospace (`font-mono`).
- **Hierarchy**: Primary title (16px font-semibold), section headers (11px uppercase tracking-wider text-white/50), body copy (13px text-white/80 leading-relaxed), micro-labels (10px font-mono text-white/40).
- **No Clashing Weights**: Keep typographic scales balanced (11px, 13px, 15px, 18px).

## 3. Spacing & Breathability
- **Comfortable Padding**: Modals use `p-6` or `p-7` with `space-y-6` between major sections.
- **Grid Gaps**: Use `gap-4` or `gap-3.5` between cards so they don't look cramped.
- **Optical Balance**: Buttons and action cards must have balanced internal padding (`p-4` or `px-4 py-3.5`).

## 4. Materials & Colors (Dark Glassmorphism)
- **Backgrounds**: Deep space `#0B0F19` and `#0E121E` with subtle glass borders `border-white/10`.
- **Gradients**: Purposeful, subtle glowing accents (Emerald for safe/git, Cyan for primary actions, Purple for extensions, Amber for warnings, Rose for destructions).
