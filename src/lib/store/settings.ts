import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  DEFAULT_CHAT_PROMPT,
  DEFAULT_EXPAND_PROMPT,
  DEFAULT_EXTRACT_PROMPT,
  DEFAULT_SETTINGS,
  DEFAULT_SUGGEST_PROMPT,
} from '@/lib/prompts/defaults';

export type PromptKind = 'suggest' | 'expand' | 'chat' | 'extract';
export type NumberSettingKind =
  | 'suggestContextChars'
  | 'expandContextChars'
  | 'chatContextChars'
  | 'chunkSeconds'
  | 'refreshSeconds';

export interface SettingsState {
  apiKey: string;
  suggestPrompt: string;
  expandPrompt: string;
  chatPrompt: string;
  extractPrompt: string;
  suggestContextChars: number;
  expandContextChars: number;
  chatContextChars: number;
  chunkSeconds: number;
  refreshSeconds: number;

  setApiKey: (key: string) => void;
  setPrompt: (kind: PromptKind, value: string) => void;
  setNumber: (kind: NumberSettingKind, n: number) => void;
  resetDefaults: () => void;
}

const baseDefaults = {
  apiKey: '',
  suggestPrompt: DEFAULT_SUGGEST_PROMPT,
  expandPrompt: DEFAULT_EXPAND_PROMPT,
  chatPrompt: DEFAULT_CHAT_PROMPT,
  extractPrompt: DEFAULT_EXTRACT_PROMPT,
  suggestContextChars: DEFAULT_SETTINGS.suggestContextChars,
  expandContextChars: DEFAULT_SETTINGS.expandContextChars,
  chatContextChars: DEFAULT_SETTINGS.chatContextChars,
  chunkSeconds: DEFAULT_SETTINGS.chunkSeconds,
  refreshSeconds: DEFAULT_SETTINGS.refreshSeconds,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...baseDefaults,

      setApiKey: (key) => {
        set({ apiKey: key });
      },

      setPrompt: (kind, value) => {
        if (kind === 'suggest') set({ suggestPrompt: value });
        else if (kind === 'expand') set({ expandPrompt: value });
        else if (kind === 'chat') set({ chatPrompt: value });
        else set({ extractPrompt: value });
      },

      setNumber: (kind, n) => {
        set({ [kind]: n } as Pick<SettingsState, NumberSettingKind>);
      },

      resetDefaults: () => {
        set({ ...baseDefaults });
      },
    }),
    {
      name: 'twinmind.settings.v2',
      version: 2,
      partialize: (state) => ({
        apiKey: state.apiKey,
        suggestPrompt: state.suggestPrompt,
        expandPrompt: state.expandPrompt,
        chatPrompt: state.chatPrompt,
        extractPrompt: state.extractPrompt,
        suggestContextChars: state.suggestContextChars,
        expandContextChars: state.expandContextChars,
        chatContextChars: state.chatContextChars,
        chunkSeconds: state.chunkSeconds,
        refreshSeconds: state.refreshSeconds,
      }),
    },
  ),
);
