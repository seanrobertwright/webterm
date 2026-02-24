/**
 * Context menu component for pane right-click actions
 *
 * Keyboard navigation:
 *   Up/Down   - move selection
 *   Enter     - select the focused item
 *   Escape    - dismiss
 *
 * Auto-dismisses on blur or clicking outside.
 */

import type { ReactElement } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface ContextMenuItem {
  label: string;
  command: string;
  shortcut?: string;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  paneId: string;
  items: ContextMenuItem[];
  onSelect: (command: string) => void;
  onClose: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function ContextMenu({
  x,
  y,
  paneId: _paneId,
  items,
  onSelect,
  onClose,
}: ContextMenuProps): ReactElement {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // Adjust position to keep menu within viewport
  const [adjustedPos, setAdjustedPos] = useState({ x, y });

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let newX = x;
    let newY = y;

    if (x + rect.width > vw) {
      newX = vw - rect.width - 4;
    }
    if (y + rect.height > vh) {
      newY = vh - rect.height - 4;
    }

    setAdjustedPos({ x: Math.max(4, newX), y: Math.max(4, newY) });
  }, [x, y]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((i) => (i >= items.length - 1 ? 0 : i + 1));
          break;
        case 'Enter': {
          e.preventDefault();
          const item = items[focusedIndex];
          if (item) onSelect(item.command);
          break;
        }
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [items, focusedIndex, onSelect, onClose],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Auto-dismiss on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Use setTimeout to avoid the same right-click event immediately closing the menu
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleClick);
    }, 0);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  // Auto-dismiss on window blur
  useEffect(() => {
    const handleBlur = () => onClose();
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] rounded border border-gray-600 bg-gray-900/95 py-1 font-mono text-sm shadow-2xl backdrop-blur-sm"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
      role="menu"
      aria-label="Pane context menu"
    >
      {items.map((item, idx) => {
        const isFocused = idx === focusedIndex;

        return (
          <div
            key={item.command}
            role="menuitem"
            aria-selected={isFocused}
            className={`flex cursor-pointer items-center justify-between px-3 py-1.5 select-none ${
              isFocused
                ? 'bg-blue-600/40 text-white'
                : 'text-gray-300 hover:bg-gray-800'
            }`}
            onMouseEnter={() => setFocusedIndex(idx)}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(item.command);
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span className="ml-4 text-xs text-gray-500">{item.shortcut}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
