'use client';

import { ApiKeyField } from '@/components/settings/ApiKeyField';
import { NumberField } from '@/components/settings/NumberField';
import { PromptEditor } from '@/components/settings/PromptEditor';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useSettingsStore } from '@/lib/store/settings';

interface Props {
  open: boolean;
  onClose: () => void;
}

export const SettingsModal = ({ open, onClose }: Props) => {
  const suggestPrompt = useSettingsStore((s) => s.suggestPrompt);
  const expandPrompt = useSettingsStore((s) => s.expandPrompt);
  const chatPrompt = useSettingsStore((s) => s.chatPrompt);
  const suggestContextChars = useSettingsStore((s) => s.suggestContextChars);
  const expandContextChars = useSettingsStore((s) => s.expandContextChars);
  const chatContextChars = useSettingsStore((s) => s.chatContextChars);
  const chunkSeconds = useSettingsStore((s) => s.chunkSeconds);
  const refreshSeconds = useSettingsStore((s) => s.refreshSeconds);
  const setPrompt = useSettingsStore((s) => s.setPrompt);
  const setNumber = useSettingsStore((s) => s.setNumber);
  const resetDefaults = useSettingsStore((s) => s.resetDefaults);

  return (
    <Modal open={open} onClose={onClose} title="Settings">
      <div className="flex flex-col gap-6 pb-2">
        <section className="flex flex-col gap-2">
          <ApiKeyField />
          <p className="text-[11px] text-[var(--muted)]">
            Your key is stored in this browser only. Clear settings to remove it.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            Prompts
          </h3>
          <PromptEditor
            label="Suggestions prompt"
            value={suggestPrompt}
            onChange={(v) => setPrompt('suggest', v)}
          />
          <PromptEditor
            label="Expand prompt"
            value={expandPrompt}
            onChange={(v) => setPrompt('expand', v)}
          />
          <PromptEditor
            label="Chat prompt"
            value={chatPrompt}
            onChange={(v) => setPrompt('chat', v)}
          />
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            Context windows (chars)
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <NumberField
              label="Suggestions"
              value={suggestContextChars}
              onChange={(n) => setNumber('suggestContextChars', n)}
              min={500}
              step={500}
            />
            <NumberField
              label="Expand"
              value={expandContextChars}
              onChange={(n) => setNumber('expandContextChars', n)}
              min={500}
              step={500}
            />
            <NumberField
              label="Chat"
              value={chatContextChars}
              onChange={(n) => setNumber('chatContextChars', n)}
              min={500}
              step={500}
            />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            Timing (seconds)
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Chunk"
              value={chunkSeconds}
              onChange={(n) => setNumber('chunkSeconds', n)}
              min={5}
              max={120}
              suffix="s"
            />
            <NumberField
              label="Refresh"
              value={refreshSeconds}
              onChange={(n) => setNumber('refreshSeconds', n)}
              min={5}
              max={300}
              suffix="s"
            />
          </div>
        </section>

        <footer className="flex items-center justify-between border-t border-[var(--panel-border)] pt-4">
          <Button variant="ghost" onClick={resetDefaults}>
            Reset to defaults
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </footer>
      </div>
    </Modal>
  );
};
