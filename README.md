# Realhubb Marketing

The internal marketing tool at RealHubb. The team uses it to see Meta ad campaigns and the leads they bring in, and to message those leads on WhatsApp, one at a time or as a broadcast. It runs as a web app and as an Android app built from the same code.

## What is in it

- **Campaigns.** Connect a Meta ad account over OAuth and see its campaigns with their numbers.
- **Leads and enquiries.** Leads from Meta lead forms and enquiries from the website are listed in the dashboard.
- **Contacts.** The address book that broadcasts are sent to.
- **WhatsApp.** Send and receive messages through the WhatsApp Cloud API, manage message templates, and run broadcasts that can be cancelled and resumed part-way. Each broadcast has an engagement report that exports to PDF.
- **WhatsApp insights.** Charts for delivery and engagement.
- **RCS.** Send RCS messages and list them.
- **Push notifications** to the Android app.

## How it is put together

Next.js 15 (App Router) with TypeScript and Tailwind CSS. Sign-in is Firebase Auth with Google or email and password. Data lives in Firestore, and the API routes write to it through `firebase-admin`.

Everything that talks to Meta is in `src/app/api`:

| Route group | What it does |
| :--- | :--- |
| `/api/meta/*` | OAuth connect, callback and disconnect, ad account selection, campaigns, lead forms and leads |
| `/api/whatsapp/*` | send, messages, templates, broadcasts (start, process, cancel, resume, engagement report), insights, webhook |
| `/api/rcs/*` | send and list RCS messages |
| `/api/contacts`, `/api/enquiries` | contacts and website enquiries |
| `/api/notifications/register` | stores a device push token |
| `/api/upload` | media uploads |

When a broadcast is processed, the route stores each WhatsApp message id against the broadcast and the phone number it went to. That index is what lets a later status update be matched back to the right broadcast and contact.

The Android app is the same site wrapped with Capacitor (`com.realhubb.marketing`), in the `android/` folder. `baileys-receiver.js` is a separate Node script that links a WhatsApp number by QR code using Baileys and talks to Firestore with a service account. It is not part of the Next.js app.

## Running it

You need a Firebase project (Auth, Firestore, Storage) and a Meta app with the Marketing API and WhatsApp products.

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Fill in `.env.local`:

| Variable | For |
| :--- | :--- |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase web config |
| `META_APP_ID`, `META_APP_SECRET` | Meta OAuth |
| `META_ACCESS_TOKEN_1` | Meta API access token |
| `WHATSAPP_PHONE_NUMBER_ID_1`, `WHATSAPP_BUSINESS_ACCOUNT_ID_1` | the WhatsApp sender |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | the webhook verification handshake |
| `NEXT_PUBLIC_APP_URL` | base URL of the app |
| `INTERNAL_API_SECRET` | calls between the API routes |

Meta has to be able to reach the webhook, so local work on inbound messages needs a tunnel or a deployed preview. `firestore.rules` holds the security rules to deploy.
