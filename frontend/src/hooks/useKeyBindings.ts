/**
 * React hook for tmux-like keyboard shortcuts
 * Implements Ctrl+B prefix key system with configurable bindings
 */

import { useCallback, useEffect, useRef, useState } from 'react';
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
  /** Prefix key (default: 'b' for Ctrl+B) */
  prefixKey?: string;
  /** Timeout for prefix mode in ms */
  prefixTimeout?: number;
  /** Custom keybindings (merged with defaults) */
  customBindings?: KeyBindingConfig[];
  /** Callback when action is triggered */
  onAction?: (action: KeybindingAction) => void;
  /** Callback when prefix mode changes */
  onPrefixModeChange?: (active: boolean) => void;
  /** Callback for unhandled keys in prefix mode */
  onPrefixKeyUnhandled?: (key: string) => void;
}

export interface UseKeyBindingsReturn {
  /** Whether currently in prefix mode */
  prefixMode: PrefixModeState;
  /** Active keybindings */
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
// Default Keybindings
// ============================================================================

const DEFAULT_BINDINGS: KeyBindingConfig[] = [
  // Pane splitting
  {
    key: '%',
    requiresPrefix: true,
    modifiers: { shift: true },
    action: { type: 'splitVertical' },
    description: 'Split pane vertically',
  },
  {
    key: '"',
    requiresPrefix: true,
    modifiers: { shift: true },
    action: { type: 'splitHorizontal' },
    description: 'Split pane horizontally',
  },
  
  // Pane navigation
  {
    key: 'ArrowLeft',
    requiresPrefix: true,
    action: { type: 'navigatePane', direction: 'left' },
    description: 'Focus pane to the left',
  },
  {
    key: 'ArrowRight',
    requiresPrefix: true,
    action: { type: 'navigatePane', direction: 'right' },
    description: 'Focus pane to the right',
  },
  {
    key: 'ArrowUp',
    requiresPrefix: true,
    action: { type: 'navigatePane', direction: 'up' },
    description: 'Focus pane above',
  },
  {
    key: 'ArrowDown',
    requiresPrefix: true,
    action: { type: 'navigatePane', direction: 'down' },
    description: 'Focus pane below',
  },
  
  // Pane management
  {
    key: 'x',
    requiresPrefix: true,
    action: { type: 'closePane' },
    description: 'Close current pane',
  },
  {
    key: 'z',
    requiresPrefix: true,
    action: { type: 'zoomPane' },
    description: 'Zoom/unzoom pane',
  },
  
  // Window management
  {
    key: 'c',
    requiresPrefix: true,
    action: { type: 'newWindow' },
    description: 'Create new window',
  },
  {
    key: 'n',
    requiresPrefix: true,
    action: { type: 'nextWindow' },
    description: 'Next window',
  },
  {
    key: 'p',
    requiresPrefix: true,
    action: { type: 'prevWindow' },
    description: 'Previous window',
  },
  
  // Session management
  {
    key: 'S',
    requiresPrefix: true,
    modifiers: { shift: true },
    action: { type: 'saveSession' },
    description: 'Save session',
  },
  
  // Help
  {
    key: '?',
    requiresPrefix: true,
    modifiers: { shift: true },
    action: { type: 'showHelp' },
    description: 'Show help',
  },
  
  // Clipboard (no prefix required)
  {
    key: 'c',
    requiresPrefix: false,
    modifiers: { ctrl: true, shift: true },
    action: { type: 'copy' },
    description: 'Copy selection',
  },
  {
    key: 'v',
    requiresPrefix: false,
    modifiers: { ctrl: true, shift: true },
    action: { type: 'paste' },
    description: 'Paste from clipboard',
  },
];

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing tmux-like keyboard shortcuts
 * 
 * @example
 * ```tsx
 * const { prefixMode, handleKeyEvent } = useKeyBindings({
 *   onAction: (action) => {
 *     switch (action.type) {
 *       case 'splitVertical':
 *         splitPane('v');
 *         break;
 *       case 'closePane':
 *         closeActivePane();
 *         break;
 *     }
 *   },
 *   onPrefixModeChange: (active) => {
 *     setShowPrefixIndicator(active);
 *   },
 * });
 * 
 * useEffect(() => {
 *   terminal.attachCustomKeyEventHandler(handleKeyEvent);
 * }, [terminal, handleKeyEvent]);
 * ```
 */
export function useKeyBindings(options: UseKeyBindingsOptions = {}): UseKeyBindingsReturn {
  const {
    enabled = true,
    prefixKey = 'b',
    prefixTimeout = 2000,
    customBindings = [],
    onAction,
    onPrefixModeChange,
    onPrefixKeyUnhandled,
  } = options;

  const [prefixMode, setPrefixMode] = useState<PrefixModeState>({
    active: false,
    timestamp: null,
  });

  const prefixTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Merge default and custom bindings
  const bindings = [...DEFAULT_BINDINGS, ...customBindings];

  // Refs for callbacks
  const onActionRef = useRef(onAction);
  const onPrefixModeChangeRef = useRef(onPrefixModeChange);
  const onPrefixKeyUnhandledRef = useRef(onPrefixKeyUnhandled);

  useEffect(() => {
    onActionRef.current = onAction;
    onPrefixModeChangeRef.current = onPrefixModeChange;
    onPrefixKeyUnhandledRef.current = onPrefixKeyUnhandled;
  }, [onAction, onPrefixModeChange, onPrefixKeyUnhandled]);

  // ============================================================================
  // Prefix Mode Management
  // ============================================================================

  const enterPrefixMode = useCallback(() => {
    // Clear existing timeout
    if (prefixTimeoutRef.current) {
      clearTimeout(prefixTimeoutRef.current);
    }

    setPrefixMode({
      active: true,
      timestamp: Date.now(),
    });
    onPrefixModeChangeRef.current?.(true);

    // Set timeout to exit prefix mode
    prefixTimeoutRef.current = setTimeout(() => {
      setPrefixMode({ active: false, timestamp: null });
      onPrefixModeChangeRef.current?.(false);
    }, prefixTimeout);
  }, [prefixTimeout]);

  const exitPrefixMode = useCallback(() => {
    if (prefixTimeoutRef.current) {
      clearTimeout(prefixTimeoutRef.current);
      prefixTimeoutRef.current = null;
    }
    
    setPrefixMode({ active: false, timestamp: null });
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
      return true; // Let event propagate
    }

    const { key, ctrlKey, shiftKey, altKey, metaKey } = event;

    // Check for prefix key (Ctrl+B)
    if (ctrlKey && !shiftKey && !altKey && !metaKey && key.toLowerCase() === prefixKey) {
      if (!prefixMode.active) {
        enterPrefixMode();
        return false; // Consume the event
      } else {
        // Ctrl+B while in prefix mode sends literal Ctrl+B
        exitPrefixMode();
        return true; // Let it propagate
      }
    }

    // Check bindings that don't require prefix
    for (const binding of bindings) {
      if (!binding.requiresPrefix && matchesBinding(event, binding)) {
        exitPrefixMode();
        onActionRef.current?.(binding.action);
        return false; // Consume the event
      }
    }

    // If in prefix mode, check prefix bindings
    if (prefixMode.active) {
      for (const binding of bindings) {
        if (binding.requiresPrefix && matchesBindingInPrefixMode(event, binding)) {
          exitPrefixMode();
          onActionRef.current?.(binding.action);
          return false; // Consume the event
        }
      }

      // If we get here, the key wasn't bound - exit prefix mode
      onPrefixKeyUnhandledRef.current?.(key);
      exitPrefixMode();
      return false; // Consume the event to prevent terminal input
    }

    // Not in prefix mode and no standalone binding matched
    return true; // Let event propagate to terminal
  }, [enabled, prefixKey, prefixMode.active, bindings, enterPrefixMode, exitPrefixMode]);

  // ============================================================================
  // Helper Methods
  // ============================================================================

  const getBindingsHelp = useCallback(() => {
    return bindings.map((binding) => {
      let keyDisplay = '';
      
      if (binding.requiresPrefix) {
        keyDisplay = `Ctrl+B ${formatKey(binding)}`;
      } else {
        const mods = binding.modifiers || {};
        const parts = [];
        if (mods.ctrl) parts.push('Ctrl');
        if (mods.shift) parts.push('Shift');
        if (mods.alt) parts.push('Alt');
        if (mods.meta) parts.push('Meta');
        parts.push(formatKeyName(binding.key));
        keyDisplay = parts.join('+');
      }

      return {
        key: keyDisplay,
        description: binding.description,
      };
    });
  }, [bindings]);

  return {
    prefixMode,
    bindings,
    enterPrefixMode,
    exitPrefixMode,
    handleKeyEvent,
    getBindingsHelp,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a keyboard event matches a binding (for non-prefix bindings)
 */
function matchesBinding(event: KeyboardEvent, binding: KeyBindingConfig): boolean {
  const mods = binding.modifiers || {};
  
  if (event.key.toLowerCase() !== binding.key.toLowerCase()) {
    return false;
  }
  
  if (!!mods.ctrl !== event.ctrlKey) return false;
  if (!!mods.shift !== event.shiftKey) return false;
  if (!!mods.alt !== event.altKey) return false;
  if (!!mods.meta !== event.metaKey) return false;
  
  return true;
}

/**
 * Check if a keyboard event matches a binding in prefix mode
 * (ignores Ctrl modifier since prefix mode is already active)
 */
function matchesBindingInPrefixMode(event: KeyboardEvent, binding: KeyBindingConfig): boolean {
  const mods = binding.modifiers || {};
  
  // For special keys like arrows, match directly
  if (binding.key.startsWith('Arrow')) {
    return event.key === binding.key && !event.ctrlKey && !event.altKey && !event.metaKey;
  }
  
  // For character keys, compare case-insensitively
  if (event.key.toLowerCase() !== binding.key.toLowerCase()) {
    // Special case: handle shifted keys like % and "
    if (binding.key === '%' && event.key === '%') return true;
    if (binding.key === '"' && event.key === '"') return true;
    if (binding.key === '?' && event.key === '?') return true;
    if (binding.key === 'S' && event.key === 'S' && event.shiftKey) return true;
    return false;
  }
  
  // Check if shift requirement matches (for capital letters)
  if (mods.shift && !event.shiftKey) return false;
  
  // In prefix mode, don't require ctrl/alt/meta
  if (event.ctrlKey || event.altKey || event.metaKey) return false;
  
  return true;
}

/**
 * Format a key binding for display
 */
function formatKey(binding: KeyBindingConfig): string {
  const mods = binding.modifiers || {};
  const parts = [];
  
  if (mods.shift && !['%', '"', '?', 'S'].includes(binding.key)) {
    parts.push('Shift');
  }
  if (mods.alt) parts.push('Alt');
  
  parts.push(formatKeyName(binding.key));
  return parts.join('+');
}

/**
 * Format a key name for display
 */
function formatKeyName(key: string): string {
  const keyNames: Record<string, string> = {
    'ArrowLeft': '←',
    'ArrowRight': '→',
    'ArrowUp': '↑',
    'ArrowDown': '↓',
    ' ': 'Space',
    'Enter': '↵',
    'Escape': 'Esc',
  };
  
  return keyNames[key] ?? key;
}

// ============================================================================
// Utility Hook for Global Key Handler
// ============================================================================

/**
 * Hook that attaches keybindings to the window
 * Use this when you need global keyboard handling outside of xterm
 */
export function useGlobalKeyBindings(options: UseKeyBindingsOptions) {
  const bindingsHook = useKeyBindings(options);
  
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // Only intercept if not in an input element
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
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
