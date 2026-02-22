/**
 * Slide-out settings panel for terminal customization
 */

import { useEffect } from 'react';
import { useSettingsStore } from '../../stores/settings-store';
import { themeNames, fontFamilyOptions } from '../../config/terminal-themes';

export interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const { fontSize, fontFamily, themeName, setFontSize, setFontFamily, setThemeName } =
    useSettingsStore();

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
      <div className="fixed inset-y-0 right-0 z-50 w-80 max-w-[85vw] bg-gray-900 border-l border-gray-700 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-green-400">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white rounded transition-colors focus:outline-none focus:ring-2 focus:ring-green-500"
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
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Font Size: {fontSize}px
            </label>
            <input
              type="range"
              min={8}
              max={32}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="w-full accent-green-500"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>8</span>
              <span>32</span>
            </div>
          </div>

          {/* Font Family */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Font Family
            </label>
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 text-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {fontFamilyOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Theme */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Color Theme
            </label>
            <div className="space-y-2">
              {themeNames.map((name) => (
                <button
                  key={name}
                  onClick={() => setThemeName(name)}
                  className={`w-full text-left px-3 py-2 rounded border transition-colors ${
                    themeName === name
                      ? 'border-green-500 bg-green-900/30 text-green-400'
                      : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500'
                  }`}
                  type="button"
                >
                  {name.charAt(0).toUpperCase() + name.slice(1).replace('-', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
