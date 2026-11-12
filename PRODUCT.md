# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The same product also ships as a native Android app built in Flutter (`mobile/`, Material 3); see `mobile/PRODUCT.md`. iOS is possible from the same code but not planned yet.

## Users
- **Primary:** Indian small-business owners and marketing agencies. Real-estate marketers are the first customer. They run their own WhatsApp broadcasts and Meta (Facebook/Instagram) lead-ad campaigns, are often non-technical, and work mostly from a phone between site visits and calls, with a desktop for bigger tasks like importing contacts or reviewing reports.
- **Their job:** turn ad spend into conversations, and conversations into customers. Send the right WhatsApp message to the right list, see who replied, reply quickly, and know which campaigns produce leads at an acceptable cost.
- **Platform admin:** the Broadzen operator (today realhubbmktg@gmail.com) reviews and approves every new account, handles landing-page enquiries, and watches sign-in activity.

## Product Purpose
Broadzen puts WhatsApp Business messaging and Meta Ads results in one place for small businesses. Success for a user is more replies and cheaper leads with less tool-switching. Success for the business is approved workspaces that keep sending.

## Positioning
- **WhatsApp + Meta Ads in one:** ad spend, leads and cost per lead (CPL) sit next to the WhatsApp conversations those leads become, from ad click to reply in one product. WATI, Interakt and AiSensy-style tools are messaging-first and don't show ad performance alongside the inbox.
- **Reviewed, private workspaces:** every account is approved by a person, and each business's data is isolated at the database level. This supports selling Broadzen per client, and as white-label later.

## Operating Context
- **Main workflow:**
  1. Meta lead ads bring in leads (Instant Forms).
  2. Leads become contacts, grouped into batches.
  3. The user sends approved WhatsApp templates as bulk broadcasts.
  4. They watch delivery and read status.
  5. They reply to customers in the shared inbox.
  6. They check CPL and spend per campaign.
- **Rules that come from Meta:** templates must be approved by Meta before sending. The WhatsApp number has a quality rating and a messaging tier. Opted-out numbers are skipped. Meta logins expire after about 60 days.
- **Imports:** contacts arrive as CSV/Excel files.
- **Currency:** ₹, with Indian number grouping (1,24,580).
- **Account lifecycle:** sign up, wait for approval, sign in to a private, empty workspace, then connect WhatsApp, Meta and contacts. The connect step is still being built (milestone B5).

## Capabilities and Constraints
- **Web app (Next.js) features:**
  - Meta + WhatsApp dashboard
  - campaigns
  - leads (by campaign, Instant Forms, summary, CSV export)
  - contacts (filters, batches, import wizard, dedupe)
  - WhatsApp inbox and chat
  - single send and 3-step bulk send with live progress
  - broadcast reports with failure reasons
  - templates (editor, preview, content score)
  - enquiries
  - RCS (coming soon)
  - settings
  - admin panel: requests, users, enquiries, login activity, audit log
- **Android app (Flutter):** the same features, plus an animated login, sign-up / pending / workspace screens, and the admin section.
- **Backend:** Next.js API + PostgreSQL (row-level security per workspace) + nginx, run locally in Docker. There is our own sign-in (email/password; Google once an OAuth client is configured). Firebase is used for push notifications only.
- **Legacy feature data:** until B5, the original Realhubb dataset is visible only to the platform admin. New users see a private, empty workspace with "coming soon" setup steps.
- **Open (not decided):** pricing and plans; public launch date; a custom domain for Broadzen (`realhubb.co.in` is in use today); whether Broadzen is, or will become, a Meta Business Partner.

## Brand Commitments
- **Name:** Broadzen, with the tagline "Broadcast smarter. Grow faster."
- **Official logo:** a mint→cyan gradient "B" symbol with a navy wordmark (`public/Broadzen Refined Logo Direction/`: 2 = full logo, 3 = symbol/favicon, 4 = version for dark backgrounds; animated logo `public/Broadzen animated logo.mp4`). Trimmed copies are in `public/brand/` and `mobile/assets/brand/`.
- **Committed palette and type** (2026-10-18, recorded in `design/figma/DESIGN_PLAN.md`): logo navy `#0F1A38`, mint→cyan gradient `#00F5E9 → #00C471`, Sora (brand) + Inter (UI).
- **Company:** Realhubb Ventures is the operating company and legal entity; "Broadzen" is the product name.

## Evidence on Hand
- **Real product usage:** the Realhubb workspace has live campaigns, leads, broadcasts and conversations. These are private customer data and must not be used in marketing.
- **Brand assets:** the logo set and animated logo listed above.
- **Not available, so do not fabricate:** customer testimonials, client logos, case studies, usage statistics, pricing, Meta partner badges, press mentions or review ratings. Marketing surfaces must work honestly without them, or show clearly marked placeholders for the user to fill.

## Product Principles
1. **From ad to reply in one place:** every screen should help connect spend, leads, messages and replies, not show them as separate silos.
2. **Phone-first for the busy owner:** the main jobs (reply, broadcast, check today's leads) must be fast with one thumb. Desktop adds depth, not access.
3. **Trust is a feature:** approval, privacy and Meta's rules (template approval, quality rating, opt-outs) are explained plainly, never hidden.
4. **Honest numbers:** metrics come from Meta and the database as they are, with clear caveats. No vanity counters.
5. **Calm under volume:** thousands of contacts and messages should still read as an orderly workspace.

## Accessibility & Inclusion
WCAG 2.2 AA:
- **Contrast:** 4.5:1 for text, enforced by tests on the Flutter tokens.
- **Touch:** 44px / 48dp minimum tap targets.
- **Zoom and text size:** pinch-zoom and system text scaling must work.
- **Motion:** the system "reduce motion" setting is respected.
- **Colour:** status is never shown by colour alone.

Google Play needs an in-app path to request account and data deletion, and an in-app privacy policy link. Users read English; Hindi and regional languages are a likely future need (open).
