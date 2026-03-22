// Database enum types (from Prisma)
export type DbAIModel = 'GPT_4' | 'GPT_3_5_TURBO' | 'CLAUDE_3_OPUS' | 'CLAUDE_3_SONNET';
export type DbSummaryLength = 'SHORT' | 'MEDIUM' | 'LONG';
export type DbSourceType = 'URL' | 'PDF' | 'TEXT';
export type DbAuthProvider = 'LOCAL' | 'GOOGLE' | 'GITHUB';

// API enum types (from frontend)
export type ApiAIModel = 'gpt-4' | 'gpt-3.5-turbo' | 'claude-3-opus' | 'claude-3-sonnet';
export type ApiSummaryLength = 'short' | 'medium' | 'long';

// Mapping functions
export const modelToDb: Record<ApiAIModel, DbAIModel> = {
  'gpt-4': 'GPT_4',
  'gpt-3.5-turbo': 'GPT_3_5_TURBO',
  'claude-3-opus': 'CLAUDE_3_OPUS',
  'claude-3-sonnet': 'CLAUDE_3_SONNET',
};

export const modelFromDb: Record<DbAIModel, ApiAIModel> = {
  GPT_4: 'gpt-4',
  GPT_3_5_TURBO: 'gpt-3.5-turbo',
  CLAUDE_3_OPUS: 'claude-3-opus',
  CLAUDE_3_SONNET: 'claude-3-sonnet',
};

export const lengthToDb: Record<ApiSummaryLength, DbSummaryLength> = {
  short: 'SHORT',
  medium: 'MEDIUM',
  long: 'LONG',
};

export const lengthFromDb: Record<DbSummaryLength, ApiSummaryLength> = {
  SHORT: 'short',
  MEDIUM: 'medium',
  LONG: 'long',
};
