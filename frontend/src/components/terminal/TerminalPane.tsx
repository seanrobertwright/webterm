import { useRef, useCallback, useEffect, useState } from 'react';
import type { ITheme } from '@xterm/xterm';
import type { ConnectionState, ShellType } from '@webterm/shared/models';
import { Terminal, TerminalHandle } from './Terminal';
import { ConnectionStatus } from './ConnectionStatus';
import { useSettingsStore } from '../../stores/settings-store';
import { terminalThemes } from '../../config/terminal-themes';
import { useTheme } from '../../providers/ThemeProvider';

// Global map to store terminal write functions
declare global {
  var terminalRefs: Map<string, (data: string | Uint8Array) => void>;
  var terminalHandles: Map<string, TerminalHandle>;
}

if (typeof window !== 'undefined' && !globalThis.terminalRefs) {
  globalThis.terminalRefs = new Map();
}
if (typeof window !== 'undefined' && !globalThis.terminalHandles) {
  globalThis.terminalHandles = new Map();
}

export interface TerminalPaneProps {
  /** Unique pane ID */
  paneId: string;
  /** Current connection state */
  connectionState: ConnectionState;
  /** Exit code when PTY has exited */
  exitCode?: number | null;
  /** Whether broadcast mode is enabled for this pane */
  broadcastMode?: boolean;
  /** Whether this pane is focused */
  isFocused?: boolean;
  /** The shell that started in this pane */
  shell?: ShellType;
  /** Callback when user types data */
  onData?: (paneId: string, data: string) => void;
  /** Callback when terminal resizes */
  onResize?: (paneId: string, cols: number, rows: number) => void;
  /** Callback when pane is clicked/focused */
  onFocus?: (paneId: string) => void;
  /** Callback to restart the terminal */
  onRestart?: (paneId: string) => void;
  /** Callback when terminal title changes (e.g. CWD update) */
  onTitleChange?: (paneId: string, title: string) => void;
  /** Additional CSS classes */
  className?: string;
}

/** Terminal wrapper with status indicators and controls */
export function TerminalPane({
  paneId,
  connectionState,
  exitCode = null,
  broadcastMode = false,
  isFocused = false,
  shell,
  onData,
  onResize,
  onFocus,
  onRestart,
  onTitleChange,
  className = '',
}: TerminalPaneProps) {
  const terminalRef = useRef<TerminalHandle>(null);
  const { fontSize, fontFamily, themeName } = useSettingsStore();
  const { theme: uiTheme } = useTheme();

  // Build xterm.js theme from CSS custom properties so terminal colors follow
  // the active theGridcn theme. Uses useEffect to read computed styles AFTER
  // the DOM has updated the data-theme attribute (which happens in ThemeProvider's
  // useEffect). Falls back to the settings-store terminal theme.
  const [terminalTheme, setTerminalTheme] = useState<ITheme>(
    () => (terminalThemes[themeName] ?? terminalThemes['default']) as ITheme
  );

  useEffect(() => {
    // requestAnimationFrame ensures the data-theme attribute has been applied
    // and computed styles are current before we read them.
    requestAnimationFrame(() => {
      const base = (terminalThemes[themeName] ?? terminalThemes['default']) as ITheme;
      const style = getComputedStyle(document.documentElement);
      const css = (v: string): string | null => {
        const val = style.getPropertyValue(v).trim();
        return val || null;
      };
      setTerminalTheme({
        ...base,
        ...(css('--terminal-bg') ? { background: css('--terminal-bg')! } : {}),
        ...(css('--terminal-fg') ? { foreground: css('--terminal-fg')! } : {}),
        ...(css('--terminal-cursor') ? { cursor: css('--terminal-cursor')! } : {}),
        ...(css('--terminal-selection') ? { selectionBackground: css('--terminal-selection')! } : {}),
      });
    });
  }, [themeName, uiTheme]);

  // Register terminal write function and handle globally for output and clipboard
  useEffect(() => {
    const writeFn = (data: string | Uint8Array) => {
      terminalRef.current?.write(data);
    };
    globalThis.terminalRefs.set(paneId, writeFn);

    // Expose handle for clipboard access (getSelection, hasSelection)
    const updateHandle = () => {
      if (terminalRef.current) {
        globalThis.terminalHandles.set(paneId, terminalRef.current);
      }
    };
    // Delay slightly to ensure ref is set after render
    const timer = setTimeout(updateHandle, 100);

    return () => {
      clearTimeout(timer);
      globalThis.terminalRefs.delete(paneId);
      globalThis.terminalHandles.delete(paneId);
    };
  }, [paneId]);

  const handleData = useCallback(
    (data: string) => {
      onData?.(paneId, data);
    },
    [paneId, onData]
  );

  const handleResize = useCallback(
    (cols: number, rows: number) => {
      onResize?.(paneId, cols, rows);
    },
    [paneId, onResize]
  );

  const handleClick = useCallback(() => {
    onFocus?.(paneId);
    terminalRef.current?.focus();
  }, [paneId, onFocus]);

  const handleRestart = useCallback(() => {
    onRestart?.(paneId);
  }, [paneId, onRestart]);

  const handleTitleChange = useCallback(
    (title: string) => {
      onTitleChange?.(paneId, title);
    },
    [paneId, onTitleChange]
  );

  const hasExited = connectionState === 'exited';
  const isDisconnected = connectionState === 'disconnected';

  return (
    <div
      className={`relative w-full h-full flex flex-col ${className}`}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Terminal pane ${paneId}`}
    >
      {/* Terminal component */}
      <div className="flex-1 min-h-0">
        <Terminal
          ref={terminalRef}
          onData={handleData}
          onResize={handleResize}
          onTitleChange={handleTitleChange}
          isFocused={isFocused}
          fontSize={fontSize}
          fontFamily={fontFamily}
          theme={terminalTheme}
        />
      </div>

      {/* Connection status indicator — only show when not connected (header shows it globally) */}
      {connectionState !== 'connected' && (
        <ConnectionStatus state={connectionState} />
      )}

      {/* Broadcast mode indicator */}
      {broadcastMode && (
        <div className="absolute top-4 left-4 px-2 py-1 rounded text-xs font-semibold bg-purple-900/80 text-purple-300 border border-purple-500">
          BROADCAST
        </div>
      )}

      {/* Exit overlay */}
      {hasExited && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-4 z-10">
          <div className="text-lg font-semibold text-red-400">
            Process exited with code: {exitCode ?? 'unknown'}
          </div>
          {shell && (
            <div className="text-sm text-gray-400">Shell: {shell}</div>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleRestart();
            }}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded font-medium transition-colors"
            type="button"
          >
            Restart Terminal
          </button>
        </div>
      )}

      {/* Disconnection overlay */}
      {isDisconnected && !hasExited && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
          <div className="text-yellow-400 animate-pulse">
            Reconnecting...
          </div>
        </div>
      )}

      {/* Focus indicator border */}
      {isFocused && (
        <div className="absolute inset-0 pointer-events-none border-2 border-primary rounded" />
      )}
    </div>
  );
}

export default TerminalPane;
