'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { cleanText } from '@/lib/parsers/textCleaner';
import { useSettingsStore } from '@/stores/settingsStore';

interface SidebarWidgetProps {
  apiEndpoint?: string;
  position?: 'left' | 'right';
  iconSize?: 'sm' | 'md' | 'lg';
}

interface CleanResult {
  text: string;
  removedItems: {
    emojis: number;
    socialLinks: number;
    legalDisclaimers: number;
    cookieBanners: number;
    duplicateLines: number;
    totalCharsRemoved: number;
  };
}

export default function SidebarWidget({
  apiEndpoint = '/api/summarize',
  position = 'right',
  iconSize = 'md',
}: SidebarWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [cleanResult, setCleanResult] = useState<CleanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { model, length, apiKey } = useSettingsStore();

  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-14 h-14',
    lg: 'w-16 h-16',
  };

  const iconSizes = {
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
    lg: 'w-7 h-7',
  };

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInputValue(text);
    } catch (err) {
      console.error('Failed to read clipboard');
    }
  }, []);

  const handleSelectText = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      setInputValue(selection.toString().trim());
    }
  }, []);

  const handleClean = useCallback(() => {
    if (!inputValue.trim()) return;

    const cleaned = cleanText(inputValue);
    const cleanResult: CleanResult = {
      text: cleaned.text,
      removedItems: cleaned.removedItems,
    };
    setCleanResult(cleanResult);
  }, [inputValue]);

  const handleSummarize = useCallback(async () => {
    if (!inputValue.trim()) return;

    if (!apiKey) {
      setError('Укажите API ключ в настройках');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    const textToSend = cleanResult?.text || inputValue;

    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToSend,
          model,
          length,
          apiKey,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при генерации');
      }

      setResult(data.summary || data.text);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, cleanResult, apiEndpoint, apiKey, model, length]);

  const handleClear = useCallback(() => {
    setInputValue('');
    setResult(null);
    setCleanResult(null);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setIsMinimized(true);
  }, []);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, handleClose]);

  return (
    <>
      <div
        className={`fixed top-1/2 -translate-y-1/2 z-50 flex items-center gap-2 ${
          position === 'right' ? 'right-4' : 'left-4'
        }`}
      >
        {!isOpen && (
          <button
            onClick={() => setIsOpen(true)}
            className={`
              ${sizeClasses[iconSize]}
              bg-gradient-to-br from-indigo-500 to-violet-600 
              hover:from-indigo-600 hover:to-violet-700
              rounded-2xl shadow-lg shadow-indigo-500/30
              flex items-center justify-center
              transition-all duration-300 hover:scale-110 hover:shadow-xl
              group
            `}
            title="Открыть Walles"
          >
            <svg
              className={`${iconSizes[iconSize]} text-white transition-transform group-hover:scale-110`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </button>
        )}

        {isOpen && (
          <div
            className={`
              backdrop-blur-xl bg-slate-900/95 border border-white/10
              rounded-2xl shadow-2xl shadow-indigo-500/20
              transition-all duration-300 ease-out
              ${isMinimized ? 'w-80' : 'w-96'}
              max-h-[90vh] overflow-hidden
              flex flex-col
            `}
          >
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-white font-semibold">Walles</h3>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                  title={isMinimized ? 'Развернуть' : 'Свернуть'}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isMinimized ? 'M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4' : 'M20 12H4'} />
                  </svg>
                </button>
                <button
                  onClick={handleClose}
                  className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                  title="Закрыть"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {!isMinimized && (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="flex gap-2">
                  <button
                    onClick={handlePaste}
                    className="flex-1 px-3 py-2 text-xs font-medium text-white/70 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Вставить
                  </button>
                  <button
                    onClick={handleSelectText}
                    className="flex-1 px-3 py-2 text-xs font-medium text-white/70 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                    </svg>
                    Выделенное
                  </button>
                </div>

                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Вставьте текст или URL..."
                    rows={6}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all resize-none text-sm"
                  />
                  {inputValue && (
                    <button
                      onClick={() => setInputValue('')}
                      className="absolute right-2 top-2 p-1 text-white/30 hover:text-white/60 hover:bg-white/5 rounded transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleClean}
                    disabled={!inputValue.trim()}
                    className="flex-1 px-3 py-2.5 text-sm font-medium text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed border border-amber-500/20 rounded-xl transition-all flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Очистить мусор
                  </button>
                  <button
                    onClick={handleSummarize}
                    disabled={!inputValue.trim() || isLoading}
                    className="flex-1 px-3 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all flex items-center justify-center gap-1.5"
                  >
                    {isLoading ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Генерация...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Конспект
                      </>
                    )}
                  </button>
                </div>

                {cleanResult && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-sm font-medium text-emerald-400">Очистка завершена</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-white/60">
                      {cleanResult.removedItems.emojis > 0 && (
                        <span>Эмодзи: -{cleanResult.removedItems.emojis}</span>
                      )}
                      {cleanResult.removedItems.socialLinks > 0 && (
                        <span>Соцсети: -{cleanResult.removedItems.socialLinks}</span>
                      )}
                      {cleanResult.removedItems.legalDisclaimers > 0 && (
                        <span>Дисклеймеры: -{cleanResult.removedItems.legalDisclaimers}</span>
                      )}
                      {cleanResult.removedItems.cookieBanners > 0 && (
                        <span>Cookie: -{cleanResult.removedItems.cookieBanners}</span>
                      )}
                      <span className="col-span-2">
                        Удалено: -{cleanResult.removedItems.totalCharsRemoved} символов
                      </span>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
                    {error}
                  </div>
                )}

                {result && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white/80">Результат</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(result)}
                        className="text-xs text-indigo-400 hover:text-indigo-300"
                      >
                        Копировать
                      </button>
                    </div>
                    <div className="p-3 bg-white/5 rounded-xl text-sm text-white/80 whitespace-pre-wrap max-h-48 overflow-y-auto">
                      {result}
                    </div>
                  </div>
                )}
              </div>
            )}

            {isMinimized && isOpen && (
              <div className="p-4 pt-0 flex items-center justify-center">
                <span className="text-xs text-white/40">Свернуто</span>
              </div>
            )}
          </div>
        )}
      </div>

      {isOpen && (
        <button
          onClick={handleClose}
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm -z-10"
          aria-label="Закрыть виджет"
        />
      )}
    </>
  );
}
