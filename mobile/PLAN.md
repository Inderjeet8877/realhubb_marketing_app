# Realhubb Flutter app: build plan

**Goal:** replace the Capacitor wrapper (which just loads the website inside the app) with a real native Flutter app for Android, following the design in [../design/figma/DESIGN_PLAN.md](../design/figma/DESIGN_PLAN.md). iOS is possible later from the same code.

---

## 1. Where things stand (from the code)

| Item | Today |
|---|---|
| Android app | Capacitor shell loading `https://www.realhubb.co.in/auth/login`. App ID `com.realhubb.marketing`, versionCode 3 / 1.2.0 |
| Sign-in | Firebase Auth (email/password + Google), then `POST /api/auth/verify` checks `ALLOWED_EMAILS` |
| API | Next.js routes under `/api/*`. Only the Meta connect routes check auth (`requireAdmin`, Bearer ID token) |
| Realtime | Inbox and broadcast progress use **browser Firestore listeners**. The Flutter app won't, because the Firestore rules are open to anyone (see DATABASE_SCHEMA.md S1) |
| Push | FCM, with tokens registered through `/api/notifications/register` |
| Toolchain on this PC | Android SDK ✅, Java ✅, **Flutter not installed** ❌ |

---

## 2. Key decisions

| Decision | Choice | Why |
|---|---|---|
| Folder | `mobile/` in this repo (moves to the new repo later) | One place for now; web, app and backend sit side by side |
| App ID | **Keep `com.realhubb.marketing`**, versionCode 4+ | Existing installs **update in place** on Play. Needs the **same signing keystore** as the current app |
| Backend for now | **The current Next.js API** (`https://www.realhubb.co.in`), base URL set by build flag | The Postgres backend isn't built yet. All HTTP sits behind one `ApiClient` plus one repository per feature, so the switch to the new backend later only touches `lib/data/` |
| Auth for now | Firebase Auth (same accounts), Bearer ID token on every request | Matches the web. Swapped for our own auth along with the backend |
| Realtime | Poll the API every 5 s while the inbox or chat is open, plus an instant refresh when a push arrives | No insecure Firestore access from the app. Replaced by SSE/WebSocket with the new backend |
| Meta account connect | **Done on the web in v1.** The app shows status, expiry and a "Connect on web" button | The OAuth flow is built around browser redirects. Rebuilt natively with the new backend |
| Exports (CSV/PDF) | CSV is generated on the phone and shared through the system share sheet. PDF later | Simplest, works offline |

## 3. Stack (kept small)

| Need | Package |
|---|---|
| State | `flutter_riverpod` |
| Navigation | `go_router` (bottom bar shell + deep links) |
| HTTP | `dio` (auth interceptor, retries) |
| Auth | `firebase_core`, `firebase_auth`, `google_sign_in` |
| Push | `firebase_messaging`, `flutter_local_notifications` |
| Charts | `fl_chart` |
| Icons | `lucide_icons` (same set as the web's `lucide-react`) |
| Files | `file_picker` (contact import), `csv`, `share_plus`, `url_launcher` |
| Storage | `shared_preferences` (theme, last account choice) |
| Formatting | `intl` (₹ en-IN, dates) |

**Fonts:** Sora + Inter are bundled as assets, not downloaded at runtime.

## 4. App structure

```
mobile/lib/
  main.dart                 app start, Firebase init, theme, router
  theme/                    tokens.dart (colours from the Figma variables), app_theme.dart (light + dark)
  data/                     api_client.dart, models/, repositories/ (one per feature), the only layer that knows the backend
  core/                     formatters, phone normalise, CSV, push setup
  widgets/                  design-system components: Button, StatCard, StatusBadge, AppCard,
                            EmptyState, AlertBanner, SegmentedControl, ActionQueueItem, ChatBubble ...
  features/
    auth/                   login, splash, allow-list check
    shell/                  NavigationBar (phone) / NavigationRail (tablet), More sheet
    dashboard/              Meta view + WhatsApp view (toggle)
    inbox/                  conversation list, chat, composer, webhook diagnostics
    send/                   single send, bulk send (3 steps), live progress
    broadcasts/             list, details, failure reasons
    templates/              grid, preview, editor (Edit/Preview tabs), content score
    campaigns/  leads/      tables → card lists on phone, lead detail sheet, CSV export
    contacts/               list, filters, batches, import wizard, remove duplicates
    enquiries/  rcs/
    settings/               Meta status, notifications, devices, appearance, account & data
```

## 5. Screens (navigation from DESIGN_PLAN §4)

**Bottom bar:** Home · Inbox · Leads · Contacts · More. **More** contains Campaigns, Templates, Broadcasts, Enquiries, RCS, Settings, Privacy and Data deletion, and Sign out.

Every screen gets **light and dark** (System / Light / Dark switch), loading skeletons, an empty state with an action, an error state with retry, pull-to-refresh, 48dp tap targets, labels for screen readers, and support for system font scaling.

## 6. Milestones (each ends with a check-in and a commit)

| # | Delivers | Done when |
|---|---|---|
| **M0** | Install Flutter, `flutter create`, add packages, theme tokens, fonts | `flutter doctor` passes; the app opens on the emulator showing the themed splash |
| **M1** | Login (email + Google), allow-list check, app shell with bottom bar / rail, More sheet, theme switch | Sign in with a real allowed account; tabs navigate |
| **M2** | Inbox: conversation list, search, unread, chat with ticks, send reply, polling, push → open chat | Reply to a real customer from the phone |
| **M3** | Dashboard (Meta + WhatsApp), Campaigns, Leads (tabs, form leads sheet, CSV share) | Numbers match the web dashboard |
| **M4** | Contacts (filters, batches, delete, dedupe), Import wizard, Single send, **Bulk send 3-step**, Broadcasts with live progress and failure dialog | Send a small test broadcast end to end |
| **M5** | Templates (grid, preview, editor with live preview and content score), Enquiries, RCS, Settings (devices, notifications, Meta status) | Create a template that reaches Meta "Pending" |
| **M6** | Polish and release: adaptive icon (Concept A), splash, notification icon, accessibility pass, signed release AAB | Install over the existing Capacitor app on a real phone without uninstalling |

**Checks per milestone:** `flutter analyze` clean, unit tests for the logic that can silently go wrong (phone normalising, CPL thresholds, CSV export, content score), and a run on the emulator.

## 7. Small backend changes the app will need

These are found during the build and kept minimal:
- The inbox list and broadcast progress have **no API today**; they're read straight from Firestore in the browser. They need 1–2 read endpoints (e.g. `GET /api/whatsapp/conversations`, and `GET /api/whatsapp/broadcasts?id=` already exists).
- The app sends a Bearer token on every call, so the routes can start requiring it (this also fixes security issue S2).

## 8. Needed from you

1. **Approve installing the Flutter SDK** at `C:\src\flutter` (stable channel, about 2 GB), added to the user PATH.
2. **Keep the app ID `com.realhubb.marketing`** so it updates the existing app? (Recommended.) That needs the **release keystore** used for the current Play/APK build, with its passwords. Where is it?
3. **Firebase Android config:** the `google-services.json` for `com.realhubb.marketing` (it's probably already in `android/app/`).
4. OK for **Meta connect to stay on the web** in v1?
