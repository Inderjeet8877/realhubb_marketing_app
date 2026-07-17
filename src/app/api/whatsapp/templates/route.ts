import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';

const WHATSAPP_API_URL = 'https://graph.facebook.com/v22.0';

/**
 * Upload an image/video/document to Meta's Resumable Upload API
 * and return the media handle (required for template header examples).
 */
/**
 * Upload media to Meta using the Resumable Upload API.
 * Requires META_APP_ID — the App ID (not WABA ID).
 * Uses per-account META_APP_ID_1, META_APP_ID_2, META_APP_ID_3.
 */
interface MediaHandleResult {
  handle: string | null;
  error: string | null;
}

async function uploadMediaHandle(
  imageUrl: string,
  accessToken: string,
  accountId: string = '1',
): Promise<MediaHandleResult> {
  const appIdMap: Record<string, string | undefined> = {
    '1': process.env.META_APP_ID,
    '2': process.env.META_APP_ID_2,
    '3': process.env.META_APP_ID_3,
  };
  const appId = appIdMap[accountId] || appIdMap['1'];
  if (!appId) {
    return { handle: null, error: 'META_APP_ID is not configured for this account — cannot upload header media.' };
  }

  try {
    // 1. Download the image from its public URL
    const fileRes = await fetch(imageUrl);
    if (!fileRes.ok) {
      return { handle: null, error: `Could not download the header image from ${imageUrl} (HTTP ${fileRes.status}).` };
    }
    const buffer    = Buffer.from(await fileRes.arrayBuffer());
    const mimeType  = fileRes.headers.get('content-type') || 'image/jpeg';
    const fileSize  = buffer.length;
    console.log(`[upload] size=${fileSize} type=${mimeType}`);

    // 2. Create upload session  →  POST /{app-id}/uploads
    const sessionRes  = await fetch(
      `${WHATSAPP_API_URL}/${appId}/uploads` +
      `?file_length=${fileSize}&file_type=${encodeURIComponent(mimeType)}&access_token=${accessToken}`,
      { method: 'POST' },
    );
    const sessionData = await sessionRes.json();
    console.log('[upload] session:', JSON.stringify(sessionData));
    const uploadId: string = sessionData.id; // "upload:XXXXX"
    if (!uploadId) {
      const metaMsg = sessionData?.error?.message || JSON.stringify(sessionData);
      return { handle: null, error: `Meta rejected the upload session: ${metaMsg}` };
    }

    // 3. Upload binary  →  POST /{upload-id}
    const uploadRes  = await fetch(`${WHATSAPP_API_URL}/${uploadId}`, {
      method:  'POST',
      headers: {
        Authorization:  `OAuth ${accessToken}`,
        file_offset:    '0',
        'Content-Type': mimeType,
      },
      body: buffer,
    });
    const uploadData = await uploadRes.json();
    console.log('[upload] result:', JSON.stringify(uploadData));
    if (!uploadData.h) {
      const metaMsg = uploadData?.error?.message || JSON.stringify(uploadData);
      return { handle: null, error: `Meta rejected the media upload: ${metaMsg}` };
    }
    return { handle: uploadData.h, error: null }; // "4::aGFz..."
  } catch (err: any) {
    return { handle: null, error: `Header media upload failed: ${err.message || err}` };
  }
}

const EXPECTED_CONTENT_TYPE: Record<string, string> = {
  image: 'image/',
  video: 'video/',
};

// A header media URL that isn't a real, publicly-fetchable file causes the exact
// failure mode this app kept hitting: Meta's send API accepts the call (returns a
// wamid) and then never delivers it, with no error anywhere. Catch that at save
// time instead — e.g. a Cloudinary *console* thumbnail link (res-console.cloudinary.com)
// looks like a URL but 401s for anyone without a logged-in session, Meta included.
async function validateHeaderMediaUrl(url: string, headerType: string): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
  } catch (err: any) {
    return `Could not reach ${url}: ${err.message || err}`;
  }
  if (!res.ok && res.status !== 206) {
    return `${url} returned HTTP ${res.status} — it must be a public, direct file URL (not a login-gated dashboard/console link).`;
  }
  const contentType = res.headers.get('content-type') || '';
  const expected = EXPECTED_CONTENT_TYPE[headerType];
  if (expected && !contentType.startsWith(expected)) {
    return `${url} did not return a ${headerType} file (got content-type "${contentType}"). Use the "Upload to Cloudinary" button instead of pasting a URL copied from a dashboard.`;
  }
  return null;
}

function normalizePhoneNumber(phone: string): string | null {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/[^\d]/g, '');
  const hadPlus = phone.trim().startsWith('+');
  if (hadPlus) return '+' + digits;
  return '+' + digits;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const syncFromMeta = url.searchParams.get('syncFromMeta') === 'true';
  
  // If syncFromMeta=true, fetch ALL templates from Meta and save to Firestore
  if (syncFromMeta) {
    const accessToken = process.env.META_ACCESS_TOKEN_1;
    const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID_1;
    
    if (!accessToken || !businessAccountId) {
      return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 500 });
    }
    
    try {
      // Fetch ALL templates from Meta (paginated)
      let allMetaTemplates: any[] = [];
      let nextPage: string | null = `${WHATSAPP_API_URL}/${businessAccountId}/message_templates?access_token=${accessToken}`;
      
      while (nextPage) {
        const metaRes: any = await fetch(nextPage);
        const metaData: any = await metaRes.json();
        
        if (metaData.data && Array.isArray(metaData.data)) {
          allMetaTemplates = [...allMetaTemplates, ...metaData.data];
        }
        
        // Check for next page
        nextPage = metaData.paging?.cursors?.after 
          ? `${WHATSAPP_API_URL}/${businessAccountId}/message_templates?access_token=${accessToken}&after=${metaData.paging.cursors.after}`
          : null;
      }
      
      console.log('Fetching templates from Meta, count:', allMetaTemplates.length);
      
      // Upsert each template — update existing, create only if new
      let savedCount = 0;
      let updatedCount = 0;

      for (const mt of allMetaTemplates) {
        try {
          // Parse components
          const headerComp = mt.components?.find((c: any) => c.type === 'HEADER');
          let headerType = 'none';
          if (headerComp) {
            if (headerComp.format === 'IMAGE')    headerType = 'image';
            else if (headerComp.format === 'VIDEO')    headerType = 'video';
            else if (headerComp.format === 'DOCUMENT') headerType = 'document';
            else if (headerComp.format === 'TEXT')     headerType = 'text';
          }

          const bodyComp    = mt.components?.find((c: any) => c.type === 'BODY');
          const footerComp  = mt.components?.find((c: any) => c.type === 'FOOTER');
          const buttonsComp = mt.components?.find((c: any) => c.type === 'BUTTONS');

          const content      = bodyComp?.text || '';
          const footerContent = footerComp?.text || '';
          const buttons = (buttonsComp?.buttons || []).map((b: any) => {
            if (b.type === 'URL')          return { type: 'URL',   text: b.text, url: b.url };
            if (b.type === 'PHONE_NUMBER') return { type: 'PHONE', text: b.text, phone_number: b.phone_number };
            return { type: 'QUICK_REPLY', text: b.text };
          });

          const status = mt.status === 'APPROVED' ? 'approved'
            : mt.status === 'REJECTED' ? 'rejected' : 'pending';

          const templateData = {
            name: mt.name,
            language: mt.language || 'en',
            category: mt.category || 'MARKETING',
            content,
            headerType,
            footerContent,
            buttons,
            approvalStatus: status,
            metaTemplateId: mt.id,
          };

          // Check by metaTemplateId first, then by name — UPDATE if exists, CREATE if not
          let existingSnap = await adminDb
            .collection('whatsapp_templates')
            .where('metaTemplateId', '==', mt.id)
            .limit(1).get();

          if (existingSnap.empty) {
            existingSnap = await adminDb
              .collection('whatsapp_templates')
              .where('name', '==', mt.name)
              .limit(1).get();
          }

          if (!existingSnap.empty) {
            // Update — but preserve headerContent (user may have added image URL manually)
            const existing = existingSnap.docs[0].data();
            await existingSnap.docs[0].ref.update({
              ...templateData,
              // Keep existing headerContent if present, otherwise empty
              headerContent: existing.headerContent || '',
              updatedAt: FieldValue.serverTimestamp(),
            });
            updatedCount++;
          } else {
            await adminDb.collection('whatsapp_templates').add({
              ...templateData,
              headerContent: '',
              createdAt: FieldValue.serverTimestamp(),
            });
            savedCount++;
          }
        } catch (saveError) {
          console.error('Error syncing template:', mt.name, saveError);
        }
      }

      return NextResponse.json({
        success: true,
        message: `Sync complete: ${savedCount} new, ${updatedCount} updated`,
        new: savedCount,
        updated: updatedCount,
        total: allMetaTemplates.length,
      });
      
    } catch (error) {
      console.error('Meta sync error:', error);
      return NextResponse.json({ error: String(error) }, { status: 500 });
    }
  }
  
  // GET — Meta is the source of truth; Firestore only provides saved image URLs
  const accountId = url.searchParams.get('account_id') || '1';

  // Server-side token lookup
  const tokenMap: Record<string, string | undefined> = {
    '1': process.env.META_ACCESS_TOKEN_1,
    '2': process.env.META_ACCESS_TOKEN_2,
    '3': process.env.META_ACCESS_TOKEN_3,
  };
  const accessToken = tokenMap[accountId] || null;

  const businessAccountId = process.env[`WHATSAPP_BUSINESS_ACCOUNT_ID_${accountId}`] || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID_1;

  if (!accessToken || !businessAccountId) {
    return NextResponse.json({ error: 'WhatsApp not configured', templates: [] }, { status: 500 });
  }

  try {
    // 1. Fetch all templates from Meta (with pagination)
    let metaTemplates: any[] = [];
    let nextUrl: string | null =
      `${WHATSAPP_API_URL}/${businessAccountId}/message_templates?access_token=${accessToken}&limit=100`;

    while (nextUrl) {
      const res: Response = await fetch(nextUrl);
      const data: any = await res.json();
      if (data.error) {
        const metaError = data.error;
        console.error('[Templates GET] Meta error:', metaError);
        return NextResponse.json(
          {
            error: `Meta error (${metaError.code}): ${metaError.message}`,
            templates: [],
          },
          { status: 502 }
        );
      }
      if (data.data) metaTemplates = [...metaTemplates, ...data.data];
      nextUrl = data.paging?.next || null;
    }

    // 2. Load Firestore docs keyed by metaTemplateId and name (for headerContent lookup)
    const fsSnap = await adminDb.collection('whatsapp_templates').get();
    const fsById   = new Map<string, any>();
    const fsByName = new Map<string, any>();
    fsSnap.docs.forEach(doc => {
      const d = doc.data();
      const row = { id: doc.id, ...d };
      if (d.metaTemplateId) fsById.set(d.metaTemplateId, row);
      if (d.name)           fsByName.set(d.name, row);
    });

    // 3. Build response from Meta data only (nothing extra from Firestore)
    const templates = metaTemplates.map((mt: any) => {
      const fs = fsById.get(mt.id) || fsByName.get(mt.name) || {};

      const headerComp  = mt.components?.find((c: any) => c.type === 'HEADER');
      const bodyComp    = mt.components?.find((c: any) => c.type === 'BODY');
      const footerComp  = mt.components?.find((c: any) => c.type === 'FOOTER');
      const buttonsComp = mt.components?.find((c: any) => c.type === 'BUTTONS');

      const headerType =
        !headerComp ? 'none' :
        headerComp.format === 'IMAGE'    ? 'image' :
        headerComp.format === 'VIDEO'    ? 'video' :
        headerComp.format === 'DOCUMENT' ? 'document' : 'text';

      const approvalStatus =
        mt.status === 'APPROVED' ? 'approved' :
        mt.status === 'REJECTED' ? 'rejected' : 'pending';

      const buttons = (buttonsComp?.buttons || []).map((b: any) => {
        if (b.type === 'URL')          return { type: 'URL',   text: b.text, url: b.url };
        if (b.type === 'PHONE_NUMBER') return { type: 'PHONE', text: b.text, phone_number: b.phone_number };
        return { type: 'QUICK_REPLY', text: b.text };
      });

      return {
        id: fs.id || mt.id,           // Firestore doc id if exists (for edit/delete)
        name: mt.name,
        language: mt.language || 'en',
        category: mt.category || 'MARKETING',
        content: bodyComp?.text || '',
        headerType,
        headerContent: fs.headerContent || '', // Only from Firestore (user-saved image URL)
        footerContent: footerComp?.text || '',
        buttons,
        approvalStatus,
        metaTemplateId: mt.id,
        createdAt: fs.createdAt?.toDate?.() || new Date(),
      };
    });

    return NextResponse.json({ success: true, templates });
  } catch (error: any) {
    console.error('Templates fetch error:', error);
    return NextResponse.json({ error: error.message, templates: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, language, category, content, headerType, headerContent, footerContent, buttons, accountId } = body;

    console.log('Template creation payload:', { name, language, category, content, accountId });

    if (!name || !content) {
      return NextResponse.json(
        { error: 'Template name and content are required' },
        { status: 400 }
      );
    }

    const accountNum = (accountId === '2' || accountId === '3') ? accountId : '1';
    const accessToken = process.env[`META_ACCESS_TOKEN_${accountNum}`];
    const businessAccountId = process.env[`WHATSAPP_BUSINESS_ACCOUNT_ID_${accountNum}`];

    if (!accessToken || !businessAccountId) {
      return NextResponse.json(
        { error: 'WhatsApp not configured' },
        { status: 500 }
      );
    }

    // Sanitise name: lowercase, a-z/0-9/underscore only, must start with a letter
    const safeName = name
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^[^a-z]+/, '');          // strip leading non-alpha chars

    if (!safeName) {
      return NextResponse.json({ error: 'Template name must start with a letter' }, { status: 400 });
    }

    // ── Build components ────────────────────────────────────────────────
const components: any[] = [];

    // HEADER — IMAGE/VIDEO/DOCUMENT headers require a header_handle from Meta's upload API
    if (headerType && headerType !== 'none') {
      const headerUpper = headerType.toUpperCase();

      if ((headerUpper === 'IMAGE' || headerUpper === 'VIDEO' || headerUpper === 'DOCUMENT') && headerContent) {
        const { handle, error: uploadError } = await uploadMediaHandle(headerContent, accessToken, accountNum);
        if (!handle) {
          // Don't silently create a headerless template — the user explicitly chose a media header.
          return NextResponse.json(
            { error: `Header ${headerType} upload failed: ${uploadError || 'unknown error'}` },
            { status: 502 }
          );
        }
        components.push({
          type: 'HEADER',
          format: headerUpper,
          example: { header_handle: [handle] },
        });
      } else if (headerUpper === 'TEXT' && headerContent) {
        components.push({ 
          type: 'HEADER', 
          format: headerUpper,
          text: headerContent.slice(0, 60)
        });
      }
    }

    // BODY — use body_text example for any {{...}} variables
    const bodyComponent: any = { type: 'BODY', text: content };
    const allParams = content.match(/\{\{[^}]+\}\}/g) || [];
    if (allParams.length > 0) {
      // Meta only accepts body_text: [["val1","val2",...]] format
      bodyComponent.example = {
        body_text: [allParams.map((_: string, i: number) => `sample${i + 1}`)],
      };
    }
    components.push(bodyComponent);

    // FOOTER
    if (footerContent?.trim()) {
      components.push({ type: 'FOOTER', text: footerContent.trim() });
    }

    // BUTTONS - only include buttons with required fields
    if (buttons && buttons.length > 0) {
      const buttonComponents = buttons
        .filter((btn: any) => btn.text?.trim())          // skip empty buttons
        .map((btn: any) => {
          if (btn.type === 'URL') {
            if (!btn.url?.trim()) return null;  // Skip URL button without URL
            return { type: 'URL', text: btn.text, url: btn.url };
          }
          if (btn.type === 'PHONE') {
            if (!btn.phone_number?.trim()) return null;
            const normalizedPhone = normalizePhoneNumber(btn.phone_number);
            if (!normalizedPhone) return null;
            return { type: 'PHONE_NUMBER', text: btn.text, phone_number: normalizedPhone };
          }
          return { type: 'QUICK_REPLY', text: btn.text };
        })
        .filter(Boolean);  // Remove null entries
      
      if (buttonComponents.length > 0) {
        components.push({ type: 'BUTTONS', buttons: buttonComponents });
      }
    }

    const templatePayload = {
      name: safeName,
      language: language || 'en_US',
      category: category || 'MARKETING',
      components,
    };

    console.log('[Template] Payload →', JSON.stringify(templatePayload));

    const metaResponse = await fetch(
      `${WHATSAPP_API_URL}/${businessAccountId}/message_templates`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(templatePayload),
      }
    );

    console.log('Meta response status:', metaResponse.status);
    const metaData = await metaResponse.json();
    console.log('Meta response:', JSON.stringify(metaData, null, 2));

    let approvalStatus = 'none';
    let metaTemplateId = '';
    let errorMessage = '';

    if (metaResponse.ok && metaData.id) {
      // Template was created but needs review
      approvalStatus = 'pending';
      metaTemplateId = metaData.id;
    } else if (metaData.error) {
      // Return detailed Meta error
      const metaError = metaData.error;
      errorMessage = `Meta error (${metaError.code}): ${metaError.message}`;
      if (metaError.error_data) {
        errorMessage += ` - Field: ${metaError.error_data.param}, Issue: ${metaError.error_data.detail}`;
      }
      
      // Check if template already exists (error code 10000 or message contains 'already exists')
      if (metaData.error.code === 10000 || metaData.error.message?.includes('already exists')) {
        // Try to find existing template - search by name
        try {
          const searchResponse = await fetch(
            `${WHATSAPP_API_URL}/${businessAccountId}/message_templates?name=${safeName}&access_token=${accessToken}`
          );
          const searchData = await searchResponse.json();
          if (searchData.data && searchData.data.length > 0) {
            const existingMeta = searchData.data[0];
            metaTemplateId = existingMeta.id;
            // Map Meta status to our status
            const metaStatus = existingMeta.status; // APPROVED, PENDING, INCOMPLETE, etc.
            if (metaStatus === 'APPROVED') {
              approvalStatus = 'approved';
            } else if (metaStatus === 'PENDING') {
              approvalStatus = 'pending'; 
            } else {
              // NOT_SUBMITTED, INCOMPLETE, or any other status - treat as pending for now
              approvalStatus = 'pending';
            }
            console.log('Found existing Meta template:', metaStatus, '-> mapped to:', approvalStatus);
          }
        } catch (searchError) {
          console.error('Search error:', searchError);
        }
      }
      
      console.error('Meta API error:', errorMessage);
    }

    // Save to Firestore if Meta accepted OR found existing with any status
    let savedTemplateId = null;
    if (metaTemplateId || approvalStatus === 'pending' || approvalStatus !== 'none') {
      // This includes: pending (submitted to Meta), found existing, approved, etc.
      try {
        const docRef = await adminDb.collection('whatsapp_templates').add({
          name: safeName,
          language: language || 'en_US',
          category: category || 'MARKETING',
          content,
          headerType: headerType || 'none',
          headerContent: headerContent || '',
          footerContent: footerContent || '',
          buttons: buttons || [],
          approvalStatus,
          metaTemplateId,
          metaError: errorMessage || null,  // Store error if any for reference
          createdAt: FieldValue.serverTimestamp(),
        });
        savedTemplateId = docRef?.id;
      } catch (saveErr) {
        console.error('Firestore save error:', saveErr);
      }
    }

    return NextResponse.json({
      success: !!(metaTemplateId || approvalStatus !== 'none'),  // Success if Meta accepted OR found existing
      template: (metaTemplateId || approvalStatus !== 'none') 
        ? { id: savedTemplateId, name, metaTemplateId, approvalStatus } 
        : null,
      message: metaTemplateId 
        ? (approvalStatus === 'approved' ? 'Template approved and ready!' : 'Template submitted for Meta review.')
        : (approvalStatus !== 'none'
            ? 'Template already exists on Meta. Saved locally with status: ' + approvalStatus
            : errorMessage || 'Failed to create on Meta')
    });
  } catch (err) {
    console.error('Template creation error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, name, language, category, content, headerType, headerContent, footerContent, buttons } = body;

    if (!id) return NextResponse.json({ error: 'Template ID required' }, { status: 400 });

    if (headerContent && ['image', 'video', 'document'].includes(headerType)) {
      const validationError = await validateHeaderMediaUrl(headerContent, headerType);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }
    }

    // Templates fetched live from Meta (never created through this app) have no
    // Firestore doc yet — their "id" is Meta's template id. Upsert instead of
    // update() so attaching a header image to one of these doesn't 404.
    const docRef = adminDb.collection('whatsapp_templates').doc(id);
    const existing = await docRef.get();
    const metaTemplateId = existing.exists ? (existing.data()?.metaTemplateId || id) : id;

    await docRef.set({
      name: (name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      language: language || 'en',
      category: category || 'MARKETING',
      content,
      headerType: headerType || 'none',
      headerContent: headerContent || '',
      footerContent: footerContent || '',
      buttons: buttons || [],
      metaTemplateId,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ success: true, message: 'Template updated successfully' });
  } catch (error: any) {
    console.error('Template update error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { ids } = await request.json();
    if (!ids || !Array.isArray(ids)) {
      return NextResponse.json({ error: 'No IDs provided' }, { status: 400 });
    }
    for (const id of ids) {
      await adminDb.collection('whatsapp_templates').doc(id).delete();
    }
    return NextResponse.json({ success: true, message: `Deleted ${ids.length} template(s)` });
  } catch (error: any) {
    console.error('Template delete error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
