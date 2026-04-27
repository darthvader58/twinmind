'use client';

import { useEffect, useRef } from 'react';

import { ChatMessage } from '@/components/chat/ChatMessage';
import { useSessionStore } from '@/lib/store/session';

const STICK_THRESHOLD_PX = 32;

export const ChatMessages = () => {
  const chat = useSessionStore((s) => s.chat);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Total visible text length tracks both new messages and streaming tokens.
  const totalChars = chat.reduce((sum, m) => sum + m.text.length, 0);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distance <= STICK_THRESHOLD_PX;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [chat.length, totalChars]);

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1"
    >
      {chat.map((m) => (
        <ChatMessage key={m.id} message={m} />
      ))}
    </div>
  );
};
