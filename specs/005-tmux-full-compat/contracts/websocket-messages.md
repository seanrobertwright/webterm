# WebSocket Message Contracts: tmux Compatibility

**Phase 1 Output** | **Date**: 2026-02-22

All new messages extend the existing `ClientMessage` / `ServerMessage` discriminated unions in `shared/types/messages.ts`.

## New Client → Server Messages

### executeCommand

Sends a raw tmux command string for parsing and execution on the server.

```typescript
interface ExecuteCommandMessage {
  type: 'executeCommand';
  payload: {
    command: string;  // e.g., "split-window -h", "set-option -g mouse on"
  };
}
```

### swapPane

Swap two panes in the layout.

```typescript
interface SwapPaneMessage {
  type: 'swapPane';
  payload: {
    sourcePaneId: string;
    targetPaneId: string;
  };
}
```

### breakPane

Extract a pane from its window into a new window.

```typescript
interface BreakPaneMessage {
  type: 'breakPane';
  payload: {
    paneId: string;
    windowName?: string;  // optional name for the new window
  };
}
```

### joinPane

Move a pane from one window into another window's layout.

```typescript
interface JoinPaneMessage {
  type: 'joinPane';
  payload: {
    sourcePaneId: string;
    targetPaneId: string;
    direction: SplitDirection;
  };
}
```

### rotateWindow

Rotate pane positions within the current window layout.

```typescript
interface RotateWindowMessage {
  type: 'rotateWindow';
  payload: {
    windowId: string;
    direction: 'forward' | 'backward';
  };
}
```

### renameWindow

Rename a window.

```typescript
interface RenameWindowMessage {
  type: 'renameWindow';
  payload: {
    windowId: string;
    name: string;
  };
}
```

### selectLayout

Apply a preset or named layout to a window.

```typescript
interface SelectLayoutMessage {
  type: 'selectLayout';
  payload: {
    windowId: string;
    layoutName: 'even-horizontal' | 'even-vertical' | 'main-horizontal' | 'main-vertical' | 'tiled' | 'next';
  };
}
```

### detachSession

Cleanly detach from the current session.

```typescript
interface DetachSessionMessage {
  type: 'detachSession';
}
```

### switchSession

Switch the client to a different session.

```typescript
interface SwitchSessionMessage {
  type: 'switchSession';
  payload: {
    sessionId: string;
  };
}
```

### capturePane

Capture pane content to a paste buffer.

```typescript
interface CapturePaneMessage {
  type: 'capturePane';
  payload: {
    paneId: string;
    startLine?: number;   // negative for scrollback
    endLine?: number;
    bufferName?: string;  // target paste buffer name
  };
}
```

### respawnPane

Restart a process in a pane whose process has exited.

```typescript
interface RespawnPaneMessage {
  type: 'respawnPane';
  payload: {
    paneId: string;
    shell?: ShellType;
  };
}
```

### requestChooseTree

Request data for the choose-tree interactive browser.

```typescript
interface RequestChooseTreeMessage {
  type: 'requestChooseTree';
  payload: {
    startAt: 'sessions' | 'windows';
  };
}
```

### requestDisplayPanes

Request pane overlay data for display-panes mode.

```typescript
interface RequestDisplayPanesMessage {
  type: 'requestDisplayPanes';
  payload: {
    windowId: string;
  };
}
```

### setClientFlag

Set a per-client flag (e.g., read-only mode).

```typescript
interface SetClientFlagMessage {
  type: 'setClientFlag';
  payload: {
    flag: 'readOnly';
    value: boolean;
  };
}
```

---

## New Server → Client Messages

### commandResult

Response to an executeCommand message.

```typescript
interface CommandResultMessage {
  type: 'commandResult';
  payload: {
    output: string;   // command output text (may be empty)
    success: boolean;
  };
}
```

### commandError

Error response to an executeCommand message.

```typescript
interface CommandErrorMessage {
  type: 'commandError';
  payload: {
    message: string;
    command: string;  // the original command that failed
  };
}
```

### paneTitleChanged

Notification that a pane's title (foreground process name) changed.

```typescript
interface PaneTitleChangedMessage {
  type: 'paneTitleChanged';
  payload: {
    paneId: string;
    title: string;
  };
}
```

### statusBarUpdate

Periodic status bar content update.

```typescript
interface StatusBarUpdateMessage {
  type: 'statusBarUpdate';
  payload: {
    left: string;      // rendered left section
    center: string;    // rendered center section (window list HTML)
    right: string;     // rendered right section
    windows: StatusBarWindow[];
  };
}

interface StatusBarWindow {
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
```

### activityAlert

Notification that a window has a monitoring event.

```typescript
interface ActivityAlertMessage {
  type: 'activityAlert';
  payload: {
    windowId: string;
    alertType: 'activity' | 'bell' | 'silence';
    message: string;  // e.g., "Activity in window 2"
  };
}
```

### displayPanesData

Data for the display-panes overlay.

```typescript
interface DisplayPanesDataMessage {
  type: 'displayPanesData';
  payload: {
    panes: Array<{
      paneId: string;
      index: number;
      isActive: boolean;
    }>;
    duration: number;  // ms to display the overlay
  };
}
```

### chooseTreeData

Data for the choose-tree interactive browser.

```typescript
interface ChooseTreeDataMessage {
  type: 'chooseTreeData';
  payload: {
    sessions: Array<{
      id: string;
      name: string;
      attached: number;  // number of connected clients
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
          size: string;  // e.g., "80x24"
        }>;
      }>;
    }>;
  };
}
```

### sessionSwitched

Confirmation that the client switched to a different session.

```typescript
interface SessionSwitchedMessage {
  type: 'sessionSwitched';
  payload: {
    sessionId: string;
    session: Session;
  };
}
```

### sessionDetached

Confirmation that the client detached from a session.

```typescript
interface SessionDetachedMessage {
  type: 'sessionDetached';
  payload: {
    sessionId: string;
    reason: string;  // e.g., "user detach", "session destroyed"
  };
}
```

### optionChanged

Notification that an option value changed (relevant to this client).

```typescript
interface OptionChangedMessage {
  type: 'optionChanged';
  payload: {
    name: string;
    value: string;
    scope: string;
  };
}
```

### windowRenamed

Notification that a window was renamed.

```typescript
interface WindowRenamedMessage {
  type: 'windowRenamed';
  payload: {
    windowId: string;
    name: string;
  };
}
```

---

## Updated Unions

```typescript
// Add to ClientMessage union:
export type ClientMessage =
  | ResizeMessage | CreateMessage | CloseMessage | SplitMessage
  | FocusMessage | BroadcastMessage
  | CreateWindowMessage | CloseWindowMessage | SwitchWindowMessage
  | PongMessage
  // New:
  | ExecuteCommandMessage | SwapPaneMessage | BreakPaneMessage
  | JoinPaneMessage | RotateWindowMessage | RenameWindowMessage
  | SelectLayoutMessage | DetachSessionMessage | SwitchSessionMessage
  | CapturePaneMessage | RespawnPaneMessage
  | RequestChooseTreeMessage | RequestDisplayPanesMessage
  | SetClientFlagMessage;

// Add to ServerMessage union:
export type ServerMessage =
  | ConnectedMessage | PaneCreatedMessage | PaneClosedMessage
  | PaneExitedMessage | LayoutUpdatedMessage
  | WindowCreatedMessage | WindowClosedMessage
  | FlowPauseMessage | FlowResumeMessage | ErrorMessage | PingMessage
  // New:
  | CommandResultMessage | CommandErrorMessage
  | PaneTitleChangedMessage | StatusBarUpdateMessage
  | ActivityAlertMessage | DisplayPanesDataMessage
  | ChooseTreeDataMessage | SessionSwitchedMessage
  | SessionDetachedMessage | OptionChangedMessage
  | WindowRenamedMessage;
```
