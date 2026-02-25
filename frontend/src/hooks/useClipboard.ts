/**
 * Hook for clipboard operations on terminal panes
 * Provides copy (from selection) and paste (to input) functionality
 */

import { useCallback } from 'react';
import { copyToClipboard, pasteFromClipboard } from '../services/clipboard-service';

export interface UseClipboardReturn {
  /** Copy the current selection from a pane to clipboard */
  copySelection: (paneId: string) => Promise<{ success: boolean; fallback?: boolean }>;
  /** Paste clipboard contents into a pane as terminal input */
  pasteToPane: (paneId: string, sendInput: (paneId: string, data: string) => void) => Promise<boolean>;
}

/**
 * Hook for terminal clipboard operations
 */
export function useClipboard(): UseClipboardReturn {
  const copySelection = useCallback(async (paneId: string) => {
    const handle = globalThis.terminalHandles?.get(paneId);
    if (!handle || !handle.hasSelection()) {
      return { success: false };
    }

    const selection = handle.getSelection();
    if (!selection) {
      return { success: false };
    }

    const result = await copyToClipboard(selection);
    return {
      success: result.success,
      fallback: !!result.error, // true if fell back to in-app clipboard
    };
  }, []);

  const pasteToPane = useCallback(async (
    paneId: string,
    sendInput: (paneId: string, data: string) => void
  ) => {
    const result = await pasteFromClipboard();
    if (result.success && result.data) {
      sendInput(paneId, result.data);
      return true;
    }
    return false;
  }, []);

  return { copySelection, pasteToPane };
}
