# ConfigHub UI Design System

Source of truth: `src/components/theme-provider/ThemeProvider.tsx`
Living demo: navigate to `/design-system` in the running app.

> **Maintenance rule:** If you change `ThemeProvider.tsx` — adding a token, changing a value, adding a component override — update the relevant table or section in this doc in the same commit. The doc and the theme must stay in sync.

---

## When to read this

- Before adding any new UI element or component
- Before picking a color, shadow, or spacing value
- When deciding which MUI component to use

---

## Design Tokens

All tokens live in the `tokens` object in `ThemeProvider.tsx` and are available two ways:

**In styled components / sx props:** use MUI theme aliases (e.g. `theme.palette.primary.main`)  
**In raw CSS:** use CSS custom properties injected on `:root` (e.g. `var(--rust)`)

### Surfaces & Backgrounds

| Token | Value | CSS var | Use for |
|-------|-------|---------|---------|
| `surface` | `#ffffff` | `--surface` | Cards, dialogs, paper |
| `bg` | `#f6f7f9` | `--bg` | Page background, input backgrounds |
| `bgHover` | `#f3f4f6` | `--bg-hover` | Hover states on rows/buttons |

### Borders

| Token | Value | CSS var | Use for |
|-------|-------|---------|---------|
| `bd0` | `#e6e8ec` | `--bd0` | Primary structural borders |
| `bd1` | `#eeeff3` | `--bd1` | Subtle dividers |
| `bd2` | `#f3f4f6` | `--bd2` | Hairline / near-invisible |

### Text

| Token | Value | CSS var | MUI alias | Use for |
|-------|-------|---------|-----------|---------|
| `t1` | `#111214` | `--t1` | `text.primary` | Primary text |
| `t2` | `#505969` | `--t2` | `text.secondary` | Secondary, labels |
| `t3` | `#8e9aaa` | `--t3` | `text.disabled` | Placeholders, captions |
| `t4` | `#bcc6d0` | `--t4` | — | Ghost / muted |

### Brand Color (Rust)

**Rust is an action signal only. Never use it for status indicators.**

| Token | Value | CSS var | MUI alias | Use for |
|-------|-------|---------|-----------|---------|
| `rust` | `#ba3d03` | `--rust` | `primary.main` | CTAs, active nav, selected state |
| `rustDark` | `#8c2c00` | `--rust-dark` | `primary.dark` | Hover on rust buttons |
| `rustBg` | `rgba(186,61,3,0.055)` | `--rust-bg` | `primary.light` | Selected row bg, chip bg |
| `rustRing` | `rgba(186,61,3,0.18)` | `--rust-ring` | — | Focused ring, chip border |

### Semantic Colors

Each semantic color has three variants: foreground, background tint, border.

| Meaning | Foreground | Bg tint | Border | MUI color |
|---------|-----------|---------|--------|-----------|
| Success / Ready | `--green` `#15803d` | `--green-bg` | `--green-bd` | `success` |
| Info / Applying | `--blue` `#1a50c1` | `--blue-bg` | `--blue-bd` | `info` |
| Upgrade / Premium | `--purple` `#6824c4` | `--purple-bg` | `--purple-bd` | `secondary` |
| Warning / Gated | `--amber` `#b45309` | `--amber-bg` | `--amber-bd` | `warning` |
| Error / Degraded | `--red` `#b91c1c` | `--red-bg` | `--red-bd` | `error` |

**Usage rule:** Match color to meaning, not to aesthetics. A "Degraded" status is always `error` (red). An "Applying" status is always `info` (blue).

### Shadows

| Token | CSS var | Use for |
|-------|---------|---------|
| `shXs` | `--sh-xs` | Subtle card lift |
| `shSm` | `--sh-sm` | Default Paper elevation |
| `shMd` | `--sh-md` | Popovers, menus, autocomplete |
| `shLg` | `--sh-lg` | Dialogs, drawers |
| `shSel` | `--sh-sel` | Rust ring + lift (selected/focused CTA) |

In MUI: use `elevation` prop. `elevation={2}` → shSm, `elevation={4}` → shMd, `elevation={8}` → shLg.

### Border Radius

| Token | Value | CSS var | Use for |
|-------|-------|---------|---------|
| `rSm` | `5px` | `--r-sm` | Buttons, inputs, chips, menus |
| `rMd` | `9px` | `--r-md` | Dialogs, cards, Paper |
| `rPill` | `999px` | `--r-pill` | Status chips, badges |

### Typography Scale

The font is **Manrope** (`--font-sans`). Never hardcode a font family — use `theme.typography.fontFamily` or `var(--font-sans)`.

| Variant | Size | Weight | Use for |
|---------|------|--------|---------|
| `h1` | 22px | 700 | Page titles |
| `h2` | 17px | 600 | Section headings |
| `h3` | 14px | 600 | Panel headings |
| `h4` | 13.5px | 600 | Sub-panel headings |
| `body1` | 13.5px | 400 | Default body text |
| `body2` | 12.5px | 400 | Dense/secondary body |
| `subtitle1` | 13px | 500 | Labels, field names |
| `subtitle2` | 12px | 500 | Smaller labels |
| `caption` | 10.5px | 700 | Section labels (uppercase) |
| `button` | 12.5px | 600 | Button text (no transform) |
| Mono | `--font-mono` | — | Code, slugs, IDs |

---

## Component Patterns

### Buttons

```tsx
// Primary CTA — rust fill
<Button variant="contained" color="primary">Add Unit</Button>

// Secondary — outlined, neutral border
<Button variant="outlined">Cancel</Button>

// Ghost — text only
<Button variant="text">Learn more</Button>

// Sizes: default=32px, small=26px, large=38px
// Prefer size="small" in dense UIs (toolbars, headers)
```

**Rules:**
- `contained primary` = rust background — use sparingly (one per screen region)
- Never set a custom `backgroundColor` on buttons; use `color` prop instead
- `disableElevation` is set globally — don't override it

### Icon Buttons

```tsx
<IconButton size="small">  // 24×24
<IconButton>               // 28×28 (default)
<IconButton size="large">  // 34×34
```

**Rules:**
- No border on icon buttons (globally removed in theme)
- Default color is `t3` (muted), hover shifts to `t2`
- For a rust-colored icon button, pass `color="primary"` explicitly

### Form Inputs

```tsx
<TextField size="small" />   // always size="small"
<Select size="small" />
<Autocomplete size="small" />
```

`MuiTextField` defaults to `size="small"` globally. All form components should use `size="small"` for visual consistency.

Input height: 34px. Focused border becomes rust. Error border becomes red.

### Chips / Status Badges

Use the MUI `color` prop — it maps to the semantic palette automatically:

```tsx
<Chip label="Ready" color="success" />     // green
<Chip label="Applying" color="info" />     // blue
<Chip label="Degraded" color="error" />    // red
<Chip label="Gated" color="warning" />     // amber
<Chip label="Upgrade" color="secondary" /> // purple
<Chip label="Active" color="primary" />    // rust (selection only)
<Chip label="Neutral" />                   // grey (default)
```

Never set a manual `sx={{ backgroundColor: '#...' }}` on a chip. Use the `color` prop.

`size="small"` → 18px height. Default → 22px. Use `rPill` shape (set globally).

### Flat Link Chip

A flat, borderless-feeling card that reads as a navigational affordance: a small two-line block that points somewhere else. Used for the Upstream/Downstream relationship chips and the Head/Live/Last-Applied revision cards in the unit details pane. The defining trait is that it is **flat — no shadow, no lift.** Depth comes only from a 1px hairline border; hover is a color change, not an elevation change.

```tsx
// Recipe (see UnitDetailsPane.tsx `chipSx` / RevisionsGrid.tsx `RevisionCell`)
<Box
  component="a"                                   // an anchor when it links somewhere
  href={href}
  sx={{
    display: 'flex',
    flexDirection: 'column',
    padding: '5px 10px',                          // py 5px / px 10px
    border: '1px solid var(--bd1)',               // borderMuted hairline
    borderRadius: 'var(--r-md)',                  // rMd — 9px
    background: 'var(--surface)',                 // bgDefault (#fff)
    textDecoration: 'none',
    // FLAT: no boxShadow, no translate on hover — this is what separates it
    // from an elevated Paper card. Hover is color-only.
    cursor: 'pointer',
    transition: 'border-color 0.12s, background 0.12s',
    '&:hover': {
      borderColor: 'var(--rust)',                 // accent
      background: 'var(--rust-bg)',               // accentMuted — faint tint
    },
  }}
>
  {/* Line 1 — small uppercase muted label */}
  <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--t3)' }}>
    Head
  </Typography>
  {/* Line 2 — bold value; mono for identifiers (slugs, revision numbers) */}
  <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
    r42
  </Typography>
</Box>
```

**Recipe (exact tokens):**

| Property | Token | Value |
|----------|-------|-------|
| Border | `bd1` / `borderMuted` | `1px solid #eeeff3` |
| Radius | `rMd` / `radiusMd` | `9px` |
| Background | `surface` / `bgDefault` | `#ffffff` |
| Elevation | — | **none — flat, no `boxShadow`** |
| Padding | — | `5px` (y) / `10px` (x) |
| Hover border | `rust` / `accent` | `#ba3d03` |
| Hover background | `rustBg` / `accentMuted` | `rgba(186,61,3,0.055)` |
| Transition | — | `border-color 0.12s, background 0.12s` |
| Label (line 1) | `t3` / `fgSubtle` | `10px / 700 / uppercase / letter-spacing 0.06em` |
| Value (line 2) | `t1` / `fgDefault` | `13px / 600`, `--font-mono` for identifiers |

> Token names differ by module: the component view (`src/pages/x/apps/componentTheme.ts`) calls these `borderMuted`, `radiusMd`, `bgDefault`, `accent`, `accentMuted`, `fgSubtle`, `fgDefault`. They resolve to the same values as the `ThemeProvider` tokens above.

**Variants:**

- **Clickable (default)** — rendered as `component="a"` with an `href`; has `cursor: pointer` and the color-only hover.
- **Selected / active** — rest state already wears the accent border + `rustBg` tint (the hover look, applied persistently). Relationship chips use this to mark the active target.
- **Disabled / non-clickable** — rendered as a plain `div` (no `href`), `opacity: 0.6`, no hover, no pointer. Use when there is no target to link to (e.g. a revision that was never applied).

**Canonical examples:**

- `src/pages/x/apps/UnitDetailsPane.tsx` — the `chipSx` shared style for the Upstream/Downstream relationship chips.
- `src/pages/x/apps/unit-details/RevisionsGrid.tsx` — the Head/Live/Last-Applied revision cards, including the `opacity: 0.6` non-clickable variant.

**When to use it — flat link chip vs. elevated Paper card:**

- **Flat link chip** — for dense, inline, *navigational* affordances and metadata that point elsewhere: relationships, revisions, references, cross-space links. These live **inside** a panel and take you to another view. They must not compete with the panel's own elevation, so they stay flat and lean on the hairline border + color hover.
- **Elevated Paper card** (`rMd` + `shSm`/`elevation`, see Node Cards) — for standalone content surfaces and panels that need to separate from the page background as their own object. Reach for elevation when the card *is* the content, not a pointer to it.
- When there is nothing to link to, use the **disabled variant** (opacity 0.6, no hover) rather than an elevated card or a bare label — it keeps the row's shape and alignment while signalling "no target".

### Menus & Dropdowns

```tsx
<Menu>
  <MenuItem>Option</MenuItem>
</Menu>
```

Theme applies: `rSm` radius, `shMd` shadow, `bd0` border, `minWidth: 160`. Don't override these.

Selected item: `rustBg` background, rust text.

### Dialogs

```tsx
<Dialog>
  <DialogTitle>Title</DialogTitle>
  <DialogContent>Content</DialogContent>
  <DialogActions>
    <Button variant="outlined">Cancel</Button>
    <Button variant="contained">Confirm</Button>
  </DialogActions>
</Dialog>
```

Theme applies: `rMd` radius, `shLg` shadow, `bd0` border, `blur(2px)` backdrop. Primary action goes last (rightmost).

### Drawers

```tsx
<Drawer anchor='right' open={isOpen} onClose={handleClose}
  sx={{ '& .MuiDrawer-paper': { width: { xs: 1000 } } }}>
  <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>...</Box>
</Drawer>
```

Theme applies: `shLg` shadow, `bd0` left border, and — for `anchor='right'` only — a
`TOP_NAV_HEIGHT` (48px) top offset with a matching `height: calc(100% - 48px)` on the paper,
plus the same offset on the modal root and backdrop. The top AppBar sits at
`theme.zIndex.drawer + 1`, so without the offset it would cover the drawer's header (and its
"Back to …" control) and the backdrop would swallow clicks meant for the nav. The result is:
nav stays visible **and** clickable while a drawer is open.

Consequences for drawer content:
- **Do not set `height` / `maxHeight` on `.MuiDrawer-paper`** — the theme sizes it. Lay content
  out with `height: '100%'` + flex column so headers and footers stay pinned.
- Any inner `calc(100vh - Npx)` must also subtract `TOP_NAV_HEIGHT` (import it from
  `@/utility/constants`), otherwise the pane overflows the shortened paper.

Left/top/bottom-anchored and docked-left drawers keep MUI's default geometry.

### Tooltips

```tsx
<Tooltip title="Explanation" enterDelay={400}>
  <IconButton>...</IconButton>
</Tooltip>
```

No arrow by default (`arrow: false`). Dark background (`t1`), 400ms enter delay. Don't override these
defaults — but only for what a tooltip is actually for: **a single short label** ("Open in new tab",
"Copy link"). The moment the content has structure — a name, a state, a number, more than one
line — the dark bubble stops being legible and reads as an afterthought. Use an **Informational
Popout** instead. **Always use nice styling for informational popouts** — never the plain dark
tooltip — for anything beyond a one-line label.

### Informational Popouts (Peek Cards)

```tsx
import Tooltip from '@mui/material/Tooltip';
import { INFO_PEEK_TOOLTIP_SX, InfoPeekCard } from '@/components/info-peek/InfoPeek';

<Tooltip
  placement="bottom-start"
  enterDelay={120}
  leaveDelay={0}
  disableInteractive
  slotProps={{ tooltip: { sx: INFO_PEEK_TOOLTIP_SX }, transition: { timeout: { enter: 120, exit: 0 } } }}
  title={
    <InfoPeekCard
      color={theme.palette.primary.main}
      spec={{
        eyebrow: 'Stale · behind upstream',
        metric: { value: '3', unit: 'revisions behind' },
        lines: ['Last changed 2 days ago'],
        action: 'Review & upgrade', // optional — omit for a purely informational peek
      }}
    />
  }
>
  <StatusChip>...</StatusChip>
</Tooltip>
```

A light, bordered card (white background, 1px border, 9px radius, soft shadow) that replaces MUI's
dark Tooltip bubble whenever the hover content needs real structure: an eyebrow label, an optional
hero metric, one or more supporting lines, and an optional accent action hint. It renders content
only — `INFO_PEEK_TOOLTIP_SX` on the wrapping `Tooltip`'s `slotProps.tooltip` supplies the card's
own chrome, so don't add another border/shadow around it.

This is a pure hover preview: `disableInteractive` + a 0ms exit means it disappears the instant the
pointer leaves — it is not a menu, has no interactive children of its own, and never traps focus. If
the content needs to stay open for a click or hold interactive controls (a switch, a button), that's
a `Popover`, not a peek — see the promotion-edge auto-upgrade menu
(`src/pages/x/apps/flow-graph/PromotionEdge.tsx`) for that pattern, which borrows the same header/
row visual language (icon chip, eyebrow, muted supporting text) without literally reusing this
component.

Originated on the component-view flow-graph node chips (Stale / Live / Synced / Release —
`DeploymentFlowNode.tsx`); pulled out to `src/components/info-peek/InfoPeek.tsx` so any feature can
reuse the same "nice popout" recipe instead of re-inventing tooltip styling per page.

### Tabs

```tsx
<Tabs value={tab} onChange={handleChange}>
  <Tab label="All" value="all" />
  <Tab label="Target" value="target" />
</Tabs>
```

Active tab: rust indicator (2px), rust text, font-weight 600. Tab height: 40px.

### Alerts

```tsx
<Alert severity="success">Unit applied</Alert>
<Alert severity="error">Apply failed</Alert>
<Alert severity="warning">Upgrade required</Alert>
<Alert severity="info">Applying...</Alert>
```

Theme adds a 3px colored left border and semantic background tint. Use `standard` variant (default).

---

## Layout

### Top AppBar
- Background: rust (`#ba3d03`)
- Height: 48px
- Contains: logo, nav links, feedback/discord/docs links, user avatar
- The user avatar lives **only here** — do not add account controls to page headers

### Content Area
- Background: `#f9fafb`
- Sits below the AppBar with `border-top-left-radius: 6px; border-top-right-radius: 6px`
- This creates the Chrome-style tab visual connecting the nav to the page

### Page Header
- Sticky, white background (with `blur(8px)` when scrolling)
- Contains: organization switcher → breadcrumbs → copy-link icon (all in one flex row on the left)
- The organization switcher (`components/organization-switcher/`) shows the current org name and a menu with one action, "Switch organization", which starts a fresh login so the identity provider does the picking. It never lists organizations.
- Right side: action buttons (Add, More menu)
- No account/user controls in page headers

---

## What NOT to Do

| Don't | Do instead |
|-------|-----------|
| `color: '#ba3d03'` | `color: 'primary.main'` or `color: theme.palette.primary.main` |
| `backgroundColor: '#f6f7f9'` | `bgcolor: 'background.default'` |
| `fontFamily: 'Roboto'` | `fontFamily: theme.typography.fontFamily` |
| Rust on a status badge | Use `color="success/error/warning/info"` |
| Border on an IconButton | Don't — theme removes them globally |
| `size="medium"` on form inputs | Use `size="small"` |
| Hardcoded `boxShadow` strings | Use `tokens.shMd` (in ThemeProvider) or `elevation` prop |
| Custom `borderRadius` numbers | Use `theme.shape.borderRadius` (rSm) or `tokens.rMd` |
| Nested ternaries in JSX | Early return `null` for conditional rendering |
