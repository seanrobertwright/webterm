import { useCallback } from 'react';
import type { Window } from '@webterm/shared/models';

export interface WindowTab {
  id: string;
  name: string;
  index: number;
}

export interface WindowTabsProps {
  /** Array of windows to display as tabs */
  windows: WindowTab[];
  /** ID of the currently active window */
  activeWindowId: string | null;
  /** Callback when a tab is clicked */
  onTabClick: (windowId: string) => void;
  /** Callback when close button is clicked */
  onTabClose?: (windowId: string) => void;
  /** Callback to create a new window */
  onNewWindow?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/** Window tab bar for switching between windows */
export function WindowTabs({
  windows,
  activeWindowId,
  onTabClick,
  onTabClose,
  onNewWindow,
  className = '',
}: WindowTabsProps) {
  const handleTabClick = useCallback(
    (windowId: string) => {
      onTabClick(windowId);
    },
    [onTabClick]
  );

  const handleCloseClick = useCallback(
    (e: React.MouseEvent, windowId: string) => {
      e.stopPropagation();
      onTabClose?.(windowId);
    },
    [onTabClose]
  );

  return (
    <div
      className={`
        flex items-center
        h-8
        bg-card border-b border-border
        overflow-x-auto
        ${className}
      `}
      role="tablist"
      aria-label="Window tabs"
    >
      {/* Window tabs */}
      {windows.map((window) => {
        const isActive = window.id === activeWindowId;

        return (
          <button
            key={window.id}
            onClick={() => handleTabClick(window.id)}
            className={`
              flex items-center gap-2
              h-full px-4
              text-sm font-medium
              border-r border-border
              transition-colors
              focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring/50
              ${isActive
                ? 'bg-secondary text-primary border-b-2 border-b-primary'
                : 'bg-card text-muted-foreground hover:bg-secondary hover:text-foreground'
              }
            `}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`window-panel-${window.id}`}
          >
            {/* Window index */}
            <span className="text-xs text-muted-foreground font-mono">
              {window.index}:
            </span>

            {/* Window name */}
            <span className="truncate max-w-32">
              {window.name}
            </span>

            {/* Close button */}
            {onTabClose && (
              <span
                onClick={(e) => handleCloseClick(e, window.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleCloseClick(e as unknown as React.MouseEvent, window.id);
                  }
                }}
                className="
                  ml-1 p-0.5
                  text-muted-foreground hover:text-destructive
                  rounded
                  transition-colors
                "
                role="button"
                tabIndex={0}
                aria-label={`Close window ${window.name}`}
              >
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </span>
            )}
          </button>
        );
      })}

      {/* New window button */}
      {onNewWindow && (
        <button
          onClick={onNewWindow}
          className="
            flex items-center justify-center
            h-full w-8
            text-muted-foreground hover:text-primary
            transition-colors
            focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring/50
          "
          type="button"
          aria-label="Create new window"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>
      )}

      {/* Spacer */}
      <div className="flex-1" />
    </div>
  );
}

export default WindowTabs;
