import { NextResponse } from 'next/server';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

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
    const templatesRef = collection(db, 'whatsapp_templates');
    const q = query(templatesRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    let templates = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || new Date()
    }));

    // Try to sync status from Meta for templates that have metaTemplateId
    const accountNum = '1';
    const accessToken = process.env[`META_ACCESS_TOKEN_${accountNum}`];
    const businessAccountId = process.env[`WHATSAPP_BUSINESS_ACCOUNT_ID_${accountNum}`];

    if (accessToken && businessAccountId) {
      try {
        const metaResponse = await fetch(
          `${WHATSAPP_API_URL}/${businessAccountId}/message_templates?access_token=${accessToken}`
        );
        const metaData = await metaResponse.json();
        
        if (metaData.data && Array.isArray(metaData.data)) {
          // Update local status based on Meta status
          const metaTemplates = metaData.data;
          
          for (const template of templates) {
            const t = template as WhatsAppTemplate;
            const metaTemplate = metaTemplates.find((m: any) => m.id === t.metaTemplateId);
            if (metaTemplate && t.metaTemplateId) {
              let newStatus = t.approvalStatus;
              if (metaTemplate.status === 'APPROVED') {
                newStatus = 'approved';
              } else if (metaTemplate.status === 'REJECTED') {
                newStatus = 'rejected';
              } else if (metaTemplate.status === 'PENDING' || metaTemplate.status === 'IN_PROGRESS') {
                newStatus = 'pending';
              }
              
              if (newStatus !== t.approvalStatus) {
                await updateDoc(doc(db, 'whatsapp_templates', t.id!), {
                  approvalStatus: newStatus
                });
                t.approvalStatus = newStatus;
              }
            }
          }
        }
      } catch (syncError) {
        console.error('Error syncing with Meta:', syncError);
      }
    }

    return NextResponse.json({
      success: true,
      templates,
    });
  } catch (error: any) {
    console.error('Templates fetch error:', error);
    return NextResponse.json(
      { error: error.message, templates: [] },
      { status: 500 }
    );
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

    // Build components for Meta API
    const components: any[] = [];
    
    // Add header if exists
    if (headerType && headerType !== 'none' && headerContent) {
      if (headerType === 'text') {
        components.push({
          type: 'HEADER',
          format: 'TEXT',
          text: headerContent
        });
      } else if (headerType === 'image' || headerType === 'video' || headerType === 'document') {
        // For template creation, Meta only needs a sample URL in the example field.
        // No upload needed — the actual media is provided at send time.
        components.push({
          type: 'HEADER',
          format: headerType.toUpperCase(),
          example: {
            header_handle: [headerContent],
          },
        });
      }
    }

    // Add body — if it has {{1}}, {{2}} variables, provide example values
    const variableMatches = content.match(/\{\{\d+\}\}/g) || [];
    const bodyComponent: any = { type: 'BODY', text: content };
    if (variableMatches.length > 0) {
      bodyComponent.example = {
        body_text: [variableMatches.map((_: string, i: number) => `sample_value_${i + 1}`)],
      };
    }
    components.push(bodyComponent);

    // Add footer if exists
    if (footerContent) {
      components.push({
        type: 'FOOTER',
        text: footerContent
      });
    }

    // Add buttons if exist
    if (buttons && buttons.length > 0) {
      const buttonComponents = buttons.map((btn: any) => {
        if (btn.type === 'URL') {
          return { type: 'URL', text: btn.text, url: btn.url };
        } else if (btn.type === 'PHONE') {
          return { type: 'PHONE_NUMBER', text: btn.text, phone_number: btn.phone_number };
        } else {
          return { type: 'QUICK_REPLY', text: btn.text };
        }
      });
      components.push({
        type: 'BUTTONS',
        buttons: buttonComponents
      });
    }

    // Create template on Meta
    const metaResponse = await fetch(
      `${WHATSAPP_API_URL}/${businessAccountId}/message_templates`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
          language: language || 'en_US',
          category: category || 'MARKETING',
          components: components
        })
      }
    );

    const metaData = await metaResponse.json();
    console.log('Meta template response status:', metaResponse.status);
    console.log('Meta template response body:', JSON.stringify(metaData, null, 2));
    console.log('Components sent:', JSON.stringify(components, null, 2));

    let approvalStatus = 'none';
    let metaTemplateId = '';
    let errorMessage = '';

    if (metaResponse.ok && metaData.id) {
      // Template was created but needs review
      approvalStatus = 'pending';
      metaTemplateId = metaData.id;
    } else if (metaData.error) {
      errorMessage = metaData.error.message || JSON.stringify(metaData.error);
      
      // Check if template already exists (error code 10000)
      if (metaData.error.code === 10000 || metaData.error.message?.includes('already exists')) {
        // Try to find existing template
        try {
          const searchResponse = await fetch(
            `${WHATSAPP_API_URL}/${businessAccountId}/message_templates?name=${name.toLowerCase().replace(/\s+/g, '_')}&access_token=${accessToken}`
          );
          const searchData = await searchResponse.json();
          if (searchData.data && searchData.data.length > 0) {
            metaTemplateId = searchData.data[0].id;
            approvalStatus = searchData.data[0].status === 'APPROVED' ? 'approved' : 'pending';
          }
        } catch (searchError) {
          console.error('Search error:', searchError);
        }
      }
      
      console.error('Meta API error:', errorMessage);
    }

    // Save to Firestore
    const templatesRef = collection(db, 'whatsapp_templates');
    const docRef = await addDoc(templatesRef, {
      name: name.toLowerCase().replace(/\s+/g, '_'),
      language: language || 'en_US',
      category: category || 'MARKETING',
      content,
      headerType: headerType || 'none',
      headerContent: headerContent || '',
      footerContent: footerContent || '',
      buttons: buttons || [],
      approvalStatus,
      metaTemplateId,
      createdAt: serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      template: {
        id: docRef.id,
        name,
        language,
        category,
        content,
        approvalStatus,
        metaTemplateId
      },
      message: errorMessage || (approvalStatus === 'approved' ? 'Template approved and ready to use!' : 'Template submitted for Meta review. This may take a few hours to get approved.')
    });
  } catch (error: any) {
    console.error('Template creation error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, name, language, category, content, headerType, headerContent, footerContent, buttons } = body;

    if (!id) {
      return NextResponse.json({ error: 'Template ID required' }, { status: 400 });
    }

    const templateRef = doc(db, 'whatsapp_templates', id);
    await updateDoc(templateRef, {
      name: name.toLowerCase().replace(/\s+/g, '_'),
      language: language || 'en_US',
      category: category || 'MARKETING',
      content,
      headerType: headerType || 'none',
      headerContent: headerContent || '',
      footerContent: footerContent || '',
      buttons: buttons || [],
      updatedAt: serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      message: 'Template updated successfully'
    });
  } catch (error: any) {
    console.error('Template update error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { ids } = body;
    
    if (ids && Array.isArray(ids)) {
      for (const id of ids) {
        await deleteDoc(doc(db, 'whatsapp_templates', id));
      }
      return NextResponse.json({
        success: true,
        message: `Deleted ${ids.length} template(s)`
      });
    }

    return NextResponse.json(
      { error: 'No IDs provided' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Template delete error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
