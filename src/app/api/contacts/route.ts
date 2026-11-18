import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { normalizePhone, isValidPhoneNumber } from '@/lib/whatsapp-send';
import {
  listContacts, listFailedContacts, listCategories, addContacts,
  deleteContactsByIds, deleteContactsByDataName, deleteAllContacts,
} from '@/lib/contacts-store';

// Contacts are stored in Firestore (src/lib/contacts-store.ts). They moved
// off the Google Sheets / Apps Script backend, which took 7-16 s per call.
// Headroom kept for large imports, which check every stored phone for duplicates.
export const maxDuration = 60;

interface Contact {
  id?: string;
  name: string;
  phone: string;
  email?: string;
  tags: string[];
  dataName?: string;
  addedAt?: string;
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
// Was: unconditionally stripped a leading "91" substring before checking
// digit length — which could corrupt a number instead of rejecting or fixing
// it (e.g. an 11-digit number with a leading 0 stayed 11 digits and became
// "+0XXXXXXXXXX", never corrected to "+91..."). Delegates to the same
// normalizePhone/isValidPhoneNumber used for actually sending messages
// (@/lib/whatsapp-send), so a number accepted here is guaranteed to be one
// that can actually be sent to later — no separate, drifting definition of
// "valid" between contacts upload and broadcast sending.
//
// isValidPhoneNumber (not isValidIndianMobile) is used here specifically —
// this business has real international/NRI contacts (UAE, Saudi, US, etc.),
// discovered via a validation report after an earlier, too-strict
// India-only version of this function wrongly flagged genuine overseas
// contacts as invalid. Numbers shaped like an Indian number still get the
// strict 6-9-first-digit check; anything else just needs a plausible length.
function cleanPhoneNumber(phone: string): string {
  if (!phone) return '';
  if (!isValidPhoneNumber(phone)) return '';
  return '+' + normalizePhone(phone);
}

function norm(h: string) { return h.toLowerCase().trim().replace(/["']/g, ''); }
const isName  = (h: string) => /^(name|names|full.?name|first.?name|contact.?name|customer.?name|client.?name)/i.test(norm(h));
const isPhone = (h: string) => /^(phone|mobile|number|contact|whatsapp)/i.test(norm(h)) || /number/i.test(norm(h));
const isEmail = (h: string) => /^(email|e-?mail|mail)/i.test(norm(h));
const isTag   = (h: string) => /^(tags?|labels?)/i.test(norm(h));

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

    if (!rawName && !rawPhone) continue;
    if (!rawName) { corrupted.push({ row: i + 1, rawName, rawPhone, reason: 'Missing name' }); continue; }
    if (!phone)   { corrupted.push({ row: i + 1, rawName, rawPhone, reason: 'Invalid or missing phone number' }); continue; }

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
  return parseDataRows(rows as string[][], dataName);
}

// ══════════════════════════════════════════════════════════════════════════
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const wantCategories = searchParams.get('listCategories') === 'true';
  const filterDataName = searchParams.get('dataName');
  const failed = searchParams.get('failed') === 'true';

  try {
    if (wantCategories) {
      return NextResponse.json({ success: true, categories: await listCategories() });
    }

    const contacts = failed ? await listFailedContacts() : await listContacts(filterDataName || undefined);
    return NextResponse.json({ success: true, contacts, total: contacts.length });
  } catch (error: any) {
    console.error('[Contacts API] Failed to load contacts:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to load contacts', contacts: [], total: 0 },
      { status: 502 }
    );
  }
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const preview = searchParams.get('preview') === 'true';

  try {
    const contentType = request.headers.get('content-type') || '';

    // ── FILE UPLOAD ──────────────────────────────────────────────────────
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

      if (preview) {
        return NextResponse.json({
          success:             true,
          valid:               result.valid,
          corrupted:           result.corrupted,
          intraFileDuplicates: result.intraFileDuplicates,
          totalRows:           result.valid.length + result.corrupted.length + result.intraFileDuplicates,
        });
      }

      // Direct save (legacy path)
      const data = await addContacts(result.valid);
      return NextResponse.json({ success: true, saved: data.saved, dbDuplicates: data.dbDuplicates });
    }

    // ── BATCH SAVE (JSON) ────────────────────────────────────────────────
    if (contentType.includes('application/json')) {
      const body = await request.json();

      if (Array.isArray(body.contacts)) {
        const data = await addContacts(body.contacts);
        return NextResponse.json({ success: true, saved: data.saved, dbDuplicates: data.dbDuplicates });
      }

      // ── DEDUPE — same-phone rows within one batch, e.g. from a retried upload.
      // Done entirely on our side (fetch all, pick survivors, delete the rest) so it
      // is independent of the duplicate check that runs on import.
      if (body.action === 'dedupe' && body.dataName) {
        const contacts: Contact[] = await listContacts(body.dataName);

        // Keep the first occurrence of each phone number (sheet/array order), delete the rest.
        const seenPhones = new Set<string>();
        const idsToDelete: string[] = [];
        for (const c of contacts) {
          if (seenPhones.has(c.phone)) {
            if (c.id) idsToDelete.push(c.id);
          } else {
            seenPhones.add(c.phone);
          }
        }

        const duplicates = contacts.filter(c => c.id && idsToDelete.includes(c.id));

        if (!body.dryRun && idsToDelete.length > 0) {
          await deleteContactsByIds(idsToDelete);
        }

        return NextResponse.json({
          success: true,
          dryRun: !!body.dryRun,
          totalBefore: contacts.length,
          duplicatesRemoved: body.dryRun ? 0 : idsToDelete.length,
          duplicatesFound: idsToDelete.length,
          remaining: contacts.length - (body.dryRun ? 0 : idsToDelete.length),
          duplicateContacts: duplicates.map(c => ({ id: c.id, name: c.name, phone: c.phone })),
        });
      }

      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    return NextResponse.json({ error: 'Unsupported content type' }, { status: 400 });
  } catch (error: any) {
    console.error('Contacts POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { ids, dataName } = await request.json();

    if (ids && Array.isArray(ids) && ids.length > 0) {
      await deleteContactsByIds(ids);
      return NextResponse.json({ success: true, message: `Deleted ${ids.length} contact(s)` });
    }

    if (dataName) {
      await deleteContactsByDataName(dataName);
      return NextResponse.json({ success: true, message: `Deleted batch "${dataName}"` });
    }

    await deleteAllContacts();
    return NextResponse.json({ success: true, message: 'All contacts deleted' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
