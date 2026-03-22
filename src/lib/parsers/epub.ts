import AdmZip from 'adm-zip';

interface Chapter {
  title?: string;
  content: string;
  index: number;
  wordCount: number;
  charCount: number;
}

interface ExtractedEpub {
  metadata: {
    title?: string;
    author?: string;
    language?: string;
    publisher?: string;
    description?: string;
    coverImage?: string;
  };
  chapters: Chapter[];
  totalChapters: number;
  totalWords: number;
  totalChars: number;
}

interface Chunk {
  id: number;
  text: string;
  wordCount: number;
  chapterIndex: number;
  isLast: boolean;
}

interface ChunkingOptions {
  maxChunkSize?: number;
  overlapWords?: number;
  preserveParagraphs?: boolean;
}

const DEFAULT_CHUNKING_OPTIONS: Required<ChunkingOptions> = {
  maxChunkSize: 5000,
  overlapWords: 200,
  preserveParagraphs: true,
};

function stripHtmlTags(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 10);
}

function mergeParagraphs(paragraphs: string[], maxLength: number): string[] {
  const chunks: string[] = [];
  let currentChunk = '';
  let currentWords = 0;

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).length;

    if (currentWords + words > maxLength && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
      currentWords = 0;
    }

    currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    currentWords += words;
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

function createOverlap(text: string, overlapWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= overlapWords) {
    return words.join(' ');
  }
  return words.slice(-overlapWords).join(' ');
}

export function chunkText(
  text: string,
  options: ChunkingOptions = {}
): Chunk[] {
  const opts = { ...DEFAULT_CHUNKING_OPTIONS, ...options };
  const paragraphs = splitIntoParagraphs(text);
  const chunks: Chunk[] = [];
  let chunkId = 0;
  let currentChunk = '';
  let currentWords = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i];
    const paragraphWords = paragraph.split(/\s+/).length;

    if (paragraphWords > opts.maxChunkSize) {
      if (currentChunk) {
        chunks.push({
          id: chunkId++,
          text: currentChunk.trim(),
          wordCount: currentWords,
          chapterIndex: -1,
          isLast: false,
        });
        currentChunk = '';
        currentWords = 0;
      }

      const longWords = paragraph.split(/\s+/);
      let subChunk = '';
      let subWords = 0;

      for (const word of longWords) {
        if (subWords + 1 > opts.maxChunkSize) {
          chunks.push({
            id: chunkId++,
            text: subChunk.trim(),
            wordCount: subWords,
            chapterIndex: -1,
            isLast: false,
          });

          if (opts.overlapWords > 0) {
            subChunk = createOverlap(subChunk, opts.overlapWords);
            subWords = subChunk.split(/\s+/).length;
          } else {
            subChunk = '';
            subWords = 0;
          }
        }
        subChunk += (subChunk ? ' ' : '') + word;
        subWords++;
      }

      if (subChunk.trim()) {
        currentChunk = subChunk.trim();
        currentWords = subWords;
      }
      continue;
    }

    if (currentWords + paragraphWords > opts.maxChunkSize) {
      chunks.push({
        id: chunkId++,
        text: currentChunk.trim(),
        wordCount: currentWords,
        chapterIndex: -1,
        isLast: false,
      });

      if (opts.overlapWords > 0) {
        const overlap = createOverlap(currentChunk, opts.overlapWords);
        currentChunk = overlap;
        currentWords = overlap.split(/\s+/).length;
      } else {
        currentChunk = '';
        currentWords = 0;
      }
    }

    currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    currentWords += paragraphWords;
  }

  if (currentChunk.trim()) {
    chunks.push({
      id: chunkId,
      text: currentChunk.trim(),
      wordCount: currentWords,
      chapterIndex: -1,
      isLast: true,
    });
  }

  if (chunks.length > 0) {
    chunks[chunks.length - 1].isLast = true;
  }

  return chunks;
}

export async function extractEpub(buffer: Buffer): Promise<ExtractedEpub> {
  try {
    const zip = new AdmZip(buffer);

    const containerXml = zip.readAsText('META-INF/container.xml');
    const rootfileMatch = containerXml.match(/full-path="([^"]+)"/);
    
    if (!rootfileMatch) {
      throw new Error('Invalid EPUB: cannot find rootfile');
    }

    const opfPath = rootfileMatch[1];
    const opfDir = opfPath.split('/').slice(0, -1).join('/');
    const opfContent = zip.readAsText(opfPath);

    const metadata: ExtractedEpub['metadata'] = {};

    const titleMatch = opfContent.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
    if (titleMatch) metadata.title = titleMatch[1].trim();

    const creatorMatch = opfContent.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
    if (creatorMatch) metadata.author = creatorMatch[1].trim();

    const languageMatch = opfContent.match(/<dc:language[^>]*>([^<]+)<\/dc:language>/i);
    if (languageMatch) metadata.language = languageMatch[1].trim();

    const publisherMatch = opfContent.match(/<dc:publisher[^>]*>([^<]+)<\/dc:publisher>/i);
    if (publisherMatch) metadata.publisher = publisherMatch[1].trim();

    const descMatch = opfContent.match(/<dc:description[^>]*>([^<]+)<\/dc:description>/i);
    if (descMatch) metadata.description = descMatch[1].trim();

    const spineMatch = opfContent.match(/<spine[^>]*>([\s\S]*?)<\/spine>/i);
    if (!spineMatch) {
      throw new Error('Invalid EPUB: cannot find spine');
    }

    const itemrefs = spineMatch[1].match(/<itemref[^>]+>/gi) || [];
    const manifest: Record<string, string> = {};

    const manifestMatches = opfContent.match(/<item[^>]+>/gi) || [];
    for (const item of manifestMatches) {
      const idMatch = item.match(/id="([^"]+)"/);
      const hrefMatch = item.match(/href="([^"]+)"/);
      if (idMatch && hrefMatch) {
        manifest[idMatch[1]] = hrefMatch[1];
      }
    }

    const chapters: Chapter[] = [];
    let totalWords = 0;
    let totalChars = 0;
    let index = 0;

    for (const itemref of itemrefs) {
      const idrefMatch = itemref.match(/idref="([^"]+)"/);
      if (!idrefMatch) continue;

      const idref = idrefMatch[1];
      const href = manifest[idref];
      if (!href) continue;

      const chapterPath = opfDir ? `${opfDir}/${href}` : href;
      let chapterContent = '';

      try {
        chapterContent = zip.readAsText(chapterPath);
      } catch {
        const fallbackPath = href.replace(/^[^/]*\//, '');
        try {
          chapterContent = zip.readAsText(fallbackPath);
        } catch {
          continue;
        }
      }

      const plainText = stripHtmlTags(chapterContent);

      if (plainText.length < 50) continue;

      const words = plainText.split(/\s+/).filter(Boolean);
      const wordCount = words.length;
      const charCount = plainText.length;

      const titleMatch = chapterContent.match(/<title[^>]*>([^<]+)<\/title>/i);
      const h1Match = chapterContent.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      const h2Match = chapterContent.match(/<h2[^>]*>([^<]+)<\/h2>/i);

      let chapterTitle = titleMatch?.[1]?.trim() || 
                         h1Match?.[1]?.trim() || 
                         h2Match?.[1]?.trim();

      if (chapterTitle && chapterTitle.length > 100) {
        chapterTitle = chapterTitle.substring(0, 97) + '...';
      }

      chapters.push({
        title: chapterTitle,
        content: plainText,
        index: index++,
        wordCount,
        charCount,
      });

      totalWords += wordCount;
      totalChars += charCount;
    }

    return {
      metadata,
      chapters,
      totalChapters: chapters.length,
      totalWords,
      totalChars,
    };
  } catch (error) {
    throw new Error(`Failed to extract EPUB: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function getFullText(extracted: ExtractedEpub): string {
  return extracted.chapters
    .sort((a, b) => a.index - b.index)
    .map((chapter) => chapter.content)
    .join('\n\n');
}

export function getChaptersText(extracted: ExtractedEpub): Array<{ title?: string; text: string }> {
  return extracted.chapters
    .sort((a, b) => a.index - b.index)
    .map((chapter) => ({
      title: chapter.title,
      text: chapter.content,
    }));
}

export async function extractAndChunkEpub(
  buffer: Buffer,
  options: ChunkingOptions = {}
): Promise<{
  metadata: ExtractedEpub['metadata'];
  fullText: string;
  chunks: Chunk[];
  stats: {
    totalChapters: number;
    totalWords: number;
    totalChars: number;
    totalChunks: number;
    avgChunkSize: number;
  };
}> {
  const extracted = await extractEpub(buffer);
  const fullText = getFullText(extracted);
  const chunks = chunkText(fullText, options);

  return {
    metadata: extracted.metadata,
    fullText,
    chunks,
    stats: {
      totalChapters: extracted.totalChapters,
      totalWords: extracted.totalWords,
      totalChars: extracted.totalChars,
      totalChunks: chunks.length,
      avgChunkSize: Math.round(extracted.totalChars / chunks.length) || 0,
    },
  };
}

export function getSummaryForChunk(chunks: Chunk[], summaryLength: 'short' | 'medium' | 'long'): Chunk[] {
  const targetChunkCount = {
    short: 1,
    medium: 3,
    long: 5,
  };

  const count = Math.min(targetChunkCount[summaryLength], chunks.length);
  return chunks.slice(0, count);
}
