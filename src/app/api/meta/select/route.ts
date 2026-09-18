import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/require-admin';

type Slot = '1' | '2' | '3';

interface SlotAssignment {
  adAccountId?: string;
  wabaId?: string;
  phoneNumberId?: string;
  label?: string;
}

interface SelectBody {
  pendingId: string;
  assignments: Partial<Record<Slot, SlotAssignment>>;
}

// Finishes the login: reads the discovery bundle (including the access
// token) straight from Firestore by pendingId — the token never passed
// through the browser to get here — and writes it into meta_credentials/
// {slot} for each assigned slot, then deletes the pending doc.
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  let body: SelectBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { pendingId, assignments } = body;
  if (!pendingId || !assignments || Object.keys(assignments).length === 0) {
    return NextResponse.json({ error: 'pendingId and at least one slot assignment are required' }, { status: 400 });
  }

  const pendingRef = adminDb.collection('meta_oauth_pending').doc(pendingId);
  const snap = await pendingRef.get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'This login has expired or was already used — connect again.' }, { status: 404 });
  }

  const pending = snap.data()!;
  const expiresAt: Date = pending.expiresAt?.toDate?.() || new Date(pending.expiresAt);
  if (expiresAt.getTime() < Date.now()) {
    await pendingRef.delete();
    return NextResponse.json({ error: 'This login has expired — connect again.' }, { status: 410 });
  }
  if (pending.connectedByEmail && pending.connectedByEmail !== admin.email) {
    return NextResponse.json({ error: 'This login was started by a different account.' }, { status: 403 });
  }

  const adAccountsById = new Map((pending.adAccounts || []).map((a: any) => [a.id, a]));
  const wabaPhonesById = new Map<string, { wabaId: string; displayPhoneNumber: string }>();
  for (const w of pending.wabas || []) {
    for (const p of w.phoneNumbers || []) {
      wabaPhonesById.set(p.id, { wabaId: w.id, displayPhoneNumber: p.displayPhoneNumber });
    }
  }

  const written: Slot[] = [];
  const batch = adminDb.batch();

  for (const slot of ['1', '2', '3'] as Slot[]) {
    const assignment = assignments[slot];
    if (!assignment) continue;

    const adAccount = assignment.adAccountId ? adAccountsById.get(assignment.adAccountId) : null;
    const phone = assignment.phoneNumberId ? wabaPhonesById.get(assignment.phoneNumberId) : null;

    const docRef = adminDb.collection('meta_credentials').doc(slot);
    batch.set(docRef, {
      accessToken: pending.accessToken,
      adAccountId: assignment.adAccountId || null,
      wabaId: phone?.wabaId || assignment.wabaId || null,
      phoneNumberId: assignment.phoneNumberId || null,
      label: assignment.label || (adAccount as any)?.name || phone?.displayPhoneNumber || `Account ${slot}`,
      connectedAt: new Date(),
      expiresAt,
      connectedByEmail: admin.email,
    }, { merge: true });
    written.push(slot);
  }

  if (written.length === 0) {
    return NextResponse.json({ error: 'No valid slot assignments provided' }, { status: 400 });
  }

  await batch.commit();
  await pendingRef.delete();

  return NextResponse.json({ success: true, slotsConnected: written });
}
