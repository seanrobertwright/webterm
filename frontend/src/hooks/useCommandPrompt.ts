/**
 * React hook for tmux-style command prompt (:)
 * Manages input state, tab completion, history, and command submission.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultRegistry } from '@webterm/shared/tmux/command-defs';
import type { CompletionResult } from '@webterm/shared/tmux/command-registry';

// ============================================================================
// Types
// ============================================================================

export interface CommandPromptState {
  isOpen: boolean;
  input: string;
  cursorPosition: number;
  historyIndex: number;
  completions: CompletionResult | null;
  selectedCompletion: number;
  errorMessage: string | null;
  successMessage: string | null;
}

export interface UseCommandPromptOptions {
  onSubmit: (command: string) => void;
}

export interface UseCommandPromptReturn {
  state: CommandPromptState;
  open: () => void;
  close: () => void;
  setInput: (value: string) => void;
  handleKeyDown: (e: KeyboardEvent | { key: string; preventDefault: () => void }) => void;
  setError: (message: string | null) => void;
  setSuccess: (message: string | null) => void;
}

const HISTORY_KEY = 'webterm:command-history';
const MAX_HISTORY = 100;

function loadHistory(): string[] {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string');
      }
    }
  } catch {
    // Ignore parse errors
  }
  return [];
}

function saveHistory(history: string[]): void {
  try {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch {
    // Ignore storage errors
  }
}

// ============================================================================
// Hook
// ============================================================================

const initialState: CommandPromptState = {
  isOpen: false,
  input: '',
  cursorPosition: 0,
  historyIndex: -1,
  completions: null,
  selectedCompletion: -1,
  errorMessage: null,
  successMessage: null,
};

export function useCommandPrompt(options: UseCommandPromptOptions): UseCommandPromptReturn {
  const { onSubmit } = options;
  const [state, setState] = useState<CommandPromptState>(initialState);
  const historyRef = useRef<string[]>(loadHistory());

  const updateCompletions = useCallback((input: string): CompletionResult | null => {
    if (!input.trim()) return null;
    const result = defaultRegistry.complete(input);
    return result.suggestions.length > 0 ? result : null;
  }, []);

  const open = useCallback(() => {
    setState({
      ...initialState,
      isOpen: true,
    });
  }, []);

  const close = useCallback(() => {
    setState(initialState);
  }, []);

  const setInput = useCallback((value: string) => {
    const completions = updateCompletions(value);
    setState((prev) => ({
      ...prev,
      input: value,
      cursorPosition: value.length,
      completions,
      selectedCompletion: -1,
      errorMessage: null,
      successMessage: null,
    }));
  }, [updateCompletions]);

  const setError = useCallback((message: string | null) => {
    setState((prev) => ({ ...prev, errorMessage: message, successMessage: null }));
  }, []);

  const setSuccess = useCallback((message: string | null) => {
    setState((prev) => ({ ...prev, successMessage: message, errorMessage: null }));
    if (message) {
      setTimeout(() => {
        setState((prev) => {
          if (prev.successMessage === message) {
            return initialState;
          }
          return prev;
        });
      }, 1500);
    }
  }, []);

  // Listen for command result/error events from WebSocket message handler
  useEffect(() => {
    if (!state.isOpen) return;

    const handleResult = (e: Event) => {
      const detail = (e as CustomEvent<{ output: string }>).detail;
      if (detail.output) {
        setSuccess(detail.output);
      } else {
        // Empty output means command succeeded silently — auto-close
        setState(initialState);
      }
    };

    const handleError = (e: Event) => {
      const detail = (e as CustomEvent<{ message: string }>).detail;
      setError(detail.message);
    };

    window.addEventListener('webterm:commandResult', handleResult);
    window.addEventListener('webterm:commandError', handleError);
    return () => {
      window.removeEventListener('webterm:commandResult', handleResult);
      window.removeEventListener('webterm:commandError', handleError);
    };
  }, [state.isOpen, setSuccess, setError]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent | { key: string; preventDefault: () => void }) => {
      const { key } = e;

      if (key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }

      if (key === 'Enter') {
        e.preventDefault();
        setState((prev) => {
          const command = prev.input.trim();
          if (!command) return prev;

          // Add to history
          const history = historyRef.current;
          const idx = history.indexOf(command);
          if (idx !== -1) {
            history.splice(idx, 1);
          }
          history.unshift(command);
          if (history.length > MAX_HISTORY) {
            history.pop();
          }
          saveHistory(history);

          // Submit
          onSubmit(command);

          return {
            ...prev,
            historyIndex: -1,
            errorMessage: null,
          };
        });
        return;
      }

      if (key === 'Tab') {
        e.preventDefault();
        setState((prev) => {
          if (!prev.completions || prev.completions.suggestions.length === 0) {
            return prev;
          }

          const nextIdx =
            prev.selectedCompletion < prev.completions.suggestions.length - 1
              ? prev.selectedCompletion + 1
              : 0;
          const suggestion = prev.completions.suggestions[nextIdx];
          if (!suggestion) return prev;

          // Replace the current partial with the completion
          let newInput: string;
          if (prev.completions.type === 'command') {
            newInput = suggestion;
          } else {
            // For flag completions, append to the existing input
            const parts = prev.input.split(' ');
            parts[parts.length - 1] = suggestion;
            newInput = parts.join(' ');
          }

          return {
            ...prev,
            input: newInput + ' ',
            cursorPosition: newInput.length + 1,
            selectedCompletion: nextIdx,
            completions: updateCompletions(newInput),
          };
        });
        return;
      }

      if (key === 'ArrowUp') {
        e.preventDefault();
        setState((prev) => {
          const history = historyRef.current;
          if (history.length === 0) return prev;

          const nextIdx = Math.min(prev.historyIndex + 1, history.length - 1);
          const historyItem = history[nextIdx];
          if (historyItem === undefined) return prev;

          return {
            ...prev,
            historyIndex: nextIdx,
            input: historyItem,
            cursorPosition: historyItem.length,
            completions: updateCompletions(historyItem),
            selectedCompletion: -1,
          };
        });
        return;
      }

      if (key === 'ArrowDown') {
        e.preventDefault();
        setState((prev) => {
          if (prev.historyIndex <= 0) {
            return {
              ...prev,
              historyIndex: -1,
              input: '',
              cursorPosition: 0,
              completions: null,
              selectedCompletion: -1,
            };
          }

          const nextIdx = prev.historyIndex - 1;
          const history = historyRef.current;
          const historyItem = history[nextIdx];
          if (historyItem === undefined) return prev;

          return {
            ...prev,
            historyIndex: nextIdx,
            input: historyItem,
            cursorPosition: historyItem.length,
            completions: updateCompletions(historyItem),
            selectedCompletion: -1,
          };
        });
        return;
      }
    },
    [close, onSubmit, updateCompletions],
  );

  return {
    state,
    open,
    close,
    setInput,
    handleKeyDown,
    setError,
    setSuccess,
  };
}
