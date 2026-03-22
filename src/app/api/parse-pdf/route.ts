import { NextRequest, NextResponse } from 'next/server';
import { parsePdfFromFile } from '@/lib/parsers/pdf';

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_PAGES = 50;

function getCorsHeaders(request: NextRequest) {
  const origin = request.headers.get('origin');
  const allowedOrigin = process.env.ALLOWED_ORIGIN;

  return {
    'Access-Control-Allow-Origin': allowedOrigin === '*' ? '*' : origin || allowedOrigin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...getCorsHeaders(request),
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function POST(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request);

  try {
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: corsHeaders });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: 'Invalid form data' },
        { status: 400, headers: corsHeaders }
      );
    }

    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'PDF file is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!file.name.toLowerCase().endsWith('.pdf') && !file.type.includes('pdf')) {
      return NextResponse.json(
        { error: 'File must be a PDF' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
        { status: 400, headers: corsHeaders }
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: 'File is empty' },
        { status: 400, headers: corsHeaders }
      );
    }

    const result = await parsePdfFromFile(file, {
      maxPages: MAX_PAGES,
      maxTextLength: 100_000,
      preserveParagraphs: true,
    });

    return NextResponse.json(
      {
        success: true,
        id: crypto.randomUUID(),
        title: file.name.replace(/\.pdf$/i, ''),
        fileName: file.name,
        fileSize: file.size,
        text: result.text,
        paragraphs: result.paragraphs,
        metadata: {
          ...result.metadata,
          pageCount: result.pageCount,
          processedPages: result.processedPages,
        },
        stats: {
          wordCount: result.wordCount,
          charCount: result.charCount,
          readTime: result.readTime,
          pageCount: result.pageCount,
        },
        warnings: result.warnings,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err: any) {
    console.error('[parse-pdf] Error:', err);

    const errorMessage = err.message || 'Failed to parse PDF';

    if (errorMessage.includes('too large')) {
      return NextResponse.json({ error: errorMessage }, { status: 400, headers: corsHeaders });
    }

    if (errorMessage.includes('empty') || errorMessage.includes('no extractable')) {
      return NextResponse.json({ error: errorMessage }, { status: 422, headers: corsHeaders });
    }

    return NextResponse.json(
      { error: 'Internal server error while parsing PDF.' },
      { status: 500, headers: corsHeaders }
    );
  }
}
