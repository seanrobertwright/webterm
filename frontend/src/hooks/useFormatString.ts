/**
 * Hook for resolving tmux-style format strings against store state.
 * Supports #{variable} substitution, time format codes (%H, %M, etc.),
 * and conditional expressions #{?var,true_val,false_val}.
 */

import { useEffect, useMemo, useState } from 'react';
import { useSessionStore } from '../stores/session-store';
import { usePaneStore } from '../stores/pane-store';
import type { WindowWithPanes } from '@webterm/shared/index';

// ============================================================================
// Time Formatting
// ============================================================================

/** Short month names matching tmux's %b format */
const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** Pad a number to two digits */
function pad2(n: number): string {
  return n < 10 ? `0${String(n)}` : String(n);
}

/** Replace strftime-style time codes in a string */
function resolveTimeCodes(format: string, now: Date): string {
  return format
    .replace(/%H/g, pad2(now.getHours()))
    .replace(/%M/g, pad2(now.getMinutes()))
    .replace(/%S/g, pad2(now.getSeconds()))
    .replace(/%Y/g, String(now.getFullYear()))
    .replace(/%m/g, pad2(now.getMonth() + 1))
    .replace(/%d/g, pad2(now.getDate()))
    .replace(/%b/g, MONTH_SHORT[now.getMonth()] ?? '');
}

// ============================================================================
// Format Variable Resolution
// ============================================================================

interface FormatVars {
  session_name: string;
  window_index: string;
  window_name: string;
  window_active: string;
  window_flags: string;
  window_panes: string;
  window_zoomed_flag: string;
  pane_current_command: string;
  pane_current_path: string;
  pane_active: string;
  pane_index: string;
  pane_synchronized: string;
  host: string;
  host_short: string;
  pane_width: string;
  pane_height: string;
  session_windows: string;
  client_width: string;
  client_height: string;
}

/**
 * Build a lookup table of format variable values from the current store state.
 * This is called from inside the hook where store selectors are available.
 */
function buildFormatVars(opts: {
  sessionName: string;
  windowIndex: number;
  windowName: string;
  windowActive: boolean;
  windowFlags: string;
  windowPaneCount: number;
  windowZoomed: boolean;
  paneCommand: string;
  paneCwd: string;
  paneActive: boolean;
  paneIndex: number;
  paneSynchronized: boolean;
  paneCols: number;
  paneRows: number;
  windowCount: number;
  clientWidth: number;
  clientHeight: number;
}): FormatVars {
  return {
    session_name: opts.sessionName,
    window_index: String(opts.windowIndex),
    window_name: opts.windowName,
    window_active: opts.windowActive ? '1' : '0',
    window_flags: opts.windowFlags,
    window_panes: String(opts.windowPaneCount),
    window_zoomed_flag: opts.windowZoomed ? '1' : '0',
    pane_current_command: opts.paneCommand,
    pane_current_path: opts.paneCwd,
    pane_active: opts.paneActive ? '1' : '0',
    pane_index: String(opts.paneIndex),
    pane_synchronized: opts.paneSynchronized ? '1' : '0',
    host: 'webterm',
    host_short: 'webterm',
    pane_width: String(opts.paneCols),
    pane_height: String(opts.paneRows),
    session_windows: String(opts.windowCount),
    client_width: String(opts.clientWidth),
    client_height: String(opts.clientHeight),
  };
}

/**
 * Resolve conditional expressions: `#{?var,true_val,false_val}`
 *
 * A variable is considered "truthy" when its resolved value is a non-empty
 * string that is not "0".
 */
function resolveConditionals(format: string, vars: FormatVars): string {
  // Pattern: #{?variable_name,value_if_true,value_if_false}
  return format.replace(
    /#\{\?(\w+),([^,}]*),([^}]*)}/g,
    (_match, varName: string, trueVal: string, falseVal: string) => {
      const key = varName as keyof FormatVars;
      const value = vars[key];
      const isTruthy = value !== undefined && value !== '' && value !== '0';
      return isTruthy ? trueVal : falseVal;
    },
  );
}

/** Replace simple `#{variable}` references with their values. */
function resolveVariables(format: string, vars: FormatVars): string {
  return format.replace(/#\{(\w+)}/g, (_match, varName: string) => {
    const key = varName as keyof FormatVars;
    return vars[key] ?? '';
  });
}

// ============================================================================
// Window Flags
// ============================================================================

/**
 * Build a tmux-style flags string for a window.
 *
 * Flags (appended in tmux order):
 *   *  current (active) window
 *   -  last active window
 *   #  activity flag
 *   !  bell flag
 *   ~  silence flag
 *   Z  zoomed pane in this window
 */
function buildWindowFlags(
  win: WindowWithPanes,
  isActive: boolean,
  isLast: boolean,
  hasZoom: boolean,
): string {
  let flags = '';
  if (isActive) flags += '*';
  if (isLast) flags += '-';
  if (win.activityFlag) flags += '#';
  if (win.bellFlag) flags += '!';
  if (win.silenceFlag) flags += '~';
  if (hasZoom) flags += 'Z';
  return flags;
}

/**
 * Approximate character width/height from pixel dimensions.
 * Uses typical monospace character metrics (8px wide, 16px tall).
 */
const CHAR_WIDTH_PX = 8;
const CHAR_HEIGHT_PX = 16;

// ============================================================================
// Hook
// ============================================================================

/**
 * Resolve a tmux-style format string using live store state and a clock.
 *
 * Supported syntax:
 * - `#{variable}` — simple variable substitution
 * - `#{?variable,if_true,if_false}` — conditional
 * - `%H`, `%M`, `%S`, `%Y`, `%m`, `%d`, `%b` — time codes
 *
 * The clock ticks every `intervalMs` milliseconds (default 15 000 — the tmux
 * `status-interval` default).
 */
export function useFormatString(format: string, intervalMs: number = 15_000): string {
  // ---------------------------------------------------------------------------
  // Store state
  // ---------------------------------------------------------------------------
  const currentSession = useSessionStore((s) => s.currentSession);
  const windows = useSessionStore((s) => s.windows);
  const activeWindowId = useSessionStore((s) => s.activeWindowId);
  const activePane = usePaneStore((s) => s.activePane);
  const panes = usePaneStore((s) => s.panes);
  const zoomedPane = usePaneStore((s) => s.zoomedPane);
  const broadcastEnabled = usePaneStore((s) => s.broadcastEnabled);
  const paneWindowId = usePaneStore((s) => s.windowId);

  // Derived values
  const activeWindow = windows.find((w) => w.id === activeWindowId);
  const activePaneData = activePane ? panes.get(activePane) : undefined;

  /** Whether the zoomed pane belongs to the active window. */
  const activeWindowHasZoom = zoomedPane !== null && paneWindowId === activeWindowId;

  /** Compute the pane index (position among sibling panes in the window). */
  const paneIndex = useMemo(() => {
    if (!activePane) return 0;
    const paneIds = Array.from(panes.keys());
    const idx = paneIds.indexOf(activePane);
    return idx >= 0 ? idx : 0;
  }, [activePane, panes]);

  // ---------------------------------------------------------------------------
  // Clock
  // ---------------------------------------------------------------------------
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Only set up the interval if the format contains time codes
    const hasTimeCodes = /%[HMSYmdb]/.test(format);
    if (!hasTimeCodes) return;

    // eslint-disable-next-line no-undef -- browser global; ESLint config lacks browser env
    const id = setInterval((): void => {
      setNow(new Date());
    }, intervalMs);

    return (): void => {
      // eslint-disable-next-line no-undef -- browser global; ESLint config lacks browser env
      clearInterval(id);
    };
  }, [format, intervalMs]);

  // ---------------------------------------------------------------------------
  // Resolution
  // ---------------------------------------------------------------------------
  const windowFlagsStr = activeWindow
    ? buildWindowFlags(
        activeWindow,
        true, // the active window is always "current" in the current view
        false,
        activeWindowHasZoom,
      )
    : '';

  const vars = buildFormatVars({
    sessionName: currentSession?.name ?? '',
    windowIndex: activeWindow?.index ?? 0,
    windowName: activeWindow?.name ?? '',
    windowActive: true, // The "active" window is always active in the current view
    windowFlags: windowFlagsStr,
    windowPaneCount: panes.size,
    windowZoomed: activeWindowHasZoom,
    paneCommand: activePaneData?.currentCommand ?? '',
    paneCwd: activePaneData?.cwd ?? '',
    paneActive: activePane !== null,
    paneIndex,
    paneSynchronized: broadcastEnabled,
    paneCols: activePaneData?.cols ?? 80,
    paneRows: activePaneData?.rows ?? 24,
    windowCount: windows.length,
    clientWidth: Math.floor(window.innerWidth / CHAR_WIDTH_PX),
    clientHeight: Math.floor(window.innerHeight / CHAR_HEIGHT_PX),
  });

  let result = format;
  result = resolveConditionals(result, vars);
  result = resolveVariables(result, vars);
  result = resolveTimeCodes(result, now);

  return result;
}
