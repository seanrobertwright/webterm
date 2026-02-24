/**
 * Choose-buffer overlay component
 * Interactive buffer selection with content preview.
 *
 * Keyboard navigation:
 *   Up/Down (k/j) - move selection
 *   Enter          - paste selected buffer
 *   Escape (q)     - dismiss
 */

import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface BufferItem {
  name: string;
  size: number;
  preview: string;
  content: string;
}

export interface ChooseBufferProps {
  buffers: BufferItem[];
  onSelect: (bufferName: string) => void;
  onCancel: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function ChooseBuffer({ buffers, onSelect, onCancel }: ChooseBufferProps): ReactElement {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
        case 'k':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(0, i - 1));
          break;
        case 'ArrowDown':
        case 'j':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(buffers.length - 1, i + 1));
          break;
        case 'Enter': {
          e.preventDefault();
          const buf = buffers[selectedIndex];
          if (buf) onSelect(buf.name);
          break;
        }
        case 'Escape':
        case 'q':
          e.preventDefault();
          onCancel();
          break;
      }
    },
    [buffers, selectedIndex, onSelect, onCancel],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (buffers.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="rounded border border-gray-600 bg-gray-900 p-4 text-gray-300">
          No buffers available. Press Escape to close.
        </div>
      </div>
    );
  }

  const selected = buffers[selectedIndex];

  return (
    <div className="fixed inset-0 z-50 flex bg-black/80">
      {/* Buffer list */}
      <div className="w-1/2 overflow-y-auto border-r border-gray-600 p-2">
        <div className="mb-2 text-sm text-gray-400">
          Choose buffer (Enter=paste, Esc=cancel)
        </div>
        {buffers.map((buf, i) => (
          <div
            key={buf.name}
            className={`cursor-pointer px-2 py-1 font-mono text-sm ${
              i === selectedIndex
                ? 'bg-green-800 text-white'
                : 'text-gray-300 hover:bg-gray-800'
            }`}
            onClick={() => onSelect(buf.name)}
            onMouseEnter={() => setSelectedIndex(i)}
          >
            {buf.name} ({buf.size} bytes)
          </div>
        ))}
      </div>

      {/* Content preview */}
      <div className="w-1/2 overflow-auto p-2">
        <div className="mb-2 text-sm text-gray-400">
          Preview: {selected?.name ?? ''}
        </div>
        <pre className="whitespace-pre-wrap font-mono text-sm text-gray-300">
          {selected?.content ?? ''}
        </pre>
      </div>
    </div>
  );
}
