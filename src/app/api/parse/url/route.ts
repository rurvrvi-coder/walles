import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { parseUrl } from '@/lib/parsers/url';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, userId } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    // Check for duplicate
    if (userId) {
      const existing = await prisma.document.findFirst({
        where: { url, userId, sourceType: 'URL' },
      });

      if (existing?.textContent) {
        return NextResponse.json({
          id: existing.id,
          text: existing.textContent,
          title: existing.title,
          cached: true,
        });
      }
    }

    // Parse URL
    const { text, title } = await parseUrl(url);

    // Hash for deduplication
    const contentHash = crypto.createHash('sha256').update(text).digest('hex');

    // Save to database
    const document = await prisma.document.create({
      data: {
        url,
        title,
        sourceType: 'URL',
        textContent: text,
        rawContentHash: contentHash,
        parsedAt: new Date(),
        userId: userId || null,
      },
    });

    return NextResponse.json({
      id: document.id,
      text: document.textContent,
      title: document.title,
      cached: false,
    });
  } catch (error: any) {
    console.error('URL parse error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to parse URL' },
      { status: 500 }
    );
  }
}

// GET /api/parse/url - Check if URL exists
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL required' }, { status: 400 });
  }

  const document = await prisma.document.findFirst({
    where: { url, sourceType: 'URL' },
    select: { id: true, textContent: true, title: true, createdAt: true },
  });

  return NextResponse.json(document || null);
}
