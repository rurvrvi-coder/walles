import Anthropic from '@anthropic-ai/sdk';
import { SummarizeRequest, AIResponse } from './types';
import { getSummarizePrompt, getSystemPrompt } from '../prompts/summarizer';

export class AnthropicService {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async summarize(request: SummarizeRequest): Promise<AIResponse> {
    const { text, length, apiKey } = request;

    const maxTokens = {
      short: 200,
      medium: 500,
      long: 1500
    };

    const response = await this.client.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: maxTokens[length],
      system: getSystemPrompt(),
      messages: [
        { role: 'user', content: getSummarizePrompt(text, length) }
      ],
    });

    const content = response.content[0];
    const summary = 'text' in content ? content.text : '';

    return {
      summary,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
