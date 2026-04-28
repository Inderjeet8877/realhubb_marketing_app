import { NextResponse } from 'next/server';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function GET() {
  try {
    const ref = collection(db, 'whatsapp_conversations');
    const snapshot = await getDocs(query(ref, limit(100)));
    
    const docs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || null,
    }));
    
    return NextResponse.json({ success: true, count: docs.length, docs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}