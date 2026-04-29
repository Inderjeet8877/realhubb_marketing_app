import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';

const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0';

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
  isTemplate?: boolean;
}

interface BulkSendRequest {
  contacts: string[];
  message: string;
  templateContent?: string;
  accountId?: string;
  templateType?: 'text' | 'image';
  imageUrl?: string;
  caption?: string;
  templateName?: string;
  languageCode?: string;
  isTemplate?: boolean;
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
  const { phoneNumber, message, templateContent, accountId, templateType = 'text', imageUrl, caption, templateName, languageCode = 'en_US', isTemplate } = body;

  if (!phoneNumber) {
    return NextResponse.json(
      { error: 'Phone number is required' },
      { status: 400 }
    );
  }

  const accountNum = accountId === '2' ? '2' : '1';
  const accessToken = process.env[`META_ACCESS_TOKEN_${accountNum}`];
  const phoneNumberId = process.env[`WHATSAPP_PHONE_NUMBER_ID_${accountNum}`];
  const businessAccountId = process.env[`WHATSAPP_BUSINESS_ACCOUNT_ID_${accountNum}`];

  const useTemplate = isTemplate || templateName;
  console.log(`WhatsApp send - Account: ${accountNum}, PhoneID: ${phoneNumberId}, isTemplate: ${useTemplate}, templateName: ${templateName}, hasMessage: ${!!message}`);

  if (!accessToken || !phoneNumberId || !businessAccountId) {
    const missing = [];
    if (!accessToken) missing.push('META_ACCESS_TOKEN');
    if (!phoneNumberId) missing.push('WHATSAPP_PHONE_NUMBER_ID');
    if (!businessAccountId) missing.push('WHATSAPP_BUSINESS_ACCOUNT_ID');
    console.error('Missing env vars:', missing);
    return NextResponse.json(
      { error: `WhatsApp not configured. Missing: ${missing.join(', ')}` },
      { status: 500 }
    );
  }

const cleanPhone = phoneNumber.replace(/\D/g, '');
  const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;

  let requestBody: any;

  // First priority: Send as template if isTemplate is true or templateName exists
  if (useTemplate && !imageUrl) {
    // Use the exact template name — do NOT re-sanitize, Meta requires the exact stored name
    const templateToUse = (templateName || 'hello_world').trim();
    // Use the language that was stored with the template (passed from frontend)
    const templateLang = languageCode || 'en';

    console.log(`Sending as TEMPLATE: "${templateToUse}" lang:${templateLang} to ${formattedPhone}`);

    requestBody = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'template',
      template: {
        name: templateToUse,
        language: { code: templateLang },
      },
    };
  } 
  // Second priority: Send as image if templateType is image and imageUrl exists
  else if (imageUrl) {
    console.log(`Sending as IMAGE to ${formattedPhone}`);
    requestBody = {
      messaging_product: 'whatsapp',
      to: formattedPhone,
      type: 'image',
      image: {
        link: imageUrl,
        caption: caption || message
      }
    };
  } 
  // Third priority: Send as text
  else {
    console.log(`Sending as TEXT to ${formattedPhone}`);
    requestBody = {
      messaging_product: 'whatsapp',
      to: formattedPhone,
      type: 'text',
      text: {
        body: message || 'Hello'
      }
    };
  }

  console.log("Final requestBody:", JSON.stringify(requestBody));

  try {
    console.log("Making WhatsApp API call to:", `${WHATSAPP_API_URL}/${phoneNumberId}/messages`);
    console.log("Request body:", JSON.stringify(requestBody));
    
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
    console.log('WhatsApp API response status:', response.status);
    console.log('WhatsApp API response:', JSON.stringify(data));

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

    console.log('=== MESSAGE SENT ===');
    console.log('To:', formattedPhone);
    console.log('Message:', message || `Template: ${templateName}`);
    console.log('Wamid:', data.messages?.[0]?.id);

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
  const { contacts, message, templateContent, accountId, templateType = 'text', imageUrl, caption, templateName, languageCode = 'en_US', isTemplate } = body;

  if (!contacts || contacts.length === 0) {
    return NextResponse.json(
      { error: 'No contacts provided' },
      { status: 400 }
    );
  }

  const accountNum = accountId === '2' ? '2' : '1';
  const accessToken = process.env[`META_ACCESS_TOKEN_${accountNum}`];
  const phoneNumberId = process.env[`WHATSAPP_PHONE_NUMBER_ID_${accountNum}`];

  // Resolve template content once for all contacts (frontend content takes priority)
  const resolvedTemplateContent = message || templateContent || (templateName ? await getTemplateContent(templateName) : '');

  if (!accessToken || !phoneNumberId) {
    return NextResponse.json(
      { error: 'WhatsApp not configured. Please check .env.local settings' },
      { status: 500 }
    );
  }

  const useTemplate = isTemplate || templateName;
  const results: { phone: string; success: boolean; messageId?: string; error?: string }[] = [];

  for (const phoneNumber of contacts) {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;

    let requestBody: any;

    if (useTemplate) {
      requestBody = {
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: 'template',
        template: {
          name: (templateName || 'hello_world').trim(),
          language: { code: languageCode || 'en' },
        },
      };
    } else if (templateType === 'image' && imageUrl) {
      requestBody = {
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: 'image',
        image: {
          link: imageUrl,
          caption: caption || message
        }
      };
    } else {
      requestBody = {
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: 'text',
        text: {
          body: message || ' '
        }
      };
    }

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

      if (response.ok) {
        results.push({
          phone: formattedPhone,
          success: true,
          messageId: data.messages?.[0]?.id,
        });

        await saveMessage({
          to: formattedPhone,
          message: resolvedTemplateContent || `[Template: ${templateName || 'unknown'}]`,
          status: 'sent',
          wamid: data.messages?.[0]?.id,
          templateName,
        });
      } else {
        results.push({
          phone: formattedPhone,
          success: false,
          error: data.error?.message || 'Failed to send',
        });
      }
    } catch (error: any) {
      results.push({
        phone: formattedPhone,
        success: false,
        error: error.message,
      });
    }

    await new Promise(resolve => setTimeout(resolve, 200));
  }

  const successCount = results.filter(r => r.success).length;

  return NextResponse.json({
    success: true,
    total: contacts.length,
    sent: successCount,
    failed: contacts.length - successCount,
    results,
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
