/**
 * Slide-out settings panel for terminal customization
 */

import { useEffect } from 'react';
import { useSettingsStore } from '../../stores/settings-store';
import { fontFamilyOptions } from '../../config/terminal-themes';
import { ThemeSelector } from '../layout/ThemeSelector';

export interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const { fontSize, fontFamily, setFontSize, setFontFamily } = useSettingsStore();

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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
