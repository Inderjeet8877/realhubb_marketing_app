import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';

// GET /api/me → { email, role } for the signed-in team member.
export async function GET(request: NextRequest) {
  const who = await requireAdmin(request);
  if (who instanceof NextResponse) return who;
  return NextResponse.json({ success: true, email: who.email, role: who.role });
}
