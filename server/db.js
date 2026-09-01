import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
mkdirSync(DATA_DIR, { recursive: true })

export const DB_PATH = join(DATA_DIR, 'pm.db')

export const db = new DatabaseSync(DB_PATH)

db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS employees (
  id             INTEGER PRIMARY KEY,
  username       TEXT    UNIQUE,
  full_name      TEXT    NOT NULL,
  job_title      TEXT,
  department     TEXT,
  company        TEXT,
  email          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash  TEXT,
  role           TEXT    NOT NULL DEFAULT 'member',
  avatar_color   TEXT,
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  key         TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  description TEXT,
  lead_id     INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  color       TEXT    NOT NULL DEFAULT '#6366f1',
  position    REAL    NOT NULL DEFAULT 1000,
  archived    INTEGER NOT NULL DEFAULT 0,
  seq         INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS board_columns (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  position   REAL    NOT NULL,
  wip_limit  INTEGER,
  is_done    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sprints (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  goal       TEXT,
  start_date TEXT,
  end_date   TEXT,
  status     TEXT    NOT NULL DEFAULT 'planned',
  position   REAL    NOT NULL DEFAULT 1000
);

CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key          TEXT    NOT NULL,
  title        TEXT    NOT NULL,
  description  TEXT,
  type         TEXT    NOT NULL DEFAULT 'task',
  priority     TEXT    NOT NULL DEFAULT 'medium',
  column_id    INTEGER REFERENCES board_columns(id) ON DELETE SET NULL,
  sprint_id    INTEGER REFERENCES sprints(id) ON DELETE SET NULL,
  assignee_id  INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  reporter_id  INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  story_points INTEGER,
  due_date     TEXT,
  labels       TEXT,
  position     REAL    NOT NULL,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id  INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  body       TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  task_id    INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  actor_id   INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  action     TEXT    NOT NULL,
  detail     TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_project  ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_column   ON tasks(column_id);
CREATE INDEX IF NOT EXISTS idx_tasks_sprint   ON tasks(sprint_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_cols_project   ON board_columns(project_id);
CREATE INDEX IF NOT EXISTS idx_sprints_project ON sprints(project_id);
CREATE INDEX IF NOT EXISTS idx_comments_task  ON comments(task_id);
CREATE INDEX IF NOT EXISTS idx_activity_task  ON activity(task_id);
`)

export const GAP = 1024

/** Rank a row between two neighbours; returns a new float position. */
export function rankBetween(before, after) {
  if (before == null && after == null) return GAP
  if (before == null) return after - GAP
  if (after == null) return before + GAP
  return (before + after) / 2
}

export function logActivity({ projectId, taskId, actorId, action, detail }) {
  db.prepare(
    `INSERT INTO activity (project_id, task_id, actor_id, action, detail)
     VALUES (?, ?, ?, ?, ?)`
  ).run(projectId ?? null, taskId ?? null, actorId ?? null, action, detail ?? null)
}
