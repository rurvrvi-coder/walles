import { NextRequest, NextResponse } from 'next/server';
import { parsePdf } from '@/lib/parsers/pdf';
import { cleanText } from '@/lib/parsers/textCleaner';
import { extractEpub, chunkText, getFullText, getChaptersText, extractAndChunkEpub } from '@/lib/parsers/epub';

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const SUPPORTED_TYPES = ['application/pdf', 'text/plain', 'application/epub+zip'];

function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function extractTextFromTxt(buffer: Buffer): { text: string; metadata: Record<string, unknown> } {
  const text = buffer.toString('utf-8');
  const lines = text.split('\n');
  const title = lines[0]?.trim() || 'Untitled';

  return {
    text,
    metadata: { title, lines: lines.length },
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() });
}

export async function POST(request: NextRequest) {
  try {
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: getCorsHeaders() });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: 'Invalid form data' },
        { status: 400, headers: getCorsHeaders() }
      );
    }

    const file = formData.get('file') as File | null;
    const optionsStr = formData.get('options') as string | null;
    const options = optionsStr ? JSON.parse(optionsStr) : {};

    if (!file) {
      return NextResponse.json(
        { error: 'File is required' },
        { status: 400, headers: getCorsHeaders() }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
        { status: 400, headers: getCorsHeaders() }
      );
    }

    if (!SUPPORTED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Supported: PDF, TXT, EPUB` },
        { status: 400, headers: getCorsHeaders() }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name.toLowerCase();
    let extractedText = '';
    let metadata: Record<string, unknown> = {};
    let epubData = null;

    if (fileName.endsWith('.pdf') || file.type === 'application/pdf') {
      const result = await parsePdf(buffer);
      extractedText = result.text;
      metadata = {
        title: file.name.replace(/\.pdf$/i, ''),
        pageCount: result.pageCount,
        processedPages: result.processedPages,
      };
    } else if (fileName.endsWith('.epub') || file.type === 'application/epub+zip') {
      const epubResult = await extractAndChunkEpub(buffer, {
        maxChunkSize: options.maxChunkSize || 5000,
        overlapWords: options.overlapWords || 200,
      });

      epubData = {
        metadata: epubResult.metadata,
        chapters: epubResult.chunks.map(c => ({ 
          title: undefined, 
          text: c.text 
        })),
        stats: epubResult.stats,
      };

      extractedText = epubResult.fullText;
      metadata = epubResult.metadata;
    } else if (fileName.endsWith('.txt') || file.type === 'text/plain') {
      const result = extractTextFromTxt(buffer);
      extractedText = result.text;
      metadata = result.metadata;
    }

    if (!extractedText || extractedText.length < 50) {
      return NextResponse.json(
        { error: 'Could not extract text from file. File might be empty or corrupted.' },
        { status: 422, headers: getCorsHeaders() }
      );
    }

    const cleaned = cleanText(extractedText);
    const finalText = cleaned.text;
    const words = finalText.split(/\s+/).filter(Boolean);

    const response: Record<string, unknown> = {
      success: true,
      id: crypto.randomUUID(),
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      text: finalText,
      metadata,
      stats: {
        wordCount: words.length,
        charCount: finalText.length,
        readTime: `${Math.ceil(words.length / 200)} min read`,
        originalLength: extractedText.length,
        cleanedChars: extractedText.length - finalText.length,
      },
      cleaned: cleaned.removedItems,
    };

    if (epubData) {
      response.epub = {
        metadata: epubData.metadata,
        chapters: epubData.chapters,
        stats: epubData.stats,
      };

      const chunks = chunkText(cleaned.text, {
        maxChunkSize: options.maxChunkSize || 5000,
        overlapWords: options.overlapWords || 200,
      });
      response.chunks = chunks;
      response.chunkCount = chunks.length;
    }

    return NextResponse.json(response, { headers: getCorsHeaders() });

  } catch (error: any) {
    console.error('[parse-file] Error:', error);

    return NextResponse.json(
      { error: error.message || 'Failed to process file' },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}
