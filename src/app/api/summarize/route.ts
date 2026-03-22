import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { OpenAIService } from '@/lib/ai/openai';
import { AnthropicService } from '@/lib/ai/anthropic';
import { AIModel } from '@/lib/ai/types';

const claudeModels = ['claude-3-opus', 'claude-3-sonnet'];

const modelPricing: Record<string, { input: number; output: number }> = {
  GPT_4: { input: 0.00003, output: 0.00006 },
  GPT_3_5_TURBO: { input: 0.0000005, output: 0.0000015 },
  CLAUDE_3_OPUS: { input: 0.000015, output: 0.000075 },
  CLAUDE_3_SONNET: { input: 0.000003, output: 0.000015 },
};

const modelToDb: Record<string, string> = {
  'gpt-4': 'GPT_4',
  'gpt-3.5-turbo': 'GPT_3_5_TURBO',
  'claude-3-opus': 'CLAUDE_3_OPUS',
  'claude-3-sonnet': 'CLAUDE_3_SONNET',
};

const lengthToDb: Record<string, string> = {
  short: 'SHORT',
  medium: 'MEDIUM',
  long: 'LONG',
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, model, length, apiKey, userId, documentId } = body;

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: 'API key is required' }, { status: 401 });
    }

    const dbModel = modelToDb[model] || 'GPT_3_5_TURBO';
    const dbLength = lengthToDb[length] || 'MEDIUM';
    const isClaude = claudeModels.includes(model);

    let result;
    if (isClaude) {
      const service = new AnthropicService(apiKey);
      result = await service.summarize({ text, model: model as AIModel, length, apiKey });
    } else {
      const service = new OpenAIService(apiKey);
      result = await service.summarize({ text, model: model as AIModel, length, apiKey });
    }

    const pricing = modelPricing[dbModel];
    const totalCost = result.usage
      ? Number((result.usage.inputTokens * pricing.input) + 
               (result.usage.outputTokens * pricing.output))
      : null;

    const summary = await prisma.summary.create({
      data: {
        originalText: text.slice(0, 10000),
        summaryText: result.summary,
        model: dbModel as any,
        promptTokens: result.usage?.inputTokens,
        completionTokens: result.usage?.outputTokens,
        totalCost,
        length: dbLength as any,
        userId: userId || null,
        documentId: documentId || null,
      },
    });

    return NextResponse.json({
      id: summary.id,
      summary: summary.summaryText,
      model: summary.model,
      tokens: result.usage,
      cost: totalCost,
      createdAt: summary.createdAt,
    });
  } catch (error: any) {
    console.error('Summarize error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate summary' },
      { status: 500 }
    );
  }
}
