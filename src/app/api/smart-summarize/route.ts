import { NextRequest, NextResponse } from 'next/server';
import { smartSummarize, hierarchicalSummarize, getChunkingStats } from '@/lib/ai/smartChunker';
import { AIModel, SummaryLength } from '@/lib/ai/types';

function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      text,
      model = 'gpt-3.5-turbo',
      length = 'medium',
      apiKey,
      strategy = 'auto',
      options = {},
    } = body;

    if (!text) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400, headers: getCorsHeaders() }
      );
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key is required' },
        { status: 401, headers: getCorsHeaders() }
      );
    }

    const stats = getChunkingStats(text);

    const smartOptions = {
      maxTokensPerChunk: options.maxTokensPerChunk || 8000,
      overlapTokens: options.overlapTokens || 500,
      maxParallelRequests: options.maxParallelRequests || 3,
      preserveStructure: options.preserveStructure ?? true,
      summaryStyle: options.summaryStyle || 'concise',
    };

    let result;

    if (strategy === 'hierarchical') {
      result = await hierarchicalSummarize(
        text,
        model as AIModel,
        length as SummaryLength,
        apiKey,
        smartOptions
      );
    } else if (stats.needsChunking && strategy === 'auto') {
      if (stats.estimatedTokens > 50000) {
        result = await hierarchicalSummarize(
          text,
          model as AIModel,
          length as SummaryLength,
          apiKey,
          smartOptions
        );
      } else {
        result = await smartSummarize(
          text,
          model as AIModel,
          length as SummaryLength,
          apiKey,
          smartOptions
        );
      }
    } else {
      result = await smartSummarize(
        text,
        model as AIModel,
        length as SummaryLength,
        apiKey,
        smartOptions
      );
    }

    return NextResponse.json({
      success: true,
      ...result,
      stats: {
        ...stats,
        strategy: result.strategy,
        processingTime: result.processingTime,
      },
    }, { headers: getCorsHeaders() });

  } catch (error: any) {
    console.error('[smart-summarize] Error:', error);

    return NextResponse.json(
      { error: error.message || 'Failed to process text' },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}
