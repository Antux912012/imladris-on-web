// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import pg from "pg";
import * as schema from "./schema.js";

export type AppDb = SqliteRemoteDatabase<typeof schema>;

// Return PostgreSQL BIGINT (OID 20) as JS number to match SQLite integer behavior.
pg.types.setTypeParser(20, (val: string) => Number.parseInt(val, 10));

function isPostgresUrl(databaseUrl: string): boolean {
  return (
    databaseUrl.startsWith("postgres://") ||
    databaseUrl.startsWith("postgresql://")
  );
}

function resolveSqlitePath(databaseUrl: string): string {
  if (databaseUrl === ":memory:" || databaseUrl === "file::memory:") {
    return ":memory:";
  }
  const stripped = databaseUrl.startsWith("file:")
    ? databaseUrl.slice("file:".length)
    : databaseUrl;
  const dir = path.dirname(stripped);
  fs.mkdirSync(dir, { recursive: true });
  return stripped;
}

const SQLITE_DDL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_color TEXT NOT NULL,
  system_role TEXT NOT NULL DEFAULT 'USER',
  access_level TEXT NOT NULL DEFAULT 'FULL',
  disabled INTEGER NOT NULL DEFAULT 0,
  auth_provider TEXT NOT NULL DEFAULT 'local',
  external_subject TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kernel_mode TEXT NOT NULL DEFAULT 'SHARED',
  toolchain_id TEXT,
  department_id TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS document_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  rel_path TEXT NOT NULL,
  yjs_state BLOB NOT NULL,
  sha256_hash TEXT NOT NULL,
  message TEXT,
  is_checkpoint INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_doc_snapshots_ws_path
  ON document_snapshots (workspace_id, rel_path, updated_at DESC);

CREATE TABLE IF NOT EXISTS comment_threads (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  rel_path TEXT NOT NULL,
  anchor_line INTEGER NOT NULL DEFAULT 1,
  anchor_quote TEXT NOT NULL DEFAULT '',
  resolved INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_comment_threads_ws_path
  ON comment_threads (workspace_id, rel_path, created_at DESC);

CREATE TABLE IF NOT EXISTS comment_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES comment_threads(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS invite_tokens (
  token TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 1,
  use_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_path TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sso_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  issuer_url TEXT NOT NULL DEFAULT '',
  client_id TEXT NOT NULL DEFAULT '',
  client_secret TEXT NOT NULL DEFAULT '',
  scopes TEXT NOT NULL DEFAULT 'openid profile email',
  role_mapping_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS toolchain_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  language TEXT NOT NULL,
  image_ref TEXT NOT NULL,
  packages_json TEXT NOT NULL DEFAULT '[]',
  is_default INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS electronic_signatures (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  rel_path TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  user_name TEXT NOT NULL,
  meaning TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  sha256_hash TEXT NOT NULL,
  signature_hash TEXT NOT NULL,
  signed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  term TEXT NOT NULL,
  instructor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  lti_context_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS course_enrollments (
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'STUDENT',
  enrolled_at INTEGER NOT NULL,
  PRIMARY KEY (course_id, user_id)
);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  due_at INTEGER,
  locked INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  grade TEXT,
  feedback TEXT,
  snapshot_hash TEXT,
  submitted_at INTEGER
);

CREATE TABLE IF NOT EXISTS review_links (
  token TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'External Referee',
  blind_authors INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS git_remotes (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  remote_url TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT 'main',
  last_synced_at INTEGER,
  last_commit_hash TEXT
);

CREATE TABLE IF NOT EXISTS institutional_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  files_json TEXT NOT NULL DEFAULT '[]',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS zotero_libraries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  group_id TEXT NOT NULL,
  bibtex_cache TEXT NOT NULL DEFAULT '',
  synced_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  quota_mb INTEGER NOT NULL DEFAULT 10240,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS department_members (
  department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'MEMBER',
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (department_id, user_id)
);

CREATE TABLE IF NOT EXISTS compute_jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  engine TEXT NOT NULL,
  target TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  slurm_job_id TEXT,
  code TEXT NOT NULL,
  stdout TEXT NOT NULL DEFAULT '',
  stderr TEXT NOT NULL DEFAULT '',
  submitted_at INTEGER NOT NULL,
  completed_at INTEGER
);
`;

const POSTGRES_DDL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_color TEXT NOT NULL,
  system_role TEXT NOT NULL DEFAULT 'USER',
  access_level TEXT NOT NULL DEFAULT 'FULL',
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS system_role TEXT NOT NULL DEFAULT 'USER';
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_level TEXT NOT NULL DEFAULT 'FULL';
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'local';
ALTER TABLE users ADD COLUMN IF NOT EXISTS external_subject TEXT;

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kernel_mode TEXT NOT NULL DEFAULT 'SHARED',
  toolchain_id TEXT,
  department_id TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL
);
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS toolchain_id TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS department_id TEXT;

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  joined_at BIGINT NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS document_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  rel_path TEXT NOT NULL,
  yjs_state BYTEA NOT NULL,
  sha256_hash TEXT NOT NULL,
  message TEXT,
  is_checkpoint INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_doc_snapshots_ws_path
  ON document_snapshots (workspace_id, rel_path, updated_at DESC);

CREATE TABLE IF NOT EXISTS comment_threads (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  rel_path TEXT NOT NULL,
  anchor_line INTEGER NOT NULL DEFAULT 1,
  anchor_quote TEXT NOT NULL DEFAULT '',
  resolved INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at BIGINT NOT NULL,
  resolved_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_comment_threads_ws_path
  ON comment_threads (workspace_id, rel_path, created_at DESC);

CREATE TABLE IF NOT EXISTS comment_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES comment_threads(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS invite_tokens (
  token TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 1,
  use_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_path TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at BIGINT NOT NULL
);
ALTER TABLE audit_events ALTER COLUMN workspace_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS sso_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  issuer_url TEXT NOT NULL DEFAULT '',
  client_id TEXT NOT NULL DEFAULT '',
  client_secret TEXT NOT NULL DEFAULT '',
  scopes TEXT NOT NULL DEFAULT 'openid profile email',
  role_mapping_json TEXT NOT NULL DEFAULT '{}',
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS toolchain_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  language TEXT NOT NULL,
  image_ref TEXT NOT NULL,
  packages_json TEXT NOT NULL DEFAULT '[]',
  is_default INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS electronic_signatures (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  rel_path TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  user_name TEXT NOT NULL,
  meaning TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  sha256_hash TEXT NOT NULL,
  signature_hash TEXT NOT NULL,
  signed_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  term TEXT NOT NULL,
  instructor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  lti_context_id TEXT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS course_enrollments (
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'STUDENT',
  enrolled_at BIGINT NOT NULL,
  PRIMARY KEY (course_id, user_id)
);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  due_at BIGINT,
  locked INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  grade TEXT,
  feedback TEXT,
  snapshot_hash TEXT,
  submitted_at BIGINT
);

CREATE TABLE IF NOT EXISTS review_links (
  token TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'External Referee',
  blind_authors INTEGER NOT NULL DEFAULT 1,
  expires_at BIGINT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS git_remotes (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  remote_url TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT 'main',
  last_synced_at BIGINT,
  last_commit_hash TEXT
);

CREATE TABLE IF NOT EXISTS institutional_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  files_json TEXT NOT NULL DEFAULT '[]',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS zotero_libraries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  group_id TEXT NOT NULL,
  bibtex_cache TEXT NOT NULL DEFAULT '',
  synced_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  quota_mb INTEGER NOT NULL DEFAULT 10240,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS department_members (
  department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'MEMBER',
  joined_at BIGINT NOT NULL,
  PRIMARY KEY (department_id, user_id)
);

CREATE TABLE IF NOT EXISTS compute_jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  engine TEXT NOT NULL,
  target TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  slurm_job_id TEXT,
  code TEXT NOT NULL,
  stdout TEXT NOT NULL DEFAULT '',
  stderr TEXT NOT NULL DEFAULT '',
  submitted_at BIGINT NOT NULL,
  completed_at BIGINT
);
`;

function normalizeParams(params: unknown[]): SQLInputValue[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (
      typeof p === "string" ||
      typeof p === "number" ||
      typeof p === "bigint" ||
      p instanceof Uint8Array
    ) {
      return p;
    }
    if (typeof p === "boolean") return p ? 1 : 0;
    return String(p);
  });
}

function toPgPlaceholders(sql: string): string {
  let idx = 0;
  let inSingle = false;
  let inDouble = false;
  let out = "";
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i]!;
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      out += ch;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      out += ch;
    } else if (ch === "?" && !inSingle && !inDouble) {
      idx += 1;
      out += `$${idx}`;
    } else {
      out += ch;
    }
  }
  return out;
}

export async function createDb(databaseUrl: string): Promise<{
  db: AppDb;
  dialect: "sqlite" | "postgres";
  close: () => Promise<void>;
}> {
  if (isPostgresUrl(databaseUrl)) {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    await pool.query(POSTGRES_DDL);

    const db = drizzle(
      async (sql, params, method) => {
        const pgSql = toPgPlaceholders(sql);
        const bound = normalizeParams(params);
        if (method === "run") {
          await pool.query(pgSql, bound);
          return { rows: [] };
        }
        const res = await pool.query({
          text: pgSql,
          values: bound,
          rowMode: "array",
        });
        if (method === "get") {
          return { rows: (res.rows[0] ?? undefined) as unknown[] };
        }
        return { rows: res.rows as unknown[][] };
      },
      { schema }
    );

    return {
      db,
      dialect: "postgres",
      close: async () => {
        await pool.end();
      },
    };
  }

  const sqlitePath = resolveSqlitePath(databaseUrl);
  const sqlite = new DatabaseSync(sqlitePath);
  sqlite.exec(SQLITE_DDL);

  // Safe additive migrations for pre-existing local SQLite databases
  const snapCols = sqlite
    .prepare("PRAGMA table_info(document_snapshots)")
    .all() as Array<{ name: string }>;
  const snapColNames = new Set(snapCols.map((c) => c.name));
  if (!snapColNames.has("message")) {
    sqlite.exec("ALTER TABLE document_snapshots ADD COLUMN message TEXT");
  }
  if (!snapColNames.has("is_checkpoint")) {
    sqlite.exec(
      "ALTER TABLE document_snapshots ADD COLUMN is_checkpoint INTEGER NOT NULL DEFAULT 0"
    );
  }

  const userCols = sqlite
    .prepare("PRAGMA table_info(users)")
    .all() as Array<{ name: string }>;
  const userColNames = new Set(userCols.map((c) => c.name));
  if (!userColNames.has("system_role")) {
    sqlite.exec(
      "ALTER TABLE users ADD COLUMN system_role TEXT NOT NULL DEFAULT 'USER'"
    );
  }
  if (!userColNames.has("access_level")) {
    sqlite.exec(
      "ALTER TABLE users ADD COLUMN access_level TEXT NOT NULL DEFAULT 'FULL'"
    );
  }
  if (!userColNames.has("disabled")) {
    sqlite.exec(
      "ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0"
    );
  }
  if (!userColNames.has("auth_provider")) {
    sqlite.exec(
      "ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'local'"
    );
  }
  if (!userColNames.has("external_subject")) {
    sqlite.exec("ALTER TABLE users ADD COLUMN external_subject TEXT");
  }

  const wsCols = sqlite
    .prepare("PRAGMA table_info(workspaces)")
    .all() as Array<{ name: string }>;
  const wsColNames = new Set(wsCols.map((c) => c.name));
  if (!wsColNames.has("toolchain_id")) {
    sqlite.exec("ALTER TABLE workspaces ADD COLUMN toolchain_id TEXT");
  }
  if (!wsColNames.has("department_id")) {
    sqlite.exec("ALTER TABLE workspaces ADD COLUMN department_id TEXT");
  }

  const db = drizzle(
    async (sql, params, method) => {
      const stmt = sqlite.prepare(sql);
      const bound = normalizeParams(params);
      if (method === "run") {
        stmt.run(...bound);
        return { rows: [] };
      }
      stmt.setReturnArrays(true);
      if (method === "get") {
        const row = stmt.get(...bound) as unknown[] | undefined;
        return { rows: (row ?? undefined) as unknown[] };
      }
      const rows = stmt.all(...bound) as unknown as unknown[][];
      return { rows };
    },
    { schema }
  );

  return {
    db,
    dialect: "sqlite",
    close: async () => {
      sqlite.close();
    },
  };
}
