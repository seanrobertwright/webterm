/**
 * React hook for vi-mode copy mode in xterm.js terminals
 * Provides navigation, search, selection, and yank functionality
 * inspired by tmux copy mode.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Terminal } from '@xterm/xterm';
import type { IDecoration } from '@xterm/xterm';
import type { SearchAddon } from '@xterm/addon-search';

// ============================================================================
// Types
// ============================================================================

export interface CopyModeState {
  active: boolean;
  cursorRow: number;
  cursorCol: number;
  selectionStart: { row: number; col: number } | null;
  selectionActive: boolean;
  selectionMode: 'char' | 'line' | 'block';
  searchQuery: string;
  searchDirection: 'forward' | 'backward';
}

export interface UseCopyModeOptions {
  terminal: Terminal | null;
  searchAddon: SearchAddon | null;
  onYank?: (text: string) => void;
}

export interface UseCopyModeReturn {
  state: CopyModeState;
  enter: () => void;
  exit: () => void;
  isActive: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const INITIAL_STATE: CopyModeState = {
  active: false,
  cursorRow: 0,
  cursorCol: 0,
  selectionStart: null,
  selectionActive: false,
  selectionMode: 'char',
  searchQuery: '',
  searchDirection: 'forward',
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the text content of a buffer line, trimmed of trailing whitespace
 */
function getLineText(terminal: Terminal, row: number): string {
  const line = terminal.buffer.active.getLine(row);
  return line?.translateToString(true) ?? '';
}

/**
 * Get the length of meaningful content on a line (excluding trailing spaces)
 */
function getLineLength(terminal: Terminal, row: number): number {
  return getLineText(terminal, row).length;
}

/**
 * Clamp a value between min and max (inclusive)
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Check if a character is a word character (non-whitespace)
 */
function isWordChar(ch: string): boolean {
  return ch !== '' && !/\s/.test(ch);
}

/**
 * Find the start of the next word from a given position
 */
function findNextWordStart(
  terminal: Terminal,
  row: number,
  col: number,
  maxRow: number,
): { row: number; col: number } {
  let r = row;
  let c = col;
  const text = getLineText(terminal, r);

  // Skip current word characters
  while (c < text.length && isWordChar(text[c] ?? '')) {
    c++;
  }

  // Skip whitespace (possibly across lines)
  while (r <= maxRow) {
    const lineText = getLineText(terminal, r);
    while (c < lineText.length && !isWordChar(lineText[c] ?? '')) {
      c++;
    }
    if (c < lineText.length) {
      return { row: r, col: c };
    }
    r++;
    c = 0;
  }

  return { row: Math.min(row, maxRow), col };
}

/**
 * Find the start of the previous word from a given position
 */
function findPrevWordStart(
  terminal: Terminal,
  row: number,
  col: number,
): { row: number; col: number } {
  let r = row;
  let c = col;

  // Move back one position to start searching
  c--;
  if (c < 0) {
    r--;
    if (r < 0) return { row: 0, col: 0 };
    c = Math.max(0, getLineLength(terminal, r) - 1);
  }

  // Skip whitespace backwards (possibly across lines)
  while (r >= 0) {
    const lineText = getLineText(terminal, r);
    while (c >= 0 && !isWordChar(lineText[c] ?? '')) {
      c--;
    }
    if (c >= 0) {
      break;
    }
    r--;
    if (r >= 0) {
      c = Math.max(0, getLineLength(terminal, r) - 1);
    }
  }

  if (r < 0) return { row: 0, col: 0 };

  // Skip word characters backwards to find start of word
  const lineText = getLineText(terminal, r);
  while (c > 0 && isWordChar(lineText[c - 1] ?? '')) {
    c--;
  }

  return { row: r, col: Math.max(0, c) };
}

/**
 * Find the end of the current/next word from a given position
 */
function findWordEnd(
  terminal: Terminal,
  row: number,
  col: number,
  maxRow: number,
): { row: number; col: number } {
  let r = row;
  let c = col + 1;

  // Skip whitespace forward (possibly across lines)
  while (r <= maxRow) {
    const lineText = getLineText(terminal, r);
    while (c < lineText.length && !isWordChar(lineText[c] ?? '')) {
      c++;
    }
    if (c < lineText.length) {
      break;
    }
    r++;
    c = 0;
  }

  if (r > maxRow) {
    return { row: maxRow, col: Math.max(0, getLineLength(terminal, maxRow) - 1) };
  }

  // Skip word characters forward to find end of word
  const lineText = getLineText(terminal, r);
  while (c < lineText.length - 1 && isWordChar(lineText[c + 1] ?? '')) {
    c++;
  }

  return { row: r, col: c };
}

/**
 * Find the column of the first non-blank character on a line
 */
function findFirstNonBlank(terminal: Terminal, row: number): number {
  const text = getLineText(terminal, row);
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== ' ' && text[i] !== '\t') {
      return i;
    }
  }
  return 0;
}

/**
 * Find the column of the last non-space character on a line (end-of-line position)
 */
function findEndOfLine(terminal: Terminal, row: number): number {
  const len = getLineLength(terminal, row);
  return Math.max(0, len - 1);
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for vi-mode copy mode in xterm.js terminals.
 *
 * Provides tmux-like copy mode with vi navigation keys, incremental search,
 * visual selection (character, line, block), and yank-to-clipboard.
 *
 * @example
 * ```tsx
 * const { state, enter, exit, isActive } = useCopyMode({
 *   terminal,
 *   searchAddon,
 *   onYank: (text) => navigator.clipboard.writeText(text),
 * });
 *
 * // Show mode indicator when active
 * {isActive && <div className="copy-mode-indicator">-- COPY --</div>}
 * ```
 */
export function useCopyMode(options: UseCopyModeOptions): UseCopyModeReturn {
  const { terminal, searchAddon, onYank } = options;

  const [state, setState] = useState<CopyModeState>(INITIAL_STATE);

  // Refs for mutable state that should not trigger re-renders
  const stateRef = useRef<CopyModeState>(INITIAL_STATE);
  const decorationRef = useRef<IDecoration | null>(null);
  const searchInputModeRef = useRef(false);
  const searchBufferRef = useRef('');
  const onYankRef = useRef(onYank);
  const gPendingRef = useRef(false);

  // Keep callback ref current
  useEffect(() => {
    onYankRef.current = onYank;
  }, [onYank]);

  // Keep stateRef in sync with state
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // ============================================================================
  // Decoration Management
  // ============================================================================

  const clearDecoration = useCallback(() => {
    if (decorationRef.current) {
      decorationRef.current.dispose();
      decorationRef.current = null;
    }
  }, []);

  const updateDecoration = useCallback(
    (row: number, col: number) => {
      if (!terminal) return;

      clearDecoration();

      const bufferBaseY = terminal.buffer.active.baseY;
      const markerOffset = row - (bufferBaseY + terminal.buffer.active.cursorY);
      const marker = terminal.registerMarker(markerOffset);

      const decoration = terminal.registerDecoration({
        marker,
        x: col,
        width: 1,
        height: 1,
        backgroundColor: '#ffffff',
        foregroundColor: '#000000',
        layer: 'top',
      });

      if (decoration) {
        decorationRef.current = decoration;
      }
    },
    [terminal, clearDecoration],
  );

  // ============================================================================
  // Selection Rendering
  // ============================================================================

  const updateSelection = useCallback(
    (cursorRow: number, cursorCol: number, selStart: { row: number; col: number } | null, mode: 'char' | 'line' | 'block', isActive: boolean) => {
      if (!terminal || !selStart || !isActive) {
        terminal?.clearSelection();
        return;
      }

      if (mode === 'line') {
        const startRow = Math.min(selStart.row, cursorRow);
        const endRow = Math.max(selStart.row, cursorRow);
        terminal.selectLines(startRow, endRow);
      } else if (mode === 'char' || mode === 'block') {
        // For character selection, compute a linear selection
        const startRow = Math.min(selStart.row, cursorRow);
        const endRow = Math.max(selStart.row, cursorRow);

        if (startRow === endRow) {
          const startCol = Math.min(selStart.col, cursorCol);
          const endCol = Math.max(selStart.col, cursorCol);
          terminal.select(startCol, startRow, endCol - startCol + 1);
        } else {
          // Multi-line character selection: select from start to end of first line,
          // then full lines, then start of last line to end position.
          // xterm's select() takes a start column, start row, and total length.
          // We approximate by selecting lines and using getSelection().
          if (selStart.row <= cursorRow) {
            // Forward selection
            const firstLineLen = terminal.cols - selStart.col;
            const middleLines = (endRow - startRow - 1) * terminal.cols;
            const lastLineLen = cursorCol + 1;
            terminal.select(selStart.col, selStart.row, firstLineLen + middleLines + lastLineLen);
          } else {
            // Backward selection
            const firstLineLen = terminal.cols - cursorCol;
            const middleLines = (endRow - startRow - 1) * terminal.cols;
            const lastLineLen = selStart.col + 1;
            terminal.select(cursorCol, cursorRow, firstLineLen + middleLines + lastLineLen);
          }
        }
      }
    },
    [terminal],
  );

  // ============================================================================
  // Cursor Movement and State Updates
  // ============================================================================

  const moveCursor = useCallback(
    (newRow: number, newCol: number) => {
      if (!terminal) return;

      const maxRow = terminal.buffer.active.length - 1;
      const clampedRow = clamp(newRow, 0, maxRow);
      const lineLen = getLineLength(terminal, clampedRow);
      const clampedCol = clamp(newCol, 0, Math.max(0, lineLen - 1));

      setState((prev) => {
        const next: CopyModeState = {
          ...prev,
          cursorRow: clampedRow,
          cursorCol: clampedCol,
        };

        // Update selection if active
        updateSelection(clampedRow, clampedCol, prev.selectionStart, prev.selectionMode, prev.selectionActive);

        return next;
      });

      // Scroll to keep cursor visible
      const viewportY = terminal.buffer.active.viewportY;
      const viewportBottom = viewportY + terminal.rows - 1;

      if (clampedRow < viewportY) {
        terminal.scrollToLine(clampedRow);
      } else if (clampedRow > viewportBottom) {
        terminal.scrollToLine(clampedRow - terminal.rows + 1);
      }

      // Update visual cursor decoration
      updateDecoration(clampedRow, clampedCol);
    },
    [terminal, updateDecoration, updateSelection],
  );

  // ============================================================================
  // Yank (copy to clipboard)
  // ============================================================================

  const yankSelection = useCallback(() => {
    if (!terminal) return;

    const text = terminal.getSelection();
    if (text) {
      onYankRef.current?.(text);
      // Also try to write to clipboard directly
      globalThis.navigator.clipboard.writeText(text).catch(() => {
        // Fallback handled by onYank callback
      });
    }
  }, [terminal]);

  // ============================================================================
  // Key Event Handler
  // ============================================================================

  const handleKeyEvent = useCallback(
    (event: KeyboardEvent): boolean => {
      const current = stateRef.current;
      if (!current.active || !terminal) {
        return true; // Not in copy mode, let event through
      }

      const { key, ctrlKey } = event;
      const maxRow = terminal.buffer.active.length - 1;

      // ---- Search Input Mode ----
      if (searchInputModeRef.current) {
        if (key === 'Escape') {
          searchInputModeRef.current = false;
          searchBufferRef.current = '';
          return false;
        }
        if (key === 'Enter') {
          searchInputModeRef.current = false;
          const query = searchBufferRef.current;
          if (query && searchAddon) {
            setState((prev) => ({
              ...prev,
              searchQuery: query,
            }));
            if (current.searchDirection === 'forward') {
              searchAddon.findNext(query);
            } else {
              searchAddon.findPrevious(query);
            }
          }
          return false;
        }
        if (key === 'Backspace') {
          searchBufferRef.current = searchBufferRef.current.slice(0, -1);
          return false;
        }
        // Accumulate printable characters
        if (key.length === 1) {
          searchBufferRef.current += key;
          // Incremental search as user types
          if (searchAddon && searchBufferRef.current) {
            if (current.searchDirection === 'forward') {
              searchAddon.findNext(searchBufferRef.current);
            } else {
              searchAddon.findPrevious(searchBufferRef.current);
            }
          }
          return false;
        }
        return false;
      }

      // ---- Handle 'g' prefix for 'gg' (go to top) ----
      if (gPendingRef.current) {
        gPendingRef.current = false;
        if (key === 'g') {
          moveCursor(0, current.cursorCol);
          return false;
        }
        // Any other key after 'g' — ignore the pending g
        // Fall through to normal handling
      }

      // ---- Vi Navigation ----
      if (!ctrlKey) {
        switch (key) {
          // Basic movement
          case 'h':
            moveCursor(current.cursorRow, current.cursorCol - 1);
            return false;
          case 'j':
            moveCursor(current.cursorRow + 1, current.cursorCol);
            return false;
          case 'k':
            moveCursor(current.cursorRow - 1, current.cursorCol);
            return false;
          case 'l':
            moveCursor(current.cursorRow, current.cursorCol + 1);
            return false;

          // Word movement
          case 'w': {
            const pos = findNextWordStart(terminal, current.cursorRow, current.cursorCol, maxRow);
            moveCursor(pos.row, pos.col);
            return false;
          }
          case 'b': {
            const pos = findPrevWordStart(terminal, current.cursorRow, current.cursorCol);
            moveCursor(pos.row, pos.col);
            return false;
          }
          case 'e': {
            const pos = findWordEnd(terminal, current.cursorRow, current.cursorCol, maxRow);
            moveCursor(pos.row, pos.col);
            return false;
          }

          // Line movement
          case '0':
            moveCursor(current.cursorRow, 0);
            return false;
          case '$':
            moveCursor(current.cursorRow, findEndOfLine(terminal, current.cursorRow));
            return false;
          case '^':
            moveCursor(current.cursorRow, findFirstNonBlank(terminal, current.cursorRow));
            return false;

          // Buffer movement
          case 'g':
            gPendingRef.current = true;
            return false;
          case 'G':
            moveCursor(maxRow, current.cursorCol);
            return false;

          // Viewport-relative movement
          case 'H':
            moveCursor(terminal.buffer.active.viewportY, current.cursorCol);
            return false;
          case 'M':
            moveCursor(
              terminal.buffer.active.viewportY + Math.floor(terminal.rows / 2),
              current.cursorCol,
            );
            return false;
          case 'L':
            moveCursor(
              terminal.buffer.active.viewportY + terminal.rows - 1,
              current.cursorCol,
            );
            return false;

          // Search
          case '/':
            searchInputModeRef.current = true;
            searchBufferRef.current = '';
            setState((prev) => ({ ...prev, searchDirection: 'forward' }));
            return false;
          case '?':
            searchInputModeRef.current = true;
            searchBufferRef.current = '';
            setState((prev) => ({ ...prev, searchDirection: 'backward' }));
            return false;
          case 'n':
            if (current.searchQuery && searchAddon) {
              if (current.searchDirection === 'forward') {
                searchAddon.findNext(current.searchQuery);
              } else {
                searchAddon.findPrevious(current.searchQuery);
              }
            }
            return false;
          case 'N':
            if (current.searchQuery && searchAddon) {
              // Reverse direction for N
              if (current.searchDirection === 'forward') {
                searchAddon.findPrevious(current.searchQuery);
              } else {
                searchAddon.findNext(current.searchQuery);
              }
            }
            return false;

          // Selection
          case ' ':
            setState((prev) => {
              if (prev.selectionActive) {
                // Toggle off
                terminal.clearSelection();
                return {
                  ...prev,
                  selectionActive: false,
                  selectionStart: null,
                };
              }
              // Start selection
              return {
                ...prev,
                selectionActive: true,
                selectionStart: { row: prev.cursorRow, col: prev.cursorCol },
                selectionMode: 'char',
              };
            });
            return false;
          case 'v':
            setState((prev) => {
              if (prev.selectionActive && prev.selectionMode === 'char') {
                // Toggle to block mode
                return { ...prev, selectionMode: 'block' };
              }
              if (prev.selectionActive && prev.selectionMode === 'block') {
                // Toggle back to char mode
                return { ...prev, selectionMode: 'char' };
              }
              // Start char selection
              return {
                ...prev,
                selectionActive: true,
                selectionStart: { row: prev.cursorRow, col: prev.cursorCol },
                selectionMode: 'char',
              };
            });
            return false;
          case 'V':
            setState((prev) => {
              if (prev.selectionActive && prev.selectionMode === 'line') {
                // Toggle off line mode
                terminal.clearSelection();
                return {
                  ...prev,
                  selectionActive: false,
                  selectionStart: null,
                  selectionMode: 'char',
                };
              }
              // Start or switch to line selection
              const newState: CopyModeState = {
                ...prev,
                selectionActive: true,
                selectionStart: prev.selectionStart ?? { row: prev.cursorRow, col: prev.cursorCol },
                selectionMode: 'line',
              };
              updateSelection(
                prev.cursorRow,
                prev.cursorCol,
                newState.selectionStart,
                'line',
                true,
              );
              return newState;
            });
            return false;

          // Yank
          case 'y':
          case 'Enter':
            if (current.selectionActive) {
              yankSelection();
              // Exit copy mode after yank
              setState(INITIAL_STATE);
              clearDecoration();
              terminal.clearSelection();
              return false;
            }
            return false;

          // Exit
          case 'q':
            setState(INITIAL_STATE);
            clearDecoration();
            terminal.clearSelection();
            return false;
          case 'Escape':
            if (current.selectionActive) {
              // Cancel selection but stay in copy mode
              setState((prev) => ({
                ...prev,
                selectionActive: false,
                selectionStart: null,
                selectionMode: 'char',
              }));
              terminal.clearSelection();
              return false;
            }
            // Exit copy mode
            setState(INITIAL_STATE);
            clearDecoration();
            terminal.clearSelection();
            return false;

          default:
            // Consume all other keys in copy mode
            return false;
        }
      }

      // ---- Ctrl key combinations ----
      if (ctrlKey) {
        switch (key) {
          case 'u': {
            // Half page up
            const halfPage = Math.floor(terminal.rows / 2);
            moveCursor(current.cursorRow - halfPage, current.cursorCol);
            return false;
          }
          case 'd': {
            // Half page down
            const halfPage = Math.floor(terminal.rows / 2);
            moveCursor(current.cursorRow + halfPage, current.cursorCol);
            return false;
          }
          case 'b': {
            // Full page up
            moveCursor(current.cursorRow - terminal.rows, current.cursorCol);
            return false;
          }
          case 'f': {
            // Full page down
            moveCursor(current.cursorRow + terminal.rows, current.cursorCol);
            return false;
          }
          default:
            return false;
        }
      }

      // Consume all keys in copy mode
      return false;
    },
    [terminal, searchAddon, moveCursor, updateSelection, yankSelection, clearDecoration],
  );

  // ============================================================================
  // Attach/Detach Key Handler
  // ============================================================================

  useEffect(() => {
    if (!terminal) return;
    if (!state.active) return;

    terminal.attachCustomKeyEventHandler(handleKeyEvent);

    return (): void => {
      // Restore default key handling by attaching a pass-through handler
      terminal.attachCustomKeyEventHandler(() => true);
    };
  }, [terminal, state.active, handleKeyEvent]);

  // ============================================================================
  // Cleanup on Unmount
  // ============================================================================

  useEffect((): (() => void) => {
    return (): void => {
      clearDecoration();
    };
  }, [clearDecoration]);

  // ============================================================================
  // Public API
  // ============================================================================

  const enter = useCallback(() => {
    if (!terminal) return;

    const buffer = terminal.buffer.active;
    const cursorRow = buffer.baseY + buffer.cursorY;
    const cursorCol = buffer.cursorX;

    const newState: CopyModeState = {
      active: true,
      cursorRow,
      cursorCol,
      selectionStart: null,
      selectionActive: false,
      selectionMode: 'char',
      searchQuery: '',
      searchDirection: 'forward',
    };

    setState(newState);
    stateRef.current = newState;

    // Reset internal refs
    searchInputModeRef.current = false;
    searchBufferRef.current = '';
    gPendingRef.current = false;

    // Show initial cursor decoration
    updateDecoration(cursorRow, cursorCol);
  }, [terminal, updateDecoration]);

  const exit = useCallback(() => {
    if (!terminal) return;

    setState(INITIAL_STATE);
    stateRef.current = INITIAL_STATE;
    clearDecoration();
    terminal.clearSelection();

    // Reset internal refs
    searchInputModeRef.current = false;
    searchBufferRef.current = '';
    gPendingRef.current = false;
  }, [terminal, clearDecoration]);

  return {
    state,
    enter,
    exit,
    isActive: state.active,
  };
}
