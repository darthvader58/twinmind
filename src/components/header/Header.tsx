import { ExportButton } from '@/components/header/ExportButton';
import { SettingsButton } from '@/components/header/SettingsButton';

interface Props {
  onSettings: () => void;
  onExportClick: () => void;
  hasNoKey: boolean;
}

export const Header = ({ onSettings, onExportClick, hasNoKey }: Props) => (
  <header className="flex shrink-0 items-center justify-between px-4 pt-4">
    <h1 className="text-base font-semibold tracking-tight text-[var(--fg)]">
      TwinMind <span className="text-[var(--muted)]">— Live Suggestions</span>
    </h1>
    <div className="flex items-center gap-2">
      <ExportButton onClick={onExportClick} />
      <SettingsButton onClick={onSettings} hasNoKey={hasNoKey} />
    </div>
  </header>
);
