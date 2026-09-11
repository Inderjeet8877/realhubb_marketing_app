import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { normalizePhone, isValidPhoneNumber } from '@/lib/whatsapp-send';
import { getPingSmartConfigStatus, sendRcsMessage } from '@/lib/rcs';

// Sends run sequentially in this one request (see MAX_RECIPIENTS_PER_REQUEST
// below) — give it real headroom rather than a platform default that could
// kill the function mid-batch.
export const maxDuration = 60;

// No chunked/resumable worker exists for this channel yet (unlike WhatsApp
// broadcasts, which use a self-triggering background job for exactly this
// reason) — this runs as one serverless invocation, so a conservative cap
// here keeps a large accidental bulk send from silently partial-failing on a
// function timeout instead of a clear, immediate rejection. At ~1-1.5s per
// recipient (network round-trip + the pacing delay below), 40 comfortably
// fits inside the 60s budget above.
const MAX_RECIPIENTS_PER_REQUEST = 40;
// A courteous, conservative pace against a freshly-integrated, unverified
// gateway — not derived from any documented Ping Smart rate limit (none was
// given), so this is deliberately cautious rather than tuned for throughput.
const DELAY_BETWEEN_SENDS_MS = 200;

interface SendContact { name: string; phone: string }

export async function POST(request: NextRequest) {
  const status = getPingSmartConfigStatus();
  if (!status.configured) {
    return NextResponse.json(
      { success: false, error: `RCS isn't configured yet — missing: ${status.missing.join(', ')}` },
      { status: 400 }
    );
  }

  let body: { contacts?: SendContact[]; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { contacts, message } = body;
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return NextResponse.json({ success: false, error: 'contacts must be a non-empty array' }, { status: 400 });
  }
  if (!message || !message.trim()) {
    return NextResponse.json({ success: false, error: 'message is required' }, { status: 400 });
  }
  if (contacts.length > MAX_RECIPIENTS_PER_REQUEST) {
    return NextResponse.json(
      { success: false, error: `Too many recipients in one request (max ${MAX_RECIPIENTS_PER_REQUEST}). Send in smaller batches.` },
      { status: 400 }
    );
  }

  const results: { name: string; phone: string; success: boolean; error?: string }[] = [];
  let sent = 0, failed = 0;

  for (const contact of contacts) {
    const rawPhone = (contact.phone || '').toString();
    const name = (contact.name || rawPhone).toString();

    if (!isValidPhoneNumber(rawPhone)) {
      failed++;
      results.push({ name, phone: rawPhone, success: false, error: 'Invalid phone number' });
      continue;
    }
    const phone = normalizePhone(rawPhone);

    try {
      const result = await sendRcsMessage(phone, message);
      if (result.success) sent++; else failed++;

      await adminDb.collection('rcs_messages').add({
        name,
        phone,
        message,
        success: result.success,
        errorCode: result.errorCode,
        errorDesc: result.errorDesc,
        providerMessageId: result.messageId,
        rawResponse: result.rawResponse,
        createdAt: FieldValue.serverTimestamp(),
      });

      results.push({ name, phone, success: result.success, error: result.success ? undefined : (result.errorDesc || 'Unknown error') });
    } catch (err: any) {
      failed++;
      const errorMessage = err.message || 'Failed to reach Ping Smart';
      await adminDb.collection('rcs_messages').add({
        name,
        phone,
        message,
        success: false,
        errorCode: null,
        errorDesc: errorMessage,
        providerMessageId: null,
        rawResponse: null,
        createdAt: FieldValue.serverTimestamp(),
      });
      results.push({ name, phone, success: false, error: errorMessage });
    }

    if (contacts.length > 1) {
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_SENDS_MS));
    }
  }

  return NextResponse.json({ success: true, sent, failed, results });
}
