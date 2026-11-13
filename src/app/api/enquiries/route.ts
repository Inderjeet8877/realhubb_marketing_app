import { NextRequest, NextResponse, after } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { sendPushNotification } from '@/lib/push-notifications';

const NOTIFY_EMAIL = 'inderjeet.kumar8184@gmail.com';

interface EnquiryBody {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  message?: string;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Public, unauthenticated — this is the whole point (a visitor with no
// account submits an enquiry). No admin identity to check here, unlike the
// Meta OAuth routes; rate limiting/spam defenses are a separate concern to
// add later if this ever gets abused, not built preemptively.
export async function POST(request: NextRequest) {
  let body: EnquiryBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = (body.name || '').trim();
  const email = (body.email || '').trim();
  const phone = (body.phone || '').trim();
  const company = (body.company || '').trim();
  const message = (body.message || '').trim();

  if (!name || !email || !phone) {
    return NextResponse.json({ error: 'Name, email, and phone are required.' }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  let docId: string;
  try {
    const docRef = await adminDb.collection('enquiries').add({
      name, email, phone, company, message,
      status: 'new',
      createdAt: FieldValue.serverTimestamp(),
    });
    docId = docRef.id;
  } catch (err: any) {
    console.error('[Enquiries] Firestore write failed:', err);
    return NextResponse.json({ error: 'Could not submit right now — please try again shortly.' }, { status: 500 });
  }

  // Notification failures never fail the visitor's submission — the enquiry
  // is already safely stored either way. Wrapped in after() so Vercel keeps
  // this invocation alive until these actually complete — fire-and-forget
  // without it risked the function being torn down before either the email
  // or push notification ever left the server (confirmed happening on the
  // WhatsApp webhook's identical pattern).
  after(() =>
    notifyByEmail({ name, email, phone, company, message }).catch((e) =>
      console.error('[Enquiries] Email notification failed:', e)
    )
  );
  after(() =>
    sendPushNotification(
      `📩 New enquiry: ${name}`,
      company ? `${company} — ${phone}` : phone,
      { link: '/dashboard/enquiries' }
    ).catch((e) => console.error('[Enquiries] Push notification failed:', e))
  );

  return NextResponse.json({ success: true, id: docId });
}

async function notifyByEmail(enquiry: Required<Omit<EnquiryBody, 'company' | 'message'>> & { company: string; message: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[Enquiries] RESEND_API_KEY not configured — skipping email notification.');
    return;
  }

  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'Realhubb <onboarding@resend.dev>',
    to: NOTIFY_EMAIL,
    subject: `New enquiry from ${enquiry.name}`,
    html: `
      <h2>New website enquiry</h2>
      <p><strong>Name:</strong> ${escapeHtml(enquiry.name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(enquiry.email)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(enquiry.phone)}</p>
      ${enquiry.company ? `<p><strong>Company:</strong> ${escapeHtml(enquiry.company)}</p>` : ''}
      ${enquiry.message ? `<p><strong>Message:</strong><br>${escapeHtml(enquiry.message).replace(/\n/g, '<br>')}</p>` : ''}
    `,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Admin listing — read-only, matches the dashboard's existing convention of
// GET routes that aren't identity-gated at the API layer because the page
// itself sits behind the Firebase-authenticated /dashboard shell.
export async function GET(request: NextRequest) {
  const limitParam = request.nextUrl.searchParams.get('limit');
  const parsedLimit = limitParam ? parseInt(limitParam, 10) : 100;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 1000) : 100;

  try {
    const snap = await adminDb.collection('enquiries').orderBy('createdAt', 'desc').limit(limit).get();
    const enquiries = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || '',
        email: data.email || '',
        phone: data.phone || '',
        company: data.company || '',
        message: data.message || '',
        status: data.status || 'new',
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      };
    });
    return NextResponse.json({ success: true, enquiries });
  } catch (err: any) {
    console.error('[Enquiries] Fetch failed:', err);
    return NextResponse.json({ success: false, error: err.message, enquiries: [] }, { status: 502 });
  }
}
