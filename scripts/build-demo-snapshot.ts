/**
 * Genera lo snapshot della demo statica.
 *
 * Avvia un PostgreSQL in memoria (PGlite), applica le migrazioni, esegue il seed
 * dimostrativo, interroga l'API reale e salva le risposte in `src/demo/snapshot.json`.
 * I documenti generati dal seed vengono copiati in `public/demo-docs/`.
 *
 * In questo modo la demo su Vercel mostra esattamente le stesse strutture dati
 * dell'applicazione, senza backend: nessuna forma di risposta duplicata a mano.
 *
 * Uso: npm run demo:snapshot
 */
import fs from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { config } from "../src/server/config.js";
import { createApp } from "../src/server/app.js";
import { createDb, migrate, setDb } from "../src/server/db.js";
import { seedDemo } from "../src/server/services/demo-seed.js";

const ROOT = process.cwd();
const OUT_JSON = path.join(ROOT, "src/demo/snapshot.json");
const DOCS_DIR = path.join(ROOT, "public/demo-docs");

type Snapshot = {
  generatoIl: string;
  note: string;
  dashboard: unknown;
  liste: Record<string, unknown>;
  dettagli: Record<string, Record<string, unknown>>;
  extra: Record<string, unknown>;
  documenti: Record<string, { url: string; nomeFile: string; mime: string; dimensione: number }>;
};

const db = createDb({ memory: true });
await migrate(db);
setDb(db);
const seed = await seedDemo(db);
const app = createApp({ serveStatic: false });

const agent = request.agent(app);
const login = await agent
  .post("/api/auth/login")
  .send({ email: seed.email, password: seed.password });
if (login.status !== 200) {
  throw new Error(`Login demo fallito: ${login.status} ${JSON.stringify(login.body)}`);
}

async function get<T>(url: string): Promise<T> {
  const response = await agent.get(url);
  if (response.status !== 200) {
    throw new Error(`${url} → ${response.status} ${JSON.stringify(response.body).slice(0, 300)}`);
  }
  return response.body as T;
}

type Row = Record<string, unknown>;

const dashboard = await get<Row>("/api/dashboard");
const condomini = await get<{ items: Row[] }>("/api/condomini?perPage=100&page=1");
const persone = await get<{ items: Row[] }>("/api/persone?perPage=100&page=1");
const segnalazioni = await get<{ items: Row[] }>("/api/segnalazioni?perPage=100&page=1");
const assemblee = await get<{ items: Row[] }>("/api/assemblee?perPage=100&page=1");
const periodi = await get<{ items: Row[] }>("/api/rendiconti/periodi?perPage=100&page=1");
const consumi = await get<{ items: Row[] }>("/api/consumi?perPage=100&page=1");
const attivita = await get<{ items: Row[] }>("/api/attivita?perPage=100&page=1");
const documenti = await get<{ items: Row[]; total: number }>("/api/documenti?perPage=100");
const importazioni = await get<{ items: Row[] }>("/api/import?perPage=50&page=1");
const templates = await get<Row>("/api/import/templates");
const stato = await get<Row>("/api/admin/stato");
const audit = await get<Row>("/api/admin/audit?perPage=50&page=1");

// Archiviare un condominio non toglie nulla dai dati della demo: le liste
// includono solo i non archiviati, quindi leggiamo anche quelli archiviati.
const opzioni = await get<Row>("/api/condomini/options");

const dettagli: Snapshot["dettagli"] = {
  condomini: {},
  persone: {},
  segnalazioni: {},
  assemblee: {},
  periodi: {},
  consumi: {},
};

for (const item of condomini.items) {
  dettagli.condomini![String(item.id)] = await get(`/api/condomini/${item.id}`);
}
for (const item of persone.items) {
  dettagli.persone![String(item.id)] = await get(`/api/persone/${item.id}`);
}
for (const item of segnalazioni.items) {
  dettagli.segnalazioni![String(item.id)] = await get(`/api/segnalazioni/${item.id}`);
}
for (const item of assemblee.items) {
  dettagli.assemblee![String(item.id)] = await get(`/api/assemblee/${item.id}`);
}
for (const item of periodi.items) {
  dettagli.periodi![String(item.id)] = await get(`/api/rendiconti/periodi/${item.id}`);
}
for (const item of consumi.items) {
  dettagli.consumi![String(item.id)] = await get(`/api/consumi/${item.id}`);
}

// --- Documenti: copia dei file generati dal seed ---------------------------
await fs.rm(DOCS_DIR, { recursive: true, force: true });
await fs.mkdir(DOCS_DIR, { recursive: true });

const righe = await db.query<{
  id: string;
  nome_file: string;
  mime: string;
  dimensione: string;
  storage_key: string;
}>("select id, nome_file, mime, dimensione, storage_key from documenti order by created_at");

const mappaDocumenti: Snapshot["documenti"] = {};
for (const documento of righe) {
  const sorgente = path.join(config.storage.localDir, documento.storage_key);
  const estensione = path.extname(documento.nome_file) || ".bin";
  const nomeFile = `doc-${Object.keys(mappaDocumenti).length + 1}${estensione}`;
  try {
    await fs.copyFile(sorgente, path.join(DOCS_DIR, nomeFile));
  } catch (error) {
    process.stderr.write(`[demo] file non copiato ${documento.nome_file}: ${(error as Error).message}\n`);
    continue;
  }
  mappaDocumenti[documento.id] = {
    url: `/demo-docs/${nomeFile}`,
    nomeFile: documento.nome_file,
    mime: documento.mime,
    dimensione: Number(documento.dimensione),
  };
}

// --- Template XLSX: copiati per il download dalla demo -----------------------
const TEMPLATES_SRC = path.join(ROOT, "templates");
const TEMPLATES_DEST = path.join(ROOT, "public/demo-templates");
await fs.rm(TEMPLATES_DEST, { recursive: true, force: true });
await fs.mkdir(TEMPLATES_DEST, { recursive: true });
try {
  for (const file of await fs.readdir(TEMPLATES_SRC)) {
    if (!file.endsWith(".xlsx")) continue;
    await fs.copyFile(path.join(TEMPLATES_SRC, file), path.join(TEMPLATES_DEST, file));
  }
} catch (error) {
  process.stderr.write(`[demo] template non copiati: ${(error as Error).message}\n`);
}

const snapshot: Snapshot = {
  generatoIl: new Date().toISOString(),
  note:
    "Snapshot dimostrativo generato dall'API reale su dati inventati. " +
    "Non contiene dati di persone o condomini reali.",
  dashboard,
  liste: {
    condomini: condomini.items,
    persone: persone.items,
    segnalazioni: segnalazioni.items,
    assemblee: assemblee.items,
    periodi: periodi.items,
    consumi: consumi.items,
    attivita: attivita.items,
    documenti: documenti.items,
    importazioni: importazioni.items,
  },
  dettagli,
  extra: { templates, stato, audit, opzioni },
  documenti: mappaDocumenti,
};

await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
await fs.writeFile(OUT_JSON, `${JSON.stringify(snapshot, null, 1)}\n`, "utf8");

const dimensione = (await fs.stat(OUT_JSON)).size;
console.log(`Snapshot demo scritto: ${path.relative(ROOT, OUT_JSON)} (${(dimensione / 1024).toFixed(0)} kB)`);
console.log(`Documenti copiati: ${Object.keys(mappaDocumenti).length} in public/demo-docs/`);
for (const [tipo, elenco] of Object.entries(snapshot.liste)) {
  console.log(`  ${tipo.padEnd(14)} ${(elenco as unknown[]).length}`);
}
await db.close();
