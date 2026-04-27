'use client';

import { useCallback, useState } from 'react';

import { ChatColumn } from '@/components/columns/ChatColumn';
import { SuggestionsColumn } from '@/components/columns/SuggestionsColumn';
import { TranscriptColumn } from '@/components/columns/TranscriptColumn';
import { ExportPopover } from '@/components/header/ExportPopover';
import { Header } from '@/components/header/Header';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { useChat } from '@/hooks/useChat';
import { useRecorder } from '@/hooks/useRecorder';
import { useSuggestionLoop } from '@/hooks/useSuggestionLoop';
import { useTranscriptionLoop } from '@/hooks/useTranscriptionLoop';
import { serializeSession } from '@/lib/export/session';
import { useSessionStore } from '@/lib/store/session';
import { useSettingsStore } from '@/lib/store/settings';

function downloadBlob(text: string, filename: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Page() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const apiKey = useSettingsStore((s) => s.apiKey);

  const recorder = useRecorder();
  useTranscriptionLoop(recorder);
  const suggest = useSuggestionLoop();
  const chat = useChat();

  const onMicClick = useCallback(() => {
    const r = useSessionStore.getState().recording;
    if (r === 'recording' || r === 'starting') {
      recorder.stop();
    } else {
      void recorder.start();
    }
  }, [recorder]);

  const onDownload = useCallback((format: 'json' | 'text') => {
    const s = useSessionStore.getState();
    const out = serializeSession({ chunks: s.chunks, batches: s.batches, chat: s.chat });
    if (format === 'json') {
      downloadBlob(out.json, `${out.fileBase}.json`, 'application/json');
    } else {
      downloadBlob(out.text, `${out.fileBase}.txt`, 'text/plain');
    }
    setExportOpen(false);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-[var(--bg)] text-[var(--fg)]">
      <Header
        onSettings={() => setSettingsOpen(true)}
        onExportClick={() => setExportOpen((v) => !v)}
        hasNoKey={apiKey === ''}
      />
      <main className="grid min-h-0 flex-1 grid-cols-[1fr_1fr_1fr] gap-4 p-4">
        <TranscriptColumn onMicClick={onMicClick} />
        <SuggestionsColumn
          onReload={suggest.reload}
          onSuggestionClick={(s) => void chat.expandSuggestion(s)}
        />
        <ChatColumn onSend={(t) => void chat.sendMessage(t)} />
      </main>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ExportPopover
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onDownload={onDownload}
      />
    </div>
  );
}
