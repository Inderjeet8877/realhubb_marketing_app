# Realhubb redesign: Figma workspace

This folder holds the design plan for the Realhubb app redesign. The Figma file is built from these documents, and the code restyle follows the Figma file.

| File | What's in it |
|---|---|
| [DESIGN_PLAN.md](DESIGN_PLAN.md) | Design system (colours, type, spacing, components), every screen to design, store and accessibility rules, build order |
| [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) | The current Firestore data model, the FigJam diagram plan, problems found, and a proposed cleaner model |

## Status

| Step | State |
|---|---|
| 1. Plan (this folder) | ✅ Done, waiting for review |
| 2a. Figma: Brand + Foundations (Step A) | ✅ Built 2026-10-17, waiting for review (pick an icon concept) |
| 2b. Figma: Components (Step B) | ⛔ Blocked: Figma Starter plan hit its MCP tool-call limit (2026-10-17). Icons will be Lucide, built as local components |
| 3. Figma: Screens (mobile + desktop) | — |
| 4. FigJam: Database diagram | — |
| 5. Review round, changes | — |
| 6. Database decision | ✅ PostgreSQL + Redis (Docker), multi-tenant. Phase 1 hosting still open |
| 7. Build: Next.js web restyle, Flutter app, Postgres migration | — (separate plans after Figma sign-off) |
| 8. New repository | — |

## Stack
Next.js web · Flutter mobile · Next.js API · PostgreSQL 16 + Redis 7 in Docker · FCM for push only

## Figma file links
- Design file: https://www.figma.com/design/a3Sk72lAVW0N2vuRvbv9J3
- FigJam database diagram: —

## Figma Starter plan limits (current account)
- **3 pages per file.** Pages are `00 Cover & Brand`, `01 Foundations & Components` and `02 Screens`, with sections inside each instead of one page per topic.
- **1 variable mode.** Dark mode uses a separate `Color · Dark` collection with the same token names as `Color · Light`, and dark frames bind to it. If you upgrade to Professional, a script can merge the two into one collection with Light/Dark modes.
