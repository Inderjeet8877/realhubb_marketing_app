import { NextRequest, NextResponse } from 'next/server';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get('account_id');
  const accessToken = request.nextUrl.searchParams.get('access_token');

  try {
    let credentials;

    if (accountId && accountId.startsWith('firestore_')) {
      const docId = accountId.replace('firestore_', '');
      const accountsRef = collection(db, 'meta_accounts');
      const q = query(accountsRef, where('__name__', '==', docId));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        credentials = {
          accessToken: doc.data().accessToken,
          appId: doc.data().appId,
          adAccountId: doc.data().adAccountId,
        };
      }
    } else if (accessToken) {
      credentials = { accessToken };
    } else {
      const accountsRef = collection(db, 'meta_accounts');
      const snapshot = await getDocs(accountsRef);
      
      const accounts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      return NextResponse.json({
        success: true,
        accounts,
      });
    }

    if (credentials) {
      return NextResponse.json({
        success: true,
        credentials,
      });
    }

    return NextResponse.json({
      success: false,
      error: 'No credentials found',
    }, { status: 404 });
  } catch (error: any) {
    console.error('Error fetching credentials:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
