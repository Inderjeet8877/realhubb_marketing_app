import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { adminDb } from '@/lib/firebase-admin';
import { requireTeamAdmin } from '@/lib/require-admin';
import { loadTeam, invalidateTeamCache, normEmail, SUPER_ADMIN } from '@/lib/team';

// Team management, admin only (middleware checks the login, requireTeamAdmin
// the role). Adding someone creates their Firebase login with a random
// password and an invite link to set their own; removing someone turns off
// their login and signs them out everywhere.

const auth = () => getAuth();
const users = () => adminDb.collection('app_users');
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || 'https://www.realhubb.co.in').replace(/\/$/, '');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// Firebase's own "reset your password" email (from noreply@<project>.firebaseapp.com).
// Works with no domain setup; wording is editable in Firebase → Authentication → Templates.
async function sendFirebaseEmail(email: string): Promise<boolean> {
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
    });
    if (!res.ok) console.error('[admin/users] Firebase invite email failed', res.status);
    return res.ok;
  } catch (err) {
    console.error('[admin/users] Firebase invite email failed', err);
    return false;
  }
}

// Branded email through Resend only when a verified sender is configured
// (Resend's test sender only reaches the Resend account owner); otherwise Firebase's.
async function sendInvite(email: string, name: string, link: string, invitedBy: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !process.env.RESEND_FROM_EMAIL) return sendFirebaseEmail(email);
  try {
    const { Resend } = await import('resend');
    const result = await new Resend(apiKey).emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: email,
      subject: 'You have been invited to Realhubb',
      html: `<p>Hi ${esc(name || 'there')},</p>
<p>${esc(invitedBy)} has given you access to the Realhubb marketing app.</p>
<p><a href="${esc(link)}">Set your password</a>, then sign in at <a href="${appUrl()}/auth/login">${appUrl()}/auth/login</a> (web) or in the Realhubb Android app.</p>
<p>This link works once and expires after a while. If it has expired, ask the admin to send a new invite.</p>`,
    });
    if (!result.error) return true;
    console.error('[admin/users] Resend invite failed', result.error);
  } catch (err) {
    console.error('[admin/users] Resend invite failed', err);
  }
  return sendFirebaseEmail(email);
}

// The "continue" button back to our login page needs the app's domain in
// Firebase Auth → Settings → Authorized domains. Without it, fall back to a
// plain link: it still sets the password, just without the button.
async function inviteLink(email: string) {
  try {
    return await auth().generatePasswordResetLink(email, { url: `${appUrl()}/auth/login` });
  } catch (err: any) {
    if (err?.code !== 'auth/unauthorized-continue-uri') throw err;
    return auth().generatePasswordResetLink(email);
  }
}

// GET → every team member with their login status.
export async function GET(request: NextRequest) {
  const admin = await requireTeamAdmin(request);
  if (admin instanceof NextResponse) return admin;

  invalidateTeamCache();
  const team = [...(await loadTeam()).values()];
  const records = new Map<string, { lastSignIn: string | null; disabled: boolean }>();
  for (let i = 0; i < team.length; i += 100) {
    const { users: found } = await auth().getUsers(team.slice(i, i + 100).map((m) => ({ email: m.email })));
    for (const u of found) records.set(normEmail(u.email || ''), { lastSignIn: u.metadata.lastSignInTime || null, disabled: u.disabled });
  }
  return NextResponse.json({
    success: true,
    users: team
      .map((m) => ({
        ...m,
        isOwner: m.email === SUPER_ADMIN,
        hasLogin: records.has(m.email),
        lastSignIn: records.get(m.email)?.lastSignIn ?? null,
      }))
      .sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || a.email.localeCompare(b.email)),
  });
}

// POST { email, name } → add (or re-activate) a member and invite them.
// POST { email, action: 'resend' } → new invite link for an existing member.
export async function POST(request: NextRequest) {
  const admin = await requireTeamAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = await request.json().catch(() => ({}));
  const email = normEmail(String(body.email || ''));
  const name = String(body.name || '').trim().slice(0, 80);
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });

  if (body.action === 'resend') {
    const doc = await users().doc(email).get();
    if (!doc.exists || doc.data()!.active === false) return NextResponse.json({ error: 'That person is not an active member.' }, { status: 404 });
    const link = await inviteLink(email);
    const emailed = await sendInvite(email, doc.data()!.name || '', link, admin.email);
    return NextResponse.json({ success: true, inviteLink: link, emailed });
  }

  // Create their login if they don't have one; turn it back on if it was off.
  let createdLogin = false;
  try {
    const existing = await auth().getUserByEmail(email);
    if (existing.disabled) await auth().updateUser(existing.uid, { disabled: false });
  } catch (err: any) {
    if (err?.code !== 'auth/user-not-found') throw err;
    await auth().createUser({ email, password: randomBytes(24).toString('base64url'), displayName: name || undefined, emailVerified: false });
    createdLogin = true;
  }

  await users().doc(email).set({
    email, name, role: email === SUPER_ADMIN ? 'admin' : 'member', active: true,
    addedBy: admin.email, addedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  invalidateTeamCache();

  const link = await inviteLink(email);
  const emailed = await sendInvite(email, name, link, admin.email);
  return NextResponse.json({ success: true, createdLogin, inviteLink: link, emailed });
}

// PATCH { email, active } → pause or restore someone's access.
export async function PATCH(request: NextRequest) {
  const admin = await requireTeamAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const body = await request.json().catch(() => ({}));
  const email = normEmail(String(body.email || ''));
  if (email === SUPER_ADMIN) return NextResponse.json({ error: 'The owner account cannot be changed.' }, { status: 400 });
  if (typeof body.active !== 'boolean') return NextResponse.json({ error: 'active must be true or false' }, { status: 400 });
  const ref = users().doc(email);
  if (!(await ref.get()).exists) return NextResponse.json({ error: 'Not a team member.' }, { status: 404 });

  await ref.update({ active: body.active, updatedBy: admin.email, updatedAt: FieldValue.serverTimestamp() });
  await setLogin(email, body.active);
  invalidateTeamCache();
  return NextResponse.json({ success: true });
}

// DELETE { email } → remove from the team and turn off their login.
export async function DELETE(request: NextRequest) {
  const admin = await requireTeamAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const body = await request.json().catch(() => ({}));
  const email = normEmail(String(body.email || ''));
  if (email === SUPER_ADMIN) return NextResponse.json({ error: 'The owner account cannot be removed.' }, { status: 400 });

  await users().doc(email).delete();
  await setLogin(email, false);
  invalidateTeamCache();
  return NextResponse.json({ success: true });
}

// Turns a login on/off. Turning off also revokes their sessions, so the web
// and Android apps sign them out at the next token refresh.
async function setLogin(email: string, enabled: boolean) {
  try {
    const u = await auth().getUserByEmail(email);
    await auth().updateUser(u.uid, { disabled: !enabled });
    if (!enabled) await auth().revokeRefreshTokens(u.uid);
  } catch (err: any) {
    if (err?.code !== 'auth/user-not-found') throw err;
  }
}
