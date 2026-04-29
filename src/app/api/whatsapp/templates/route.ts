import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';

const WHATSAPP_API_URL = 'https://graph.facebook.com/v22.0';

interface WhatsAppTemplate {
  id?: string;
  name: string;
  language: string;
  category: string;
  content: string;
  headerType?: 'text' | 'image' | 'video' | 'document';
  headerContent?: string;
  footerContent?: string;
  buttons?: { type: string; text: string; url?: string; phone_number?: string }[];
  approvalStatus: 'pending' | 'approved' | 'rejected' | 'none';
  metaTemplateId?: string;
  createdAt: any;
}

export async function GET() {
  try {
    const snapshot = await adminDb
      .collection('whatsapp_templates')
      .orderBy('createdAt', 'desc')
      .get();

    let templates = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.() || new Date(),
    }));

    // Sync status from Meta
    const accessToken = process.env.META_ACCESS_TOKEN_1;
    const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID_1;

    if (accessToken && businessAccountId) {
      try {
        const metaRes = await fetch(
          `${WHATSAPP_API_URL}/${businessAccountId}/message_templates?access_token=${accessToken}`
        );
        const metaData = await metaRes.json();
        if (metaData.data && Array.isArray(metaData.data)) {
          for (const template of templates) {
            const t = template as WhatsAppTemplate;
            const mt = metaData.data.find((m: any) => m.id === t.metaTemplateId);
            if (mt && t.metaTemplateId) {
              const newStatus =
                mt.status === 'APPROVED' ? 'approved' :
                mt.status === 'REJECTED' ? 'rejected' : 'pending';
              if (newStatus !== t.approvalStatus) {
                await adminDb.collection('whatsapp_templates').doc(t.id!).update({ approvalStatus: newStatus });
                t.approvalStatus = newStatus;
              }
            }
          }
        }
      } catch (syncError) {
        console.error('Meta sync error:', syncError);
      }
    }

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
        // Send ONLY format - no example, no text field
        // This might work or might fail, but at least we try
        components.push({ 
          type: 'HEADER', 
          format: headerUpper
          // NO example field - that was causing "Invalid parameter"
        });
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

  try {
    const body = await request.json();
    const { id, name, language, category, content, headerType, headerContent, footerContent, buttons } = body;

    if (!id) return NextResponse.json({ error: 'Template ID required' }, { status: 400 });

    await adminDb.collection('whatsapp_templates').doc(id).update({
      name: (name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      language: language || 'en_US',
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
