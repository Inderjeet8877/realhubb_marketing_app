import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import * as XLSX from 'xlsx';

interface Contact {
  id?: string;
  name: string;
  phone: string;
  email?: string;
  tags: string[];
  dataName?: string;
  addedAt?: any;
}

interface CorruptedRow {
  row: number;
  rawName: string;
  rawPhone: string;
  reason: string;
}

interface ParseResult {
  valid: Contact[];
  corrupted: CorruptedRow[];
  intraFileDuplicates: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function cleanPhoneNumber(phone: string): string {
  if (!phone) return '';
  let cleaned = phone.toString().replace(/[\s\-\(\)\.\+]/g, '');
  cleaned = cleaned.replace(/^91/, '');
  if (!/^\d+$/.test(cleaned)) return '';
  if (cleaned.length === 10) return '+91' + cleaned;
  if (cleaned.length === 11 || cleaned.length === 12) return '+' + cleaned;
  return '';
}

function norm(h: string) { return h.toLowerCase().trim().replace(/["']/g, ''); }
const isName  = (h: string) => /^(name|names|full.?name|first.?name|contact.?name|customer.?name|client.?name)/i.test(norm(h));
const isPhone = (h: string) => /^(phone|mobile|number|contact|whatsapp)/i.test(norm(h)) || /number/i.test(norm(h));
const isEmail = (h: string) => /^(email|e-?mail|mail)/i.test(norm(h));
const isTag   = (h: string) => /^(tags?|labels?)/i.test(norm(h));

// ── Row parser — returns valid contacts + corrupted rows + intra-file dupes ─
function parseDataRows(data: string[][], dataName: string): ParseResult {
  let ni = -1, pi = -1, ei = -1, ti = -1;

  for (let i = 0; i < Math.min(5, data.length); i++) {
    const row = data[i];
    if (!row) continue;
    for (let j = 0; j < row.length; j++) {
      const h = (row[j] || '').toString().trim();
      if (ni === -1 && isName(h))  ni = j;
      if (pi === -1 && isPhone(h)) pi = j;
      if (ei === -1 && isEmail(h)) ei = j;
      if (ti === -1 && isTag(h))   ti = j;
    }
    if (ni !== -1 && pi !== -1) break;
  }
  if (ni === -1) ni = 0;
  if (pi === -1) pi = 1;

  const seen = new Set<string>();
  const valid: Contact[] = [];
  const corrupted: CorruptedRow[] = [];
  let intraFileDuplicates = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.every(cell => !(cell || '').toString().trim())) continue;

    const rawName  = (row[ni] || '').toString().trim();
    const rawPhone = (row[pi] || '').toString().trim();
    const phone    = cleanPhoneNumber(rawPhone);
    const email    = ei >= 0 ? (row[ei] || '').toString().trim() : '';
    const tags     = ti >= 0
      ? (row[ti] || '').toString().split(/[;,|]/).map(t => t.trim()).filter(Boolean)
      : [];

    // Validate
    if (!rawName && !rawPhone) continue; // blank row
    if (!rawName) { corrupted.push({ row: i + 1, rawName, rawPhone, reason: 'Missing name' }); continue; }
    if (!phone)   { corrupted.push({ row: i + 1, rawName, rawPhone, reason: 'Invalid or missing phone number' }); continue; }

    // Intra-file duplicate
    if (seen.has(phone)) { intraFileDuplicates++; continue; }

    seen.add(phone);
    valid.push({ name: rawName, phone, email, tags, dataName });
  }

  return { valid, corrupted, intraFileDuplicates };
}

function parseExcel(buffer: ArrayBuffer, dataName: string): ParseResult {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as string[][];
  return parseDataRows(data, dataName);
}

function parseCSV(text: string, dataName: string): ParseResult {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const rows  = lines.map(line =>
    line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g)?.map(m => m.replace(/^"|"$/g, '').trim()) ||
    line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
  );
  return parseDataRows(rows, dataName);
}

// ══════════════════════════════════════════════════════════════════════════
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const listCategories = searchParams.get('listCategories') === 'true';
  const filterDataName = searchParams.get('dataName');

  try {
    if (listCategories) {
      const snap = await adminDb.collection('contacts').get();
      const catMap = new Map<string, number>();
      snap.docs.forEach(d => {
        const dn = d.data().dataName || 'Uncategorized';
        catMap.set(dn, (catMap.get(dn) || 0) + 1);
      });
      return NextResponse.json({
        success: true,
        categories: Array.from(catMap.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
      });
    }

    const snap = filterDataName
      ? await adminDb.collection('contacts').where('dataName', '==', filterDataName).get()
      : await adminDb.collection('contacts').orderBy('addedAt', 'desc').get();

    return NextResponse.json({
      success: true,
      contacts: snap.docs.map(d => ({ id: d.id, ...d.data(), addedAt: d.data().addedAt?.toDate?.() || new Date() })),
      total: snap.size,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, contacts: [], total: 0 }, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const preview = searchParams.get('preview') === 'true';

  try {
    const contentType = request.headers.get('content-type') || '';

    // ── FILE UPLOAD (parse from form-data) ──────────────────────────────
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file     = formData.get('file') as File;
      const dataName = (formData.get('dataName') as string || '').trim() || 'Unnamed Batch';

      if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

      let result: ParseResult;
      const fn = file.name.toLowerCase();

      if (fn.endsWith('.csv')) {
        result = parseCSV(await file.text(), dataName);
      } else if (fn.endsWith('.xlsx') || fn.endsWith('.xls')) {
        result = parseExcel(await file.arrayBuffer(), dataName);
      } else {
        return NextResponse.json({ error: 'Upload a CSV or Excel file (.csv / .xlsx)' }, { status: 400 });
      }

      if (result.valid.length === 0 && result.corrupted.length === 0) {
        return NextResponse.json({ error: 'No data found. Ensure the file has name and phone columns.' }, { status: 400 });
      }

      // Preview mode — return parsed result without saving
      if (preview) {
        return NextResponse.json({
          success: true,
          valid:                result.valid,
          corrupted:            result.corrupted,
          intraFileDuplicates:  result.intraFileDuplicates,
          totalRows:            result.valid.length + result.corrupted.length + result.intraFileDuplicates,
        });
      }

      // Direct save (legacy path, not used by new UI)
      return saveBatch(result.valid, 0);
    }

    // ── BATCH SAVE (JSON array from frontend progress flow) ─────────────
    if (contentType.includes('application/json')) {
      const body = await request.json();

      // Single batch save: { contacts: [...] }
      if (Array.isArray(body.contacts)) {
        return saveBatch(body.contacts, 0);
      }

      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    return NextResponse.json({ error: 'Unsupported content type' }, { status: 400 });
  } catch (error: any) {
    console.error('Contacts POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── Batch save with duplicate detection ────────────────────────────────────
async function saveBatch(contacts: Contact[], _offset: number) {
  if (contacts.length === 0) {
    return NextResponse.json({ success: true, saved: 0, dbDuplicates: 0 });
  }

  // Fetch all existing phones (phone field only) — efficient index scan
  const existingSnap = await adminDb.collection('contacts').select('phone').get();
  const existingPhones = new Set(existingSnap.docs.map(d => (d.data().phone as string) || ''));

  const batch  = adminDb.batch();
  let saved    = 0;
  let dbDups   = 0;

  for (const contact of contacts) {
    if (!contact.phone || !contact.name) continue;
    if (existingPhones.has(contact.phone)) { dbDups++; continue; }

    const ref = adminDb.collection('contacts').doc();
    batch.set(ref, {
      name:     contact.name,
      phone:    contact.phone,
      email:    contact.email || '',
      tags:     contact.tags  || [],
      dataName: contact.dataName || 'Unnamed Batch',
      addedAt:  FieldValue.serverTimestamp(),
    });

    existingPhones.add(contact.phone); // prevent intra-batch dupes
    saved++;
  }

  await batch.commit();

  return NextResponse.json({ success: true, saved, dbDuplicates: dbDups });
}

export async function DELETE(request: NextRequest) {
  try {
    const { ids, dataName } = await request.json();

    if (ids && Array.isArray(ids) && ids.length > 0) {
      const batch = adminDb.batch();
      ids.forEach(id => batch.delete(adminDb.collection('contacts').doc(id)));
      await batch.commit();
      return NextResponse.json({ success: true, message: `Deleted ${ids.length} contact(s)` });
    }

    if (dataName) {
      const snap = await adminDb.collection('contacts').where('dataName', '==', dataName).get();
      const batch = adminDb.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      return NextResponse.json({ success: true, message: `Deleted batch "${dataName}" (${snap.size} contacts)` });
    }

    const snap = await adminDb.collection('contacts').get();
    const batch = adminDb.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    return NextResponse.json({ success: true, message: 'All contacts deleted' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
