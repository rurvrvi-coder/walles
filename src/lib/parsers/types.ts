export type ContentType = 'url' | 'pdf' | 'text';

export interface ParsedContent {
  type: ContentType;
  text: string;
  metadata?: {
    title?: string;
    source?: string;
    pageCount?: number;
    wordCount?: number;
    charCount?: number;
    readTime?: string;
  };
}

export interface ParserError {
  code: string;
  message: string;
}

export interface Paragraph {
  index: number;
  text: string;
  pageNumber: number;
  charCount: number;
  wordCount: number;
}

export interface PdfMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modDate?: string;
}

export interface ParsedPdfResult {
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
