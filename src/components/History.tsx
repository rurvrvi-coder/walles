'use client';

import { useState, useCallback, useEffect } from 'react';
import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';

export interface HistoryItem {
  id: string;
  originalText: string;
  summary: string;
  model: string;
  length: string;
  createdAt: string;
  sourceType?: 'url' | 'text' | 'file';
  sourceUrl?: string;
  sourceName?: string;
}

interface HistoryStore {
  items: HistoryItem[];
  addItem: (item: Omit<HistoryItem, 'id' | 'createdAt'>) => void;
  removeItem: (id: string) => void;
  clearAll: () => void;
}

function useLocalStorageHistory(): HistoryStore {
  const STORAGE_KEY = 'walles-history';
  const MAX_ITEMS = 10;

  const [items, setItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setItems(JSON.parse(stored));
      } catch {
        setItems([]);
      }
    }
  }, []);

  const saveItems = useCallback((newItems: HistoryItem[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newItems));
    setItems(newItems);
  }, []);

  const addItem = useCallback((item: Omit<HistoryItem, 'id' | 'createdAt'>) => {
    const newItem: HistoryItem = {
      ...item,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
    };

    setItems((prev) => {
      const updated = [newItem, ...prev].slice(0, MAX_ITEMS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearAll = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setItems([]);
  }, []);

  return { items, addItem, removeItem, clearAll };
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Только что';
  if (diffMins < 60) return `${diffMins} мин. назад`;
  if (diffHours < 24) return `${diffHours} ч. назад`;
  if (diffDays < 7) return `${diffDays} дн. назад`;

  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function formatModelName(model: string): string {
  const names: Record<string, string> = {
    'gpt-4': 'GPT-4',
    'gpt-3.5-turbo': 'GPT-3.5',
    'claude-3-opus': 'Claude Opus',
    'claude-3-sonnet': 'Claude Sonnet',
  };
  return names[model] || model;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function exportToMarkdown(item: HistoryItem): void {
  const content = `# Walles Summary

**Дата:** ${new Date(item.createdAt).toLocaleString('ru-RU')}
**Модель:** ${formatModelName(item.model)}
**Длина:** ${item.length}
${item.sourceUrl ? `**Источник:** ${item.sourceUrl}` : ''}
${item.sourceName ? `**Файл:** ${item.sourceName}` : ''}

---

## Резюме

${item.summary}

---

## Оригинал

${item.originalText.slice(0, 500)}${item.originalText.length > 500 ? '\n\n_(текст обрезан)_' : ''}

---

_Экспортировано из Walles_
`;

  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const filename = `walles-summary-${Date.now()}.md`;
  saveAs(blob, filename);
}

function exportToPdf(item: HistoryItem): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Walles Summary', margin, y);
  y += 12;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);

  doc.text(`Дата: ${new Date(item.createdAt).toLocaleString('ru-RU')}`, margin, y);
  y += 6;
  doc.text(`Модель: ${formatModelName(item.model)}`, margin, y);
  y += 6;
  doc.text(`Длина: ${item.length}`, margin, y);

  if (item.sourceUrl) {
    y += 6;
    doc.text(`Источник: ${item.sourceUrl}`, margin, y);
  }

  if (item.sourceName) {
    y += 6;
    doc.text(`Файл: ${item.sourceName}`, margin, y);
  }

  y += 10;
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  doc.setTextColor(0);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Резюме', margin, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  const summaryLines = doc.splitTextToSize(item.summary, contentWidth);
  
  for (const line of summaryLines) {
    if (y > 270) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += 5;
  }

  y += 10;
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text('Экспортировано из Walles', margin, y);

  const filename = `walles-summary-${Date.now()}.pdf`;
  doc.save(filename);
}

interface HistoryItemCardProps {
  item: HistoryItem;
  onRemove: () => void;
  onCopy: () => void;
}

function HistoryItemCard({ item, onRemove, onCopy }: HistoryItemCardProps) {
  const [copied, setCopied] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(item.summary);
    if (success) {
      setCopied(true);
      onCopy();
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:bg-white/10 transition-all">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-white/40 mb-2">
              <span>{formatDate(item.createdAt)}</span>
              <span>•</span>
              <span>{formatModelName(item.model)}</span>
              <span>•</span>
              <span className="capitalize">{item.length}</span>
            </div>

            <div className="text-white/80 text-sm line-clamp-3">
              {item.summary}
            </div>

            {item.sourceUrl && (
              <div className="mt-2 text-xs text-indigo-400 truncate">
                {item.sourceUrl}
              </div>
            )}

            {item.sourceName && (
              <div className="mt-2 text-xs text-indigo-400">
                📄 {item.sourceName}
              </div>
            )}
          </div>

          <button
            onClick={onRemove}
            className="p-1.5 text-white/30 hover:text-white/60 hover:bg-white/10 rounded-lg transition-all flex-shrink-0"
            title="Удалить"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="px-4 py-3 bg-white/5 border-t border-white/5 flex items-center gap-2">
        <button
          onClick={handleCopy}
          className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            copied
              ? 'bg-green-500/20 text-green-400'
              : 'bg-white/5 hover:bg-white/10 text-white/70'
          }`}
        >
          {copied ? (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Скопировано
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Копировать
            </>
          )}
        </button>

        <button
          onClick={() => exportToMarkdown(item)}
          className="flex-1 px-3 py-2 text-xs font-medium bg-white/5 hover:bg-white/10 text-white/70 rounded-lg transition-all flex items-center justify-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          MD
        </button>

        <button
          onClick={() => exportToPdf(item)}
          className="flex-1 px-3 py-2 text-xs font-medium bg-white/5 hover:bg-white/10 text-white/70 rounded-lg transition-all flex items-center justify-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          PDF
        </button>

        <button
          onClick={() => setShowOriginal(!showOriginal)}
          className="px-3 py-2 text-xs font-medium bg-white/5 hover:bg-white/10 text-white/70 rounded-lg transition-all"
          title="Показать оригинал"
        >
          {showOriginal ? '▲' : '▼'}
        </button>
      </div>

      {showOriginal && (
        <div className="px-4 py-3 bg-black/20 border-t border-white/5">
          <p className="text-xs text-white/50 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
            {item.originalText.slice(0, 1000)}
            {item.originalText.length > 1000 && '...'}
          </p>
        </div>
      )}
    </div>
  );
}

interface HistoryProps {
  onItemSelect?: (item: HistoryItem) => void;
}

export default function History({ onItemSelect }: HistoryProps) {
  const { items, removeItem, clearAll } = useLocalStorageHistory();
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleCopy = useCallback(() => {
    // Can add analytics or toast notification here
  }, []);

  if (items.length === 0) {
    return (
      <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-white/5 rounded-2xl flex items-center justify-center">
          <svg className="w-8 h-8 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-white font-medium mb-1">История пуста</h3>
        <p className="text-white/40 text-sm">
          Здесь появятся ваши последние конспекты
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          История
          <span className="text-sm font-normal text-white/40">({items.length})</span>
        </h3>

        {showClearConfirm ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowClearConfirm(false)}
              className="px-3 py-1.5 text-xs text-white/60 hover:text-white"
            >
              Отмена
            </button>
            <button
              onClick={() => {
                clearAll();
                setShowClearConfirm(false);
              }}
              className="px-3 py-1.5 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg"
            >
              Подтвердить
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="px-3 py-1.5 text-xs text-white/40 hover:text-white/60 transition-colors"
          >
            Очистить всё
          </button>
        )}
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <HistoryItemCard
            key={item.id}
            item={item}
            onRemove={() => removeItem(item.id)}
            onCopy={handleCopy}
          />
        ))}
      </div>
    </div>
  );
}

export { useLocalStorageHistory };
