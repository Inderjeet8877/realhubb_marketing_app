import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const reqFormData = await request.formData();
    const file = reqFormData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;

    console.log('Cloudinary config:', { cloudName, uploadPreset: uploadPreset ? 'set' : 'missing' });

    if (!cloudName || !uploadPreset) {
      return NextResponse.json(
        { error: 'Cloudinary not configured. Please add NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET to .env.local' },
        { status: 500 }
      );
    }

    console.log('Uploading file:', file.name, file.type, file.size);

    // Generate a unique ID without any special chars
    const uniqueId = `wts${Date.now()}${Math.random().toString(36).substring(2, 8)}`;

    // Create form data for Cloudinary
    const cloudFormData = new FormData();
    cloudFormData.append('file', file);
    cloudFormData.append('upload_preset', uploadPreset);
    cloudFormData.append('public_id', uniqueId);

    console.log('Sending to Cloudinary:', { cloudName, uploadPreset, uniqueId });

    // Upload to Cloudinary using FormData
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: 'POST',
        body: cloudFormData,
      }
    );

    const data = await response.json();

    console.log('Cloudinary response status:', response.status);
    console.log('Cloudinary response:', JSON.stringify(data));

    if (!response.ok || data.error) {
      const errorMsg = data.error?.message || JSON.stringify(data.error) || 'Upload failed';
      console.error('Cloudinary error:', errorMsg);
      return NextResponse.json(
        { error: errorMsg },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      url: data.secure_url,
      publicId: data.public_id,
    });
  } catch (error: any) {
    console.error('Cloudinary upload error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload image' },
      { status: 500 }
    );
  }
}
