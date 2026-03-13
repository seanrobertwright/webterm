/**
 * WebSocket message types for WebTerm
 * Binary messages for I/O, JSON messages for control
 */

import type {
  Layout,
  Pane,
  PresetLayoutName,
  Session,
  ShellType,
  SplitDirection,
  WindowWithPanes,
} from './models.ts';

/** Binary message type codes */
export const BinaryMessageType = {
  INPUT: 0x01,
  OUTPUT: 0x02,
} as const;

export type BinaryMessageTypeCode = (typeof BinaryMessageType)[keyof typeof BinaryMessageType];

// ============================================================================
// Client → Server Messages
// ============================================================================

/** Resize a terminal pane */
export interface ResizeMessage {
  type: 'resize';
  payload: {
    paneId: string;
    cols: number;
    rows: number;
  };
}

/** Create a new pane */
export interface CreateMessage {
  type: 'create';
  payload: {
    windowId: string;
    shell?: ShellType;
    cwd?: string;
  };
}

/** Close a pane */
export interface CloseMessage {
  type: 'close';
  payload: {
    paneId: string;
  };
}

/** Split an existing pane */
export interface SplitMessage {
  type: 'split';
  payload: {
    paneId: string;
    direction: SplitDirection;
    shell?: ShellType;
  };
}

/** Notify server of focused pane */
export interface FocusMessage {
  type: 'focus';
  payload: {
    paneId: string;
  };
}

/** Toggle broadcast mode */
export interface BroadcastMessage {
  type: 'broadcast';
  payload: {
    enabled: boolean;
    paneIds: string[];
  };
}

/** Create new window */
export interface CreateWindowMessage {
  type: 'createWindow';
  payload: {
    sessionId: string;
    name?: string;
  };
}

/** Close window */
export interface CloseWindowMessage {
  type: 'closeWindow';
  payload: {
    windowId: string;
  };
}

/** Switch active window */
export interface SwitchWindowMessage {
  type: 'switchWindow';
  payload: {
    windowId: string;
  };
}

/** Heartbeat pong (client response to server ping) */
export interface PongMessage {
  type: 'pong';
}

// ============================================================================
// New Client → Server Messages (tmux compatibility)
// ============================================================================

/** Execute a tmux command string */
export interface ExecuteCommandMessage {
  type: 'executeCommand';
  payload: {
    command: string;
  };
}

/** Swap two panes in the layout */
export interface SwapPaneMessage {
  type: 'swapPane';
  payload: {
    sourcePaneId: string;
    targetPaneId: string;
  };
}

/** Extract a pane into a new window */
export interface BreakPaneMessage {
  type: 'breakPane';
  payload: {
    paneId: string;
    windowName?: string;
  };
}

/** Move a pane into another window */
export interface JoinPaneMessage {
  type: 'joinPane';
  payload: {
    sourcePaneId: string;
    targetPaneId: string;
    direction: SplitDirection;
  };
}

/** Rotate pane positions within a window */
export interface RotateWindowMessage {
  type: 'rotateWindow';
  payload: {
    windowId: string;
    direction: 'forward' | 'backward';
  };
}

/** Rename a window */
export interface RenameWindowMessage {
  type: 'renameWindow';
  payload: {
    windowId: string;
    name: string;
  };
}

/** Apply a preset layout */
export interface SelectLayoutMessage {
  type: 'selectLayout';
  payload: {
    windowId: string;
    layoutName: PresetLayoutName | 'next';
  };
}

/** Detach from the current session */
export interface DetachSessionMessage {
  type: 'detachSession';
}

/** Switch to a different session */
export interface SwitchSessionMessage {
  type: 'switchSession';
  payload: {
    sessionId: string;
  };
}

/** Capture pane content to a paste buffer */
export interface CapturePaneMessage {
  type: 'capturePane';
  payload: {
    paneId: string;
    startLine?: number;
    endLine?: number;
    bufferName?: string;
  };
}

/** Respawn a process in a pane */
export interface RespawnPaneMessage {
  type: 'respawnPane';
  payload: {
    paneId: string;
    shell?: ShellType;
  };
}

/** Request choose-tree data */
export interface RequestChooseTreeMessage {
  type: 'requestChooseTree';
  payload: {
    startAt: 'sessions' | 'windows';
  };
}

/** Request display-panes overlay data */
export interface RequestDisplayPanesMessage {
  type: 'requestDisplayPanes';
  payload: {
    windowId: string;
  };
}

/** Set a per-client flag */
export interface SetClientFlagMessage {
  type: 'setClientFlag';
  payload: {
    flag: 'readOnly';
    value: boolean;
  };
}

/** Yank (copy) text into a server-side paste buffer */
export interface YankToBufferMessage {
  type: 'yankToBuffer';
  payload: {
    content: string;
    bufferName?: string;
  };
}

export type ClientMessage =
  | ResizeMessage
  | CreateMessage
  | CloseMessage
  | SplitMessage
  | FocusMessage
  | BroadcastMessage
  | CreateWindowMessage
  | CloseWindowMessage
  | SwitchWindowMessage
  | PongMessage
  | ExecuteCommandMessage
  | SwapPaneMessage
  | BreakPaneMessage
  | JoinPaneMessage
  | RotateWindowMessage
  | RenameWindowMessage
  | SelectLayoutMessage
  | DetachSessionMessage
  | SwitchSessionMessage
  | CapturePaneMessage
  | RespawnPaneMessage
  | RequestChooseTreeMessage
  | RequestDisplayPanesMessage
  | SetClientFlagMessage
  | YankToBufferMessage;

// ============================================================================
// Server → Client Messages
// ============================================================================

/** Connection established */
export interface ConnectedMessage {
  type: 'connected';
  payload: {
    sessionId: string;
    session: Session;
  };
}

/** Pane created */
export interface PaneCreatedMessage {
  type: 'paneCreated';
  payload: {
    pane: Pane;
    layout: Layout;
  };
}

/** Pane closed */
export interface PaneClosedMessage {
  type: 'paneClosed';
  payload: {
    paneId: string;
    layout: Layout;
  };
}

/** Pane exited (process terminated) */
export interface PaneExitedMessage {
  type: 'paneExited';
  payload: {
    paneId: string;
    exitCode: number;
  };
}

/** Layout updated */
export interface LayoutUpdatedMessage {
  type: 'layoutUpdated';
  payload: {
    windowId: string;
    layout: Layout;
  };
}

/** Window created */
export interface WindowCreatedMessage {
  type: 'windowCreated';
  payload: {
    window: WindowWithPanes;
  };
}

/** Window closed */
export interface WindowClosedMessage {
  type: 'windowClosed';
  payload: {
    windowId: string;
  };
}

/** Flow control: pause output */
export interface FlowPauseMessage {
  type: 'flowPause';
  payload: {
    paneId: string;
  };
}

/** Flow control: resume output */
export interface FlowResumeMessage {
  type: 'flowResume';
  payload: {
    paneId: string;
  };
}

/** Error message */
export interface ErrorMessage {
  type: 'error';
  payload: {
    code: string;
    message: string;
    paneId?: string;
  };
}

/** Heartbeat ping (server → client) */
export interface PingMessage {
  type: 'ping';
}

// ============================================================================
// New Server → Client Messages (tmux compatibility)
// ============================================================================

/** Command execution result */
export interface CommandResultMessage {
  type: 'commandResult';
  payload: {
    output: string;
    success: boolean;
  };
}

/** Command execution error */
export interface CommandErrorMessage {
  type: 'commandError';
  payload: {
    message: string;
    command: string;
  };
}

/** Pane title changed (foreground process) */
export interface PaneTitleChangedMessage {
  type: 'paneTitleChanged';
  payload: {
    paneId: string;
    title: string;
  };
}

/** Status bar window info */
export interface StatusBarWindow {
  id: string;
  index: number;
  name: string;
  active: boolean;
  lastActive: boolean;
  activityFlag: boolean;
  bellFlag: boolean;
  silenceFlag: boolean;
  zoomedFlag: boolean;
}

/** Status bar content update */
export interface StatusBarUpdateMessage {
  type: 'statusBarUpdate';
  payload: {
    left: string;
    center: string;
    right: string;
    windows: StatusBarWindow[];
  };
}

/** Activity/bell/silence monitoring alert */
export interface ActivityAlertMessage {
  type: 'activityAlert';
  payload: {
    windowId: string;
    alertType: 'activity' | 'bell' | 'silence';
    message: string;
  };
}

/** Display-panes overlay data */
export interface DisplayPanesDataMessage {
  type: 'displayPanesData';
  payload: {
    panes: Array<{
      paneId: string;
      index: number;
      isActive: boolean;
    }>;
    duration: number;
  };
}

/** Choose-tree session/window/pane data */
export interface ChooseTreeDataMessage {
  type: 'chooseTreeData';
  payload: {
    sessions: Array<{
      id: string;
      name: string;
      attached: number;
      windows: Array<{
        id: string;
        index: number;
        name: string;
        active: boolean;
        panes: Array<{
          id: string;
          index: number;
          active: boolean;
          title: string;
          currentCommand: string | null;
          size: string;
        }>;
      }>;
    }>;
  };
}

/** Session switch confirmation */
export interface SessionSwitchedMessage {
  type: 'sessionSwitched';
  payload: {
    sessionId: string;
    session: Session;
  };
}

/** Session detach confirmation */
export interface SessionDetachedMessage {
  type: 'sessionDetached';
  payload: {
    sessionId: string;
    reason: string;
  };
}

/** Option value changed */
export interface OptionChangedMessage {
  type: 'optionChanged';
  payload: {
    name: string;
    value: string;
    scope: string;
  };
}

/** Window renamed */
export interface WindowRenamedMessage {
  type: 'windowRenamed';
  payload: {
    windowId: string;
    name: string;
  };
}

/** Session renamed */
export interface SessionRenamedMessage {
  type: 'sessionRenamed';
  payload: {
    sessionId: string;
    name: string;
  };
}

/** Paste buffer content sent to client (for writing to active pane) */
export interface PasteFromBufferMessage {
  type: 'pasteFromBuffer';
  payload: {
    content: string;
  };
}

export type ServerMessage =
  | ConnectedMessage
  | PaneCreatedMessage
  | PaneClosedMessage
  | PaneExitedMessage
  | LayoutUpdatedMessage
  | WindowCreatedMessage
  | WindowClosedMessage
  | FlowPauseMessage
  | FlowResumeMessage
  | ErrorMessage
  | PingMessage
  | CommandResultMessage
  | CommandErrorMessage
  | PaneTitleChangedMessage
  | StatusBarUpdateMessage
  | ActivityAlertMessage
  | DisplayPanesDataMessage
  | ChooseTreeDataMessage
  | SessionSwitchedMessage
  | SessionDetachedMessage
  | OptionChangedMessage
  | WindowRenamedMessage
  | SessionRenamedMessage
  | PasteFromBufferMessage;

// ============================================================================
// Binary Protocol Helpers
// ============================================================================

/**
 * Encode a binary message for terminal I/O
 * Format: [type:1][paneIdLength:1][paneId:N][payload:M]
 */
export function encodeBinaryMessage(
  type: BinaryMessageTypeCode,
  paneId: string,
  payload: Uint8Array
): Uint8Array {
  const paneIdBytes = new TextEncoder().encode(paneId);
  const message = new Uint8Array(2 + paneIdBytes.length + payload.length);
  message[0] = type;
  message[1] = paneIdBytes.length;
  message.set(paneIdBytes, 2);
  message.set(payload, 2 + paneIdBytes.length);
  return message;
}

/**
 * Decode a binary message
 * Returns { type, paneId, payload }
 */
export function decodeBinaryMessage(data: Uint8Array): {
  type: BinaryMessageTypeCode;
  paneId: string;
  payload: Uint8Array;
} {
  const type = data[0] as BinaryMessageTypeCode;
  const paneIdLength = data[1] ?? 0;
  const paneId = new TextDecoder().decode(data.slice(2, 2 + paneIdLength));
  const payload = data.slice(2 + paneIdLength);
  return { type, paneId, payload };
}
