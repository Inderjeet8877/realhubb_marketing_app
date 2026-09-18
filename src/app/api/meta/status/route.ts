import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

interface SlotStatus {
  slot: '1' | '2' | '3';
  connected: boolean;
  label: string | null;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
}

// Read-only, no secrets in the response — used by the Settings page to show
// per-slot connection state and the expiry warning banner.
export async function GET() {
  const slots: ('1' | '2' | '3')[] = ['1', '2', '3'];

  const results: SlotStatus[] = await Promise.all(slots.map(async (slot) => {
    const snap = await adminDb.collection('meta_credentials').doc(slot).get();
    if (!snap.exists) {
      return { slot, connected: false, label: null, expiresAt: null, daysUntilExpiry: null };
    }
    const data = snap.data()!;
    const expiresAt: Date | null = data.expiresAt?.toDate?.() || (data.expiresAt ? new Date(data.expiresAt) : null);
    const daysUntilExpiry = expiresAt ? Math.floor((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;
    return {
      slot,
      connected: true,
      label: data.label || null,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      daysUntilExpiry,
    };
  }));

  return NextResponse.json({ success: true, slots: results });
}
