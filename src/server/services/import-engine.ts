import ExcelJS from "exceljs";
import { parse as parseCsv } from "csv-parse/sync";
import { getDb, uuid, type Queryable } from "../db.js";
import { audit } from "../audit.js";
import { HttpError } from "../http.js";
import {
  IMPORT_TEMPLATES,
  resolveColumns,
  type ImportTemplate,
} from "./import-templates.js";
import type { ImportTipo } from "../../shared/constants.js";
import type {
  ImportPreview,
  ImportPreviewRow,
} from "../../shared/api-types.js";

const MAX_ROWS = 5000;
const PREVIEW_ROWS = 200;

export type ParsedTable = { headers: string[]; rows: string[][] };

/** Legge CSV o XLSX in memoria; il file non viene mai salvato su disco. */
export async function parseTabularFile(
  buffer: Buffer,
  filename: string,
): Promise<ParsedTable> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet)
      throw new HttpError(400, "Il file non contiene fogli di lavoro", {
        code: "file_vuoto",
      });
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values: string[] = [];
      for (let i = 1; i <= Math.min(row.cellCount, 60); i++) {
        const cell = row.getCell(i);
        values.push(cellText(cell.value));
      }
      rows.push(values);
    });
    const headers = (rows.shift() ?? []).map((h) => h.trim());
    return { headers, rows: dedupeTrailing(rows) };
  }
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
    const firstLine = text.split(/\r?\n/)[0] ?? "";
    const delimiter =
      countChar(firstLine, ";") >= countChar(firstLine, ",") ? ";" : ",";
    const records = parseCsv(text, {
      delimiter,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as string[][];
    const headers = (records.shift() ?? []).map((h) => String(h ?? "").trim());
    return {
      headers,
      rows: dedupeTrailing(
        records.map((r) => r.map((v) => String(v ?? "").trim())),
      ),
    };
  }
  throw new HttpError(
    400,
    "Formato non supportato: carica un file .csv o .xlsx",
    { code: "formato_non_supportato" },
  );
}

function dedupeTrailing(rows: string[][]): string[][] {
  return rows.filter((row) => row.some((cell) => cell.trim() !== ""));
}

function countChar(value: string, char: string): number {
  return value.split(char).length - 1;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "object") {
    if (
      "text" in value &&
      typeof (value as { text: unknown }).text === "string"
    ) {
      return (value as { text: string }).text;
    }
    if ("result" in value) {
      const result = (value as { result: unknown }).result;
      return result === null || result === undefined ? "" : String(result);
    }
    if ("richText" in value) {
      return (value as { richText: Array<{ text: string }> }).richText
        .map((r) => r.text)
        .join("");
    }
    if ("hyperlink" in value)
      return String((value as { hyperlink: string }).hyperlink);
  }
  return String(value);
}

/* ------------------------------------------------------------------------- */
/* Validazione delle righe                                                   */
/* ------------------------------------------------------------------------- */

function normalizeEnumValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function parseItalianDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return validDate(match[1]!, match[2]!, match[3]!);
  match = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (match)
    return validDate(
      match[3]!,
      match[2]!.padStart(2, "0"),
      match[1]!.padStart(2, "0"),
    );
  return null;
}

function validDate(year: string, month: string, day: string): string | null {
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10) === iso ? iso : null;
}

export function parseNumber(value: string): number | null {
  const trimmed = value.replace(/\s/g, "").replace(/€/g, "");
  if (!trimmed) return null;
  // formato italiano 1.234,56 oppure 1234.56
  let normalized = trimmed;
  if (trimmed.includes(",") && trimmed.includes(".")) {
    if (trimmed.lastIndexOf(",") > trimmed.lastIndexOf(".")) {
      normalized = trimmed.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = trimmed.replace(/,/g, "");
    }
  } else if (trimmed.includes(",")) {
    normalized = trimmed.replace(",", ".");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export type RowIssue = { campo?: string; messaggio: string };

export type ValidatedRow = {
  numeroRiga: number;
  dati: Record<string, string>;
  valori: Record<string, unknown>;
  errori: RowIssue[];
  avvisi: RowIssue[];
};

/** Valida una riga secondo il template; non tocca il database. */
export function validateRow(
  template: ImportTemplate,
  raw: Record<string, string>,
  numeroRiga: number,
): ValidatedRow {
  const errori: RowIssue[] = [];
  const avvisi: RowIssue[] = [];
  const valori: Record<string, unknown> = {};

  for (const column of template.columns) {
    const value = (raw[column.key] ?? "").trim();
    if (!value) {
      if (column.required)
        errori.push({
          campo: column.key,
          messaggio: `Campo obbligatorio “${column.label}” mancante`,
        });
      valori[column.key] = null;
      continue;
    }
    if (column.kind === "text") {
      if (column.maxLength && value.length > column.maxLength) {
        errori.push({
          campo: column.key,
          messaggio: `“${column.label}”: massimo ${column.maxLength} caratteri`,
        });
      }
      valori[column.key] = value;
    } else if (column.kind === "date") {
      const iso = parseItalianDate(value);
      if (!iso)
        errori.push({
          campo: column.key,
          messaggio: `“${column.label}”: data non valida (${value})`,
        });
      valori[column.key] = iso;
    } else if (column.kind === "number" || column.kind === "millesimi") {
      const n = parseNumber(value);
      if (n === null)
        errori.push({
          campo: column.key,
          messaggio: `“${column.label}”: numero non valido (${value})`,
        });
      else if (n < 0)
        errori.push({
          campo: column.key,
          messaggio: `“${column.label}”: il valore non può essere negativo`,
        });
      else if (column.kind === "millesimi" && n > 1000) {
        errori.push({
          campo: column.key,
          messaggio: `“${column.label}”: i millesimi non possono superare 1000`,
        });
      }
      valori[column.key] = n;
    } else if (column.kind === "enum") {
      const normalized = normalizeEnumValue(value);
      const allowed = column.enumValues ?? [];
      if (!allowed.includes(normalized)) {
        errori.push({
          campo: column.key,
          messaggio: `“${column.label}”: valore non ammesso “${value}” (ammessi: ${allowed.join(", ")})`,
        });
      }
      valori[column.key] = normalized;
    }
  }

  // controlli incrociati
  if (template.tipo === "persone") {
    if (valori.unita_identificativo && !valori.condominio_codice) {
      errori.push({
        campo: "unita_identificativo",
        messaggio: "Per collegare un’unità serve il codice condominio",
      });
    }
  }
  if (
    template.tipo === "segnalazioni" &&
    valori.scadenza &&
    valori.data_apertura
  ) {
    if (String(valori.scadenza) < String(valori.data_apertura)) {
      avvisi.push({
        campo: "scadenza",
        messaggio: "La scadenza precede la data di apertura",
      });
    }
  }
  if (template.tipo === "consumi") {
    if (
      valori.periodo_da &&
      valori.periodo_a &&
      String(valori.periodo_a) < String(valori.periodo_da)
    ) {
      errori.push({
        campo: "periodo_a",
        messaggio: "La fine del periodo precede l’inizio",
      });
    }
  }

  return { numeroRiga, dati: raw, valori, errori, avvisi };
}

/* ------------------------------------------------------------------------- */
/* Rilevamento duplicati                                                     */
/* ------------------------------------------------------------------------- */

type DupIndexes = {
  condominiByCf: Set<string>;
  condominiByDenomComune: Set<string>;
  condominiCodici: Map<string, string>;
  personeByCf: Set<string>;
  personeByNomeEmail: Set<string>;
  unitaKeys: Set<string>;
  segnalazioniKeys: Set<string>;
  consumiKeys: Set<string>;
};

async function loadDupIndexes(db: Queryable): Promise<DupIndexes> {
  const condomini = await db.query<{
    id: string;
    codice: string;
    denominazione: string;
    comune: string | null;
    codice_fiscale: string | null;
  }>("select id, codice, denominazione, comune, codice_fiscale from condomini");
  const persone = await db.query<{
    codice_fiscale: string | null;
    nome: string;
    cognome: string;
    email: string | null;
  }>("select codice_fiscale, nome, cognome, email from persone");
  const unita = await db.query<{
    condominio_id: string;
    identificativo: string;
  }>(
    "select condominio_id, identificativo from unita where archiviato = false",
  );
  const segnalazioni = await db.query<{
    condominio_id: string;
    titolo: string;
    data_apertura: string;
  }>("select condominio_id, titolo, data_apertura from segnalazioni");
  const consumi = await db.query<{
    condominio_id: string;
    categoria: string;
    periodo_da: string;
    periodo_a: string;
  }>("select condominio_id, categoria, periodo_da, periodo_a from consumi");
  const codici = new Map<string, string>();
  for (const c of condomini) codici.set(c.codice.toLowerCase(), c.id);
  return {
    condominiByCf: new Set(
      condomini
        .filter((c) => c.codice_fiscale)
        .map((c) => c.codice_fiscale!.toUpperCase()),
    ),
    condominiByDenomComune: new Set(
      condomini.map(
        (c) =>
          `${c.denominazione.toLowerCase()}|${(c.comune ?? "").toLowerCase()}`,
      ),
    ),
    condominiCodici: codici,
    personeByCf: new Set(
      persone
        .filter((p) => p.codice_fiscale)
        .map((p) => p.codice_fiscale!.toUpperCase()),
    ),
    personeByNomeEmail: new Set(
      persone.map(
        (p) =>
          `${p.nome.toLowerCase()}|${p.cognome.toLowerCase()}|${(p.email ?? "").toLowerCase()}`,
      ),
    ),
    unitaKeys: new Set(
      unita.map((u) => `${u.condominio_id}|${u.identificativo.toLowerCase()}`),
    ),
    segnalazioniKeys: new Set(
      segnalazioni.map(
        (s) =>
          `${s.condominio_id}|${s.titolo.toLowerCase()}|${String(s.data_apertura).slice(0, 10)}`,
      ),
    ),
    consumiKeys: new Set(
      consumi.map(
        (c) =>
          `${c.condominio_id}|${c.categoria}|${String(c.periodo_da).slice(0, 10)}|${String(c.periodo_a).slice(0, 10)}`,
      ),
    ),
  };
}

function dupKeyForRow(
  tipo: ImportTipo,
  valori: Record<string, unknown>,
  indexes: DupIndexes,
): { tipo: string; riferimento: string } | null {
  if (tipo === "condomini") {
    const cf = (valori.codice_fiscale as string | null)?.toUpperCase();
    if (cf && indexes.condominiByCf.has(cf))
      return { tipo: "codice_fiscale", riferimento: cf };
    const key = `${String(valori.denominazione ?? "").toLowerCase()}|${String(valori.comune ?? "").toLowerCase()}`;
    if (indexes.condominiByDenomComune.has(key)) {
      return {
        tipo: "denominazione+comune",
        riferimento: String(valori.denominazione ?? ""),
      };
    }
    return null;
  }
  if (tipo === "persone") {
    const cf = (valori.codice_fiscale as string | null)?.toUpperCase();
    if (cf && indexes.personeByCf.has(cf))
      return { tipo: "codice_fiscale", riferimento: cf };
    const key = `${String(valori.nome ?? "").toLowerCase()}|${String(valori.cognome ?? "").toLowerCase()}|${String(valori.email ?? "").toLowerCase()}`;
    if (indexes.personeByNomeEmail.has(key))
      return {
        tipo: "nome+cognome+email",
        riferimento: `${valori.nome} ${valori.cognome}`,
      };
    return null;
  }
  if (tipo === "unita") {
    const condominioId = indexes.condominiCodici.get(
      String(valori.condominio_codice ?? "").toLowerCase(),
    );
    if (!condominioId) return null;
    const key = `${condominioId}|${String(valori.identificativo ?? "").toLowerCase()}`;
    if (indexes.unitaKeys.has(key))
      return {
        tipo: "condominio+identificativo",
        riferimento: String(valori.identificativo),
      };
    return null;
  }
  if (tipo === "segnalazioni") {
    const condominioId = indexes.condominiCodici.get(
      String(valori.condominio_codice ?? "").toLowerCase(),
    );
    if (!condominioId || !valori.data_apertura) return null;
    const key = `${condominioId}|${String(valori.titolo ?? "").toLowerCase()}|${String(valori.data_apertura)}`;
    if (indexes.segnalazioniKeys.has(key))
      return {
        tipo: "condominio+titolo+data",
        riferimento: String(valori.titolo),
      };
    return null;
  }
  if (tipo === "consumi") {
    const condominioId = indexes.condominiCodici.get(
      String(valori.condominio_codice ?? "").toLowerCase(),
    );
    if (!condominioId) return null;
    const key = `${condominioId}|${String(valori.categoria ?? "")}|${String(valori.periodo_da ?? "")}|${String(valori.periodo_a ?? "")}`;
    if (indexes.consumiKeys.has(key))
      return {
        tipo: "condominio+categoria+periodo",
        riferimento: String(valori.categoria),
      };
    return null;
  }
  return null;
}

/* ------------------------------------------------------------------------- */
/* Anteprima                                                                 */
/* ------------------------------------------------------------------------- */

export async function createImportPreview(input: {
  tipo: ImportTipo;
  nomeFile: string;
  buffer: Buffer;
  hashFile: string;
  userId: string;
}): Promise<ImportPreview> {
  const template = IMPORT_TEMPLATES[input.tipo];
  const table = await parseTabularFile(input.buffer, input.nomeFile);
  if (table.rows.length === 0) {
    throw new HttpError(400, "Il file non contiene righe di dati", {
      code: "file_vuoto",
    });
  }
  const { mapping, riconosciute, ignorate, mancanti } = resolveColumns(
    input.tipo,
    table.headers,
  );
  if (mancanti.length > 0) {
    throw new HttpError(
      400,
      `Colonne obbligatorie mancanti: ${mancanti.join(", ")}`,
      {
        code: "colonne_mancanti",
        errors: { colonne: mancanti.join(", ") },
      },
    );
  }

  const db = getDb();
  const indexes = await loadDupIndexes(db);
  const seenInFile = new Map<string, number>();
  const validated: Array<
    ValidatedRow & { duplicato: { tipo: string; riferimento: string } | null }
  > = [];

  for (let i = 0; i < Math.min(table.rows.length, MAX_ROWS); i++) {
    const cells = table.rows[i]!;
    const raw: Record<string, string> = {};
    for (const column of template.columns) {
      const header = mapping.get(column.key);
      const index = header ? table.headers.indexOf(header) : -1;
      raw[column.key] = index >= 0 ? (cells[index] ?? "").trim() : "";
    }
    const validatedRow = validateRow(template, raw, i + 2); // +2: riga 1 è intestazione
    let duplicato =
      validatedRow.errori.length === 0
        ? dupKeyForRow(input.tipo, validatedRow.valori, indexes)
        : null;

    // duplicati interni al file
    if (!duplicato) {
      const key = JSON.stringify(
        template.dedupeKeys.map((group) =>
          group
            .map((field) =>
              String(validatedRow.valori[field] ?? "").toLowerCase(),
            )
            .join("|"),
        ),
      );
      const previous = seenInFile.get(key);
      if (previous !== undefined) {
        duplicato = {
          tipo: "riga_duplicata_nel_file",
          riferimento: `riga ${previous}`,
        };
      } else if (validatedRow.errori.length === 0) {
        seenInFile.set(key, validatedRow.numeroRiga);
      }
    }
    validated.push({ ...validatedRow, duplicato });
  }

  const batchId = uuid();
  const troncate = table.rows.length > MAX_ROWS;
  const valide = validated.filter(
    (r) => r.errori.length === 0 && !r.duplicato,
  ).length;
  const errori = validated.filter((r) => r.errori.length > 0).length;
  const duplicate = validated.filter(
    (r) => r.errori.length === 0 && r.duplicato,
  ).length;

  await db.transaction(async (tx) => {
    await tx.query(
      `insert into import_batches (id, tipo, nome_file, dimensione, hash_file, stato, righe_totali, righe_valide, righe_errori, righe_duplicate, riepilogo, created_by)
       values ($1,$2,$3,$4,$5,'anteprima',$6,$7,$8,$9,$10,$11)`,
      [
        batchId,
        input.tipo,
        input.nomeFile,
        input.buffer.length,
        input.hashFile,
        table.rows.length,
        valide,
        errori,
        duplicate,
        JSON.stringify({
          troncate,
          colonneIgnorate: ignorate,
          colonneMancanti: mancanti,
        }),
        input.userId,
      ],
    );
    for (const row of validated) {
      await tx.query(
        `insert into import_rows (id, batch_id, numero_riga, dati, errori, avvisi, duplicato, esito)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          uuid(),
          batchId,
          row.numeroRiga,
          JSON.stringify(row.dati),
          JSON.stringify(row.errori),
          JSON.stringify(row.avvisi),
          row.duplicato !== null,
          row.errori.length > 0
            ? "errore"
            : row.duplicato
              ? "duplicato"
              : "valida",
        ],
      );
    }
    await audit(tx, {
      userId: input.userId,
      azione: "import_anteprima",
      entitaTipo: "import",
      entitaId: batchId,
      descrizione: `Anteprima import ${input.tipo}: ${table.rows.length} righe (${valide} valide, ${errori} errori, ${duplicate} possibili duplicati)`,
    });
  });

  const righe: ImportPreviewRow[] = validated
    .slice(0, PREVIEW_ROWS)
    .map((row) => ({
      numeroRiga: row.numeroRiga,
      dati: row.dati,
      errori: row.errori,
      avvisi: row.avvisi,
      duplicato: row.duplicato,
      esito:
        row.errori.length > 0
          ? "errore"
          : row.duplicato
            ? "duplicato"
            : "valida",
    }));

  return {
    batchId,
    tipo: input.tipo,
    nomeFile: input.nomeFile,
    colonne: table.headers,
    colonneRiconosciute: riconosciute,
    colonneIgnorate: ignorate,
    colonneMancanti: mancanti,
    righe,
    riepilogo: {
      totali: table.rows.length,
      valide,
      errori,
      duplicate,
      troncate,
    },
  };
}

/* ------------------------------------------------------------------------- */
/* Commit                                                                    */
/* ------------------------------------------------------------------------- */

export type CommitResult = {
  batchId: string;
  importate: number;
  ignorate: number;
  errori: number;
};

export async function commitImport(input: {
  batchId: string;
  includiDuplicati: boolean;
  userId: string;
  userEmail: string;
  ipHash?: string;
}): Promise<CommitResult> {
  const db = getDb();
  const batchRows = await db.query<Record<string, unknown>>(
    "select * from import_batches where id = $1",
    [input.batchId],
  );
  const batch = batchRows[0];
  if (!batch)
    throw new HttpError(404, "Importazione non trovata", {
      code: "non_trovato",
    });
  if (batch.stato !== "anteprima") {
    throw new HttpError(
      409,
      `Questa importazione è già ${String(batch.stato)} e non può essere confermata.`,
      {
        code: "stato_non_valido",
      },
    );
  }
  const tipo = batch.tipo as ImportTipo;
  const rows = await db.query<Record<string, unknown>>(
    `select * from import_rows where batch_id = $1 and esito in ('valida','duplicato') order by numero_riga`,
    [input.batchId],
  );

  const indexes = await loadDupIndexes(db);
  let importate = 0;
  let ignorate = 0;

  await db.transaction(async (tx) => {
    for (const row of rows) {
      const esito = String(row.esito);
      const dati = row.dati as Record<string, string>;
      const validated = validateRow(
        IMPORT_TEMPLATES[tipo],
        dati,
        Number(row.numero_riga),
      );
      if (validated.errori.length > 0) {
        await tx.query(
          `update import_rows set esito = 'errore' where id = $1`,
          [row.id],
        );
        continue;
      }
      const duplicato = dupKeyForRow(tipo, validated.valori, indexes);
      if (duplicato && !(esito === "duplicato" && input.includiDuplicati)) {
        await tx.query(
          `update import_rows set esito = 'ignorata' where id = $1`,
          [row.id],
        );
        ignorate += 1;
        continue;
      }
      const entityId = await insertRow(
        tx,
        tipo,
        validated.valori,
        indexes,
        input.userId,
      );
      if (!entityId) {
        await tx.query(
          `update import_rows set esito = 'errore', errori = $2 where id = $1`,
          [
            row.id,
            JSON.stringify([
              { messaggio: "Riferimento non trovato in fase di salvataggio" },
            ]),
          ],
        );
        continue;
      }
      await tx.query(
        `update import_rows set esito = 'importata', entita_id = $2 where id = $1`,
        [row.id, entityId],
      );
      registerInIndexes(tipo, validated.valori, indexes, entityId);
      importate += 1;
    }
    await tx.query(
      `update import_batches set stato = 'completato', completato_at = now(), righe_valide = $2, righe_duplicate = $3
        where id = $1`,
      [input.batchId, importate, ignorate],
    );
    await audit(tx, {
      userId: input.userId,
      attoreEmail: input.userEmail,
      azione: "import_confermato",
      entitaTipo: "import",
      entitaId: input.batchId,
      descrizione: `Importazione ${tipo} confermata: ${importate} record creati, ${ignorate} duplicati ignorati`,
      ipHash: input.ipHash,
    });
  });

  return { batchId: input.batchId, importate, ignorate, errori: 0 };
}

function registerInIndexes(
  tipo: ImportTipo,
  valori: Record<string, unknown>,
  indexes: DupIndexes,
  entityId: string,
): void {
  if (tipo === "condomini") {
    const cf = (valori.codice_fiscale as string | null)?.toUpperCase();
    if (cf) indexes.condominiByCf.add(cf);
    indexes.condominiByDenomComune.add(
      `${String(valori.denominazione).toLowerCase()}|${String(valori.comune ?? "").toLowerCase()}`,
    );
    if (valori.codice_generato)
      indexes.condominiCodici.set(
        String(valori.codice_generato).toLowerCase(),
        entityId,
      );
  }
  if (tipo === "persone") {
    const cf = (valori.codice_fiscale as string | null)?.toUpperCase();
    if (cf) indexes.personeByCf.add(cf);
    indexes.personeByNomeEmail.add(
      `${String(valori.nome).toLowerCase()}|${String(valori.cognome).toLowerCase()}|${String(valori.email ?? "").toLowerCase()}`,
    );
  }
  const condominioId = valori.condominio_codice
    ? indexes.condominiCodici.get(
        String(valori.condominio_codice).toLowerCase(),
      )
    : undefined;
  if (tipo === "unita" && condominioId) {
    indexes.unitaKeys.add(
      `${condominioId}|${String(valori.identificativo).toLowerCase()}`,
    );
  }
  if (tipo === "segnalazioni" && condominioId) {
    indexes.segnalazioniKeys.add(
      `${condominioId}|${String(valori.titolo).toLowerCase()}|${String(valori.data_apertura ?? "")}`,
    );
  }
  if (tipo === "consumi" && condominioId) {
    indexes.consumiKeys.add(
      `${condominioId}|${String(valori.categoria)}|${String(valori.periodo_da)}|${String(valori.periodo_a)}`,
    );
  }
}

async function insertRow(
  tx: Queryable,
  tipo: ImportTipo,
  valori: Record<string, unknown>,
  indexes: DupIndexes,
  userId: string,
): Promise<string | null> {
  if (tipo === "condomini") {
    const id = uuid();
    const seq = await tx.query<{ n: string }>(
      "select nextval('condominio_codice_seq') as n",
    );
    const codice = `FB-${String(Number(seq[0]?.n ?? 1)).padStart(4, "0")}`;
    valori.codice_generato = codice;
    await tx.query(
      `insert into condomini (id, codice, denominazione, indirizzo, cap, comune, provincia, codice_fiscale, stato,
        data_inizio_incarico, data_fine_incarico, note, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,coalesce($9,'attivo'),$10,$11,$12,$13)`,
      [
        id,
        codice,
        String(valori.denominazione ?? ""),
        (valori.indirizzo as string) ?? null,
        (valori.cap as string) ?? null,
        (valori.comune as string) ?? null,
        (valori.provincia as string) ?? null,
        (valori.codice_fiscale as string) ?? null,
        (valori.stato as string) ?? null,
        (valori.data_inizio_incarico as string) ?? null,
        (valori.data_fine_incarico as string) ?? null,
        (valori.note as string) ?? null,
        userId,
      ],
    );
    return id;
  }

  if (tipo === "persone") {
    const id = uuid();
    await tx.query(
      `insert into persone (id, nome, cognome, codice_fiscale, email, telefono, note, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id,
        String(valori.nome ?? ""),
        String(valori.cognome ?? ""),
        (valori.codice_fiscale as string) ?? null,
        (valori.email as string) ?? null,
        (valori.telefono as string) ?? null,
        (valori.note as string) ?? null,
        userId,
      ],
    );
    const condominioCodice = String(
      valori.condominio_codice ?? "",
    ).toLowerCase();
    const condominioId = condominioCodice
      ? indexes.condominiCodici.get(condominioCodice)
      : undefined;
    if (condominioId) {
      await tx.query(
        `insert into condominio_persone (id, condominio_id, persona_id, ruolo)
         values ($1,$2,$3,$4) on conflict (condominio_id, persona_id, ruolo) do nothing`,
        [
          uuid(),
          condominioId,
          id,
          String(valori.ruolo_condominio ?? "condomino"),
        ],
      );
      const unitaIdentificativo = String(valori.unita_identificativo ?? "");
      if (unitaIdentificativo) {
        const unita = await tx.query<{ id: string }>(
          "select id from unita where condominio_id = $1 and lower(identificativo) = lower($2) and archiviato = false",
          [condominioId, unitaIdentificativo],
        );
        if (unita[0]) {
          await tx.query(
            `insert into unita_persone (id, unita_id, persona_id, titolo)
             values ($1,$2,$3,$4) on conflict (unita_id, persona_id, titolo) do nothing`,
            [
              uuid(),
              unita[0].id,
              id,
              String(valori.titolo_unita ?? "proprietario"),
            ],
          );
        }
      }
    }
    return id;
  }

  if (tipo === "unita") {
    const condominioId = indexes.condominiCodici.get(
      String(valori.condominio_codice ?? "").toLowerCase(),
    );
    if (!condominioId) return null;
    const id = uuid();
    await tx.query(
      `insert into unita (id, condominio_id, identificativo, piano, categoria, millesimi, millesimi_riscaldamento, note)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id,
        condominioId,
        String(valori.identificativo ?? ""),
        (valori.piano as string) ?? null,
        (valori.categoria as string) ?? null,
        (valori.millesimi as number) ?? null,
        (valori.millesimi_riscaldamento as number) ?? null,
        (valori.note as string) ?? null,
      ],
    );
    return id;
  }

  if (tipo === "segnalazioni") {
    const condominioId = indexes.condominiCodici.get(
      String(valori.condominio_codice ?? "").toLowerCase(),
    );
    if (!condominioId) return null;
    let unitaId: string | null = null;
    if (valori.unita_identificativo) {
      const unita = await tx.query<{ id: string }>(
        "select id from unita where condominio_id = $1 and lower(identificativo) = lower($2) and archiviato = false",
        [condominioId, String(valori.unita_identificativo)],
      );
      unitaId = unita[0]?.id ?? null;
    }
    const seq = await tx.query<{ n: string }>(
      "select nextval('segnalazione_codice_seq') as n",
    );
    const codice = `SG-${String(Number(seq[0]?.n ?? 1)).padStart(4, "0")}`;
    const id = uuid();
    const stato = String(valori.stato ?? "nuova");
    await tx.query(
      `insert into segnalazioni (id, codice, condominio_id, unita_id, area_comune, titolo, descrizione, categoria, priorita, stato,
          data_apertura, scadenza, referente, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,coalesce($8,'altro'),coalesce($9,'media'),$10,coalesce($11, current_date),$12,$13,$14)`,
      [
        id,
        codice,
        condominioId,
        unitaId,
        (valori.area_comune as string) ?? null,
        String(valori.titolo ?? ""),
        (valori.descrizione as string) ?? null,
        (valori.categoria as string) ?? null,
        (valori.priorita as string) ?? null,
        stato,
        (valori.data_apertura as string) ?? null,
        (valori.scadenza as string) ?? null,
        (valori.referente as string) ?? null,
        userId,
      ],
    );
    await tx.query(
      `insert into segnalazione_storico (id, segnalazione_id, da_stato, a_stato, nota, user_id)
       values ($1,$2,null,$3,'Importazione iniziale',$4)`,
      [uuid(), id, stato, userId],
    );
    return id;
  }

  if (tipo === "consumi") {
    const condominioId = indexes.condominiCodici.get(
      String(valori.condominio_codice ?? "").toLowerCase(),
    );
    if (!condominioId) return null;
    const id = uuid();
    await tx.query(
      `insert into consumi (id, condominio_id, categoria, periodo_da, periodo_a, valore, unita_misura, costo, fonte, origine, data_rilevazione, note, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,coalesce($10,'importato'),$11,$12,$13)`,
      [
        id,
        condominioId,
        String(valori.categoria ?? ""),
        String(valori.periodo_da ?? ""),
        String(valori.periodo_a ?? ""),
        Number(valori.valore ?? 0),
        String(valori.unita_misura ?? "altro"),
        (valori.costo as number) ?? null,
        (valori.fonte as string) ?? null,
        (valori.origine as string) ?? null,
        (valori.data_rilevazione as string) ?? null,
        (valori.note as string) ?? null,
        userId,
      ],
    );
    return id;
  }
  return null;
}

/* ------------------------------------------------------------------------- */
/* Annullamento                                                              */
/* ------------------------------------------------------------------------- */

export async function rollbackImport(input: {
  batchId: string;
  userId: string;
  userEmail: string;
  ipHash?: string;
}): Promise<{ eliminati: number }> {
  const db = getDb();
  const batchRows = await db.query<Record<string, unknown>>(
    "select * from import_batches where id = $1",
    [input.batchId],
  );
  const batch = batchRows[0];
  if (!batch)
    throw new HttpError(404, "Importazione non trovata", {
      code: "non_trovato",
    });
  if (batch.stato === "annullato") {
    throw new HttpError(409, "Questa importazione è già stata annullata", {
      code: "stato_non_valido",
    });
  }
  const tipo = batch.tipo as ImportTipo;

  // In anteprima: si scarta semplicemente.
  if (batch.stato === "anteprima") {
    await db.transaction(async (tx) => {
      await tx.query(
        `update import_batches set stato = 'annullato', completato_at = now() where id = $1`,
        [input.batchId],
      );
      await tx.query(`delete from import_rows where batch_id = $1`, [
        input.batchId,
      ]);
      await audit(tx, {
        userId: input.userId,
        attoreEmail: input.userEmail,
        azione: "import_scartato",
        entitaTipo: "import",
        entitaId: input.batchId,
        descrizione: "Anteprima di importazione scartata senza salvare dati",
        ipHash: input.ipHash,
      });
    });
    return { eliminati: 0 };
  }

  const imported = await db.query<{ entita_id: string }>(
    `select entita_id from import_rows where batch_id = $1 and esito = 'importata' and entita_id is not null`,
    [input.batchId],
  );

  // Sicurezza: non eliminare condomini che hanno già dati collegati non importati.
  if (tipo === "condomini") {
    for (const row of imported) {
      const deps = await db.query<{ count: string }>(
        `select (
           (select count(*) from unita where condominio_id = $1) +
           (select count(*) from segnalazioni where condominio_id = $1) +
           (select count(*) from assemblee where condominio_id = $1) +
           (select count(*) from periodi_contabili where condominio_id = $1) +
           (select count(*) from consumi where condominio_id = $1) +
           (select count(*) from documenti where condominio_id = $1)
         )::int as count`,
        [row.entita_id],
      );
      if (Number(deps[0]?.count ?? 0) > 0) {
        throw new HttpError(
          409,
          "Annullamento non possibile: alcuni condomini importati hanno già unità, segnalazioni, assemblee, rendiconti, consumi o documenti collegati. Rimuovi prima quei dati.",
          { code: "dipendenze_presenti" },
        );
      }
    }
  }

  let eliminati = 0;
  await db.transaction(async (tx) => {
    for (const row of imported) {
      const table = {
        condomini: "condomini",
        persone: "persone",
        unita: "unita",
        segnalazioni: "segnalazioni",
        consumi: "consumi",
      }[tipo];
      await tx.query(`delete from ${table} where id = $1`, [row.entita_id]);
      eliminati += 1;
    }
    await tx.query(
      `update import_batches set stato = 'annullato', completato_at = now() where id = $1`,
      [input.batchId],
    );
    await audit(tx, {
      userId: input.userId,
      attoreEmail: input.userEmail,
      azione: "import_annullato",
      entitaTipo: "import",
      entitaId: input.batchId,
      descrizione: `Annullata importazione ${tipo}: ${eliminati} record eliminati`,
      ipHash: input.ipHash,
    });
  });
  return { eliminati };
}
