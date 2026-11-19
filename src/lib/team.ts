import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';

// Who may use the app (web + Android). One doc per person in `app_users`,
// keyed by lower-case email, managed from /dashboard/admin by the admin.
// Firestore rules read the same docs, so the API and the database agree.

export type Role = 'admin' | 'member';
export interface TeamMember {
  email: string;
  name: string;
  role: Role;
  active: boolean;
  addedBy?: string;
}

// The owner. Always allowed and always admin, even if their doc is edited
// or deleted, so the app can never lock everyone out.
export const SUPER_ADMIN = 'inderjeet.kumar8184@gmail.com';

// Accounts that had access before the admin page existed; seeded once
// into an empty `app_users` so nobody loses access on the switch-over.
const LEGACY_MEMBERS = ['realhubbventures@gmail.com'];

const COLLECTION = 'app_users';
const CACHE_MS = 30_000;
let cache: { at: number; members: Map<string, TeamMember> } | null = null;

export const normEmail = (e: string) => e.trim().toLowerCase();

async function seedIfEmpty() {
  const batch = adminDb.batch();
  const now = FieldValue.serverTimestamp();
  batch.set(adminDb.collection(COLLECTION).doc(SUPER_ADMIN), { email: SUPER_ADMIN, name: 'Inderjeet Kumar', role: 'admin', active: true, addedBy: 'system', addedAt: now });
  for (const email of LEGACY_MEMBERS) {
    batch.set(adminDb.collection(COLLECTION).doc(email), { email, name: '', role: 'member', active: true, addedBy: 'system', addedAt: now });
  }
  await batch.commit();
}

export async function loadTeam(): Promise<Map<string, TeamMember>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.members;
  let snap = await adminDb.collection(COLLECTION).get();
  if (snap.empty) {
    await seedIfEmpty();
    snap = await adminDb.collection(COLLECTION).get();
  }
  const members = new Map<string, TeamMember>();
  for (const d of snap.docs) {
    const m = d.data() as TeamMember;
    members.set(d.id, { email: d.id, name: m.name || '', role: m.role === 'admin' ? 'admin' : 'member', active: m.active !== false, addedBy: m.addedBy });
  }
  cache = { at: Date.now(), members };
  return members;
}

// Per-email role memo for the request path (middleware runs in its own
// bundle, so it keeps its own copy). Only *allowed* answers are cached:
// someone just added is let in on their very next request, while someone
// paused/removed loses access within ROLE_MEMO_MS (their sessions are also
// revoked). ponytail: per-instance memo, up to 15 s staleness on removal.
const ROLE_MEMO_MS = 15_000;
const roleMemo = new Map<string, { at: number; role: Role }>();
let seedChecked = false;

export function invalidateTeamCache() {
  cache = null;
  roleMemo.clear();
}

// The caller's role, or null when they may not use the app.
export async function roleOf(email: string): Promise<Role | null> {
  const e = normEmail(email);
  if (e === SUPER_ADMIN) return 'admin';
  const hit = roleMemo.get(e);
  if (hit && Date.now() - hit.at < ROLE_MEMO_MS) return hit.role;

  let doc = await adminDb.collection(COLLECTION).doc(e).get();
  if (!doc.exists && !seedChecked) {
    seedChecked = true;
    const any = await adminDb.collection(COLLECTION).limit(1).get();
    if (any.empty) {
      await seedIfEmpty();
      doc = await adminDb.collection(COLLECTION).doc(e).get();
    }
  }
  const m = doc.exists ? (doc.data() as TeamMember) : null;
  const role: Role | null = m && m.active !== false ? (m.role === 'admin' ? 'admin' : 'member') : null;
  if (role) roleMemo.set(e, { at: Date.now(), role });
  else roleMemo.delete(e);
  if (roleMemo.size > 1000) roleMemo.clear();
  return role;
}
