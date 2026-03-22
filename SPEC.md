# Walles — AI Text Summarizer

## 1. Концепция и Видение

Минималистичный AI-саммаризатор с тремя режимами ввода: URL, PDF, текст. Фокус на скорости и чистом UX без лишних действий. Интерфейс в духе современных AI-тулзов — одна колонка, фокус на контенте, результат появляется мгновенно.

## 2. Архитектура

### Tech Stack
```
Frontend:  Next.js 14+ (App Router), TypeScript, TailwindCSS
Backend:   Node.js API Routes (внутри Next.js)
AI APIs:   OpenAI GPT-4 / Anthropic Claude (абстракция для легкой смены)
Parsing:   Cheerio (HTML), pdf-parse (PDF)
State:     Zustand
Forms:     React Hook Form + Zod
```

### Структура папок
```
walles/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root layout (providers, fonts)
│   │   ├── page.tsx                  # Main page
│   │   ├── globals.css               # Tailwind imports
│   │   └── api/
│   │       ├── summarize/
│   │       │   └── route.ts           # POST /api/summarize
│   │       └── parse/
│   │           ├── url/route.ts      # POST /api/parse/url
│   │           └── pdf/route.ts       # POST /api/parse/pdf
│   │
│   ├── components/
│   │   ├── ui/                       # Базовые UI компоненты
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Textarea.tsx
│   │   │   ├── Input.tsx
│   │   │   └── Skeleton.tsx
│   │   │
│   │   ├── layout/                   # Layout компоненты
│   │   │   ├── Header.tsx
│   │   │   └── Container.tsx
│   │   │
│   │   ├── input/                    # Компоненты ввода
│   │   │   ├── InputTabs.tsx         # tabs: URL | PDF | Text
│   │   │   ├── UrlInput.tsx          # поле ввода URL
│   │   │   ├── PdfUploader.tsx       # drag & drop PDF
│   │   │   └── TextInput.tsx         # textarea для текста
│   │   │
│   │   ├── output/                   # Компоненты вывода
│   │   │   ├── SummaryCard.tsx       # карточка с результатом
│   │   │   ├── SummarySkeleton.tsx   # loading state
│   │   │   └── CopyButton.tsx
│   │   │
│   │   └── settings/                 # Настройки
│   │       ├── ModelSelect.tsx       # выбор модели (GPT-4/Claude)
│   │       ├── SummaryLength.tsx     # short/medium/long
│   │       └── SettingsPanel.tsx
│   │
│   ├── lib/
│   │   ├── parsers/                  # Парсинг контента
│   │   │   ├── types.ts              # ParserResult, ContentType
│   │   │   ├── url.ts                # parseUrl(url) → text
│   │   │   ├── pdf.ts                # parsePdf(buffer) → text
│   │   │   └── cleaner.ts           # чистка HTML от мусора
│   │   │
│   │   ├── ai/                       # AI интеграции
│   │   │   ├── types.ts             # AIRequest, AIResponse
│   │   │   ├── base.ts              # abstract AIService
│   │   │   ├── openai.ts            # OpenAI implementation
│   │   │   └── anthropic.ts         # Claude implementation
│   │   │
│   │   ├── prompts/                 # Промпты для AI
│   │   │   ├── summarizer.ts       # getSummarizePrompt(text, length)
│   │   │   └── system.ts           # system prompt
│   │   │
│   │   └── utils/                   # Утилиты
│   │       ├── cn.ts               # classnames merge
│   │       └── errors.ts           # custom errors
│   │
│   ├── hooks/                       # React hooks
│   │   ├── useSummarize.ts          # hook для запроса саммари
│   │   └── useParser.ts             # hook для парсинга
│   │
│   ├── stores/                      # Zustand stores
│   │   └── settingsStore.ts        # настройки пользователя
│   │
│   └── types/                      # Глобальные типы
│       └── index.ts
│
├── public/                         # Статика
│   └── favicon.ico
│
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
├── .env.example                    # API keys шаблон
└── README.md
```

## 3. Компоненты — Детали

### 3.1 UI Flow
```
┌─────────────────────────────────────────────────┐
│  [Walles Logo]              [Settings ⚙️]        │  Header
├─────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────┐│
│  │ [URL] [PDF] [Text]                          ││  InputTabs
│  ├─────────────────────────────────────────────┤│
│  │                                             ││
│  │  <Dynamic Input Component>                  ││  Input Area
│  │  - UrlInput / PdfUploader / TextInput       ││
│  │                                             ││
│  └─────────────────────────────────────────────┘│
│                                                 │
│  [ Summarize ▶ ]                                │  Action
│                                                 │
├─────────────────────────────────────────────────┤
│  Summary                                         │
│  ┌─────────────────────────────────────────────┐│
│  │                                             ││
│  │  <Generated Summary>          [📋 Copy]     ││  Output
│  │                                             ││
│  └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

### 3.2 Input Tabs (InputTabs.tsx)
```typescript
type InputMode = 'url' | 'pdf' | 'text';

interface InputTabsProps {
  mode: InputMode;
  onModeChange: (mode: InputMode) => void;
}
// Переключение между режимами ввода
```

### 3.3 Parser Module (lib/parsers/)

**types.ts**
```typescript
type ContentType = 'url' | 'pdf' | 'text';

interface ParsedContent {
  type: ContentType;
  text: string;
  metadata?: {
    title?: string;
    source?: string;
    pageCount?: number;
  };
}
```

**url.ts** — Fetch + Cheerio
- Fetch HTML по URL
- Извлечение title, og:description
- Удаление скриптов, стилей, навигации
- Текстовое извлечение из body

**pdf.ts** — pdf-parse
- Буфер → текст
- Извлечение метаданных (страниц)

### 3.4 AI Module (lib/ai/)

**types.ts**
```typescript
type AIModel = 'gpt-4' | 'gpt-3.5-turbo' | 'claude-3-opus' | 'claude-3-sonnet';

interface SummarizeRequest {
  text: string;
  model: AIModel;
  length: 'short' | 'medium' | 'long';
}

interface AIService {
  summarize(request: SummarizeRequest): Promise<string>;
}
```

**base.ts** — абстрактный класс
```typescript
abstract class AIService {
  abstract summarize(request: SummarizeRequest): Promise<string>;
  protected abstract callAPI(prompt: string): Promise<string>;
}
```

**openai.ts** — GPT-4 implementation
```typescript
class OpenAIService extends AIService {
  protected async callAPI(prompt: string): Promise<string> {
    const response = await openai.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.choices[0].message.content;
  }
}
```

### 3.5 Prompts (lib/prompts/)

```typescript
// system.ts
export const SYSTEM_PROMPT = `You are a professional text summarizer...`;

// summarizer.ts
export function getSummarizePrompt(text: string, length: 'short' | 'medium' | 'long'): string {
  const lengths = {
    short: '2-3 sentences',
    medium: '1 paragraph',
    long: '2-3 paragraphs'
  };
  
  return `Summarize the following text in ${lengths[length]}.
  
  Text: ${text}`;
}
```

### 3.6 API Routes

**POST /api/summarize**
```typescript
// Request
{ content: string; model: AIModel; length: 'short' | 'medium' | 'long' }

// Response
{ summary: string; model: string; tokens: number; }
```

**POST /api/parse/url**
```typescript
// Request
{ url: string }

// Response
{ text: string; title?: string; }
```

## 4. Development Plan

### Phase 1: Foundation (1-2 дня)
- [ ] Инициализация Next.js проекта
- [ ] Настройка TailwindCSS, шрифтов
- [ ] Базовые UI компоненты (Button, Card, Input)
- [ ] Layout: Header, Container

### Phase 2: Input System (1-2 дня)
- [ ] InputTabs component
- [ ] UrlInput + URL parser
- [ ] PdfUploader + PDF parser
- [ ] TextInput component
- [ ] Parser hooks

### Phase 3: AI Integration (1-2 дня)
- [ ] AI types and base class
- [ ] OpenAI service implementation
- [ ] Anthropic service implementation
- [ ] Prompt templates
- [ ] Settings panel (model select, length)

### Phase 4: API Routes (1 день)
- [ ] /api/parse/url
- [ ] /api/parse/pdf
- [ ] /api/summarize
- [ ] Rate limiting
- [ ] Error handling

### Phase 5: Output & Polish (1 день)
- [ ] SummaryCard component
- [ ] CopyButton functionality
- [ ] Loading skeletons
- [ ] Error states
- [ ] Responsive design

### Phase 6: Settings & State (0.5 дня)
- [ ] Zustand store для настроек
- [ ] Persist settings (localStorage)
- [ ] API key input

## 5. Database (Prisma + PostgreSQL)

### Schema Overview

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│    User     │       │  Document   │       │   Summary   │
├─────────────┤       ├─────────────┤       ├─────────────┤
│ id          │──┐    │ id          │──┐    │ id          │
│ email       │  │    │ title       │  │    │ summaryText │←┐
│ name        │  └───→│ userId (FK) │  └───→│ documentId  │  │
│ openaiKey   │       │ sourceType  │       │ userId (FK) │  │
│ anthropicKey│       │ url         │       │ model       │  │
│ defaultModel│       │ textContent │       │ tokens      │  │
│ defaultLength       │ rawHash     │       │ cost        │  │
└─────────────┘       └─────────────┘       │ parentId    │  │
      │                     ▲               └─────────────┘  │
      │                     │                     ▲         │
      ▼                     │                     │         │
┌─────────────┐             │                     │         │
│   ApiKey    │             └─────────────────────┘         │
├─────────────┤               (Optional link)              │
│ id          │                                          │
│ key         │                                          │
│ userId (FK) │                                          │
└─────────────┘                                          │
```

### Models

#### User
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| email | String | Unique email |
| name | String? | Display name |
| openaiKey | String? | Encrypted API key |
| anthropicKey | String? | Encrypted API key |
| defaultModel | Enum | GPT_4, GPT_3_5_TURBO, CLAUDE_3_OPUS, CLAUDE_3_SONNET |
| defaultLength | Enum | SHORT, MEDIUM, LONG |

#### Document
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| title | String? | Document title |
| sourceType | Enum | URL, PDF, TEXT |
| url | String? | Source URL (for URL type) |
| textContent | String? | Extracted text |
| rawContentHash | String? | SHA-256 for deduplication |
| pageCount | Int? | PDF page count |
| userId | String? | Owner (nullable for anonymous) |

#### Summary
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| originalText | String | Source text (max 10KB stored) |
| summaryText | String | Generated summary |
| model | Enum | AI model used |
| promptTokens | Int? | Input tokens |
| completionTokens | Int? | Output tokens |
| totalCost | Decimal? | Calculated cost |
| documentId | String? | Source document |
| userId | String? | Owner |
| parentId | String? | Previous version for edits |

### API Endpoints

#### POST /api/summarize
```typescript
// Request
{
  text: string;           // Text to summarize
  model: string;         // 'gpt-4' | 'gpt-3.5-turbo' | 'claude-3-opus' | 'claude-3-sonnet'
  length: string;        // 'short' | 'medium' | 'long'
  apiKey: string;        // User's API key
  userId?: string;       // Optional user ID
  documentId?: string;   // Optional source document
}

// Response
{
  id: string;
  summary: string;
  model: string;
  tokens: { input: number; output: number; };
  cost: number | null;
  createdAt: string;
}
```

#### POST /api/parse/url
```typescript
// Request
{ url: string; userId?: string; }

// Response
{
  id: string;
  text: string;
  title?: string;
  cached: boolean;      // true if returned from cache
}
```

#### POST /api/parse/pdf
```typescript
// Request (FormData)
file: File;
userId?: string;

// Response
{
  id: string;
  text: string;
  title?: string;
  pageCount?: number;
  cached: boolean;
}
```

#### GET /api/history
```typescript
// Query params
?userId=xxx
&page=1
&limit=20
&documentId=xxx       // Filter by document
&model=gpt-4          // Filter by model
&startDate=2024-01-01
&endDate=2024-12-31

// Response
{
  items: [
    {
      id: string;
      summary: string;
      model: string;
      length: string;
      tokens: { input: number; output: number; };
      cost: number;
      createdAt: string;
      document: { id, title, sourceType, url } | null;
    }
  ];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

#### DELETE /api/history
```typescript
// Query params
?id=xxx&userId=xxx

// Response
{ success: boolean; }
```

## 6. Environment Variables

```env
# .env.example
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=postgresql://user:pass@localhost:5432/walles
```

## 7. Возможные расширения (v2)

- [x] История запросов (БД) — реализовано
- [x] Кэширование распарсенного контента — реализовано
- [ ] Проплаченные подписки (Stripe)
- [ ] Дополнительные модели (Mistral, Gemini)
- [ ] Экспорт в Markdown/PDF
- [ ] Букмарклет для быстрого суммариза
- [ ] RAG с историей пользователя
- [ ] Sharing summaries via link
