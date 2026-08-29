import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.resolve(__dirname, '../../data/container_mgmt.db');
const SCHEMA_PATH = path.resolve(__dirname, 'schema.sql');

// Ensure the data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Singleton instance
let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(DB_PATH);

  // Performance pragmas
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  // Run schema (CREATE TABLE IF NOT EXISTS — safe to re-run)
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  _db.exec(schema);

  return _db;
}

// Initialise on import so Express routes always have a ready DB
export const db = getDb();
