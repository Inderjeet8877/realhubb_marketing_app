# Realhubb app redesign: design plan

**Goal:** turn Realhubb (Meta Ads + WhatsApp marketing for small businesses) into a premium, consistent product. It must meet Google Play, Apple and WCAG 2.2 AA standards on both the web app and the Android app.

**Direction:** Royal Blue + Mint. Bright, approachable, energetic, and still calm enough for a tool people use all day.

**Platforms:**
- **Web:** React / Next.js (current stack). Tokens map to Tailwind.
- **Mobile:** **Flutter** (replaces the Capacitor Android wrapper). Mobile frames follow **Material 3**, and tokens map to Flutter `ThemeData` / `ColorScheme`.
- **Backend:** Next.js API + PostgreSQL + Redis in Docker, multi-tenant. See [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md#3-decision-postgresql--redis-multi-tenant-from-the-start-decided-2026-10-17).

**Business model:** phase 1 is sold per client. Phase 2 is a Play Store SaaS, so the design needs a **workspace / tenant** concept (switcher, team members, roles).

---

## 1. What's wrong today (from the code audit)

| Problem | Where | Effect |
|---|---|---|
| **Two brands** | Dashboard and landing page use blue `#2563EB`. Login and notifications use WhatsApp green `#075E54` / `#25D366`. RCS uses blue, WhatsApp screens use green. | The app feels stitched together |
| **No design system** | About 1,500 hard-coded colour classes. 4 different stat-card styles. 3 account dropdowns. Corners mix `rounded-lg` and `rounded-xl`. | Every screen looks slightly different |
| **Zoom blocked** | `userScalable: false` in `layout.tsx` | Fails WCAG 1.4.4; flagged by Play accessibility checks |
| **Tap targets too small** | Many buttons about 28–32px; close, trash and checkbox icons 16–24px | Fails Android 48dp, Apple 44pt and WCAG 2.5.8 |
| **Text too small** | `text-[9px]` and `text-[10px]` in the tab bar, badges, pills | Hard to read; fails the 12px minimum |
| **Icon buttons and fields unnamed** | Icon-only buttons have no `aria-label`; form labels aren't linked to inputs | Screen readers can't use the app |
| **Overlays aren't real dialogs** | No dialog role, focus trap or Escape to close; confirm is a toast; cancel reason uses `window.prompt` | Keyboard and screen-reader users get stuck |
| **Meaning by colour only** | CPL colours, connection dots, active tab, Action Queue tones | Fails WCAG 1.4.1 |
| **Emoji used as UI** | 🖼 🎥 📄 ✅ ❌ 📨 📤 🎯 ⚠️ 🔴 | Looks cheap and renders differently on each device |
| **No delete confirmation** | Meta Disconnect and Remove device act instantly | Data loss risk |
| **Legal pages unlinked** | Nothing in the app links to Privacy or Data Deletion | Play policy needs an in-app path |

---

## 2. Design principles

1. **One brand.** Royal Blue is the product colour. WhatsApp green appears only inside the chat (bubbles, chat header) and in the channel icon, so users know they're in WhatsApp.
2. **Calm surfaces, loud data.** Neutral cards on a soft slate background. Colour is saved for numbers, status and actions.
3. **Mobile first.** Most replies happen on a phone. Design 360px first, then scale up to 1440px.
4. **Every state is designed.** Each screen covers loading, empty, error, partial and success, not just the happy path.
5. **Built from parts.** Every screen uses only library components and variables. No one-off styles.

---

## 3. Foundations (Figma variables)

Two variable collections: **Primitives** (raw palette) and **Semantic** (meaning, which the screens use). The Semantic collection has two modes, **Light** and **Dark**, and both are designed now (§3.2b).

### 3.1 Colour primitives

The chosen colours line up with Tailwind's own palettes. That keeps the code restyle small: mostly remapping `gray→slate` and `green→emerald` in `tailwind.config.ts`.

| Ramp | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Blue (brand)** | #EFF6FF | #DBEAFE | #BFDBFE | #93C5FD | #60A5FA | #3B82F6 | **#2563EB** | #1D4ED8 | #1E40AF | #1E3A8A |
| **Mint / Emerald** | #ECFDF5 | #D1FAE5 | #A7F3D0 | #6EE7B7 | **#34D399** | #10B981 | **#059669** | #047857 | #065F46 | #064E3B |
| **Slate (neutral)** | #F8FAFC | **#F1F5F9** | #E2E8F0 | #CBD5E1 | #94A3B8 | #64748B | #475569 | #334155 | #1E293B | #0F172A |
| **Red (danger)** | #FEF2F2 | #FEE2E2 | #FECACA | #FCA5A5 | #F87171 | #EF4444 | #DC2626 | #B91C1C | #991B1B | #7F1D1D |
| **Amber (warning)** | #FFFBEB | #FEF3C7 | #FDE68A | #FCD34D | #FBBF24 | #F59E0B | #D97706 | #B45309 | #92400E | #78350F |
| **Violet (data only)** | #F5F3FF | #EDE9FE | #DDD6FE | #C4B5FD | #A78BFA | #8B5CF6 | #7C3AED | #6D28D9 | #5B21B6 | #4C1D95 |

Text ink is **#111827**, your chosen colour, used as `text/primary`.

### 3.2 Semantic tokens

| Token | Value | Use |
|---|---|---|
| `bg/canvas` | Slate 100 #F1F5F9 | App background |
| `bg/surface` | #FFFFFF | Cards, sheets, modals |
| `bg/surface-subtle` | Slate 50 #F8FAFC | Table headers, insets |
| `bg/surface-hover` | Slate 100 | Row and item hover |
| `border/default` | Slate 200 #E2E8F0 | Card and input borders |
| `border/strong` | Slate 300 #CBD5E1 | Input hover |
| `text/primary` | #111827 | Headings, values |
| `text/secondary` | Slate 600 #475569 | Body copy, labels |
| `text/tertiary` | Slate 500 #64748B | Hints. **White surfaces only**: it fails contrast on Slate 100 |
| `text/on-brand` | #FFFFFF | Text on blue or green buttons |
| `brand/primary` | Blue 600 #2563EB | Primary buttons, links, active nav |
| `brand/primary-hover` | Blue 700 #1D4ED8 | |
| `brand/primary-subtle` | Blue 50 #EFF6FF | Active nav background, selected rows |
| `accent/mint` | Emerald 400 #34D399 | Highlights, charts, progress fills, "Live" dots. **Never text on white** (1.9:1) |
| `accent/mint-subtle` | Emerald 50 #ECFDF5 | Mint tinted surfaces |
| `success/fg` | Emerald 700 #047857 | Success **text** and **success button background** (5.5:1) |
| `success/icon` | Emerald 600 #059669 | Success icons and large numbers only (3.8:1, fine for 24px+ or icons) |
| `success/bg` | Emerald 50 | Success banners and pills |
| `danger/fg` · `danger/bg` | Red 600 · Red 50 | |
| `warning/fg` · `warning/bg` | Amber 700 #B45309 · Amber 50 | Amber 500 is for fills only |
| `info/fg` · `info/bg` | Blue 700 · Blue 50 | |
| `focus/ring` | Blue 600, 2px, offset 2px | Every interactive element |
| `channel/whatsapp` | #25D366 (icon) · #D9FDD3 (out bubble) · #EFEAE2 (chat bg) | Chat UI only |
| `channel/meta` | #0866FF | "Continue with Facebook" button only (Meta brand rule) |

**Contrast checks (WCAG AA, normal text needs 4.5:1):**

| Pair | Ratio | Result |
|---|---|---|
| Blue 600 on white | 5.2 | ✅ |
| White on Blue 600 | 5.2 | ✅ |
| #111827 on Slate 100 | 16.1 | ✅ |
| Slate 600 on Slate 100 | 6.9 | ✅ |
| Emerald 700 on white | 5.5 | ✅ |
| Emerald 600 on white | 3.8 | ⚠️ large text and icons only |
| Mint on white | 1.9 | ❌ fills only |

### 3.2b Dark mode (designed now, as the second mode of the Semantic collection)

Dark surfaces are layered slate, not pure black. Separation comes from **lighter surfaces plus a border**, because shadows barely show on dark. Brand blue becomes lighter for text, and mint really stands out on dark.

| Token | Light | **Dark** | Dark contrast |
|---|---|---|---|
| `bg/canvas` | Slate 100 #F1F5F9 | **#0B1120** | — |
| `bg/surface` | #FFFFFF | **Slate 900 #0F172A** | — |
| `bg/surface-subtle` | Slate 50 | **#162032** | — |
| `bg/surface-raised` (menus, modals) | #FFFFFF + shadow | **Slate 800 #1E293B** | — |
| `bg/surface-hover` | Slate 100 | **Slate 800** | — |
| `border/default` | Slate 200 | **Slate 800 #1E293B** | — |
| `border/strong` | Slate 300 | **Slate 700 #334155** | — |
| `text/primary` | #111827 | **Slate 100 #F1F5F9** | 16.0 ✅ |
| `text/secondary` | Slate 600 | **Slate 300 #CBD5E1** | 11.8 ✅ |
| `text/tertiary` | Slate 500 | **Slate 400 #94A3B8** | 6.9 ✅ |
| `brand/primary` (button background) | Blue 600 | **Blue 600 #2563EB** (white text 5.2 ✅) | — |
| `brand/primary-text` (links, active nav) | Blue 600 | **Blue 400 #60A5FA** | 7.0 ✅ |
| `brand/primary-subtle` | Blue 50 | **Blue 500 at 15%** | — |
| `accent/mint` | Emerald 400 | **Emerald 400 #34D399** (allowed as text in dark) | 9.2 ✅ |
| `success/fg` | Emerald 700 | **Emerald 400** | 9.2 ✅ |
| `success/bg` | Emerald 50 | **Emerald 500 at 15%** | — |
| `danger/fg` · `danger/bg` | Red 600 · Red 50 | **Red 400 #F87171 · Red 500 at 15%** | 6.3 ✅ |
| `warning/fg` · `warning/bg` | Amber 700 · Amber 50 | **Amber 400 #FBBF24 · Amber 500 at 15%** | 10.7 ✅ |
| `info/fg` | Blue 700 | **Blue 400** | 7.0 ✅ |
| `focus/ring` | Blue 600 | **Blue 400** | — |
| `channel/whatsapp` chat background · out bubble · in bubble | #EFEAE2 · #D9FDD3 · #FFFFFF | **#0B141A · #005C4B · #202C33** (WhatsApp's own dark colours) | — |
| Shadows e1–e3 | slate, 6–16% | **black, 30–50%, plus a 1px `border/default`** | — |

**Theme switch:** System (default) / Light / Dark, set in Settings → Appearance.
- Web: a `data-theme` attribute plus Tailwind `darkMode: 'class'`.
- Flutter: `ThemeMode.system` with a light and a dark `ColorScheme`.

Every screen in §6 is designed in **both modes**. Light is drawn fully. Dark is the same frames with the variable mode switched, then checked for contrast and image problems.

### 3.3 Chart palette (fixed order, colour-blind safe)

1. Blue 600
2. Emerald 500
3. Amber 500
4. Violet 500
5. Slate 400
6. Red 500 (reserved for "bad")

Every chart also gets a legend and direct labels, so it never depends on colour alone.

### 3.4 Typography

**Brand font: Sora. UI font: Inter.**

| Role | Font | Why |
|---|---|---|
| **Brand / display:** wordmark, page titles (H1), KPI numbers, landing hero, empty-state titles | **Sora** (600/700) | A distinctive, modern geometric face with wide, open letters, so it's recognisable at a glance. It reads "tech + marketing" without looking cold, and its round shapes suit the friendly Royal Blue + Mint direction. |
| **UI / body:** H2 and below, labels, tables, inputs, chat | **Inter** (400/500/600) | The most readable face for dense screens (tables, chat, forms), with true tabular figures. Already loaded in the app. |

- Both fonts are free for commercial use (SIL OFL) and on Google Fonts. Web loads them with `next/font/google`; Flutter **bundles them as assets** (works offline, no runtime download).
- Numbers use **tabular figures** (`tabular-nums`) so KPIs and table columns line up.
- Fallback: system-ui.
- **Minimum size:** 12px anywhere. No 9px or 10px.

| Style | Size / line height | Weight | Use |
|---|---|---|---|
| Display | 32/40 | Sora 700 | Landing hero, empty-state hero |
| Heading 1 | 24/32 | Sora 600 | Page title |
| Heading 2 | 18/28 | Inter 600 | Card and section title |
| Heading 3 | 16/24 | Inter 600 | Sub-section, modal title |
| KPI | 28/36 (mobile 24/32) | Sora 600, tabular | Stat card value |
| Body L | 16/24 | 400 | Mobile body, inputs on mobile (stops iOS zoom) |
| Body | 14/20 | 400 | Desktop body, table cells |
| Label | 14/20 | 500 | Buttons, form labels, nav |
| Caption | 12/16 | 500 | Meta lines, badges, tab-bar labels |
| Overline | 12/16 | 600, +4% tracking, uppercase | Table headers, section labels |

### 3.5 Spacing, corners, elevation

- **Spacing:** 4px base. Allowed steps: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- **Page padding:** 16px mobile, 24px tablet, 32px desktop.
- **Corner radius:**

| Size | Radius | Used for |
|---|---|---|
| sm | 6 | Badges, checkboxes |
| md | 10 | Buttons, inputs, menus |
| lg | 14 | Cards |
| xl | 20 | Modals, bottom sheets |
| full | 999 | Pills, avatars, switches |

- **Elevation (soft, cool-tinted, based on `#0F172A`):**

| Level | Shadow | Used for |
|---|---|---|
| e0 | none, 1px `border/default` | Default cards |
| e1 | `0 1px 2px /6%` | Raised cards, sticky bars |
| e2 | `0 4px 12px -2px /8%` | Menus, popovers, toasts |
| e3 | `0 16px 40px -8px /16%` | Modals, sheets |

- **Motion:** 150ms for hover and press, 200ms ease-out `cubic-bezier(.16,1,.3,1)` for enter, 150ms for exit. All motion turns off under `prefers-reduced-motion`.
- **Icons:** Lucide only (already installed), 20px default and 16px inside dense tables, 1.75 stroke. Brand marks (Meta, WhatsApp, Google) follow each company's brand rules. Every emoji used as UI gets replaced by an icon.

### 3.6 Brand identity (designed in Figma, page "00 Brand")

| Asset | Spec |
|---|---|
| **Wordmark** | "realhubb" in Sora 700, custom-kerned. The two **b**s share one bowl detail. One colour (Blue 600 on light, white on dark) plus a reversed version |
| **Symbol / app icon** | An **"R" monogram built from a chat bubble**, with a mint "signal" accent (the bubble's tail rises like a growth arrow). It stands for messaging plus marketing growth. **3 concepts** will be drawn for you to pick from |
| **Android adaptive icon** | 108dp foreground (symbol inside the 66dp safe zone) and a Blue 600 background layer. **Monochrome layer** for Android 13+ themed icons |
| **Notification icon** | 24dp, white silhouette only (Android rule) |
| **Play Store icon** | 512×512 PNG, no transparency, no badges or text |
| **Play feature graphic** | 1024×500 |
| **Splash screen** | Android 12+ splash API: symbol centred on Blue 600 (light) or #0B1120 (dark) |
| **Web** | favicon (SVG + 32 / 16 px), apple-touch-icon 180, PWA icons 192 / 512 (maskable) |
| **Lock-ups** | Horizontal (symbol + wordmark), stacked, symbol only. Clear space equal to the height of the **r**. Minimum width 24px |

### 3.7 Layout grid

| Frame | Size | Columns | Gutter | Margin |
|---|---|---|---|---|
| Mobile | 360 × 800 | 4 | 16 | 16 |
| Tablet | 768 × 1024 | 8 | 24 | 24 |
| Desktop | 1440 × 1024 | 12 | 24 | 32 (content max 1280) |

---

## 4. Navigation (approved 2026-10-17)

| Surface | Under 600 | 600–1023 | 1024 and up |
|---|---|---|---|
| **Flutter app** | Material 3 `NavigationBar` (5 tabs) | `NavigationRail` | `NavigationRail` (expanded) |
| **Web (Next.js)** | Bottom tab bar (5 tabs) | Collapsed sidebar (icons + tooltips) | Full sidebar |

Both platforms use the same groups, tab order, icons and badges, so users who switch between web and app aren't lost.

**Today:** a desktop top bar with Meta and WhatsApp dropdowns, a mobile hamburger, and a 5-tab bar (Home, Campaigns, Leads, WhatsApp, Contacts). Enquiries and Settings are hidden in the hamburger.

**New:**

- **Desktop (≥1024px): collapsible left sidebar**, the standard pattern for premium SaaS (Linear, Stripe, Intercom). Grouped like this:
  - **Overview:** Dashboard
  - **WhatsApp:** Inbox (unread badge), Templates, Broadcasts (Reports moves out of the Inbox page), RCS ("Soon" tag)
  - **Meta Ads:** Campaigns, Leads
  - **Audience:** Contacts, Enquiries
  - Top: **workspace switcher** (for selling to several clients)
  - Bottom: Settings, theme toggle, user menu (avatar, email, Sign out)
- **Mobile (<1024px): bottom tab bar, 5 slots:** Home · Inbox · Leads · Contacts · More.
  - Inbox replaces Campaigns, because replying to customers is the main thing people do on a phone.
  - **More** opens a bottom sheet: Campaigns, Templates, Broadcasts, Enquiries, RCS, Settings, Privacy and Data deletion, Sign out.
  - No hamburger.
- **Top app bar (mobile):** page title, a context action (for example "+ Template"), and a notifications bell.

---

## 5. Component library (Figma page "Components")

Every component is built with Auto Layout and variables, with variants for size, state and tone, and named exactly as it will be in code.

### 5.1 Basics

| Component | Variants | Rules |
|---|---|---|
| **Button** | Primary · Secondary (outline) · Ghost · Danger · Success; sizes S (36), M (44), L (48); states default, hover, pressed, focus, disabled, loading | Minimum 44px on mobile. Loading keeps the width and shows a spinner plus a verb ("Sending…") |
| **Icon button** | Ghost · Outline · Filled; 40 / 44 | Always has an accessible name. Visible icon 20px, tap area 44px |
| **Text input** | default, hover, focus, error, disabled; with leading icon, trailing action | Label above, helper or error below. 44px tall (48 on mobile) |
| **Textarea · Select · Search** | as above | Native select on mobile |
| **Checkbox · Radio · Switch** | on, off, indeterminate, disabled, focus | Tap area 44px. The switch can carry an icon in the knob (Meta/WA toggle) |
| **Badge / Status pill** | neutral · info · success · warning · danger · brand; with dot or icon | **One status map** (see 5.4). Icon plus text, never colour alone |
| **Avatar** | initials · image · channel; 24 / 32 / 40 / 48 | |
| **Tooltip · Divider · Spinner · Skeleton** | | Skeletons copy the exact shape of the final layout |

### 5.2 Composites

| Component | Variants |
|---|---|
| **Stat card** (replaces 4 old styles) | sizes M and L; with or without trend (▲ 12% vs last period); with icon tile; with an inline switch; clickable (acts as a filter) |
| **Card / Section card** | header (title, subtitle, actions) + body + optional footer |
| **Data table** | sticky header, sortable columns, row hover and selected states, totals footer, horizontal scroll on mobile, or a **card-list layout on mobile** for Leads and Contacts |
| **Pagination** | "Showing 1–10 of 240" · Prev · page numbers · Next |
| **Segmented control** | 2–5 options (date ranges, All/Acc 1/2/3, Spend/Leads/CPL) |
| **Tabs** | underline, with count; scrollable |
| **Menu / Dropdown** | items with icon and description, sections, check mark for selected |
| **Account picker** | one shared component (All Accounts / Account 1–3 with labels) |
| **Date range picker** | presets plus a custom calendar range. Also used on Campaigns, which today hard-codes "Last 30 days" |
| **Alert / Banner** | info · success · warning · danger; with title, list, action, dismiss |
| **Toast** | 4 tones; with optional action ("Undo", "View"); announced to screen readers |
| **Modal** | S / M / L; header, scroll body, sticky footer. **Full-screen sheet on mobile** |
| **Confirm dialog** | default and danger. A real dialog that replaces both the toast-style confirm and `window.prompt` (cancel reason gets a textarea) |
| **Bottom sheet** | the mobile "More" menu, filters, actions |
| **Empty state** | illustration or icon, title, hint, primary action |
| **Progress bar** | thin (4) and thick (8); with label and % |
| **Action Queue item** | tones danger, warning, info. Icon plus text conveys urgency, not colour alone |
| **Selectable card** | radio or checkbox card (report scope, engagement option) |
| **Contact picker** | search, select-all, list with checkboxes, count. Shared by Bulk send, RCS and Reports |
| **Numbered form section** | step badge and title (Template editor, Report builder) |
| **Page header** | title, subtitle or meta, action cluster |
| **Sidebar · Bottom tab bar · Top app bar · More sheet** | active, hover, badge states |

### 5.3 WhatsApp chat kit
- **Chat list item:** unread, read, selected; outbound tick
- **Chat header**
- **Date separator**
- **Message bubble:** in or out; text, template, media; with time and **tick** (pending, sent, delivered, read, failed)
- **Composer:** empty, typing, sending, disabled with reason
- **Phone preview frame:** compact and full, sharing the same bubble parts as the inbox

### 5.4 One status map (used by every badge)

| Domain | Values → tone |
|---|---|
| Campaign | Active → success · Paused → warning · Completed → neutral · Archived → neutral |
| Template | Approved → success · Pending review → info · Rejected → danger · Paused → warning · Disabled → danger · In appeal → warning · Limit exceeded → warning · Pending deletion → neutral · Not submitted → neutral |
| Broadcast | Sending → brand (spinner) · Completed → success · Cancelled → warning · Failed → danger |
| Message | Sent → neutral · Delivered → info · Read → brand · Failed → danger |
| Number quality | High → success · Medium → warning · Low → danger · Not available → neutral |
| CPL | Good (<₹300) → success · Moderate (<₹600) → warning · High → danger. Shown as text plus icon, not emoji |
| Connection | Connected → success · Expiring (≤7d) → warning · Not connected → neutral |

---

## 6. Screens to design

Each screen gets **mobile (360)** and **desktop (1440)** frames, plus the listed states. ★ marks the main flows.

| # | Screen | Key content | States to design |
|---|---|---|---|
| 1 | **Landing** | Nav, hero, 6 feature cards, enquiry form, footer **with Privacy and Data deletion links** | form idle, submitting, error, success |
| 2 | **Login** ★ | Logo, email/password, "Continue with Google" (Google brand rules), restricted-access note | idle, loading, error, init splash. Add **Forgot password** |
| 3 | **Dashboard: Meta view** ★ | Page header (date range, account, refresh, export), Meta/WhatsApp switch, 6 KPI cards, 3 account cards, Action Queue, CPL bar chart, status donut, campaign report table, connected pages | loading, empty (no Meta connected → connect CTA), error, refreshing |
| 4 | **Dashboard: WhatsApp view** ★ | Range control, number-quality banner (4 levels), 3 KPIs, Action Queue, sent vs delivered line chart, charges breakdown, strategist analysis (4 insight tiles, 2 tables) | loading, empty range, insights error, quality unavailable |
| 5 | **Campaigns** | Header + date range (new) + account, 5 KPIs, sortable table with status, CTR and CPL | loading, empty, error |
| 6 | **Leads** ★ | Header + account + exports, 4 KPIs (auto-refresh switch), tabs By campaign / Instant forms / Summary, form filter, **Lead detail sheet** (lead cards, "Save to contacts", "Send WhatsApp") | loading, export progress, partial-permission warning, empty, error |
| 7 | **Inbox** ★ | List pane (search, broadcast filter chip, "All replies" toggle), chat pane (header, bubbles, ticks, composer), no-chat-selected | loading, empty (3 variants), sending, failed message, webhook diagnostics modal. Mobile: list → chat |
| 8 | **Send message** | Single send card (account strip, recipient, template or text, live preview, media URL), recent messages | template needs media, sending, success, error |
| 9 | **Bulk send** ★ | Becomes a **3-step flow**: 1 Message (template or text, preview) → 2 Audience (batch, range, contact picker) → 3 Review and send. Then a live progress view | progress, cancelled (with reason dialog), complete, error |
| 10 | **Broadcasts (reports)** | Broadcast cards (status strip, 5 stat tiles, actions), expanded recipient list, failure-reason dialog, **Report builder** panel (scope cards, template picker, include-engagement option, Generate PDF) | loading **skeleton** (replaces spinner), empty, live processing |
| 11 | **Templates** ★ | Header (refresh, + Create), notices, template card grid with status pill, preview modal | loading, empty, error |
| 12 | **Template editor** ★ | 4 numbered sections (basic info, header with media upload, body with content score and advice, footer and buttons), live phone preview. Mobile: Edit/Preview tabs, full-screen | create, edit, submitting, Meta validation error |
| 13 | **Contacts** ★ | 4 filter stat cards, filter banner, search + batch select, table (mobile card list), bulk select bar, pagination | loading, empty, **no matches** (missing today), error, failed-numbers view |
| 14 | **Import contacts** | Wizard: details + drop zone → parsing → uploading (progress) → summary (added, duplicates, invalid, invalid rows list) | each phase, partial failure |
| 15 | **Enquiries** | List with **status pill** (New, Contacted, Closed), search, tappable email and phone (`mailto:`/`tel:`), detail sheet | loading, empty, error |
| 16 | **RCS** | "Coming soon" hero, not-configured alert, composer, contact picker, sent table | not configured, sending, sent, empty |
| 17 | **Settings** | Sections: Meta connection (3 slots, expiry warning, account-picker step), Notifications (switches), Registered devices (with **confirm before remove**), **Account and data** (Privacy, Data deletion request, Sign out) | connecting, picker loading or error, disconnect confirm, empty devices |
| 18 | **Privacy · Data deletion** | Readable legal layout with a header and back link. Data deletion gets an **in-app request button** | — |
| 19a | **Workspace and team** (new, for selling) | Workspace switcher, team members list, invite member, roles (Owner, Admin, Agent), plan and billing placeholder | invite pending, no permission |
| 19b | **Onboarding** (new, for the Play Store) | Sign up → create workspace → connect Meta → import contacts, as a 4-step checklist | each step, skipped |
| 19 | **System overlays** | Toast stack, notification permission prompt, install-app prompt, incoming WhatsApp message toast, confirm dialog, cancel-reason dialog | Overlays are **queued**, not stacked on top of each other |

**Prototype flows** (clickable in Figma):
1. Login → Dashboard
2. Inbox: open chat → reply
3. Bulk send, all 3 steps → progress → report
4. Create template → preview → submit
5. Import contacts
6. Connect Meta account

---

## 7. Standards checklist (every screen must pass)

**Accessibility (WCAG 2.2 AA)**
- [ ] Text contrast at least 4.5:1, large text and icons at least 3:1, using only tokens from §3.2
- [ ] Tap targets at least 44×44 (iOS) and 48×48dp on Android, with 8px between targets
- [ ] No text under 12px. The layout survives 200% zoom and system font scaling (**pinch-zoom enabled**)
- [ ] Every input has a visible label. Every icon button has a name (written in the Figma layer description so developers copy it)
- [ ] Visible focus ring on every interactive element. Logical tab order is annotated
- [ ] Status never shown by colour alone (icon or text too)
- [ ] Modals and sheets: dialog role, focus trap, Escape and back gesture close them, focus returns to where it came from
- [ ] Toasts and form errors are announced (live region)
- [ ] Motion respects reduced-motion settings

**Google Play / Android (Material 3 guidance)**
- [ ] Edge-to-edge layout with safe areas for the status bar, gesture bar and notch
- [ ] System back always works (closes sheet, then modal, then goes back a screen)
- [ ] **In-app path to request account and data deletion** plus a web link (Play User Data policy)
- [ ] Privacy policy reachable from inside the app and from the store listing
- [ ] Notification permission is asked in context (after a value explanation), never at cold start
- [ ] Adaptive app icon, splash screen and notification icon (monochrome) designed

**Apple (if an iOS build is added later)**
- [ ] 44pt targets, Dynamic Type friendly, Sign in with Apple required if Google sign-in stays

**Platform brand rules**
- [ ] "Continue with Facebook" button and "Sign in with Google" button follow the Meta and Google brand guidelines
- [ ] WhatsApp logo used only to identify the channel, never as the app's own brand

**Premium feel**
- [ ] One primary action per screen
- [ ] Numbers are tabular and right-aligned in tables
- [ ] Every empty state has an action
- [ ] Skeletons, not spinners, for page loads
- [ ] Consistent 4px spacing rhythm and corner radius

---

## 8. Figma file structure

**File: "Realhubb: App Redesign"** (Figma Design)

| Page | Contents |
|---|---|
| 📕 Cover | Name, version, status, links |
| 00 Brand | Wordmark, 3 app-icon concepts → chosen one, adaptive and monochrome icons, splash, store assets, lock-ups |
| 01 Foundations | Variables (Primitives; Semantic with **Light and Dark** modes), colour sheet with contrast labels for both modes, type scale (Sora + Inter), spacing, radius, elevation, icons, grids |
| 02 Components | Everything in §5, with documentation and usage notes |
| 03 Patterns | Page header, data table layouts, forms, empty states, overlays |
| 04 Mobile | All screens at 360, each in a Section with its states. **Light and dark side by side** |
| 05 Desktop | All screens at 1440, light and dark |
| 06 Prototype | Flows from §6 |
| 07 Handoff | Token mapping for **Tailwind (web)** and **Flutter ThemeData (app)**, component → Flutter widget mapping, redlines for tricky layouts |
| 🗑 Archive | |

**File: "Realhubb: Data Model"** (FigJam). See [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

---

## 9. Build order and check-ins

| Step | Output | Check-in with you |
|---|---|---|
| A | Create both files. Brand page (wordmark + 3 icon concepts). Foundations (light and dark variables, type, colour sheet) | ✅ pick the icon, approve colours and fonts in both modes |
| B | Components page (basics → composites → chat kit) | ✅ approve the look of buttons, cards, nav |
| C | 3 key screens first: Dashboard (Meta), Inbox, Contacts, mobile and desktop | ✅ approve direction before doing the rest |
| D | Remaining screens and states | ✅ review round, list changes |
| E | Prototype flows, handoff page | — |
| F | FigJam data model | ✅ |
| G | Code restyle (separate plan, after Figma sign-off) | ✅ |

**Using parallel agents:** once Figma is connected, the work splits by page so agents never edit the same frames.
- One agent builds Foundations.
- Once Foundations are ready, separate agents build mobile screens, desktop screens, and the FigJam diagram in parallel.
- I review and merge each step before the next one starts.

---

## 10. Decisions (2026-10-17)

| # | Question | Decision |
|---|---|---|
| 1 | Dark mode | **Designed now**, as the second variable mode (§3.2b), with a System / Light / Dark switch |
| 2 | Navigation | **Approved.** Sidebar on desktop web; Material 3 NavigationBar / Rail in Flutter; Inbox in the mobile tab bar (§4) |
| 3 | Logo | **Designed in Figma:** wordmark plus 3 app-icon concepts to choose from (§3.6) |
| 4 | Bulk send | **3 steps approved:** Message → Audience → Review and send |
| 5 | Font | **Sora** (brand, headings, KPIs) + **Inter** (UI and body) (§3.4) |
| — | Local environment | Docker (Postgres + Redis) for now |
| — | Phase 1 hosting | Still open: we host, or the client hosts |
