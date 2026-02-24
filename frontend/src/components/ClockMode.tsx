/**
 * Clock mode overlay component
 *
 * Displays a large clock filling the pane area, similar to tmux clock-mode.
 * Updates every second. Exit on any keypress.
 *
 * Uses CSS-styled large digits with a dark background and green text
 * (matching tmux default clock-mode style).
 */

import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface ClockModeProps {
  onClose: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

function formatTime(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function formatDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()] ?? 'Mon';
  return `${weekday} ${year}-${month}-${day}`;
}

// ============================================================================
// Component
// ============================================================================

export function ClockMode({ onClose }: ClockModeProps): ReactElement {
  const [time, setTime] = useState(formatTime);
  const [date, setDate] = useState(formatDate);

  // Update clock every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTime(formatTime());
      setDate(formatDate());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Exit on any keypress
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      onClose();
    },
    [onClose],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Exit on mouse click
  const handleClick = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-950 cursor-pointer select-none"
      onClick={handleClick}
      role="dialog"
      aria-label="Clock mode"
    >
      {/* Large time display */}
      <div
        className="font-mono font-bold tracking-widest text-green-400"
        style={{ fontSize: 'min(12vw, 120px)' }}
      >
        {time}
      </div>

      {/* Date display */}
      <div
        className="mt-4 font-mono text-green-600"
        style={{ fontSize: 'min(3vw, 28px)' }}
      >
        {date}
      </div>

      {/* Hint text */}
      <div className="mt-8 text-xs text-gray-600">
        Press any key to exit
      </div>
    </div>
  );
}
