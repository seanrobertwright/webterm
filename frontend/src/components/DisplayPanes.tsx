/**
 * Display panes overlay component
 * Renders large pane index numbers as overlays, similar to tmux's display-panes.
 * When visible, the user can press a number key (0-9) to focus that pane,
 * or press Escape to dismiss. Auto-dismisses after a configurable timeout.
 */

import type { ReactElement } from 'react';
import { useCallback, useEffect, useRef } from 'react';

// ============================================================================
// Types
// ============================================================================

interface PaneInfo {
  id: string;
  index: number;
}

interface DisplayPanesProps {
  visible: boolean;
  panes: PaneInfo[];
  onSelect: (paneId: string) => void;
  onDismiss: () => void;
  duration?: number | undefined;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_DURATION = 1000;

// Colors cycle through for visual distinction, matching tmux display-panes style
const PANE_COLORS = [
  'text-red-400',
  'text-green-400',
  'text-blue-400',
  'text-yellow-400',
  'text-purple-400',
  'text-cyan-400',
  'text-orange-400',
  'text-pink-400',
  'text-emerald-400',
  'text-indigo-400',
] as const;

// ============================================================================
// Component
// ============================================================================

export function DisplayPanes({
  visible,
  panes,
  onSelect,
  onDismiss,
  duration,
}: DisplayPanesProps): ReactElement | null {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback((): void => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleSelect = useCallback(
    (paneId: string) => {
      clearTimer();
      onSelect(paneId);
      onDismiss();
    },
    [clearTimer, onSelect, onDismiss],
  );

  // Auto-dismiss timer
  useEffect(() => {
    if (!visible) {
      clearTimer();
      return;
    }

    const timeout = duration ?? DEFAULT_DURATION;
    timerRef.current = setTimeout(() => {
      onDismiss();
    }, timeout);

    return (): void => {
      clearTimer();
    };
  }, [visible, duration, onDismiss, clearTimer]);

  // Keyboard listener for number keys and Escape
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        clearTimer();
        onDismiss();
        return;
      }

      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 0 && num <= 9) {
        e.preventDefault();
        const matchingPane = panes.find((p) => p.index === num);
        if (matchingPane) {
          handleSelect(matchingPane.id);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return (): void => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [visible, panes, handleSelect, clearTimer, onDismiss]);

  if (!visible) {
    return null;
  }

  return (
    <div
      data-display-panes
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        // Dismiss if clicking the backdrop (not a pane button)
        if (e.target === e.currentTarget) {
          clearTimer();
          onDismiss();
        }
      }}
    >
      <div className="flex flex-wrap items-center justify-center gap-6 p-8">
        {panes.map((pane) => {
          const colorClass = PANE_COLORS[pane.index % PANE_COLORS.length];
          return (
            <button
              key={pane.id}
              type="button"
              onClick={() => handleSelect(pane.id)}
              className={`flex h-28 w-28 items-center justify-center rounded-lg
                bg-gray-900/80 backdrop-blur-sm border border-gray-600
                text-8xl font-bold ${colorClass}
                transition-transform hover:scale-110 hover:border-white/50
                cursor-pointer select-none`}
              title={`Pane ${String(pane.index)}`}
            >
              {pane.index}
            </button>
          );
        })}
      </div>
    </div>
  );
}
