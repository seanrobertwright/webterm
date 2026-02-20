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

/** Session list item (summary without full details) */
export interface SessionListItem {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  windowCount: number;
  paneCount: number;
}
