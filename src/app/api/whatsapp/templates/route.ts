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
 */
async function uploadMediaHandle(
  imageUrl: string,
  accessToken: string,
): Promise<string | null> {
  const appId = process.env.META_APP_ID;
  if (!appId) {
    console.error('META_APP_ID env var missing — cannot upload media handle');
    return null;
  }

  try {
    // 1. Download the image from its public URL
    const fileRes = await fetch(imageUrl);
    if (!fileRes.ok) {
      console.error('Failed to download image:', fileRes.status, imageUrl);
      return null;
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
    if (!uploadId) return null;

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
    return uploadData.h || null; // "4::aGFz..."
  } catch (err) {
    console.error('[upload] error:', err);
    return null;
  }
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
  const accessToken = process.env.META_ACCESS_TOKEN_1;
  const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID_1;

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

    const accountNum = accountId === '2' ? '2' : '1';
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

    // HEADER — IMAGE header requires header_handle from Meta's upload API
    // We can't upload to Meta, so just send format only (no example)
    if (headerType && headerType !== 'none') {
      const headerUpper = headerType.toUpperCase();
      
      if (headerUpper === 'IMAGE' || headerUpper === 'VIDEO' || headerUpper === 'DOCUMENT') {
        const headerComp: any = { type: 'HEADER', format: headerUpper };
        if (headerContent) {
          const handle = await uploadMediaHandle(headerContent, accessToken);
          if (handle) {
            headerComp.example = { header_handle: [handle] };
          }
        }
        components.push(headerComp);
      } else if (headerUpper === 'TEXT' && headerContent) {
        components.push({ 
          type: 'HEADER', 
          format: headerUpper,
          text: headerContent.slice(0, 60)
        });
      }
    }

    // BODY — Meta expects named parameters format
    // Check for {{variable}} in body text
    const bodyComponent: any = { type: 'BODY', text: content };
    
    // Check for {{1}} or {{variable}} style parameters
    const namedParams = content.match(/\{\{(\w+)\}\}/g) || [];
    const positionalParams = content.match(/\{\{(\d+)\}\}/g) || [];
    
    if (namedParams.length > 0) {
      // Named format: {{variable_name}}
      const examples = namedParams.map((_: string, idx: number) => {
        const varName = _.replace(/\{\{/, '').replace(/\}\}/, '');
        return { param_name: varName, example: 'sample_' + (idx + 1) };
      });
      bodyComponent.example = { body_text_named_params: examples };
    } else if (positionalParams.length > 0) {
      // Positional format: {{1}}
      const examples = positionalParams.map((_: string, idx: number) => 'sample_' + (idx + 1));
      bodyComponent.example = { body_text: [examples] };
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
            if (!btn.phone_number?.trim()) return null;  // Skip PHONE button without phone
            return { type: 'PHONE_NUMBER', text: btn.text, phone_number: btn.phone_number };
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
      parameter_format: 'named',  // Required for named parameters like {{variable}}
      components,
    };

    console.log('Sending to Meta:', JSON.stringify(templatePayload, null, 2));

    // Log what we're sending to debug
    console.log('=== TEMPLATE CREATE DEBUG ===');
    console.log('Name:', safeName);
    console.log('Language:', language);
    console.log('Category:', category);
    console.log('HeaderType:', headerType);
    console.log('Components:', JSON.stringify(components, null, 2));

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

    await adminDb.collection('whatsapp_templates').doc(id).update({
      name: (name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      language: language || 'en',
      category: category || 'MARKETING',
      content,
      headerType: headerType || 'none',
      headerContent: headerContent || '',
      footerContent: footerContent || '',
      buttons: buttons || [],
      updatedAt: FieldValue.serverTimestamp(),
    });

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
