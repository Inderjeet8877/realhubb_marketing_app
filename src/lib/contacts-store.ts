import { gzipSync, gunzipSync } from 'zlib';
import { adminDb } from '@/lib/firebase-admin';
import { isValidPhoneNumber } from '@/lib/whatsapp-send';

// Contacts live in Firestore as CHUNKS: each doc holds up to CHUNK_SIZE
// contacts of one batch (dataName), in import order, stored as gzipped JSON
// (~4.6x smaller, and one field to decode instead of thousands). ~87k contacts is ~45
// docs, so "load everything" is ~45 reads (well under a second) instead of
// 87k per-contact reads, and one batch loads just its own chunks.
// ponytail: whole-chunk rewrites on delete; fine for occasional deletes,
// switch to one doc per contact if per-contact edits become frequent.

export interface StoredContact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  tags: string[];
  dataName?: string;
  addedAt?: string;
  failReason?: string;
}

interface Chunk {
  dataName: string;
  order: number;         // import order across chunks (ms timestamp + index)
  count: number;
  data: Buffer;          // gzip(JSON.stringify(StoredContact[]))
}

const pack = (contacts: StoredContact[]) => gzipSync(Buffer.from(JSON.stringify(contacts)));
const unpack = (chunk: Chunk): StoredContact[] => JSON.parse(gunzipSync(chunk.data).toString('utf8'));

export const CHUNK_SIZE = 2000;               // ~300 KB per doc, well under Firestore's 1 MB
const MAIN = 'contact_chunks';
const FAILED = 'contact_failed_chunks';
const WRITE_BATCH = 400;                      // Firestore batch limit is 500 ops

const byOrder = (a: Chunk, b: Chunk) => a.order - b.order;

async function readChunks(collection: string, dataName?: string) {
  let q: FirebaseFirestore.Query = adminDb.collection(collection);
  if (dataName) q = q.where('dataName', '==', dataName);
  const snap = await q.get();
  return snap.docs.map((d) => ({ ref: d.ref, data: d.data() as Chunk })).sort((a, b) => byOrder(a.data, b.data));
}

const flatten = (chunks: { data: Chunk }[]) => chunks.flatMap((c) => unpack(c.data));

export async function listContacts(dataName?: string) {
  return flatten(await readChunks(MAIN, dataName));
}

export async function listFailedContacts() {
  return flatten(await readChunks(FAILED));
}

// Batch names + counts without downloading the contacts themselves.
export async function listCategories() {
  const snap = await adminDb.collection(MAIN).select('dataName', 'count').get();
  const counts = new Map<string, number>();
  for (const d of snap.docs) {
    const { dataName, count } = d.data() as Pick<Chunk, 'dataName' | 'count'>;
    counts.set(dataName, (counts.get(dataName) || 0) + (count || 0));
  }
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
}

async function commitInBatches(ops: ((b: FirebaseFirestore.WriteBatch) => void)[]) {
  for (let i = 0; i < ops.length; i += WRITE_BATCH) {
    const batch = adminDb.batch();
    ops.slice(i, i + WRITE_BATCH).forEach((op) => op(batch));
    await batch.commit();
  }
}

// Writes contacts as new chunk docs (never appends to existing ones, so
// concurrent imports can't overwrite each other), grouped by batch.
export async function writeChunks(collection: string, contacts: StoredContact[], orderBase = Date.now()) {
  const groups = new Map<string, StoredContact[]>();
  for (const c of contacts) {
    const key = c.dataName || 'Unnamed Batch';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }
  const ops: ((b: FirebaseFirestore.WriteBatch) => void)[] = [];
  let seq = 0;
  for (const [dataName, list] of groups) {
    for (let i = 0; i < list.length; i += CHUNK_SIZE) {
      const part = list.slice(i, i + CHUNK_SIZE);
      const ref = adminDb.collection(collection).doc();
      const chunk: Chunk = { dataName, order: orderBase + seq++, count: part.length, data: pack(part) };
      ops.push((b) => b.set(ref, chunk));
    }
  }
  await commitInBatches(ops);
}

// Same rules the Google Sheets backend applied: a phone already stored
// anywhere is skipped and counted as a duplicate; invalid numbers go to
// the failed list instead of the main list.
export async function addContacts(incoming: Partial<StoredContact>[]) {
  const existing = new Set((await listContacts()).map((c) => c.phone));
  const now = new Date().toISOString();
  const toSave: StoredContact[] = [];
  const failed: StoredContact[] = [];
  let dbDuplicates = 0;

  for (const raw of incoming) {
    const phone = String(raw.phone || '').trim();
    const contact: StoredContact = {
      id: raw.id || crypto.randomUUID(),
      name: String(raw.name || '').trim(),
      phone,
      email: raw.email || '',
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      dataName: (raw.dataName || '').trim() || 'Unnamed Batch',
      addedAt: raw.addedAt || now,
    };
    if (!phone || !isValidPhoneNumber(phone)) {
      failed.push({ ...contact, failReason: 'Invalid phone number' });
    } else if (existing.has(phone)) {
      dbDuplicates++;
    } else {
      existing.add(phone);
      toSave.push(contact);
    }
  }

  if (toSave.length) await writeChunks(MAIN, toSave);
  if (failed.length) await writeChunks(FAILED, failed);
  return { saved: toSave.length, dbDuplicates, failed: failed.length };
}

export async function deleteContactsByIds(ids: string[]) {
  const remove = new Set(ids);
  const ops: ((b: FirebaseFirestore.WriteBatch) => void)[] = [];
  for (const { ref, data } of await readChunks(MAIN)) {
    const current = unpack(data);
    const kept = current.filter((c) => !remove.has(c.id));
    if (kept.length === current.length) continue;
    ops.push(kept.length ? (b) => b.update(ref, { data: pack(kept), count: kept.length }) : (b) => b.delete(ref));
  }
  await commitInBatches(ops);
}

export async function deleteContactsByDataName(dataName: string) {
  const chunks = await readChunks(MAIN, dataName);
  await commitInBatches(chunks.map(({ ref }) => (b) => b.delete(ref)));
}

export async function deleteAllContacts() {
  const chunks = await readChunks(MAIN);
  await commitInBatches(chunks.map(({ ref }) => (b) => b.delete(ref)));
}
