import { getDb, migrate } from "../db.js";
import { audit } from "../audit.js";

/**
 * Disattiva la MFA di un account (recupero in caso di perdita del dispositivo).
 * Solo da server: richiede accesso alla macchina e al database.
 *
 * Uso: npm run admin:reset-mfa -- --email nome@studio.it
 */
const args = process.argv.slice(2);
const idx = args.indexOf("--email");
const email = idx >= 0 ? args[idx + 1] : process.env.ADMIN_EMAIL;

if (!email) {
  console.error("Uso: npm run admin:reset-mfa -- --email <email>");
  process.exit(1);
}

const db = getDb();
await migrate(db);
const rows = await db.query<{ id: string; email: string }>(
  "select id, email from users where lower(email) = lower($1)",
  [email],
);
if (!rows[0]) {
  console.error("Account non trovato.");
  await db.close();
  process.exit(1);
}
await db.transaction(async (tx) => {
  await tx.query(
    `update users set mfa_enabled = false, mfa_secret_cifrato = null, mfa_last_counter = null, updated_at = now() where id = $1`,
    [rows[0]!.id],
  );
  await tx.query("delete from sessions where user_id = $1", [rows[0]!.id]);
  await audit(tx, {
    userId: rows[0]!.id,
    attoreEmail: rows[0]!.email,
    azione: "mfa_reimpostata",
    entitaTipo: "user",
    entitaId: rows[0]!.id,
    descrizione:
      "MFA disattivata da CLI per recupero accesso; sessioni revocate",
  });
});
console.log(
  `MFA disattivata per ${rows[0]!.email}. Al prossimo accesso riconfigurala dalle impostazioni.`,
);
await db.close();
