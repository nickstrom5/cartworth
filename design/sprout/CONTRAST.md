# Sprout contrast

Every foreground/background pair the Sprout system defines, in light and dark, measured with the
WCAG 2.x relative-luminance formula. Nothing here was eyeballed: the table is generated from
`tokens.css` by `contrast.mjs` (kept in the session scratchpad at
`/private/tmp/claude-501/-Users-nicksoderstrom-Developer-claudecode/5eef7220-fae0-4c59-bb5b-8a9173e2aaf1/scratchpad/sprout/contrast.mjs`;
copy it into `basket/scripts/` to keep it). The script resolves the role aliases (for example
`--sp-price-best` is `--sp-accent`) for each theme and rounds ratios **down** to two places, so a
printed 4.50 is never really 4.499.

Rerun it after changing any colour token: `node contrast.mjs`. It exits non-zero on a failure.

## Result

- Required pairs: **76** (38 per theme). Failing: **0**.
- Dark palette: the `prefers-color-scheme` copy and the `[data-theme="dark"]` copy are identical.
- Light tokens with no dark counterpart: none.

**Thresholds.** Text 4.5:1. Large text (at least 24px, or bold at least 18.7px; that is the prices)
would be allowed 3:1 by WCAG, but Sprout holds it to 4.5:1 as well. Non-text UI (a control's
boundary, a selected or current state, the focus ring, an icon that identifies a control) 3:1.
Decorative pairs are reported for the record and have no minimum: WCAG does not ask for contrast on
dividers, logos, disabled controls, or colour that repeats information already given in text.

### Worst three required pairs (least headroom over their minimum)

1. light: `--sp-price-best` #1C7C4B on `--sp-mint` #E6F4EA = **4.58:1** (min 4.5:1), Best price in the hero (50-80px bold)
2. light: `--sp-control-edge` #7A8981 on `--sp-surface-soft` #F3F6F4 = **3.37:1** (min 3:1), Search field edge (against its own fill)
3. light: `--sp-accent-ink` #FFFFFF on `--sp-accent` #1C7C4B = **5.20:1** (min 4.5:1), Primary button label

### Worst three text pairs

1. light: `--sp-price-best` #1C7C4B on `--sp-mint` #E6F4EA = **4.58:1** (min 4.5:1), Best price in the hero (50-80px bold)
2. light: `--sp-accent-ink` #FFFFFF on `--sp-accent` #1C7C4B = **5.20:1** (min 4.5:1), Primary button label
3. light: `--sp-price-best` #1C7C4B on `--sp-bg` #FFFFFF = **5.20:1** (min 4.5:1), Best price in its row (23-26px bold)

## Light

| Foreground | Background | Used for | Kind | Ratio | Min | Result |
|---|---|---|---|--:|--:|---|
| `--sp-ink` #1E2A24 | `--sp-bg` #FFFFFF | Body text, store names, headings, row prices | Text | 14.87:1 | 4.5:1 | Pass |
| `--sp-ink` #1E2A24 | `--sp-surface` #FFFFFF | Text in cards and on the tab bar | Text | 14.87:1 | 4.5:1 | Pass |
| `--sp-ink` #1E2A24 | `--sp-surface-soft` #F3F6F4 | Search input text, location pill, ghost/secondary button on hover | Text | 13.66:1 | 4.5:1 | Pass |
| `--sp-ink` #1E2A24 | `--sp-surface-tag` #F0F3F1 | "Shelf price" tag | Text | 13.31:1 | 4.5:1 | Pass |
| `--sp-ink` #1E2A24 | `--sp-on-tint` #FFFFFF | "Shelf price" tag inside the hero | Text | 14.87:1 | 4.5:1 | Pass |
| `--sp-ink` #1E2A24 | `--sp-mint` #E6F4EA | Hero text and "/lb", current nav label | Text | 13.09:1 | 4.5:1 | Pass |
| `--sp-ink-2` #55635C | `--sp-bg` #FFFFFF | Secondary text: item names, "/lb" in rows, "per lb", inactive nav, was-price | Text | 6.31:1 | 4.5:1 | Pass |
| `--sp-ink-2` #55635C | `--sp-surface` #FFFFFF | Inactive tab labels | Text | 6.31:1 | 4.5:1 | Pass |
| `--sp-ink-2` #55635C | `--sp-surface-soft` #F3F6F4 | Search placeholder | Text | 5.80:1 | 4.5:1 | Pass |
| `--sp-ink-3` #5F6C66 | `--sp-bg` #FFFFFF | Capture-date footnote | Text | 5.49:1 | 4.5:1 | Pass |
| `--sp-accent-ink` #FFFFFF | `--sp-accent` #1C7C4B | Primary button label | Text | 5.20:1 | 4.5:1 | Pass |
| `--sp-accent-ink` #FFFFFF | `--sp-accent-hover` #176A40 | Primary button label, hovered or pressed | Text | 6.62:1 | 4.5:1 | Pass |
| `--sp-price-best` #1C7C4B | `--sp-bg` #FFFFFF | Best price in its row (23-26px bold) | Large text | 5.20:1 | 4.5:1 | Pass |
| `--sp-price-best` #1C7C4B | `--sp-mint` #E6F4EA | Best price in the hero (50-80px bold) | Large text | 4.58:1 | 4.5:1 | Pass |
| `--sp-mint-ink` #185C3A | `--sp-mint` #E6F4EA | Savings line in the hero, selected chip label | Text | 7.02:1 | 4.5:1 | Pass |
| `--sp-mint-ink` #185C3A | `--sp-on-tint` #FFFFFF | "Best price" eyebrow | Text | 7.98:1 | 4.5:1 | Pass |
| `--sp-peach-ink` #8B3A0F | `--sp-peach` #FFE9DD | Sale tag, Weekly ad tag, deals card icon | Text | 6.62:1 | 4.5:1 | Pass |
| `--sp-sky-ink` #1D4E7E | `--sp-sky` #E8F1FB | "Online · Instacart" tag | Text | 7.53:1 | 4.5:1 | Pass |
| `--sp-sky-ink` #1D4E7E | `--sp-surface` #FFFFFF | "National" tag | Text | 8.59:1 | 4.5:1 | Pass |
| `--sp-warn-ink` #6B4A00 | `--sp-warn` #FFF3D1 | "Price looks wrong" flag | Text | 7.29:1 | 4.5:1 | Pass |
| `--sp-link-hover` #1C7C4B | `--sp-bg` #FFFFFF | Link, hovered | Text | 5.20:1 | 4.5:1 | Pass |
| `--sp-store-0-ink` #4A4945 | `--sp-store-0-tint` #EEEEED | Monogram letters, store slot 0 | Text | 7.76:1 | 4.5:1 | Pass |
| `--sp-store-1-ink` #714B00 | `--sp-store-1-tint` #FCF0D6 | Monogram letters, store slot 1 | Text | 6.85:1 | 4.5:1 | Pass |
| `--sp-store-2-ink` #004B78 | `--sp-store-2-tint` #DCEBF6 | Monogram letters, store slot 2 | Text | 7.57:1 | 4.5:1 | Pass |
| `--sp-store-3-ink` #00573F | `--sp-store-3-tint` #DDF2EA | Monogram letters, store slot 3 | Text | 7.37:1 | 4.5:1 | Pass |
| `--sp-store-4-ink` #7C305B | `--sp-store-4-tint` #F7E7F0 | Monogram letters, store slot 4 | Text | 7.25:1 | 4.5:1 | Pass |
| `--sp-store-5-ink` #8A3C00 | `--sp-store-5-tint` #FBE5D6 | Monogram letters, store slot 5 | Text | 6.33:1 | 4.5:1 | Pass |
| `--sp-store-6-ink` #11587F | `--sp-store-6-tint` #E0F1FB | Monogram letters, store slot 6 | Text | 6.65:1 | 4.5:1 | Pass |
| `--sp-store-7-ink` #5B5719 | `--sp-store-7-tint` #FBF7D0 | Monogram letters, store slot 7 | Text | 6.84:1 | 4.5:1 | Pass |
| `--sp-store-8-ink` #2B2B2B | `--sp-store-8-tint` #E5E5E5 | Monogram letters, store slot 8 | Text | 11.24:1 | 4.5:1 | Pass |
| `--sp-control-edge` #7A8981 | `--sp-bg` #FFFFFF | Chip outline, secondary button edge, search field edge (against the page) | Non-text UI | 3.66:1 | 3:1 | Pass |
| `--sp-control-edge` #7A8981 | `--sp-surface-soft` #F3F6F4 | Search field edge (against its own fill) | Non-text UI | 3.37:1 | 3:1 | Pass |
| `--sp-selected-edge` #49966F | `--sp-bg` #FFFFFF | Selected chip, current nav pill, current tab (against the page) | Non-text UI | 3.57:1 | 3:1 | Pass |
| `--sp-focus` #1C7C4B | `--sp-bg` #FFFFFF | Focus ring on the page | Non-text UI | 5.20:1 | 3:1 | Pass |
| `--sp-focus` #1C7C4B | `--sp-mint` #E6F4EA | Focus ring inside the hero | Non-text UI | 4.58:1 | 3:1 | Pass |
| `--sp-accent` #1C7C4B | `--sp-bg` #FFFFFF | Primary button fill (its boundary) | Non-text UI | 5.20:1 | 3:1 | Pass |
| `--sp-ink-2` #55635C | `--sp-surface-soft` #F3F6F4 | Magnifier icon in the search field | Non-text UI | 5.80:1 | 3:1 | Pass |
| `--sp-warn-edge` #9A6B00 | `--sp-bg` #FFFFFF | "Price looks wrong" outline (against the page) | Non-text UI | 4.69:1 | 3:1 | Pass |

## Dark

| Foreground | Background | Used for | Kind | Ratio | Min | Result |
|---|---|---|---|--:|--:|---|
| `--sp-ink` #E6EFEA | `--sp-bg` #111814 | Body text, store names, headings, row prices | Text | 15.36:1 | 4.5:1 | Pass |
| `--sp-ink` #E6EFEA | `--sp-surface` #111814 | Text in cards and on the tab bar | Text | 15.36:1 | 4.5:1 | Pass |
| `--sp-ink` #E6EFEA | `--sp-surface-soft` #1A2320 | Search input text, location pill, ghost/secondary button on hover | Text | 13.71:1 | 4.5:1 | Pass |
| `--sp-ink` #E6EFEA | `--sp-surface-tag` #1F2924 | "Shelf price" tag | Text | 12.77:1 | 4.5:1 | Pass |
| `--sp-ink` #E6EFEA | `--sp-on-tint` #111814 | "Shelf price" tag inside the hero | Text | 15.36:1 | 4.5:1 | Pass |
| `--sp-ink` #E6EFEA | `--sp-mint` #183124 | Hero text and "/lb", current nav label | Text | 11.90:1 | 4.5:1 | Pass |
| `--sp-ink-2` #9EADA5 | `--sp-bg` #111814 | Secondary text: item names, "/lb" in rows, "per lb", inactive nav, was-price | Text | 7.70:1 | 4.5:1 | Pass |
| `--sp-ink-2` #9EADA5 | `--sp-surface` #111814 | Inactive tab labels | Text | 7.70:1 | 4.5:1 | Pass |
| `--sp-ink-2` #9EADA5 | `--sp-surface-soft` #1A2320 | Search placeholder | Text | 6.87:1 | 4.5:1 | Pass |
| `--sp-ink-3` #8E9D95 | `--sp-bg` #111814 | Capture-date footnote | Text | 6.36:1 | 4.5:1 | Pass |
| `--sp-accent-ink` #07170F | `--sp-accent` #5CC592 | Primary button label | Text | 8.65:1 | 4.5:1 | Pass |
| `--sp-accent-ink` #07170F | `--sp-accent-hover` #7AD4A7 | Primary button label, hovered or pressed | Text | 10.36:1 | 4.5:1 | Pass |
| `--sp-price-best` #5CC592 | `--sp-bg` #111814 | Best price in its row (23-26px bold) | Large text | 8.46:1 | 4.5:1 | Pass |
| `--sp-price-best` #5CC592 | `--sp-mint` #183124 | Best price in the hero (50-80px bold) | Large text | 6.55:1 | 4.5:1 | Pass |
| `--sp-mint-ink` #8FDDB4 | `--sp-mint` #183124 | Savings line in the hero, selected chip label | Text | 8.75:1 | 4.5:1 | Pass |
| `--sp-mint-ink` #8FDDB4 | `--sp-on-tint` #111814 | "Best price" eyebrow | Text | 11.30:1 | 4.5:1 | Pass |
| `--sp-peach-ink` #FFBC98 | `--sp-peach` #3A2519 | Sale tag, Weekly ad tag, deals card icon | Text | 8.84:1 | 4.5:1 | Pass |
| `--sp-sky-ink` #A9CDF5 | `--sp-sky` #172A3F | "Online · Instacart" tag | Text | 8.84:1 | 4.5:1 | Pass |
| `--sp-sky-ink` #A9CDF5 | `--sp-surface` #111814 | "National" tag | Text | 10.93:1 | 4.5:1 | Pass |
| `--sp-warn-ink` #F4CB63 | `--sp-warn` #352A0E | "Price looks wrong" flag | Text | 9.11:1 | 4.5:1 | Pass |
| `--sp-link-hover` #5CC592 | `--sp-bg` #111814 | Link, hovered | Text | 8.46:1 | 4.5:1 | Pass |
| `--sp-store-0-ink` #C9C7C4 | `--sp-store-0-tint` #2D322D | Monogram letters, store slot 0 | Text | 7.75:1 | 4.5:1 | Pass |
| `--sp-store-1-ink` #F1CA73 | `--sp-store-1-tint` #3C3310 | Monogram letters, store slot 1 | Text | 8.03:1 | 4.5:1 | Pass |
| `--sp-store-2-ink` #9BCAEC | `--sp-store-2-tint` #1C333C | Monogram letters, store slot 2 | Text | 7.58:1 | 4.5:1 | Pass |
| `--sp-store-3-ink` #73CAB2 | `--sp-store-3-tint` #0E3327 | Monogram letters, store slot 3 | Text | 7.11:1 | 4.5:1 | Pass |
| `--sp-store-4-ink` #E3B5CF | `--sp-store-4-tint` #362B31 | Monogram letters, store slot 4 | Text | 7.61:1 | 4.5:1 | Pass |
| `--sp-store-5-ink` #EFB183 | `--sp-store-5-tint` #3B2A16 | Monogram letters, store slot 5 | Text | 7.38:1 | 4.5:1 | Pass |
| `--sp-store-6-ink` #A2D6F3 | `--sp-store-6-tint` #1F373F | Monogram letters, store slot 6 | Text | 8.02:1 | 4.5:1 | Pass |
| `--sp-store-7-ink` #F7F097 | `--sp-store-7-tint` #3E411D | Monogram letters, store slot 7 | Text | 9.02:1 | 4.5:1 | Pass |
| `--sp-store-8-ink` #ECECEC | `--sp-store-8-tint` #3A3F3C | Monogram letters, store slot 8 | Text | 9.08:1 | 4.5:1 | Pass |
| `--sp-control-edge` #6F8078 | `--sp-bg` #111814 | Chip outline, secondary button edge, search field edge (against the page) | Non-text UI | 4.32:1 | 3:1 | Pass |
| `--sp-control-edge` #6F8078 | `--sp-surface-soft` #1A2320 | Search field edge (against its own fill) | Non-text UI | 3.85:1 | 3:1 | Pass |
| `--sp-selected-edge` #4DA279 | `--sp-bg` #111814 | Selected chip, current nav pill, current tab (against the page) | Non-text UI | 5.80:1 | 3:1 | Pass |
| `--sp-focus` #5CC592 | `--sp-bg` #111814 | Focus ring on the page | Non-text UI | 8.46:1 | 3:1 | Pass |
| `--sp-focus` #5CC592 | `--sp-mint` #183124 | Focus ring inside the hero | Non-text UI | 6.55:1 | 3:1 | Pass |
| `--sp-accent` #5CC592 | `--sp-bg` #111814 | Primary button fill (its boundary) | Non-text UI | 8.46:1 | 3:1 | Pass |
| `--sp-ink-2` #9EADA5 | `--sp-surface-soft` #1A2320 | Magnifier icon in the search field | Non-text UI | 6.87:1 | 3:1 | Pass |
| `--sp-warn-edge` #A88230 | `--sp-bg` #111814 | "Price looks wrong" outline (against the page) | Non-text UI | 5.06:1 | 3:1 | Pass |

## Decorative pairs (reported, no minimum)

The monogram rings are the store's own Okabe-Ito colour so they match the rest of the product, and
on white several are under 3:1 (the yellow and sky slots most of all). That is acceptable only
because the ring never carries the identity: the letters do (every letter pair above passes), and
the store's name is always printed next to the monogram. Do not use a ring colour for text or as the
only marker of anything.

### Light

| Foreground | Background | Used for | Kind | Ratio | Min | Result |
|---|---|---|---|--:|--:|---|
| `--sp-hairline` #E6EAE8 | `--sp-bg` #FFFFFF | Row dividers, card outline, header/tab bar rules | Decorative | 1.21:1 | n/a | reported |
| `--sp-mint` #E6F4EA | `--sp-bg` #FFFFFF | Hero block, current-state fill (the selected edge carries the state) | Decorative | 1.13:1 | n/a | reported |
| `--sp-peach` #FFE9DD | `--sp-bg` #FFFFFF | Peach tint block | Decorative | 1.16:1 | n/a | reported |
| `--sp-sky` #E8F1FB | `--sp-bg` #FFFFFF | Sky tint block | Decorative | 1.14:1 | n/a | reported |
| `--sp-surface-soft` #F3F6F4 | `--sp-bg` #FFFFFF | Search field fill (the control edge carries the boundary) | Decorative | 1.08:1 | n/a | reported |
| `--sp-warn-edge` #9A6B00 | `--sp-warn` #FFF3D1 | "Price looks wrong" outline against its own fill | Decorative | 4.24:1 | n/a | reported |
| `--sp-sky-edge` #6E95BE | `--sp-surface` #FFFFFF | "National" dashed outline (the text carries the meaning) | Decorative | 3.13:1 | n/a | reported |
| `--sp-mark-stem` #1C7C4B | `--sp-bg` #FFFFFF | Sprout mark stroke (logo, exempt) | Decorative | 5.20:1 | n/a | reported |
| `--sp-hairline-strong` #D3DCD7 | `--sp-bg` #FFFFFF | Disabled control edge (disabled controls are exempt) | Decorative | 1.40:1 | n/a | reported |
| `--sp-ink-3` #5F6C66 | `--sp-surface-tag` #F0F3F1 | Disabled button label (exempt, still readable) | Decorative | 4.91:1 | n/a | reported |
| `--sp-store-0` #898781 | `--sp-bg` #FFFFFF | Monogram ring, slot 0 (identity is the letters) | Decorative | 3.59:1 | n/a | reported |
| `--sp-store-1` #E69F00 | `--sp-bg` #FFFFFF | Monogram ring, slot 1 (identity is the letters) | Decorative | 2.25:1 | n/a | reported |
| `--sp-store-2` #0072B2 | `--sp-bg` #FFFFFF | Monogram ring, slot 2 (identity is the letters) | Decorative | 5.18:1 | n/a | reported |
| `--sp-store-3` #009E73 | `--sp-bg` #FFFFFF | Monogram ring, slot 3 (identity is the letters) | Decorative | 3.42:1 | n/a | reported |
| `--sp-store-4` #CC79A7 | `--sp-bg` #FFFFFF | Monogram ring, slot 4 (identity is the letters) | Decorative | 3.06:1 | n/a | reported |
| `--sp-store-5` #D55E00 | `--sp-bg` #FFFFFF | Monogram ring, slot 5 (identity is the letters) | Decorative | 3.86:1 | n/a | reported |
| `--sp-store-6` #56B4E9 | `--sp-bg` #FFFFFF | Monogram ring, slot 6 (identity is the letters) | Decorative | 2.30:1 | n/a | reported |
| `--sp-store-7` #F0E442 | `--sp-bg` #FFFFFF | Monogram ring, slot 7 (identity is the letters) | Decorative | 1.32:1 | n/a | reported |
| `--sp-store-8` #3A3A3A | `--sp-bg` #FFFFFF | Monogram ring, slot 8 (identity is the letters) | Decorative | 11.37:1 | n/a | reported |

### Dark

| Foreground | Background | Used for | Kind | Ratio | Min | Result |
|---|---|---|---|--:|--:|---|
| `--sp-hairline` #2A3530 | `--sp-bg` #111814 | Row dividers, card outline, header/tab bar rules | Decorative | 1.41:1 | n/a | reported |
| `--sp-mint` #183124 | `--sp-bg` #111814 | Hero block, current-state fill (the selected edge carries the state) | Decorative | 1.29:1 | n/a | reported |
| `--sp-peach` #3A2519 | `--sp-bg` #111814 | Peach tint block | Decorative | 1.25:1 | n/a | reported |
| `--sp-sky` #172A3F | `--sp-bg` #111814 | Sky tint block | Decorative | 1.23:1 | n/a | reported |
| `--sp-surface-soft` #1A2320 | `--sp-bg` #111814 | Search field fill (the control edge carries the boundary) | Decorative | 1.12:1 | n/a | reported |
| `--sp-warn-edge` #A88230 | `--sp-warn` #352A0E | "Price looks wrong" outline against its own fill | Decorative | 3.96:1 | n/a | reported |
| `--sp-sky-edge` #4F7AA6 | `--sp-surface` #111814 | "National" dashed outline (the text carries the meaning) | Decorative | 4.00:1 | n/a | reported |
| `--sp-mark-stem` #5CC592 | `--sp-bg` #111814 | Sprout mark stroke (logo, exempt) | Decorative | 8.46:1 | n/a | reported |
| `--sp-hairline-strong` #34403A | `--sp-bg` #111814 | Disabled control edge (disabled controls are exempt) | Decorative | 1.66:1 | n/a | reported |
| `--sp-ink-3` #8E9D95 | `--sp-surface-tag` #1F2924 | Disabled button label (exempt, still readable) | Decorative | 5.28:1 | n/a | reported |
| `--sp-store-0` #9C9A93 | `--sp-bg` #111814 | Monogram ring, slot 0 (identity is the letters) | Decorative | 6.40:1 | n/a | reported |
| `--sp-store-1` #E69F00 | `--sp-bg` #111814 | Monogram ring, slot 1 (identity is the letters) | Decorative | 8.00:1 | n/a | reported |
| `--sp-store-2` #4A9FDC | `--sp-bg` #111814 | Monogram ring, slot 2 (identity is the letters) | Decorative | 6.25:1 | n/a | reported |
| `--sp-store-3` #009E73 | `--sp-bg` #111814 | Monogram ring, slot 3 (identity is the letters) | Decorative | 5.27:1 | n/a | reported |
| `--sp-store-4` #CC79A7 | `--sp-bg` #111814 | Monogram ring, slot 4 (identity is the letters) | Decorative | 5.89:1 | n/a | reported |
| `--sp-store-5` #E2711D | `--sp-bg` #111814 | Monogram ring, slot 5 (identity is the letters) | Decorative | 5.67:1 | n/a | reported |
| `--sp-store-6` #56B4E9 | `--sp-bg` #111814 | Monogram ring, slot 6 (identity is the letters) | Decorative | 7.81:1 | n/a | reported |
| `--sp-store-7` #F0E442 | `--sp-bg` #111814 | Monogram ring, slot 7 (identity is the letters) | Decorative | 13.63:1 | n/a | reported |
| `--sp-store-8` #DDDDDD | `--sp-bg` #111814 | Monogram ring, slot 8 (identity is the letters) | Decorative | 13.27:1 | n/a | reported |

## What changed from the mockups to pass

The mockups' own text pairs all passed as drawn. Three non-text details did not:

| Mockup | Ratio | Now | Why |
|---|--:|---|---|
| Chip outline `#D3DCD7` | 1.40:1 | `--sp-control-edge` `#7A8981`, 3.67:1 | The outline is what marks a chip as a control (WCAG 1.4.11). |
| Search field: `#F3F6F4` fill, no edge | 1.09:1 | Same fill plus a 1px `--sp-control-edge` | A field has to show where it is. |
| Current nav pill, current tab, (unshown) selected chip: mint fill only | 1.14:1 | Mint fill plus a 1px `--sp-selected-edge` `#49966F`, 3.57:1 | A selected or current state has to be visible without relying on a 1.14:1 fill. Bold weight and the chip's check mark are the non-colour cues. |
