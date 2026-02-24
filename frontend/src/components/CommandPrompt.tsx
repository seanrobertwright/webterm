/**
 * Command prompt overlay component
 * Renders a tmux-style ":" command input at the bottom of the screen
 * with tab completion, history navigation, and error/success display.
 */

import type { ReactElement } from 'react';
import { useEffect, useRef } from 'react';
import type { CommandPromptState } from '@/hooks/useCommandPrompt';

// ============================================================================
// Types
// ============================================================================

interface CommandPromptProps {
  state: CommandPromptState;
  onInput: (value: string) => void;
  onKeyDown: (e: KeyboardEvent | { key: string; preventDefault: () => void }) => void;
  onClose: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function CommandPrompt({
  state,
  onInput,
  onKeyDown,
  onClose,
}: CommandPromptProps): ReactElement | null {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when prompt opens
  useEffect(() => {
    if (!state.isOpen) return;
    // Delay to ensure DOM is rendered
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [state.isOpen]);

  // Close on click outside
  useEffect(() => {
    if (!state.isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-command-prompt]')) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [state.isOpen, onClose]);

  if (!state.isOpen) {
    return null;
  }

  const hasCompletions =
    state.completions !== null && state.completions.suggestions.length > 0;

  return (
    <div
      data-command-prompt
      className="fixed bottom-0 left-0 right-0 z-50"
    >
      {/* Completion dropdown (above input) */}
      {hasCompletions && (
        <div className="max-h-48 overflow-y-auto bg-gray-800 border border-gray-600 border-b-0 mx-0">
          {state.completions!.suggestions.map((suggestion, idx) => (
            <div
              key={suggestion}
              className={`px-4 py-1 text-sm font-mono cursor-pointer ${
                idx === state.selectedCompletion
                  ? 'bg-gray-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                onInput(suggestion + ' ');
              }}
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-center px-4 py-2 bg-gray-900/95 border-t border-gray-700">
        <span className="text-green-400 mr-2 font-mono select-none">:</span>
        <input
          ref={inputRef}
          type="text"
          value={state.input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => {
            onKeyDown({
              key: e.key,
              preventDefault: () => e.preventDefault(),
            });
          }}
          className="flex-1 bg-transparent text-white font-mono outline-none text-sm"
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      {/* Error message */}
      {state.errorMessage && (
        <div className="px-4 py-1 bg-gray-900/95 text-red-400 text-sm font-mono">
          {state.errorMessage}
        </div>
      )}

      {/* Success message */}
      {state.successMessage && (
        <div className="px-4 py-1 bg-gray-900/95 text-green-400 text-sm font-mono">
          {state.successMessage}
        </div>
      )}
    </div>
  );
}
