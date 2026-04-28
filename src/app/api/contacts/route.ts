import { NextResponse } from 'next/server';
import { collection, getDocs, addDoc, query, orderBy, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import * as XLSX from 'xlsx';

interface Contact {
  id?: string;
  name: string;
  phone: string;
  email?: string;
  tags: string[];
  addedAt?: any;
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/["']/g, '');
}

function isNameColumn(header: string): boolean {
  const normalized = normalizeHeader(header);
  return normalized === 'name' || 
         normalized === 'names' || 
         normalized === 'full_name' || 
         normalized === 'fullname' || 
         normalized === 'first_name' ||
         normalized === 'contact_name' ||
         normalized === 'customer_name' ||
         normalized === 'client_name' ||
         /^name/i.test(normalized);
}

function isPhoneColumn(header: string): boolean {
  const normalized = normalizeHeader(header);
  return normalized === 'phone' || 
         normalized === 'phones' || 
         normalized === 'phone_number' ||
         normalized === 'phonenumber' ||
         normalized === 'mobile' || 
         normalized === 'mobiles' ||
         normalized === 'number' ||
         normalized === 'numbers' ||
         normalized === 'contact' ||
         normalized === 'mobile_number' ||
         normalized === 'phone_no' ||
         normalized === 'phoneno' ||
         /^phone/i.test(normalized) ||
         /^mobile/i.test(normalized) ||
         /number/i.test(normalized);
}

function isEmailColumn(header: string): boolean {
  const normalized = normalizeHeader(header);
  return normalized === 'email' || 
         normalized === 'e-mail' || 
         normalized === 'email_id' ||
         normalized === 'mail';
}

function isTagColumn(header: string): boolean {
  const normalized = normalizeHeader(header);
  return normalized === 'tags' || 
         normalized === 'tag' || 
         normalized === 'labels' ||
         normalized === 'label';
}

function cleanPhoneNumber(phone: string): string {
  if (!phone) return '';
  let cleaned = phone.toString().replace(/[\s\-\(\)\.\+]/g, '');
  cleaned = cleaned.replace(/^91/, '');
  if (!/^\d+$/.test(cleaned)) return '';
  if (cleaned.length === 10) {
    return '+91' + cleaned;
  } else if (cleaned.length === 11) {
    return '+' + cleaned;
  } else if (cleaned.length === 12) {
    return '+' + cleaned;
  }
  return cleaned;
}

function parseExcel(buffer: ArrayBuffer): Contact[] {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
  
  if (!data || data.length === 0) return [];

  return parseDataRows(data);
}

function parseDataRows(data: string[][]): Contact[] {
  let nameIndex = -1;
  let phoneIndex = -1;
  let emailIndex = -1;
  let tagIndex = -1;

  for (let i = 0; i < Math.min(5, data.length); i++) {
    const row = data[i];
    if (!row) continue;
    
    for (let j = 0; j < row.length; j++) {
      const header = (row[j] || '').toString().trim();
      
      if (nameIndex === -1 && isNameColumn(header)) {
        nameIndex = j;
      } else if (phoneIndex === -1 && isPhoneColumn(header)) {
        phoneIndex = j;
      } else if (emailIndex === -1 && isEmailColumn(header)) {
        emailIndex = j;
      } else if (tagIndex === -1 && isTagColumn(header)) {
        tagIndex = j;
      }
    }
    
    if (nameIndex !== -1 && phoneIndex !== -1) break;
  }

  if (nameIndex === -1 || phoneIndex === -1) {
    const firstRow = data[0];
    for (let j = 0; j < firstRow?.length; j++) {
      const cell = (firstRow[j] || '').toString().trim();
      if (nameIndex === -1 && isNameColumn(cell)) nameIndex = j;
      if (phoneIndex === -1 && isPhoneColumn(cell)) phoneIndex = j;
      if (emailIndex === -1 && isEmailColumn(cell)) emailIndex = j;
      if (tagIndex === -1 && isTagColumn(cell)) tagIndex = j;
    }
  }

  if (nameIndex === -1) nameIndex = 0;
  if (phoneIndex === -1) phoneIndex = 1;

  const contacts: Contact[] = [];
  const seenPhones = new Set<string>();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    let name = '';
    let phone = '';
    let email = '';
    let tags: string[] = [];

    name = (row[nameIndex] || '').toString().trim();
    phone = cleanPhoneNumber(row[phoneIndex] || '');
    if (emailIndex >= 0) email = (row[emailIndex] || '').toString().trim();
    if (tagIndex >= 0) {
      const tagStr = (row[tagIndex] || '').toString();
      tags = tagStr.split(/[;,\|]/).map(t => t.trim()).filter(t => t);
    }

    if (name && phone && !seenPhones.has(phone)) {
      seenPhones.add(phone);
      contacts.push({
        name,
        phone,
        email: email || '',
        tags: tags || [],
      });
    }
  }

  return contacts;
}

function parseCSV(text: string): Contact[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length < 1) return [];
  
  const allLines: string[][] = lines.map(line => {
    const matches = line.match(/(".*?"|[^",\s]+)(?:\s*,\s*(".*?"|[^",\s]+))*/g);
    if (matches) {
      return matches.map(m => m.replace(/^,|,$/g, '').trim().replace(/^"|"$/g, ''));
    }
    return line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
  });

  return parseDataRows(allLines);
}

export async function GET() {
  try {
    const contactsRef = collection(db, 'contacts');
    const q = query(contactsRef, orderBy('addedAt', 'desc'));
    const snapshot = await getDocs(q);
    
    const contacts = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      addedAt: doc.data().addedAt?.toDate?.() || new Date()
    }));

    return NextResponse.json({
      success: true,
      contacts,
      total: contacts.length,
    });
  } catch (error: any) {
    console.error('Contacts fetch error:', error);
    return NextResponse.json(
      { error: error.message, contacts: [], total: 0 },
      { status: 200 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      const body = await request.json();
      const { contacts } = body;

      if (!contacts || !Array.isArray(contacts)) {
        return NextResponse.json(
          { error: 'Invalid contacts data' },
          { status: 400 }
        );
      }

      const contactsRef = collection(db, 'contacts');
      let imported = 0;

      for (const contact of contacts) {
        await addDoc(contactsRef, {
          name: contact.name || '',
          phone: contact.phone || '',
          email: contact.email || '',
          tags: contact.tags || [],
          addedAt: serverTimestamp(),
        });
        imported++;
      }

      return NextResponse.json({
        success: true,
        imported,
        message: `Successfully imported ${imported} contacts`,
      });
    }

    if (contentType.includes('text/csv') || contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File;
      
      if (!file) {
        return NextResponse.json(
          { error: 'No file provided' },
          { status: 400 }
        );
      }

      let contacts: Contact[] = [];
      const fileName = file.name.toLowerCase();
      
      if (fileName.endsWith('.csv')) {
        const text = await file.text();
        contacts = parseCSV(text);
      } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        const buffer = await file.arrayBuffer();
        contacts = parseExcel(buffer);
      } else {
        return NextResponse.json(
          { error: 'Unsupported file format. Please upload CSV or Excel file.' },
          { status: 400 }
        );
      }
      
      if (contacts.length === 0) {
        return NextResponse.json(
          { error: 'No valid contacts found in CSV. Please ensure CSV has name and phone columns.' },
          { status: 400 }
        );
      }

      const contactsRef = collection(db, 'contacts');
      let imported = 0;

      for (const contact of contacts) {
        await addDoc(contactsRef, {
          name: contact.name || '',
          phone: contact.phone || '',
          email: contact.email || '',
          tags: contact.tags || [],
          addedAt: serverTimestamp(),
        });
        imported++;
      }

      return NextResponse.json({
        success: true,
        imported,
        message: `Successfully imported ${imported} contacts`,
      });
    }

    return NextResponse.json(
      { error: 'Unsupported content type' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Contacts import error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { ids } = body;
    
    if (ids && Array.isArray(ids) && ids.length > 0) {
      for (const id of ids) {
        await deleteDoc(doc(db, 'contacts', id));
      }
      return NextResponse.json({
        success: true,
        message: `Deleted ${ids.length} contact(s)`
      });
    }

    const contactsRef = collection(db, 'contacts');
    const snapshot = await getDocs(contactsRef);
    
    for (const docSnap of snapshot.docs) {
      await deleteDoc(doc(db, 'contacts', docSnap.id));
    }
    
    return NextResponse.json({
      success: true,
      message: 'All contacts deleted'
    });
  } catch (error: any) {
    console.error('Contacts delete error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
