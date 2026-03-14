/**
 * Database migration runner
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabase } from './database.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Run database migrations
 */
export function runMigrations(): void {
  const db = getDatabase();
  
  logger.info('Running database migrations...');

  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    )
  `);

  // Read and apply schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  
  // Check if schema has been applied
  const migrationName = 'initial_schema_v1';
  const existing = db.prepare('SELECT id FROM migrations WHERE name = ?').get(migrationName);
  
  if (!existing) {
    logger.info('Applying initial schema...');
    db.exec(schema);

    db.prepare('INSERT INTO migrations (name, applied_at) VALUES (?, ?)').run(
      migrationName,
      Date.now()
    );

    logger.info('Initial schema applied successfully');
  } else {
    // Re-run schema for new CREATE TABLE IF NOT EXISTS statements
    db.exec(schema);
    logger.info('Schema already up to date');
  }

  // v2: tmux compatibility columns on existing tables
  const v2MigrationName = 'tmux_compat_v2';
  const v2Existing = db.prepare('SELECT id FROM migrations WHERE name = ?').get(v2MigrationName);

  if (!v2Existing) {
    logger.info('Applying tmux compatibility migration...');

    const alterStatements = [
      // Sessions: last-window tracking
      'ALTER TABLE sessions ADD COLUMN last_window_id TEXT',
      // Windows: auto-rename and monitoring
      'ALTER TABLE windows ADD COLUMN auto_rename INTEGER NOT NULL DEFAULT 1',
      'ALTER TABLE windows ADD COLUMN last_active_at INTEGER',
      'ALTER TABLE windows ADD COLUMN monitor_activity INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE windows ADD COLUMN monitor_silence INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE windows ADD COLUMN monitor_bell INTEGER NOT NULL DEFAULT 1',
      // Panes: title and mark
      'ALTER TABLE panes ADD COLUMN title TEXT NOT NULL DEFAULT \'\'',
      'ALTER TABLE panes ADD COLUMN marked INTEGER NOT NULL DEFAULT 0',
    ];

    for (const stmt of alterStatements) {
      try {
        db.exec(stmt);
      } catch {
        // Column may already exist if schema was created fresh with v2
      }
    }

    db.prepare('INSERT INTO migrations (name, applied_at) VALUES (?, ?)').run(
      v2MigrationName,
      Date.now()
    );

    logger.info('tmux compatibility migration applied successfully');
  }
}

/**
 * Reset database (for testing)
 */
export function resetDatabase(): void {
  const db = getDatabase();
  
  logger.warn('Resetting database - all data will be lost!');
  
  db.exec(`
    DROP TABLE IF EXISTS hooks;
    DROP TABLE IF EXISTS options;
    DROP TABLE IF EXISTS key_bindings;
    DROP TABLE IF EXISTS panes;
    DROP TABLE IF EXISTS windows;
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS migrations;
  `);
  
  runMigrations();
}
