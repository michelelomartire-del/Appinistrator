import readline from "node:readline/promises";
import { getDb, migrate, uuid } from "../db.js";
import { audit } from "../audit.js";
import {
  generatePassword,
  hashPassword,
  passwordPolicyIssues,
} from "../security.js";

/**
 * Crea (o reimposta) l'account amministratore iniziale.
 * Non esiste registrazione pubblica: l'account si crea solo da CLI sul server.
 *
 * Uso: npm run admin:create -- --email nome@studio.it --nome Francesca --cognome Rossi [--password ...]
 * Se --password è omessa viene generata una password monouso da consegnare a mano.
 */
const args = process.argv.slice(2);
function arg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

const db = getDb();
await migrate(db);

const email = (arg("email") ?? process.env.ADMIN_EMAIL ?? "")
  .trim()
  .toLowerCase();
const nome = arg("nome") ?? process.env.ADMIN_NOME ?? "";
const cognome = arg("cognome") ?? process.env.ADMIN_COGNOME ?? "";
let password = arg("password") ?? process.env.ADMIN_PASSWORD;

if (!email || !nome || !cognome) {
  console.error(
    "Uso: npm run admin:create -- --email <email> --nome <nome> --cognome <cognome> [--password <password>]",
  );
  await db.close();
  process.exit(1);
}
if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) {
  console.error("Email non valida.");
  await db.close();
  process.exit(1);
}

if (!password) {
  password = generatePassword(22);
  console.log("Password generata (monouso):");
  console.log(`  ${password}`);
  console.log(
    "Consegnarla all’amministratore tramite un canale sicuro; non verrà mostrata di nuovo.",
  );
}

const issues = passwordPolicyIssues(password);
if (issues.length > 0) {
  console.error(`Password non conforme: serve ${issues.join(", ")}.`);
  await db.close();
  process.exit(1);
}

const existing = await db.query<{ id: string }>(
  "select id from users where lower(email) = lower($1)",
  [email],
);
const hash = await hashPassword(password);
const userId = existing[0]?.id ?? uuid();
const passwordChanged = Boolean(existing[0]);

await db.transaction(async (tx) => {
  if (passwordChanged) {
    await tx.query(
      `update users set nome = $2, cognome = $3, password_hash = $4, attivo = true,
         must_change_password = true, failed_attempts = 0, locked_until = null, updated_at = now()
       where id = $1`,
      [userId, nome, cognome, hash],
    );
    await tx.query("delete from sessions where user_id = $1", [userId]);
  } else {
    await tx.query(
      `insert into users (id, email, nome, cognome, password_hash, ruolo, must_change_password)
       values ($1,$2,$3,$4,$5,'amministratore',true)`,
      [userId, email, nome, cognome, hash],
    );
  }
  await audit(tx, {
    userId,
    attoreEmail: email,
    azione: passwordChanged ? "admin_password_reimpostata" : "admin_creato",
    entitaTipo: "user",
    entitaId: userId,
    descrizione: passwordChanged
      ? "Password dell’account amministratore reimpostata da CLI"
      : "Creato account amministratore da CLI",
  });
});

console.log(
  `Account amministratore ${passwordChanged ? "aggiornato" : "creato"}: ${email}`,
);
console.log(
  "Al primo accesso viene richiesto il cambio password e la configurazione della MFA.",
);
await db.close();
void readline;
