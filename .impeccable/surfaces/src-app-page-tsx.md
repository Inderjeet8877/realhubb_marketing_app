---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: []
---

## Scope
Landing page (`/`), mode Persuade. Visitor: Indian SMB owner or agency running WhatsApp broadcasts and Meta lead ads, often on a phone. Action: request access (Start free → sign-up, which goes to admin approval) or send an enquiry. Proof: only what is real; no fabricated stats, logos, testimonials or partner badges (see PRODUCT.md). Constraint: under ~200 KB first-load JS, CSS/SVG motion, reduced-motion respected, no blocking pop-ups.

## Direction contract
THESIS: Broadzen is the one place where ad spend becomes a WhatsApp reply. Refuses the category's split hero with a static app screenshot, a logo strip and inflated stats.
OWN-WORLD: Night navy (#0F1A38) desk with deeper panels; the mint→cyan gradient appears only as signal: read ticks, progress, focus ring, the primary button. Sora display, Inter text, a mono for every number, phone and timestamp. Hairline panel borders, no drop-shadow cards, no decorative gradient fields.
STORY: Visitor sees an ad turn into a lead, a template go out, ticks go blue and CPL land in ₹, understands "ads and WhatsApp in one", believes it because the numbers are labelled honestly, and requests access.
FIRST VIEWPORT: Left: outcome headline in Sora, one line of subcopy, Start free (gradient) plus See how it works (ghost), and a line saying accounts are reviewed by a person. Right, at equal weight: a live-coded funnel panel: Meta lead-ad card → "New lead" row sliding in → WhatsApp template bubble whose ticks go ✓ → ✓✓ → read (cyan) → CPL readout in mono counting to a labelled sample value. Signature interaction: that 6-second funnel loop, frozen at its final state under reduced motion. Motion grammar: 120/200/320 ms, ease-out cubic-bezier(.23,1,.32,1).
FORM: Signal Room, position 1 on the ordered list (chosen as Impeccable's pick over the rolled position 7). seed:565fc3f850c9aeef
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved
Pricing (none shown until decided). Meta partner status (no badge). Public demo/sandbox (later).
