import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '../../providers/ThemeProvider';
import type { ThemeId } from '../../providers/ThemeProvider';

export function ThemeSelector() {
  const { theme, setTheme, themes } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  const handleSelect = useCallback(
    (id: ThemeId) => {
      setTheme(id);
      setIsOpen(false);
    },
    [setTheme],
  );

  const currentTheme = themes.find((t) => t.id === theme);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="
          flex items-center gap-1.5 px-2 py-1
          text-sm text-gray-400 hover:text-gray-200
          rounded transition-colors
          focus:outline-none focus:ring-2 focus:ring-ring/50
        "
        type="button"
        aria-label="Select theme"
        aria-expanded={isOpen}
      >
        <span
          className="w-3 h-3 rounded-full border border-gray-600 flex-shrink-0"
          style={{ backgroundColor: currentTheme?.color }}
        />
        <svg
          className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="
            absolute right-0 top-full mt-1 z-50
            w-44 py-1
            bg-gray-900 border border-gray-700 rounded-md shadow-lg
          "
          role="listbox"
          aria-label="Theme options"
        >
          {themes.map((t) => (
            <button
              key={t.id}
              onClick={() => handleSelect(t.id)}
              className={`
                w-full flex items-center gap-2.5 px-3 py-1.5
                text-sm text-left transition-colors
                ${t.id === theme ? 'bg-gray-800 text-gray-100' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'}
              `}
              type="button"
              role="option"
              aria-selected={t.id === theme}
            >
              <span
                className="w-3 h-3 rounded-full border border-gray-600 flex-shrink-0"
                style={{ backgroundColor: t.color }}
              />
              <span className="flex-1">{t.name}</span>
              <span className="text-xs text-gray-500">{t.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
