import OpenAI from 'openai';
import { SummarizeRequest, AIResponse } from './types';
import { getSummarizePrompt, getSystemPrompt } from '../prompts/summarizer';

export class OpenAIService {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async summarize(request: SummarizeRequest): Promise<AIResponse> {
    const { text, model, length, apiKey } = request;

    const response = await this.client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: getSystemPrompt() },
        { role: 'user', content: getSummarizePrompt(text, length) },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    return {
      summary: response.choices[0].message.content || '',
      model: response.model,
      usage: response.usage ? {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
      } : undefined,
    };
  }
}
