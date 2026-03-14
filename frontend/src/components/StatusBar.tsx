/**
 * tmux-style status bar component.
 *
 * Renders a single-line bar with three sections:
 *   Left   — resolved from `status-left` format string
 *   Center — clickable window list with activity flags
 *   Right  — resolved from `status-right` format string
 *
 * Window flags follow tmux conventions:
 *   *  current window
 *   -  last active window
 *   #  activity flag
 *   !  bell flag
 *   ~  silence flag
 *   Z  zoomed pane
 */

import type { ReactElement } from 'react';
import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSessionStore } from '../stores/session-store';
import { usePaneStore } from '../stores/pane-store';
import { useFormatString } from '../hooks/useFormatString';
import type { WindowWithPanes } from '@webterm/shared/index';

// ============================================================================
// Types
// ============================================================================

export interface StatusBarProps {
  /** Whether the status bar is visible. Defaults to true. */
  visible?: boolean;
  /** Position of the status bar. Defaults to 'bottom'. */
  position?: 'top' | 'bottom';
  /** Format string for the left section. */
  statusLeft?: string;
  /** Format string for the right section. */
  statusRight?: string;
  /** Clock update interval in ms. Defaults to 15000. */
  statusInterval?: number;
  /** Callback to switch to a different window by ID. */
  onSwitchWindow?: (windowId: string) => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_STATUS_LEFT = '[#{session_name}] ';
const DEFAULT_STATUS_RIGHT = ' %H:%M %d-%b-%y';
const DEFAULT_STATUS_INTERVAL = 15_000;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build the tmux-style flag suffix for a window.
 *
 * Flags are appended in tmux order:
 *   *  — current (active)
 *   -  — last active
 *   #  — activity
 *   !  — bell
 *   ~  — silence
 *   Z  — zoomed pane in this window
 */
function windowFlags(
  window: WindowWithPanes,
  isActive: boolean,
  isLast: boolean,
  hasZoom: boolean,
): string {
  let flags = '';
  if (isActive) flags += '*';
  if (isLast) flags += '-';
  if (window.activityFlag) flags += '#';
  if (window.bellFlag) flags += '!';
  if (window.silenceFlag) flags += '~';
  if (hasZoom) flags += 'Z';
  return flags;
}

// ============================================================================
// Sub-components
// ============================================================================

interface WindowTabItemProps {
  window: WindowWithPanes;
  isActive: boolean;
  isLast: boolean;
  hasZoom: boolean;
  onClick: (windowId: string) => void;
}

function WindowTabItem({
  window: win,
  isActive,
  isLast,
  hasZoom,
  onClick,
}: WindowTabItemProps): ReactElement {
  const flags = windowFlags(win, isActive, isLast, hasZoom);

  const handleClick = useCallback(() => {
    onClick(win.id);
  }, [onClick, win.id]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`
        px-1.5 whitespace-nowrap cursor-pointer
        transition-colors duration-75
        ${
          isActive
            ? 'bg-primary text-primary-foreground font-bold'
            : 'hover:bg-secondary text-primary'
        }
      `}
      title={`Window ${String(win.index)}: ${win.name}`}
    >
      {win.index}:{win.name}
      {flags !== '' ? flags : ''}
    </button>
  );
}

// ============================================================================
// Component
// ============================================================================

export function StatusBar({
  visible = true,
  position = 'bottom',
  statusLeft = DEFAULT_STATUS_LEFT,
  statusRight = DEFAULT_STATUS_RIGHT,
  statusInterval = DEFAULT_STATUS_INTERVAL,
  onSwitchWindow,
}: StatusBarProps): ReactElement | null {
  // ---------------------------------------------------------------------------
  // Store state
  // ---------------------------------------------------------------------------
  const currentSession = useSessionStore((s) => s.currentSession);
  const activeWindowId = useSessionStore((s) => s.activeWindowId);
  const sortedWindows = useSessionStore(
    useShallow((s) => [...s.windows].sort((a, b) => a.index - b.index)),
  );

  const zoomedPane = usePaneStore((s) => s.zoomedPane);
  const windowId = usePaneStore((s) => s.windowId);

  // ---------------------------------------------------------------------------
  // Format strings
  // ---------------------------------------------------------------------------
  const leftText = useFormatString(statusLeft, statusInterval);
  const rightText = useFormatString(statusRight, statusInterval);

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  /** Determine the "last" window — the most recently active window that is not the current one. */
  const lastWindowId = useMemo(() => {
    if (currentSession?.lastWindowId != null && currentSession.lastWindowId !== activeWindowId) {
      return currentSession.lastWindowId;
    }
    // Fallback: no tracked last window
    return null;
  }, [currentSession?.lastWindowId, activeWindowId]);

  /** Whether the currently zoomed pane belongs to the active window. */
  const activeWindowHasZoom = zoomedPane !== null && windowId === activeWindowId;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const handleWindowClick = useCallback(
    (id: string) => {
      onSwitchWindow?.(id);
    },
    [onSwitchWindow],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (!visible) return null;

  const positionClasses =
    position === 'top' ? 'top-0' : 'bottom-0';

  return (
    <div
      data-status-bar
      className={`
        fixed left-0 right-0 ${positionClasses} z-40
        flex items-center
        h-6 min-h-[1.5rem]
        bg-card text-primary
        border-t border-border
        font-mono text-xs leading-6
        select-none overflow-hidden
      `}
      role="status"
      aria-label="Status bar"
    >
      {/* Left section */}
      <span className="shrink-0 px-1 whitespace-nowrap">{leftText}</span>

      {/* Center: window list */}
      <div className="flex items-center overflow-x-auto min-w-0">
        {sortedWindows.map((win) => {
          const isActive = win.id === activeWindowId;
          const isLast = win.id === lastWindowId;
          const hasZoom = isActive && activeWindowHasZoom;

          return (
            <WindowTabItem
              key={win.id}
              window={win}
              isActive={isActive}
              isLast={isLast}
              hasZoom={hasZoom}
              onClick={handleWindowClick}
            />
          );
        })}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right section */}
      <span className="shrink-0 px-1 whitespace-nowrap">{rightText}</span>
    </div>
  );
}

export default StatusBar;
