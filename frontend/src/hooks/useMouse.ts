/**
 * React hook for mouse interactions in the terminal multiplexer.
 *
 * Provides:
 *   - Click-to-focus: clicking a pane container focuses it (T058)
 *   - Scroll-to-copy-mode: scrolling up enters copy mode (T059)
 *   - Double-click word selection (T060)
 *   - Triple-click line selection (T060)
 */

import { useCallback, useRef } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface UseMouseOptions {
  /** Enable mouse handling. Defaults to true. */
  enabled?: boolean;
  /** Callback when a pane should receive focus. */
  onPaneFocus?: (paneId: string) => void;
  /** Callback to enter copy mode (e.g. on scroll-up). */
  onEnterCopyMode?: () => void;
  /** Callback when a word is selected via double-click. */
  onWordSelect?: (text: string) => void;
  /** Callback when a line is selected via triple-click. */
  onLineSelect?: (text: string) => void;
}

export interface UseMouseReturn {
  /** Handle mousedown on a pane container to focus it. */
  handleMouseDown: (paneId: string, event: MouseEvent) => void;
  /** Handle wheel events; scroll-up enters copy mode. */
  handleMouseWheel: (paneId: string, event: WheelEvent) => void;
  /** Handle double-click to select a word. */
  handleDoubleClick: (paneId: string, event: MouseEvent) => void;
  /** Handle triple-click to select a line. */
  handleTripleClick: (paneId: string, event: MouseEvent) => void;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum interval (ms) between consecutive clicks to count as a triple-click.
 * Browsers typically use ~500ms; we use a slightly tighter window.
 */
const TRIPLE_CLICK_THRESHOLD = 500;

// ============================================================================
// Hook Implementation
// ============================================================================

export function useMouse(options: UseMouseOptions = {}): UseMouseReturn {
  const {
    enabled = true,
    onPaneFocus,
    onEnterCopyMode,
    onWordSelect,
    onLineSelect,
  } = options;

  // Refs for callbacks so handler identities stay stable
  const onPaneFocusRef = useRef(onPaneFocus);
  const onEnterCopyModeRef = useRef(onEnterCopyMode);
  const onWordSelectRef = useRef(onWordSelect);
  const onLineSelectRef = useRef(onLineSelect);

  onPaneFocusRef.current = onPaneFocus;
  onEnterCopyModeRef.current = onEnterCopyMode;
  onWordSelectRef.current = onWordSelect;
  onLineSelectRef.current = onLineSelect;

  // Track click timestamps for triple-click detection
  const clickTimestampsRef = useRef<number[]>([]);

  // --------------------------------------------------------------------------
  // T058: Click-to-focus
  // --------------------------------------------------------------------------

  const handleMouseDown = useCallback(
    (paneId: string, _event: MouseEvent) => {
      if (!enabled) return;
      onPaneFocusRef.current?.(paneId);

      // Record timestamp for triple-click detection
      const now = Date.now();
      const timestamps = clickTimestampsRef.current;
      timestamps.push(now);

      // Keep only the last 3 timestamps
      if (timestamps.length > 3) {
        timestamps.shift();
      }
    },
    [enabled],
  );

  // --------------------------------------------------------------------------
  // T059: Scroll-to-copy-mode
  // --------------------------------------------------------------------------

  const handleMouseWheel = useCallback(
    (_paneId: string, event: WheelEvent) => {
      if (!enabled) return;

      // Negative deltaY means the user scrolled up
      if (event.deltaY < 0) {
        onEnterCopyModeRef.current?.();
      }
    },
    [enabled],
  );

  // --------------------------------------------------------------------------
  // T060: Double-click word selection
  // --------------------------------------------------------------------------

  const handleDoubleClick = useCallback(
    (_paneId: string, _event: MouseEvent) => {
      if (!enabled) return;

      // Use the browser Selection API to read the word the browser selected
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? '';

      if (text.length > 0) {
        onWordSelectRef.current?.(text);
      }
    },
    [enabled],
  );

  // --------------------------------------------------------------------------
  // T060: Triple-click line selection
  // --------------------------------------------------------------------------

  const handleTripleClick = useCallback(
    (_paneId: string, _event: MouseEvent) => {
      if (!enabled) return;

      // Verify triple-click via timestamps
      const timestamps = clickTimestampsRef.current;
      if (timestamps.length >= 3) {
        const first = timestamps[timestamps.length - 3];
        const third = timestamps[timestamps.length - 1];
        if (first !== undefined && third !== undefined) {
          if (third - first > TRIPLE_CLICK_THRESHOLD) {
            // Clicks too far apart; not a real triple-click
            return;
          }
        }
      }

      // After a triple-click the browser typically selects the full line
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? '';

      if (text.length > 0) {
        onLineSelectRef.current?.(text);
      }
    },
    [enabled],
  );

  return {
    handleMouseDown,
    handleMouseWheel,
    handleDoubleClick,
    handleTripleClick,
  };
}
