import { Router } from "express";
import multer from "multer";
import { audit } from "../audit.js";
import { config } from "../config.js";
import { getDb, toIsoString, uuid } from "../db.js";
import {
  asyncHandler,
  badRequest,
  HttpError,
  notFound,
  validate,
} from "../http.js";
import { storage } from "../services/storage.js";
import { sha256 } from "../security.js";
import { documentoSchema, uuidParam } from "../../shared/schemas.js";
import {
  ACCEPTED_DOCUMENT_MIME,
  MAX_DOCUMENT_BYTES,
} from "../../shared/constants.js";
import type { DocumentoDto } from "../../shared/api-types.js";
import { requireRateLimit } from "../auth.js";
import { limiters } from "../rate-limit.js";

export const documentiRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1, fields: 12 },
});

/** Riconosce il tipo reale del file dai magic bytes, senza fidarsi del client. */
export function sniffMime(buffer: Buffer): string | null {
  if (buffer.length < 5) return null;
  const hex = buffer.subarray(0, 12).toString("hex").toLowerCase();
  if (hex.startsWith("25504446")) return "application/pdf";
  if (hex.startsWith("ffd8ff")) return "image/jpeg";
  if (hex.startsWith("89504e470d0a1a0a")) return "image/png";
  if (
    hex.startsWith("52494646") &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  if (
    hex.startsWith("504b0304") ||
    hex.startsWith("504b0506") ||
    hex.startsWith("504b0708")
  )
    return "zip";
  if (hex.startsWith("d0cf11e0a1b11ae1")) return "ole";
  // testo: nessun byte nullo nei primi 4 KB e UTF-8 valido
  const sample = buffer.subarray(0, 4096);
  if (!sample.includes(0)) {
    const isUtf8 = Buffer.from(sample.toString("utf8"), "utf8").equals(sample);
    if (isUtf8) {
      const text = sample.toString("utf8");
      if (text.includes(",") || text.includes(";")) return "text/csv";
      return "text/plain";
    }
  }
  return null;
}

function normalizeMime(detected: string | null, declared: string): string | null {
  if (!detected) return null;
  if (detected === "zip") {
    if (declared.includes("wordprocessingml"))
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (declared.includes("spreadsheetml"))
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    return null;
  }
  if (detected === "ole") {
    if (declared === "application/msword" || declared === "application/vnd.ms-excel") return declared;
    return null;
  }
  // Il formato reale deve essere coerente con quello dichiarato dal client.
  if (declared === "application/pdf") return detected === "application/pdf" ? detected : null;
  if (declared.startsWith("image/")) return detected === declared ? detected : null;
  if (declared.startsWith("text/")) {
    // I file di testo vengono sempre serviti come text/plain o text/csv, mai come HTML.
    if (detected === "text/plain" || detected === "text/csv") {
      return declared === "text/csv" && detected === "text/csv" ? "text/csv" : "text/plain";
    }
    return null;
  }
  return null;
}

function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/[\\/]/g, "-")
      .slice(0, 180)
      .trim() || "documento"
  );
}

export function mapDocumento(row: Record<string, unknown>): DocumentoDto {
  return {
    id: String(row.id),
    condominioId: (row.condominio_id as string) ?? null,
    entitaTipo: String(row.entita_tipo),
    entitaId: (row.entita_id as string) ?? null,
    nomeFile: String(row.nome_file),
    mime: String(row.mime),
    dimensione: Number(row.dimensione ?? 0),
    categoria: (row.categoria as string) ?? null,
    descrizione: (row.descrizione as string) ?? null,
    archiviato: Boolean(row.archiviato),
    createdAt: toIsoString(row.created_at) ?? "",
    scaricabile: !row.archiviato,
  };
}

documentiRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const db = getDb();
    const params: unknown[] = [];
    const where: string[] = ["d.archiviato = false"];
    if (typeof req.query.entitaTipo === "string" && req.query.entitaTipo) {
      params.push(req.query.entitaTipo);
      where.push(`d.entita_tipo = $${params.length}`);
    }
    if (typeof req.query.entitaId === "string" && req.query.entitaId) {
      params.push(req.query.entitaId);
      where.push(`d.entita_id = $${params.length}`);
    }
    if (typeof req.query.condominioId === "string" && req.query.condominioId) {
      params.push(req.query.condominioId);
      where.push(`d.condominio_id = $${params.length}`);
    }
    const rows = await db.query<Record<string, unknown>>(
      `select * from documenti d where ${where.join(" and ")} order by d.created_at desc limit 200`,
      params,
    );
    res.json({ items: rows.map(mapDocumento) });
  }),
);

documentiRouter.post(
  "/",
  requireRateLimit(limiters.upload, "user"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file)
      throw new HttpError(400, "Nessun file ricevuto", {
        code: "file_mancante",
      });
    const meta = validate(documentoSchema, {
      entitaTipo: req.body?.entitaTipo,
      entitaId: req.body?.entitaId,
      condominioId: req.body?.condominioId,
      categoria: req.body?.categoria,
      descrizione: req.body?.descrizione,
    });

    const declared = (
      req.file.mimetype || "application/octet-stream"
    ).toLowerCase();
    if (!ACCEPTED_DOCUMENT_MIME.includes(declared)) {
      badRequest(
        "Tipo di file non consentito. Ammessi PDF, immagini, testo/CSV e documenti Office.",
        {
          file: "Tipo non ammesso",
        },
      );
    }
    const detected = normalizeMime(sniffMime(req.file.buffer), declared);
    if (!detected) {
      badRequest(
        "Il contenuto del file non corrisponde a un formato ammesso.",
        { file: "Formato non riconosciuto" },
      );
    }

    // Verifica che l'entità collegata esista (quando indicata)
    const db = getDb();
    if (meta.entitaId && meta.entitaTipo !== "condominio") {
      const tableMap: Record<string, string> = {
        persona: "persone",
        unita: "unita",
        segnalazione: "segnalazioni",
        assemblea: "assemblee",
        periodo_contabile: "periodi_contabili",
        spesa: "spese",
        rata: "rate",
        consumo: "consumi",
        attivita: "attivita",
      };
      const table = tableMap[meta.entitaTipo];
      if (table) {
        const check = await db.query(`select id from ${table} where id = $1`, [
          meta.entitaId,
        ]);
        if (check.length === 0) notFound("Entità di riferimento non trovata");
      }
    }

    const id = uuid();
    const storageKey = `${new Date().getFullYear()}/${id}/${sanitizeFilename(req.file.originalname)}`;
    const checksum = sha256(req.file.buffer);
    await storage.put(storageKey, req.file.buffer, detected);

    await db.transaction(async (tx) => {
      await tx.query(
        `insert into documenti (id, condominio_id, entita_tipo, entita_id, nome_file, mime, dimensione, storage_key, checksum_sha256, categoria, descrizione, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          id,
          meta.condominioId ?? null,
          meta.entitaTipo,
          meta.entitaId ?? null,
          sanitizeFilename(req.file!.originalname),
          detected,
          req.file!.size,
          storageKey,
          checksum,
          meta.categoria ?? null,
          meta.descrizione ?? null,
          req.auth!.user.id,
        ],
      );
      await audit(tx, {
        userId: req.auth!.user.id,
        attoreEmail: req.auth!.user.email,
        azione: "documento_caricato",
        entitaTipo: "documento",
        entitaId: id,
        descrizione: `Caricato documento per ${meta.entitaTipo} (${detected}, ${req.file!.size} byte)`,
        ipHash: req.ipHash,
      });
    });

    const row = (
      await db.query<Record<string, unknown>>(
        "select * from documenti where id = $1",
        [id],
      )
    )[0]!;
    res.status(201).json(mapDocumento(row));
  }),
);

documentiRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const rows = await getDb().query<Record<string, unknown>>(
      "select * from documenti where id = $1",
      [id],
    );
    if (!rows[0]) notFound("Documento non trovato");
    res.json(mapDocumento(rows[0]));
  }),
);

documentiRouter.get(
  "/:id/download",
  requireRateLimit(limiters.upload, "user"),
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const db = getDb();
    const rows = await db.query<Record<string, unknown>>(
      "select * from documenti where id = $1",
      [id],
    );
    const doc = rows[0];
    if (!doc || doc.archiviato) notFound("Documento non trovato");
    const buffer = await storage.get(String(doc.storage_key));
    await audit(db, {
      userId: req.auth!.user.id,
      attoreEmail: req.auth!.user.email,
      azione: "documento_scaricato",
      entitaTipo: "documento",
      entitaId: id,
      descrizione: "Download documento",
      ipHash: req.ipHash,
    });
    const filename = sanitizeFilename(String(doc.nome_file));
    res.setHeader("Content-Type", String(doc.mime));
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(buffer);
  }),
);

documentiRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const db = getDb();
    const rows = await db.query<Record<string, unknown>>(
      "select * from documenti where id = $1",
      [id],
    );
    const doc = rows[0];
    if (!doc) notFound("Documento non trovato");
    await db.transaction(async (tx) => {
      await tx.query("update documenti set archiviato = true where id = $1", [
        id,
      ]);
      await audit(tx, {
        userId: req.auth!.user.id,
        attoreEmail: req.auth!.user.email,
        azione: "documento_archiviato",
        entitaTipo: "documento",
        entitaId: id,
        descrizione: `Archiviato documento "${String(doc.nome_file)}"`,
        ipHash: req.ipHash,
      });
    });
    // il file resta nello storage (non recuperabile via API) per consentire il ripristino
    res.json({ ok: true });
  }),
);

export { storage, config };
