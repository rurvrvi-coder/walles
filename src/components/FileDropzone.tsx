'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface FileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  extension: string;
  preview?: string;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'done' | 'error';
  error?: string;
  result?: ParsedFileResult;
}

interface ParsedFileResult {
  text: string;
  metadata?: {
    title?: string;
    author?: string;
    pageCount?: number;
  };
  wordCount: number;
}

interface DropzoneProps {
  onFileUploaded?: (result: ParsedFileResult, file: File) => void;
  onFileRemoved?: (fileId: string) => void;
  maxFileSize?: number;
  apiEndpoint?: string;
  className?: string;
}

const SUPPORTED_TYPES = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.epub': 'application/epub+zip',
};

const ACCEPTED_EXTENSIONS = Object.keys(SUPPORTED_TYPES).join(',');
const MAX_FILE_SIZE_DEFAULT = 25 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileIcon(extension: string) {
  switch (extension) {
    case '.pdf':
      return (
        <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6M9 17h4" />
        </svg>
      );
    case '.txt':
      return (
        <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case '.epub':
      return (
        <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      );
    default:
      return (
        <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      );
  }
}

export default function FileDropzone({
  onFileUploaded,
  onFileRemoved,
  maxFileSize = MAX_FILE_SIZE_DEFAULT,
  apiEndpoint = '/api/parse-file',
  className = '',
}: DropzoneProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): string | null => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!SUPPORTED_TYPES[ext as keyof typeof SUPPORTED_TYPES]) {
      return `Неподдерживаемый тип файла. Доступны: ${ACCEPTED_EXTENSIONS}`;
    }

    if (file.size > maxFileSize) {
      return `Файл слишком большой. Максимум: ${formatFileSize(maxFileSize)}`;
    }

    return null;
  }, [maxFileSize]);

  const generatePreview = useCallback(async (file: File): Promise<string | undefined> => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();

    if (ext === '.txt') {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const text = reader.result as string;
          resolve(text.slice(0, 500) + (text.length > 500 ? '...' : ''));
        };
        reader.onerror = () => resolve(undefined);
        reader.readAsText(file);
      });
    }

    if (ext === '.pdf') {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;
          resolve(base64);
        };
        reader.onerror = () => resolve(undefined);
        reader.readAsDataURL(file);
      });
    }

    return undefined;
  }, []);

  const uploadFile = useCallback(async (fileItem: FileItem) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileItem.id ? { ...f, status: 'uploading' as const, progress: 0 } : f
      )
    );

    try {
      const formData = new FormData();
      formData.append('file', fileItem.file);

      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileItem.id ? { ...f, progress } : f
            )
          );
        }
      };

      const result = await new Promise<ParsedFileResult>((resolve, reject) => {
        xhr.onload = async () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const response = JSON.parse(xhr.responseText);
            
            setFiles((prev) =>
              prev.map((f) =>
                f.id === fileItem.id ? { ...f, status: 'processing' as const, progress: 100 } : f
              )
            );

            const parsedResult: ParsedFileResult = {
              text: response.text || response.content || '',
              metadata: response.metadata || response,
              wordCount: response.stats?.wordCount || response.text?.split(/\s+/).length || 0,
            };

            resolve(parsedResult);
          } else {
            reject(new Error(xhr.statusText || 'Upload failed'));
          }
        };

        xhr.onerror = () => reject(new Error('Network error'));
        xhr.ontimeout = () => reject(new Error('Upload timeout'));

        xhr.open('POST', apiEndpoint);
        xhr.timeout = 120000;
        xhr.send(formData);
      });

      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileItem.id
            ? { ...f, status: 'done' as const, result }
            : f
        )
      );

      onFileUploaded?.(result, fileItem.file);
    } catch (error: any) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileItem.id
            ? { ...f, status: 'error' as const, error: error.message }
            : f
        )
      );
    }
  }, [apiEndpoint, onFileUploaded]);

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList) return;

    const newFiles: FileItem[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const error = validateFile(file);

      if (error) {
        console.error(error);
        continue;
      }

      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const fileItem: FileItem = {
        id,
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        extension: ext,
        progress: 0,
        status: 'pending',
      };

      newFiles.push(fileItem);
    }

    if (newFiles.length === 0) return;

    setFiles((prev) => [...prev, ...newFiles]);

    for (const fileItem of newFiles) {
      const preview = await generatePreview(fileItem.file);
      
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileItem.id ? { ...f, preview } : f
        )
      );

      uploadFile(fileItem);
    }
  }, [validateFile, generatePreview, uploadFile]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter((prev) => prev + 1);
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter((prev) => {
      const newCounter = prev - 1;
      if (newCounter === 0) {
        setIsDragging(false);
      }
      return newCounter;
    });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setDragCounter(0);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      e.target.value = '';
    }
  }, [handleFiles]);

  const removeFile = useCallback((fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    onFileRemoved?.(fileId);
  }, [onFileRemoved]);

  const clearCompleted = useCallback(() => {
    setFiles((prev) => prev.filter((f) => f.status !== 'done'));
  }, []);

  return (
    <div className={`space-y-4 ${className}`}>
      <div
        ref={dropzoneRef}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer
          transition-all duration-200 ease-out
          ${isDragging
            ? 'border-indigo-500 bg-indigo-500/10 scale-[1.02]'
            : 'border-white/20 hover:border-white/40 hover:bg-white/5'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="space-y-4">
          <div className={`mx-auto w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${
            isDragging ? 'bg-indigo-500/20' : 'bg-white/5'
          }`}>
            <svg
              className={`w-8 h-8 transition-colors ${isDragging ? 'text-indigo-400' : 'text-white/40'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>

          <div>
            <p className="text-white/80 font-medium">
              {isDragging ? 'Отпустите файлы здесь' : 'Перетащите файлы или нажмите для выбора'}
            </p>
            <p className="text-white/40 text-sm mt-1">
              PDF, TXT, EPUB до {formatFileSize(maxFileSize)}
            </p>
          </div>
        </div>

        {isDragging && (
          <div className="absolute inset-0 bg-indigo-500/5 rounded-2xl pointer-events-none" />
        )}
      </div>

      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-white/60">
              Файлы ({files.filter((f) => f.status === 'done').length}/{files.length})
            </h4>
            {files.some((f) => f.status === 'done') && (
              <button
                onClick={clearCompleted}
                className="text-xs text-white/40 hover:text-white/60 transition-colors"
              >
                Очистить завершённые
              </button>
            )}
          </div>

          <div className="space-y-2">
            {files.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                onRemove={() => removeFile(file.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FileCard({
  file,
  onRemove,
}: {
  file: FileItem;
  onRemove: () => void;
}) {
  const [showPreview, setShowPreview] = useState(false);

  const statusConfig = {
    pending: { color: 'text-yellow-400', label: 'Ожидание' },
    uploading: { color: 'text-blue-400', label: 'Загрузка' },
    processing: { color: 'text-purple-400', label: 'Обработка' },
    done: { color: 'text-green-400', label: 'Готово' },
    error: { color: 'text-red-400', label: 'Ошибка' },
  };

  const status = statusConfig[file.status];

  return (
    <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-4 transition-all hover:bg-white/10">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          {getFileIcon(file.extension)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-white font-medium truncate">{file.name}</p>
            <button
              onClick={onRemove}
              className="p-1 text-white/40 hover:text-white/60 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-3 mt-1 text-xs">
            <span className="text-white/40">{formatFileSize(file.size)}</span>
            <span className={`${status.color}`}>{status.label}</span>
            {file.result?.wordCount && (
              <span className="text-white/30">{file.result.wordCount} слов</span>
            )}
          </div>

          {(file.status === 'uploading' || file.status === 'processing') && (
            <div className="mt-3">
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
                  style={{ width: `${file.progress}%` }}
                />
              </div>
              <p className="text-xs text-white/40 mt-1">{file.progress}%</p>
            </div>
          )}

          {file.status === 'error' && (
            <p className="text-xs text-red-400 mt-2">{file.error}</p>
          )}

          {file.status === 'done' && file.preview && file.extension === '.txt' && (
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="text-xs text-indigo-400 hover:text-indigo-300 mt-2"
            >
              {showPreview ? 'Скрыть превью' : 'Показать превью'}
            </button>
          )}
        </div>
      </div>

      {showPreview && file.preview && (
        <div className="mt-4 p-3 bg-black/20 rounded-lg">
          <p className="text-xs text-white/60 whitespace-pre-wrap font-mono">
            {file.preview}
          </p>
        </div>
      )}
    </div>
  );
}
