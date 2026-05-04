import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

const SHEETS_URL = process.env.GOOGLE_SHEETS_API_URL || '';

function checkConfig() {
  if (!SHEETS_URL) throw new Error('GOOGLE_SHEETS_API_URL environment variable is not set');
}

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

// ── Sheets helper ──────────────────────────────────────────────────────────
async function sheetsGet(params: Record<string, string>) {
  checkConfig();
  const url = new URL(SHEETS_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  return res.json();
}

async function sheetsPost(body: object) {
  checkConfig();
  const res = await fetch(SHEETS_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  return res.json();
}

// ══════════════════════════════════════════════════════════════════════════
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const listCategories = searchParams.get('listCategories') === 'true';
  const filterDataName = searchParams.get('dataName');

  try {
    if (listCategories) {
      const data = await sheetsGet({ action: 'getCategories' });
      return NextResponse.json({ success: true, categories: data.categories || [] });
    }

    const params: Record<string, string> = { action: 'getAll' };
    if (filterDataName) params.dataName = filterDataName;

    const data = await sheetsGet(params);
    return NextResponse.json({
      success:  true,
      contacts: data.contacts || [],
      total:    data.total    || 0,
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
      const data = await sheetsPost({ action: 'addBatch', contacts: result.valid });
      return NextResponse.json({ success: true, saved: data.saved || 0, dbDuplicates: data.dbDuplicates || 0 });
    }

    // ── BATCH SAVE (JSON) ────────────────────────────────────────────────
    if (contentType.includes('application/json')) {
      const body = await request.json();

      if (Array.isArray(body.contacts)) {
        const data = await sheetsPost({ action: 'addBatch', contacts: body.contacts });
        return NextResponse.json({ success: true, saved: data.saved || 0, dbDuplicates: data.dbDuplicates || 0 });
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
      await sheetsPost({ action: 'deleteByIds', ids });
      return NextResponse.json({ success: true, message: `Deleted ${ids.length} contact(s)` });
    }

    if (dataName) {
      await sheetsPost({ action: 'deleteByDataName', dataName });
      return NextResponse.json({ success: true, message: `Deleted batch "${dataName}"` });
    }

    await sheetsPost({ action: 'deleteAll' });
    return NextResponse.json({ success: true, message: 'All contacts deleted' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
