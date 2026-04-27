import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'TwinMind — Live Suggestions',
  description:
    'Real-time meeting copilot: live transcript, mixed-type suggestions, and a continuous chat thread.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://api.groq.com" />
      </head>
      <body>{children}</body>
    </html>
  );
}
