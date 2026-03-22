import * as cheerio from 'cheerio';

const UNwantedTags = ['script', 'style', 'nav', 'header', 'footer', 'aside', 'noscript', 'iframe'];
const unwantedClasses = ['nav', 'menu', 'sidebar', 'footer', 'header', 'ad', 'ads', 'cookie', 'popup', 'modal'];

export async function parseUrl(url: string): Promise<{ text: string; title?: string }> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; WallesBot/1.0)',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const title = $('meta[property="og:title"]').attr('content') 
    || $('title').text() 
    || $('h1').first().text() 
    || undefined;

  $('script, style, noscript, iframe').remove();
  
  unwantedClasses.forEach(cls => {
    $(`[class*="${cls}"]`).remove();
  });

  UNwantedTags.forEach(tag => {
    $(tag).remove();
  });

  const bodyText = $('body').text() || $('main').text() || $('article').text() || $('html').text();

  const cleanedText = bodyText
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text: cleanedText, title };
}
