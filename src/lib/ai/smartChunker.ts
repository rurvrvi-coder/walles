import { AIModel, SummaryLength } from './types';

interface Chunk {
  id: number;
  text: string;
  tokenCount: number;
  startIndex: number;
  endIndex: number;
}

interface ChunkResult {
  chunkId: number;
  summary: string;
  keyPoints: string[];
  tokenUsage?: { inputTokens: number; outputTokens: number };
}

interface SmartSummarizeResult {
  finalSummary: string;
  chunkResults: ChunkResult[];
  totalTokens: number;
  totalChunks: number;
  processingTime: number;
  strategy: 'single' | 'parallel' | 'hierarchical';
}

interface SmartChunkingOptions {
  maxTokensPerChunk?: number;
  overlapTokens?: number;
  maxParallelRequests?: number;
  preserveStructure?: boolean;
  summaryStyle?: 'concise' | 'detailed';
}

const DEFAULT_OPTIONS: Required<SmartChunkingOptions> = {
  maxTokensPerChunk: 8000,
  overlapTokens: 500,
  maxParallelRequests: 3,
  preserveStructure: true,
  summaryStyle: 'concise',
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 20);
}

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
}

function smartChunk(
  text: string,
  options: Required<SmartChunkingOptions>
): Chunk[] {
  const chunks: Chunk[] = [];
  const paragraphs = splitIntoParagraphs(text);

  if (paragraphs.length === 0) {
    return [{
      id: 0,
      text: text.substring(0, options.maxTokensPerChunk * 4),
      tokenCount: estimateTokens(text),
      startIndex: 0,
      endIndex: text.length,
    }];
  }

  let currentChunk = '';
  let currentTokens = 0;
  let chunkId = 0;
  let startIndex = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const paraTokens = estimateTokens(para);

    if (paraTokens > options.maxTokensPerChunk) {
      if (currentChunk) {
        chunks.push({
          id: chunkId++,
          text: currentChunk.trim(),
          tokenCount: currentTokens,
          startIndex,
          endIndex: startIndex + currentChunk.length,
        });
        currentChunk = '';
        currentTokens = 0;
      }

      const sentences = splitIntoSentences(para);
      let subChunk = '';
      let subTokens = 0;

      for (const sentence of sentences) {
        const sentTokens = estimateTokens(sentence);

        if (subTokens + sentTokens > options.maxTokensPerChunk) {
          chunks.push({
            id: chunkId++,
            text: subChunk.trim(),
            tokenCount: subTokens,
            startIndex,
            endIndex: startIndex + subChunk.length,
          });
          startIndex += subChunk.length;
          subChunk = '';
          subTokens = 0;
        }

        subChunk += (subChunk ? ' ' : '') + sentence;
        subTokens += sentTokens;
      }

      if (subChunk.trim()) {
        currentChunk = subChunk.trim();
        currentTokens = subTokens;
      }
      continue;
    }

    if (currentTokens + paraTokens > options.maxTokensPerChunk) {
      chunks.push({
        id: chunkId++,
        text: currentChunk.trim(),
        tokenCount: currentTokens,
        startIndex,
        endIndex: startIndex + currentChunk.length,
      });

      const words = currentChunk.split(/\s+/);
      if (options.overlapTokens > 0 && words.length > options.overlapTokens / 2) {
        const overlapWords = words.slice(-Math.floor(options.overlapTokens / 2));
        startIndex = startIndex + currentChunk.length - overlapWords.join(' ').length;
        currentChunk = overlapWords.join(' ') + '\n\n' + para;
      } else {
        startIndex += currentChunk.length;
        currentChunk = para;
      }
      currentTokens = paraTokens;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
      currentTokens += paraTokens;
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      id: chunkId,
      text: currentChunk.trim(),
      tokenCount: currentTokens,
      startIndex,
      endIndex: text.length,
    });
  }

  return chunks;
}

async function summarizeChunk(
  text: string,
  model: AIModel,
  length: SummaryLength,
  apiKey: string,
  chunkId: number
): Promise<ChunkResult> {
  const styleInstructions = {
    concise: 'Be extremely concise. Focus on key facts only.',
    detailed: 'Provide moderate detail while maintaining clarity.',
  };

  const lengthInstructions = {
    short: 'Summarize in 2-3 sentences maximum.',
    medium: 'Summarize in 1 paragraph with key points.',
    long: 'Provide a comprehensive summary with all important details.',
  };

  const prompt = `You are analyzing a chunk of a larger document (chunk #${chunkId + 1}).

TASK: Extract the essential information from this text chunk.

Requirements:
- ${styleInstructions.concise}
- ${lengthInstructions[length]}
- Preserve key facts, names, dates, and statistics
- Ignore redundant or introductory phrases
- Do not add information not present in the text

FORMAT YOUR RESPONSE AS:
## Summary
[Brief summary of this chunk]

## Key Points
- [Point 1]
- [Point 2]
- [Point 3]

---

TEXT CHUNK:
${text}`;

  try {
    const response = await fetch('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: prompt,
        model,
        length,
        apiKey,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const summary = data.summary || data.text;

    const keyPoints = extractKeyPoints(summary);

    return {
      chunkId,
      summary,
      keyPoints,
      tokenUsage: data.tokens,
    };
  } catch (error) {
    console.error(`Error summarizing chunk ${chunkId}:`, error);
    return {
      chunkId,
      summary: `[Error processing chunk ${chunkId + 1}]`,
      keyPoints: [],
    };
  }
}

function extractKeyPoints(text: string): string[] {
  const bulletPoints: string[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      bulletPoints.push(trimmed.substring(2).trim());
    } else if (/^\d+\.\s/.test(trimmed)) {
      bulletPoints.push(trimmed.replace(/^\d+\.\s/, '').trim());
    }
  }

  return bulletPoints;
}

function mergeSummaries(
  chunkResults: ChunkResult[],
  totalChunks: number,
  style: 'concise' | 'detailed'
): string {
  if (chunkResults.length === 0) {
    return 'No content to summarize.';
  }

  if (chunkResults.length === 1) {
    return chunkResults[0].summary;
  }

  const summaries = chunkResults
    .sort((a, b) => a.chunkId - b.chunkId)
    .map((r) => r.summary)
    .filter((s) => !s.startsWith('[Error'));

  const allKeyPoints = chunkResults
    .sort((a, b) => a.chunkId - b.chunkId)
    .flatMap((r) => r.keyPoints)
    .filter((p) => p.length > 10);

  const mergedSummary = summaries.join('\n\n---\n\n');

  const uniqueKeyPoints = Array.from(new Set(allKeyPoints)).slice(0, style === 'concise' ? 5 : 10);

  let finalOutput = '';

  if (style === 'concise') {
    const firstSummary = summaries[0] || '';
    const lastSummary = summaries[summaries.length - 1] || '';
    
    finalOutput = `## Summary\n\n`;
    finalOutput += `${firstSummary}\n\n`;
    
    if (summaries.length > 2) {
      finalOutput += `This document contains ${totalChunks} main sections covering the following topics:\n\n`;
    }
    
    finalOutput += `## Key Points\n\n`;
    for (const point of uniqueKeyPoints) {
      finalOutput += `- ${point}\n`;
    }
    
    finalOutput += `\n${lastSummary}`;
  } else {
    finalOutput = `## Document Summary (${totalChunks} sections)\n\n`;
    finalOutput += `### Section Summaries\n\n`;
    
    for (let i = 0; i < summaries.length; i++) {
      finalOutput += `**Section ${i + 1}:**\n${summaries[i]}\n\n`;
    }
    
    finalOutput += `### Consolidated Key Points\n\n`;
    for (const point of uniqueKeyPoints) {
      finalOutput += `- ${point}\n`;
    }
    
    finalOutput += `\n## Conclusion\n\n`;
    finalOutput += summaries[summaries.length - 1] || 'See above sections for details.';
  }

  return finalOutput;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function smartSummarize(
  text: string,
  model: AIModel,
  length: SummaryLength,
  apiKey: string,
  options: SmartChunkingOptions = {}
): Promise<SmartSummarizeResult> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const estimatedTokens = estimateTokens(text);
  const needsChunking = estimatedTokens > opts.maxTokensPerChunk;

  if (!needsChunking) {
    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          model,
          length,
          apiKey,
        }),
      });

      const data = await response.json();
      const summary = data.summary || data.text;

      return {
        finalSummary: summary,
        chunkResults: [{
          chunkId: 0,
          summary,
          keyPoints: extractKeyPoints(summary),
          tokenUsage: data.tokens,
        }],
        totalTokens: estimatedTokens,
        totalChunks: 1,
        processingTime: Date.now() - startTime,
        strategy: 'single',
      };
    } catch (error) {
      throw new Error(`Summarization failed: ${error}`);
    }
  }

  console.log(`[SmartChunk] Large text detected: ${estimatedTokens} tokens. Chunking...`);

  const chunks = smartChunk(text, opts);
  console.log(`[SmartChunk] Created ${chunks.length} chunks`);

  const results: ChunkResult[] = [];
  const parallelLimit = opts.maxParallelRequests;

  for (let i = 0; i < chunks.length; i += parallelLimit) {
    const batch = chunks.slice(i, i + parallelLimit);
    const batchPromises = batch.map((chunk) =>
      summarizeChunk(chunk.text, model, length, apiKey, chunk.id)
    );

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    if (i + parallelLimit < chunks.length) {
      await sleep(500);
    }
  }

  const successfulResults = results.filter((r) => !r.summary.startsWith('[Error'));
  const finalSummary = mergeSummaries(successfulResults, chunks.length, opts.summaryStyle);

  return {
    finalSummary,
    chunkResults: results,
    totalTokens: successfulResults.reduce((sum, r) => sum + estimateTokens(r.summary), 0),
    totalChunks: chunks.length,
    processingTime: Date.now() - startTime,
    strategy: 'parallel',
  };
}

export async function hierarchicalSummarize(
  text: string,
  model: AIModel,
  length: SummaryLength,
  apiKey: string,
  options: SmartChunkingOptions = {}
): Promise<SmartSummarizeResult> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const estimatedTokens = estimateTokens(text);

  if (estimatedTokens <= opts.maxTokensPerChunk) {
    return smartSummarize(text, model, length, apiKey, opts);
  }

  console.log(`[Hierarchical] Processing ${estimatedTokens} tokens...`);

  const level1Chunks = smartChunk(text, { ...opts, maxTokensPerChunk: opts.maxTokensPerChunk / 2 });
  
  const level1Results: ChunkResult[] = [];
  for (let i = 0; i < level1Chunks.length; i += opts.maxParallelRequests) {
    const batch = level1Chunks.slice(i, i + opts.maxParallelRequests);
    const results = await Promise.all(
      batch.map((chunk, idx) =>
        summarizeChunk(chunk.text, model, 'short', apiKey, i + idx)
      )
    );
    level1Results.push(...results);
    if (i + opts.maxParallelRequests < level1Chunks.length) {
      await sleep(300);
    }
  }

  const level1Text = level1Results
    .sort((a, b) => a.chunkId - b.chunkId)
    .map((r) => r.summary)
    .join('\n\n');

  const finalSummary = await smartSummarize(level1Text, model, length, apiKey, {
    ...opts,
    preserveStructure: false,
  });

  return {
    ...finalSummary,
    strategy: 'hierarchical',
    processingTime: Date.now() - startTime,
  };
}

export function getChunkingStats(text: string): {
  estimatedTokens: number;
  needsChunking: boolean;
  recommendedChunks: number;
  maxChunkSize: number;
} {
  const estimatedTokens = estimateTokens(text);
  const needsChunking = estimatedTokens > DEFAULT_OPTIONS.maxTokensPerChunk;
  
  return {
    estimatedTokens,
    needsChunking,
    recommendedChunks: needsChunking
      ? Math.ceil(estimatedTokens / DEFAULT_OPTIONS.maxTokensPerChunk)
      : 1,
    maxChunkSize: DEFAULT_OPTIONS.maxTokensPerChunk,
  };
}
