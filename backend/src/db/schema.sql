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
