import { z } from "zod";
import {
  ASSEMBLEA_ESITI,
  ASSEMBLEA_MODALITA,
  ASSEMBLEA_STATI,
  ASSEMBLEA_TIPI,
  ATTIVITA_PRIORITA,
  ATTIVITA_TIPI,
  CONDOMINIO_STATI,
  CONSUMO_CATEGORIE,
  CONSUMO_ORIGINI,
  PERIODO_STATI,
  RUOLI_PERSONA_CONDOMINIO,
  SEGNALAZIONE_CATEGORIE,
  SEGNALAZIONE_PRIORITA,
  SEGNALAZIONE_STATI,
  TITOLI_UNITA,
  UNITA_MISURA,
  DOCUMENTO_ENTITA,
} from "./constants.js";

/* ------------------------------------------------------------------------- */
/* Primitive                                                                  */
/* ------------------------------------------------------------------------- */

const emptyToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v;

export const optionalText = (max = 2000) =>
  z
    .preprocess(
      emptyToNull,
      z.string().trim().max(max, `Massimo ${max} caratteri`).nullable(),
    )
    .optional();

export const requiredText = (max = 200, label = "Campo") =>
  z
    .string({ required_error: `${label} obbligatorio` })
    .trim()
    .min(1, `${label} obbligatorio`)
    .max(max, `${label}: massimo ${max} caratteri`);

export const optionalDate = z.preprocess(
  emptyToNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida (formato AAAA-MM-GG)")
    .refine((v) => !Number.isNaN(Date.parse(v)), "Data inesistente")
    .nullable(),
);

export const optionalDateTime = z.preprocess(
  emptyToNull,
  z.string().datetime({ offset: true }).nullable(),
);

/** Importo decimale non negativo, con massimo due decimali. */
export const importo = z.preprocess(
  (v) =>
    typeof v === "string" && v.trim() === ""
      ? undefined
      : typeof v === "string"
        ? Number(v.replace(",", "."))
        : v,
  z
    .number({
      required_error: "Importo obbligatorio",
      invalid_type_error: "Importo non valido",
    })
    .refine((v) => Number.isFinite(v), "Importo non valido")
    .refine(
      (v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6,
      "Massimo due decimali",
    )
    .refine((v) => Math.abs(v) < 1e12, "Importo fuori scala"),
);

export const optionalImporto = z.preprocess(
  (v) => {
    if (
      v === null ||
      v === undefined ||
      (typeof v === "string" && v.trim() === "")
    )
      return null;
    return typeof v === "string" ? Number(v.replace(",", ".")) : v;
  },
  z
    .number()
    .refine((v) => Number.isFinite(v), "Importo non valido")
    .refine((v) => Math.abs(v) < 1e12, "Importo fuori scala")
    .nullable(),
);

export const optionalNumber = (opts: { min?: number; max?: number } = {}) =>
  z.preprocess(
    (v) => {
      if (
        v === null ||
        v === undefined ||
        (typeof v === "string" && v.trim() === "")
      )
        return null;
      return typeof v === "string" ? Number(v.replace(",", ".")) : v;
    },
    z
      .number()
      .refine((v) => Number.isFinite(v), "Numero non valido")
      .refine(
        (v) => opts.min === undefined || v >= opts.min,
        `Valore minimo ${opts.min}`,
      )
      .refine(
        (v) => opts.max === undefined || v <= opts.max,
        `Valore massimo ${opts.max}`,
      )
      .nullable(),
  );

export const millesimi = optionalNumber({ min: 0, max: 1000 });

export const optionalEmail = z.preprocess(
  emptyToNull,
  z.string().trim().email("Email non valida").max(254).nullable(),
);

export const optionalUuid = z.preprocess(
  emptyToNull,
  z.string().uuid("Identificativo non valido").nullable(),
);

export const uuidParam = z.string().uuid("Identificativo non valido");

export const optionalTime = z.preprocess(
  emptyToNull,
  z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Orario non valido (HH:MM)")
    .nullable(),
);

/* ------------------------------------------------------------------------- */
/* Autenticazione                                                             */
/* ------------------------------------------------------------------------- */

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(3, "Email obbligatoria")
    .max(254)
    .email("Email non valida"),
  password: z.string().min(1, "Password obbligatoria").max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const mfaSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Inserisci il codice a 6 cifre"),
});
export type MfaInput = z.infer<typeof mfaSchema>;

export const cambioPasswordSchema = z
  .object({
    passwordAttuale: z
      .string()
      .min(1, "Password attuale obbligatoria")
      .max(200),
    nuovaPassword: z
      .string()
      .min(12, "La nuova password deve avere almeno 12 caratteri")
      .max(200)
      .refine(
        (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v),
        "Usa maiuscole, minuscole e numeri",
      ),
    conferma: z.string(),
  })
  .refine((d) => d.nuovaPassword === d.conferma, {
    message: "Le password non coincidono",
    path: ["conferma"],
  });

/* ------------------------------------------------------------------------- */
/* Condomini                                                                  */
/* ------------------------------------------------------------------------- */

export const condominioCreateSchema = z.object({
  denominazione: requiredText(200, "Denominazione"),
  indirizzo: optionalText(300),
  cap: z
    .preprocess(
      emptyToNull,
      z
        .string()
        .trim()
        .regex(/^\d{5}$/, "CAP non valido")
        .nullable(),
    )
    .optional(),
  comune: optionalText(120),
  provincia: z
    .preprocess(
      emptyToNull,
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{2}$/, "Provincia: due lettere")
        .nullable(),
    )
    .optional(),
  codiceFiscale: optionalText(20),
  stato: z.enum(CONDOMINIO_STATI).default("attivo"),
  dataInizioIncarico: optionalDate.optional(),
  dataFineIncarico: optionalDate.optional(),
  note: optionalText(4000),
});
export type CondominioInput = z.infer<typeof condominioCreateSchema>;

export const condominioUpdateSchema = condominioCreateSchema.partial().extend({
  archiviato: z.boolean().optional(),
});

export const condominioFilterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  stato: z.enum(CONDOMINIO_STATI).optional(),
  comune: z.string().trim().max(120).optional(),
  archiviato: z.enum(["true", "false", "tutti"]).optional().default("false"),
  sort: z
    .enum(["denominazione", "codice", "comune", "aggiornato"])
    .optional()
    .default("denominazione"),
  dir: z.enum(["asc", "desc"]).optional().default("asc"),
  page: z.coerce.number().int().min(1).max(10000).optional().default(1),
  perPage: z.coerce.number().int().min(5).max(100).optional().default(25),
});

/* ------------------------------------------------------------------------- */
/* Persone                                                                    */
/* ------------------------------------------------------------------------- */

export const personaSchema = z.object({
  nome: requiredText(100, "Nome"),
  cognome: requiredText(100, "Cognome"),
  codiceFiscale: z
    .preprocess(
      emptyToNull,
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(
          /^[A-Z0-9]{11,16}$/,
          "Codice fiscale non valido (11-16 caratteri alfanumerici)",
        )
        .nullable(),
    )
    .optional(),
  email: optionalEmail.optional(),
  telefono: optionalText(50),
  note: optionalText(2000),
});
export type PersonaInput = z.infer<typeof personaSchema>;

export const relazionePersonaCondominioSchema = z.object({
  personaId: uuidParam,
  ruolo: z.enum(RUOLI_PERSONA_CONDOMINIO),
  qualifica: optionalText(120),
  dataInizio: optionalDate.optional(),
  dataFine: optionalDate.optional(),
  note: optionalText(1000),
});

export const unitaSchema = z.object({
  identificativo: requiredText(60, "Identificativo"),
  piano: optionalText(20),
  categoria: optionalText(60),
  millesimi,
  millesimiRiscaldamento: millesimi,
  note: optionalText(1000),
});
export type UnitaInput = z.infer<typeof unitaSchema>;

export const unitaPersonaSchema = z.object({
  personaId: uuidParam,
  titolo: z.enum(TITOLI_UNITA).default("proprietario"),
  millesimi,
  dataInizio: optionalDate.optional(),
  dataFine: optionalDate.optional(),
  note: optionalText(500),
});

/* ------------------------------------------------------------------------- */
/* Attività                                                                   */
/* ------------------------------------------------------------------------- */

export const attivitaSchema = z.object({
  condominioId: optionalUuid.optional(),
  personaId: optionalUuid.optional(),
  tipo: z.enum(ATTIVITA_TIPI).default("nota"),
  titolo: requiredText(200, "Titolo"),
  descrizione: optionalText(4000),
  data: optionalDate.optional(),
  scadenza: optionalDate.optional(),
  priorita: z.enum(ATTIVITA_PRIORITA).default("normale"),
  completata: z.boolean().optional().default(false),
});

/* ------------------------------------------------------------------------- */
/* Segnalazioni                                                               */
/* ------------------------------------------------------------------------- */

export const segnalazioneCreateSchema = z.object({
  condominioId: uuidParam,
  unitaId: optionalUuid.optional(),
  areaComune: optionalText(120),
  titolo: requiredText(200, "Titolo"),
  descrizione: optionalText(4000),
  categoria: z.enum(SEGNALAZIONE_CATEGORIE).default("altro"),
  priorita: z.enum(SEGNALAZIONE_PRIORITA).default("media"),
  stato: z.enum(SEGNALAZIONE_STATI).default("nuova"),
  dataApertura: optionalDate.optional(),
  scadenza: optionalDate.optional(),
  fornitorePersonaId: optionalUuid.optional(),
  referente: optionalText(160),
});
export type SegnalazioneInput = z.infer<typeof segnalazioneCreateSchema>;

export const segnalazioneUpdateSchema = segnalazioneCreateSchema
  .partial()
  .extend({
    nota: optionalText(1000),
  });

export const cambiaStatoSegnalazioneSchema = z.object({
  stato: z.enum(SEGNALAZIONE_STATI),
  nota: z.string().trim().max(1000).optional(),
});

/* ------------------------------------------------------------------------- */
/* Assemblee                                                                  */
/* ------------------------------------------------------------------------- */

export const assembleaSchema = z.object({
  condominioId: uuidParam,
  data: optionalDate.refine((v) => v !== null, "Data obbligatoria"),
  ora: optionalTime.optional(),
  tipo: z.enum(ASSEMBLEA_TIPI).default("ordinaria"),
  luogo: optionalText(200),
  modalita: z.enum(ASSEMBLEA_MODALITA).default("presenza"),
  stato: z.enum(ASSEMBLEA_STATI).default("programmata"),
  quorumRegistrato: optionalNumber({ min: 0, max: 1000 }),
  note: optionalText(3000),
});
export type AssembleaInput = z.infer<typeof assembleaSchema>;

export const assembleaPuntoSchema = z.object({
  ordine: z.coerce.number().int().min(1).max(999).optional(),
  titolo: requiredText(300, "Titolo punto"),
  descrizione: optionalText(3000),
  delibera: optionalText(4000),
  esito: z
    .preprocess(emptyToNull, z.enum(ASSEMBLEA_ESITI).nullable())
    .optional(),
});

export const assembleaPartecipanteSchema = z.object({
  personaId: optionalUuid.optional(),
  unitaId: optionalUuid.optional(),
  nomeEsterno: optionalText(160),
  presente: z.boolean().default(false),
  delegante: optionalText(160),
  millesimi,
  note: optionalText(500),
});

/* ------------------------------------------------------------------------- */
/* Rendiconti                                                                 */
/* ------------------------------------------------------------------------- */

export const periodoBaseSchema = z.object({
  condominioId: uuidParam,
  etichetta: requiredText(120, "Etichetta"),
  dataInizio: optionalDate.refine(
    (v) => v !== null,
    "Data inizio obbligatoria",
  ),
  dataFine: optionalDate.refine((v) => v !== null, "Data fine obbligatoria"),
  stato: z.enum(PERIODO_STATI).default("bozza"),
  note: optionalText(2000),
});
export const periodoSchema = periodoBaseSchema.refine(
  (d) => (d.dataInizio && d.dataFine ? d.dataFine >= d.dataInizio : true),
  {
    message: "La data di fine non può precedere la data di inizio",
    path: ["dataFine"],
  },
);
export type PeriodoInput = z.infer<typeof periodoSchema>;

export const spesaSchema = z.object({
  periodoId: uuidParam.optional(),
  data: optionalDate.refine((v) => v !== null, "Data obbligatoria"),
  descrizione: requiredText(300, "Descrizione"),
  categoria: optionalText(80),
  importo: importo.refine((v) => v >= 0, "L’importo non può essere negativo"),
  fornitore: optionalText(160),
  riferimento: optionalText(80),
  note: optionalText(2000),
});
export type SpesaInput = z.infer<typeof spesaSchema>;

export const rataSchema = z.object({
  periodoId: uuidParam.optional(),
  unitaId: optionalUuid.optional(),
  descrizione: requiredText(200, "Descrizione"),
  numero: optionalText(40),
  scadenza: optionalDate.refine((v) => v !== null, "Scadenza obbligatoria"),
  importo: importo.refine((v) => v >= 0, "L’importo non può essere negativo"),
  criteriRipartizione: optionalText(500),
  note: optionalText(1000),
});
export type RataInput = z.infer<typeof rataSchema>;

export const pagamentoSchema = z.object({
  data: optionalDate.refine((v) => v !== null, "Data obbligatoria"),
  importo: importo.refine(
    (v) => v > 0,
    "L’importo deve essere maggiore di zero",
  ),
  metodo: optionalText(60),
  riferimento: optionalText(100),
  note: optionalText(1000),
});
export type PagamentoInput = z.infer<typeof pagamentoSchema>;

/* ------------------------------------------------------------------------- */
/* Consumi                                                                    */
/* ------------------------------------------------------------------------- */

export const consumoBaseSchema = z.object({
  condominioId: uuidParam,
  categoria: z.enum(CONSUMO_CATEGORIE),
  periodoDa: optionalDate.refine((v) => v !== null, "Data inizio obbligatoria"),
  periodoA: optionalDate.refine((v) => v !== null, "Data fine obbligatoria"),
  valore: z.preprocess(
    (v) => (typeof v === "string" ? Number(v.replace(",", ".")) : v),
    z
      .number({ invalid_type_error: "Valore non valido" })
      .refine((v) => Number.isFinite(v), "Valore non valido")
      .refine((v) => v >= 0, "Il valore non può essere negativo"),
  ),
  unitaMisura: z.enum(UNITA_MISURA),
  costo: optionalImporto,
  fonte: optionalText(160),
  origine: z.enum(CONSUMO_ORIGINI).default("inserito"),
  dataRilevazione: optionalDate.optional(),
  note: optionalText(1000),
});
export const consumoSchema = consumoBaseSchema.refine(
  (d) => (d.periodoDa && d.periodoA ? d.periodoA >= d.periodoDa : true),
  {
    message: "La data di fine periodo non può precedere quella di inizio",
    path: ["periodoA"],
  },
);
export type ConsumoInput = z.infer<typeof consumoSchema>;

/* ------------------------------------------------------------------------- */
/* Ricerca globale e filtri                                                   */
/* ------------------------------------------------------------------------- */

export const searchSchema = z.object({
  q: z.string().trim().min(2, "Almeno 2 caratteri").max(100),
});

export const documentoSchema = z.object({
  entitaTipo: z.enum(DOCUMENTO_ENTITA),
  entitaId: optionalUuid.optional(),
  condominioId: optionalUuid.optional(),
  categoria: optionalText(80),
  descrizione: optionalText(500),
});

export const segnalazioneFilterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  stato: z.union([z.enum(SEGNALAZIONE_STATI), z.literal("aperte")]).optional(),
  condominioId: optionalUuid.optional(),
  priorita: z.enum(SEGNALAZIONE_PRIORITA).optional(),
  categoria: z.enum(SEGNALAZIONE_CATEGORIE).optional(),
  scadute: z.enum(["true", "false"]).optional(),
  sort: z
    .enum(["apertura", "scadenza", "priorita"])
    .optional()
    .default("apertura"),
  page: z.coerce.number().int().min(1).max(10000).optional().default(1),
  perPage: z.coerce.number().int().min(5).max(100).optional().default(25),
});

export const consumoFilterSchema = z.object({
  condominioId: optionalUuid.optional(),
  categoria: z.enum(CONSUMO_CATEGORIE).optional(),
  origine: z.enum(CONSUMO_ORIGINI).optional(),
  dal: optionalDate.optional(),
  al: optionalDate.optional(),
  page: z.coerce.number().int().min(1).max(10000).optional().default(1),
  perPage: z.coerce.number().int().min(5).max(200).optional().default(50),
});

export const assembleaFilterSchema = z.object({
  condominioId: optionalUuid.optional(),
  stato: z.enum(ASSEMBLEA_STATI).optional(),
  da: optionalDate.optional(),
  a: optionalDate.optional(),
  page: z.coerce.number().int().min(1).max(10000).optional().default(1),
  perPage: z.coerce.number().int().min(5).max(100).optional().default(25),
});

export const periodoFilterSchema = z.object({
  condominioId: optionalUuid.optional(),
  anno: z.coerce.number().int().min(1990).max(2200).optional(),
  stato: z.enum(PERIODO_STATI).optional(),
  page: z.coerce.number().int().min(1).max(10000).optional().default(1),
  perPage: z.coerce.number().int().min(5).max(100).optional().default(25),
});

/** Converte gli errori zod in una mappa campo → messaggio leggibile. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Validazione con esito tipizzato, senza eccezioni. */
export function parseInput<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
):
  | { ok: true; data: z.infer<T> }
  | { ok: false; errors: Record<string, string> } {
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, errors: fieldErrors(result.error) };
}
