import { config } from "../config.js";
import { getDb, migrate } from "../db.js";

const db = getDb();
const applied = await migrate(db);
if (applied.length === 0) {
  console.log(`Database ${db.kind}: nessuna migrazione da applicare.`);
} else {
  console.log(`Database ${db.kind}: applicate ${applied.length} migrazioni`);
  for (const file of applied) console.log(`  - ${file}`);
}
if (db.kind === "pglite") {
  console.log(`Directory dati: ${config.dataDir}`);
}
await db.close();
