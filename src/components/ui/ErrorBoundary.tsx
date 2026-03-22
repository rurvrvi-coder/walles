'use client';

import { Component, ReactNode, ErrorInfo } from 'react';
import { useToast } from './ToastContext';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[200px] flex items-center justify-center">
          <div className="text-center p-6 backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl max-w-md">
            <div className="w-12 h-12 mx-auto mb-4 bg-red-500/20 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Что-то пошло не так</h3>
            <p className="text-sm text-white/60 mb-4">
              {this.state.error?.message || 'Произошла непредвиденная ошибка'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Попробовать снова
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

interface ApiErrorHandlerProps {
  children: ReactNode;
}

interface ApiErrorHandlerState {
  isRetrying: boolean;
}

export class ApiErrorHandler extends Component<ApiErrorHandlerProps, ApiErrorHandlerState> {
  private toast: ReturnType<typeof useToast> | null = null;

  constructor(props: ApiErrorHandlerProps) {
    super(props);
    this.state = { isRetrying: false };
  }

  static getDerivedStateFromError(error: Error): ApiErrorHandlerState {
    return { isRetrying: false };
  }

  handleApiError(error: unknown, context?: string): void {
    if (typeof window !== 'undefined') {
      const { useToast: useToastHook } = require('./ToastContext');
      const toast = useToastHook();

      const errorMessages: Record<string, string> = {
        'PARSE_ERROR': 'Не удалось прочитать контент. Возможно, сайт защищен от ботов.',
        'VALIDATION_ERROR': 'Проверьте введенные данные.',
        'TOKEN_LIMIT': 'Текст слишком большой. Сократите объем и попробуйте снова.',
        'API_ERROR': 'Ошибка AI сервиса. Попробуйте позже.',
        'RATE_LIMIT': 'Слишком много запросов. Подождите минуту.',
        'NETWORK_ERROR': 'Нет соединения с интернетом. Проверьте подключение.',
      };

      let message = 'Произошла ошибка. Попробуйте снова.';
      let toastType: 'error' | 'warning' | 'info' = 'error';

      if (error instanceof Error) {
        const errorCode = (error as any).code || error.name;
        
        if (errorMessages[errorCode]) {
          message = errorMessages[errorCode];
        } else if (error.message.includes('404') || error.message.includes('Not Found')) {
          message = 'Ресурс не найден. Проверьте URL.';
        } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
          message = 'Доступ запрещен. Возможно, сайт блокирует запросы.';
        } else if (error.message.includes('500') || error.message.includes('Internal Server')) {
          message = 'Ошибка сервера. Попробуйте позже.';
        } else if (error.message.includes('timeout')) {
          message = 'Превышено время ожидания. Попробуйте снова.';
        } else if (error.message.includes('token') && error.message.includes('limit')) {
          message = 'Текст слишком большой. Сократите объем.';
        } else if (error.message.includes('rate')) {
          message = 'Слишком много запросов. Подождите минуту.';
        } else if (error.message.includes('api key') || error.message.includes('unauthorized')) {
          message = 'Неверный API ключ. Проверьте настройки.';
        } else if (error.message.includes('bot') || error.message.includes('crawl')) {
          message = 'Не удалось прочитать сайт. Возможно, он защищен от ботов.';
        }
      }

      toast[toastType](message, 7000);
    }

    console.error(`[API Error${context ? ` (${context})` : ''}:]`, error);
  }

  render(): ReactNode {
    return this.props.children;
  }
}

export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}
