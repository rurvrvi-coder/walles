const pdfParse = require('pdf-parse');

const MAX_PAGES = 50;
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MIN_TEXT_LENGTH = 50;
const MAX_TEXT_LENGTH = 100_000;

interface PdfMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modDate?: string;
}

interface Paragraph {
  index: number;
  text: string;
  pageNumber: number;
  charCount: number;
  wordCount: number;
}

interface ParsedPdfResult {
  text: string;
  paragraphs: Paragraph[];
  metadata: PdfMetadata;
  pageCount: number;
  processedPages: number;
  wordCount: number;
  charCount: number;
  readTime: string;
  warnings: string[];
}

function extractParagraphs(text: string, pageBreaks: number[]): Paragraph[] {
  const rawParagraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length >= MIN_TEXT_LENGTH);

  return rawParagraphs.map((text, index) => {
    const words = text.split(/\s+/).filter(Boolean);
    const pageNumber = findPageForParagraph(index, pageBreaks, rawParagraphs.length);

    return {
      index,
      text,
      pageNumber,
      charCount: text.length,
      wordCount: words.length,
    };
  });
}

function findPageForParagraph(paragraphIndex: number, pageBreaks: number[], totalParagraphs: number): number {
  if (pageBreaks.length === 0) return 1;

  const avgParagraphsPerPage = totalParagraphs / (pageBreaks.length + 1);
  const estimatedPage = Math.floor(paragraphIndex / avgParagraphsPerPage) + 1;

  return Math.min(estimatedPage, pageBreaks.length + 1);
}

function extractMetadata(data: any): PdfMetadata {
  const info = data.info || {};

  return {
    title: info.Title || undefined,
    author: info.Author || undefined,
    subject: info.Subject || undefined,
    keywords: info.Keywords || undefined,
    creator: info.Creator || undefined,
    producer: info.Producer || undefined,
    creationDate: info.CreationDate || undefined,
    modDate: info.ModDate || undefined,
  };
}

function cleanText(text: string): string {
  return text
    .replace(/\f/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '')
    .trim();
}

function calculateReadTime(wordCount: number): string {
  const wordsPerMinute = 200;
  const minutes = Math.ceil(wordCount / wordsPerMinute);
  return `${minutes} min read`;
}

function truncateText(text: string, maxLength: number): { text: string; truncated: boolean } {
  if (text.length <= maxLength) {
    return { text, truncated: false };
  }

  const truncated = text.substring(0, maxLength);

  const lastParagraph = truncated.lastIndexOf('\n\n');
  const lastSentence = truncated.lastIndexOf('. ');

  const cutoffIndex = lastParagraph > maxLength * 0.7
    ? lastParagraph
    : lastSentence > maxLength * 0.7
      ? lastSentence + 1
      : maxLength;

  return {
    text: truncated.substring(0, cutoffIndex).trim() + '\n\n... [content truncated]',
    truncated: true,
  };
}

export interface ParsePdfOptions {
  maxPages?: number;
  maxTextLength?: number;
  extractMetadata?: boolean;
  preserveParagraphs?: boolean;
}

export async function parsePdf(
  buffer: Buffer,
  options: ParsePdfOptions = {}
): Promise<ParsedPdfResult> {
  const {
    maxPages = MAX_PAGES,
    maxTextLength = MAX_TEXT_LENGTH,
    extractMetadata: shouldExtractMetadata = true,
    preserveParagraphs = true,
  } = options;

  const warnings: string[] = [];

  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`PDF file is too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
  }

  let data: any;
  try {
    data = await pdfParse(buffer, {
      max: maxPages,
      version: 'v1',
    });
  } catch (err: any) {
    throw new Error(`Failed to parse PDF: ${err.message}`);
  }

  const pageCount = data.numpages;
  const processedPages = Math.min(pageCount, maxPages);

  if (pageCount > maxPages) {
    warnings.push(`PDF has ${pageCount} pages, but only first ${maxPages} were processed`);
  }

  if (!data.text || data.text.trim().length < MIN_TEXT_LENGTH) {
    throw new Error('PDF appears to be empty or contains no extractable text');
  }

  let text = cleanText(data.text);

  if (text.length > maxTextLength) {
    const { text: truncated, truncated: wasTruncated } = truncateText(text, maxTextLength);
    text = truncated;
    if (wasTruncated) {
      warnings.push(`Text was truncated to ${maxTextLength.toLocaleString()} characters`);
    }
  }

  const metadata = shouldExtractMetadata ? extractMetadata(data) : {};
  const paragraphs = preserveParagraphs ? extractParagraphs(text, []) : [];
  const words = text.split(/\s+/).filter(Boolean);

  return {
    text,
    paragraphs,
    metadata,
    pageCount,
    processedPages,
    wordCount: words.length,
    charCount: text.length,
    readTime: calculateReadTime(words.length),
    warnings,
  };
}

export async function parsePdfFromUrl(url: string, options?: ParsePdfOptions): Promise<ParsedPdfResult> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('pdf') && !url.endsWith('.pdf')) {
    throw new Error('URL does not point to a PDF file');
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return parsePdf(buffer, options);
}

export async function parsePdfFromFile(file: File, options?: ParsePdfOptions): Promise<ParsedPdfResult> {
  if (!file.type.includes('pdf') && !file.name.endsWith('.pdf')) {
    throw new Error('File is not a PDF');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return parsePdf(buffer, options);
}

export function mergeParagraphs(paragraphs: Paragraph[], maxLength?: number): string {
  let text = paragraphs
    .sort((a, b) => a.index - b.index)
    .map((p) => p.text)
    .join('\n\n');

  if (maxLength && text.length > maxLength) {
    text = text.substring(0, maxLength) + '\n\n...';
  }

  return text;
}
