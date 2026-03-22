'use client';

import { useCallback } from 'react';
import { useToast } from '@/components/ui/ToastContext';
import { getUserFriendlyMessage } from '@/lib/errors';

export interface ApiError {
  code?: string;
  message: string;
  status?: number;
}

const ERROR_MESSAGES: Record<string, string> = {
  PARSE_ERROR: 'Не удалось прочитать контент. Возможно, сайт защищен от ботов.',
  VALIDATION_ERROR: 'Проверьте введенные данные.',
  TOKEN_LIMIT: 'Текст слишком большой. Сократите объем и попробуйте снова.',
  TOKEN_LIMIT_EXCEEDED: 'Текст слишком большой. Сократите объем и попробуйте снова.',
  API_ERROR: 'Ошибка AI сервиса. Попробуйте позже.',
  RATE_LIMIT: 'Слишком много запросов. Подождите минуту.',
  NETWORK_ERROR: 'Нет соединения с интернетом. Проверьте подключение.',
  INVALID_URL: 'Некорректный URL. Проверьте адрес.',
  BOT_DETECTED: 'Не удалось прочитать сайт. Возможно, он защищен от ботов.',
  404: 'Ресурс не найден. Проверьте URL.',
  403: 'Доступ запрещен. Возможно, сайт блокирует запросы.',
  429: 'Слишком много запросов. Подождите минуту.',
  500: 'Ошибка сервера. Попробуйте позже.',
  502: 'Сервис временно недоступен. Попробуйте позже.',
  503: 'Сервис перегружен. Попробуйте позже.',
  504: 'Превышено время ожидания. Попробуйте снова.',
};

function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;

  const err = error as ApiError;

  if (err.code && ERROR_MESSAGES[err.code]) {
    return ERROR_MESSAGES[err.code];
  }

  if (err.status && ERROR_MESSAGES[err.status.toString()]) {
    return ERROR_MESSAGES[err.status.toString()];
  }

  const message = err.message?.toLowerCase() || '';

  if (message.includes('404') || message.includes('not found')) {
    return ERROR_MESSAGES[404];
  }
  if (message.includes('403') || message.includes('forbidden') || message.includes('access denied')) {
    return ERROR_MESSAGES[403];
  }
  if (message.includes('429') || message.includes('rate limit')) {
    return ERROR_MESSAGES[429];
  }
  if (message.includes('500') || message.includes('internal server')) {
    return ERROR_MESSAGES[500];
  }
  if (message.includes('502') || message.includes('bad gateway')) {
    return ERROR_MESSAGES[502];
  }
  if (message.includes('503') || message.includes('service unavailable')) {
    return ERROR_MESSAGES[503];
  }
  if (message.includes('504') || message.includes('gateway timeout') || message.includes('timeout')) {
    return ERROR_MESSAGES[504];
  }
  if (message.includes('token') && (message.includes('limit') || message.includes('exceed'))) {
    return ERROR_MESSAGES.TOKEN_LIMIT;
  }
  if (message.includes('api key') || message.includes('unauthorized') || message.includes('invalid api')) {
    return 'Неверный API ключ. Проверьте настройки.';
  }
  if (message.includes('bot') || message.includes('crawl') || message.includes('blocked')) {
    return ERROR_MESSAGES.BOT_DETECTED;
  }
  if (message.includes('fetch') || message.includes('network') || message.includes('enotfound')) {
    return ERROR_MESSAGES.NETWORK_ERROR;
  }
  if (message.includes('abort')) {
    return 'Запрос был отменен.';
  }

  return getUserFriendlyMessage(error);
}

export function useApiError() {
  const toast = useToast();

  const handleError = useCallback((error: unknown, options?: {
    context?: string;
    duration?: number;
    action?: {
      label: string;
      onClick: () => void;
    };
  }) => {
    const message = getErrorMessage(error);

    console.error(`[API Error${options?.context ? ` (${options.context})` : ''}]`, error);

    toast.error(message, options?.duration);

    if (options?.action) {
      toast.addToast({
        type: 'info',
        message: '',
        duration: 0,
        action: options.action,
      });
    }
  }, [toast]);

  const handleSuccess = useCallback((message: string) => {
    toast.success(message);
  }, [toast]);

  const handleWarning = useCallback((message: string) => {
    toast.warning(message);
  }, [toast]);

  const handleInfo = useCallback((message: string) => {
    toast.info(message);
  }, [toast]);

  return {
    handleError,
    handleSuccess,
    handleWarning,
    handleInfo,
  };
}

export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  onError?: (error: unknown) => void
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    onError?.(error);
    return null;
  }
}
