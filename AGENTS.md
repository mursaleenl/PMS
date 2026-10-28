# Repository Rules & Workspace Preferences

## Visual & UI Design Rules
- **Strictly Black and White (Monochrome / Grayscale)**:
  - The design aesthetic is clean, minimalist black and white.
  - Do NOT use bright blues, reds, greens, yellows, or other saturated accent colors on borders, badges, cards, alerts, or pills.
  - Color palette is limited to pure white (`#ffffff`), solid black (`#0f172a`, `#111827`, `#000000`), and neutral zinc/slate grays (`#f8fafc`, `#f4f4f5`, `#e2e8f0`, `#e4e4e7`, `#64748b`, `#71717a`).
- **Cards, Buttons & Active States**:
  - Active/selected states must use high-contrast solid black with white text/checkmark (`#0f172a`), not bright blue glows or outlines.
- **Zero Blue Borders, Outlines & Rings Site-wide**:
  - Never use blue (`#2563eb`, `#388bff`, `#3b82f6`, `#1868db`, `#b3d4ff`, `#8caff0`, etc.) on borders, card selections, tab bottom borders, drag indicators, inputs, or focus rings.
  - Selected stat cards (such as invoice or task KPI cards) must use high-contrast solid black (`#0f172a`) borders (`1.5px solid #0f172a`) on pure white background, never blue outlines or tinted blue backgrounds.
  - Hover states on cards must use neutral slate borders (`#cbd5e1`), never light blue (`#b3d4ff` / `#b3c7e6`).
  - Focus outlines on inputs, buttons, and select dropdowns must be crisp black (`#0f172a`), never blue rings.
- **Company Identifiers & Status Displays (No Boxes, Pure Text Only)**:
  - Do NOT wrap company names (`Servn`, `Evecture`) or status badges in pill containers, boxes, or borders.
  - Keep boxes clear (transparent background, no borders, no padding/box shadow).
  - Text colors:
    - `Servn`: Blue text only (`#2563eb`, `font-weight: 700`), no box.
    - `Evecture`: Red text only (`#dc2626`, `font-weight: 700`), no box.
  - Statuses (`ACTIVE`, `PENDING`, etc.) must be clean, elegant text without template pill boxes or heavy containers.
  - Avoid template boxes and logos everywhere; keep typography minimalist, clean, and editorial.
- **Alerts & Notices**:
  - Do not use pastel green or amber alert boxes. Use clean neutral backgrounds (`#f8fafc`), neutral borders (`#e2e8f0`), and dark text.
- **Button Design**:
  - Never underline text inside buttons (`text-decoration: none !important;`).
  - Never force uppercase/all-caps on button text (`text-transform: none !important;`). Use natural title/sentence case (e.g. "Projects", "Log enquiry").
  - Sharp rectangular corners (`border-radius: 0 !important;`), 36-38px height, modern sans-serif typography, and subtle micro-elevation on hover.
  - Primary buttons are solid deep black (`#0f172a`) with white text; quiet/secondary buttons are crisp white with slate borders (`#e2e8f0`) and dark text.
- **Checkboxes & Tick / Untick Controls**:
  - Keep checkboxes clean white (`#ffffff`) background with a subtle slate border (`#94a3b8` / `#475569`) and a dark checkmark icon (`#0f172a`).
  - Never turn the checkbox background into a solid filled dark black square on click or tick.
- **Clean & Modern Layout**:
  - Remove decorative colored icon boxes and heavy frames.
  - Keep numbers in standard modern sans-serif fonts.
- **Topbar User Account Pill**:
  - The username must be primary and clearly larger than the role tag (`14px`, `#0f172a`).
  - Role tags (`ADMIN`, `EMPLOYEE`, `CLIENT`) must be subtle, compact micro-badges (`10px`, `18px` height) styled in neutral monochrome (`#f4f4f5` background, `#52525b` text, `#e4e4e7` border). Never loud red or blue.
- **Strictly Rectangular Geometry (Zero Rounded Corners Site-wide)**:
  - Do NOT use rounded corners anywhere across the site (`border-radius: 0 !important;`).
  - All cards, buttons, inputs, modals, popovers, tabs, dropdowns, avatars, and badges must be clean, proper 90-degree rectangles.
  - Status badges must blend seamlessly with the background (transparent background, no border, no padding), appearing as clean, crisp editorial typography.
- **Notification Counter Badge (Pure Red Number, Zero Box)**:
  - The unread notification count on the bell icon must be pure red text (`#dc2626`, `font-weight: 700`), placed directly on the top-right of the bell icon.
  - Never wrap the notification number in a pill, box, background container, border, or box shadow. Keep the box completely transparent and clear.


