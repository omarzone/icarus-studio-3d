# Design tokens

The single list of values the interface and the 3D scene may use. Components never use raw values: they use these tokens through Tailwind classes, CSS variables or the scene constants. How to apply them lives in [`STYLEGUIDE.md`](./STYLEGUIDE.md); where each screen uses them lives in [`screens.md`](./screens.md).

## Source of truth

- One TypeScript source, `packages/ui-tokens/src/tokens.ts`, exports every token below.
- A build step generates `tokens.css` (CSS variables with the `--ic-` prefix, mapped to the shadcn variables) and the Tailwind theme extension. The scene imports the same module for Three.js colors.
- Dark is the default and only shipped theme. The *Light* column is reserved so components never assume dark; it ships only when every screen passes review in it.
- Adding a token is a design decision: add it here first, then in `tokens.ts`.

Naming: `category.role.variant`, kebab-case in CSS (`--ic-bg-panel`), dot path in TypeScript (`color.bg.panel`).

## Color

### Surfaces

Surfaces stack from back to front. Each step is a little lighter; never skip back to a darker surface inside a lighter one.

| Token | Dark | Light (reserved) | CSS variable | Tailwind | Use |
|---|---|---|---|---|---|
| `color.bg.app` | `#121212` | `#FFFFFF` | `--ic-bg-app` | `bg-app` | Window background behind panels and pages |
| `color.bg.panel` | `#161616` | `#FFFFFF` | `--ic-bg-panel` | `bg-panel` | Panels, dialogs, popovers, inspector |
| `color.bg.strip` | `#1A1A1A` | `#F7F7F7` | `--ic-bg-strip` | `bg-strip` | Panel tab bars and workspace toolbars |
| `color.bg.control` | `#1E1E1E` | `#F2F2F2` | `--ic-bg-control` | `bg-control` | Inputs, secondary buttons, cards, chat bubbles from the copilot, segmented track |
| `color.bg.control-raised` | `#262626` | `#E8E8E8` | `--ic-bg-control-raised` | `bg-control-raised` | Active panel tab, selected list row, slider track, icon tiles |
| `color.bg.overlay` | `rgba(18, 18, 18, 0.86)` | `rgba(255, 255, 255, 0.86)` | `--ic-bg-overlay` | `bg-overlay` | Floating cards and bars over the 3D viewport |
| `color.bg.floating` | `rgba(22, 22, 22, 0.94)` | `rgba(255, 255, 255, 0.96)` | `--ic-bg-floating` | `bg-floating` | Guide card, status cards over content |
| `color.scrim.modal` | `rgba(0, 0, 0, 0.60)` | `rgba(0, 0, 0, 0.40)` | `--ic-scrim-modal` | `bg-scrim-modal` | Behind modal dialogs |
| `color.scrim.popover` | `rgba(0, 0, 0, 0.35)` | `rgba(0, 0, 0, 0.20)` | `--ic-scrim-popover` | `bg-scrim-popover` | Behind popovers that need focus |

### Foreground

Text and icons are one ink color at fixed strengths. Do not invent new strengths.

| Token | Dark | Light (reserved) | CSS variable | Tailwind | Use |
|---|---|---|---|---|---|
| `color.fg.default` | `#F5F5F5` | `#1C1C1C` | `--ic-fg` | `text-fg` | Primary text, active icons |
| `color.fg.tool` | `rgba(245, 245, 245, 0.85)` | `rgba(28, 28, 28, 0.85)` | `--ic-fg-tool` | `text-fg-tool` | Idle toolbar tools and their labels |
| `color.fg.secondary` | `rgba(245, 245, 245, 0.72)` | `rgba(28, 28, 28, 0.72)` | `--ic-fg-secondary` | `text-fg-secondary` | Body copy in dialogs and chat explanations, inspector labels |
| `color.fg.tertiary` | `rgba(245, 245, 245, 0.55)` | `rgba(28, 28, 28, 0.58)` | `--ic-fg-tertiary` | `text-fg-tertiary` | Meta (counts, timestamps, units), inactive tabs, placeholders, section labels |
| `color.fg.disabled` | `rgba(245, 245, 245, 0.35)` | `rgba(28, 28, 28, 0.35)` | `--ic-fg-disabled` | `text-fg-disabled` | Disabled text and icons only. Never for readable content |
| `color.fg.on-selected` | `#121212` | `#FFFFFF` | `--ic-fg-on-selected` | `text-on-selected` | Text on a selected (white) surface |

Prototype normalization: 0.66, 0.70 and 0.75 become `fg.secondary`; 0.50, 0.54, 0.60 and 0.62 become `fg.tertiary`; 0.80 becomes `fg.tool`.

### Lines and fills

| Token | Dark | CSS variable | Tailwind | Use |
|---|---|---|---|---|
| `color.line.subtle` | `rgba(245, 245, 245, 0.07)` | `--ic-line-subtle` | `border-line-subtle` | Header and tab-bar bottom borders, list separators |
| `color.line.default` | `rgba(245, 245, 245, 0.08)` | `--ic-line` | `border-line` | Panel outlines |
| `color.line.strong` | `rgba(245, 245, 245, 0.12)` | `--ic-line-strong` | `border-line-strong` | Dialog, popover and menu outlines; window outline |
| `color.line.divider` | `rgba(245, 245, 245, 0.10)` | `--ic-line-divider` | `bg-line-divider` | Vertical dividers between toolbar groups |
| `color.line.dashed` | `rgba(245, 245, 245, 0.18)` | `--ic-line-dashed` | `border-line-dashed` | Drop zones and *Add* affordances (1.5 px dashed) |
| `color.fill.hover` | `rgba(245, 245, 245, 0.06)` | `--ic-fill-hover` | `bg-fill-hover` | Hover on rows, tabs and ghost buttons |
| `color.fill.ghost` | `rgba(245, 245, 245, 0.08)` | `--ic-fill-ghost` | `bg-fill-ghost` | Ghost buttons and secondary chat actions |
| `color.fill.track-off` | `rgba(245, 245, 245, 0.20)` | `--ic-fill-track-off` | `bg-fill-track-off` | Switch track when off |

### Selection and action

Selection is white, never colored. This is the main identity rule of the interface.

| Token | Dark | CSS variable | Tailwind | Use |
|---|---|---|---|---|
| `color.selected.bg` | `#F5F5F5` | `--ic-selected` | `bg-selected` | Active workspace tab, active segment, active tool, primary button, user chat bubble, send button |
| `color.selected.fg` | `#121212` | `--ic-on-selected` | `text-on-selected` | Content on those surfaces |
| `color.focus.ring` | `rgba(245, 245, 245, 0.90)` | `--ic-ring` | `ring-ring` | Keyboard focus ring, 2 px with 2 px offset in `bg.panel` |

### Meaning

Color carries meaning only. Each meaning has a text color and a tinted background for pills and banners.

| Token | Text / graphic | Tint background | CSS variables | Use |
|---|---|---|---|---|
| `color.ok` | `#3FD08A` | `rgba(0, 186, 105, 0.14)` | `--ic-ok`, `--ic-ok-tint` | Passed checks, *Connected*, running dots, published, switch on |
| `color.warn` | `#F0A63A` | `rgba(226, 134, 0, 0.14)` | `--ic-warn`, `--ic-warn-tint` | Needs attention, partial results, penalties with small weight |
| `color.danger` | `#FF8A88` | `rgba(255, 100, 99, 0.14)` | `--ic-danger`, `--ic-danger-tint` | Errors, failures, high failure rates |
| `color.danger.graphic` | `#FF6463` | — | `--ic-danger-graphic` | Danger in charts, bars and 3D markers |
| `color.destructive` | `#E5484D` (text `#FFFFFF`) | — | `--ic-destructive` | Only the confirm button of a destructive dialog |
| `color.proposal` | `#8DC0FF` | `rgba(141, 192, 255, 0.14)` | `--ic-proposal`, `--ic-proposal-tint` | Anything the copilot proposes and is not applied yet: values, explorer items, diffs, ghosts in 3D |
| `color.banner.warn` | `#2A2014` with border `rgba(226, 134, 0, 0.45)` | — | `--ic-banner-warn` | Blocking banners such as *Can't train yet* |

Rules: blue means *proposed by the copilot* and nothing else; green never decorates; red is never used for a selected state.

### Identity

| Token | Values | Use |
|---|---|---|
| `color.avatar.1…7` | `#3EC5A8` `#F5A03C` `#6A6BF5` `#D9508A` `#3B82F6` `#9B5CF6` `#F2622A` | Avatar backgrounds, picked by a stable hash of the user id; initials in `#101014` |
| `color.window.close/minimize/zoom` | `#FF5F57` `#FEBC2E` `#28C840` | Custom window controls on macOS-style frames only; Windows and Linux use native controls |

### Data visualization

| Token | Value | Use |
|---|---|---|
| `viz.line.primary` | `color.fg.default` | Main series (mean reward, match score) |
| `viz.line.danger` | `color.danger.graphic` | Failure-type series (collision rate) |
| `viz.area.opacity` | `0.08` | Fill under a line series |
| `viz.grid` | `rgba(245, 245, 245, 0.06)` | Horizontal grid lines; no vertical grid |
| `viz.network.idle` | `#3A4048` | Inactive neuron |
| `viz.network.active` | `#FF6B6B` | Firing neuron and hot connection |
| `viz.network.wire` | `#9FB4C8` at 0.12–0.25 | Idle connections |
| `viz.pose` | `#5EEAD4` | Tracked pose skeleton over video |

### 3D scene

Exported from the same module as `scene.*`, as numbers for Three.js.

| Token | Value | Use |
|---|---|---|
| `scene.bg` | `0x161616` | Viewport background in editing views |
| `scene.floor` | `0x3D4247` | Default floor |
| `scene.grid` | `0xA9B4C0` at 0.18 | Ground grid in empty worlds |
| `scene.props` | `0x2C3036` | Neutral props |
| `scene.sky.dusk` | `#1B2A3D` → `#4A6686` → `#AEBCCB` | Default editor sky (top, middle, horizon) |
| `scene.sky.day` | `#5F8FC4` → `#A9C6E2` → `#E4ECEF` | Outdoor day sky |
| `scene.material.shell` | `0xF1F1F1`, roughness 0.35, clearcoat 0.6 | Default body shell for robots, characters and creatures |
| `scene.material.joint` | `0x8B9098`, metalness 0.85 | Joints and limbs |
| `scene.axis.x/y/z` | `#FF453A` `#32D74B` `#0A84FF` | Orientation gizmo and transform handles |
| `scene.sensor.ray` | `#E9EEF5` at 0.7 | Sensor rays |
| `scene.sensor.hit` | `#FF5C5C` | Ray hitting something close |
| `scene.proposal` | `color.proposal` at 0.45 | Ghosted proposed objects |
| `scene.fog` | per world | Matches the sky horizon |

## Typography

| Token | Value |
|---|---|
| `font.ui` | `Inter` (bundled, variable), fallback `-apple-system, 'Segoe UI Variable', system-ui, sans-serif` |
| `font.mono` | `JetBrains Mono` (bundled), fallback `ui-monospace, monospace` |
| `font.signature` | `Brush Script MT`, cursive (only the community signature) |

Inter is bundled so every platform renders the same widths.

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| `text.display` | 40 / 42 | 600, tracking −0.03 em | Home hero headline only |
| `text.title-1` | 26 / 32 | 600 | Page titles (Projects, Community, catalog boards) |
| `text.title-2` | 24 / 30 | 600 | Settings and system page titles |
| `text.title-3` | 18 / 24 | 600 | Dialog titles, section headings (*Start from*) |
| `text.headline` | 15 / 20 | 600 | Card titles, idea titles |
| `text.body` | 13 / 20 | 400 | Default text, chat, dialog copy |
| `text.body-strong` | 13 / 20 | 600 | Emphasis inside body |
| `text.ui` | 12 / 16 | 400–600 | Tabs, buttons, inspector, lists, chips |
| `text.meta` | 11 / 14 | 400 | Counts, timestamps, units, captions, section labels |
| `text.micro` | 10 / 12 | 400 | Toolbar tool labels, value pills |
| `text.mono` | 11 / 16 | 400 | Numbers in inspector, logs, file names, technical details |

Prototype normalization: 10.5 and 11.5 become 11; 14 becomes 13 except the project name in the header (14, 600); 20 and 22 become 24 or 18 by role.

Weights: 400 regular, 500 medium (active panel tab), 600 semibold (titles, buttons, selected), 700 bold (large numbers in stats and avatars).

## Spacing

The 4 px Tailwind scale. Only these values.

| Token | px | Typical use |
|---|---|---|
| `space.0.5` | 2 | Gap between segmented items and tabs |
| `space.1` | 4 | Icon-to-text inside chips, inner padding of segmented controls |
| `space.1.5` | 6 | Gap between columns of the workspace, chip gaps |
| `space.2` | 8 | Default gap inside rows and button groups |
| `space.2.5` | 10 | Gap inside cards, list row padding |
| `space.3` | 12 | Panel padding, outer gutter of the workspace |
| `space.3.5` | 14 | Card padding, chat bubble padding (12 × 14) |
| `space.4` | 16 | Dialog section gap, card grid gap |
| `space.5` | 20 | Popover padding |
| `space.6` | 24 | Page section gap |
| `space.8` | 32 | — |
| `space.10` | 40 | Launcher page side padding |

Dialogs use 22 px padding (`space.5.5`), the only off-scale value, so content aligns with the 22 px corner radius.

## Radius

| Token | px | Use |
|---|---|---|
| `radius.bar` | 3 | Progress bars, slider tracks, chart bars |
| `radius.control` | 8 | Inputs, inspector controls, segmented items, panel tabs, toolbar tools (10 for 46 px tools) |
| `radius.button` | 10 | Buttons, list rows, menu items |
| `radius.card-sm` | 12 | Thumbnails, small cards, floating viewport cards |
| `radius.card` | 16 | Panels, cards, creation cards |
| `radius.bubble` | 20 | Chat bubbles (user bubble: 20 20 6 20), large cards, hero |
| `radius.dialog` | 22 | Modal dialogs, the hero block |
| `radius.full` | 999 | Pills, chips, avatars, switches, status dots |

Prototype normalization: 6 and 7 become `control`; 9 becomes `button`; 14 becomes `card-sm` or `card` by size; 18 becomes `bubble`.

## Elevation

Elevation is shadow plus a strong outline; panels at rest have no shadow.

| Token | Value | Use |
|---|---|---|
| `shadow.dialog` | `0 30px 80px rgba(0, 0, 0, 0.60)` | Modal dialogs |
| `shadow.popover` | `0 24px 60px rgba(0, 0, 0, 0.55)` | Popovers, Add component, notifications |
| `shadow.menu` | `0 20px 50px rgba(0, 0, 0, 0.50)` | Menus (project menu, context menus) |
| `shadow.floating` | `0 16px 40px rgba(0, 0, 0, 0.50)` | Status cards over the viewport |

## Size

| Token | px | Use |
|---|---|---|
| `size.header.workspace` | 52 | Workspace header height |
| `size.header.launcher` | 56 | Launcher header height |
| `size.tabbar` | 38 | Panel tab bar height |
| `size.toolbar` | 58 | Workspace toolbar height |
| `size.tool` | 54 × 46 | Toolbar tool (min width × height) |
| `size.column.left` | 270 | Left column (Explorer and Inspector) |
| `size.column.chat` | 380 | Chat column |
| `size.panel.bottom` | 168–210 | Bottom panels; user-resizable, these are defaults |
| `size.control` | 26 | Inspector control height |
| `size.button` | 32 | Default button height (34 in dialogs, 44 for sign-in providers) |
| `size.chip` | 28 | Chat suggestion chips (30 for inline chat actions) |
| `size.row.tree` | 26 | Explorer row |
| `size.avatar` | 26, 30, 32, 40, 44, 72, 96 | Avatar sizes by context |
| `size.dialog` | 420 – 760 wide | Small confirm 440–480, form 500–560, chooser 620–680, comparison 760 |
| `size.window.min` | 1280 × 800 | Minimum window; designs are drawn at 1440 × 900 |

## Icon

| Token | Value |
|---|---|
| `icon.set` | Lucide (`lucide-react`, ISC) |
| `icon.stroke` | 1.75 |
| `icon.size.xs` | 12 (chevrons, inline in meta) |
| `icon.size.sm` | 14 (explorer rows, menus, inline in text) |
| `icon.size.md` | 16 (buttons, chips with icons) |
| `icon.size.lg` | 18 (toolbar tools, header) |
| `icon.size.xl` | 22–28 (empty states, drop zones, system screens) |

Brand marks (Google, GitHub) are the only non-Lucide icons and keep their official colors.

## Motion

| Token | Value | Use |
|---|---|---|
| `motion.duration.fast` | 120 ms | Hover, press, switch |
| `motion.duration.base` | 200 ms | Tabs, segmented controls, popovers |
| `motion.duration.slow` | 320 ms | Dialogs, panels sliding, guide card |
| `motion.ease.standard` | `cubic-bezier(0.2, 0, 0, 1)` | Everything that moves |
| `motion.ease.exit` | `cubic-bezier(0.4, 0, 1, 1)` | Things leaving |

With *reduce motion* on, durations become 0 and the viewport camera never animates on its own.

## shadcn mapping

| shadcn variable | Token |
|---|---|
| `--background` | `color.bg.app` |
| `--foreground` | `color.fg.default` |
| `--card`, `--popover` | `color.bg.panel` |
| `--card-foreground`, `--popover-foreground` | `color.fg.default` |
| `--primary` | `color.selected.bg` |
| `--primary-foreground` | `color.selected.fg` |
| `--secondary`, `--input` | `color.bg.control` |
| `--secondary-foreground` | `color.fg.default` |
| `--muted` | `color.bg.control-raised` |
| `--muted-foreground` | `color.fg.tertiary` |
| `--accent` | `color.fill.hover` |
| `--accent-foreground` | `color.fg.default` |
| `--destructive` | `color.destructive` |
| `--border` | `color.line.default` |
| `--ring` | `color.focus.ring` |
| `--radius` | `radius.button` (10 px) |
