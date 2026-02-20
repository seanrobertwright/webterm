/**
 * React hook for xterm.js terminal lifecycle management
 * Handles terminal creation, addons, resize, and cleanup
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { SerializeAddon } from '@xterm/addon-serialize';
import type { TerminalDimensions } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface UseTerminalOptions {
  /** Terminal configuration options */
  terminalOptions?: Partial<import('@xterm/xterm').ITerminalOptions>;
  /** Callback when terminal sends data (keyboard input) */
  onData?: (data: string) => void;
  /** Callback when terminal is resized */
  onResize?: (dimensions: TerminalDimensions) => void;
  /** Callback when terminal is ready */
  onReady?: (terminal: Terminal) => void;
  /** Scrollback buffer size */
  scrollback?: number;
  /** Debounce delay for resize in ms */
  resizeDebounceMs?: number;
  /** Enable WebGL rendering (falls back to canvas if unavailable) */
  enableWebGL?: boolean;
  /** Enable clickable links */
  enableLinks?: boolean;
  /** Enable search functionality */
  enableSearch?: boolean;
  /** Enable serialization for state persistence */
  enableSerialize?: boolean;
}

export interface UseTerminalReturn {
  /** Terminal instance (null until mounted) */
  terminal: Terminal | null;
  /** FitAddon instance for resizing */
  fitAddon: FitAddon | null;
  /** SearchAddon instance for find functionality */
  searchAddon: SearchAddon | null;
  /** SerializeAddon instance for state persistence */
  serializeAddon: SerializeAddon | null;
  /** Ref to attach to container element */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Manually trigger fit to container */
  fit: () => void;
  /** Write data to terminal */
  write: (data: string | Uint8Array) => void;
  /** Clear terminal buffer */
  clear: () => void;
  /** Focus the terminal */
  focus: () => void;
  /** Blur the terminal */
  blur: () => void;
  /** Get current terminal dimensions */
  getDimensions: () => TerminalDimensions | null;
  /** Serialize terminal content */
  serialize: () => string | null;
  /** Search for text in terminal */
  findNext: (term: string) => boolean;
  /** Search backwards for text */
  findPrevious: (term: string) => boolean;
  /** Clear search highlighting */
  clearSearch: () => void;
}

// ============================================================================
// Default Options
// ============================================================================

const DEFAULT_TERMINAL_OPTIONS: Partial<import('@xterm/xterm').ITerminalOptions> = {
  cursorBlink: true,
  cursorStyle: 'block',
  fontSize: 14,
  fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
  theme: {
    background: '#0a0a0a',
    foreground: '#e0e0e0',
    cursor: '#00ff00',
    cursorAccent: '#0a0a0a',
    selectionBackground: '#3a3a5a',
    black: '#000000',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#6272a4',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
    brightBlack: '#6272a4',
    brightRed: '#ff6e6e',
    brightGreen: '#69ff94',
    brightYellow: '#ffffa5',
    brightBlue: '#d6acff',
    brightMagenta: '#ff92df',
    brightCyan: '#a4ffff',
    brightWhite: '#ffffff',
  },
  allowProposedApi: true,
  scrollback: 10000,
  tabStopWidth: 4,
};

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing xterm.js terminal instance
 * 
 * @example
 * ```tsx
 * function TerminalPane() {
 *   const { containerRef, write, fit, terminal } = useTerminal({
 *     onData: (data) => sendToBackend(data),
 *     onResize: ({ cols, rows }) => sendResize(cols, rows),
 *   });
 *   
 *   return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
 * }
 * ```
 */
export function useTerminal(options: UseTerminalOptions = {}): UseTerminalReturn {
  const {
    terminalOptions,
    onData,
    onResize,
    onReady,
    scrollback = 10000,
    resizeDebounceMs = 100,
    enableWebGL = true,
    enableLinks = true,
    enableSearch = true,
    enableSerialize = true,
  } = options;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const serializeAddonRef = useRef<SerializeAddon | null>(null);
  const webglAddonRef = useRef<WebglAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Track mounted state
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [fitAddon, setFitAddon] = useState<FitAddon | null>(null);
  const [searchAddon, setSearchAddon] = useState<SearchAddon | null>(null);
  const [serializeAddon, setSerializeAddon] = useState<SerializeAddon | null>(null);

  // Refs for callbacks to avoid effect dependencies
  const onDataRef = useRef(onData);
  const onResizeRef = useRef(onResize);
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    onDataRef.current = onData;
    onResizeRef.current = onResize;
    onReadyRef.current = onReady;
  }, [onData, onResize, onReady]);

  // ============================================================================
  // Terminal Initialization
  // ============================================================================

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Create terminal instance
    const term = new Terminal({
      ...DEFAULT_TERMINAL_OPTIONS,
      scrollback,
      ...terminalOptions,
    });
    terminalRef.current = term;

    // Create and load FitAddon
    const fit = new FitAddon();
    fitAddonRef.current = fit;
    term.loadAddon(fit);

    // Create and load optional addons
    if (enableSearch) {
      const search = new SearchAddon();
      searchAddonRef.current = search;
      term.loadAddon(search);
      setSearchAddon(search);
    }

    if (enableSerialize) {
      const serialize = new SerializeAddon();
      serializeAddonRef.current = serialize;
      term.loadAddon(serialize);
      setSerializeAddon(serialize);
    }

    if (enableLinks) {
      const links = new WebLinksAddon();
      term.loadAddon(links);
    }

    // Open terminal in container
    term.open(container);

    // Try to load WebGL addon
    if (enableWebGL) {
      try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => {
          console.warn('[useTerminal] WebGL context lost, disposing addon');
          webgl.dispose();
        });
        term.loadAddon(webgl);
        webglAddonRef.current = webgl;
      } catch (error) {
        console.warn('[useTerminal] WebGL addon failed, using canvas renderer:', error);
      }
    }

    // Initial fit
    requestAnimationFrame(() => {
      try {
        if (term.cols > 0 && term.rows > 0) {
          fit.fit();
        }
      } catch (e) {
        console.error('[useTerminal] Initial fit error:', e);
      }
    });

    // Setup data handler
    const dataDisposable = term.onData((data) => {
      onDataRef.current?.(data);
    });

    // Setup resize observer with debouncing
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      
      resizeTimeoutRef.current = setTimeout(() => {
        if (fitAddonRef.current && terminalRef.current) {
          try {
            // Check if terminal has valid dimensions before fitting
            if (terminalRef.current.cols > 0 && terminalRef.current.rows > 0) {
              fitAddonRef.current.fit();

              const dimensions = getDimensionsInternal();
              if (dimensions) {
                onResizeRef.current?.(dimensions);
              }
            }
          } catch (e) {
            console.error('[useTerminal] Fit error:', e);
          }
        }
      }, resizeDebounceMs);
    });
    
    resizeObserver.observe(container);
    resizeObserverRef.current = resizeObserver;

    // Update state
    setTerminal(term);
    setFitAddon(fit);

    // Call ready callback
    onReadyRef.current?.(term);

    // Cleanup
    return () => {
      dataDisposable.dispose();
      
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      
      resizeObserver.disconnect();
      resizeObserverRef.current = null;
      
      webglAddonRef.current?.dispose();
      webglAddonRef.current = null;
      
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
      serializeAddonRef.current = null;
      
      setTerminal(null);
      setFitAddon(null);
      setSearchAddon(null);
      setSerializeAddon(null);
    };
  }, [
    scrollback, 
    resizeDebounceMs, 
    enableWebGL, 
    enableLinks, 
    enableSearch, 
    enableSerialize,
    terminalOptions,
  ]);

  // ============================================================================
  // Methods
  // ============================================================================

  const getDimensionsInternal = useCallback((): TerminalDimensions | null => {
    const term = terminalRef.current;
    const container = containerRef.current;
    if (!term || !container) return null;

    return {
      cols: term.cols,
      rows: term.rows,
      width: container.clientWidth,
      height: container.clientHeight,
    };
  }, []);

  const fit = useCallback(() => {
    fitAddonRef.current?.fit();
  }, []);

  const write = useCallback((data: string | Uint8Array) => {
    terminalRef.current?.write(data);
  }, []);

  const clear = useCallback(() => {
    terminalRef.current?.clear();
  }, []);

  const focus = useCallback(() => {
    terminalRef.current?.focus();
  }, []);

  const blur = useCallback(() => {
    terminalRef.current?.blur();
  }, []);

  const serialize = useCallback((): string | null => {
    return serializeAddonRef.current?.serialize() ?? null;
  }, []);

  const findNext = useCallback((term: string): boolean => {
    return searchAddonRef.current?.findNext(term) ?? false;
  }, []);

  const findPrevious = useCallback((term: string): boolean => {
    return searchAddonRef.current?.findPrevious(term) ?? false;
  }, []);

  const clearSearch = useCallback(() => {
    searchAddonRef.current?.clearDecorations();
  }, []);

  return {
    terminal,
    fitAddon,
    searchAddon,
    serializeAddon,
    containerRef,
    fit,
    write,
    clear,
    focus,
    blur,
    getDimensions: getDimensionsInternal,
    serialize,
    findNext,
    findPrevious,
    clearSearch,
  };
}

// ============================================================================
// Utility Hook for Multiple Terminals
// ============================================================================

/**
 * Hook for managing a map of terminal instances by pane ID
 */
export function useTerminalMap() {
  const terminalsRef = useRef<Map<string, Terminal>>(new Map());
  
  const register = useCallback((paneId: string, terminal: Terminal) => {
    terminalsRef.current.set(paneId, terminal);
  }, []);

  const unregister = useCallback((paneId: string) => {
    terminalsRef.current.delete(paneId);
  }, []);

  const get = useCallback((paneId: string): Terminal | undefined => {
    return terminalsRef.current.get(paneId);
  }, []);

  const writeToPane = useCallback((paneId: string, data: string | Uint8Array) => {
    terminalsRef.current.get(paneId)?.write(data);
  }, []);

  const focusPane = useCallback((paneId: string) => {
    terminalsRef.current.get(paneId)?.focus();
  }, []);

  return {
    register,
    unregister,
    get,
    writeToPane,
    focusPane,
    terminals: terminalsRef.current,
  };
}
