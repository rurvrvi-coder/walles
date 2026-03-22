import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AIModel, SummaryLength } from '@/lib/ai/types';

interface SettingsState {
  model: AIModel;
  length: SummaryLength;
  apiKey: string;
  ollamaUrl: string;
  setModel: (model: AIModel) => void;
  setLength: (length: SummaryLength) => void;
  setApiKey: (key: string) => void;
  setOllamaUrl: (url: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      model: 'gpt-3.5-turbo',
      length: 'medium',
      apiKey: '',
      ollamaUrl: 'http://localhost:11434',
      setModel: (model) => set({ model }),
      setLength: (length) => set({ length }),
      setApiKey: (apiKey) => set({ apiKey }),
      setOllamaUrl: (ollamaUrl) => set({ ollamaUrl }),
    }),
    {
      name: 'walles-settings',
    }
  )
);
