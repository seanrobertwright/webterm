# Data Model: Full tmux Compatibility

**Phase 1 Output** | **Date**: 2026-02-22

## New Entities

### PasteBuffer

A named text storage unit used by copy mode, capture-pane, and clipboard operations.

| Field | Type | Description |
|-------|------|-------------|
| name | string | Auto-generated (`buffer0`, `buffer1`, ...) or user-assigned |
| content | string | The text content of the buffer |
| size | number | Character count of content |
| createdAt | number | Unix timestamp (ms) when buffer was created |

**Constraints**:
- Stack-ordered: most recently created is the default buffer
- Global scope: shared across all sessions within the server instance
- Maximum count configurable via `buffer-limit` option (default: 50)
- When limit reached, oldest buffer is evicted
- In-memory only (not persisted to database -- matches tmux behavior)

**State transitions**: Created (via copy mode yank, capture-pane, set-buffer) → Exists → Deleted (via delete-buffer or eviction)

---

### KeyBinding

A mapping from a key combination in a key table to a command string.

| Field | Type | Description |
|-------|------|-------------|
| id | string | UUID |
| keyTable | string | Key table name: `root`, `prefix`, `copy-mode-vi`, or custom |
| key | string | Key identifier (e.g., `h`, `C-a`, `Space`, `ArrowLeft`) |
| command | string | Full command string to execute (e.g., `split-window -h`) |
| isDefault | boolean | Whether this is a built-in default binding |
| createdAt | number | Unix timestamp |

**Constraints**:
- Unique on (keyTable, key) -- one binding per key per table
- Custom bindings override defaults with same (keyTable, key)
- Persisted to SQLite for user customizations
- Default bindings loaded from code at startup, not stored in DB

**Relationships**: Belongs to a key table (string). References a Command (by name in the command string).

---

### Option

A named configuration value with hierarchical scoping.

| Field | Type | Description |
|-------|------|-------------|
| id | string | UUID |
| scope | string | `server`, `global-session`, `global-window`, `global-pane`, `session`, `window`, `pane` |
| scopeId | string | null | Target entity ID for non-global scopes (session/window/pane ID) |
| name | string | Option name (e.g., `status-position`, `mouse`, `prefix`) |
| value | string | Serialized value (JSON-encoded for non-string types) |
| updatedAt | number | Unix timestamp |

**Constraints**:
- Unique on (scope, scopeId, name)
- Inheritance chain: pane → window → session → global → built-in default
- Type validation per option definition (string, number, boolean, array, color, style)
- Persisted to SQLite

**Scope hierarchy** (from most specific to least):
1. Pane option (`scope=pane`, `scopeId=paneId`)
2. Window option (`scope=window`, `scopeId=windowId`)
3. Session option (`scope=session`, `scopeId=sessionId`)
4. Global window option (`scope=global-window`, `scopeId=null`)
5. Global session option (`scope=global-session`, `scopeId=null`)
6. Server option (`scope=server`, `scopeId=null`)
7. Built-in default (in code, not in DB)

---

### Hook

A command registered to execute automatically on a lifecycle event.

| Field | Type | Description |
|-------|------|-------------|
| id | string | UUID |
| scope | string | `global` or `session` |
| scopeId | string | null | Session ID for session-scoped hooks |
| eventName | string | Event name (e.g., `after-new-window`, `pane-died`) |
| command | string | Command string to execute |
| ordering | number | Execution order for multiple hooks on same event |
| createdAt | number | Unix timestamp |

**Constraints**:
- Multiple hooks can be registered for the same event
- Hooks execute in `ordering` sequence
- Persisted to SQLite

---

### Command (in-memory only)

A registered command definition in the command registry.

| Field | Type | Description |
|-------|------|-------------|
| name | string | Primary command name (e.g., `split-window`) |
| aliases | string[] | Short aliases (e.g., `splitw`) |
| description | string | Human-readable description |
| flags | FlagDef[] | Flag definitions with `short`, `takesValue`, `description` |
| args | ArgDef[] | Positional argument definitions with `name`, `required`, `completionKind` |

**Constraints**:
- Not persisted -- defined in code and loaded at startup
- Aliases map to the same CommandDef
- Command names are globally unique

---

### FormatVariable (in-memory only)

A named value that resolves dynamically at render time.

| Field | Type | Description |
|-------|------|-------------|
| name | string | Variable name (e.g., `session_name`, `window_index`) |
| scope | string | Context required: `server`, `session`, `window`, `pane`, `client` |
| resolver | function | Takes a context object, returns the current string value |

**Constraints**: Not persisted. Defined in code. ~20 initial variables, expandable.

---

## Modified Existing Entities

### Session (existing -- add fields)

| New Field | Type | Description |
|-----------|------|-------------|
| lastWindowId | string | null | ID of the previously active window (for last-window toggle) |

### Window (existing -- add fields)

| New Field | Type | Description |
|-----------|------|-------------|
| autoRename | boolean | Whether automatic rename is enabled (default: true) |
| lastActiveAt | number | Timestamp of when this window was last active |
| monitorActivity | boolean | Whether activity monitoring is enabled |
| monitorSilence | number | Silence timeout in seconds (0 = disabled) |
| monitorBell | boolean | Whether bell monitoring is enabled |
| activityFlag | boolean | Whether unseen activity exists |
| bellFlag | boolean | Whether unseen bell exists |
| silenceFlag | boolean | Whether silence timeout was triggered |

### Pane (existing -- add fields)

| New Field | Type | Description |
|-----------|------|-------------|
| title | string | Current pane title (from OSC sequences or manual set) |
| marked | boolean | Whether this pane is the marked pane |
| currentCommand | string | null | Name of the foreground process running in this pane |

---

## New Database Tables

### `key_bindings`

```sql
CREATE TABLE IF NOT EXISTS key_bindings (
    id TEXT PRIMARY KEY,
    key_table TEXT NOT NULL,
    key TEXT NOT NULL,
    command TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (key_table, key)
);
```

### `options`

```sql
CREATE TABLE IF NOT EXISTS options (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    scope_id TEXT,
    name TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (scope, scope_id, name)
);

CREATE INDEX IF NOT EXISTS idx_options_scope ON options(scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_options_name ON options(name);
```

### `hooks`

```sql
CREATE TABLE IF NOT EXISTS hooks (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL DEFAULT 'global',
    scope_id TEXT,
    event_name TEXT NOT NULL,
    command TEXT NOT NULL,
    ordering INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hooks_event ON hooks(event_name);
```

### Schema migration for existing tables

```sql
-- Add new columns to windows table
ALTER TABLE windows ADD COLUMN auto_rename INTEGER NOT NULL DEFAULT 1;
ALTER TABLE windows ADD COLUMN last_active_at INTEGER;
ALTER TABLE windows ADD COLUMN monitor_activity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE windows ADD COLUMN monitor_silence INTEGER NOT NULL DEFAULT 0;
ALTER TABLE windows ADD COLUMN monitor_bell INTEGER NOT NULL DEFAULT 1;

-- Add new columns to panes table
ALTER TABLE panes ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE panes ADD COLUMN marked INTEGER NOT NULL DEFAULT 0;

-- Add last_window_id to sessions table
ALTER TABLE sessions ADD COLUMN last_window_id TEXT;
```

---

## Entity Relationship Summary

```
Session 1──* Window 1──* Pane
   │                        │
   │                        ├── title, marked, currentCommand
   │                        │
   │  ├── lastWindowId      ├── monitorActivity/Silence/Bell
   │                        ├── activityFlag/bellFlag/silenceFlag
   │
   ├── Options (scope=session)
   ├── Hooks (scope=session)
   │
PasteBuffer (global, in-memory)
KeyBinding (global, persisted)
Option (hierarchical scopes, persisted)
Hook (global or session, persisted)
Command (global, in-memory registry)
FormatVariable (global, in-memory registry)
```
