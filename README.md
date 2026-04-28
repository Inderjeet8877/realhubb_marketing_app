# Realhubb Platform

Marketing automation platform for managing Meta Ads and WhatsApp campaigns.

## Tech Stack

- **Frontend:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS
- **Auth:** Firebase Auth (Google OAuth)
- **Database:** Firestore
- **Storage:** Firebase Storage
- **Charts:** Recharts

## Getting Started

### 1. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project
3. Enable Authentication:
   - Go to Authentication > Sign-in method
   - Enable "Google"
4. Enable Firestore Database:
   - Create database in test mode
5. Enable Storage:
   - Start in test mode
6. Get your Firebase config from Project Settings > General > Your apps

### 2. Meta Business Setup

1. Go to [Meta Developers](https://developers.facebook.com/)
2. Create a new app (type: Business)
3. Add "Facebook Login" and "Marketing API" products
4. Get App ID and App Secret
5. Configure OAuth redirect URI: `http://localhost:3001/api/meta/callback`

### 3. Environment Setup

Update `.env.local` with your credentials:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

NEXT_PUBLIC_APP_URL=http://localhost:3001

META_APP_ID=your_meta_app_id
META_APP_SECRET=your_meta_app_secret
META_ACCESS_TOKEN=your_meta_access_token
```

### 4. Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3001](http://localhost:3001)

## Project Structure

```
realhubb-platform/
├── src/
│   ├── app/
│   │   ├── dashboard/          # Dashboard pages
│   │   │   ├── campaigns/
│   │   │   ├── contacts/
│   │   │   ├── whatsapp/
│   │   │   └── settings/
│   │   ├── api/               # API routes
│   │   │   ├── meta/
│   │   │   │   ├── connect/
│   │   │   │   ├── callback/
│   │   │   │   ├── accounts/
│   │   │   │   └── campaigns/
│   │   ├── login/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   ├── lib/
│   │   ├── firebase.ts
│   │   └── meta-api.ts
│   └── types/
├── .env.local
├── package.json
└── tsconfig.json
```

## Features Progress

### Week 1-2: Auth & Dashboard ✅
- [x] Google OAuth login
- [x] Dashboard layout
- [x] Dashboard pages (Overview, Campaigns, Contacts, WhatsApp, Settings)

### Week 3-4: Meta Ads Integration ✅
- [x] Meta OAuth flow (connect/disconnect)
- [x] List connected ad accounts
- [x] Campaigns page with metrics
- [x] Campaign creation modal
- [ ] Analytics dashboard with charts
- [ ] Real Meta API integration

### Week 5: Contacts Module (Planned)
- [ ] CSV import
- [ ] Contact list view
- [ ] Tag management

### Week 6-7: WhatsApp Integration (Planned)
- [ ] WhatsApp Cloud API setup
- [ ] Template management
- [ ] Bulk message sending
- [ ] Cloud Functions for background jobs

### Week 8: Polish (Planned)
- [ ] Real-time delivery tracking
- [ ] Webhook handlers
- [ ] Error handling
- [ ] Mobile responsive

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/meta/connect` | GET | Initiate Meta OAuth flow |
| `/api/meta/callback` | GET | OAuth callback handler |
| `/api/meta/accounts` | GET | Fetch ad accounts |
| `/api/meta/campaigns` | GET | Fetch campaigns with insights |

## Deploy to Vercel

1. Push to GitHub
2. Import project in Vercel
3. Add all environment variables
4. Deploy

## License

MIT
something