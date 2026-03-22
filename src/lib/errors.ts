export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public isUserFriendly: boolean = true
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ParseError extends AppError {
  constructor(message: string, public originalError?: Error) {
    super(message, 'PARSE_ERROR', 422);
    this.name = 'ParseError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

export class ApiError extends AppError {
  constructor(
    message: string,
    public apiCode?: string,
    public originalError?: Error
  ) {
    super(message, 'API_ERROR', 502);
    this.name = 'ApiError';
  }
}

export class TokenLimitError extends AppError {
  constructor(message: string, public tokenCount?: number) {
    super(message, 'TOKEN_LIMIT', 413);
    this.name = 'TokenLimitError';
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Слишком много запросов. Попробуйте через минуту.') {
    super(message, 'RATE_LIMIT', 429);
    this.name = 'RateLimitError';
  }
}

export class NetworkError extends AppError {
  constructor(message: string = 'Нет соединения с интернетом') {
    super(message, 'NETWORK_ERROR', 0);
    this.isUserFriendly = false;
    this.name = 'NetworkError';
  }
}

export function getUserFriendlyMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes('fetch') || message.includes('network') || message.includes('enotfound')) {
      return 'Нет соединения с интернетом. Проверьте подключение.';
    }

    if (message.includes('timeout')) {
      return 'Превышено время ожидания. Попробуйте снова.';
    }

    if (message.includes('abort')) {
      return 'Запрос был отменен.';
    }

    return error.message;
  }

  return 'Произошла непредвиденная ошибка. Попробуйте снова.';
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof RateLimitError) return true;
  if (error instanceof NetworkError) return true;
  
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('timeout') || message.includes('network')) {
      return true;
    }
  }

  return false;
}

export function logError(error: unknown, context?: string): void {
  const timestamp = new Date().toISOString();
  const errorInfo = {
    timestamp,
    context,
    type: error instanceof Error ? error.name : 'Unknown',
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };

  console.error('[Error]', JSON.stringify(errorInfo, null, 2));

  if (typeof window === 'undefined') {
    console.error('[Server Error]', error);
  }
}
