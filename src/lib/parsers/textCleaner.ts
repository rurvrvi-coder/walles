interface TextCleanerOptions {
  removeEmojis?: boolean;
  removeSocialLinks?: boolean;
  removeLegalDisclaimers?: boolean;
  removeCookieBanners?: boolean;
  removeDuplicates?: boolean;
  preserveUrls?: boolean;
  maxConsecutiveNewlines?: number;
  maxWhitespace?: boolean;
  minParagraphLength?: number;
}

interface CleanerResult {
  text: string;
  removedItems: {
    emojis: number;
    socialLinks: number;
    legalDisclaimers: number;
    cookieBanners: number;
    duplicateLines: number;
    totalCharsRemoved: number;
  };
  warnings: string[];
}

const DEFAULT_OPTIONS: Required<TextCleanerOptions> = {
  removeEmojis: true,
  removeSocialLinks: true,
  removeLegalDisclaimers: true,
  removeCookieBanners: true,
  removeDuplicates: true,
  preserveUrls: false,
  maxConsecutiveNewlines: 2,
  maxWhitespace: true,
  minParagraphLength: 20,
};

const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2300}-\u{23FF}\u{2B50}\u{200D}\u{FE0F}]/gu;

const SOCIAL_MEDIA_PATTERNS = [
  /\b(?:facebook|fb|instagram|twitter|x\.com|linkedin|youtube|tiktok|snapchat|whatsapp|telegram|discord|reddit|pinterest)\b.*?(?:\.com|\.org|\.io|\.net)\/[^\s]*/gi,
  /(?:github|gitlab|bitbucket)\.com\/[^\s]+/gi,
  /(?:twitter\.com|x\.com)\/[^\s]+/gi,
  /https?:\/\/(?:www\.)?(?:facebook|fb|instagram|linkedin|youtube|tiktok)\.com\/[^\s]+/gi,
  /(?:@[\w]{1,15})/g,
  /#[\w\u00C0-\u024F]+/g,
];

const COOKIE_BANNER_PATTERNS = [
  /cookie[s]?\s*(?:policy|notice|banner|consent)/gi,
  /(?:we\s+use|uses?|using)\s+(?:cookies?|cookie\s*policy)/gi,
  /(?:accept|agree)\s+(?:all|cookies?)/gi,
  /(?:cookie|preference)\s*(?:setting|s)\s*(?:banner|notice|popup)/gi,
  /(?:this\s+site\s+uses?|uses?)\s+cookies?/gi,
  /by\s+continuing\s+(?:to\s+)?(?:browse|use)/gi,
  /(?:manage\s+)?cookie\s*preferences?/gi,
  /\bGDPR\b.*?(?:cookie|consent)/gi,
  /\bCCPA\b.*?(?:cookie|consent|do\s+not\s+sell)/gi,
  /your\s+(?:privacy\s+)?choices?/gi,
  /opt[\s-]?(?:out|in)[\s-]?(?:of\s+)?(?:cookies?|tracking)/gi,
];

const LEGAL_DISCLAIMER_PATTERNS = [
  /(?:copyright\s*©?\s*(?:\d{4}[-–]\s*)?(?:©|\d{4})\s*)?(?:all\s+rights?\s+reserved|reserved\.?)/gi,
  /\b(?:copyright|©)\s*(?:\d{4}[-–]\s*)?[\w\s,\.]+/gi,
  /(?:the\s+)?(?:information|content)\s+(?:provided|contained)\s+(?:herein|in\s+this|on\s+this)\s+(?:document|page|site|article|website|webpage)\s+(?:is|is\s+provided|is\s+for)\s+(?:general|informational|educational)\s+(?:purposes?|only)/gi,
  /(?:disclaimer|important\s*disclaimer)[:\s]*/gi,
  /(?:this\s+article|this\s+content|this\s+information)\s+(?:should\s+)?(?:not\s+)?(?:be\s+)?(?:considered|treated|regarded)\s+as\s+(?:medical|legal|professional|financial)\s+(?:advice|consultation)/gi,
  /\b(?:medical|legal|financial)\s+advice\s+disclaimer/gi,
  /(?:not\s+)?(?:intended\s+as|to\s+be)\s+(?:a\s+)?(?:substitute|replacement|alternative)\s+for\s+(?:professional|expert|medical|legal)\s+advice/gi,
  /(?:the\s+)?(?:author|company|organization|site)\s+(?:is\s+)?(?:not\s+)?(?:responsible|liable)\s+(?:for|of)\s+(?:any\s+)?(?:damages?|loss|errors?|inaccuracies?)/gi,
  /(?:use\s+at\s+your\s+own\s+risk|proceed\s+at\s+your\s+(?:own\s+)?risk)/gi,
  /(?:the\s+)?(?:views?|opinions?|thoughts?)\s+(?:expressed|presented|shared)\s+(?:herein|in\s+this|within\s+this)\s+(?:article|post|content|document)\s+(?:are|is)\s+(?:those|those\s+of)\s+(?:the\s+)?(?:author|writer|creator)/gi,
  /(?:originally\s+)?published\s+(?:on|at)\s+[^\n]+/gi,
  /(?:reproduced|reposted|shared)\s+(?:with\s+)?(?:permission|from)/gi,
  /(?:terms?\s+of\s+use|terms?\s+service|privacy\s+policy|tos|privacy\s+notice)[:\s]*https?:\/\/[^\n]+/gi,
  /\b(?:affiliate\s+link|sponsored\s+content|advertisement|ad\s+disclosure)/gi,
  /(?:reader|viewer)\s+(?:discretion)\s+(?:is\s+)?(?:advised|recommended)/gi,
  /(?:no\s+part\s+of\s+this|this\s+(?:article|document|content)(?:\s+shall)?)\s+(?:be\s+)?(?:reproduced|duplicated|copied|distributed|transmitted)\s+(?:without|without\s+prior)\s+(?:written\s+)?permission/gi,
  /(?:all\s+)?(?:trademark|®|™)\s+(?:marks?|logos?)\s+(?:are\s+)?(?:property\s+of|belong\s+to)/gi,
];

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

function countMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function removeEmojis(text: string): string {
  return text.replace(EMOJI_REGEX, '').replace(/\uFE0F/g, '');
}

function removeSocialMediaLinks(text: string): string {
  let result = text;

  SOCIAL_MEDIA_PATTERNS.forEach((pattern) => {
    result = result.replace(pattern, '');
  });

  result = result.replace(/(?:follow\s+us|subscribe|like|share)\s*(?:on\s+)?(?:our\s+)?(?:[\w\s]+\s*)?:/gi, '');
  result = result.replace(/(?:find\s+us|connect\s+with\s+us)\s+(?:on|at)\s+/gi, '');

  return result;
}

function removeCookieBanners(text: string): string {
  let result = text;

  COOKIE_BANNER_PATTERNS.forEach((pattern) => {
    result = result.replace(pattern, '');
  });

  result = result.replace(/\[\s*(?:accept|decline|reject|agree|allow)\s*(?:all|cookies?|analytics?)?\s*\]/gi, '');
  result = result.replace(/(?:got\s+it|understood|dismiss)\s*[-–]\s*[\w\s]+/gi, '');

  return result;
}

function removeLegalDisclaimers(text: string): string {
  let result = text;

  LEGAL_DISCLAIMER_PATTERNS.forEach((pattern) => {
    result = result.replace(pattern, '');
  });

  result = result.replace(/(?:updated?\s+on\s+):\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/gi, '');
  result = result.replace(/(?:last\s+updated|modified|revised)\s*:?\s*(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})/gi, '');

  return result;
}

function removeDuplicateLines(text: string): string {
  const lines = text.split('\n');
  const seen = new Set<string>();
  const result: string[] = [];

  for (const line of lines) {
    const normalized = line.toLowerCase().trim().replace(/\s+/g, ' ');

    if (normalized.length < 10) {
      result.push(line);
      continue;
    }

    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(line);
    }
  }

  return result.join('\n');
}

function removeDuplicateParagraphs(text: string): string {
  const paragraphs = text.split(/\n{2,}/);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const paragraph of paragraphs) {
    const normalized = paragraph.toLowerCase().trim().replace(/\s+/g, ' ');

    if (normalized.length < 30) {
      result.push(paragraph);
      continue;
    }

    const hash = normalized.substring(0, 100);
    if (!seen.has(hash)) {
      seen.add(hash);
      result.push(paragraph);
    }
  }

  return result.join('\n\n');
}

function normalizeWhitespace(text: string, maxNewlines: number = 2): string {
  let result = text;

  result = result.replace(/\r\n/g, '\n');
  result = result.replace(/\r/g, '\n');

  result = result.replace(/\t/g, ' ');
  result = result.replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ');

  result = result.replace(/ +/g, ' ');

  result = result.replace(new RegExp(`\\n{${maxNewlines + 1},}`, 'g'), '\n'.repeat(maxNewlines));
  result = result.replace(/^\n+|\n+$/g, '');

  return result.trim();
}

function removeEmptyParagraphs(text: string, minLength: number = 20): string {
  return text
    .split(/\n{2,}/)
    .filter((p) => p.trim().length >= minLength)
    .join('\n\n');
}

function removeUrls(text: string, preserveUrls: boolean = false): string {
  if (preserveUrls) return text;
  return text.replace(URL_REGEX, '');
}

function removeContactInfo(text: string): string {
  let result = text;

  result = result.replace(EMAIL_REGEX, '');
  result = result.replace(PHONE_REGEX, '');

  result = result.replace(/contact\s*us[:\s]*/gi, '');
  result = result.replace(/(?:for|to)\s+(?:more|additional)\s+(?:information|details)\s*:?\s*contact/gi, '');
  result = result.replace(/email\s*us\s*(?:at)?\s*:?\s*/gi, '');
  result = result.replace(/call\s*(?:us)?\s*(?:at)?\s*:?\s*/gi, '');

  return result;
}

function removeNavigationElements(text: string): string {
  let result = text;

  result = result.replace(/(?:home|back|next|previous|continue|read\s*more|learn\s*more)\s*[-–—:]\s*/gi, '');
  result = result.replace(/(?:scroll|swipe)\s+(?:up|down|left|right)\s+(?:to|for)/gi, '');
  result = result.replace(/(?:menu|navigation|skip\s+to)\s+(?:content|main|text)/gi, '');
  result = result.replace(/\[?(?:show|hide)\s+(?:more|less|menu|navigation)\]?/gi, '');

  return result;
}

function removeSubscriptionPrompts(text: string): string {
  let result = text;

  const subscriptionPatterns = [
    /(?:subscribe|sign\s*up|subscribe\s*to)\s+(?:our|to\s+our)?\s*(?:newsletter|mailing\s*list|updates?|feed)/gi,
    /(?:don't|do\s*not|never)\s+(?:miss|forget)\s+(?:an?|any)\s+update/gi,
    /(?:stay|keep)\s+(?:updated|inform|connected)\s+with\s+us/gi,
    /(?:enter|your)\s+(?:email|e-?mail)\s+(?:address)?\s*:?\s*$/gim,
    /(?:follow|subscribe)\s+(?:us|me)\s+(?:on|at)\s+/gi,
    /(?:join\s+)?(?:our|the)\s+(?:[\w\s]+\s+)?(?:community|list|subscribers?)/gi,
    /(?:free|get\s+free)\s+(?:daily|weekly|monthly)\s+(?:tips?|news|updates?|insights?)/gi,
    /(?:no\s+spam|unsubscribe|manage\s+subscription)/gi,
  ];

  subscriptionPatterns.forEach((pattern) => {
    result = result.replace(pattern, '');
  });

  return result;
}

export interface TextCleanerConfig {
  options?: TextCleanerOptions;
}

export function cleanText(text: string, config?: TextCleanerConfig): CleanerResult {
  const options: Required<TextCleanerOptions> = {
    ...DEFAULT_OPTIONS,
    ...config?.options,
  };

  const originalLength = text.length;
  const warnings: string[] = [];
  const removedItems = {
    emojis: 0,
    socialLinks: 0,
    legalDisclaimers: 0,
    cookieBanners: 0,
    duplicateLines: 0,
    totalCharsRemoved: 0,
  };

  let result = text;

  if (options.removeEmojis) {
    const emojiCount = countMatches(result, EMOJI_REGEX);
    removedItems.emojis = emojiCount;
    result = removeEmojis(result);
  }

  if (options.removeSocialLinks) {
    const socialCount = SOCIAL_MEDIA_PATTERNS.reduce((acc, pattern) => {
      const matches = result.match(pattern);
      return acc + (matches ? matches.length : 0);
    }, 0);
    removedItems.socialLinks = socialCount;
    result = removeSocialMediaLinks(result);
  }

  if (options.removeCookieBanners) {
    let beforeLength = result.length;
    result = removeCookieBanners(result);
    removedItems.cookieBanners = beforeLength - result.length;
  }

  if (options.removeLegalDisclaimers) {
    let beforeLength = result.length;
    result = removeLegalDisclaimers(result);
    removedItems.legalDisclaimers = beforeLength - result.length;
  }

  result = removeUrls(result, options.preserveUrls);
  result = removeContactInfo(result);
  result = removeNavigationElements(result);
  result = removeSubscriptionPrompts(result);

  if (options.removeDuplicates) {
    const beforeParagraphs = result.split(/\n{2,}/).length;
    result = removeDuplicateParagraphs(result);
    result = removeDuplicateLines(result);
    removedItems.duplicateLines = beforeParagraphs - result.split(/\n{2,}/).length;
  }

  if (options.maxWhitespace) {
    result = normalizeWhitespace(result, options.maxConsecutiveNewlines);
  }

  result = removeEmptyParagraphs(result, options.minParagraphLength);

  removedItems.totalCharsRemoved = originalLength - result.length;

  if (result.length < 100 && originalLength > 1000) {
    warnings.push('Result is very short after cleaning. Original content might be mostly boilerplate.');
  }

  return {
    text: result,
    removedItems,
    warnings,
  };
}

export function cleanTextSimple(text: string): string {
  return cleanText(text).text;
}

export function getTextStats(text: string): {
  charCount: number;
  wordCount: number;
  lineCount: number;
  paragraphCount: number;
  avgWordLength: number;
  avgSentenceLength: number;
} {
  const chars = text.replace(/\s+/g, '');
  const words = text.split(/\s+/).filter(Boolean);
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  const totalWordLength = words.reduce((sum, word) => sum + word.length, 0);
  const totalSentenceLength = sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0);

  return {
    charCount: chars.length,
    wordCount: words.length,
    lineCount: lines.length,
    paragraphCount: paragraphs.length,
    avgWordLength: words.length > 0 ? totalWordLength / words.length : 0,
    avgSentenceLength: sentences.length > 0 ? totalSentenceLength / sentences.length : 0,
  };
}
