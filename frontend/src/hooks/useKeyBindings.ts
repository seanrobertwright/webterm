/**
 * React hook for tmux-like keyboard shortcuts
 *
 * Implements Ctrl+prefix key system. When the keybinding store is loaded,
 * bindings are looked up dynamically from the store (server-driven).
 * Falls back to hardcoded defaults when the store hasn't loaded yet.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useKeybindingStore } from '../stores/keybinding-store';
import type { KeybindingAction, PrefixModeState } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface KeyBindingConfig {
  /** Key that triggers the binding (after prefix, or standalone) */
  key: string;
  /** Whether this binding requires the prefix key first */
  requiresPrefix: boolean;
  /** Modifier keys required */
  modifiers?: {
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    meta?: boolean;
  };
  /** Action to dispatch */
  action: KeybindingAction;
  /** Human-readable description */
  description: string;
}

export interface UseKeyBindingsOptions {
  /** Enable keybinding processing */
  enabled?: boolean;
  /** Timeout for prefix mode in ms */
  prefixTimeout?: number;
  /** Custom keybindings (merged with defaults, used as fallback) */
  customBindings?: KeyBindingConfig[];
  /** Callback when a KeybindingAction is triggered (client-side handling) */
  onAction?: (action: KeybindingAction) => void;
  /** Callback when a tmux command should be executed server-side */
  onCommand?: (command: string) => void;
  /** Callback when prefix mode changes */
  onPrefixModeChange?: (active: boolean) => void;
  /** Callback for unhandled keys in prefix mode */
  onPrefixKeyUnhandled?: (key: string) => void;
}

export interface UseKeyBindingsReturn {
  /** Whether currently in prefix mode */
  prefixMode: PrefixModeState;
  /** Active keybindings (legacy format) */
  bindings: KeyBindingConfig[];
  /** Manually enter prefix mode */
  enterPrefixMode: () => void;
  /** Manually exit prefix mode */
  exitPrefixMode: () => void;
  /** Process a keyboard event */
  handleKeyEvent: (event: KeyboardEvent) => boolean;
  /** Get all bindings for display */
  getBindingsHelp: () => Array<{ key: string; description: string }>;
}

// ============================================================================
// Command-to-Action Mapping
// ============================================================================

/**
 * Map well-known tmux commands to client-side KeybindingAction types.
 * Commands not in this map get dispatched via onCommand to the server.
 */
function commandToAction(command: string): KeybindingAction | null {
  // Normalize whitespace
  const cmd = command.trim();

  // Exact matches
  const exactMap: Record<string, KeybindingAction> = {
    'copy-mode': { type: 'copyMode' },
    'command-prompt': { type: 'commandPrompt' },
    'paste-buffer': { type: 'pasteBuffer' },
    'new-window': { type: 'newWindow' },
    'next-window': { type: 'nextWindow' },
    'previous-window': { type: 'prevWindow' },
    'kill-pane': { type: 'closePane' },
    'list-keys': { type: 'showHelp' },
  };

  const exact = exactMap[cmd];
  if (exact) return exact;

  // Parameterized matches
  if (cmd === 'split-window -h') return { type: 'splitVertical' };
  if (cmd === 'split-window -v') return { type: 'splitHorizontal' };
  if (cmd === 'select-pane -L') return { type: 'navigatePane', direction: 'left' };
  if (cmd === 'select-pane -R') return { type: 'navigatePane', direction: 'right' };
  if (cmd === 'select-pane -U') return { type: 'navigatePane', direction: 'up' };
  if (cmd === 'select-pane -D') return { type: 'navigatePane', direction: 'down' };
  if (cmd === 'resize-pane -Z') return { type: 'zoomPane' };

  return null;
}

// ============================================================================
// Browser Key ↔ tmux Key Mapping
// ============================================================================

/**
 * Convert a browser KeyboardEvent into the tmux key notation used in the store.
 * Returns null if the key cannot be mapped.
 */
function eventToTmuxKey(event: KeyboardEvent): string | null {
  const { key, ctrlKey, altKey } = event;

  // Ctrl+key combinations: C-o, C-b, C-f, etc.
  if (ctrlKey && !altKey && key.length === 1) {
    return `C-${key.toLowerCase()}`;
  }

  // Alt+key combinations: M-1, M-2, etc.
  if (altKey && !ctrlKey && key.length === 1) {
    return `M-${key}`;
  }

  // Arrow keys
  const arrowMap: Record<string, string> = {
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
  };
  const arrow = arrowMap[key];
  if (arrow) return arrow;

  // Space
  if (key === ' ') return 'Space';

  // Escape
  if (key === 'Escape') return 'Escape';

  // Enter
  if (key === 'Enter') return 'Enter';

  // Single character keys (including shifted: %, ", ?, :, etc.)
  if (key.length === 1) return key;

  return null;
}

// ============================================================================
// Fallback Default Bindings (used before store loads)
// ============================================================================

const FALLBACK_BINDINGS: KeyBindingConfig[] = [
  { key: '%', requiresPrefix: true, modifiers: { shift: true }, action: { type: 'splitVertical' }, description: 'Split pane vertically' },
  { key: '"', requiresPrefix: true, modifiers: { shift: true }, action: { type: 'splitHorizontal' }, description: 'Split pane horizontally' },
  { key: 'ArrowLeft', requiresPrefix: true, action: { type: 'navigatePane', direction: 'left' }, description: 'Focus pane to the left' },
  { key: 'ArrowRight', requiresPrefix: true, action: { type: 'navigatePane', direction: 'right' }, description: 'Focus pane to the right' },
  { key: 'ArrowUp', requiresPrefix: true, action: { type: 'navigatePane', direction: 'up' }, description: 'Focus pane above' },
  { key: 'ArrowDown', requiresPrefix: true, action: { type: 'navigatePane', direction: 'down' }, description: 'Focus pane below' },
  { key: 'x', requiresPrefix: true, action: { type: 'closePane' }, description: 'Close current pane' },
  { key: 'z', requiresPrefix: true, action: { type: 'zoomPane' }, description: 'Zoom/unzoom pane' },
  { key: 'c', requiresPrefix: true, action: { type: 'newWindow' }, description: 'Create new window' },
  { key: 'n', requiresPrefix: true, action: { type: 'nextWindow' }, description: 'Next window' },
  { key: 'p', requiresPrefix: true, action: { type: 'prevWindow' }, description: 'Previous window' },
  { key: '?', requiresPrefix: true, modifiers: { shift: true }, action: { type: 'showHelp' }, description: 'Show help' },
  { key: ':', requiresPrefix: true, modifiers: { shift: true }, action: { type: 'commandPrompt' }, description: 'Open command prompt' },
  { key: '[', requiresPrefix: true, action: { type: 'copyMode' }, description: 'Enter copy mode' },
  { key: ']', requiresPrefix: true, action: { type: 'pasteBuffer' }, description: 'Paste from buffer' },
  { key: 'S', requiresPrefix: true, modifiers: { shift: true }, action: { type: 'saveSession' }, description: 'Save session' },
  // Non-prefix clipboard bindings
  { key: 'c', requiresPrefix: false, modifiers: { ctrl: true, shift: true }, action: { type: 'copy' }, description: 'Copy selection' },
  { key: 'v', requiresPrefix: false, modifiers: { ctrl: true, shift: true }, action: { type: 'paste' }, description: 'Paste from clipboard' },
];

// ============================================================================
// Hook Implementation
// ============================================================================

export function useKeyBindings(options: UseKeyBindingsOptions = {}): UseKeyBindingsReturn {
  const {
    enabled = true,
    prefixTimeout = 2000,
    customBindings = [],
    onAction,
    onCommand,
    onPrefixModeChange,
    onPrefixKeyUnhandled,
  } = options;

  // Read from keybinding store
  const storeLoaded = useKeybindingStore((s) => s.loaded);
  const prefixBindings = useKeybindingStore((s) => s.tables['prefix']);
  const rootBindings = useKeybindingStore((s) => s.tables['root']);
  const prefixKey = useKeybindingStore((s) => s.prefixKey);

  const [prefixMode, setPrefixMode] = useState<PrefixModeState>({
    active: false,
    timestamp: null,
  });

  // Ref mirror of prefixMode so handleKeyEvent always reads fresh state
  // without needing to be recreated (avoids stale closure in xterm handler).
  const prefixModeRef = useRef(prefixMode);
  prefixModeRef.current = prefixMode;

  const prefixTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Legacy bindings for backward compat and getBindingsHelp
  const legacyBindings = [...FALLBACK_BINDINGS, ...customBindings];

  // Refs for callbacks
  const onActionRef = useRef(onAction);
  const onCommandRef = useRef(onCommand);
  const onPrefixModeChangeRef = useRef(onPrefixModeChange);
  const onPrefixKeyUnhandledRef = useRef(onPrefixKeyUnhandled);

  useEffect(() => {
    onActionRef.current = onAction;
    onCommandRef.current = onCommand;
    onPrefixModeChangeRef.current = onPrefixModeChange;
    onPrefixKeyUnhandledRef.current = onPrefixKeyUnhandled;
  }, [onAction, onCommand, onPrefixModeChange, onPrefixKeyUnhandled]);

  // ============================================================================
  // Prefix Mode Management
  // ============================================================================

  const enterPrefixMode = useCallback(() => {
    if (prefixTimeoutRef.current) {
      clearTimeout(prefixTimeoutRef.current);
    }

    const state = { active: true, timestamp: Date.now() };
    prefixModeRef.current = state;  // Synchronous update for immediate reads
    setPrefixMode(state);
    onPrefixModeChangeRef.current?.(true);

    prefixTimeoutRef.current = setTimeout(() => {
      const off = { active: false, timestamp: null };
      prefixModeRef.current = off;
      setPrefixMode(off);
      onPrefixModeChangeRef.current?.(false);
    }, prefixTimeout);
  }, [prefixTimeout]);

  const exitPrefixMode = useCallback(() => {
    if (prefixTimeoutRef.current) {
      clearTimeout(prefixTimeoutRef.current);
      prefixTimeoutRef.current = null;
    }
    const off = { active: false, timestamp: null };
    prefixModeRef.current = off;  // Synchronous update for immediate reads
    setPrefixMode(off);
    onPrefixModeChangeRef.current?.(false);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (prefixTimeoutRef.current) {
        clearTimeout(prefixTimeoutRef.current);
      }
    };
  }, []);

  // ============================================================================
  // Key Event Handling
  // ============================================================================

  const handleKeyEvent = useCallback((event: KeyboardEvent): boolean => {
    if (!enabled) {
      return true;
    }

    // Read prefix state from ref so this callback is always current,
    // even before React effects propagate the new function reference.
    const isPrefixActive = prefixModeRef.current.active;

    const { key, ctrlKey, shiftKey, altKey, metaKey } = event;

    // Check for prefix key (Ctrl+prefix)
    if (ctrlKey && !shiftKey && !altKey && !metaKey && key.toLowerCase() === prefixKey) {
      if (!isPrefixActive) {
        enterPrefixMode();
        return false;
      } else {
        // Double prefix sends literal key
        exitPrefixMode();
        return true;
      }
    }

    // ---- Store-driven path (when loaded) ----
    if (storeLoaded) {
      // Check root table bindings (no prefix required)
      if (rootBindings && rootBindings.length > 0) {
        const tmuxKey = eventToTmuxKey(event);
        if (tmuxKey) {
          const rootBinding = rootBindings.find((b) => b.key === tmuxKey);
          if (rootBinding) {
            exitPrefixMode();
            dispatchBinding(rootBinding.command);
            return false;
          }
        }
      }

      // Non-prefix clipboard shortcuts (Ctrl+Shift+C/V) — always active
      if (ctrlKey && shiftKey && !altKey && !metaKey) {
        if (key.toLowerCase() === 'c') {
          exitPrefixMode();
          onActionRef.current?.({ type: 'copy' });
          return false;
        }
        if (key.toLowerCase() === 'v') {
          exitPrefixMode();
          onActionRef.current?.({ type: 'paste' });
          return false;
        }
      }

      // If in prefix mode, look up in prefix table
      if (isPrefixActive) {
        const tmuxKey = eventToTmuxKey(event);
        if (tmuxKey && prefixBindings) {
          const binding = prefixBindings.find((b) => b.key === tmuxKey);
          if (binding) {
            exitPrefixMode();
            dispatchBinding(binding.command);
            return false;
          }
        }

        // Unhandled key in prefix mode
        onPrefixKeyUnhandledRef.current?.(key);
        exitPrefixMode();
        return false;
      }

      return true;
    }

    // ---- Fallback path (store not loaded) ----

    // Check non-prefix bindings
    for (const binding of legacyBindings) {
      if (!binding.requiresPrefix && matchesBinding(event, binding)) {
        exitPrefixMode();
        onActionRef.current?.(binding.action);
        return false;
      }
    }

    // Check prefix bindings
    if (isPrefixActive) {
      for (const binding of legacyBindings) {
        if (binding.requiresPrefix && matchesBindingInPrefixMode(event, binding)) {
          exitPrefixMode();
          onActionRef.current?.(binding.action);
          return false;
        }
      }

      onPrefixKeyUnhandledRef.current?.(key);
      exitPrefixMode();
      return false;
    }

    return true;
  }, [enabled, prefixKey, storeLoaded, prefixBindings, rootBindings, legacyBindings, enterPrefixMode, exitPrefixMode]);

  // ============================================================================
  // Dispatch
  // ============================================================================

  function dispatchBinding(command: string): void {
    const action = commandToAction(command);
    if (action) {
      onActionRef.current?.(action);
    } else {
      // Send to server for execution
      onCommandRef.current?.(command);
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  const getBindingsHelp = useCallback(() => {
    // If store is loaded, generate help from store bindings
    if (storeLoaded && prefixBindings) {
      const items: Array<{ key: string; description: string }> = [];
      for (const b of prefixBindings) {
        items.push({
          key: `Ctrl+B ${formatTmuxKeyForDisplay(b.key)}`,
          description: b.command,
        });
      }
      if (rootBindings) {
        for (const b of rootBindings) {
          items.push({ key: b.key, description: b.command });
        }
      }
      return items;
    }

    // Fallback
    return legacyBindings.map((binding) => {
      let keyDisplay = '';
      if (binding.requiresPrefix) {
        keyDisplay = `Ctrl+B ${formatKey(binding)}`;
      } else {
        const mods = binding.modifiers || {};
        const parts: string[] = [];
        if (mods.ctrl) parts.push('Ctrl');
        if (mods.shift) parts.push('Shift');
        if (mods.alt) parts.push('Alt');
        if (mods.meta) parts.push('Meta');
        parts.push(formatKeyName(binding.key));
        keyDisplay = parts.join('+');
      }
      return { key: keyDisplay, description: binding.description };
    });
  }, [storeLoaded, prefixBindings, rootBindings, legacyBindings]);

  return {
    prefixMode,
    bindings: legacyBindings,
    enterPrefixMode,
    exitPrefixMode,
    handleKeyEvent,
    getBindingsHelp,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function matchesBinding(event: KeyboardEvent, binding: KeyBindingConfig): boolean {
  const mods = binding.modifiers || {};
  if (event.key.toLowerCase() !== binding.key.toLowerCase()) return false;
  if (!!mods.ctrl !== event.ctrlKey) return false;
  if (!!mods.shift !== event.shiftKey) return false;
  if (!!mods.alt !== event.altKey) return false;
  if (!!mods.meta !== event.metaKey) return false;
  return true;
}

function matchesBindingInPrefixMode(event: KeyboardEvent, binding: KeyBindingConfig): boolean {
  const mods = binding.modifiers || {};

  if (binding.key.startsWith('Arrow')) {
    return event.key === binding.key && !event.ctrlKey && !event.altKey && !event.metaKey;
  }

  if (event.key.toLowerCase() !== binding.key.toLowerCase()) {
    if (binding.key === '%' && event.key === '%') return true;
    if (binding.key === '"' && event.key === '"') return true;
    if (binding.key === '?' && event.key === '?') return true;
    if (binding.key === ':' && event.key === ':') return true;
    if (binding.key === 'S' && event.key === 'S' && event.shiftKey) return true;
    return false;
  }

  if (mods.shift && !event.shiftKey) return false;
  if (event.ctrlKey || event.altKey || event.metaKey) return false;

  return true;
}

function formatKey(binding: KeyBindingConfig): string {
  const mods = binding.modifiers || {};
  const parts: string[] = [];
  if (mods.shift && !['%', '"', '?', 'S', ':'].includes(binding.key)) {
    parts.push('Shift');
  }
  if (mods.alt) parts.push('Alt');
  parts.push(formatKeyName(binding.key));
  return parts.join('+');
}

function formatKeyName(key: string): string {
  const keyNames: Record<string, string> = {
    ArrowLeft: '\u2190',
    ArrowRight: '\u2192',
    ArrowUp: '\u2191',
    ArrowDown: '\u2193',
    ' ': 'Space',
    Enter: '\u21B5',
    Escape: 'Esc',
  };
  return keyNames[key] ?? key;
}

function formatTmuxKeyForDisplay(tmuxKey: string): string {
  const displayMap: Record<string, string> = {
    Left: '\u2190',
    Right: '\u2192',
    Up: '\u2191',
    Down: '\u2193',
    Space: 'Space',
  };
  return displayMap[tmuxKey] ?? tmuxKey;
}

// ============================================================================
// Utility Hook for Global Key Handler
// ============================================================================

export function useGlobalKeyBindings(options: UseKeyBindingsOptions) {
  const bindingsHook = useKeyBindings(options);

  // Expose handler globally so xterm's attachCustomKeyEventHandler can call it
  useEffect(() => {
    (globalThis as Record<string, unknown>).webtermKeyHandler = bindingsHook.handleKeyEvent;
    return () => {
      delete (globalThis as Record<string, unknown>).webtermKeyHandler;
    };
  }, [bindingsHook.handleKeyEvent]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      // Skip if already handled by xterm's attachCustomKeyEventHandler
      if ((event as KeyboardEvent & { _webtermHandled?: boolean })._webtermHandled) {
        return;
      }

      const consumed = !bindingsHook.handleKeyEvent(event);
      if (consumed) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [bindingsHook.handleKeyEvent]);

  return bindingsHook;
}
