import { config } from "../config.js";
import { getDb, migrate } from "../db.js";
import { seedDemo } from "../services/demo-seed.js";

if (config.isProduction) {
  console.error(
    "Il seed demo non può essere eseguito con NODE_ENV=production.",
  );
  process.exit(1);
}

const db = getDb();
await migrate(db);
const result = await seedDemo(db);
console.log(
  "Dati dimostrativi creati (tutti marcati [DEMO], nessun dato reale).",
);
console.log(`Account demo: ${result.email}`);
console.log(`Password demo: ${config.demoAdmin.password}`);
console.log(
  "Accedi, poi cambia la password se l’ambiente non è più solo dimostrativo.",
);
await db.close();
