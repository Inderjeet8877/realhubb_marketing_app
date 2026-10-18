# Broadzen backend: accounts, admin approval, data isolation (local Docker)

**Goal:**
- **Admin panel:** the admin sees who applied from the landing page, who tried to sign in, and who asked for an account, and approves or rejects them.
- **Approved access only:** only approved users can sign in.
- **Private workspaces:** each user gets their own empty workspace and **can never see another user's data**.
- **Runs locally:** Docker + nginx.

Builds on the earlier decision ([design/figma/DATABASE_SCHEMA.md §3](../design/figma/DATABASE_SCHEMA.md)): **PostgreSQL**, with a `tenant_id` on every table from day one.

---

## 1. How it works (user journey)

```
Landing page ──"Get started" form──▶ Enquiry ───────────────┐
                                                             ▼
App / web ──"Create account"──▶ Account request (pending) ─▶ ADMIN PANEL ──approve──▶ user can sign in
                                                             │            └─reject──▶ "request declined" (with reason)
Every sign-in attempt (ok / wrong password / pending / ...) ─┘ (Login activity)
```

1. **Sign up** (web or Flutter app): name, email, company/workspace name, password, **or "Continue with Google"**. This creates a **workspace (pending)** and its **owner user (pending)**. The screen says *"Request received. We'll email you when it's approved."*
2. **Admin approves** in the panel. The workspace and user become active, and an email is sent if email sending is configured.
3. **Sign in:**
   - pending → *"Your account is waiting for approval"*
   - rejected → *"Your request was declined"*
   - suspended → *"Account suspended"*
   - approved → into **their own empty workspace**
4. **Logged:** every attempt is recorded (email, result, method, IP, device, time) for the admin's *Login activity* page.
5. **Enquiry to account:** the admin can turn a landing-page enquiry into an account invite with one click.

## 2. Data security: no user can see another user's data

Three independent layers, so a single bug can't leak data:

| Layer | What it does |
|---|---|
| **1. Auth on every API call** | Every route (except sign-in, sign-up and the public enquiry form) requires a valid session. Today most routes have **no auth at all** (issue S2); all of that ends here |
| **2. Workspace scoping in code** | The workspace comes **only from the signed-in session**, never from the request. Every query goes through one helper, `withTenant(session, tx => …)` |
| **3. Postgres Row-Level Security (RLS)** | Each request runs in a transaction with `SET LOCAL app.tenant_id = …`. RLS policies on every tenant table block other workspaces' rows **inside the database**, even if code forgets a `WHERE` |

Plus:
- **Two database roles:** `broadzen_app` (normal role, **cannot bypass RLS**) for the app, and `broadzen_owner` for migrations only.
- **Passwords:** hashed with **argon2id**. Google sign-in works by verifying Google's ID token on the server.
- **Sessions:**
  - short **access token (15 min)** plus a **refresh token (30 days, rotated, stored hashed, revocable)**;
  - web stores them in **httpOnly secure cookies** (CSRF-protected);
  - the Flutter app stores them in the device's **secure storage**.
- **Brute-force protection:**
  - nginx rate limit on `/api/auth/*`;
  - after 5 failed attempts in 15 minutes, that email + IP must wait.
- **Admin is separate:** a *platform admin* role, not a workspace role. Admin pages and APIs check it on the server. The admin sees **account info only** (requests, enquiries, login activity), not a customer's WhatsApp or Meta data.
- **Audit log:** every admin action is recorded (approved, rejected, suspended).
- **Secrets:** only in `.env` (never committed). nginx sets security headers. HTTPS is local via a dev certificate, and real HTTPS in production.

## 3. Database (Postgres 16): new tables in this step

| Table | Key columns | Scope |
|---|---|---|
| `tenants` (workspaces) | name, status `pending/active/suspended/rejected`, created_at | — |
| `users` | **tenant_id**, email (unique), name, password_hash?, google_sub?, role `owner/admin/agent`, status `pending/approved/rejected/suspended`, is_platform_admin, approved_by, approved_at, reject_reason, last_login_at | tenant |
| `sessions` | user_id, refresh_token_hash, device, ip, expires_at, revoked_at | user |
| `login_attempts` | email, user_id?, method `password/google`, result `ok/bad_password/no_account/pending/rejected/suspended/locked`, ip, user_agent, created_at | platform (admin only) |
| `enquiries` | name, email, phone, company, message, status `new/contacted/invited/closed`, notes, created_at | platform (admin only) |
| `audit_log` | actor_user_id, tenant_id?, action, target, meta (jsonb), created_at | platform |

**Tools:** **Drizzle ORM** with SQL migrations, so schema changes are versioned. On first run, a **seed** creates the platform admin from `.env` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`).

Later steps move WhatsApp, Meta, contacts and broadcasts into tenant tables (`DATABASE_SCHEMA.md §3.1`), so **each workspace connects its own Meta/WhatsApp account**.

## 4. What gets built

**Backend (inside the existing Next.js app, under `src/server/` + `src/app/api/`):**
- `POST /api/auth/signup`, `/login`, `/google`, `/refresh`, `/logout`, `GET /api/auth/me`
- `POST /api/enquiries` (public, now stored in Postgres, rate-limited)
- Admin APIs (platform admin only):
  - `GET /api/admin/overview`
  - `GET /api/admin/requests`, plus `POST …/:id/approve` and `POST …/:id/reject`
  - `GET /api/admin/users`, plus `POST …/:id/suspend` and `POST …/:id/reactivate`
  - `GET /api/admin/enquiries`, plus `PATCH …/:id` (status, notes) and `POST …/:id/invite`
  - `GET /api/admin/login-activity` (filters: result, email, date)
  - `GET /api/admin/audit`
- The `withTenant()` helper and RLS policies, plus a test that proves workspace A can't read workspace B.

**Admin panel (web, `/admin`, in the new navy/mint brand):**
- Overview: pending requests, new enquiries, failed logins in the last 24h, active workspaces.
- Account requests: approve, or reject with a reason.
- Users and workspaces: search, suspend, reactivate.
- Enquiries: change status, add notes, invite.
- Login activity: filter by failures, email or IP.
- Audit log.

**Web + Flutter auth screens:**
- **Web:** new Sign up and "Awaiting approval" pages. Login switches from Firebase to the new API.
- **Flutter:**
  - Sign-up screen, pending screen, and sign-in against the new API.
  - Tokens are kept in secure storage (adds `flutter_secure_storage`), and Google sign-in uses `google_sign_in`, verified by our server.

**Local infrastructure (`infra/`):**
```
docker compose up
 ├─ nginx      :80/:443 → app   (TLS dev cert, gzip, security headers, rate limit on /api/auth)
 ├─ app        Next.js (production build, standalone output)
 ├─ postgres   16-alpine, data in a named volume, healthcheck
 ├─ migrate    one-shot: runs Drizzle migrations + admin seed, then exits
 └─ adminer    (dev profile only, bound to 127.0.0.1) to browse the DB
```
- **Also:** `.env.example`, a nightly `pg_dump` backup script, `infra/README.md` (start, stop, reset, backup and restore), and the Flutter app pointed at the local API (`--dart-define=API_BASE=http://10.0.2.2` for the emulator).
- **Redis is not added yet,** because nothing needs it. It comes in with the broadcast queue.

## 5. Firebase after this
The app no longer depends on Firebase for sign-in. The Firebase CLI re-auth and `google-services.json` steps aren't needed for login. Firebase stays **only for push notifications**, which come later. Google sign-in instead needs **one Google Cloud OAuth client** (web + Android); the steps are in README.

## 6. Recommended database hosting: best and cheapest

Prices are approximate (late 2026); check them when you sign up.

| Stage | Recommendation | ≈ Cost | Why |
|---|---|---|---|
| **Now (dev)** | Docker on this PC | **Free** | Same stack as production |
| **Phase 1: selling per client** | **One small VPS running this exact `docker compose`** (Postgres inside), e.g. **DigitalOcean Bangalore** or **AWS Lightsail Mumbai** (2 vCPU / 2–4 GB). Several small clients can share one VPS (separate stacks or workspaces) | **₹500–1,000 / mo (~$6–12)** per VPS | Cheapest reliable option, India region (low latency), full control, identical to local. Nightly `pg_dump` to **Cloudflare R2** (10 GB free) for backups |
| **Phase 2: Play Store SaaS** | **Managed Postgres**: **Neon** (Singapore; serverless, autoscaling, branching, point-in-time restore) or **DigitalOcean Managed Postgres (Bangalore)** | Neon free tier to start, then ~$19+/mo; DO ~$15/mo | No database admin work, automatic backups and failover. The app only needs `DATABASE_URL` changed |
| Free but risky | Oracle Cloud Always-Free ARM VM (Mumbai/Hyderabad) | ₹0 | Generous specs, but account/capacity issues are common, so not for paying clients |

**My pick:** develop on Docker now. For your first clients, use **one DigitalOcean (Bangalore) or Lightsail (Mumbai) VPS at about $12/month** with this same compose stack and R2 backups. Move to **Neon** when you launch on the Play Store.

## 7. Milestones (each ends with a check-in and a commit)
| # | Delivers |
|---|---|
| B1 | `infra/` Docker stack (Postgres, nginx, app, migrate, adminer), Drizzle schema + migrations + RLS + admin seed, `docker compose up` works |
| B2 | Auth API (signup, login, Google, refresh, logout, me), login logging, lockout, enquiries in Postgres, **isolation test (A can't read B)** |
| B3 | Web: `/admin` panel (all pages above), sign-up + pending pages, login on the new API |
| B4 | Flutter: sign-up, pending, sign-in on the new API, secure token storage, Google sign-in |
| B5 | Move the existing features (WhatsApp, Meta, contacts, broadcasts) into tenant tables, so each workspace uses its own Meta/WhatsApp connection (separate plan) |

## 8. Decisions (2026-10-18)
| # | Decision |
|---|---|
| 1 | **Own sign-in** (email/password with argon2id, plus Google ID-token verification). Firebase is kept only for push notifications later |
| 2 | **Admin in both the web app (`/admin`) and the Flutter app**. The Flutter admin section is visible only to platform admins, and both call the same admin APIs |
| 3 | Platform admin seed defaults to **realhubbmktg@gmail.com** (`ADMIN_EMAIL` in `.env`). The password is generated on first run and printed once |
| 4 | Existing Realhubb data becomes **workspace #1** in step B5; new users start empty |

**Milestone B4 (Flutter) now also includes** the admin section: requests (approve/reject), users, enquiries and login activity.
