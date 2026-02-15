import { ConnectionStatusIndicator } from "./ConnectionStatusIndicator";

interface BrandHeaderProps {
  onSettingsClick?: () => void;
}

export function BrandHeader({ onSettingsClick }: BrandHeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
      <div className="flex items-center gap-3">
        <span className="text-xl font-bold tracking-wide text-text-primary">
          HQ Cloud
        </span>
        <ConnectionStatusIndicator />
      </div>
      {onSettingsClick && (
        <button
          type="button"
          onClick={onSettingsClick}
          className="p-2 text-icon-default hover:text-icon-active transition-colors"
          aria-label="Settings"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 13a3 3 0 100-6 3 3 0 000 6z" />
            <path d="M16.5 10a6.5 6.5 0 01-.5 2.5l1.5 1.5-1.5 1.5-1.5-1.5a6.5 6.5 0 01-5 0L8 15.5 6.5 14l1.5-1.5A6.5 6.5 0 017.5 10a6.5 6.5 0 01.5-2.5L6.5 6 8 4.5l1.5 1.5a6.5 6.5 0 015 0L16 4.5 17.5 6l-1.5 1.5a6.5 6.5 0 01.5 2.5z" />
          </svg>
        </button>
      )}
    </header>
  );
}
