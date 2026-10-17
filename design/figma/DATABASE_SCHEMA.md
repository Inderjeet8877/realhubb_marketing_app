# Realhubb data model: current state and FigJam plan

This comes from tracing every Firestore read and write in `src/` and `baileys-receiver.js`. It is the source for the FigJam diagram in **"Realhubb: Data Model"**.

---

## ⚠️ Fix first: security problems (separate from the redesign)

These problems need fixing whatever happens with the design.

| # | Problem | Risk |
|---|---|---|
| S1 | `firestore.rules` has `allow read, write: if true` on **`whatsapp_conversations`**, `whatsapp_templates` and `webhook_logs` | Anyone with the public Firebase config (it ships in the app) can **read every customer's phone number, name and message**, or insert fake messages |
| S2 | Most API routes have **no auth check**: `GET /api/enquiries`, `/api/whatsapp/messages`, `GET /api/notifications/register`, broadcast start and cancel | Anyone who knows the URL can read leads or start and cancel broadcasts |
| S3 | Meta access tokens are stored **in plain text** in `meta_credentials` and `meta_oauth_pending` | A database leak gives full access to the ad accounts |
| S4 | `firestore.rules` describes collections the code doesn't use (`users`, `contacts`, `campaigns`, `messageLogs`) and has **no rule** for 8 collections it does use | The live listeners on `bulk_reports` in BulkReports and the WhatsApp page should be denied by these rules. Check whether the deployed rules match this file |

Fixing these is a separate code task, not a Figma task, and I'll plan it when you're ready. I recommend doing it **before** the new repo is created.

---

## 1. Collections today

There is no user ownership anywhere. The app is single-tenant, and up to 3 Meta account slots share one database. **Contacts are not in Firestore**: they live in a Google Sheet behind an Apps Script web app.

### 1.1 `whatsapp_conversations/{autoId}`: one doc **per message**
It's named "conversations", but each doc is a single message. The inbox groups messages by `phone` in code and loads the newest 3,000 docs on every listener attach.

| Field | Type | Notes |
|---|---|---|
| phone | string | digits only, `91XXXXXXXXXX` |
| name | string | the phone number for outbound messages |
| message | string | |
| direction | `inbound` \| `outbound` | |
| status | `sent` \| `delivered` \| `read` \| `failed` | outbound only |
| wamid | string? | WhatsApp message ID |
| templateName | string? | |
| unreadCount | 0 \| 1 | inbound only |
| msgType | string | inbound only |
| lastMessage, lastMessageAt | string, timestamp | copied onto every message |
| createdAt | timestamp | |
| isTest / isSimulated / source | flags | test data mixed into production |

### 1.2 `bulk_reports/{broadcastId}`: one broadcast job
| Field | Type |
|---|---|
| broadcastId | string (same as the doc ID) |
| batchName, templateName | string |
| status | `processing` \| `completed` \| `cancelled` \| `failed` |
| total, sent, failed, delivered, read, optedOutCount | number |
| cursor, totalChunks, chunkSize (40) | number |
| cancelRequested, cancelReason, cancelRequestedAt | bool, string, timestamp |
| finishedAt, errorMessage, createdAt | |
| sendConfig | map: message, templateContent, **accountId** ('1'–'3'), imageUrl, caption, templateName, languageCode, templateHeaderType, templateHeaderContent, isTemplate |
| contacts[] | **legacy** inline array; can hit the 1 MiB doc limit |

Subcollections:

| Path | Doc ID | Fields | Notes |
|---|---|---|---|
| `bulk_reports/{id}/targets/{chunk}` | chunk number | `contacts[]`: up to 40 `{phone, name}` | Never deleted |
| `bulk_reports/{id}/results/{chunk}` | chunk number (matches its `targets` doc) | `contacts[]`: `{phone, name, success, wamid, status, error, errorCode, errorSubcode, errorDetail}` | |
| `bulk_reports/{id}/recipients/{wamid}` | wamid | `{status, updatedAt}` | Live status written by the webhook |

### 1.3 Other collections
| Collection | Doc ID | Fields | Written by → read by |
|---|---|---|---|
| `wamid_index` | wamid | broadcastId, phone | broadcasts/process → webhook. Never cleaned up |
| `whatsapp_templates` | auto ID **or** Meta template ID (two schemes) | name, language, category, content, footerContent, headerType, headerContent, buttons[], approvalStatus, qualityScore, rejectedReason, metaTemplateId, metaError, createdAt, updatedAt. **No account field** | templates API ↔ templates page, send |
| `whatsapp_opt_outs` | phone | phone, name, triggerMessage, optedOutAt | webhook → broadcast start (full scan) |
| `meta_credentials` | slot '1' \| '2' \| '3' | accessToken (plain text), adAccountId, wabaId, phoneNumberId, label, connectedAt, expiresAt, connectedByEmail | meta/select → every Meta API call |
| `meta_oauth_pending` | UUID | accessToken, expiresAt, adAccounts[], wabas[] with phoneNumbers[], connectedBy* | meta/callback → meta/select (then deleted; abandoned ones stay forever) |
| `enquiries` | auto ID | name, email, phone, company, message, status (always 'new'), createdAt | landing form → Enquiries page |
| `rcs_messages` | auto ID | name, phone, message, success, errorCode, errorDesc, providerMessageId, rawResponse, createdAt | rcs/send → rcs/messages |
| `fcm_tokens` | the token itself | token, platform, model, manufacturer, osVersion, userAgent, label, registeredAt, updatedAt. **No user link** | notifications/register → push sender (full scan) |
| `webhook_logs` | — | receivedAt, object, hasMessages, hasStatuses | **nothing writes it**. Orphaned |
| *Google Sheet: Contacts* | id | name, phone (`+91…` format), email, tags[], dataName (batch), addedAt; plus a "failed data" sheet | contacts API ↔ Contacts page |

### 1.4 Relationships
None of these is enforced. They're all matching values.

```
meta_oauth_pending ──copy & delete──▶ meta_credentials {slot}
                                          ▲
bulk_reports.sendConfig.accountId ────────┘
bulk_reports 1──N targets {chunk} 1──1 results {chunk}
bulk_reports 1──N recipients {wamid}
wamid_index {wamid} N──1 bulk_reports (broadcastId)
wamid  =  wamid_index.id = recipients.id = results.contacts[].wamid = whatsapp_conversations.wamid
phone  =  whatsapp_conversations.phone = whatsapp_opt_outs.id ≈ Sheet contact.phone (different format!)
templateName  →  whatsapp_templates.name   (not unique across language/account)
```

---

## 2. FigJam diagram plan

**File:** "Realhubb: Data Model" (FigJam)

| Section | Contents |
|---|---|
| **A. Current model** | One entity card per collection (table-style: field, type, key icon). Subcollections nested inside their parent. Google Sheet drawn as an external store (different shape and colour). Lines labelled with the matching field (`wamid`, `phone`, `broadcastId`, `accountId`) |
| **B. Data flows** | Swimlanes: Meta webhook → API routes → Firestore → UI pages. Main flows: inbound message, broadcast send (start → process chunks → webhook status), Meta connect (callback → pending → select → credentials), push notification |
| **C. Problems** | Sticky notes pinned to entities: 🔴 security (S1–S4), 🟠 scaling (3,000-doc inbox read, full scans, never-cleaned collections), 🟡 consistency (phone formats, two template ID schemes, test data in production) |
| **D. Target Postgres model** | The tables from §3.1 drawn as an ERD (crow's-foot lines, PK and FK markers, `tenant_id` highlighted), side by side with A, plus a box showing Docker (Postgres, Redis) ↔ Next.js API ↔ web and Flutter |

Colour key:
- Blue = core entity
- Mint = subcollection
- Slate = external store
- Red outline = has a security problem
- Dashed = orphaned or legacy

---

## 3. Decision: PostgreSQL + Redis, multi-tenant from the start (decided 2026-10-17)

**Stack:** PostgreSQL 16 and Redis 7 run in Docker. The Next.js API is the only thing that touches the database; the web app and the Flutter app both go through it. ORM: Drizzle. Broadcast queue: BullMQ on Redis. Live inbox: Postgres `LISTEN/NOTIFY` → Server-Sent Events or WebSocket. Push: FCM (Firebase is used for push only).

**Why:**
- It is one free, open-source engine. It works for a single client's Docker install (phase 1) and for a managed multi-tenant SaaS (phase 2: Neon, AWS RDS or Cloud SQL).
- **Every table carries `tenant_id` from the first day.** In phase 1 each install has one tenant. In phase 2, row-level security separates tenants with no schema change.
- The data is relational (contacts → broadcasts → recipients → statuses). Joins and real counts replace `wamid_index`, chunk docs and full collection scans.

**Phase 1 hosting:** not decided yet. Either we host one stack per client, or the client runs it on their own server. One `docker-compose.yml` must work for both, with all configuration through `.env` and nothing hard-coded to our servers.

### 3.1 Draft tables (replaces Firestore and the Google Sheet)

Every table has `id uuid pk`, `tenant_id uuid` (except `tenants`), `created_at` and `updated_at`.

| Table | Key columns | Replaces |
|---|---|---|
| **tenants** | name, plan, status | (new) |
| **users** | email unique, name, password_hash / google_id | Firebase Auth allow-list |
| **memberships** | tenant_id, user_id, role (`owner` \| `admin` \| `agent`) | (new) |
| **devices** | user_id, fcm_token unique, platform, model, os_version, last_seen_at | `fcm_tokens` (now linked to a user) |
| **channel_accounts** | label, ad_account_id, waba_id, phone_number_id, access_token_enc (**encrypted**), expires_at | `meta_credentials` (removes the 3-slot limit) |
| **contacts** | phone_e164, name, email, tags text[], opted_out_at, opt_out_reason · **unique (tenant_id, phone_e164)** | Google Sheet, `whatsapp_opt_outs` |
| **batches** · **batch_members** | name · (batch_id, contact_id) | Sheet `dataName` |
| **conversations** | account_id, contact_id, last_message_at, last_preview, unread_count · unique (account_id, contact_id) | grouping 3,000 docs in code |
| **messages** | conversation_id, channel (`whatsapp` \| `rcs`), direction, type, body, template_id, wamid **unique**, status, error jsonb, raw jsonb | `whatsapp_conversations`, `rcs_messages` |
| **templates** | account_id, name, language, category, status, quality, components jsonb, meta_template_id, header_media_url · unique (account_id, name, language) | `whatsapp_templates` (one ID scheme) |
| **broadcasts** | account_id, template_id, batch_id, status, total, sent, delivered, read, failed, opted_out, cancel_reason, config jsonb, started_at, finished_at | `bulk_reports` |
| **broadcast_recipients** | broadcast_id, contact_id, phone_e164, status, wamid unique, error jsonb | `targets`, `results`, `recipients`, `wamid_index` |
| **enquiries** | name, email, phone, company, message, status (`new` \| `contacted` \| `closed`) | `enquiries` |
| **audit_log** | user_id, action, entity, entity_id, meta jsonb | (new; needed for selling to businesses) |

Short-lived data goes to **Redis with a TTL** instead of tables: the Meta OAuth pending login (1 day) and rate-limit counters. `webhook_logs` is dropped.

**Indexes to start with:** `messages (conversation_id, created_at desc)`, `conversations (tenant_id, last_message_at desc)`, `broadcast_recipients (broadcast_id, status)`, trigram index on `contacts (name, phone_e164)` for search.

**Leads and campaigns** stay live from the Meta API, as they are today. Saving a lead creates a `contacts` row.

### 3.2 What this fixes
- **S1–S4:** no public database access at all. The API checks auth and tenant on every call, and tokens are encrypted.
- **Inbox:** reads about 50 conversation rows instead of 3,000 messages, and unread counts are exact.
- **Accounts:** every message, template and broadcast carries an account, so the account switcher filters correctly.
- **Phone numbers:** stored in one format (E.164) and deduplicated by a unique constraint.

The migration itself (Firestore + Sheet → Postgres) is a separate code task. It will get its own plan after the Figma sign-off.
