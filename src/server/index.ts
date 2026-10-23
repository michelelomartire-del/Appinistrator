import { config, validateProductionConfig, envFilePresent } from "./config.js";
import { getDb, migrate } from "./db.js";
import { createApp } from "./app.js";
import { storage } from "./services/storage.js";

async function main(): Promise<void> {
  const problems = validateProductionConfig();
  if (problems.length > 0) {
    for (const problem of problems)
      process.stderr.write(`[config] ${problem}\n`);
    process.exit(1);
  }

  const db = getDb();
  const applied = await migrate(db);
  if (applied.length > 0 && !config.isTest) {
    process.stdout.write(`[db] migrazioni applicate: ${applied.join(", ")}\n`);
  }
  await storage.init();

  if (!config.isProduction && !envFilePresent) {
    process.stdout.write(
      "[config] file .env assente: uso valori di default di sviluppo\n",
    );
  }

  const app = createApp();
  const server = app.listen(config.port, "0.0.0.0", () => {
    process.stdout.write(
      `[server] CRM EffeBi in ascolto su http://0.0.0.0:${config.port}\n`,
    );
    process.stdout.write(
      `[server] database: ${db.kind === "postgres" ? "postgresql" : "pglite (embedded, solo sviluppo)"}\n`,
    );
  });

  const shutdown = (signal: string) => {
    process.stdout.write(`[server] ricevuto ${signal}, chiusura in corso\n`);
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
  process.stderr.write(
    `[server] avvio fallito: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
