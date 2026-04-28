import { NextRequest, NextResponse } from 'next/server';
import { collection, addDoc, serverTimestamp, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function POST(request: NextRequest) {
  try {
    const { phone, message, name, direction = 'inbound' } = await request.json();
    
    const testPhone = phone || '917654398184';
    const testMessage = message || 'Test from API!';
    const testName = name || testPhone;
    const testDirection = direction;
    
    console.log('[TestSave] Saving message:', { phone: testPhone, message: testMessage, direction: testDirection });
    
    // Try to save directly to Firestore
    const docRef = await addDoc(collection(db, 'whatsapp_conversations'), {
      phone: testPhone,
      name: testName,
      message: testMessage,
      direction: testDirection,
      lastMessage: testMessage,
      lastMessageAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      unreadCount: testDirection === 'inbound' ? 1 : 0,
      wamid: `test_${Date.now()}`,
      msgType: 'text',
      isTest: true,
    });
    
    console.log('[TestSave] ✅ Saved! Doc ID:', docRef.id);
    
    // Now verify it was saved
    const checkSnap = await getDocs(
      query(collection(db, 'whatsapp_conversations'), where('phone', '==', testPhone), limit(5))
    );
    
    const docs = checkSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log('[TestSave] Found', docs.length, 'documents for phone', testPhone);
    
    return NextResponse.json({ 
      success: true, 
      docId: docRef.id,
      phone: testPhone,
      direction: testDirection,
      totalDocsForPhone: docs.length,
      recentDocs: docs.slice(0, 3).map(d => ({ id: d.id, message: d.message?.slice(0, 30), direction: d.direction }))
    });
    
  } catch (error: any) {
    console.error('[TestSave] ❌ Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  // Check what's in the database
  try {
    const snapshot = await getDocs(query(collection(db, 'whatsapp_conversations'), limit(10)));
    const docs = snapshot.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        phone: data.phone,
        message: data.message?.slice(0, 50),
        direction: data.direction,
        createdAt: data.createdAt?.toDate?.()?.toISOString()
      };
    });
    
    return NextResponse.json({ 
      totalDocs: snapshot.size,
      docs: docs
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}