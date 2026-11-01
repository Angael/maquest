---
name: maquest-design
description: Maquest's design system — tokens, type scale, primitives, motion and layout rules for the desktop renderer. Use before changing any UI in apps/desktop/src/renderer.
---

# Maquest design system

Maquest is a dense, dark, keyboard-friendly desktop tool for writers and GMs. The canvas and the documents are the
content; chrome should recede. Brand color is orange, used sparingly for the one primary action, selection and focus.

Read alongside: `emil-design-eng` (motion and polish), `web-interface-guidelines` (MUST/SHOULD rules),
`baseline-ui`, `fixing-accessibility`, `fixing-motion-performance`, `review-animations`.

## Tokens (styles.css `@theme`)

Never use raw `stone-*`, `amber-*`, hex or `rgb()` in components. Use semantic utilities:

| Purpose                                                     | Utility                                                                                                               |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| App / canvas background (darkest)                           | `bg-app`                                                                                                              |
| Sidebar, inspector, title bar                               | `bg-panel`                                                                                                            |
| Cards, inputs, list items                                   | `bg-surface`                                                                                                          |
| Menus, popovers, tooltips                                   | `bg-raised`                                                                                                           |
| Hover / pressed overlay                                     | `bg-hover`, `bg-active`                                                                                               |
| Hairlines                                                   | `border-line`, `border-line-strong` (or `shadow-[inset_0_0_0_1px_var(--color-line)]`)                                 |
| Text: primary / secondary / tertiary / placeholder+disabled | `text-fg`, `text-fg-muted`, `text-fg-subtle`, `text-fg-faint`                                                         |
| Brand                                                       | `bg-accent text-accent-fg` (primary button), `text-accent-text` (orange text/icons), `bg-accent-soft` (selected tint) |
| Status                                                      | `text-danger`/`bg-danger-soft`, `text-success`, `text-warning`                                                        |
| Elevation                                                   | `shadow-[var(--shadow-popover)]` (menus), `shadow-[var(--shadow-float)]` (floating canvas toolbars)                   |

Node-type colors come from the project config (`useTypes().of(type).color`) and are content, not chrome: use them for
the type icon and small accents only, never for large fills or text bodies.

## Typography

- UI: Inter Variable (`font-sans`), base **13px** (`text-sm`). Scale: `text-2xs` 11, `text-xs` 12, `text-sm` 13,
  `text-base` 14, `text-prose` 16, `text-lg` 18, `text-xl` 20, `text-2xl` 24.
- Documents and card titles: Literata Variable (`font-serif`). Prose is `text-prose` (16px / 1.7), max ~70ch.
- Mono: JetBrains Mono (`font-mono`) for ids, paths, code.
- Weights: 400 body, 500 labels/buttons/active nav, 600 headings. Never change weight on hover/selection.
- Labels are sentence case `text-xs font-medium text-fg-subtle`. Reserve uppercase tracking for at most tiny
  eyebrow labels (e.g. the node-type label on cards).
- Use `tabular-nums` (`.tabular`) for counts, clocks, word counts. Use the real `…`.

## Sizing and density

- Control heights: 24px (`sm`, toolbars/rows), 28px (`md`, default), 32px (`lg`, forms on roomy screens).
- Sidebar rows 28px. Inspector property rows 28–32px. Hit targets ≥ 24px even with 14px icons.
- Icons: 14px in dense rows/menus, 16px in toolbars. Lucide, `strokeWidth` default.
- Spacing on a 4px grid. Panels pad 12px; sections separate with 16–20px, not with boxes inside boxes.

## Primitives (`components/ui.tsx`)

`Button` (variants ghost/subtle/outline/primary/danger, sizes sm/md/lg), `IconButton` (required `label`, optional
`shortcut`, shows a tooltip), `Tooltip`, `Menu`/`MenuItem`/`MenuSeparator`/`MenuLabel` (Base UI menu), `Popover`,
`Input`, `Textarea` (auto-grows), `Select` (native, styled), `Label`, `Segmented`, `Separator`, `Kbd`/`Shortcut`,
`floating` (class for floating canvas panels), `cn`.

- Use Base UI (`@base-ui/react`) for anything with focus management: menus, popovers, tooltips, dialogs. Don't
  hand-roll outside-click / Esc handling.
- Icon-only buttons must go through `IconButton` (tooltip + aria-label). Put shortcuts in tooltips and menus, not in
  permanent hint bars.
- Popovers for quick settings/pickers, menus for actions, the inspector for editing. Dialogs only for blocking,
  destructive confirmations.

## Motion

- Tokens: `--ease-out` (enter/exit), `--ease-in-out` (on-screen movement), `--ease-drawer` (panels). Durations:
  press/hover 100ms, tooltip 120ms, menus/popovers 140ms (exit 90ms), panels ≤ 220ms.
- Popups use `.popup-motion` (scale .97 + fade from the trigger via `--transform-origin`). Tooltips `.tooltip-motion`.
- Do not animate: keyboard-triggered UI (command palette, Ctrl+J/Ctrl+B toggles may slide ≤ 160ms at most), canvas
  pan/zoom, typing, list insertions, view switches. Only `transform`/`opacity`; never `transition: all`.
- Respect `prefers-reduced-motion` (global rule in styles.css).

## Layout

- Integrated title bar (`TitleBar`, 40px, `.app-drag`): brand + project switcher left, views center-left, global
  actions right, then window controls. Everything interactive in it is automatically `no-drag`.
- Panels (sidebar, inspector, live notes) are collapsible and remember their state. Things that are only needed
  sometimes (legends, filters, hints, minimap) live behind a toggle, not permanently on screen.
- Hover-revealed actions must also show on `:focus-within` and reserve their space (opacity, not display).

## Performance

- Subscribe to zustand with selectors (`useUI((s) => s.view)`), or `useShallow` for several fields. Never
  `const { … } = useUI()` — it re-renders on every store change.
- Derive expensive lists with `useMemo`; group nodes by type once, not per section per render.
- High-frequency state (hover, drag, pointer) must not re-render the whole canvas; keep it local or in refs/CSS.
