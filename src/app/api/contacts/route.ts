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

// ── phone helpers ──────────────────────────────────────────────────────────
function cleanPhoneNumber(phone: string): string {
  if (!phone) return '';
  let cleaned = phone.toString().replace(/[\s\-\(\)\.\+]/g, '');
  cleaned = cleaned.replace(/^91/, '');
  if (!/^\d+$/.test(cleaned)) return '';
  if (cleaned.length === 10) return '+91' + cleaned;
  if (cleaned.length === 11 || cleaned.length === 12) return '+' + cleaned;
  return cleaned;
}

// ── column detection ────────────────────────────────────────────────────────
function norm(h: string) { return h.toLowerCase().trim().replace(/["']/g, ''); }
const isName  = (h: string) => /^(name|names|full.?name|first.?name|contact.?name|customer.?name|client.?name)/i.test(norm(h));
const isPhone = (h: string) => /^(phone|mobile|number|contact|whatsapp)/i.test(norm(h)) || /number/i.test(norm(h));
const isEmail = (h: string) => /^(email|e-?mail|mail)/i.test(norm(h));
const isTag   = (h: string) => /^(tags?|labels?)/i.test(norm(h));

// ── row parser ──────────────────────────────────────────────────────────────
function parseDataRows(data: string[][], dataName: string): Contact[] {
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
  const contacts: Contact[] = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    const name  = (row[ni] || '').toString().trim();
    const phone = cleanPhoneNumber(row[pi] || '');
    const email = ei >= 0 ? (row[ei] || '').toString().trim() : '';
    const tags  = ti >= 0
      ? (row[ti] || '').toString().split(/[;,|]/).map(t => t.trim()).filter(Boolean)
      : [];
    if (name && phone && !seen.has(phone)) {
      seen.add(phone);
      contacts.push({ name, phone, email, tags, dataName });
    }
  }
  return contacts;
}

function parseExcel(buffer: ArrayBuffer, dataName: string): Contact[] {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as string[][];
  return parseDataRows(data, dataName);
}

function parseCSV(text: string, dataName: string): Contact[] {
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
      // Return unique batch names with contact counts
      const snap = await adminDb.collection('contacts').get();
      const catMap = new Map<string, number>();
      snap.docs.forEach(d => {
        const dn = d.data().dataName || 'Uncategorized';
        catMap.set(dn, (catMap.get(dn) || 0) + 1);
      });
      const categories = Array.from(catMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
      return NextResponse.json({ success: true, categories });
    }

    let snap;
    if (filterDataName) {
      snap = await adminDb
        .collection('contacts')
        .where('dataName', '==', filterDataName)
        .get();
    } else {
      snap = await adminDb
        .collection('contacts')
        .orderBy('addedAt', 'desc')
        .get();
    }

    const contacts = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      addedAt: d.data().addedAt?.toDate?.() || new Date(),
    }));

    return NextResponse.json({ success: true, contacts, total: contacts.length });
  } catch (error: any) {
    console.error('Contacts GET error:', error);
    return NextResponse.json({ error: error.message, contacts: [], total: 0 }, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    // ── JSON import (manual) ──────────────────────────────────────────────
    if (contentType.includes('application/json')) {
      const { contacts, dataName } = await request.json();
      if (!contacts || !Array.isArray(contacts)) {
        return NextResponse.json({ error: 'Invalid contacts data' }, { status: 400 });
      }
      let imported = 0;
      for (const c of contacts) {
        await adminDb.collection('contacts').add({
          name: c.name || '',
          phone: c.phone || '',
          email: c.email || '',
          tags: c.tags || [],
          dataName: dataName || 'Manual Import',
          addedAt: FieldValue.serverTimestamp(),
        });
        imported++;
      }
      return NextResponse.json({ success: true, imported, message: `Imported ${imported} contacts` });
    }

    // ── File import (CSV / Excel) ─────────────────────────────────────────
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file     = formData.get('file') as File;
      const dataName = (formData.get('dataName') as string || '').trim() || 'Unnamed Batch';

      if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

      let contacts: Contact[] = [];
      const fn = file.name.toLowerCase();

      if (fn.endsWith('.csv')) {
        contacts = parseCSV(await file.text(), dataName);
      } else if (fn.endsWith('.xlsx') || fn.endsWith('.xls')) {
        contacts = parseExcel(await file.arrayBuffer(), dataName);
      } else {
        return NextResponse.json({ error: 'Upload a CSV or Excel file' }, { status: 400 });
      }

      if (contacts.length === 0) {
        return NextResponse.json({
          error: 'No valid contacts found. Ensure the file has name and phone columns.',
        }, { status: 400 });
      }

      let imported = 0;
      for (const c of contacts) {
        await adminDb.collection('contacts').add({
          name:     c.name,
          phone:    c.phone,
          email:    c.email || '',
          tags:     c.tags || [],
          dataName: c.dataName || dataName,
          addedAt:  FieldValue.serverTimestamp(),
        });
        imported++;
      }

      return NextResponse.json({
        success: true,
        imported,
        message: `Imported ${imported} contacts into "${dataName}"`,
      });
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
      for (const id of ids) {
        await adminDb.collection('contacts').doc(id).delete();
      }
      return NextResponse.json({ success: true, message: `Deleted ${ids.length} contact(s)` });
    }

    // Delete entire batch
    if (dataName) {
      const snap = await adminDb.collection('contacts').where('dataName', '==', dataName).get();
      for (const d of snap.docs) await d.ref.delete();
      return NextResponse.json({ success: true, message: `Deleted batch "${dataName}" (${snap.size} contacts)` });
    }

    // Delete all
    const snap = await adminDb.collection('contacts').get();
    for (const d of snap.docs) await d.ref.delete();
    return NextResponse.json({ success: true, message: 'All contacts deleted' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
