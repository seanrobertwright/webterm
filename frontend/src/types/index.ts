/**
 * Frontend-specific types for WebTerm
 * Re-exports shared types and adds UI-specific types
 */

// Re-export all shared types
export * from '@webterm/shared/index';

// ============================================================================
// UI State Types
// ============================================================================

/** Connection state for WebSocket */
export type WebSocketState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

/** Prefix mode state for tmux-like keybindings */
export interface PrefixModeState {
  active: boolean;
  timestamp: number | null;
}

/** Pane UI state (extends backend Pane) */
export interface PaneUIState {
  zoomed: boolean;
  scrollbackLines: number;
  hasActivity: boolean;
  isFocused: boolean;
}

/** Terminal dimensions */
export interface TerminalDimensions {
  cols: number;
  rows: number;
  width: number;
  height: number;
}

/** Resize event data */
export interface ResizeEventData {
  paneId: string;
  cols: number;
  rows: number;
}

// ============================================================================
// Keybinding Types
// ============================================================================

/** Keybinding action type */
export type KeybindingAction =
  | { type: 'splitVertical' }
  | { type: 'splitHorizontal' }
  | { type: 'navigatePane'; direction: 'left' | 'right' | 'up' | 'down' }
  | { type: 'closePane' }
  | { type: 'zoomPane' }
  | { type: 'newWindow' }
  | { type: 'nextWindow' }
  | { type: 'prevWindow' }
  | { type: 'saveSession' }
  | { type: 'showHelp' }
  | { type: 'copy' }
  | { type: 'paste' }
  | { type: 'commandPrompt' }
  | { type: 'copyMode' }
  | { type: 'pasteBuffer' };

/** Keybinding configuration */
export interface KeyBinding {
  key: string;
  requiresPrefix: boolean;
  action: KeybindingAction;
  description: string;
}

// ============================================================================
// Clipboard Types
// ============================================================================

/** Result of clipboard operation */
export interface ClipboardResult {
  success: boolean;
  error?: string;
  data?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

/** Generic API response wrapper */
export interface ApiResponse<T> {
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/** Pagination parameters */
export interface PaginationParams {
  page?: number;
  limit?: number;
}

/** Paginated response */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ============================================================================
// Store Action Types
// ============================================================================

/** Pane store action payloads */
export interface SetLayoutPayload {
  windowId: string;
  layout: import('@webterm/shared/index').Layout;
}

/** Session update payload */
export interface UpdateSessionPayload {
  name?: string;
}

// ============================================================================
// Component Props Types
// ============================================================================

/** Terminal component props */
export interface TerminalPaneProps {
  paneId: string;
  isActive: boolean;
  isZoomed: boolean;
  onFocus?: () => void;
  onResize?: (dimensions: TerminalDimensions) => void;
}

/** Layout container props */
export interface LayoutContainerProps {
  layout: import('@webterm/shared/index').Layout;
  activePane: string | null;
  onPaneSelect: (paneId: string) => void;
}
