/**
 * WebSocket message types for WebTerm
 * Binary messages for I/O, JSON messages for control
 */

import type { Layout, Pane, Session, ShellType, SplitDirection, WindowWithPanes } from './models.ts';

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
  | PongMessage;

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
  | PingMessage;

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
