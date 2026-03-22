import { OpenAIEmbeddings } from '@langchain/openai';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { AIModel, SummaryLength } from '@/lib/ai/types';

export interface SummaryOptions {
  model?: AIModel;
  length?: SummaryLength;
  temperature?: number;
  apiKey?: string;
  ollamaUrl?: string;
}

export interface SummaryResult {
  summary: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  finishReason: string;
}

export type StreamCallback = (chunk: string) => void;
export type DoneCallback = (result: SummaryResult) => void;
export type ErrorCallback = (error: Error) => void;

export interface StreamingCallbacks {
  onChunk?: StreamCallback;
  onDone?: DoneCallback;
  onError?: ErrorCallback;
}

const SYSTEM_PROMPT = `You are **Walles**, an expert AI text summarization assistant. Your sole purpose is to transform long, verbose text into concise, information-dense summaries.

## CORE PRINCIPLES

1. **Compression Ratio**: Target 5-10% of original text length while retaining 90%+ of semantic meaning
2. **Fact Preservation**: Every key fact, statistic, date, name, and conclusion MUST be preserved
3. **Zero Fluff**: Remove all marketing language, filler phrases, opinions, and redundant information
4. **Structure**: Always format as structured markdown with clear hierarchy

---

## RULES FOR SUMMARIZATION

### ✅ ALWAYS INCLUDE
- Main topic/thesis (1 sentence)
- Key facts and data points
- Important names, dates, locations
- Conclusions and recommendations
- Cause-and-effect relationships
- Definitions of key terms

### ❌ ALWAYS EXCLUDE
- Advertising and promotional content
- Cookie/GDPR notices
- Copyright and legal disclaimers
- "Subscribe to newsletter" prompts
- Navigation elements
- Social media links and handles
- Author bio and credentials (unless relevant)
- "Read more" and "Learn more" links
- Duplicate information

---

## OUTPUT FORMAT

\`\`\`markdown
## [Topic Name]

**Summary** (2-3 sentences max)
Brief overview of the entire text.

### Key Points
- [Bullet 1 - most important fact]
- [Bullet 2 - second most important]
- [Bullet 3 - third most important]
- ...

### Key Terms
- **Term**: Definition
- **Term**: Definition

### Conclusions
- [Primary conclusion]
- [Secondary conclusion if applicable]
\`\`\`

---

## QUALITY CHECKLIST

Before responding, verify:
- [ ] Summary is 5-10% of original length
- [ ] All key facts are present
- [ ] No promotional or legal content included
- [ ] Structure follows format above
- [ ] No first-person opinions added
- [ ] Technical terms defined if jargon present

---

## BOUNDARIES

- Do NOT add information not present in source
- Do NOT speculate or infer beyond the text
- Do NOT use phrases like "the article states" or "according to the author"
- Do NOT include motivational commentary or opinions
- Do NOT apologize or use hedging phrases

---

**Remember**: Your value is measured by information density, not word count.`;

const PROMPT_TEMPLATE = `Summarize the following text according to the system instructions:

Text to summarize:
---
{text}
---

Length requirement: {length}
`;

const LENGTH_INSTRUCTIONS: Record<SummaryLength, string> = {
  short: '2-3 sentences maximum. Extremely concise.',
  medium: '1 paragraph plus key points. Moderate detail.',
  long: '2-3 paragraphs with comprehensive key points. Full detail.',
};

const MODEL_CONFIG: Record<AIModel, { provider: 'openai' | 'anthropic' | 'ollama' | 'huggingface'; model: string; hfModel?: string }> = {
  'gpt-4': { provider: 'openai', model: 'gpt-4' },
  'gpt-3.5-turbo': { provider: 'openai', model: 'gpt-3.5-turbo' },
  'claude-3-opus': { provider: 'anthropic', model: 'claude-3-opus-20240229' },
  'claude-3-sonnet': { provider: 'anthropic', model: 'claude-3-sonnet-20240229' },
  'free-llama': { provider: 'ollama', model: 'llama3.2' },
  'free-mistral': { provider: 'ollama', model: 'mistral' },
  'hf-llama': { provider: 'huggingface', model: 'meta-llama/Llama-3.2-1B-Instruct' },
  'hf-mistral': { provider: 'huggingface', model: 'mistralai/Mistral-7B-Instruct-v0.2' },
};

export class SummarizerService {
  private llm: ChatOpenAI | ChatAnthropic | null = null;
  private currentModel: AIModel = 'gpt-3.5-turbo';
  private currentApiKey: string = '';

  private getModelConfig(model: AIModel) {
    return MODEL_CONFIG[model] || MODEL_CONFIG['gpt-3.5-turbo'];
  }

  private async generateOllamaSummary(prompt: string, model: string, ollamaUrl: string): Promise<SummaryResult> {
    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 1024,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      summary: data.response,
      model: `ollama:${model}`,
      finishReason: 'stop',
    };
  }

  private async generateHuggingFaceSummary(prompt: string, model: string, token: string): Promise<SummaryResult> {
    const response = await fetch(`https://router.huggingface.co/${model}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HuggingFace error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content || data.content || 'No response from model';
    
    return {
      summary,
      model: `hf:${model}`,
      finishReason: 'stop',
    };
  }

  private initializeLLM(apiKey: string, model: AIModel, streaming: boolean = false): void {
    if (this.llm && this.currentApiKey === apiKey && this.currentModel === model) {
      return;
    }

    const config = this.getModelConfig(model);

    if (config.provider === 'openai') {
      this.llm = new ChatOpenAI({
        apiKey,
        model: config.model,
        temperature: 0.3,
        streaming,
        callbacks: [],
      });
    } else {
      this.llm = new ChatAnthropic({
        apiKey,
        model: config.model,
        temperature: 0.3,
        streaming,
        callbacks: [],
      });
    }

    this.currentModel = model;
    this.currentApiKey = apiKey;
  }

  private buildPrompt(text: string, length: SummaryLength): string {
    return `You are **Walles**, an expert AI text summarization assistant.

## TASK
Transform the following text into a concise summary following these rules:

### Length: ${LENGTH_INSTRUCTIONS[length]}

### Always Include:
- Main topic/thesis
- Key facts and data points
- Important names, dates, conclusions
- Definitions of key terms if jargon present

### Always Exclude:
- Advertising and promotional content
- Cookie/GDPR notices
- Copyright and legal disclaimers
- "Subscribe to newsletter" prompts
- Navigation elements
- Duplicate information

### Output Format:
\`\`\`markdown
## [Topic Name]

**Summary**: Brief overview (2-3 sentences).

### Key Points
- Point 1
- Point 2
- Point 3

### Key Terms
- **Term**: Definition

### Conclusions
- Main conclusion
\`\`\`

---

TEXT TO SUMMARIZE:
---
${text}
---

Output your summary now:`;
  }

  async generateSummary(
    text: string,
    options: SummaryOptions = {},
    callbacks?: StreamingCallbacks
  ): Promise<SummaryResult> {
    const {
      model = 'gpt-3.5-turbo',
      length = 'medium',
      temperature = 0.3,
      apiKey,
      ollamaUrl = 'http://localhost:11434',
    } = options;

    if (!text || text.trim().length < 50) {
      throw new Error('Text must be at least 50 characters');
    }

    const config = this.getModelConfig(model);
    const prompt = this.buildPrompt(text, length);

    if (config.provider === 'ollama') {
      try {
        return await this.generateOllamaSummary(prompt, config.model, ollamaUrl);
      } catch (error: any) {
        if (callbacks?.onError) {
          callbacks.onError(error);
        }
        throw error;
      }
    }

    if (config.provider === 'huggingface') {
      if (!apiKey) {
        throw new Error('HuggingFace token is required for free HF models');
      }
      try {
        return await this.generateHuggingFaceSummary(prompt, config.model, apiKey);
      } catch (error: any) {
        if (callbacks?.onError) {
          callbacks.onError(error);
        }
        throw error;
      }
    }

    if (!apiKey) {
      throw new Error('API key is required for cloud models');
    }

    try {
      if (callbacks?.onChunk) {
        return await this.generateStreamingSummary(prompt, apiKey, model, config, callbacks);
      }

      return await this.generateNonStreamingSummary(prompt, apiKey, model, config, temperature);
    } catch (error: any) {
      if (callbacks?.onError) {
        callbacks.onError(error);
      }
      throw error;
    }
  }

  private async generateNonStreamingSummary(
    prompt: string,
    apiKey: string,
    model: AIModel,
    config: { provider: 'openai' | 'anthropic' | 'ollama' | 'huggingface'; model: string },
    temperature: number
  ): Promise<SummaryResult> {
    let llm: ChatOpenAI | ChatAnthropic;

    if (config.provider === 'openai') {
      llm = new ChatOpenAI({
        apiKey,
        model: config.model,
        temperature,
      });
    } else {
      llm = new ChatAnthropic({
        apiKey,
        model: config.model,
        temperature,
      });
    }

    const outputParser = new StringOutputParser();
    const chain = llm.pipe(outputParser);

    const response = await chain.invoke(prompt);

    return {
      summary: response,
      model: `${config.provider}:${config.model}`,
      finishReason: 'stop',
    };
  }

  private async generateStreamingSummary(
    prompt: string,
    apiKey: string,
    _model: AIModel,
    config: { provider: 'openai' | 'anthropic' | 'ollama' | 'huggingface'; model: string },
    callbacks: StreamingCallbacks
  ): Promise<SummaryResult> {
    return new Promise(async (resolve, reject) => {
      let llm: ChatOpenAI | ChatAnthropic;
      let fullResponse = '';

      if (config.provider === 'openai') {
        llm = new ChatOpenAI({
          apiKey,
          model: config.model,
          temperature: 0.3,
          streaming: true,
        });
      } else {
        llm = new ChatAnthropic({
          apiKey,
          model: config.model,
          temperature: 0.3,
          streaming: true,
        });
      }

      try {
        const stream = await llm.stream(prompt);
        
        try {
          for await (const chunk of stream) {
            const text = typeof chunk === 'string' 
              ? chunk 
              : (chunk as any).content || '';
            fullResponse += text;

            if (callbacks.onChunk) {
              callbacks.onChunk(text);
            }
          }

          const result: SummaryResult = {
            summary: fullResponse,
            model: `${config.provider}:${config.model}`,
            finishReason: 'stop',
          };

          if (callbacks.onDone) {
            callbacks.onDone(result);
          }

          resolve(result);
        } catch (streamError) {
          if (callbacks.onError) {
            callbacks.onError(streamError as Error);
          }
          reject(streamError);
        }
      } catch (error) {
        if (callbacks.onError) {
          callbacks.onError(error as Error);
        }
        reject(error);
      }
    });
  }

  async generateSummaryStream(
    text: string,
    options: SummaryOptions = {}
  ): Promise<ReadableStream<string>> {
    const {
      model = 'gpt-3.5-turbo',
      length = 'medium',
      apiKey,
    } = options;

    if (!apiKey) {
      throw new Error('API key is required');
    }

    const config = this.getModelConfig(model);
    const prompt = this.buildPrompt(text, length);

    let llm: ChatOpenAI | ChatAnthropic;

    if (config.provider === 'openai') {
      llm = new ChatOpenAI({
        apiKey,
        model: config.model,
        temperature: 0.3,
        streaming: true,
      });
    } else {
      llm = new ChatAnthropic({
        apiKey,
        model: config.model,
        temperature: 0.3,
        streaming: true,
      });
    }

    const stream = await llm.stream(prompt);

    return new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = typeof chunk === 'string' 
              ? chunk 
              : (chunk as any).content || '';
            controller.enqueue(text);
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
  }

  validateApiKey(apiKey: string, provider: 'openai' | 'anthropic' = 'openai'): Promise<boolean> {
    return new Promise(async (resolve) => {
      try {
        if (provider === 'openai') {
          const llm = new ChatOpenAI({
            apiKey,
            model: 'gpt-3.5-turbo',
            maxTokens: 5,
          });
          await llm.invoke('Hi');
          resolve(true);
        } else {
          const llm = new ChatAnthropic({
            apiKey,
            model: 'claude-3-haiku-20240307',
            maxTokens: 5,
          });
          await llm.invoke('Hi');
          resolve(true);
        }
      } catch {
        resolve(false);
      }
    });
  }

  getSupportedModels(): Array<{ id: AIModel; name: string; provider: string; free?: boolean }> {
    return [
      { id: 'gpt-4', name: 'GPT-4', provider: 'OpenAI' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'OpenAI' },
      { id: 'claude-3-opus', name: 'Claude 3 Opus', provider: 'Anthropic' },
      { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet', provider: 'Anthropic' },
      { id: 'free-llama', name: 'Llama 3.2 (Free)', provider: 'Ollama', free: true },
      { id: 'free-mistral', name: 'Mistral (Free)', provider: 'Ollama', free: true },
    ];
  }

  estimateCost(textLength: number, model: AIModel): { inputTokens: number; outputTokens: number; estimatedCost: number } {
    const inputTokens = Math.ceil(textLength / 4);
    const outputTokensMultiplier = { short: 0.02, medium: 0.05, long: 0.1 };
    const outputTokens = Math.ceil(inputTokens * 0.1);

    const pricing: Record<AIModel, { input: number; output: number }> = {
      'gpt-4': { input: 0.00003, output: 0.00006 },
      'gpt-3.5-turbo': { input: 0.0000005, output: 0.0000015 },
      'claude-3-opus': { input: 0.000015, output: 0.000075 },
      'claude-3-sonnet': { input: 0.000003, output: 0.000015 },
      'free-llama': { input: 0, output: 0 },
      'free-mistral': { input: 0, output: 0 },
      'hf-llama': { input: 0, output: 0 },
      'hf-mistral': { input: 0, output: 0 },
    };

    const { input: inputPrice, output: outputPrice } = pricing[model];
    const estimatedCost = (inputTokens * inputPrice) + (outputTokens * outputPrice);

    return {
      inputTokens,
      outputTokens,
      estimatedCost: Math.round(estimatedCost * 100000) / 100000,
    };
  }
}

export const summarizerService = new SummarizerService();
