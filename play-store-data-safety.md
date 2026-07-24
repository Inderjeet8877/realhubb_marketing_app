# Play Console — Data Safety Form Answers

Reference for filling out Play Console → App content → Data safety. Answers reflect the actual
data flows in this codebase (see `setup.md` for the underlying implementation). Re-verify against
the live app before submitting — if the app changes, this form must be updated to match, since a
mismatch between declared and actual behavior is a common cause of Play rejections/suspensions.

## Does your app collect or share any of the required user data types?
**Yes.**

## Is all of the user data collected by your app encrypted in transit?
**Yes** — all network traffic uses HTTPS/TLS (Vercel, Firebase, Meta Graph API, Cloudinary all
enforce TLS).

## Do you provide a way for users to request that their data be deleted?
**Yes** — link to: `https://www.realhubb.co.in/data-deletion`

---

## Data types collected

### Personal info
| Type | Collected | Shared | Purpose | Optional? |
|---|---|---|---|---|
| Name | Yes | Yes (Meta/WhatsApp) | App functionality, account management | No |
| Email address | Yes | No | Account management (Firebase Auth) | No |
| Phone number | Yes | Yes (Meta/WhatsApp) | App functionality (contact/lead management, WhatsApp messaging) | No |

### Messages
| Type | Collected | Shared | Purpose | Optional? |
|---|---|---|---|---|
| Other in-app messages (WhatsApp message text) | Yes | Yes (Meta/WhatsApp) | App functionality | No |

*Note: this app does not read the device's native SMS/MMS or contacts — WhatsApp message content is
received via the Meta WhatsApp Business Platform webhook, and contacts are uploaded by the user as a
CSV/Excel file, not pulled from the device.*

### Photos or videos
| Type | Collected | Shared | Purpose | Optional? |
|---|---|---|---|---|
| Photos | Yes (template header images only) | Yes (Cloudinary) | App functionality | Yes |

### App activity
| Type | Collected | Shared | Purpose | Optional? |
|---|---|---|---|---|
| App interactions | Yes (which conversations/templates a user views) | No | Analytics, app functionality | No |

### App info and performance
| Type | Collected | Shared | Purpose | Optional? |
|---|---|---|---|---|
| Crash logs | Only if Firebase Crashlytics is later added — currently **not** integrated | — | — | — |

### Device or other IDs
| Type | Collected | Shared | Purpose | Optional? |
|---|---|---|---|---|
| Device or other IDs (FCM push token) | Yes | Yes (Google/Firebase, as the notification transport) | App functionality (push notifications) | No |

---

## Data NOT collected (safe to answer "No" for these categories)
- Financial info (no payment processing in-app)
- Health and fitness
- Location
- Web browsing history
- Search history
- Contacts (native device contacts permission is never requested — contacts are uploaded as files by the user)
- Calendar
- SMS/call logs (no SMS/telephony permissions used)
- Audio (no microphone access)

---

## Permissions this app requests (for reference, not part of the Data Safety form itself)
From `android/app/src/main/AndroidManifest.xml`:
- `INTERNET` — required for all network requests
- `POST_NOTIFICATIONS` — required (Android 13+) to display push notifications

Neither is a Play Console "restricted permission" requiring separate justification (those are
things like SMS, Call Log, or special access like Accessibility Service — this app requests none
of those).

---

## App access (Play Console → App content → App access)
This app requires sign-in for **all** functionality — there is no unauthenticated content to
review. Provide the reviewer with:
- A test account email/password (or Google account) that is on the server-side allow-list
- A note explaining: "Access is restricted to an internal allow-list; the provided credentials are
  pre-authorised for review purposes."

Without this, Google's reviewer cannot get past the login screen and the submission will be
rejected or delayed.
