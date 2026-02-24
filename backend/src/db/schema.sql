-- WebTerm Database Schema
-- Version: 1.0.0

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    active_window_id TEXT,
    FOREIGN KEY (active_window_id) REFERENCES windows(id) ON DELETE SET NULL
);

-- Windows table
CREATE TABLE IF NOT EXISTS windows (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    name TEXT NOT NULL,
    idx INTEGER NOT NULL,
    layout TEXT NOT NULL, -- JSON layout tree
    created_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    UNIQUE (session_id, idx)
);

-- Panes table
CREATE TABLE IF NOT EXISTS panes (
    id TEXT PRIMARY KEY,
    window_id TEXT NOT NULL,
    shell TEXT NOT NULL,
    cwd TEXT,
    cols INTEGER NOT NULL DEFAULT 80,
    rows INTEGER NOT NULL DEFAULT 24,
    connection_state TEXT NOT NULL DEFAULT 'disconnected',
    exit_code INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (window_id) REFERENCES windows(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_windows_session_id ON windows(session_id);
CREATE INDEX IF NOT EXISTS idx_panes_window_id ON panes(window_id);
CREATE INDEX IF NOT EXISTS idx_sessions_name ON sessions(name);

-- ============================================================================
-- tmux Compatibility Tables (v2)
-- ============================================================================

-- Key bindings table (user customizations only; defaults loaded from code)
CREATE TABLE IF NOT EXISTS key_bindings (
    id TEXT PRIMARY KEY,
    key_table TEXT NOT NULL,
    key TEXT NOT NULL,
    command TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (key_table, key)
);

-- Options table (hierarchical configuration)
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

-- Hooks table (lifecycle event handlers)
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
