import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AIModel = 'gpt-4' | 'gpt-3.5-turbo' | 'claude-3-opus' | 'claude-3-sonnet';
export type SummaryLength = 'short' | 'medium' | 'long';

interface SettingsState {
  model: AIModel;
  length: SummaryLength;
  apiKey: string;
  setModel: (model: AIModel) => void;
  setLength: (length: SummaryLength) => void;
  setApiKey: (key: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      model: 'gpt-3.5-turbo',
      length: 'medium',
      apiKey: '',
      setModel: (model) => set({ model }),
      setLength: (length) => set({ length }),
      setApiKey: (apiKey) => set({ apiKey }),
    }),
    {
      name: 'walles-settings',
    }
  )
);
