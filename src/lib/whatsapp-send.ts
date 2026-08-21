// Single source of truth for talking to Meta's WhatsApp Cloud API — used by
// the 1:1 chat send route, the legacy inline bulk-send path, and the backend
// broadcast worker. Previously each of those three built its own copy of
// this request-body/validation logic; keeping it in one place means a future
// fix (a new header type, a Meta API change) can't silently apply to some
// send paths and not others.

export const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0';

export interface SendConfig {
  message?: string | null;
  templateContent?: string | null;
  accountId?: string | null;
  imageUrl?: string | null;
  caption?: string | null;
  templateName?: string | null;
  languageCode?: string | null;
  templateHeaderType?: string | null;
  templateHeaderContent?: string | null;
  isTemplate?: boolean;
}

export function getMetaCredentials(accountId?: string | null) {
  const accountNum = (accountId === '2' || accountId === '3') ? accountId : '1';
  const accessToken = process.env[`META_ACCESS_TOKEN_${accountNum}`] || process.env.META_ACCESS_TOKEN_1;
  const phoneNumberId = process.env[`WHATSAPP_PHONE_NUMBER_ID_${accountNum}`] || process.env.WHATSAPP_PHONE_NUMBER_ID_1;
  return { accountNum, accessToken, phoneNumberId };
}

export function buildMetaRequestBody(to: string, config: SendConfig): Record<string, unknown> {
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
      template: { name: tName, language: { code: config.languageCode || 'en' }, ...(components.length > 0 && { components }) },
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

// A template approved with a media header REQUIRES that header parameter on
// every send — Meta silently accepts the call and never delivers it if it's
// missing, with no error anywhere. Reject up front instead of burning sends
// (or a whole broadcast) on messages that can never arrive.
export function validateTemplateHeaderMedia(
  templateName: string | null | undefined,
  templateHeaderType: string | null | undefined,
  templateHeaderContent: string | null | undefined
): string | null {
  if (!['image', 'video', 'document'].includes(templateHeaderType || '')) return null;

  if (!templateHeaderContent) {
    return `Template "${templateName}" has a ${templateHeaderType} header but no media URL was provided. ` +
      `Attach the ${templateHeaderType} on the Templates page before sending.`;
  }
  try {
    new URL(templateHeaderContent);
    return null;
  } catch {
    return `The ${templateHeaderType} header value "${templateHeaderContent}" is not a valid URL.`;
  }
}

// Meta error codes/subcodes that mean "you're being throttled, try again
// shortly" — genuinely worth a retry with backoff.
export const RATE_LIMIT_ERROR_CODES = new Set([4, 130429]);

// Meta error codes/subcodes that mean "you've hit your account/number's
// messaging limit" — NOT transient. Retrying (or continuing to send more of
// the same broadcast) will not succeed; every remaining contact will fail
// identically until the limit resets. Distinguished from rate limiting so
// the broadcast worker can stop the job cleanly instead of burning through
// the rest of the list on guaranteed failures.
export const MESSAGING_LIMIT_ERROR_CODES = new Set([131048, 131056, 131031]);
