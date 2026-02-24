/**
 * Popup overlay component
 *
 * Displays command output or arbitrary text in a modal overlay.
 * Configurable width/height (in character/line units).
 *
 * Keyboard:
 *   Escape / q - close popup
 */

import type { ReactElement } from 'react';
import { useCallback, useEffect } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface PopupProps {
  content: string;
  width?: number;
  height?: number;
  onClose: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function Popup({ content, width = 80, height = 24, onClose }: PopupProps): ReactElement {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'q') {
        e.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div
        className="overflow-auto rounded border border-gray-500 bg-gray-900 p-3 font-mono text-sm text-gray-200 shadow-lg"
        style={{
          width: `${String(Math.min(width, 120))}ch`,
          maxHeight: `${String(Math.min(height, 50))}em`,
        }}
      >
        <div className="mb-2 flex items-center justify-between border-b border-gray-700 pb-1 text-xs text-gray-500">
          <span>Popup</span>
          <span>Press Esc to close</span>
        </div>
        <pre className="whitespace-pre-wrap">{content}</pre>
      </div>
    </div>
  );
}
