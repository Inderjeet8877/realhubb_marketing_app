import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, where, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { User } from 'firebase/auth';

export interface MetaAccountCredentials {
  id?: string;
  userId: string;
  name: string;
  appId: string;
  appSecret?: string;
  accessToken: string;
  accountId?: string;
  adAccountId?: string;
  adAccountName?: string;
  currency?: string;
  createdAt?: any;
  updatedAt?: any;
}

export const accountsCollection = collection(db, 'meta_accounts');

export async function saveMetaAccount(userId: string, account: Omit<MetaAccountCredentials, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const q = query(accountsCollection, where('userId', '==', userId), where('appId', '==', account.appId));
  const snapshot = await getDocs(q);
  
  if (!snapshot.empty) {
    const existingDoc = snapshot.docs[0];
    await updateDoc(doc(db, 'meta_accounts', existingDoc.id), {
      ...account,
      updatedAt: new Date(),
    });
    return existingDoc.id;
  }
  
  const docRef = await addDoc(accountsCollection, {
    userId,
    ...account,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  
  return docRef.id;
}

export async function getMetaAccounts(userId: string): Promise<MetaAccountCredentials[]> {
  const q = query(accountsCollection, where('userId', '==', userId));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as MetaAccountCredentials[];
}

export async function deleteMetaAccount(accountId: string): Promise<void> {
  await deleteDoc(doc(db, 'meta_accounts', accountId));
}

export async function updateMetaAccount(accountId: string, updates: Partial<MetaAccountCredentials>): Promise<void> {
  await updateDoc(doc(db, 'meta_accounts', accountId), {
    ...updates,
    updatedAt: new Date(),
  });
}

export function subscribeToMetaAccounts(userId: string, callback: (accounts: MetaAccountCredentials[]) => void) {
  const q = query(accountsCollection, where('userId', '==', userId));
  
  return onSnapshot(q, (snapshot) => {
    const accounts = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as MetaAccountCredentials[];
    callback(accounts);
  });
}
