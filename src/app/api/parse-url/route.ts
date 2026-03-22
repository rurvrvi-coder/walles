import { NextRequest, NextResponse } from 'next/server';
import { load } from 'cheerio';

const UNWANTED_TAGS = [
  'script',
  'style',
  'noscript',
  'iframe',
  'svg',
  'path',
  'form',
  'button',
  'input',
  'select',
  'textarea',
];

const UNWANTED_SELECTORS = [
  'nav',
  'header',
  'footer',
  'aside',
  'menu',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="complementary"]',
  '.nav',
  '.navigation',
  '.menu',
  '.sidebar',
  '.sidebar-left',
  '.sidebar-right',
  '.footer',
  '.header',
  '.navbar',
  '.ad',
  '.ads',
  '.advertisement',
  '.cookie',
  '.popup',
  '.modal',
  '.overlay',
  '.banner',
  '.promo',
  '.promotion',
  '.social',
  '.share',
  '.comments',
  '.related',
  '.recommended',
  '.newsletter',
  '.subscribe',
  '#nav',
  '#navigation',
  '#menu',
  '#sidebar',
  '#footer',
  '#header',
  '#cookies',
  '#popup',
  '#modal',
];

const MAX_TEXT_LENGTH = 500_000;
const REQUEST_TIMEOUT = 15000;

function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function sanitizeUrl(urlString: string): string {
  try {
    const url = new URL(urlString);
    url.hash = '';
    return url.toString();
  } catch {
    return urlString;
  }
}

async function fetchWithTimeout(url: string, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractMetaTags($: ReturnType<typeof load>) {
  return {
    title: $('meta[property="og:title"]').attr('content')
      || $('meta[name="twitter:title"]').attr('content')
      || $('title').first().text()
      || $('h1').first().text()
      || undefined,
    description: $('meta[property="og:description"]').attr('content')
      || $('meta[name="twitter:description"]').attr('content')
      || $('meta[name="description"]').attr('content')
      || undefined,
    image: $('meta[property="og:image"]').attr('content')
      || $('meta[name="twitter:image"]').attr('content')
      || undefined,
    author: $('meta[name="author"]').attr('content') || undefined,
    publishedTime: $('meta[property="article:published_time"]').attr('content') || undefined,
    language: $('html').attr('lang') || $('meta[name="language"]').attr('content') || undefined,
  };
}

function cleanHtml($: ReturnType<typeof load>): string {
  UNWANTED_TAGS.forEach((tag) => $(tag).remove());

  UNWANTED_SELECTORS.forEach((selector) => {
    try {
      $(selector).remove();
    } catch {
      // Skip invalid selectors
    }
  });

  ['[class*="nav"]', '[class*="menu"]', '[class*="sidebar"]', '[class*="footer"]', '[class*="header"]'].forEach(
    (selector) => {
      try {
        $(selector).remove();
      } catch {
        // Skip invalid selectors
      }
    }
  );

  return $('body').html() || $('main').html() || $('article').html() || $.html() || '';
}

function extractText(html: string): { text: string; wordCount: number } {
  const $ = load(html);
  const paragraphs: string[] = [];

  $('p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, pre, code').each((_: any, el: any) => {
    const text = $(el).text().trim();
    if (text.length > 20) {
      paragraphs.push(text);
    }
  });

  let text = paragraphs.join('\n\n');

  text = text
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/^\s+|\s+$/g, '')
    .trim();

  if (text.length > MAX_TEXT_LENGTH) {
    text = text.substring(0, MAX_TEXT_LENGTH) + '... [truncated]';
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;

  return { text, wordCount };
}

function calculateReadTime(wordCount: number): string {
  const wordsPerMinute = 200;
  const minutes = Math.ceil(wordCount / wordsPerMinute);
  return `${minutes} min read`;
}

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

    let body: { url?: string; userId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400, headers: corsHeaders }
      );
    }

    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!isValidUrl(url)) {
      return NextResponse.json(
        { error: 'Invalid URL format. Must start with http:// or https://' },
        { status: 400, headers: corsHeaders }
      );
    }

    const sanitizedUrl = sanitizeUrl(url);

    let response: Response;
    try {
      response = await fetchWithTimeout(sanitizedUrl, REQUEST_TIMEOUT);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Request timeout. The website took too long to respond.' },
          { status: 504, headers: corsHeaders }
        );
      }
      return NextResponse.json(
        { error: 'Failed to connect to the website.' },
        { status: 502, headers: corsHeaders }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: `Website returned error: ${response.status} ${response.statusText}` },
        { status: response.status, headers: corsHeaders }
      );
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return NextResponse.json(
        { error: 'The URL does not return HTML content.' },
        { status: 422, headers: corsHeaders }
      );
    }

    let html: string;
    try {
      html = await response.text();
    } catch {
      return NextResponse.json(
        { error: 'Failed to read response body.' },
        { status: 502, headers: corsHeaders }
      );
    }

    if (html.length < 100) {
      return NextResponse.json(
        { error: 'The website returned empty or too small content.' },
        { status: 422, headers: corsHeaders }
      );
    }

    const $ = load(html);
    const meta = extractMetaTags($);
    const cleanedHtml = cleanHtml($);
    const { text, wordCount } = extractText(cleanedHtml);

    if (!text || text.length < 100) {
      return NextResponse.json(
        { error: 'Could not extract meaningful content from this page.' },
        { status: 422, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      {
        success: true,
        url: sanitizedUrl,
        title: meta.title?.trim(),
        description: meta.description?.trim(),
        author: meta.author,
        publishedTime: meta.publishedTime,
        image: meta.image,
        language: meta.language,
        text,
        wordCount,
        readTime: calculateReadTime(wordCount),
        rawLength: html.length,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err: any) {
    console.error('[parse-url] Error:', err);

    return NextResponse.json(
      { error: 'Internal server error while parsing URL.' },
      { status: 500, headers: corsHeaders }
    );
  }
}
