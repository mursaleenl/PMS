# UI Design Guidelines & Preferences

## 1. Strictly Black & White / Monochrome Palette
- **No unnecessary colors**: Avoid bright primary or saturated colors (blues, greens, reds, yellows, purples) across all UI elements, cards, badges, pills, buttons, and alerts.
- **Palette**: Use pure white (`#ffffff`), deep black (`#000000`, `#0f172a`, `#111827`), and clean neutral zinc/slate grays (`#f8fafc`, `#f4f4f5`, `#e2e8f0`, `#e4e4e7`, `#64748b`, `#71717a`).
- **Selection States**: Active or selected items (cards, buttons, radio dots, toggles) should use solid black with white icons/text or subtle neutral gray borders, never bright blue/accent glows.
- **Zero Blue Borders, Outlines & Rings Site-wide**:
  - Never use blue (`#2563eb`, `#388bff`, `#3b82f6`, `#1868db`, `#b3d4ff`, `#8caff0`, etc.) on borders, card selections, tab bottom borders, drag indicators, inputs, or focus rings.
  - Selected stat cards (such as invoice or task KPI cards) must use high-contrast solid black (`#0f172a`) borders (`1.5px solid #0f172a`) on pure white background, never blue outlines or tinted blue backgrounds.
  - Hover states on cards must use neutral slate borders (`#cbd5e1`), never light blue (`#b3d4ff` / `#b3c7e6`).
  - Focus outlines on inputs, buttons, and select dropdowns must be crisp black (`#0f172a`), never blue rings.

## 2. Company Tags & Status Displays (No Boxes, Pure Text Only)
- **No Pill / Box Containers**: Do NOT wrap company names (`Servn`, `Evecture`) or statuses (`ACTIVE`, `PENDING`, etc.) in template pill boxes or borders.
- **Boxes Clear**: Background must be transparent (`background: transparent`), no borders (`border: none`), and no box shadows.
- **Text Colors**:
  - `Servn`: Crisp Blue text only (`#2563eb`, `font-weight: 700`).
  - `Evecture`: Crisp Red text only (`#dc2626`, `font-weight: 700`).
- **Statuses**: Clean, minimalist text without box containers (e.g. `font-size: 11px`, `letter-spacing: 0.05em`, uppercase).
- **No Template Clutter**: Avoid repetitive boxed templates and decorative logos everywhere; use clean, intentional typography.

## 3. Alerts & Banners
- Alerts, warnings, and informational banners must never use pastel green, yellow, or blue backgrounds.
- Use a clean neutral off-white background (`#f8fafc`), light border (`#e2e8f0`), deep black header (`#0f172a`), and muted subtext (`#64748b`).

## 4. Typography & Minimalist Layout
- Clean, modern sans-serif typography for all numbers and statistics (no serif numbers).
- Keep layouts clean and uncluttered. Avoid decorative colored icon boxes, unnecessary frames, or floating colored containers.

## 5. Universal Button Design
- **No Underlines**: Never allow underlines inside buttons or button links (`text-decoration: none !important;`).
- **No All-Caps**: Never force uppercase on buttons (`text-transform: none !important;`). Use natural title/sentence case (e.g. "Projects", "Log enquiry").
- **Clean Dimensions & Sharp Corners**: Standard height (36-38px), sharp 90-degree rectangular corners (`border-radius: 0 !important;`), clean 13px sans-serif typography, and subtle micro-elevation on hover.
- **High Contrast**: Primary buttons are solid black (`#0f172a`) with white text; quiet buttons are crisp white with subtle gray border (`#e2e8f0`).

## 6. Checkboxes & Tick / Untick Controls
- **Never Solid Black on Click**: Checkboxes must maintain a clean white (`#ffffff`) background whether ticked or unticked. Never turn the checkbox background into a solid filled dark black square.
- **Checked State**: White background (`#ffffff`), clean slate border (`#475569`), and a crisp dark checkmark icon (`#0f172a`).
- **Unchecked State**: White background (`#ffffff`), subtle border (`#94a3b8`), with the checkmark hidden.

## 7. Topbar User Account Pill
- **User Name Primary**: The user's name must be prominent and clearly larger than the role badge (`14px`, `font-weight: 600`, `#0f172a`).
- **Role Badge as Micro-Tag**: Role tags (`Admin`, `Employee`, `Client`) must be compact micro-badges (`10px`, `18px` height, `padding: 1px 6px`) styled in subtle neutral monochrome (`#f4f4f5` background, `#52525b` text, `#e4e4e7` border).
- **No Loud Colors**: Never use bright red (`#ffebe6` / `#bf2600`) or blue for role tags in the topbar or dropdown.

## 8. Strictly Rectangular Geometry (Zero Rounded Corners Site-wide)
- **Eliminate All Rounded Corners**: Ban rounded corners everywhere (`border-radius: 0 !important;`).
- **Proper Rectangles**: All cards, buttons, inputs, modals, popovers, tabs, dropdowns, avatars, and badges must be clean, proper 90-degree rectangles.
- **Blend with Background**: Status displays (`ACTIVE`, `CONVERTED`, `ACCEPTED`, `PENDING`, etc.) must blend directly into the background without box borders, box shadows, or container backgrounds.

## 9. Notification Counter Badge (Pure Red Number, Zero Box)
- **Pure Red Text**: The unread counter on the notification bell icon is pure red text (`#dc2626`, `font-weight: 700`).
- **No Box / Background**: Never render a box, container pill, white border, or drop shadow around the number. Keep background completely transparent (`background: transparent !important; border: none !important; box-shadow: none !important;`).


