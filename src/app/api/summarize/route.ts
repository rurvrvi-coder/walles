import { NextRequest, NextResponse } from 'next/server';
import { summarizerService } from '@/lib/ai/SummarizerService';
import { AIModel } from '@/lib/ai/types';

const MODEL_CONFIG: Record<string, { input: number; output: number }> = {
  'gpt-4': { input: 0.00003, output: 0.00006 },
  'gpt-3.5-turbo': { input: 0.0000005, output: 0.0000015 },
  'claude-3-opus': { input: 0.000015, output: 0.000075 },
  'claude-3-sonnet': { input: 0.000003, output: 0.000015 },
  'free-llama': { input: 0, output: 0 },
  'free-mistral': { input: 0, output: 0 },
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, model, length, apiKey, ollamaUrl } = body;

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const isFreeModel = model === 'free-llama' || model === 'free-mistral';

    if (!apiKey && !isFreeModel) {
      return NextResponse.json({ error: 'API key is required' }, { status: 401 });
    }

    const options = {
      model: model as AIModel,
      length: length as any,
      apiKey,
      ollamaUrl: ollamaUrl || 'http://localhost:11434',
    };

    const result = await summarizerService.generateSummary(text, options);

    const pricing = MODEL_CONFIG[model] || MODEL_CONFIG['gpt-3.5-turbo'];
    const totalCost = result.usage
      ? Number((result.usage.inputTokens * pricing.input) + 
               (result.usage.outputTokens * pricing.output))
      : 0;

    return NextResponse.json({
      id: crypto.randomUUID(),
      summary: result.summary,
      model: result.model,
      tokens: result.usage,
      cost: totalCost,
      createdAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Summarize error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate summary' },
      { status: 500 }
    );
  }
}