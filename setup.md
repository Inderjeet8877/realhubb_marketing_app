# Realhubb Platform — Developer Setup & Architecture Reference

Internal marketing automation platform for Realhubb Ventures: Meta Ads analytics, WhatsApp Cloud API bulk broadcasting/inbox, contact management, and lead tracking. Shipped both as a Next.js web app (Vercel) and as a native Android app (Capacitor, remote-URL mode).

- **Production URL**: https://www.realhubb.co.in
- **Repo**: https://github.com/Inderjeet8877/realhubb_marketing_app
- **Android package ID**: `com.realhubb.marketing`
- **Firebase project**: `realhubb-marketing-app`

---

## 1. Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router), React 18, TypeScript |
| Styling | Tailwind CSS |
| Hosting | Vercel (serverless functions for all `/api/*` routes) |
| Auth | Firebase Auth (Google + email/password), allow-list enforced server-side |
| Database (app data) | Firebase Firestore (`firebase-admin` on server, `firebase` client SDK for realtime listeners) |
| Contacts storage | **Google Sheets** via a Google Apps Script web app (NOT Firestore) — see §5 |
| WhatsApp | Meta WhatsApp Cloud API (Graph API v21–v22), up to 3 accounts |
| Media hosting | Cloudinary (template header images) |
| Push notifications | Firebase Cloud Messaging — web push (browser) + native push (Capacitor/Android) |
| Mobile app | Capacitor 8, Android only (no iOS — no Mac available), **remote-URL mode** (loads the live site in a WebView, not a static bundle) |
| PWA | `next-pwa` (service worker at `/sw.js`, precached via Workbox) |

---

## 2. Repository layout

```
src/
  app/
    page.tsx                        marketing landing page ("/")
    auth/login/page.tsx              email+Google sign-in, allow-list check, redirects to /dashboard if already authed
    dashboard/
      layout.tsx                     mounts <NotificationSetup /> — active on every dashboard page
      page.tsx                       dashboard home
      whatsapp/page.tsx              Send / Inbox / Bulk Send / Reports tabs (~1500 lines)
      whatsapp/templates/page.tsx    template CRUD + live Meta status + phone preview
      contacts/page.tsx              CSV/XLSX upload, batches, dedupe
      campaigns/, leads/, settings/  Meta Ads analytics, lead capture, account settings
    api/
      whatsapp/
        send/route.ts                single + bulk send (POST), header-media validation
        webhook/route.ts             Meta webhook: inbound messages + delivery/read status, sends FCM push
        templates/route.ts           GET (live Meta fetch + Firestore merge), POST (create on Meta), PUT (upsert/edit), DELETE
        account-info/route.ts        live WABA phone number lookup (avoids hardcoding account number in UI)
        broadcasts/, mark-read/, messages/, simulate-inbound/, setup-webhook/, test-*/
      contacts/route.ts              proxies to Google Sheets Apps Script (parse, addBatch, dedupe, delete)
      notifications/register/route.ts  POST/DELETE fcm_tokens (used by both web and native push)
      meta/                          Ads account OAuth connect/callback, campaigns, leads
      upload/route.ts                Cloudinary image upload
      auth/verify/route.ts           server-side allow-list check after Firebase sign-in
      firebase-sw/route.ts           serves /firebase-messaging-sw.js dynamically (injects Firebase config)
  components/
    NotificationSetup.tsx            toast stack, sound, unread badge, web+native push registration — see §7
    WhatsAppTemplatePreview.tsx      shared WhatsApp-phone-mockup preview (compact + full-size modes)
    AuthProvider.tsx
  contexts/NotificationContext.tsx    notification preference toggles (persisted to localStorage)
  lib/
    firebase.ts                      client SDK init
    firebase-admin.ts                admin SDK init (cert from FIREBASE_ADMIN_* env vars, falls back to placeholder)
    firebase-auth.ts
    meta-api.ts                      Meta Graph API helpers (Ads side)
    swr.ts
android/                              Capacitor native Android project (Gradle)
capacitor.config.ts                    server.url points at the live production site
assets/icon.png                        source icon for `capacitor-assets generate` (from public/rm.png)
www/                                   placeholder web root (Capacitor requires it to exist; unused at runtime)
```

---

## 3. Environment variables

All server-only vars live in `.env.local` (gitignored) locally and in Vercel Project Settings → Environment Variables (Production **and** Preview — both must be set) for deployment. `NEXT_PUBLIC_*` vars are inlined at build time.

### Firebase (client)
```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID          = realhubb-marketing-app
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_VAPID_KEY            web push only (Project Settings → Cloud Messaging → Web Push certificates) — NOT currently set; native push (Capacitor) doesn't need it
```

### Firebase Admin (server, required for every Firestore-backed API route)
```
FIREBASE_ADMIN_CLIENT_EMAIL     from a downloaded service-account JSON (Project Settings → Service accounts → Generate new private key)
FIREBASE_ADMIN_PRIVATE_KEY      same JSON's private_key, with real newlines re-encoded as literal "\n" (see §9 gotcha)
```
Without these, `firebase-admin.ts` silently inits a placeholder app — every Firestore call then throws `Could not load the default credentials`.

### Meta / WhatsApp Cloud API — up to 3 independent accounts
```
META_APP_ID / META_APP_ID_2 / META_APP_ID_3            the Meta App ID (used for the Resumable Upload API when attaching template header media)
META_ACCESS_TOKEN_1/2/3                                  System User permanent token per account
WHATSAPP_BUSINESS_ACCOUNT_ID_1/2/3                       WABA ID
WHATSAPP_PHONE_NUMBER_ID_1/2/3                           phone number ID (the "from" number for sends)
WHATSAPP_WEBHOOK_VERIFY_TOKEN                            arbitrary string, must match Meta App Dashboard webhook config
```
Account resolution pattern used throughout: `accountNum = (accountId === '2' || accountId === '3') ? accountId : '1'`, then `process.env[\`META_ACCESS_TOKEN_${accountNum}\`]` etc. Only account 1 is actually configured/in use as of this writing.

### Cloudinary (template header image uploads)
```
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
CLOUDINARY_UPLOAD_PRESET
```

### Contacts (Google Sheets backend, not Firestore)
```
GOOGLE_SHEETS_API_URL     the deployed Google Apps Script /exec URL
```

### Misc
```
NEXT_PUBLIC_APP_URL       used for OAuth redirect construction (Meta Ads connect flow)
```

---

## 4. Firestore — collections reference

Firestore is Spark (free) plan — see §9 for the quota incident and the fixes applied.

| Collection | Written by | Read by | Notes |
|---|---|---|---|
| `whatsapp_conversations` | webhook (inbound), send/route.ts (outbound `saveMessage`) | Inbox listener (capped `orderBy(createdAt desc) limit(500)`), NotificationSetup listener (`limit(20)`), templates content lookup | One doc **per message**, not per conversation — client groups by `phone` |
| `whatsapp_templates` | templates POST/PUT | templates GET (merged with live Meta data by `metaTemplateId` then `name`) | Only stores local metadata (`headerContent` URL etc.) — template text/status is always fetched live from Meta on GET |
| `fcm_tokens` | `/api/notifications/register` (doc ID = token itself) | webhook's `sendPushNotification()` (reads ALL, no limit — collection stays small, this is fine) | Stale tokens (`NotRegistered`/`InvalidRegistration`) auto-deleted after a failed send |
| `bulk_reports` | send/route.ts (bulk), updated via `runTransaction` on delivery/read status webhooks | Reports tab | One doc per broadcast batch, `contacts: [{phone, wamid, status}, ...]` array |
| `wamid_index` | send/route.ts (bulk, one doc per sent message: `wamid → broadcastId`) | webhook status handler (look up which report to update) | |
| `webhook_logs` | not currently written by the real webhook (a stale diagnostic path in `simulate-inbound` GET reads this but nothing populates it — dead code, safe to ignore/remove) | | |

**Firestore security rules** (`firestore.rules`): `whatsapp_conversations`, `whatsapp_templates`, `webhook_logs` are fully open (webhook writes without user auth); `users/{uid}` and subcollections require `request.auth.uid == uid`; `contacts`/`campaigns` rules exist but are unused now that contacts live in Google Sheets.

---

## 5. Contacts — Google Sheets backend (not Firestore)

`/api/contacts/route.ts` proxies everything to a Google Apps Script web app (`GOOGLE_SHEETS_API_URL`):
- `GET ?action=getAll[&dataName=X]` / `?action=getCategories`
- `POST {action:'addBatch', contacts:[...]}` — bulk insert
- `POST {action:'dedupe', dataName, dryRun?}` — **dedup logic runs entirely in our own route** (fetch all → keep first occurrence per phone → `deleteByIds` on the rest), not in the Apps Script, so it works regardless of what dedup (if any) the Script does itself
- `DELETE {ids:[...]}` / `{dataName}` / `{}` (delete all)

`fetchWithRetry()` wraps every Sheets call: 3 attempts, 45s timeout via `AbortController`, exponential backoff — Apps Script web apps intermittently `ECONNRESET` (they re-scan the whole sheet per request and can be slow).

Upload flow (`src/app/dashboard/contacts/page.tsx`):
1. `POST /api/contacts?preview=true` (multipart) → parses CSV/XLSX, returns `{valid, corrupted, intraFileDuplicates}` without saving
2. Client chunks `valid` into batches of `BATCH_SIZE = 50`, POSTs each sequentially with its own 3-attempt retry+backoff loop
3. One batch failing after retries no longer aborts the rest of the upload (previously it did — real bug fixed) — failures are counted and reported (`failedBatches`/`failedContacts`) instead

CSV/XLSX column detection is heuristic (`isName`/`isPhone`/`isEmail`/`isTag` regexes against header row), not positional.

---

## 6. WhatsApp templates — creation, live status, sending

### Creation (`templates/route.ts` POST)
1. Sanitizes name (`[a-z0-9_]`, must start with a letter)
2. If header is image/video/document: `uploadMediaHandle()` downloads the file from its URL and uploads to Meta's **Resumable Upload API** (`POST /{app-id}/uploads` → `POST /{upload-id}` with the binary) to get a `header_handle`, required by Meta to approve a media-header template
3. `POST /{waba-id}/message_templates` with the built `components` array
4. Best-effort save to Firestore `whatsapp_templates` for local metadata

### Editing / attaching media after the fact ("Save Locally", PUT)
- **Upserts** (`.set(..., {merge:true})`), not `.update()` — templates created directly in Meta Business Manager (never through this app) have no Firestore doc yet; `.update()` on a nonexistent doc used to throw and silently break the "attach an image" flow
- **Validates the header media URL server-side before saving** (`validateHeaderMediaUrl()`): fetches it, requires 200/206 and (for image/video) a matching `content-type`. This exists because a private/login-gated URL (e.g. pasting a `res-console.cloudinary.com` dashboard-preview link instead of the public `res.cloudinary.com` CDN URL) looks like a valid string but Meta silently accepts the send and never delivers the message — no error anywhere. Always use the in-app "Upload to Cloudinary" button, never a manually copied dashboard URL.

### Live status (GET)
Always fetches templates **live from Meta** (with pagination via `paging.next`), then merges in Firestore's `headerContent`/local metadata by `metaTemplateId` (falling back to name match). Meta API errors are surfaced verbatim (`Meta error (code): message`) rather than silently returning an empty list — this was a real bug (empty list looked identical to "no templates yet"). No auto-polling (removed — was hitting Firestore every 20s for no real benefit, template review takes hours); manual "Refresh Status" button only.

### Sending — the "accepted but never delivered" failure class
Both `handleSingleSend` and `handleBulkSend` in `send/route.ts` **must** include an accurate header-media parameter for any image/video/document template — if you omit it (or pass an empty/invalid string), **Meta's API returns success (accepts the call, gives a `wamid`) but never actually delivers the message, with zero error anywhere in the pipeline.** This bit us twice in production. Guards now in place:
1. Client: Send buttons disabled if the selected template needs media and none is attached/typed
2. Server: rejects with a clear 400 if `templateHeaderContent` is empty **or** fails `new URL(...)` parsing, before ever calling Meta
3. `templateSendImageUrl` (the manual override field on the Send tab) is seeded directly from the freshly-fetched template on selection — it used to fall back to display a value it never actually held in state, which could submit a stale/empty URL

**Templates and the Send/Bulk Send tabs re-fetch from `/api/whatsapp/templates` every time those tabs/modals open** (not just on page mount) specifically to avoid submitting a stale `headerContent` after editing a template in another tab.

### Preview (`WhatsAppTemplatePreview.tsx`)
Renders an actual WhatsApp-phone mockup (dark header bar, `#e5ddd5` chat wallpaper, `#d9fdd3` outgoing bubble, buttons as a separate divided card below the bubble matching real WhatsApp). `compact` prop controls frame size (260px wide / 340px tall visible chat area for inline dropdown use vs. 280px/400px for the dedicated preview modal). Chat area content starts at the **top** (not bottom-anchored) and scrolls — anchoring to the bottom was hiding the header image/opening lines above the fold for long templates.

---

## 7. Notifications — web push, native push, and in-app alerts

Three independent layers, all driven from `NotificationSetup.tsx` (mounted in `dashboard/layout.tsx`, active on every dashboard page):

1. **In-app (Firestore realtime listener)** — `onSnapshot` on `whatsapp_conversations` (`limit(20)`). Fires a toast, plays a synthesized ping (Web Audio, no audio file), increments the unread badge, for any newly-`added` inbound doc. This is the most reliable layer since it doesn't depend on OS-level push at all.
   - **"Last seen" tracking** (`localStorage['whatsapp_last_seen_ts']`): the very first snapshot after a listener (re)connects used to be unconditionally skipped as "existing data" — but a message that arrived while the app was closed/frozen looks identical to old data at reconnect time, so reopening the app after missing a push used to **also** silently miss it in-app. Fixed: the first snapshot is now compared against the persisted last-seen timestamp; anything newer is surfaced as toasts (capped at 5 individual + a "+N more" summary) the moment the app reopens.

2. **Web push** (browser, PWA) — `firebase/messaging` `getToken()` via the service worker at `/firebase-messaging-sw.js` (dynamically generated by `api/firebase-sw/route.ts`, injecting the Firebase config so the SW itself needs no build-time secrets). Requires `NEXT_PUBLIC_FIREBASE_VAPID_KEY` (not currently set — this path is effectively dormant since native push covers the app usage).

3. **Native push** (Capacitor/Android) — `@capacitor/push-notifications`. Gated on `(window as any).Capacitor?.isNativePlatform?.()`, because **the web `Notification.permission` API does not reflect real state inside a Capacitor WebView** (this was a real bug — the permission-check effect never called `registerFCM()` on native because it was reading the wrong API). Native path:
   - `PushNotifications.checkPermissions()` / `.requestPermissions()` (native OS permission dialog)
   - `PushNotifications.createChannel({id:'whatsapp_replies', importance:5, visibility:1, vibration:true})` — **must** happen before the server ever references this `channelId`; targeting a channel ID the app hasn't created can cause Android to silently drop the notification
   - `PushNotifications.register()` → `registration` event → POST token to `/api/notifications/register` (same Firestore `fcm_tokens` collection as web push — the webhook's send code is platform-agnostic)
   - `pushNotificationReceived` (foreground) → toast; `pushNotificationActionPerformed` (tapped from background) → `router.push('/dashboard/whatsapp')`

**Server send** (`webhook/route.ts` → `sendPushNotification()`): `messaging.sendEachForMulticast()` to all registered tokens, `android: {priority:'high', notification:{channelId:'whatsapp_replies', visibility:'public'}}` + a `webpush` block for browser delivery. Stale tokens (failed responses) are deleted from `fcm_tokens` automatically.

**Android manifest requirement**: `<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />` — required on Android 13+ (this app targets SDK 36) or the OS silently drops every notification regardless of what the app requests at runtime. The Capacitor plugin's own manifest does **not** declare this; it had to be added to `android/app/src/main/AndroidManifest.xml` manually.

### OEM background-kill — a real, unfixable-in-code limitation
Confirmed via `adb logcat` + `adb shell dumpsys usagestats` on a physical Samsung device: even with permission + channel + priority all correct, a push notification can be silently dropped if Samsung's proprietary "Freecess" process-freezing kills the app right as the message arrives (visible in logs as `FreecessHandler: freeze com.realhubb.marketing`, correlated with a `STANDBY_BUCKET_CHANGED` demotion). No FCM priority setting can override an OS-level frozen process. User-side mitigations (must be set on the device, not fixable in code):
- Settings → Apps → Realhubb → Battery → **Unrestricted**
- Settings → Battery and device care → Battery → Background usage limits → remove from "Sleeping apps"/"Deep sleeping apps", and ideally add to **"Never sleeping apps"**
- Settings → Notifications → Realhubb → enable **"Pop-up notifications"** (otherwise delivered notifications land silently in the shade with no heads-up banner — this is a separate, non-bug Samsung display setting; confirmed via `dumpsys notification` that `mImportance=5` was correctly registered but `InterruptionStateProvider` still logged `DISABLE_HEADS_UP`)

Given these OEM limits, the in-app "surface missed messages on reopen" fix (item 1 above) is the actual safety net — it guarantees you'll never miss a reply once you open the app, independent of whether the OS delivered a push.

---

## 8. Android app (Capacitor)

- **Mode**: remote-URL (`capacitor.config.ts` → `server.url: 'https://www.realhubb.co.in/auth/login'`). The native shell has **no bundled app logic** — it's a WebView pointed at the live production site. This means:
  - Any change to `src/app/**` or `src/components/**` takes effect the moment it's deployed to Vercel — **no APK rebuild needed**
  - An APK rebuild **is** needed only for native-layer changes: `AndroidManifest.xml`, `capacitor.config.ts`, Gradle files, icon/splash assets, or adding/updating a native plugin
- **Login-first**: opens directly to `/auth/login` (skips the marketing landing page at `/`); the login page auto-redirects to `/dashboard` if a Firebase Auth session already exists, so this only shows once per login
- **Icon**: generated from `public/rm.png` (2000×2000 source) via `@capacitor/assets` (`npx capacitor-assets generate --android`) into all `mipmap-*` densities + adaptive icon + splash screens (light and dark)
- **Versioning**: `android/app/build.gradle` → `versionCode` (int, must strictly increase) / `versionName` (string shown in Settings). **Bump both before every build handed to the user.** Current: `versionCode 3`, `versionName "1.2.0"`.
- **Signing**: debug-signed only (sideload distribution, no Play Store listing) — same debug key across builds means a new APK installs as an update over the old one without needing to uninstall first

### Local build toolchain (Windows)
- **JDK**: must use Android Studio's bundled JBR (JetBrains Runtime), **not** the system `java` — Capacitor's Android library requires Java 21 source compatibility; the system default here is Java 17. Always build with:
  ```
  ./gradlew assembleDebug -Dorg.gradle.java.home="C:\Program Files\Android\Android Studio\jbr"
  ```
- **SDK**: Android Studio auto-installs to `%LOCALAPPDATA%\Android\Sdk`. `android/local.properties` (gitignored, machine-specific) must point `sdk.dir=` there — use forward slashes, Gradle accepts them fine on Windows.
- **google-services.json**: lives at `android/app/google-services.json`, committed to the repo (contains only client-side Firebase config — same trust level as the already-public `NEXT_PUBLIC_FIREBASE_*` keys). `android/app/build.gradle` only applies the `com.google.gms.google-services` plugin if this file exists, so its absence doesn't break a build, just disables push registration.
- **Full rebuild sequence** after any native-layer change:
  ```
  npx cap sync android
  cd android
  ./gradlew assembleDebug -Dorg.gradle.java.home="C:\Program Files\Android\Android Studio\jbr"
  ```
  Output: `android/app/build/outputs/apk/debug/app-debug.apk`. Copy to a version-stamped filename (`realhubb-v1.2.0.apk`) for handoff clarity.
- **Install**: no Play Store — sideload only. Either `adb install` over USB (with Developer Options → USB debugging enabled + the on-device "Allow" prompt), or copy the `.apk` to the phone and install directly (enable "install from unknown sources" on first install).

### Debugging on a physical device
```
adb devices                                    # confirm connection
adb logcat -c && adb logcat -v time > log.txt  # capture (Ctrl+C or kill the PID to stop)
adb shell dumpsys notification --noredact      # current notification shade + channel importance
adb shell dumpsys usagestats | grep <package>  # persistent history — standby bucket changes, NOTIFICATION_INTERRUPTION events, survives shade dismissal
adb shell dumpsys package <package> | grep version
```
This is the only way to get ground truth on notification delivery — don't guess from user reports alone; `NOTIFICATION_INTERRUPTION` presence/absence in `usagestats` definitively proves whether the OS ever posted a given notification.

---

## 9. Known issues, gotchas, and incident notes

- **Firestore Spark plan quota (RESOURCE_EXHAUSTED)**: this project is on the free tier (50K reads/20K writes/20K deletes per day), which the whole app depends on — hitting it takes down contacts, templates, and WhatsApp sending simultaneously, for everyone, until the daily reset (midnight Pacific). Two real drains found and fixed:
  - Inbox conversations listener queried the entire `whatsapp_conversations` collection with no `limit()` — now capped to the most recent 500 via `orderBy(createdAt desc) limit(500)`
  - A 20s auto-poll on the Templates page (re-reading the whole `whatsapp_templates` collection every 20 seconds while any template was pending Meta review) — removed entirely, manual refresh only
  - If usage grows, the real fix is upgrading to Blaze (pay-as-you-go) — it keeps the same free daily tier and only bills beyond it, removing the hard wall entirely
- **`.env.local` private key encoding**: `FIREBASE_ADMIN_PRIVATE_KEY` must be stored as a single line with literal `\n` two-character sequences (matching the downloaded service-account JSON's escaped format), not real newlines — the code does `rawKey.replace(/\\n/g, '\n')` at runtime. A truncated/malformed paste (missing a line during manual copy from an editor) produces `Invalid PEM formatted message` — verify with `crypto.createPrivateKey()` before trusting a manually-pasted key.
- **Vercel env var changes require a redeploy** — saving a new value in the dashboard does not retroactively apply to an already-built deployment; trigger a fresh build (push any commit, including an empty one, or use the Vercel dashboard's Redeploy button).
- **PWA service worker (`public/sw.js`) is a build artifact** — running `npm run build` locally regenerates it with new precache manifest hashes; this diff should be reverted (`git checkout -- public/sw.js`) before committing unless you specifically intend to ship a locally-built SW (Vercel builds its own on deploy regardless).
- **Multi-account support is scaffolded but only account 1 is live** — `META_APP_ID_2/3`, `META_ACCESS_TOKEN_2/3` etc. are present in `.env.local` as empty placeholders for future WhatsApp accounts (e.g. a separate Leads number).
- **`src/app/dashboard/whatsapp/page.tsx.bak`** — a stale backup file from an earlier fix, not part of the build, safe to ignore or delete.
- **`src/app/page.tsx`** has a pre-existing typo: `href=" /auth/login"` (leading space) in all 4 links — cosmetically harmless (browsers normalize it) but worth fixing if touching that file.

---

## 10. Local development

```bash
npm install
cp .env.local.example .env.local   # fill in real values — see §3
npm run dev                         # http://localhost:3000 (or next available port)
npm run build                       # production build — always run before pushing
npm run lint
npx tsc --noEmit -p tsconfig.json  # type-check
```

Firestore-backed API routes will throw `Could not load the default credentials` locally unless `FIREBASE_ADMIN_CLIENT_EMAIL`/`FIREBASE_ADMIN_PRIVATE_KEY` are set — these are intentionally not shared casually since they're a live service-account credential; get them from Firebase Console → Project Settings → Service accounts (see §3).

**Never run a second `npm run dev` / Gradle build concurrently against the same `.next` or `android/build` output while another instance is live** — they share build caches and will corrupt each other's compiled output (seen as `__webpack_require__.a is not a function` errors).

## 11. Deployment

- **Web**: push to `main` → Vercel auto-deploys (GitHub integration already connected). No manual deploy step.
- **Android**: not automated — rebuild the APK locally per §8 and hand it to the user directly (no Play Store, no CI). Since the app loads the live site, **most changes need no APK rebuild at all** — only native-layer changes do.
