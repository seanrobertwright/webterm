/**
 * tmux option definitions catalog
 *
 * Defines all supported tmux-compatible options with their types, defaults,
 * scopes, and validation rules. Options follow the tmux hierarchical scoping
 * model: server -> global-session -> session, global-window -> window -> pane.
 */

import type { OptionScope, OptionType } from '../types/models.ts';

// ============================================================================
// Types
// ============================================================================

export interface OptionDefinition {
  name: string;
  type: OptionType;
  defaultValue: string;
  scope: OptionScope;
  description: string;
  choices?: string[];
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ============================================================================
// Color and Style Validation Helpers
// ============================================================================

const VALID_COLOR_NAMES = new Set([
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'default',
  'bright-black',
  'bright-red',
  'bright-green',
  'bright-yellow',
  'bright-blue',
  'bright-magenta',
  'bright-cyan',
  'bright-white',
  'colour0',
  'colour1',
  'colour2',
  'colour3',
  'colour4',
  'colour5',
  'colour6',
  'colour7',
  'colour8',
  'colour9',
]);

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const COLOUR_NUMBER_RE = /^colour[0-9]{1,3}$/;

function isValidColor(value: string): boolean {
  if (VALID_COLOR_NAMES.has(value)) return true;
  if (HEX_COLOR_RE.test(value)) return true;
  if (COLOUR_NUMBER_RE.test(value)) {
    const num = parseInt(value.slice(6), 10);
    return num >= 0 && num <= 255;
  }
  return false;
}

const VALID_STYLE_KEYS = new Set(['bg', 'fg']);
const VALID_STYLE_ATTRS = new Set([
  'default',
  'bold',
  'dim',
  'underscore',
  'blink',
  'reverse',
  'hidden',
  'italics',
  'strikethrough',
  'none',
]);

function isValidStyle(value: string): boolean {
  if (value === 'default' || value === 'none') return true;

  const parts = value.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed === '') return false;

    if (trimmed.includes('=')) {
      const eqIndex = trimmed.indexOf('=');
      const key = trimmed.slice(0, eqIndex);
      const val = trimmed.slice(eqIndex + 1);
      if (!VALID_STYLE_KEYS.has(key)) return false;
      if (!isValidColor(val)) return false;
    } else if (!VALID_STYLE_ATTRS.has(trimmed)) {
      return false;
    }
  }

  return true;
}

// ============================================================================
// Option Definitions
// ============================================================================

function def(
  name: string,
  type: OptionType,
  defaultValue: string,
  scope: OptionScope,
  description: string,
  choices?: string[],
): OptionDefinition {
  const result: OptionDefinition = { name, type, defaultValue, scope, description };
  if (choices !== undefined) {
    result.choices = choices;
  }
  return result;
}

// -- Server Options ----------------------------------------------------------

const serverOptions: OptionDefinition[] = [
  def('buffer-limit', 'number', '50', 'server', 'Maximum paste buffers'),
  def('default-shell', 'string', 'default', 'server', 'Default shell for new panes'),
  def('default-terminal', 'string', 'xterm-256color', 'server', 'Default TERM value'),
];

// -- Global Session Options --------------------------------------------------

const globalSessionOptions: OptionDefinition[] = [
  def('base-index', 'number', '0', 'global-session', 'Base index for window numbering'),
  def('prefix', 'string', 'C-b', 'global-session', 'Prefix key'),
  def('prefix2', 'string', '', 'global-session', 'Secondary prefix key'),
  def('status', 'choice', 'on', 'global-session', 'Show status bar', ['on', 'off']),
  def('status-interval', 'number', '15', 'global-session', 'Status bar refresh interval (seconds)'),
  def('status-left', 'string', '[#{session_name}] ', 'global-session', 'Status bar left content'),
  def(
    'status-right',
    'string',
    '"%H:%M %d-%b-%y"',
    'global-session',
    'Status bar right content',
  ),
  def(
    'status-left-length',
    'number',
    '10',
    'global-session',
    'Max length of left status',
  ),
  def(
    'status-right-length',
    'number',
    '40',
    'global-session',
    'Max length of right status',
  ),
  def(
    'status-position',
    'choice',
    'bottom',
    'global-session',
    'Status bar position',
    ['top', 'bottom'],
  ),
  def(
    'status-style',
    'style',
    'bg=green,fg=black',
    'global-session',
    'Status bar style',
  ),
  def('display-time', 'number', '750', 'global-session', 'Message display duration (ms)'),
  def(
    'display-panes-time',
    'number',
    '1000',
    'global-session',
    'Display-panes duration (ms)',
  ),
  def(
    'display-panes-active-colour',
    'color',
    'red',
    'global-session',
    'Active pane number color',
  ),
  def(
    'display-panes-colour',
    'color',
    'blue',
    'global-session',
    'Inactive pane number color',
  ),
  def('mouse', 'boolean', 'off', 'global-session', 'Enable mouse support'),
  def('mode-keys', 'choice', 'vi', 'global-session', 'Copy mode key style', ['vi', 'emacs']),
  def('history-limit', 'number', '2000', 'global-session', 'Scrollback history limit'),
  def('escape-time', 'number', '500', 'global-session', 'Escape key delay (ms)'),
  def('repeat-time', 'number', '500', 'global-session', 'Repeat time for keybindings (ms)'),
];

// -- Global Window Options ---------------------------------------------------

const globalWindowOptions: OptionDefinition[] = [
  def('automatic-rename', 'boolean', 'on', 'global-window', 'Auto-rename windows'),
  def(
    'automatic-rename-format',
    'string',
    '#{pane_current_command}',
    'global-window',
    'Auto-rename format',
  ),
  def('monitor-activity', 'boolean', 'off', 'global-window', 'Monitor window for activity'),
  def('monitor-bell', 'boolean', 'on', 'global-window', 'Monitor window for bell'),
  def(
    'monitor-silence',
    'number',
    '0',
    'global-window',
    'Silence monitoring interval (0=off)',
  ),
  def('pane-border-style', 'style', 'default', 'global-window', 'Pane border style'),
  def(
    'pane-active-border-style',
    'style',
    'fg=green',
    'global-window',
    'Active pane border style',
  ),
  def(
    'pane-border-status',
    'choice',
    'off',
    'global-window',
    'Pane border status line',
    ['off', 'top', 'bottom'],
  ),
  def(
    'pane-border-format',
    'string',
    '#{pane_index} #{pane_current_command}',
    'global-window',
    'Pane border format',
  ),
  def(
    'window-status-current-format',
    'string',
    '#I:#W#F',
    'global-window',
    'Current window format',
  ),
  def('window-status-format', 'string', '#I:#W#F', 'global-window', 'Window format'),
  def('window-status-separator', 'string', ' ', 'global-window', 'Window status separator'),
  def(
    'window-status-current-style',
    'style',
    'default',
    'global-window',
    'Current window style',
  ),
  def('window-status-style', 'style', 'default', 'global-window', 'Window style'),
  def(
    'window-status-activity-style',
    'style',
    'reverse',
    'global-window',
    'Activity window style',
  ),
  def(
    'window-status-bell-style',
    'style',
    'reverse',
    'global-window',
    'Bell window style',
  ),
  def('clock-mode-colour', 'color', 'blue', 'global-window', 'Clock color'),
  def('clock-mode-style', 'choice', '24', 'global-window', 'Clock style', ['12', '24']),
  def('mode-style', 'style', 'bg=yellow,fg=black', 'global-window', 'Copy mode highlight style'),
  def('main-pane-height', 'number', '50', 'global-window', 'Main pane height percent'),
  def('main-pane-width', 'number', '50', 'global-window', 'Main pane width percent'),
];

// -- Pane Options ------------------------------------------------------------

const paneOptions: OptionDefinition[] = [
  def('synchronize-panes', 'boolean', 'off', 'pane', 'Synchronize pane input'),
];

// ============================================================================
// Build the Definitions Map
// ============================================================================

/**
 * Session-scoped options mirror global-session options but with 'session' scope.
 * Window-scoped options mirror global-window options but with 'window' scope.
 */
function deriveScoped(
  source: OptionDefinition[],
  targetScope: OptionScope,
): OptionDefinition[] {
  return source.map((opt) => ({ ...opt, scope: targetScope }));
}

const sessionOptions = deriveScoped(globalSessionOptions, 'session');
const windowOptions = deriveScoped(globalWindowOptions, 'window');

const allDefinitions: OptionDefinition[] = [
  ...serverOptions,
  ...globalSessionOptions,
  ...globalWindowOptions,
  ...sessionOptions,
  ...windowOptions,
  ...paneOptions,
];

const definitionsMap = new Map<string, OptionDefinition>();

for (const option of allDefinitions) {
  // Use scope-qualified key to avoid collisions between global and per-entity options
  // that share the same name. For lookups by bare name, we prefer the global scope.
  const qualifiedKey = `${option.scope}:${option.name}`;
  definitionsMap.set(qualifiedKey, option);

  // Also set by bare name if not already present (global scopes take priority)
  if (!definitionsMap.has(option.name)) {
    definitionsMap.set(option.name, option);
  }
}

/**
 * All option definitions indexed by name. For options that exist at multiple
 * scopes (e.g. global-session and session), the bare name maps to the global
 * scope version. Use `scope:name` keys for scope-specific lookups.
 */
export const optionDefinitions: ReadonlyMap<string, OptionDefinition> = definitionsMap;

// ============================================================================
// Public API
// ============================================================================

/**
 * Look up an option definition by name. Supports both bare names (returns the
 * global-scope version) and qualified `scope:name` keys.
 */
export function getOptionDefinition(name: string): OptionDefinition | undefined {
  return definitionsMap.get(name);
}

/**
 * Return all option definitions for a given scope.
 */
export function getOptionsByScope(scope: OptionScope): OptionDefinition[] {
  return allDefinitions.filter((opt) => opt.scope === scope);
}

/**
 * Validate a value against the type rules of a named option.
 *
 * Returns `{ valid: true }` when the value is acceptable, or
 * `{ valid: false, error: '...' }` with a human-readable explanation.
 */
export function validateOptionValue(name: string, value: string): ValidationResult {
  const definition = definitionsMap.get(name);

  if (definition === undefined) {
    return { valid: false, error: `Unknown option: ${name}` };
  }

  switch (definition.type) {
    case 'string':
      return { valid: true };

    case 'number': {
      const parsed = parseInt(value, 10);
      if (Number.isNaN(parsed) || String(parsed) !== value.trim()) {
        return { valid: false, error: `Expected an integer for ${name}, got: ${value}` };
      }
      return { valid: true };
    }

    case 'boolean': {
      const lower = value.toLowerCase();
      if (
        lower === 'on' ||
        lower === 'off' ||
        lower === 'true' ||
        lower === 'false' ||
        lower === '1' ||
        lower === '0'
      ) {
        return { valid: true };
      }
      return {
        valid: false,
        error: `Expected on/off, true/false, or 1/0 for ${name}, got: ${value}`,
      };
    }

    case 'choice': {
      const choices = definition.choices ?? [];
      if (!choices.includes(value)) {
        return {
          valid: false,
          error: `Invalid value for ${name}: ${value}. Must be one of: ${choices.join(', ')}`,
        };
      }
      return { valid: true };
    }

    case 'color': {
      if (!isValidColor(value)) {
        return {
          valid: false,
          error: `Invalid color for ${name}: ${value}. Use a color name, colour0-colour255, or #RRGGBB`,
        };
      }
      return { valid: true };
    }

    case 'style': {
      if (!isValidStyle(value)) {
        return {
          valid: false,
          error: `Invalid style for ${name}: ${value}. Use key=value pairs (bg=, fg=) and/or style attributes`,
        };
      }
      return { valid: true };
    }

    default: {
      // Exhaustive check - this should never happen with correct OptionType union
      const _exhaustive: never = definition.type;
      return { valid: false, error: `Unknown option type: ${String(_exhaustive)}` };
    }
  }
}
