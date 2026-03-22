import { cleanText, cleanTextSimple, getTextStats } from './textCleaner';

describe('cleanText', () => {
  describe('emoji removal', () => {
    it('should remove emojis from text', () => {
      const input = 'Hello 👋 World 🌍! 🎉';
      const result = cleanText(input);
      expect(result.text).toBe('Hello World !');
      expect(result.removedItems.emojis).toBeGreaterThan(0);
    });

    it('should remove various emoji categories', () => {
      const input = 'Test 😀 laughing 😂 fire 🔥';
      const result = cleanText(input);
      expect(result.text).not.toContain('😀');
      expect(result.text).not.toContain('😂');
      expect(result.text).not.toContain('🔥');
    });
  });

  describe('social media removal', () => {
    it('should remove social media mentions', () => {
      const input = 'Follow us on Instagram @myaccount and Twitter @handle';
      const result = cleanText(input);
      expect(result.text).not.toContain('@myaccount');
      expect(result.text).not.toContain('@handle');
    });

    it('should remove hashtags', () => {
      const input = 'This is a #hashtag and another #Example';
      const result = cleanText(input);
      expect(result.text).not.toContain('#hashtag');
      expect(result.text).not.toContain('#Example');
    });

    it('should remove social media URLs', () => {
      const input = 'Check us at https://facebook.com/page and instagram.com/test';
      const result = cleanText(input);
      expect(result.text).not.toContain('facebook.com');
      expect(result.text).not.toContain('instagram.com');
    });
  });

  describe('cookie banner removal', () => {
    it('should remove cookie policy mentions', () => {
      const input = 'We use cookies. Cookie policy here. Accept all cookies.';
      const result = cleanText(input);
      expect(result.text.toLowerCase()).not.toContain('cookie');
    });

    it('should remove GDPR/CCPA references', () => {
      const input = 'GDPR Notice: We use cookies. CCPA cookie consent required.';
      const result = cleanText(input);
      expect(result.text.toLowerCase()).not.toContain('gdpr');
      expect(result.text.toLowerCase()).not.toContain('ccpa');
    });
  });

  describe('legal disclaimer removal', () => {
    it('should remove copyright notices', () => {
      const input = 'Article content here. Copyright © 2024 Company. All rights reserved.';
      const result = cleanText(input);
      expect(result.text).not.toContain('Copyright');
      expect(result.text).not.toContain('All rights reserved');
    });

    it('should remove medical/legal disclaimers', () => {
      const input = 'This is medical advice. Not intended as medical advice. Consult a doctor.';
      const result = cleanText(input);
      expect(result.text.toLowerCase()).not.toContain('medical advice');
    });

    it('should remove affiliate disclosures', () => {
      const input = 'Great product review! Affiliate link disclosure: we earn commission.';
      const result = cleanText(input);
      expect(result.text.toLowerCase()).not.toContain('affiliate');
    });

    it('should remove liability disclaimers', () => {
      const input = 'Company is not responsible for any damages. Use at your own risk.';
      const result = cleanText(input);
      expect(result.text.toLowerCase()).not.toContain('not responsible');
      expect(result.text.toLowerCase()).not.toContain('own risk');
    });
  });

  describe('duplicate removal', () => {
    it('should remove duplicate paragraphs', () => {
      const input = 'First paragraph content.\n\nSecond paragraph.\n\nFirst paragraph content.\n\nFirst paragraph content.\n\nThird unique paragraph.';
      const result = cleanText(input);
      const paragraphs = result.text.split('\n\n');
      const firstParaCount = paragraphs.filter(p => p.includes('First paragraph')).length;
      expect(firstParaCount).toBeLessThanOrEqual(1);
    });

    it('should preserve unique content', () => {
      const input = 'This is unique content A.\n\nThis is unique content B.';
      const result = cleanText(input);
      expect(result.text).toContain('unique content A');
      expect(result.text).toContain('unique content B');
    });
  });

  describe('whitespace normalization', () => {
    it('should remove extra whitespace', () => {
      const input = 'Too    many     spaces    here.';
      const result = cleanText(input);
      expect(result.text).toBe('Too many spaces here.');
    });

    it('should limit consecutive newlines', () => {
      const input = 'Paragraph one.\n\n\n\n\n\nParagraph two.';
      const result = cleanText(input);
      const consecutiveNewlines = result.text.match(/\n{3,}/g);
      expect(consecutiveNewlines).toBeNull();
    });

    it('should remove leading/trailing whitespace', () => {
      const input = '   \n\n   Content here   \n\n   ';
      const result = cleanText(input);
      expect(result.text).toBe('Content here');
    });
  });

  describe('URL and contact removal', () => {
    it('should remove URLs by default', () => {
      const input = 'Visit https://example.com for more info and check http://test.com';
      const result = cleanText(input);
      expect(result.text).not.toContain('https://');
      expect(result.text).not.toContain('http://');
    });

    it('should preserve URLs when option is set', () => {
      const input = 'See https://example.com for details';
      const result = cleanText(input, { options: { preserveUrls: true } });
      expect(result.text).toContain('https://example.com');
    });

    it('should remove email addresses', () => {
      const input = 'Contact us at contact@example.com for help';
      const result = cleanText(input);
      expect(result.text).not.toContain('contact@example.com');
    });

    it('should remove phone numbers', () => {
      const input = 'Call us at (123) 456-7890 or 555-123-4567';
      const result = cleanText(input);
      expect(result.text).not.toContain('123-456-7890');
    });
  });

  describe('subscription prompts', () => {
    it('should remove newsletter subscription prompts', () => {
      const input = 'Subscribe to our newsletter for updates!';
      const result = cleanText(input);
      expect(result.text.toLowerCase()).not.toContain('subscribe');
      expect(result.text.toLowerCase()).not.toContain('newsletter');
    });

    it('should remove follow us prompts', () => {
      const input = 'Follow us on social media for more content';
      const result = cleanText(input);
      expect(result.text.toLowerCase()).not.toContain('follow us');
    });
  });

  describe('empty paragraphs', () => {
    it('should remove empty or very short paragraphs', () => {
      const input = 'Valid paragraph here.\n\n\n\nShort.\n\nAnother valid paragraph.';
      const result = cleanText(input);
      expect(result.text.split('\n\n').length).toBeLessThanOrEqual(3);
    });
  });

  describe('edge cases', () => {
    it('should handle empty input', () => {
      const result = cleanText('');
      expect(result.text).toBe('');
      expect(result.removedItems.totalCharsRemoved).toBe(0);
    });

    it('should handle text with only boilerplate', () => {
      const input = 'Copyright © 2024. Cookie policy. All rights reserved.';
      const result = cleanText(input);
      expect(result.text.length).toBeLessThan(input.length);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should preserve non-English characters', () => {
      const input = 'Привет мирこんにちは مرحبا';
      const result = cleanText(input);
      expect(result.text).toContain('Привет');
      expect(result.text).toContain('世界');
    });

    it('should handle code blocks', () => {
      const input = 'Here is code:\n```\nconst x = 1;\n```\nMore text.';
      const result = cleanText(input);
      expect(result.text).toContain('const x = 1');
    });
  });

  describe('result stats', () => {
    it('should track removed items count', () => {
      const input = 'Test 😀 @mention #hashtag cookie policy';
      const result = cleanText(input);
      expect(result.removedItems.emojis).toBeGreaterThan(0);
      expect(result.removedItems.socialLinks).toBeGreaterThan(0);
    });

    it('should track total characters removed', () => {
      const input = 'A 😀 emoji and @user mention and cookie policy text';
      const result = cleanText(input);
      expect(result.removedItems.totalCharsRemoved).toBeGreaterThan(0);
    });
  });
});

describe('cleanTextSimple', () => {
  it('should return just the cleaned text', () => {
    const input = 'Hello 👋 world!';
    const result = cleanTextSimple(input);
    expect(typeof result).toBe('string');
    expect(result).toBe('Hello world !');
  });
});

describe('getTextStats', () => {
  it('should calculate correct stats', () => {
    const text = 'This is a test sentence. Another sentence here.';
    const stats = getTextStats(text);

    expect(stats.wordCount).toBe(10);
    expect(stats.charCount).toBeGreaterThan(0);
    expect(stats.lineCount).toBe(1);
    expect(stats.paragraphCount).toBe(1);
    expect(stats.sentenceCount).toBe(2);
  });

  it('should handle empty text', () => {
    const stats = getTextStats('');
    expect(stats.wordCount).toBe(0);
    expect(stats.charCount).toBe(0);
  });

  it('should count paragraphs correctly', () => {
    const text = 'Para one.\n\nPara two.\n\nPara three.';
    const stats = getTextStats(text);
    expect(stats.paragraphCount).toBe(3);
  });
});
