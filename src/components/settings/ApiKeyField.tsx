'use client';

import { useState } from 'react';

import { useSettingsStore } from '@/lib/store/settings';

export const ApiKeyField = () => {
  const apiKey = useSettingsStore((s) => s.apiKey);
  const setApiKey = useSettingsStore((s) => s.setApiKey);
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor="apikey-input"
        className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]"
      >
        Groq API key
      </label>
      <div className="flex items-stretch gap-2">
        <input
          id="apikey-input"
          type={revealed ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="gsk_…"
          className="flex-1 rounded-lg border border-[var(--panel-border)] bg-black/30 px-3 py-2 font-mono text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        />
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          aria-label={revealed ? 'Hide API key' : 'Show API key'}
          aria-pressed={revealed}
          className="inline-flex w-12 shrink-0 items-center justify-center rounded-lg border border-[var(--panel-border)] bg-[var(--panel-inner)] text-xs font-medium text-[var(--fg)] transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          {revealed ? 'Hide' : 'Show'}
        </button>
      </div>
      <p className="text-[11px] text-[var(--muted)]">
        Get a free key at console.groq.com
      </p>
    </div>
  );
};
