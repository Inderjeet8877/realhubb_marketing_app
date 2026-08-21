// Shared constants/helpers for the backend broadcast job (start → process → cancel).
// Not a route file itself (underscore prefix keeps Next.js from treating it as one).

export const CHUNK_SIZE = 10;
export const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0';

export function getBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

// Fires the next worker invocation without the caller waiting for the whole
// remaining chain to finish — each hop only waits for the next one to accept
// the request and return, not for every chunk after that. Guarded by a shared
// secret so this internal endpoint can't be triggered by outside requests to
// spam sends on this account's Meta bill.
export async function triggerWorker(broadcastId: string) {
  const baseUrl = getBaseUrl();
  try {
    await fetch(`${baseUrl}/api/whatsapp/broadcasts/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET || '',
      },
      body: JSON.stringify({ broadcastId }),
    });
  } catch (err) {
    console.error('[Broadcast Worker] Failed to trigger next chunk:', err);
  }
}

export interface SendConfig {
  message: string | null;
  templateContent: string | null;
  accountId: string;
  imageUrl: string | null;
  caption: string | null;
  templateName: string | null;
  languageCode: string;
  templateHeaderType: string | null;
  templateHeaderContent: string | null;
  isTemplate: boolean;
}

export function buildMetaRequestBody(
  to: string,
  config: SendConfig
): Record<string, unknown> {
  if (config.isTemplate) {
    const tName = (config.templateName || 'hello_world').trim();
    const components: any[] = [];
    if (config.templateHeaderType === 'image' && config.templateHeaderContent) {
      components.push({ type: 'header', parameters: [{ type: 'image', image: { link: config.templateHeaderContent } }] });
    } else if (config.templateHeaderType === 'video' && config.templateHeaderContent) {
      components.push({ type: 'header', parameters: [{ type: 'video', video: { link: config.templateHeaderContent } }] });
    } else if (config.templateHeaderType === 'document' && config.templateHeaderContent) {
      components.push({ type: 'header', parameters: [{ type: 'document', document: { link: config.templateHeaderContent } }] });
    }
    return {
      messaging_product: 'whatsapp', to, type: 'template',
      template: { name: tName, language: { code: config.languageCode }, ...(components.length > 0 && { components }) },
    };
  }
  if (config.imageUrl) {
    return {
      messaging_product: 'whatsapp', to, type: 'image',
      image: { link: config.imageUrl, caption: config.caption || config.message || '' },
    };
  }
  return {
    messaging_product: 'whatsapp', to, type: 'text',
    text: { body: config.message || ' ' },
  };
}

export function getMetaCredentials(accountId: string) {
  const accountNum = (accountId === '2' || accountId === '3') ? accountId : '1';
  const accessToken = process.env[`META_ACCESS_TOKEN_${accountNum}`] || process.env.META_ACCESS_TOKEN_1;
  const phoneNumberId = process.env[`WHATSAPP_PHONE_NUMBER_ID_${accountNum}`] || process.env.WHATSAPP_PHONE_NUMBER_ID_1;
  return { accessToken, phoneNumberId };
}
