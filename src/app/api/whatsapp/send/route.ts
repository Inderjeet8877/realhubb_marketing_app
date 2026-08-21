import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { WHATSAPP_API_URL, SendConfig, buildMetaRequestBody, getMetaCredentials, validateTemplateHeaderMedia } from '@/lib/whatsapp-send';

async function getTemplateContent(templateName: string): Promise<string> {
  try {
    const normalized = templateName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const snap = await adminDb
      .collection('whatsapp_templates')
      .where('name', '==', normalized)
      .limit(1)
      .get();
    if (!snap.empty) return snap.docs[0].data().content || '';
  } catch (e) {
    console.error('getTemplateContent error:', e);
  }
  return '';
}

interface SendMessageRequest {
  phoneNumber: string;
  message: string;
  templateContent?: string;
  accountId?: string;
  templateType?: 'text' | 'image';
  imageUrl?: string;
  caption?: string;
  templateName?: string;
  languageCode?: string;
  templateHeaderType?: string;   // 'image' | 'video' | 'document' | 'text' | 'none'
  templateHeaderContent?: string; // URL for media header
  isTemplate?: boolean;
}

interface BulkSendRequest {
  contacts: string[];
  contactNames?: Record<string, string>;
  batchName?: string;
  message: string;
  templateContent?: string;
  accountId?: string;
  imageUrl?: string;
  caption?: string;
  templateName?: string;
  languageCode?: string;
  templateHeaderType?: string;
  templateHeaderContent?: string;
  isTemplate?: boolean;
  skipReport?: boolean; // true when frontend batches and saves report itself
}

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') || '';
  
  try {
    if (contentType.includes('application/json')) {
      const body = await request.json();
      
      if (body.contacts && Array.isArray(body.contacts)) {
        return handleBulkSend(body as BulkSendRequest);
      } else {
        return handleSingleSend(body as SendMessageRequest);
      }
    }

    return NextResponse.json(
      { error: 'Invalid request format' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('WhatsApp API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send message' },
      { status: 500 }
    );
  }
}

async function handleSingleSend(body: SendMessageRequest) {
  const { phoneNumber, message, templateContent, accountId, imageUrl, caption, templateName, languageCode = 'en', templateHeaderType, templateHeaderContent, isTemplate } = body;

  if (!phoneNumber) {
    return NextResponse.json(
      { error: 'Phone number is required' },
      { status: 400 }
    );
  }

  const { accountNum, accessToken, phoneNumberId } = getMetaCredentials(accountId);
  const businessAccountId = process.env[`WHATSAPP_BUSINESS_ACCOUNT_ID_${accountNum}`] || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID_1;

  // useTemplate/imageUrl/message all feed buildMetaRequestBody below — this is
  // the same request-shape logic the backend broadcast worker uses, kept in
  // one place (@/lib/whatsapp-send) so single sends and bulk sends can't
  // silently diverge in how they talk to Meta.
  const useTemplate = !!(isTemplate || templateName) && !imageUrl;

  if (!accessToken || !phoneNumberId) {
    const missing = [];
    if (!accessToken) missing.push('META_ACCESS_TOKEN');
    if (!phoneNumberId) missing.push('WHATSAPP_PHONE_NUMBER_ID');
    console.error('Missing env vars:', missing);
    return NextResponse.json(
      { error: `WhatsApp not configured. Missing: ${missing.join(', ')}` },
      { status: 500 }
    );
  }

  const cleanPhone = phoneNumber.replace(/\D/g, '');
  const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;

  // A template approved with a media header REQUIRES that header parameter on every
  // send. Meta will silently accept the call and never deliver it if it's missing —
  // there's no error, no webhook, nothing. So refuse to send rather than fail silently.
  if (useTemplate) {
    const validationError = validateTemplateHeaderMedia(templateName, templateHeaderType, templateHeaderContent);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const sendConfig: SendConfig = {
    message, templateContent, imageUrl, caption, templateName,
    languageCode: languageCode || 'en', templateHeaderType, templateHeaderContent,
    isTemplate: useTemplate,
  };
  const requestBody = buildMetaRequestBody(formattedPhone, sendConfig);

  try {
    const response = await fetch(
      `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      // Detailed error logging
      const errorDetails = {
        status: response.status,
        error: data.error || data,
        message: data.error?.message || data.error?.error_description || 'Unknown error',
        errorCode: data.error?.code,
        errorSubcode: data.error?.error_subcode,
        fbtrace_id: data.fbtrace_id
      };
      
      console.error('WhatsApp API error details:', JSON.stringify(errorDetails));
      
      // Specific error messages for common issues
      if (data.error?.code === 1315) {
        // Template not found or not approved
        throw new Error('Template issue: ' + (data.error?.message || 'Template not approved or not found. Make sure template status is APPROVED by Meta.'));
      } else if (data.error?.error_subcode === 5322) {
        throw new Error('Template quality pending: Your template needs Meta quality approval before sending. Status: ' + data.error?.message);
      }
      
      throw new Error(data.error?.message || `WhatsApp API error: ${response.status}`);
    }

    // Priority: content from frontend > Firestore lookup > fallback label
    const resolvedMessage = message || templateContent || (templateName ? await getTemplateContent(templateName) : '');
    await saveMessage({
      to: formattedPhone,
      message: resolvedMessage || `[Template: ${templateName || 'unknown'}]`,
      status: 'sent',
      wamid: data.messages?.[0]?.id,
      templateName,
    });

    console.log(`[Send] ${useTemplate ? `template "${templateName}"` : imageUrl ? 'image' : 'text'} -> ${formattedPhone} (wamid ${data.messages?.[0]?.id})`);

    return NextResponse.json({
      success: true,
      messageId: data.messages?.[0]?.id,
      recipient: formattedPhone,
    });
  } catch (error: any) {
    console.error('Send message error:', error);
    return NextResponse.json(
      { 
        error: error.message || 'Failed to send WhatsApp message',
        debug: {
          account: accountNum,
          phoneNumberId: phoneNumberId,
          businessAccountId: businessAccountId,
          templateName: templateName,
          useTemplate: useTemplate,
        }
      },
      { status: 500 }
    );
  }
}

async function handleBulkSend(body: BulkSendRequest) {
  const {
    contacts, contactNames = {}, batchName = 'Unnamed Batch',
    message, templateContent, accountId, imageUrl, caption,
    templateName, languageCode = 'en', templateHeaderType, templateHeaderContent, isTemplate,
    skipReport = false,
  } = body;

  if (!contacts || contacts.length === 0) {
    return NextResponse.json({ error: 'No contacts provided' }, { status: 400 });
  }

  const { accessToken, phoneNumberId } = getMetaCredentials(accountId);

  if (!accessToken || !phoneNumberId) {
    return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 500 });
  }

  const useTemplate = !!(isTemplate || templateName);
  const resolvedTemplateContent = message || templateContent || (templateName ? await getTemplateContent(templateName) : '');

  // Same template header applies to every recipient in this batch — if the media is
  // missing, every single send would be accepted by Meta and silently never delivered.
  // Reject the whole batch up front instead of burning it on broken sends.
  if (useTemplate) {
    const validationError = validateTemplateHeaderMedia(templateName, templateHeaderType, templateHeaderContent);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const sendConfig: SendConfig = {
    message, templateContent, imageUrl, caption, templateName,
    languageCode: languageCode || 'en', templateHeaderType, templateHeaderContent,
    isTemplate: useTemplate,
  };

  type ContactResult = { phone: string; name: string; success: boolean; wamid: string | null; status: string; error: string | null };
  const contactResults: ContactResult[] = [];

  for (const phoneNumber of contacts) {
    const cleanPhone    = phoneNumber.replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
    const contactName   = contactNames[phoneNumber] || contactNames[formattedPhone] || formattedPhone;
    const waBody = buildMetaRequestBody(formattedPhone, sendConfig);

    try {
      const response = await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(waBody),
      });
      const data = await response.json();

      if (response.ok) {
        const wamid = data.messages?.[0]?.id || null;
        contactResults.push({ phone: formattedPhone, name: contactName, success: true, wamid, status: 'sent', error: null });
        await saveMessage({ to: formattedPhone, message: resolvedTemplateContent || `[Template: ${templateName || 'unknown'}]`, status: 'sent', wamid, templateName });
      } else {
        contactResults.push({ phone: formattedPhone, name: contactName, success: false, wamid: null, status: 'failed', error: data.error?.message || 'Meta API rejected' });
      }
    } catch (err: any) {
      contactResults.push({ phone: formattedPhone, name: contactName, success: false, wamid: null, status: 'failed', error: err.message });
    }

    await new Promise(resolve => setTimeout(resolve, 200));
  }

  const successCount = contactResults.filter(r => r.success).length;

  // Save broadcast report + wamid index for delivery tracking
  if (!skipReport) {
    try {
      const reportRef  = adminDb.collection('bulk_reports').doc();
      const broadcastId = reportRef.id;
      await reportRef.set({
        broadcastId, batchName, templateName: templateName || null,
        total: contacts.length, sent: successCount,
        failed: contacts.length - successCount, delivered: 0, read: 0,
        contacts: contactResults, createdAt: FieldValue.serverTimestamp(),
      });
      // Firestore write batches hard-cap at 500 operations — a single batch built
      // for the whole broadcast used to throw (and silently drop ALL delivery/read
      // tracking) for any broadcast over ~500 recipients. Chunk it.
      const withWamid = contactResults.filter(r => r.wamid);
      const CHUNK = 450;
      for (let i = 0; i < withWamid.length; i += CHUNK) {
        const batch = adminDb.batch();
        for (const r of withWamid.slice(i, i + CHUNK)) {
          batch.set(adminDb.collection('wamid_index').doc(r.wamid!), { broadcastId, phone: r.phone });
        }
        await batch.commit();
      }
    } catch (err) {
      console.error('[Bulk Send] Failed to save broadcast report:', err);
    }
  }

  return NextResponse.json({
    success: true,
    total:   contacts.length,
    sent:    successCount,
    failed:  contacts.length - successCount,
    contacts: contactResults,   // always returned so frontend can consolidate
  });
}

async function saveMessage(data: {
  to: string;
  message: string;
  status: string;
  wamid?: string;
  templateName?: string;
}) {
  try {
    await adminDb.collection('whatsapp_conversations').add({
      phone: data.to,
      name: data.to,
      message: data.message,
      direction: 'outbound',
      lastMessage: data.message,
      lastMessageAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      status: data.status,
      wamid: data.wamid,
      ...(data.templateName && { templateName: data.templateName }),
    });
    return true;
  } catch (error) {
    console.error('saveMessage error:', error);
    return false;
  }
}
