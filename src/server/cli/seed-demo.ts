import { config } from "../config.js";
import { getDb, migrate } from "../db.js";
import { seedDemo } from "../services/demo-seed.js";

/**
 * Popola l'ambiente con dati dimostrativi inventati e coerenti.
 * Vietato in produzione: serve solo a mostrare l'applicazione.
 */
if (config.isProduction) {
  console.error("Il seed demo non può essere eseguito con NODE_ENV=production.");
  process.exit(1);
}

const db = getDb();
await migrate(db);
const result = await seedDemo(db);

console.log("Dati dimostrativi creati: nessun dato reale, tutto marcato [DEMO].");
console.log("");
console.log(`Account demo: ${result.email}`);
console.log(`Password demo: ${result.password}`);
console.log("");
console.log("Contenuto creato:");
for (const [voce, valore] of Object.entries(result.conteggi)) {
  console.log(`  ${voce.padEnd(14)} ${valore}`);
}
console.log("");
console.log("I documenti sono scaricabili solo dopo l'accesso, dall'archivio privato.");
await db.close();
