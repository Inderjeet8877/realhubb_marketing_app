import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { CHUNK_SIZE, triggerWorker, getMetaCredentials, validateTemplateHeaderMedia, filterOptedOutPhones } from '../_shared';

interface StartBroadcastRequest {
  contacts: string[];
  contactNames?: Record<string, string>;
  batchName?: string;
  message?: string;
  templateContent?: string;
  accountId?: string;
  imageUrl?: string;
  caption?: string;
  templateName?: string;
  languageCode?: string;
  templateHeaderType?: string;
  templateHeaderContent?: string;
  isTemplate?: boolean;
}

// Starts a bulk broadcast as a durable backend job instead of a client-driven
// send loop. This endpoint only creates the job and its target chunks, then
// hands off to /broadcasts/process (which keeps re-triggering itself one
// chunk at a time via after()) — it returns as soon as the job is queued, so
// the caller never needs to stay connected for the send to complete.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as StartBroadcastRequest;
    const {
      contacts, contactNames = {}, batchName = 'Unnamed Batch',
      message, templateContent, accountId, imageUrl, caption,
      templateName, languageCode = 'en', templateHeaderType, templateHeaderContent, isTemplate,
    } = body;

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ error: 'No contacts provided' }, { status: 400 });
    }

    // Never send a broadcast to someone who's already told us to stop —
    // enforced here rather than left as something the UI merely displays,
    // since the whole point is to reduce block/report events that damage
    // the sending template's (and account's) Meta quality rating.
    const { allowed: filteredContacts, excludedCount: optedOutCount } = await filterOptedOutPhones(contacts);
    if (filteredContacts.length === 0) {
      return NextResponse.json({ error: 'Every contact in this batch has opted out — nothing to send.' }, { status: 400 });
    }

    const useTemplate = isTemplate || !!templateName;

    // Same guard as the previous client-driven bulk send: a media-header
    // template with no media URL would be accepted by Meta and silently never
    // delivered to every single recipient — reject the whole broadcast up
    // front instead of burning it on sends that will never arrive.
    if (useTemplate) {
      const validationError = validateTemplateHeaderMedia(templateName, templateHeaderType, templateHeaderContent);
      if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const { accountNum, accessToken, phoneNumberId } = getMetaCredentials(accountId);
    if (!accessToken || !phoneNumberId) {
      return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 500 });
    }

    const totalChunks = Math.ceil(filteredContacts.length / CHUNK_SIZE);
    const reportRef = adminDb.collection('bulk_reports').doc();
    const broadcastId = reportRef.id;

    await reportRef.set({
      broadcastId, batchName, templateName: templateName || null,
      status: 'processing',
      total: filteredContacts.length, sent: 0, failed: 0, delivered: 0, read: 0,
      optedOutCount,
      cursor: 0, totalChunks, chunkSize: CHUNK_SIZE,
      cancelRequested: false, cancelReason: null, cancelRequestedAt: null,
      finishedAt: null, errorMessage: null,
      sendConfig: {
        message: message || null, templateContent: templateContent || null,
        accountId: accountNum, imageUrl: imageUrl || null, caption: caption || null,
        templateName: templateName || null, languageCode, templateHeaderType: templateHeaderType || null,
        templateHeaderContent: templateHeaderContent || null, isTemplate: useTemplate,
      },
      createdAt: FieldValue.serverTimestamp(),
    });

    // Target contacts are split into small per-chunk docs rather than one
    // inline array — a single Firestore document is capped at 1MiB, which a
    // broadcast of a few thousand contacts would exceed. Chunk docs also give
    // the worker a natural, independently-claimable unit of work.
    const targetChunks: { phone: string; name: string }[][] = [];
    for (let i = 0; i < filteredContacts.length; i += CHUNK_SIZE) {
      targetChunks.push(
        filteredContacts.slice(i, i + CHUNK_SIZE).map(phone => ({
          phone, name: contactNames[phone] || phone,
        }))
      );
    }

    // Firestore write batches hard-cap at 500 operations.
    const FIRESTORE_BATCH_LIMIT = 450;
    for (let i = 0; i < targetChunks.length; i += FIRESTORE_BATCH_LIMIT) {
      const batch = adminDb.batch();
      const end = Math.min(i + FIRESTORE_BATCH_LIMIT, targetChunks.length);
      for (let j = i; j < end; j++) {
        batch.set(reportRef.collection('targets').doc(String(j)), { contacts: targetChunks[j] });
      }
      await batch.commit();
    }

    // Fire the first worker chunk in the background — the response below goes
    // out to the browser without waiting for any sending to happen.
    after(() => triggerWorker(broadcastId));

    return NextResponse.json({
      success: true, broadcastId, total: filteredContacts.length, totalChunks, optedOutCount,
    });
  } catch (error: any) {
    console.error('[Broadcast Start] error:', error);
    return NextResponse.json({ error: error.message || 'Failed to start broadcast' }, { status: 500 });
  }
}
