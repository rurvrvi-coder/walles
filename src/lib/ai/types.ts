export type AIModel = 'gpt-4' | 'gpt-3.5-turbo' | 'claude-3-opus' | 'claude-3-sonnet' | 'free-llama' | 'free-mistral';

export type SummaryLength = 'short' | 'medium' | 'long';

export interface SummarizeRequest {
  text: string;
  model: AIModel;
  length: SummaryLength;
  apiKey?: string;
}

export interface AIResponse {
  summary: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  cost?: number;
}
