/**
 * Hook for resolving tmux-style format strings against store state.
 * Supports #{variable} substitution, time format codes (%H, %M, etc.),
 * and conditional expressions #{?var,true_val,false_val}.
 */

import { useEffect, useState } from 'react';
import { useSessionStore } from '../stores/session-store';
import { usePaneStore } from '../stores/pane-store';

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
  pane_current_command: string;
  host: string;
  host_short: string;
  pane_width: string;
  pane_height: string;
  session_windows: string;
}

/**
 * Build a lookup table of format variable values from the current store state.
 * This is called from inside the hook where store selectors are available.
 */
function buildFormatVars(
  sessionName: string,
  windowIndex: number,
  windowName: string,
  windowActive: boolean,
  paneCommand: string,
  paneCols: number,
  paneRows: number,
  windowCount: number,
): FormatVars {
  return {
    session_name: sessionName,
    window_index: String(windowIndex),
    window_name: windowName,
    window_active: windowActive ? '1' : '0',
    pane_current_command: paneCommand,
    host: 'webterm',
    host_short: 'webterm',
    pane_width: String(paneCols),
    pane_height: String(paneRows),
    session_windows: String(windowCount),
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

  // Derived values
  const activeWindow = windows.find((w) => w.id === activeWindowId);
  const activePaneData = activePane ? panes.get(activePane) : undefined;

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
  const vars = buildFormatVars(
    currentSession?.name ?? '',
    activeWindow?.index ?? 0,
    activeWindow?.name ?? '',
    true, // The "active" window is always active in the current view
    activePaneData?.currentCommand ?? '',
    activePaneData?.cols ?? 80,
    activePaneData?.rows ?? 24,
    windows.length,
  );

  let result = format;
  result = resolveConditionals(result, vars);
  result = resolveVariables(result, vars);
  result = resolveTimeCodes(result, now);

  return result;
}
