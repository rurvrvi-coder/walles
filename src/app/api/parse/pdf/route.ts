import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { parsePdf } from '@/lib/parsers/pdf';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const userId = formData.get('userId') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: 'PDF file is required' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { text, pageCount } = await parsePdf(buffer);

    // Hash for deduplication
    const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Check for duplicate
    if (userId) {
      const existing = await prisma.document.findFirst({
        where: { rawContentHash: contentHash, userId, sourceType: 'PDF' },
      });

      if (existing?.textContent) {
        return NextResponse.json({
          id: existing.id,
          text: existing.textContent,
          title: existing.title,
          pageCount: existing.pageCount,
          cached: true,
        });
      }
    }

    // Save to database
    const document = await prisma.document.create({
      data: {
        title: file.name.replace('.pdf', ''),
        sourceType: 'PDF',
        mimeType: 'application/pdf',
        textContent: text,
        rawContentHash: contentHash,
        pageCount,
        fileSize: buffer.length,
        parsedAt: new Date(),
        userId: userId || null,
      },
    });

    return NextResponse.json({
      id: document.id,
      text: document.textContent,
      title: document.title,
      pageCount: document.pageCount,
      cached: false,
    });
  } catch (error: any) {
    console.error('PDF parse error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to parse PDF' },
      { status: 500 }
    );
  }
}
