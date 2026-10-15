import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

let schemaEnsured = false;

const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS projects (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    title text NOT NULL,
    idea text NOT NULL,
    status text DEFAULT 'draft' NOT NULL,
    spec_json text DEFAULT '{}' NOT NULL,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS projects_user_updated_idx ON projects (user_id, updated_at)`,
  `CREATE TABLE IF NOT EXISTS documents (
    id text PRIMARY KEY NOT NULL,
    project_id text NOT NULL,
    name text NOT NULL,
    content text DEFAULT '' NOT NULL,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS documents_project_idx ON documents (project_id)`,
];

export async function ensureSchema(d1?: D1Database) {
  if (schemaEnsured) return;
  const target = d1 || env?.DB;
  if (!target || typeof target.prepare !== "function") return;
  try {
    for (const sql of DDL_STATEMENTS) {
      await target.prepare(sql).run();
    }
    schemaEnsured = true;
  } catch (err) {
    console.warn("Could not ensure D1 schema:", err);
  }
}

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}
