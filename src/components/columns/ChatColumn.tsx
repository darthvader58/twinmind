'use client';

import { ChatInput } from '@/components/chat/ChatInput';
import { ChatMessages } from '@/components/chat/ChatMessages';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { useSessionStore } from '@/lib/store/session';
import { useSettingsStore } from '@/lib/store/settings';

interface Props {
  onSend?: (text: string) => void;
}

export const ChatColumn = ({ onSend }: Props) => {
  const chat = useSessionStore((s) => s.chat);
  const chatStreaming = useSessionStore((s) => s.chatStreaming);
  const apiKey = useSettingsStore((s) => s.apiKey);

  const handleSend = onSend ?? (() => undefined);
  const noKey = apiKey === '';
  const placeholder = noKey
    ? 'Add your Groq key in Settings to start chatting'
    : undefined;

  return (
    <Card
      headerLabel="CHAT"
      headerRight={<Pill variant="mute">SESSION-ONLY</Pill>}
      className="h-full"
    >
      <ChatMessages />

      {chat.length === 0 ? (
        <div className="mt-3 rounded-lg border border-[var(--panel-border)] bg-[var(--panel-inner)]/40 p-3 text-xs text-[var(--muted)]">
          Tap a suggestion or type a question. Answers stream in using the live transcript
          as context.
        </div>
      ) : null}

      <ChatInput
        onSend={handleSend}
        disabled={chatStreaming || noKey}
        {...(placeholder ? { placeholder } : {})}
      />
    </Card>
  );
};
