import {
  CONDOMINIO_STATI,
  CONSUMO_CATEGORIE,
  CONSUMO_ORIGINI,
  RUOLI_PERSONA_CONDOMINIO,
  SEGNALAZIONE_CATEGORIE,
  SEGNALAZIONE_PRIORITA,
  SEGNALAZIONE_STATI,
  TITOLI_UNITA,
  UNITA_MISURA,
} from "../../shared/constants.js";
import type { ImportTipo } from "../../shared/constants.js";

export type ColumnKind = "text" | "date" | "number" | "enum" | "millesimi";

export type ColumnDef = {
  key: string;
  label: string;
  kind: ColumnKind;
  required?: boolean;
  enumValues?: readonly string[];
  maxLength?: number;
  aliases?: string[];
  help?: string;
};

export type ImportTemplate = {
  tipo: ImportTipo;
  label: string;
  description: string;
  columns: ColumnDef[];
  /** campi usati per rilevare possibili duplicati */
  dedupeKeys: string[][];
  /** il file può essere esportato da qui */
  entityLabel: string;
};

const condominioCodice: ColumnDef = {
  key: "condominio_codice",
  label: "Codice condominio",
  kind: "text",
  required: true,
  maxLength: 20,
  help: "Codice interno del condominio (es. FB-0001)",
};

export const IMPORT_TEMPLATES: Record<ImportTipo, ImportTemplate> = {
  condomini: {
    tipo: "condomini",
    label: "Condomini",
    entityLabel: "condominio",
    description:
      "Censisce i condomìni clienti. Il codice interno viene assegnato dal CRM.",
    dedupeKeys: [["codice_fiscale"], ["denominazione", "comune"]],
    columns: [
      {
        key: "denominazione",
        label: "Denominazione",
        kind: "text",
        required: true,
        maxLength: 200,
      },
      { key: "indirizzo", label: "Indirizzo", kind: "text", maxLength: 300 },
      { key: "cap", label: "CAP", kind: "text", maxLength: 5 },
      { key: "comune", label: "Comune", kind: "text", maxLength: 120 },
      {
        key: "provincia",
        label: "Provincia",
        kind: "text",
        maxLength: 2,
        help: "Sigla di 2 lettere",
      },
      {
        key: "codice_fiscale",
        label: "Codice fiscale",
        kind: "text",
        maxLength: 20,
        aliases: ["cf"],
      },
      {
        key: "stato",
        label: "Stato",
        kind: "enum",
        enumValues: CONDOMINIO_STATI,
        help: "potenziale | attivo | cessato",
      },
      {
        key: "data_inizio_incarico",
        label: "Data inizio incarico",
        kind: "date",
      },
      { key: "data_fine_incarico", label: "Data fine incarico", kind: "date" },
      { key: "note", label: "Note", kind: "text", maxLength: 4000 },
    ],
  },
  persone: {
    tipo: "persone",
    label: "Persone e contatti",
    entityLabel: "persona",
    description:
      "Censisce persone e, se indicate, le collega a un condominio e a un’unità esistenti. La persona viene creata una sola volta.",
    dedupeKeys: [["codice_fiscale"], ["nome", "cognome", "email"]],
    columns: [
      {
        key: "nome",
        label: "Nome",
        kind: "text",
        required: true,
        maxLength: 100,
      },
      {
        key: "cognome",
        label: "Cognome",
        kind: "text",
        required: true,
        maxLength: 100,
      },
      {
        key: "codice_fiscale",
        label: "Codice fiscale",
        kind: "text",
        maxLength: 16,
        aliases: ["cf"],
      },
      { key: "email", label: "Email", kind: "text", maxLength: 254 },
      { key: "telefono", label: "Telefono", kind: "text", maxLength: 50 },
      {
        key: "condominio_codice",
        label: "Codice condominio",
        kind: "text",
        maxLength: 20,
        help: "Se compilato, la persona viene collegata a quel condominio",
      },
      {
        key: "ruolo_condominio",
        label: "Ruolo nel condominio",
        kind: "enum",
        enumValues: RUOLI_PERSONA_CONDOMINIO,
        help: "consigliere | condomino | referente | fornitore | amministratore | altro",
      },
      {
        key: "unita_identificativo",
        label: "Identificativo unità",
        kind: "text",
        maxLength: 60,
        help: "Richiede il codice condominio",
      },
      {
        key: "titolo_unita",
        label: "Titolo sull’unità",
        kind: "enum",
        enumValues: TITOLI_UNITA,
        help: "proprietario | usufruttuario | affittuario | comodatario | altro",
      },
      { key: "note", label: "Note", kind: "text", maxLength: 2000 },
    ],
  },
  unita: {
    tipo: "unita",
    label: "Unità immobiliari",
    entityLabel: "unità",
    description:
      "Censisce le unità di condomìni già presenti nel CRM (codice condominio obbligatorio).",
    dedupeKeys: [["condominio_codice", "identificativo"]],
    columns: [
      condominioCodice,
      {
        key: "identificativo",
        label: "Identificativo",
        kind: "text",
        required: true,
        maxLength: 60,
      },
      { key: "piano", label: "Piano", kind: "text", maxLength: 20 },
      { key: "categoria", label: "Categoria", kind: "text", maxLength: 60 },
      {
        key: "millesimi",
        label: "Millesimi",
        kind: "millesimi",
        help: "Numero, es. 83,333",
      },
      {
        key: "millesimi_riscaldamento",
        label: "Millesimi riscaldamento",
        kind: "millesimi",
      },
      { key: "note", label: "Note", kind: "text", maxLength: 1000 },
    ],
  },
  segnalazioni: {
    tipo: "segnalazioni",
    label: "Segnalazioni",
    entityLabel: "segnalazione",
    description:
      "Importa segnalazioni già registrate altrove. Il codice viene assegnato dal CRM.",
    dedupeKeys: [["condominio_codice", "titolo", "data_apertura"]],
    columns: [
      condominioCodice,
      {
        key: "titolo",
        label: "Titolo",
        kind: "text",
        required: true,
        maxLength: 200,
      },
      {
        key: "descrizione",
        label: "Descrizione",
        kind: "text",
        maxLength: 4000,
      },
      {
        key: "categoria",
        label: "Categoria",
        kind: "enum",
        enumValues: SEGNALAZIONE_CATEGORIE,
      },
      {
        key: "priorita",
        label: "Priorità",
        kind: "enum",
        enumValues: SEGNALAZIONE_PRIORITA,
      },
      {
        key: "stato",
        label: "Stato",
        kind: "enum",
        enumValues: SEGNALAZIONE_STATI,
      },
      { key: "data_apertura", label: "Data apertura", kind: "date" },
      { key: "scadenza", label: "Scadenza", kind: "date" },
      {
        key: "area_comune",
        label: "Area comune",
        kind: "text",
        maxLength: 120,
      },
      {
        key: "unita_identificativo",
        label: "Identificativo unità",
        kind: "text",
        maxLength: 60,
      },
      { key: "referente", label: "Referente", kind: "text", maxLength: 160 },
    ],
  },
  consumi: {
    tipo: "consumi",
    label: "Consumi",
    entityLabel: "consumo",
    description:
      "Importa letture o valori aggregati per condominio e periodo. Le righe importate sono marcate come “importato”.",
    dedupeKeys: [["condominio_codice", "categoria", "periodo_da", "periodo_a"]],
    columns: [
      condominioCodice,
      {
        key: "categoria",
        label: "Categoria",
        kind: "enum",
        required: true,
        enumValues: CONSUMO_CATEGORIE,
      },
      { key: "periodo_da", label: "Periodo da", kind: "date", required: true },
      { key: "periodo_a", label: "Periodo a", kind: "date", required: true },
      { key: "valore", label: "Valore", kind: "number", required: true },
      {
        key: "unita_misura",
        label: "Unità di misura",
        kind: "enum",
        required: true,
        enumValues: UNITA_MISURA,
      },
      { key: "costo", label: "Costo (€)", kind: "number" },
      { key: "fonte", label: "Fonte", kind: "text", maxLength: 160 },
      {
        key: "origine",
        label: "Origine",
        kind: "enum",
        enumValues: CONSUMO_ORIGINI,
        help: "inserito | importato | stimato",
      },
      { key: "data_rilevazione", label: "Data rilevazione", kind: "date" },
      { key: "note", label: "Note", kind: "text", maxLength: 1000 },
    ],
  },
};

/** Normalizza un'intestazione: minuscole, senza accenti, spazi/underscore uniformati. */
export function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function resolveColumns(
  tipo: ImportTipo,
  headers: string[],
): {
  mapping: Map<string, string>;
  riconosciute: string[];
  ignorate: string[];
  mancanti: string[];
} {
  const template = IMPORT_TEMPLATES[tipo];
  const normalizedHeaders = headers.map((h) => ({
    raw: h,
    norm: normalizeHeader(String(h ?? "")),
  }));
  const mapping = new Map<string, string>(); // key colonna → header originale
  const riconosciute: string[] = [];
  const ignorate: string[] = [];

  const usedHeaders = new Set<string>();
  for (const column of template.columns) {
    const candidates = new Set(
      [column.key, column.label, ...(column.aliases ?? [])].map((v) =>
        normalizeHeader(v),
      ),
    );
    const found = normalizedHeaders.find(
      (h) => !usedHeaders.has(h.raw) && candidates.has(h.norm),
    );
    if (found) {
      mapping.set(column.key, found.raw);
      riconosciute.push(column.label);
      usedHeaders.add(found.raw);
    }
  }
  for (const header of normalizedHeaders) {
    if (!usedHeaders.has(header.raw) && header.raw.trim() !== "")
      ignorate.push(header.raw);
  }
  const mancanti = template.columns
    .filter((c) => c.required && !mapping.has(c.key))
    .map((c) => c.label);
  return { mapping, riconosciute, ignorate, mancanti };
}
