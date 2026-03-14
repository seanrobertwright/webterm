/**
 * Shared model types for WebTerm
 * Used by both backend and frontend for type-safe communication
 */

/** Connection state for a terminal pane */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'exited';

/** Supported shell types */
export type ShellType = 'powershell' | 'pwsh' | 'cmd' | 'bash' | 'zsh' | 'sh' | 'default';

/** Session entity - top-level workspace containing windows */
export interface Session {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  activeWindowId: string | null;
  lastWindowId: string | null;
}

/** Session with full details including windows */
export interface SessionWithWindows extends Session {
  windows: WindowWithPanes[];
}

/** Window entity - contains panes and layout */
export interface Window {
  id: string;
  sessionId: string;
  name: string;
  index: number;
  createdAt: number;
  autoRename: boolean;
  lastActiveAt: number | null;
  monitorActivity: boolean;
  monitorSilence: number;
  monitorBell: boolean;
  activityFlag: boolean;
  bellFlag: boolean;
  silenceFlag: boolean;
}

/** Window with embedded layout and panes */
export interface WindowWithPanes extends Window {
  layout: Layout;
  panes: Pane[];
}

/** Pane entity - individual terminal instance */
export interface Pane {
  id: string;
  windowId: string;
  shell: ShellType;
  cwd: string | null;
  cols: number;
  rows: number;
  connectionState: ConnectionState;
  exitCode: number | null;
  createdAt: number;
  title: string;
  marked: boolean;
  currentCommand: string | null;
}

/** Layout tree node types */
export type LayoutType = 'leaf' | 'horizontal' | 'vertical';

/** Layout node - recursive tree structure for pane arrangement */
export interface Layout {
  type: LayoutType;
  /** For leaf nodes: the pane ID */
  paneId?: string;
  /** For split nodes: child layouts */
  children?: Layout[];
  /** For split nodes: proportional sizes (sum to 1.0) */
  sizes?: number[];
}

/** Split direction for creating new panes */
export type SplitDirection = 'h' | 'v';

/** Pane creation options */
export interface CreatePaneOptions {
  windowId: string;
  shell?: ShellType;
  cwd?: string;
  cols?: number;
  rows?: number;
}

// ============================================================================
// Session Export Types
// ============================================================================

/** Pane data included in a session export */
export interface SessionExportPane {
  id: string;
  shell: ShellType;
  cwd: string | null;
  cols: number;
  rows: number;
  title: string;
}

/** Window data included in a session export */
export interface SessionExportWindow {
  name: string;
  index: number;
  layout: Layout;
  panes: SessionExportPane[];
}

/** Full session export with structure and scrollback */
export interface SessionExport {
  version: 1;
  exportedAt: number;
  session: {
    name: string;
    windows: SessionExportWindow[];
  };
  scrollback: Record<string, string>;
}

/** Session list item (summary without full details) */
export interface SessionListItem {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  windowCount: number;
  paneCount: number;
}

// ============================================================================
// tmux Compatibility Entities
// ============================================================================

/** Paste buffer for copy/paste operations */
export interface PasteBuffer {
  name: string;
  content: string;
  size: number;
  createdAt: number;
}

/** Key binding mapping a key in a table to a command */
export interface KeyBinding {
  id: string;
  keyTable: string;
  key: string;
  command: string;
  isDefault: boolean;
  createdAt: number;
}

/** Configuration option with hierarchical scoping */
export type OptionScope =
  | 'server'
  | 'global-session'
  | 'global-window'
  | 'global-pane'
  | 'session'
  | 'window'
  | 'pane';

export type OptionType = 'string' | 'number' | 'boolean' | 'choice' | 'color' | 'style';

export interface Option {
  id: string;
  scope: OptionScope;
  scopeId: string | null;
  name: string;
  value: string;
  updatedAt: number;
}

/** Hook registered on a lifecycle event */
export interface Hook {
  id: string;
  scope: 'global' | 'session';
  scopeId: string | null;
  eventName: string;
  command: string;
  ordering: number;
  createdAt: number;
}

/** Command definition in the registry */
export interface FlagDef {
  short: string;
  takesValue: boolean;
  description: string;
}

export interface ArgDef {
  name: string;
  required: boolean;
  completionKind?: 'session' | 'window' | 'pane' | 'command' | 'option' | 'file';
}

export interface CommandDef {
  name: string;
  aliases: string[];
  description: string;
  flags: FlagDef[];
  args: ArgDef[];
}

/** Format variable resolver context */
export interface FormatContext {
  session?: Session;
  window?: Window;
  pane?: Pane;
  clientWidth?: number;
  clientHeight?: number;
}

/** Preset layout names */
export type PresetLayoutName =
  | 'even-horizontal'
  | 'even-vertical'
  | 'main-horizontal'
  | 'main-vertical'
  | 'tiled';
