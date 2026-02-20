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
    logger.info('Schema already up to date');
  }
}

/**
 * Reset database (for testing)
 */
export function resetDatabase(): void {
  const db = getDatabase();
  
  logger.warn('Resetting database - all data will be lost!');
  
  db.exec(`
    DROP TABLE IF EXISTS panes;
    DROP TABLE IF EXISTS windows;
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS migrations;
  `);
  
  runMigrations();
}
