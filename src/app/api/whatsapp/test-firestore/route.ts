import { NextResponse } from 'next/server';
import { collection, addDoc, getDocs, query, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function POST(request: Request) {
  console.log('=== FIRESTORE TEST START ===');
  
  try {
    const messagesRef = collection(db, 'whatsapp_conversations');
    
    console.log('Adding test document...');
    const docRef = await addDoc(messagesRef, {
      phone: 'test_phone',
      name: 'Test Name',
      message: 'Test message',
      direction: 'outbound',
      lastMessage: 'Test message',
      createdAt: new Date(),
    });
    
    console.log('Document created with ID:', docRef.id);
    
    const snapshot = await getDocs(query(messagesRef, limit(10)));
    console.log('Total documents after insert:', snapshot.size);
    
    return NextResponse.json({
      success: true,
      docId: docRef.id,
      totalDocs: snapshot.size,
    });
  } catch (error: any) {
    console.error('=== FIRESTORE TEST ERROR ===');
    console.error(error);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}