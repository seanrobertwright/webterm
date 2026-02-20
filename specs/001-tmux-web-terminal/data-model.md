# Data Model: Web Terminal Multiplexer (WebTerm)

**Branch**: `001-tmux-web-terminal`  
**Date**: 2026-02-17  
**Source**: [spec.md](spec.md) Key Entities section

---

## Entity Overview

```
Session (1) ──────< Window (N)
                       │
                       └──────< Pane (N)
                                   │
                                   └──── Terminal (1:1)
                                   │
                                   └──── Layout (embedded)
```

---

## 1. Session

**Description**: Represents a user's workspace containing multiple windows. The top-level persistence unit.

### Fields

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | string (UUID) | PK, required | Unique session identifier |
| `name` | string | required, max 100 chars | User-assigned session name |
| `createdAt` | timestamp | required | Session creation time |
| `updatedAt` | timestamp | required | Last modification time |
| `activeWindowId` | string (UUID) | FK → Window.id, nullable | Currently focused window |

### Validation Rules
- `name` must be non-empty and ≤ 100 characters
- `name` must be unique within active sessions (excluding soft-deleted)
- `activeWindowId` must reference a window belonging to this session

### State Transitions
```
[Created] ──(save)──> [Persisted] ──(restore)──> [Active]
    │                      │                         │
    └──────────────────────┴─────────(close)─────────┘
                                        │
                                        v
                                   [Archived]
```

---

## 2. Window

**Description**: A logical grouping of panes within a session. Analogous to tmux windows—users can switch between windows while each window contains its own pane layout.

### Fields

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | string (UUID) | PK, required | Unique window identifier |
| `sessionId` | string (UUID) | FK → Session.id, required | Parent session |
| `name` | string | required, max 50 chars | Window name (tab label) |
| `index` | integer | required, ≥ 0 | Display order within session |
| `layout` | Layout (embedded) | required | Pane arrangement data |
| `createdAt` | timestamp | required | Window creation time |

### Validation Rules
- `name` must be non-empty and ≤ 50 characters
- `index` must be unique within session
- `index` must be ≥ 0

### State Transitions
```
[Created] ──(add pane)──> [Active] ──(close all panes)──> [Destroyed]
                              │
                         (reorder)
                              │
                              v
                          [Reindexed]
```

### Cascade Behavior
- Deleting a Window deletes all child Panes

---

## 3. Pane

**Description**: An individual terminal instance within a window. Has position and dimensions within the window's layout.

### Fields

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | string (UUID) | PK, required | Unique pane identifier |
| `windowId` | string (UUID) | FK → Window.id, required | Parent window |
| `shell` | string | required | Shell executable path |
| `cwd` | string | optional | Current working directory |
| `cols` | integer | required, 1-500 | Terminal columns |
| `rows` | integer | required, 1-200 | Terminal rows |
| `connectionState` | enum | required | Current connection status |
| `exitCode` | integer | nullable | Process exit code if exited |
| `createdAt` | timestamp | required | Pane creation time |

### Enums

**ConnectionState**:
| Value | Description |
|-------|-------------|
| `connecting` | WebSocket establishing connection |
| `connected` | Active connection, PTY running |
| `disconnected` | Connection lost, reconnection pending |
| `exited` | PTY process has terminated |

### Validation Rules
- `shell` must be a valid shell identifier (`powershell`, `pwsh`, `cmd`, `bash`, `zsh`, `sh`)
- `cols` must be between 1 and 500
- `rows` must be between 1 and 200
- `exitCode` only set when `connectionState` is `exited`

### State Transitions
```
[Created] ──(connect)──> [Connecting] ──(PTY ready)──> [Connected]
                                                            │
                              ┌─────────(disconnect)────────┤
                              │                             │
                              v                        (exit)
                        [Disconnected]                      │
                              │                             v
                         (reconnect)                   [Exited]
                              │
                              v
                        [Connected]
```

### Cascade Behavior
- Deleting a Pane kills the associated PTY process

---

## 4. Terminal

**Description**: Runtime representation of the terminal emulator instance. Not persisted—recreated on session restore.

### Fields (Runtime Only)

| Field | Type | Description |
|-------|------|-------------|
| `paneId` | string (UUID) | Associated pane |
| `pty` | IPty | node-pty process handle |
| `buffer` | string[] | Scrollback buffer (for reconnection replay) |
| `lastOutput` | timestamp | Last output received (for idle detection) |

### Notes
- Terminal instances are ephemeral—not stored in database
- On session restore, new PTY processes are spawned
- Buffer is kept in memory for reconnection replay (last 1000 lines)

---

## 5. Layout

**Description**: The arrangement of panes within a window. Stored as JSON, represents a recursive split tree.

### Structure

```typescript
interface Layout {
  type: 'leaf' | 'horizontal' | 'vertical';
  // For leaf nodes:
  paneId?: string;
  // For split nodes:
  children?: Layout[];
  sizes?: number[];  // Proportional sizes (sum to 1.0)
}
```

### Example

```json
{
  "type": "horizontal",
  "sizes": [0.5, 0.5],
  "children": [
    { "type": "leaf", "paneId": "abc-123" },
    {
      "type": "vertical",
      "sizes": [0.6, 0.4],
      "children": [
        { "type": "leaf", "paneId": "def-456" },
        { "type": "leaf", "paneId": "ghi-789" }
      ]
    }
  ]
}
```

### Validation Rules
- `type` must be one of: `leaf`, `horizontal`, `vertical`
- Leaf nodes must have `paneId`
- Split nodes must have `children` (2+ items) and `sizes` (same length)
- `sizes` must sum to 1.0 (±0.001 tolerance)
- All `paneId` references must exist in the parent window

---

## 6. WebSocket Message Types

**Description**: Message types for real-time communication between frontend and backend.

### Inbound Messages (Client → Server)

| Type | Payload | Description |
|------|---------|-------------|
| `input` | `{ paneId: string, data: Uint8Array }` | Keyboard input to PTY |
| `resize` | `{ paneId: string, cols: number, rows: number }` | Terminal resize |
| `create` | `{ windowId: string, shell: string, cwd?: string }` | Create new pane |
| `close` | `{ paneId: string }` | Close pane |
| `split` | `{ paneId: string, direction: 'h' \| 'v' }` | Split pane |
| `focus` | `{ paneId: string }` | Focus pane (for broadcast tracking) |

### Outbound Messages (Server → Client)

| Type | Payload | Description |
|------|---------|-------------|
| `output` | `{ paneId: string, data: Uint8Array }` | PTY output |
| `created` | `{ pane: Pane, layout: Layout }` | Pane created |
| `closed` | `{ paneId: string, layout: Layout }` | Pane closed |
| `exited` | `{ paneId: string, exitCode: number }` | PTY process exited |
| `error` | `{ paneId?: string, message: string }` | Error occurred |
| `connected` | `{ sessionId: string, session: Session }` | Connection established |

---

## Database Schema (SQLite)

```sql
-- Sessions table
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    active_window_id TEXT,
    UNIQUE(name)
);

-- Windows table
CREATE TABLE windows (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    idx INTEGER NOT NULL,
    layout TEXT NOT NULL,  -- JSON
    created_at INTEGER NOT NULL,
    UNIQUE(session_id, idx)
);

-- Panes table (for session restoration)
CREATE TABLE panes (
    id TEXT PRIMARY KEY,
    window_id TEXT NOT NULL REFERENCES windows(id) ON DELETE CASCADE,
    shell TEXT NOT NULL,
    cwd TEXT,
    cols INTEGER NOT NULL DEFAULT 80,
    rows INTEGER NOT NULL DEFAULT 24,
    created_at INTEGER NOT NULL
);

-- Indexes
CREATE INDEX idx_windows_session ON windows(session_id);
CREATE INDEX idx_panes_window ON panes(window_id);

-- Schema version
PRAGMA user_version = 1;
```

---

## Type Definitions (TypeScript)

```typescript
// shared/types/models.ts

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'exited';

export interface Session {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  activeWindowId: string | null;
}

export interface Window {
  id: string;
  sessionId: string;
  name: string;
  index: number;
  layout: Layout;
  createdAt: number;
}

export interface Pane {
  id: string;
  windowId: string;
  shell: string;
  cwd: string | null;
  cols: number;
  rows: number;
  connectionState: ConnectionState;
  exitCode: number | null;
  createdAt: number;
}

export type Layout =
  | { type: 'leaf'; paneId: string }
  | { type: 'horizontal' | 'vertical'; children: Layout[]; sizes: number[] };
```
