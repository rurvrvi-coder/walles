'use client';

import { useState, useCallback } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { AIModel, SummaryLength } from '@/lib/ai/types';
import { cleanText } from '@/lib/parsers/textCleaner';
import { useApiError } from '@/hooks/useApiError';
import SidebarWidget from './SidebarWidget';
import History, { useLocalStorageHistory, HistoryItem } from './History';
import FileDropzone from './FileDropzone';

type InputMode = 'url' | 'text' | 'file';

interface SummaryResult {
  id: string;
  summary: string;
  model: string;
  tokens?: { input: number; output: number };
  cost?: number;
  createdAt: string;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-4 bg-white/10 rounded w-3/4" />
      <div className="h-4 bg-white/10 rounded w-1/2" />
      <div className="h-4 bg-white/10 rounded w-5/6" />
      <div className="h-4 bg-white/10 rounded w-2/3" />
      <div className="h-4 bg-white/10 rounded w-4/5" />
    </div>
  );
}

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split('\n');
  
  return (
    <div className="space-y-3">
      {lines.map((line, i) => {
        if (line.startsWith('## ')) {
          return (
            <h2 key={i} className="text-xl font-bold text-white mt-6 first:mt-0">
              {line.replace('## ', '')}
            </h2>
          );
        }
        if (line.startsWith('### ')) {
          return (
            <h3 key={i} className="text-lg font-semibold text-white/90 mt-4">
              {line.replace('### ', '')}
            </h3>
          );
        }
        if (line.startsWith('**') && line.endsWith('**')) {
          return (
            <p key={i} className="font-semibold text-white/80">
              {line.replace(/\*\*/g, '')}
            </p>
          );
        }
        if (line.startsWith('- ')) {
          return (
            <div key={i} className="flex gap-2 pl-4">
              <span className="text-indigo-400 mt-1">•</span>
              <p className="text-white/80">{line.replace('- ', '')}</p>
            </div>
          );
        }
        if (line.startsWith('```')) {
          return null;
        }
        if (line.trim() === '') {
          return <div key={i} className="h-2" />;
        }
        if (line.match(/^\d+\.\s/)) {
          return (
            <div key={i} className="flex gap-2 pl-4">
              <span className="text-indigo-400 font-medium">{line.match(/^\d+/)?.[0]}.</span>
              <p className="text-white/80">{line.replace(/^\d+\.\s/, '')}</p>
            </div>
          );
        }
        return (
          <p key={i} className="text-white/80 leading-relaxed">
            {line}
          </p>
        );
      })}
    </div>
  );
}

function WallesMain() {
  const [mode, setMode] = useState<InputMode>('url');
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);
  const [parsedText, setParsedText] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const { model, length, apiKey, ollamaUrl, setModel, setLength, setApiKey } = useSettingsStore();
  const { addItem } = useLocalStorageHistory();
  const { handleError, handleSuccess } = useApiError();

  const isFreeModel = model === 'free-llama' || model === 'free-mistral' || model === 'hf-llama' || model === 'hf-mistral';
  const isHuggingFace = model === 'hf-llama' || model === 'hf-mistral';

  const handleSummarize = useCallback(async () => {
    if (!apiKey && !isFreeModel) {
      handleError('Введите API ключ в настройках');
      setShowSettings(true);
      return;
    }

    let textToSummarize = parsedText || inputValue;

    if (!textToSummarize.trim()) {
      handleError('Введите текст или URL для суммаризации');
      return;
    }

    setIsLoading(true);
    setSummary(null);

    try {
      let text = textToSummarize;

      if (mode === 'url' && textToSummarize.startsWith('http')) {
        setIsParsing(true);
        const parseResponse = await fetch('/api/parse-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: textToSummarize }),
        });

        if (!parseResponse.ok) {
          const parseError = await parseResponse.json();
          throw new Error(parseError.error || 'Не удалось загрузить контент');
        }

        const parseData = await parseResponse.json();
        text = parseData.text;
        setIsParsing(false);
      }

      const cleaned = cleanText(text);
      text = cleaned.text;

      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          model,
          length,
          apiKey,
          ollamaUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при генерации');
      }

      setSummary(data);
      handleSuccess('Конспект успешно создан');
      
      addItem({
        originalText: text,
        summary: data.summary || data.text,
        model,
        length,
        sourceType: mode as 'url' | 'text' | 'file',
        sourceUrl: mode === 'url' ? inputValue : undefined,
      });
    } catch (err: any) {
      handleError(err, { context: 'Суммаризация' });
    } finally {
      setIsLoading(false);
      setIsParsing(false);
    }
  }, [apiKey, parsedText, inputValue, mode, model, length, addItem, handleError, handleSuccess]);

  const handleCopy = useCallback(async () => {
    if (summary?.summary) {
      await navigator.clipboard.writeText(summary.summary);
      setCopied(true);
      handleSuccess('Скопировано в буфер обмена');
      setTimeout(() => setCopied(false), 2000);
    }
  }, [summary, handleSuccess]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSummarize();
    }
  }, [handleSummarize]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-violet-500/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10">
        <header className="border-b border-white/10 backdrop-blur-xl bg-white/5">
          <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/25">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-white">Walles</h1>
              <span className="text-xs text-white/40 bg-white/5 px-2 py-1 rounded-full">AI Summarizer</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={`p-2.5 rounded-xl transition-all ${
                  showHistory 
                    ? 'text-white bg-white/10' 
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              
              <button
                onClick={() => setShowSettings(true)}
                className="p-2.5 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-all"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-6 py-10">
          <div className="text-center mb-10">
            <h2 className="text-4xl font-bold text-white mb-3">Создайте конспект за секунды</h2>
            <p className="text-white/50 text-lg">Вставьте URL или текст — получите краткое содержание с помощью AI</p>
          </div>

          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-8 shadow-2xl shadow-indigo-500/10">
            <div className="flex gap-2 p-1.5 bg-white/5 rounded-2xl mb-6">
              <button
                onClick={() => setMode('url')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${
                  mode === 'url'
                    ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/25'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                URL
              </button>
              <button
                onClick={() => setMode('text')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${
                  mode === 'text'
                    ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/25'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Текст
              </button>
              <button
                onClick={() => setMode('file')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${
                  mode === 'file'
                    ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/25'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                Файл
              </button>
            </div>

            <div className="relative">
              {mode === 'url' ? (
                <div className="relative">
                  <input
                    type="url"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="https://example.com/article"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-white/30 outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all pr-12"
                  />
                  <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                  </svg>
                </div>
              ) : mode === 'file' ? (
                <FileDropzone
                  onFileUploaded={(result) => {
                    setParsedText(result.text);
                  }}
                  className="mt-4"
                />
              ) : (
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Вставьте текст для суммаризации..."
                  rows={8}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-white/30 outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all resize-none"
                />
              )}
              {inputValue && (
                <button
                  onClick={() => { setInputValue(''); setParsedText(null); setSummary(null); }}
                  className="absolute right-3 top-3 p-1.5 text-white/40 hover:text-white/60 hover:bg-white/5 rounded-lg transition-all"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            <button
              onClick={handleSummarize}
              disabled={isLoading || isParsing || (!inputValue.trim() && !parsedText)}
              className="mt-6 w-full py-4 px-6 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-2xl shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-all flex items-center justify-center gap-2"
            >
              {isLoading || isParsing ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {isParsing ? 'Загрузка контента...' : 'Генерация...'}
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Сделать конспект
                  <span className="text-xs opacity-60 ml-1">Ctrl+Enter</span>
                </>
              )}
            </button>
          </div>

          {showHistory && (
            <div className="mb-8">
              <History />
            </div>
          )}

          {(isLoading || summary) && (
            <div className="mt-8 backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-8 shadow-2xl shadow-indigo-500/10">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Результат
                </h3>
                {summary && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/40">{summary.model}</span>
                    <button
                      onClick={handleCopy}
                      className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                    >
                      {copied ? (
                        <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                  </div>
                )}
              </div>

              <div className="min-h-[200px]">
                {isLoading ? (
                  <LoadingSkeleton />
                ) : summary ? (
                  <MarkdownRenderer content={summary.summary} />
                ) : null}
              </div>

              {summary && (
                <div className="mt-6 pt-6 border-t border-white/10 flex items-center gap-4 text-xs text-white/40">
                  {summary.tokens && (
                    <span>Токены: {summary.tokens.input + summary.tokens.output}</span>
                  )}
                  {summary.cost && (
                    <span>Примерная стоимость: ${summary.cost.toFixed(5)}</span>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-12 grid grid-cols-3 gap-4 text-center">
            {[
              { icon: '⚡', title: 'Быстро', desc: 'Конспект за секунды' },
              { icon: '🎯', title: 'Точно', desc: 'Сохраняет ключевые факты' },
              { icon: '🔒', title: 'Приватно', desc: 'Ваши данные не хранятся' },
            ].map((feature, i) => (
              <div key={i} className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5">
                <div className="text-2xl mb-2">{feature.icon}</div>
                <div className="font-semibold text-white">{feature.title}</div>
                <div className="text-xs text-white/40">{feature.desc}</div>
              </div>
            ))}
          </div>
        </main>

        <footer className="text-center py-8 text-white/30 text-sm">
          Walles © 2024 — AI Text Summarizer
        </footer>
      </div>

      {showSettings && (
        <SettingsModal
          model={model}
          length={length}
          apiKey={apiKey}
          ollamaUrl={ollamaUrl}
          onModelChange={setModel}
          onLengthChange={setLength}
          onApiKeyChange={setApiKey}
          onOllamaUrlChange={(url) => useSettingsStore.getState().setOllamaUrl(url)}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

function SettingsModal({
  model,
  length,
  apiKey,
  ollamaUrl,
  onModelChange,
  onLengthChange,
  onApiKeyChange,
  onOllamaUrlChange,
  onClose,
}: {
  model: AIModel;
  length: SummaryLength;
  apiKey: string;
  ollamaUrl: string;
  onModelChange: (m: AIModel) => void;
  onLengthChange: (l: SummaryLength) => void;
  onApiKeyChange: (k: string) => void;
  onOllamaUrlChange: (u: string) => void;
  onClose: () => void;
}) {
  const models: { value: AIModel; label: string; provider: string; free?: boolean }[] = [
    { value: 'gpt-4', label: 'GPT-4', provider: 'OpenAI' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', provider: 'OpenAI' },
    { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet', provider: 'Anthropic' },
    { value: 'claude-3-opus', label: 'Claude 3 Opus', provider: 'Anthropic' },
    { value: 'free-llama', label: 'Llama 3.2', provider: 'Ollama (Free)', free: true },
    { value: 'free-mistral', label: 'Mistral', provider: 'Ollama (Free)', free: true },
    { value: 'hf-llama', label: 'Qwen 0.5B (HF)', provider: 'HuggingFace (Free)', free: true },
    { value: 'hf-mistral', label: 'Qwen 1.5B (HF)', provider: 'HuggingFace (Free)', free: true },
  ];

  const isFreeModel = model === 'free-llama' || model === 'free-mistral' || model === 'hf-llama' || model === 'hf-mistral';
  const isHuggingFace = model === 'hf-llama' || model === 'hf-mistral';

  const lengths: { value: SummaryLength; label: string }[] = [
    { value: 'short', label: 'Короткий' },
    { value: 'medium', label: 'Средний' },
    { value: 'long', label: 'Подробный' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      
      <div className="relative w-full max-w-md backdrop-blur-xl bg-slate-900/90 border border-white/10 rounded-3xl p-8 shadow-2xl">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-bold text-white">Настройки</h2>
          <button onClick={onClose} className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-all">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-white/80 mb-3">API Ключ</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder="sk-..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 outline-none focus:border-indigo-500/50 transition-all"
            />
            <p className="mt-2 text-xs text-white/40">Ключ хранится локально в браузере</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-3">Модель</label>
            <div className="grid grid-cols-2 gap-2">
              {models.map((m) => (
                <button
                  key={m.value}
                  onClick={() => onModelChange(m.value)}
                  className={`px-4 py-3 rounded-xl text-sm font-medium transition-all text-left ${
                    model === m.value
                      ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white'
                      : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {m.label}
                  <span className="block text-xs opacity-50">{m.provider}</span>
                </button>
              ))}
            </div>
          </div>

          {isFreeModel && !isHuggingFace && (
            <div>
              <label className="block text-sm font-medium text-white/80 mb-3">Ollama URL</label>
              <input
                type="text"
                value={ollamaUrl}
                onChange={(e) => onOllamaUrlChange(e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 outline-none focus:border-indigo-500/50 transition-all"
              />
              <p className="mt-2 text-xs text-white/40">Убедитесь, что Ollama запущен локально</p>
            </div>
          )}

          {isHuggingFace && (
            <div>
              <label className="block text-sm font-medium text-white/80 mb-3">HuggingFace Token</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                placeholder="hf_..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 outline-none focus:border-indigo-500/50 transition-all"
              />
              <p className="mt-2 text-xs text-white/40">Бесплатный токен с huggingface.co</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-white/80 mb-3">Длина конспекта</label>
            <div className="flex gap-2">
              {lengths.map((l) => (
                <button
                  key={l.value}
                  onClick={() => onLengthChange(l.value)}
                  className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    length === l.value
                      ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white'
                      : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-8 w-full py-3 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl transition-all"
        >
          Сохранить
        </button>
      </div>
    </div>
  );
}

export default function WallesClient() {
  return (
    <>
      <WallesMain />
      <SidebarWidget position="right" />
    </>
  );
}
