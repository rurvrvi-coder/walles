import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

const DEFAULT_PAGE_SIZE = 20;

const modelFromDb: Record<string, string> = {
  GPT_4: 'gpt-4',
  GPT_3_5_TURBO: 'gpt-3.5-turbo',
  CLAUDE_3_OPUS: 'claude-3-opus',
  CLAUDE_3_SONNET: 'claude-3-sonnet',
};

const lengthFromDb: Record<string, string> = {
  SHORT: 'short',
  MEDIUM: 'medium',
  LONG: 'long',
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const userId = searchParams.get('userId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || String(DEFAULT_PAGE_SIZE));
    const documentId = searchParams.get('documentId');
    const model = searchParams.get('model');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const where: any = { userId };
    
    if (documentId) {
      where.documentId = documentId;
    }
    
    if (model) {
      where.model = model.toUpperCase();
    }
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [summaries, total] = await Promise.all([
      prisma.summary.findMany({
        where,
        include: {
          document: {
            select: {
              id: true,
              title: true,
              sourceType: true,
              url: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.summary.count({ where }),
    ]);

    const items = summaries.map((s: any) => ({
      id: s.id,
      summary: s.summaryText,
      model: modelFromDb[s.model] || s.model.toLowerCase(),
      length: lengthFromDb[s.length] || s.length.toLowerCase(),
      tokens: {
        input: s.promptTokens,
        output: s.completionTokens,
      },
      cost: s.totalCost,
      createdAt: s.createdAt,
      document: s.document ? {
        id: s.document.id,
        title: s.document.title,
        sourceType: s.document.sourceType.toLowerCase(),
        url: s.document.url,
      } : null,
    }));

    return NextResponse.json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('History error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch history' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const userId = searchParams.get('userId');

    if (!id || !userId) {
      return NextResponse.json({ error: 'id and userId are required' }, { status: 400 });
    }

    await prisma.summary.deleteMany({
      where: { id, userId },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete' },
      { status: 500 }
    );
  }
}
