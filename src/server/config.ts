import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

export type NodeEnv = "development" | "production" | "test";

const envFileLoaded = loadDotEnvIfPresent();

/** Carica .env senza dipendenze esterne (solo in dev/test). */
function loadDotEnvIfPresent(): boolean {
  const file = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(file)) return false;
  const content = fs.readFileSync(file, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
  return true;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
}

const nodeEnv = (process.env.NODE_ENV ?? "development") as NodeEnv;
const isProduction = nodeEnv === "production";
const dataDir = path.resolve(process.cwd(), process.env.DATA_DIR || ".data");

let encryptionKey: string | undefined = process.env.APP_ENCRYPTION_KEY;
/** In sviluppo o test, se manca la chiave, ne generiamo una volatile (non adatta alla produzione). */
if (!encryptionKey) {
  if (isProduction) {
    // Segnalato in fase di avvio; non blocca l'import del modulo (così i test possono girare).
  } else {
    encryptionKey = crypto
      .createHash("sha256")
      .update("effebi-development-only-key")
      .digest("base64");
  }
}

export const config = {
  nodeEnv,
  isProduction,
  isTest: nodeEnv === "test",
  port: int(process.env.PORT, isProduction ? 4000 : 4000),
  appUrl: process.env.APP_URL || "http://localhost:4000",
  dataDir,
  databaseUrl: process.env.DATABASE_URL || undefined,
  databaseSsl: bool(process.env.DATABASE_SSL, false),
  sessionTtlHours: int(process.env.SESSION_TTL_HOURS, 8),
  trustProxy: int(process.env.TRUST_PROXY, isProduction ? 1 : 0),
  demoMode: bool(process.env.DEMO_MODE, !isProduction),
  encryptionKey,
  storage: {
    driver: (process.env.STORAGE_DRIVER || "local") as "local" | "supabase",
    localDir: path.join(dataDir, "documenti"),
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseBucket: process.env.SUPABASE_STORAGE_BUCKET || "documenti-crm",
  },
  demoAdmin: {
    email: process.env.DEMO_ADMIN_EMAIL || "demo@effebi.invalid",
    password: process.env.DEMO_ADMIN_PASSWORD || "EffeBi-Demo-2026!",
  },
  migrationsDir: path.resolve(
    process.cwd(),
    process.env.MIGRATIONS_DIR || "src/server/migrations",
  ),
} as const;

/** Controlli espliciti da eseguire all'avvio: in produzione niente configurazioni di comodo. */
export function validateProductionConfig(): string[] {
  const problems: string[] = [];
  if (!config.isProduction) return problems;
  if (!config.databaseUrl) {
    problems.push(
      "DATABASE_URL mancante: in produzione è richiesto PostgreSQL in regione UE (PGlite è solo per sviluppo).",
    );
  }
  if (!config.encryptionKey) {
    problems.push("APP_ENCRYPTION_KEY mancante.");
  }
  if (config.demoMode) {
    problems.push("DEMO_MODE deve essere disattivato in produzione.");
  }
  if (
    config.storage.driver === "supabase" &&
    (!config.storage.supabaseUrl || !config.storage.supabaseServiceKey)
  ) {
    problems.push(
      "STORAGE_DRIVER=supabase richiede SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  if (
    config.appUrl.startsWith("http://") &&
    !config.appUrl.includes("localhost")
  ) {
    problems.push("APP_URL deve usare https in produzione.");
  }
  return problems;
}

export const envFilePresent = envFileLoaded;
