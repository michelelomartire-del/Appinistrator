import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { config } from "./config.js";

const requireCjs = createRequire(import.meta.url);

/**
 * Astrazione minima del database.
 * - In produzione (DATABASE_URL) usa il driver `pg` su PostgreSQL.
 * - In sviluppo/demo usa PGlite (PostgreSQL embedded) per non richiedere servizi
 *   esterni; NON è pensato per dati reali multi-utente.
 *
 * Le query usano sempre parametri ($1, $2, ...) — mai interpolazione di stringhe.
 */
export interface Queryable {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  exec(sql: string): Promise<void>;
}

export interface Db extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  kind: "postgres" | "pglite";
}

class PgDb implements Db {
  kind = "postgres" as const;
  #pool: any;
  constructor(connectionString: string, ssl: boolean) {
    // import dinamico per non caricare pg quando non serve
    const { Pool } = requireCjs("pg") as typeof import("pg");
    this.#pool = new Pool({
      connectionString,
      ssl: ssl ? { rejectUnauthorized: true } : undefined,
      max: 10,
    });
  }
  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.#pool.query(sql, params);
    return res.rows as T[];
  }
  async exec(sql: string): Promise<void> {
    await this.#pool.query(sql);
  }
  async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
    const client = await this.#pool.connect();
    try {
      await client.query("begin");
      const tx: Queryable = {
        query: async (sql, params = []) =>
          (await client.query(sql, params)).rows,
        exec: async (sql) => {
          await client.query(sql);
        },
      };
      const result = await fn(tx);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  async close(): Promise<void> {
    await this.#pool.end();
  }
}

class PGliteDb implements Db {
  kind = "pglite" as const;
  #dbPromise: Promise<any>;
  constructor(options: { dir?: string; memory?: boolean }) {
    const { PGlite } = requireCjs(
      "@electric-sql/pglite",
    ) as typeof import("@electric-sql/pglite");
    if (options.memory) {
      this.#dbPromise = PGlite.create();
    } else {
      fs.mkdirSync(options.dir!, { recursive: true });
      this.#dbPromise = PGlite.create(options.dir!);
    }
  }
  async #db(): Promise<any> {
    return this.#dbPromise;
  }
  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const db = await this.#db();
    const res = await db.query(sql, params);
    return res.rows as T[];
  }
  async exec(sql: string): Promise<void> {
    const db = await this.#db();
    await db.exec(sql);
  }
  async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
    const db = await this.#db();
    return db.transaction(async (txRaw: any) => {
      const tx: Queryable = {
        query: async (sql, params = []) => {
          const res = await txRaw.query(sql, params);
          return res.rows;
        },
        exec: async (sql) => {
          await txRaw.exec(sql);
        },
      };
      return fn(tx);
    });
  }
  async close(): Promise<void> {
    const db = await this.#db();
    await db.close();
  }
}

let instance: Db | undefined;

export function createDb(options: { memory?: boolean; dir?: string } = {}): Db {
  if (config.databaseUrl) {
    return new PgDb(config.databaseUrl, config.databaseSsl);
  }
  if (options.memory) return new PGliteDb({ memory: true });
  return new PGliteDb({ dir: options.dir || path.join(config.dataDir, "db") });
}

export function getDb(): Db {
  if (!instance) instance = createDb();
  return instance;
}

export function setDb(db: Db): void {
  instance = db;
}

export function uuid(): string {
  return crypto.randomUUID();
}

/** Formatta un timestamp come stringa ISO (le date pure restano YYYY-MM-DD). */
export function toDateString(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

export function toIsoString(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** Applica le migrazioni SQL in ordine, in modo idempotente. */
export async function migrate(
  db: Db,
  dir = config.migrationsDir,
): Promise<string[]> {
  await db.exec(`create table if not exists schema_migrations (
    version text primary key,
    applied_at timestamptz not null default now()
  )`);
  const applied = new Set(
    (
      await db.query<{ version: string }>(
        "select version from schema_migrations",
      )
    ).map((r) => r.version),
  );
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const done: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query("insert into schema_migrations (version) values ($1)", [
        file,
      ]);
    });
    done.push(file);
  }
  return done;
}
