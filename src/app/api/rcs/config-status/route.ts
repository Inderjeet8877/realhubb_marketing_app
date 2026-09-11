import { NextResponse } from 'next/server';
import { getPingSmartConfigStatus } from '@/lib/rcs';

// Lets the page show a clear "not set up yet, here's exactly what's missing"
// banner before anyone tries to send — rather than only finding out via a
// failed send attempt.
export async function GET() {
  return NextResponse.json(getPingSmartConfigStatus());
}
