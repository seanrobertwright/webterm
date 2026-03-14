/**
 * tmux target specifier parser
 *
 * Parses tmux-style target strings in the format `session:window.pane`.
 * Supports named targets, numeric indices, relative specifiers (+/-),
 * and special tokens ({last}, {next}, {previous}, {top}, {bottom},
 * {left}, {right}, {marked}).
 */

export interface TmuxTarget {
  session: string | null;
  window: string | null;
  pane: string | null;
}

const SPECIAL_TOKENS = new Set([
  '{last}',
  '{next}',
  '{previous}',
  '{top}',
  '{bottom}',
  '{left}',
  '{right}',
  '{marked}',
]);

/**
 * Parse a tmux target specifier string into its component parts.
 *
 * Supported formats:
 *   `mysession`        - session only
 *   `mysession:1`      - session:window (by index)
 *   `mysession:mywin`  - session:window (by name)
 *   `:1`               - window in current session
 *   `:mywin`           - window by name in current session
 *   `.0`               - pane in current session/window
 *   `mysession:1.0`    - full session:window.pane
 *   `:1.0`             - window.pane in current session
 *   `:.+`              - next pane (relative)
 *   `:.-`              - previous pane (relative)
 *   `{last}`           - special token targets
 *
 * @returns Parsed target, or null for empty/invalid input.
 */
export function parseTarget(raw: string): TmuxTarget | null {
  if (raw === '' || raw == null) {
    return null;
  }

  const trimmed = raw.trim();
  if (trimmed === '') {
    return null;
  }

  // Handle special tokens — they map to the pane field
  if (SPECIAL_TOKENS.has(trimmed)) {
    return {
      session: null,
      window: null,
      pane: trimmed,
    };
  }

  // Pane-only format: starts with `.` and has no `:`
  // e.g. `.0`, `.+`, `.-`
  if (trimmed.startsWith('.') && !trimmed.includes(':')) {
    const paneSpec = trimmed.slice(1);
    if (paneSpec === '') {
      return null;
    }
    return {
      session: null,
      window: null,
      pane: paneSpec,
    };
  }

  // Split on `:` to separate session from window.pane
  const colonIndex = trimmed.indexOf(':');

  if (colonIndex === -1) {
    // No colon — session name only
    return {
      session: trimmed,
      window: null,
      pane: null,
    };
  }

  // Has colon — left side is session, right side is window.pane
  const sessionPart = trimmed.slice(0, colonIndex);
  const windowPanePart = trimmed.slice(colonIndex + 1);

  const session = sessionPart === '' ? null : sessionPart;

  // Parse window.pane portion
  if (windowPanePart === '') {
    // Trailing colon only, e.g. `mysession:`
    return {
      session,
      window: null,
      pane: null,
    };
  }

  // Look for `.` that separates window from pane
  // The dot must be present to indicate a pane specifier.
  // We find the last `.` to handle window names that might contain dots,
  // but tmux actually uses the first dot after the colon.
  const dotIndex = windowPanePart.indexOf('.');

  if (dotIndex === -1) {
    // No dot — window specifier only
    return {
      session,
      window: windowPanePart,
      pane: null,
    };
  }

  // Has dot — split into window and pane
  const windowSpec = windowPanePart.slice(0, dotIndex);
  const paneSpec = windowPanePart.slice(dotIndex + 1);

  return {
    session,
    window: windowSpec === '' ? null : windowSpec,
    pane: paneSpec === '' ? null : paneSpec,
  };
}
