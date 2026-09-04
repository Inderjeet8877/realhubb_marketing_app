// Builds the "who replied / who didn't / who said stop" breakdown for the
// Reports tab's PDF export — a deliberate, user-triggered, one-shot lookup
// (not polled, not automatic on page load), matching the same accepted
// tradeoff /api/whatsapp/insights/engagement already makes for its own
// full-collection scan. Deduplicates by normalized phone across every
// broadcast included in the report's current scope, so a contact targeted
// by more than one broadcast is classified exactly once.
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { normalizePhone, getBroadcastContacts } from '../_shared';

export interface EngagementContact {
  phone: string;
  name: string;
  message?: string;
  date?: string | null;
}

// Sanity cap on how many broadcasts one request will resolve — this is a
// user-triggered click, not something that needs to scale unbounded; a
// report spanning more than this many individual broadcasts is already an
// unusual case worth capping rather than risking a very slow request.
const MAX_BROADCASTS = 200;

export async function POST(request: NextRequest) {
  try {
    const { broadcastIds } = await request.json();
    if (!Array.isArray(broadcastIds) || broadcastIds.length === 0) {
      return NextResponse.json({ success: false, error: 'broadcastIds is required' }, { status: 400 });
    }
    const ids: string[] = broadcastIds.slice(0, MAX_BROADCASTS);

    // Independent reads per broadcast — no reason to serialize them.
    const perBroadcast = await Promise.all(ids.map((id) => getBroadcastContacts(id)));

    const targetsByPhone = new Map<string, string>(); // normalized phone -> best-known name
    for (const result of perBroadcast) {
      if (!result) continue;
      for (const c of result.contacts) {
        if (!c.phone) continue;
        const phone = normalizePhone(c.phone);
        const existingName = targetsByPhone.get(phone);
        // Prefer a real name over a phone-as-name fallback if one shows up later.
        if (!existingName || existingName === phone) {
          targetsByPhone.set(phone, c.name || phone);
        }
      }
    }

    if (targetsByPhone.size === 0) {
      return NextResponse.json({ success: true, replied: [], noReply: [], optedOut: [] });
    }

    // Same collection this app already trusts to enforce opt-outs at
    // send time (filterOptedOutPhones in ../_shared.ts) — treated as the
    // authoritative "opted out" list here too, rather than re-deriving a
    // second definition by re-scanning message text for stop phrases.
    const optOutsSnap = await adminDb.collection('whatsapp_opt_outs').get();
    const optOutsByPhone = new Map<string, { message: string; date: string | null }>();
    optOutsSnap.forEach((doc) => {
      const d = doc.data();
      optOutsByPhone.set(doc.id, {
        message: d.triggerMessage || '(no message recorded)',
        date: d.optedOutAt?.toDate?.()?.toISOString() || null,
      });
    });

    // Deliberately a single equality filter, nothing more — combining it with
    // a createdAt range filter would need a composite index Firestore doesn't
    // have deployed for this collection (confirmed directly: that combination
    // throws FAILED_PRECONDITION at runtime, which silently degraded every
    // real report to "engagement data unavailable" until this was caught).
    // At this business's actual scale (a few hundred inbound messages) a
    // plain single-field scan is already effectively instant.
    const inboundSnap = await adminDb
      .collection('whatsapp_conversations')
      .where('direction', '==', 'inbound')
      .get();

    const latestInboundByPhone = new Map<string, { message: string; date: string | null; ms: number }>();
    inboundSnap.forEach((doc) => {
      const d = doc.data();
      if (!d.phone) return;
      const phone = normalizePhone(d.phone);
      const ms = d.createdAt?.toDate?.()?.getTime() || 0;
      const existing = latestInboundByPhone.get(phone);
      if (!existing || ms > existing.ms) {
        latestInboundByPhone.set(phone, {
          message: d.message || '(empty message)',
          date: d.createdAt?.toDate?.()?.toISOString() || null,
          ms,
        });
      }
    });

    const replied: EngagementContact[] = [];
    const noReply: EngagementContact[] = [];
    const optedOut: EngagementContact[] = [];

    // Opted-out takes precedence over replied — an opt-out message IS itself
    // an inbound message, so without this check it would land in "replied"
    // too, which would misrepresent the more important, more actionable
    // classification.
    for (const [phone, name] of targetsByPhone) {
      const optOut = optOutsByPhone.get(phone);
      if (optOut) {
        optedOut.push({ phone, name, message: optOut.message, date: optOut.date });
        continue;
      }
      const inbound = latestInboundByPhone.get(phone);
      if (inbound) {
        replied.push({ phone, name, message: inbound.message, date: inbound.date });
      } else {
        noReply.push({ phone, name });
      }
    }

    // Most-recent-first for the two "something happened" buckets; alphabetical
    // for no-reply (usually by far the largest) so it's actually scannable.
    replied.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    optedOut.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    noReply.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ success: true, replied, noReply, optedOut });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Failed to build engagement report' }, { status: 500 });
  }
}
