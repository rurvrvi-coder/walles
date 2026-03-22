export function getSummarizePrompt(text: string, length: 'short' | 'medium' | 'long'): string {
  const lengths = {
    short: '2-3 sentences',
    medium: '1 paragraph',
    long: '2-3 paragraphs'
  };
  
  const maxLength = {
    short: 500,
    medium: 1500,
    long: 4000
  };

  const truncatedText = text.length > maxLength[length] 
    ? text.slice(0, maxLength[length]) + '...'
    : text;

  return `You are a professional text summarizer. Create a clear, concise summary of the following text in ${lengths[length]}. Focus on the main points and key information. Do not add introductory phrases like "This text is about..." or "In summary...".

Text to summarize:
${truncatedText}`;
}

export function getSystemPrompt(): string {
  return `You are Walles, an expert text summarization assistant. You always provide accurate, informative summaries that capture the essential meaning of the original text.`;
}
