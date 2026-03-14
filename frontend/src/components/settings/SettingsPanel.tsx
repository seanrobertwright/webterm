/**
 * Slide-out settings panel for terminal customization
 */

import { useEffect, useState } from 'react';
import { useSettingsStore } from '../../stores/settings-store';
import { fontFamilyOptions } from '../../config/terminal-themes';
import { ThemeSelector } from '../layout/ThemeSelector';

export interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const { fontSize, fontFamily, defaultStartDir, setFontSize, setFontFamily, setDefaultStartDir } = useSettingsStore();

  // Local controlled value for the directory input (allows typing before committing)
  const [dirInputValue, setDirInputValue] = useState(defaultStartDir);
  const [dirError, setDirError] = useState<string>('');

  // Sync local input value when store value changes externally (e.g. via browse)
  useEffect(() => {
    setDirInputValue(defaultStartDir);
  }, [defaultStartDir]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleBrowse = async () => {
    setDirError('');
    try {
      const res = await fetch('/api/v1/system/pick-directory', { method: 'POST' });
      if (!res.ok) {
        setDirError('Failed to open folder picker');
        return;
      }
      const data = await res.json() as { path?: string | null; cancelled?: boolean; error?: string };
      if (data.error) {
        setDirError(data.error);
        return;
      }
      if (data.path) {
        setDefaultStartDir(data.path);
        setDirInputValue(data.path);
      }
      // If cancelled (data.cancelled), do nothing — no error
    } catch (err) {
      console.warn('Failed to open folder picker:', err);
      setDirError('Could not open folder picker dialog');
    }
  };

  const handleDirCommit = async (value: string) => {
    setDirError('');
    if (!value.trim()) {
      // Empty = OS default, valid
      setDefaultStartDir('');
      return;
    }
    try {
      const res = await fetch('/api/v1/system/validate-directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: value.trim() }),
      });
      const data = await res.json() as { valid: boolean; error?: string };
      if (data.valid) {
        setDefaultStartDir(value.trim());
      } else {
        setDirError(data.error ?? 'Invalid directory path');
        setDefaultStartDir(''); // Fall back to OS default
      }
    } catch {
      setDirError('Could not validate directory');
      setDefaultStartDir(''); // Fall back to OS default
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Enter') onClose(); }}
        role="button"
        tabIndex={0}
        aria-label="Close settings panel"
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-80 max-w-[85vw] bg-card border-l border-border shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold text-primary">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground rounded transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
            type="button"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Settings content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Font Size */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Font Size: {fontSize}px
            </label>
            <input
              type="range"
              min={8}
              max={32}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>8</span>
              <span>32</span>
            </div>
          </div>

          {/* Font Family */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Font Family
            </label>
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              className="w-full bg-secondary border border-border text-foreground rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {fontFamilyOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Default Start Directory */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Default Start Directory
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={dirInputValue}
                onChange={(e) => setDirInputValue(e.target.value)}
                onBlur={(e) => { void handleDirCommit(e.target.value); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void handleDirCommit((e.target as HTMLInputElement).value);
                  }
                }}
                placeholder="Leave blank to use system default"
                className="flex-1 min-w-0 bg-input border border-border text-foreground rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={() => { void handleBrowse(); }}
                className="shrink-0 px-3 py-2 bg-secondary text-foreground text-sm rounded border border-border hover:bg-secondary/80 transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
              >
                Browse
              </button>
            </div>
            {dirError && (
              <p className="text-sm mt-1" style={{ color: 'var(--destructive, #ef4444)' }}>
                {dirError}
              </p>
            )}
          </div>

          {/* UI Theme */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              UI Theme
            </label>
            <ThemeSelector />
          </div>
        </div>
      </div>
    </>
  );
}
