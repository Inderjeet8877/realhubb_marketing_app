---
name: Broadzen
description: Signal Room. A night-navy desk where ad spend becomes a WhatsApp reply, lit only where something is live.
colors:
  ink: "#0F1A38"
  ink-2: "#16234A"
  ink-3: "#1E2E5C"
  ink-line: "#2A3A6B"
  signal-cyan: "#00F5E9"
  signal-mint: "#00C471"
  signal-soft: "#2DD4BF"
  bg: "#F4F7FA"
  surface: "#FFFFFF"
  line: "#DEE5EE"
  fg: "#0F1A38"
  muted: "#526080"
  accent: "#0F766E"
  on-accent: "#FFFFFF"
  primary: "#0F1A38"
  on-primary: "#FFFFFF"
  warn: "#A16207"
  danger: "#B91C1C"
  ok: "#047857"
  bg-dark: "#0B132A"
  surface-dark: "#0F1A38"
  line-dark: "#2A3A6B"
  fg-dark: "#E8EEF8"
  muted-dark: "#A0AECC"
  accent-dark: "#2DD4BF"
  on-accent-dark: "#0F1A38"
  primary-dark: "#2DD4BF"
  on-primary-dark: "#0F1A38"
  warn-dark: "#F5A524"
  danger-dark: "#F87171"
  ok-dark: "#34D399"
typography:
  display:
    fontFamily: "Sora, system-ui, sans-serif"
    fontSize: "3.75rem"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Sora, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Sora, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: "-0.01em"
  title-sm:
    fontFamily: "Sora, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
  body-lg:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.625
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
    fontFeature: "\"cv11\", \"ss01\""
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.33
  numeric:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "1.125rem"
    fontWeight: 500
    lineHeight: 1.33
    fontFeature: "\"tnum\""
rounded:
  control: "8px"
  card: "12px"
  panel: "16px"
  pill: "9999px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "20px"
  s6: "24px"
  s8: "32px"
  s10: "40px"
  s12: "48px"
  s16: "64px"
components:
  button-signal:
    backgroundColor: "{colors.signal-cyan}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 24px"
    height: "48px"
  button-ghost-night:
    backgroundColor: "transparent"
    textColor: "#FFFFFF"
    rounded: "{rounded.control}"
    padding: "0 24px"
    height: "48px"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-primary-dark:
    backgroundColor: "{colors.primary-dark}"
    textColor: "{colors.on-primary-dark}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-success:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "44px"
  input-night:
    backgroundColor: "{colors.ink}"
    textColor: "#FFFFFF"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "44px"
  panel-night:
    backgroundColor: "{colors.ink-2}"
    textColor: "#FFFFFF"
    rounded: "{rounded.panel}"
    padding: "24px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.card}"
    padding: "16px"
  badge:
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
---

# Design System: Broadzen

## Overview

**Creative North Star: "The Signal Room"**

Broadzen is a night-navy desk where an ad turns into a lead, a template goes out, the read tick lights cyan and cost per lead lands in rupees. The room is dark and quiet; the only light in it is signal. The logo's cyan-to-mint gradient is never a decoration: it appears where something is live, done, read or worth acting on, and nowhere else. Everything else is navy in three steps, hairline borders and plain type.

The world has two rooms that share one grammar. The public landing is the night room: the `ink` ground with panels raised one step lighter, no shadows, white Sora headlines, Inter body copy in a cool muted blue-grey, and mono for every figure. The working app (auth, pending, workspace, admin) is the day room: light surfaces for an owner reading a phone in daylight, the same navy as text and primary button, following the OS into dark mode where the primary turns mint with navy text. The auth shell joins the two: a navy aside carrying the still funnel beside a light form column.

Density is calm, not sparse. Copy is short and literal, numbers are labelled, and sample data says it is sample data. Motion is one curve and three durations, shared by web and Flutter, and it switches off when the OS asks.

**Key Characteristics:**
- Navy ground in three steps (`ink`, `ink-2`, `ink-3`) with `ink-line` hairlines; depth by tone, not shadow.
- Gradient as signal only: the landing's primary CTA, progress fills, the read tick, the CPL readout, the final step of a path.
- Sora for display and titles, Inter for everything read, JetBrains Mono for numbers, phone numbers and timestamps.
- Light app surfaces with system dark; mint primary on navy text in dark.
- Honest content: sample data labelled in mono, no invented stats, prices, logos or badges.
- One motion grammar: 120 / 200 / 320 ms on `cubic-bezier(.23,1,.32,1)`, zero under reduced motion.

## Colors

A navy-and-signal palette: one deep blue in three tonal steps, a cyan-to-mint gradient reserved for live state, and a restrained teal for interactive text on light surfaces.

### Primary
- **Night Navy** (`ink`): the logo navy. Landing ground, auth aside, workspace header bar, app text colour (`fg`) and the light-mode primary button. The browser `theme-color` is set to it.
- **Signal Cyan to Signal Mint** (`signal-cyan` to `signal-mint`, `linear-gradient(100deg, ...)`): the brand gradient. Fills the landing primary button (with navy text), the funnel's progress rail, the setup progress bar, the final node of the "whole path" timeline. Solid cyan marks the read tick and the settled CPL figure; solid mint marks completed checks.

### Secondary
- **Soft Signal Teal** (`signal-soft`): inline links on the night ground ("Send us an enquiry", "Sign in"), icon tint for the new-lead row, and the dark-mode `primary` / `accent`.
- **Deep Teal** (`accent`): interactive text, active tab underline, focus rings on inputs, the "now" step in the pending timeline and the approve button on light surfaces (5.4:1 on white).

### Neutral
- **Raised Navy** (`ink-2`): every panel on the landing (funnel, product views, enquiry form).
- **Higher Navy** (`ink-3`): the incoming chat bubble inside a panel; the step above `ink-2`.
- **Night Hairline** (`ink-line`): all borders, dividers and section rules on the night ground; also the unlit track of rails and timelines.
- **Mist** (`bg`): the light app canvas; also table header fill and secondary-button hover.
- **Paper** (`surface`): cards, dialogs, inputs on light surfaces.
- **Day Hairline** (`line`): borders and dividers on light surfaces; skeleton fill.
- **Slate Muted** (`muted`, dark `muted-dark`): secondary text. On the landing the dark value is used directly for all muted copy.
- **Status** (`ok`, `warn`, `danger`, with dark counterparts): badges, error boxes, done checks. Always paired with text.

### Named Rules
**The Signal-Only Rule.** The gradient (and solid cyan or mint) marks live or completed state, or the one primary action on the night ground. It never fills a background field, a section, a card, or text. If nothing is happening there, it is navy.

**The Three-Step Navy Rule.** On the night ground, depth goes `ink` to `ink-2` to `ink-3`, one step per nesting level, each edged with `ink-line`. A fourth tone is not added.

**The Day Room Rule.** App surfaces are light by default and opt into dark per surface with `.theme-auto` (follows the OS) or `.theme-dark`. In dark, primary becomes Soft Signal Teal with navy text, never white on mint.

## Typography

**Display Font:** Sora (500 / 600 / 700, with system-ui fallback)
**Body Font:** Inter (with system-ui fallback, `cv11` and `ss01` enabled)
**Numeric Font:** JetBrains Mono (400 / 500, tabular figures)

**Character:** Sora's geometric, slightly wide forms carry the brand in headlines; Inter does the reading at small sizes on phones; mono makes every figure line up and read as data rather than copy.

### Hierarchy
- **Display** (600, 2.5rem on phones to 3.75rem, line-height 1.08, -0.03em, balanced wrap): the landing hero headline only.
- **Headline** (600, 1.875rem to 2.25rem, -0.02em): landing section titles, max 42rem wide.
- **Title** (600, 1.5rem, -0.01em): app page titles, landing feature titles, auth form titles.
- **Title Small** (600, 1.125rem): card and section headers, modal titles, timeline step names on the landing.
- **Body Large** (400, 1.125rem, relaxed): landing intros and hero subcopy, max about 36rem.
- **Body** (400, 0.875rem): app copy, table cells, form text.
- **Label** (600, 0.75rem): badges, status words, table column headers (uppercase, wide tracking, table headers only).
- **Numeric** (mono 500, 1.125rem on the landing readout; 24px KPI on Flutter; inherits size elsewhere): money, counts, phone numbers, times, "3 of 5 done", "Sample data".

Flutter uses the same families with a fixed scale: display 32/40 Sora 700, h1 24/32 Sora 600, h2 18/28 and h3 16/24 Inter 600, body 14/20, label 14/20 500, caption 12/16 500, KPI 24/32 mono 500 tabular. Sora lacks the rupee sign, so Sora styles fall back to Inter.

### Named Rules
**The Mono-Is-Data Rule.** JetBrains Mono is used only for numbers, phone numbers, timestamps and the "Sample data" tag. Never for headings, labels or prose.

**The Sora-Above, Inter-Below Rule.** Sora sets headings and titles; anything read as a sentence is Inter.

## Layout

The landing is a single column of full-width bands separated by `ink-line` rules, content held in a 72rem container with 16px gutters (24px from 640px). Sections breathe at 80px vertical padding, 112px from 640px. The hero is a two-column grid (about 1.05 : 1) from 768px: outcome headline, subcopy and CTAs on the left, the live funnel at equal weight on the right; it stacks with the funnel second on phones. Feature rows alternate text and a coded product view in a two-column grid with 56px gaps, flipping sides. Grid tracks use `minmax(0, 1fr)` so panels never force horizontal scroll.

App surfaces sit in a 64rem container (workspace) or a split auth shell (5 : 7 navy aside to form column from 768px; on phones the aside collapses to a 64px logo bar). Tables become stacks of labelled cards below 768px. Spacing follows a 4px base (`s1` to `s16`), shared with the Flutter `Space` tokens. Tap targets are at least 44px on web and 48dp on Android.

## Elevation & Depth

The night room is flat: depth comes from tone (`ink` to `ink-2` to `ink-3`) and hairline borders, never from drop shadows. The sticky header separates itself with an `ink-line` bottom border and a 75% to 90% `ink` backdrop blur. The day room is also flat at rest (cards are bordered, Flutter cards are elevation 0 with a border), with one exception: floating layers that sit above the page.

### Shadow Vocabulary
- **Dialog lift** (`box-shadow: 0 24px 60px -12px rgba(15,26,56,0.35)`): the native `<dialog>` card on app surfaces, over a 50% navy backdrop.
- **Menu lift** (Tailwind `shadow-lg`): the workspace account dropdown.

### Named Rules
**The Hairline-Not-Shadow Rule.** A panel is separated by one step of tone and a 1px border. Shadows are reserved for layers that float over the page (dialogs, menus) on app surfaces, and never appear on the landing.

## Shapes

Gently rounded and consistent by role: controls (buttons, inputs, icon tiles) at 8px, cards, rows and table shells at 12px, panels and dialogs at 16px, and pills for badges, progress tracks, rails and timeline nodes. Chat bubbles are 16px with one 2px corner on the sender's side. Borders are always 1px hairlines; the only 2px strokes are the active tab underline and the "now" timeline ring.

Flutter maps these roles to its own radii: buttons and inputs 10, cards and banners 14, dialogs and bottom sheets 20, badges full.

## Components

### Buttons
Confident and quiet: solid fills, semibold labels, a brightness lift on hover and a 1% press.
- **Shape:** 8px radius, 44px minimum height in the app, 48px on the landing.
- **Signal (landing primary):** gradient fill (`signal-cyan` to `signal-mint` at 100deg; the frontmatter records its cyan start, the sidecar the full gradient) with Night Navy text, 24px horizontal padding, semibold. One per view region ("Request access", "Create an account", "Send").
- **Ghost (landing secondary):** transparent with an `ink-line` border and white text; hover raises the border to 40% white and adds a 5% white wash.
- **Primary (app):** `primary` fill with `on-primary` text (navy and white in light, mint and navy in dark), 16px padding.
- **Secondary:** Paper fill, hairline border, `fg` text, medium weight; hover fills with Mist.
- **Success / Danger:** `accent` (approve) and `danger` (reject, destructive) fills.
- **Hover / Focus / Active:** `filter: brightness(1.1 to 1.25)` over 120ms ease-out; `scale(0.99)` on press; disabled at 60% opacity. Global focus ring is a 2px teal outline with 2px offset.

### Chips / Badges
- **Style:** pill, 2px by 8px, 12px semibold, 10% tint of the tone with a 30% inset ring; Flutter uses a solid tinted pill without the ring.
- **State:** one status map (pending, approved, rejected, new, contacted, closed and so on) to five tones. Always text plus colour, never colour alone.

### Cards / Containers
- **Corner Style:** 12px for app cards and rows, 16px for night panels and the setup section.
- **Background:** Paper on light surfaces; Raised Navy on the night ground, with Night Navy rows nested inside.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1px `line` or `ink-line`.
- **Internal Padding:** 16px (cards, table cells 16px by 12px), 20 to 24px for section panels, 32px for the night enquiry form on wide screens.
- **Night panel header:** a small medium-weight white title on the left and the mono "Sample data" tag on the right.

### Inputs / Fields
- **Style:** 44px tall, 8px radius, 1px `line` border on Paper, 14px text, label above in 14px medium.
- **Focus:** 2px `accent` ring and accent border. On the night ground the field is `ink` with an `ink-line` border that turns Signal Cyan on focus.
- **Error / Disabled:** errors sit in a `danger` 10% box with a 30% border and `role="alert"`; Flutter uses a `danger` outline. Password fields carry a 44px show/hide toggle.

### Navigation
- **Landing header:** sticky, blurred navy, logo left, three anchor links in 80% white (hidden below 768px), "Sign in" text link and a compact Signal button right.
- **Tabs (admin):** a row of 44px tabs over a hairline; active tab is `accent` text with a 2px `accent` underline, others `muted` turning `fg` on hover.
- **Flutter:** 64dp navigation bar and rail on `surface`, Brand Subtle indicator pill, Deep Teal for the selected icon and label.

### Funnel (signature component)
The hero's live panel: one lead's path from a Meta ad to a WhatsApp reply. A Raised Navy panel stacks the ad row (with spend in mono), the "New lead" row (phone in mono), the outgoing template bubble whose tick goes sent, delivered, read (read turns Signal Cyan), the customer's reply, and a three-cell readout of Spend, Leads and Cost per lead in mono, the CPL settling in Signal Cyan. A 3px gradient rail on the left fills with each step.
- **Behaviour:** plays once when 40% in view (900ms per step, each row entering with opacity and an 8px rise over 320ms ease-out; CPL counts up over 700ms with an ease-out-quart), then holds its final state and offers a "Replay" control. It never loops (WCAG 2.2.2).
- **Still variant:** the auth aside renders it at its final state with no motion. Under reduced motion it is also static at the final state.
- **Honesty:** figcaption carries "Sample data"; values are illustrative and computed (spend divided by leads).

### Progress and timelines
- **Setup checklist (workspace, Flutter workspace):** a 6px pill track in Mist with a gradient fill, a mono "N of M done" count, and rows with a solid `ok` check for done steps and a hairline clock ring with "Coming soon" for steps not yet shipped.
- **Pending timeline:** 32px nodes joined by a hairline: done is solid `ok`, now is a 2px `accent` ring with "In progress", next is a hairline ring in `muted`.
- **Loading:** skeleton blocks shaped like the content, pulsing in `line` (Flutter: 0.55 to 1 opacity over 900ms on the in-out curve, stopped under reduced motion). No page-load spinners.

### Motion
One grammar on both platforms: `fast` 120ms for hovers and presses, `base` 200ms for colour changes (the tick), `slow` 320ms for entrances and rails; ease-out `cubic-bezier(.23,1,.32,1)` for everything that arrives, ease-in-out `cubic-bezier(.65,0,.35,1)` for loops like skeleton pulses. Flutter reads the same values from `Motion` and returns zero duration when the OS disables animations; Android routes use the fade-forwards page transition. Web dialogs enter with a 180ms fade and 0.96 scale, removed under `prefers-reduced-motion`.

## Do's and Don'ts

### Do:
- **Do** put the gradient only on live or finished state, or on the single primary CTA on the night ground (Signal-Only Rule).
- **Do** raise night panels one tonal step (`ink-2` on `ink`, `ink-3` inside `ink-2`) and edge them with a 1px `ink-line` border.
- **Do** set every number, rupee amount, phone number and timestamp in JetBrains Mono with tabular figures.
- **Do** label illustrative content "Sample data" in mono, and compute shown figures from the shown inputs.
- **Do** keep app surfaces light by default and opt them into OS dark with `.theme-auto`; in dark, use Soft Signal Teal primary with navy text.
- **Do** pair every status colour with a word (badges, "Done", "Coming soon", "In progress").
- **Do** use the shared motion tokens (120 / 200 / 320 ms, ease-out) and drop to no motion, or the final state, under reduced motion.
- **Do** keep tap targets at 44px on web and 48dp on Android.

### Don't:
- **Don't** fill backgrounds, sections or cards with the gradient, and don't set gradient text.
- **Don't** put drop shadows on landing panels or cards; shadows are for dialogs and menus on app surfaces only.
- **Don't** show invented statistics, customer logos, testimonials, partner badges or pricing.
- **Don't** loop the funnel or any signature motion; play once, hold, offer Replay.
- **Don't** use mono for headings, labels or body copy.
- **Don't** rely on colour alone for status.
- **Don't** extend the legacy `/dashboard` look (gray utility classes, light-only, tokens swapped in for colour) to new surfaces; it is a known gap awaiting its own pass.
