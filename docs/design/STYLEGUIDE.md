# Style guide

How the Icarus interface looks, behaves and reads. Values come from [`tokens.md`](./tokens.md); every screen, module and tab is identified in [`screens.md`](./screens.md). When this guide and a screen disagree, this guide wins and the screen is fixed.

## Principles

1. **The 3D world is the hero.** Chrome is dark, quiet and grey so the scene carries the color. Nothing in the interface competes with the viewport.
2. **White means selected.** Selection, the active tab, the primary action and the user's own messages are white with dark text. There is no accent color.
3. **Color means something.** Green: works. Amber: needs attention. Red: broken. Blue: proposed by the copilot and not applied yet. Nothing else is colored.
4. **The copilot is always one glance away.** The chat column never closes in a workspace, every panel action can also be asked for, and every copilot change is previewed before it applies.
5. **Generic chrome, specific data.** Labels of the interface never name an example (*Move*, not *Move car*). Only project data (names, objects, values) is specific.
6. **Beginners first, experts not blocked.** The default view shows plain words and the next step; expert settings sit one click away in the same place, never on a separate screen.
7. **Real or nothing.** Every number on screen comes from the engine or a real run. Estimates say they are estimates.

## Shells and layout

### Launcher shell

Home, Projects, Community, Creation, Profile and Settings. `HDR-LAUNCHER` on top (56 px), content below with 40 px side padding. No chat column: the copilot belongs to projects.

### Workspace shell

```
┌────────────────────────── HDR-WORKSPACE 52 ──────────────────────────┐
│ ● ● ●  Project ⌄   [World Body Motion Brain Train Results Build +] ▶Play   Guide Share [Primary] │
├────────────┬──────────────────────────────────────────┬──────────────┤
│ Explorer   │ Toolbar 58                               │ Chat         │
│            ├──────────────────────────────────────────┤ (always on)  │
├────────────┤ Viewport                                 │              │
│ Inspector  │                                          │              │
│            ├──────────────────────────────────────────┤              │
│            │ Bottom panel 168–210                     │ Composer     │
└────────────┴──────────────────────────────────────────┴──────────────┘
   270 px                     flexible                       380 px
```

- Outer gutter 12 px, gap between columns 6 px, gap between stacked panels 10 px.
- Each column holds panels. A panel = tab bar (38 px, grip on the left, tabs, options on the right) + body.
- Panels can be dragged by the grip to another dock and resized; layouts are saved per workspace. A reset restores the default layout.
- A workspace may replace the default columns with its own panels (Brain, Train, Results, Build), but the chat column and the header never change.
- **Play mode** swaps `HDR-WORKSPACE` for `HDR-PLAY` and the side panels for Play panels; Stop restores the exact previous layout.

### Window frame

The app has no system title bar: every header is the title bar. Dragging empty header space moves the window and double-clicking it maximizes. Window controls are always the operating system's own, never drawn by the app:

- **Windows and Linux:** native caption buttons (minimize, maximize, close) at the right end of the header, as tall as the header, on `bg.app` with `fg.tool` symbols. Hovering maximize keeps the Windows snap layouts. The header reserves their width.
- **macOS:** the traffic lights at the left, 18 px in and centered vertically. The header reserves 60 px for them.
- Screens without a header (`SYS-ENGINE-DOWN`) keep an invisible 56 px drag strip at the top, under the same controls.

### Workspace switcher

- Tabs: World, Body, Motion, Brain, Train, Results, Build, then `+`.
- A tab exists only when the project uses it (Motion appears with the first motion clip). `+` lists the workspaces the project can add.
- The switcher never changes order. The active tab is white.

### Header actions

- **Play** is always next to the switcher, the same in every workspace.
- **Primary** is the next step of the project, always at the far right, always white: *Train*, *Stop* while training, *Publish* in Build, *Train copy* in Motion, *Run test* for reference brains.
- Before a project exists (Ideas, building, empty world), Train and Play are disabled at 35% with the tooltip *Available once the project exists*.

## Components

Each component has one look. Variants are listed; anything else is a new component and needs an entry here.

### Buttons

| Variant | Look | Use |
|---|---|---|
| Primary | `selected.bg`, `selected.fg`, 600, radius 10, height 32 (34 in dialogs) | One per surface: the action that moves forward |
| Secondary | `bg.control`, `fg.default`, 400 | Every other action |
| Ghost | transparent or `fill.ghost`, `fg.secondary` | Tertiary actions inside cards and chat (*Not now*, *I will explore on my own*) |
| Destructive | `destructive` background, white text, 600 | Only the confirm button inside a destructive dialog |
| Provider | 44 px, full width; Google white with its color mark, others `bg.control` with their mark | Sign-in only |
| Disabled | Same variant at 35% opacity, no hover, tooltip with the reason | Never hide a primary action; disable it and say why |

Rules: icon left of the label, 14–16 px; labels are verbs (*Start run 4*, *Track the motion*); a dialog's buttons are right-aligned with the primary last; at most one primary per dialog or panel.

### Interaction states

Anything that looks interactive is a real control (button, field, link or row) and answers both the pointer and the keyboard. Never draw a control as a picture.

| State | Look |
|---|---|
| Hover | Primary: 90% opacity. Secondary buttons and fields: `bg.control-raised`. Ghost buttons, icon buttons, tabs, rows and menu items: `fill.hover` and `fg.default`. Text links and nav: `fg.default` |
| Pressed | 80% opacity while held |
| Focus | 2 px `focus.ring` outline with 2 px offset, from the keyboard only (`:focus-visible`); a focused field also takes its hover background |
| Current or selected | Its selected look, unchanged on hover; marked with `aria-current` or `aria-selected` |
| Disabled | See Buttons: 35%, no hover, tooltip with the reason |

- Color, background and opacity change over `motion.fast` with the standard easing; instantly when the system asks for reduced motion.
- The pointer stays the arrow on buttons, tabs and rows, as in native desktop apps; fields show the text cursor; the hand appears only on links that open a web page.
- Text fields accept typing and selection as soon as they are shown.

### Chips and pills

- **Suggestion chip** (chat): 28 px, radius full, `bg.control`, `fg.secondary`, 12 px. Clicking sends that exact text to the copilot.
- **Inline chat action**: 30 px, radius full; the first is white (primary), the others ghost.
- **Status pill**: 26 px, radius full, meaning tint background and meaning text (*Connected*, *In review*, *Needs attention*, *close*, *off*).
- **Count pill** on thumbnails: overlay background, 11 px, icon + number (votes).

### Segmented control

Track `bg.control`, padding 3 px, radius 10. Items 12 px; active item white with dark text and 600. Use for 2–4 mutually exclusive views or values (*Featured · Recent · Most voted*, *Live · 25k · 312k*). For property values use the inspector `Choice` type, which is the same control at 26 px.

### Panel tabs

Inside a tab bar: 12 px, padding 5 × 10, radius 8. Active: `bg.control-raised`, `fg.default`, 500. Idle: `fg.tertiary`. A tab that opens another surface (History, Timelapse) behaves like a tab visually and opens it. Every tab is one file in code (`TAB-…`).

### Toolbar tools

54 × 46 minimum, icon 18 over a 10 px label, radius 10. Idle `fg.tool`; selected white. Groups separated by a 1 × 34 px divider. Tools that open something (Copies, Autopilot, Import) open it; tools that set a mode (Move, Bone) stay selected. The Play bar is the same component floating on the viewport with `bg.overlay`.

### Lists and trees

- Explorer rows 26 px, indent 14 px per level, icon 14 in `fg.tertiary`, name, meta right-aligned in `fg.tertiary` 11 px. Selected row `bg.control-raised`. Proposed rows in `proposal` blue.
- Section labels: 11 px `fg.tertiary`, no uppercase.
- Navigation lists (Build targets, Settings, Hardware steps): rows of 10 px padding, radius 10, 30 px icon tile in `bg.control`; selected row `bg.control-raised`.

### Cards

- Content cards (creations, ideas, projects): radius 16, `bg.control`, thumbnail on top (real 3D render, never a placeholder), title 15/600, meta 11–12 `fg.tertiary`, status pill.
- Info cards inside panels: radius 12–14, `bg.control`, padding 12 × 14.
- Recommended or selected card: 1.5 px inset ring in `fg.default`, plus a white *Recommended* badge when the copilot recommends it.

### Inspector

See `REF-PROPERTY-TYPES` and `POP-ADD-COMPONENT` in the catalog.

- Every object is a list of **components**; each component is a collapsible section with icon, name, optional note and `···`.
- Every property is one of **12 types**, each with exactly one control: Number, Slider, Range, Choice, List, Switch, Color, Vector, Count, Asset, Opens a panel, Read only.
- Every property has the same **6 states**: default; changed by you (white dot, *was …*, Reset); proposed by the copilot (blue dot and value, Accept); out of range (red, with the reason); mixed (multi-selection); locked (lock icon, while a run uses it).
- Interactions: click edits in place or opens a small picker; dragging the name scrubs numbers (Shift for fine steps); right-click offers reset, copy, paste, randomize per copy and *Ask the copilot*; hover explains in one line and highlights the property in 3D.
- Row: label column flexible, control column 150 px, control height 26. Units always shown, in the control or right after the value.
- *+ Add component* appears only for scene objects. Runs, brains and clips show settings without it.
- Expert settings are a collapsed section named **Expert settings** at the end.

### Switches, radios and checks

- Switch 34 × 20, on = `ok`, off = `fill.track-off`, knob white.
- Option card (radio): `bg.control`, radius 14, radio 16 px; selected adds the inset ring. Use when each option needs a sentence.
- Check list items: 13 px check in `ok` or `!` in `warn`, 12 px text. Use to state facts, never as interactive checkboxes.

### Progress

- Bar: 6 px, radius 3, track `bg.control-raised`, fill `fg.default`.
- Step list: done (green check), running (spinner ring, 600), to do (empty ring, `fg.tertiary`).
- Long work always shows what is happening right now in words, the progress, and *Run in background* when it takes more than a few seconds.

### Chat

- User bubble: right-aligned, white, radius 20 20 6 20, max 82%.
- Copilot bubble: left, `bg.control`, radius 18, max 92%, padding 12 × 14, line height 1.55. No avatar and no bot face.
- Structured answers: a sentence, then a check list, then inline actions.
- **Proposal card**: lists every difference as *old → new* with the new value in blue, warnings as amber checks, then Apply (primary), Discard, Edit by hand.
- Composer: placeholder specific to the workspace (*Describe a change to the world…*), `+` to attach, autonomy mode (*Ask before changes* ⌄), round white send button.
- Fade mask at the top of the message list; messages stick to the bottom.

### Dialogs and popovers

- **Modal**: centered, width from `size.dialog`, radius 22, padding 22, `bg.panel`, `line.strong`, `shadow.dialog`, scrim 60%. Title 18/600 left, close × right. Body sections 16 px apart. Buttons bottom-right.
- **Popover**: anchored to its trigger, radius 18, `shadow.popover`, scrim 35% only when it needs focus (training copies), none for menus.
- **Menu**: radius 16, items 9 × 10 padding with 16 px icon and shortcut right; destructive items last, after a divider.
- **Destructive confirmation**: title is a question (*Delete Park Pilot?*), the body says exactly what is lost and what stays, with sizes; Cancel is secondary, the confirm button is destructive.
- Escape closes, Enter confirms the primary, focus starts on the first field or the primary button.

### Banners and cards over the viewport

- **Blocking banner** (amber): sits at the top of the content it blocks, says what is blocked and why, and offers the fix (*Fix both for me*) and *Show me*.
- **Status card** over 3D: `bg.overlay`, radius 12, one bold line and one plain line (*You moved a parked car* / *It saw it at 0.4 m…*).
- **Preview pill**: blue text on overlay (*Preview of revision 15 · not applied yet*) whenever the viewport shows something that is not applied.

### Empty, loading, error and engine states

Every view that reads from the engine handles four states:

- **Loading**: skeleton of the real layout, never a spinner alone for more than a second.
- **Empty**: what this place is for, and one action (*You have no creations yet* + *Take the 3 minute tour*).
- **Error**: what failed in plain words, what is safe, the recovery action, technical details in mono below.
- **Engine down**: `SYS-ENGINE-DOWN`; nothing is lost and training resumes when the engine is back.

### Data visualization

- Line charts: 2 px line, 8% area fill, horizontal grid only, no axis titles; the current value large above the chart with a change pill.
- Bars: 6 px, radius 3; penalties in `warn` or `danger`.
- One series per meaning color; never a rainbow. Hover shows exact values.

## The 3D viewport

- Orientation gizmo top-right (60 px). Overlays: tool bar top-center or toolbar strip above, status card bottom-left, preview pill top-center.
- Selection outline white. Proposed objects ghosted in `proposal` blue. Sensor rays light grey, red when close.
- Every body uses the same materials (`scene.material.shell`, `scene.material.joint`) unless the project gives it a skin.
- The viewport never animates physics on its own: it replays engine states or streams them in Play.

## Play mode

- Core tools for every project: Move, Push, Add object, Light, Wind, Slow, Reset.
- Extra tools come from the body's senses and the world: Shadow (vision), Scent (smell), Touch (touch sensors), Shuffle (randomized worlds).
- *Add object* places the object chosen in a picker (a scent source, an obstacle, food, any library item); the hint near the cursor names it.
- Left panels are built from the body's components: What it senses always, What it decides for learned brains, Vision when there is a camera or eyes.
- Nothing done in Play changes the project. Turning a Play discovery into a change goes through the copilot (*Add to training*).

## Icons

Lucide only, stroke 1.75, `currentColor`. Sizes from `icon.size`. Icons accompany labels in toolbars, menus and lists; icon-only buttons need an `aria-label` and a tooltip. Brand marks only on sign-in.

## Writing

- English, sentence case, plain words. Write for a curious beginner; let experts open *Expert settings*.
- Say what happens and why: *Icarus will practice in 16 parking lots at once.*
- Buttons are verbs with an object when it helps: *Start run 4*, *Export animation*, *Delete project*.
- Numbers always have units and the context that makes them meaningful: *parks 71%*, *about 42 min on your computer*.
- Estimates say so (*about*, *expected*). Results never round up.
- Errors: what happened, what is safe, what to do. No blame, no exclamation marks, no apologies in loops.
- The copilot speaks in first person, short sentences, and never claims a result that is not in the data.

## Accessibility

- Text contrast at least 4.5:1 on its surface; `fg.disabled` is only for disabled content.
- Keyboard: every action reachable; visible focus ring; arrow keys move in lists, trees, tabs and segmented controls.
- Hit targets at least 28 px; the viewport tools at least 46 px tall.
- Never color alone: statuses carry a word or an icon.
- Respect reduced motion and system font scaling in panels.

## Code organization

- Each module in the catalog (`PNL-…`, `HDR-…`) is one folder under `apps/desktop/src/renderer/`; each tab (`TAB-…`) is one file in it, named after the tab (`reward-tab.tsx`).
- Screens (`SCR-…`) are routes that compose modules; states (`STA-…`) are the same route with different data; dialogs (`MOD-…`) and popovers (`POP-…`) live with the feature that opens them.
- Components read tokens only through Tailwind classes or the generated CSS variables. No hex values, no raw pixel values outside the spacing scale.
- New UI starts with its catalog entry: add the ID, purpose, modules and actions to `screens.md` before the code.

## Checklist for a new or changed screen

1. It has an ID in `screens.md`, with every action and where it leads.
2. Labels are generic; only data is specific.
3. One primary action; the header primary is the next step.
4. Every panel is a known module and every tab a known tab.
5. Loading, empty, error and engine-down states exist.
6. Every value comes from the engine or says it is an estimate.
7. It can be done by asking the copilot too.
8. Tokens only; keyboard and contrast checked.
