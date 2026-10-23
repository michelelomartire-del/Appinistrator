import { Router } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { z } from "zod";
import { getDb, toIsoString } from "../db.js";
import {
  asyncHandler,
  HttpError,
  notFound,
  paginated,
  validate,
} from "../http.js";
import { requireRateLimit } from "../auth.js";
import { limiters } from "../rate-limit.js";
import { sha256 } from "../security.js";
import { IMPORT_TEMPLATES } from "../services/import-templates.js";
import {
  commitImport,
  createImportPreview,
  rollbackImport,
} from "../services/import-engine.js";
import {
  IMPORT_TIPI,
  MAX_UPLOAD_BYTES,
  type ImportTipo,
} from "../../shared/constants.js";

export const importRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 },
});

const tipoParam = z.enum(IMPORT_TIPI);

importRouter.get(
  "/templates",
  asyncHandler(async (_req, res) => {
    res.json({
      items: IMPORT_TIPI.map((tipo) => {
        const t = IMPORT_TEMPLATES[tipo];
        return {
          tipo,
          label: t.label,
          description: t.description,
          entityLabel: t.entityLabel,
          columns: t.columns.map((c) => ({
            key: c.key,
            label: c.label,
            required: Boolean(c.required),
            kind: c.kind,
            enumValues: c.enumValues,
            help: c.help,
          })),
        };
      }),
    });
  }),
);

/** Template XLSX generato al volo: intestazioni, istruzioni e valori ammessi. */
importRouter.get(
  "/template/:tipo",
  asyncHandler(async (req, res) => {
    const tipo = validate(tipoParam, req.params.tipo);
    const template = IMPORT_TEMPLATES[tipo];
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "CRM EffeBi";
    const sheet = workbook.addWorksheet("Dati");
    sheet.addRow(template.columns.map((c) => c.label));
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE8EEF5" },
    };
    template.columns.forEach((column, index) => {
      const col = sheet.getColumn(index + 1);
      col.width = Math.max(16, Math.min(40, column.label.length + 6));
      const cell = sheet.getRow(1).getCell(index + 1);
      cell.note = [
        column.help ?? "",
        column.required ? "Campo obbligatorio" : "Facoltativo",
        column.enumValues
          ? `Valori ammessi: ${column.enumValues.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    });

    const instructions = workbook.addWorksheet("Istruzioni");
    instructions.columns = [
      { header: "Colonna", key: "label", width: 30 },
      { header: "Obbligatoria", key: "required", width: 14 },
      { header: "Tipo", key: "kind", width: 12 },
      { header: "Valori ammessi / note", key: "note", width: 60 },
    ];
    instructions.addRow({
      label: template.label,
      required: "",
      kind: "",
      note: template.description,
    });
    instructions.addRow({});
    for (const column of template.columns) {
      instructions.addRow({
        label: column.label,
        required: column.required ? "Sì" : "No",
        kind: column.kind,
        note: [
          column.enumValues ? column.enumValues.join(", ") : "",
          column.help ?? "",
        ]
          .filter(Boolean)
          .join(" — "),
      });
    }
    instructions.addRow({});
    instructions.addRow({
      label: "Come funziona",
      note: "Il file viene solo analizzato in anteprima: nessun dato viene salvato finché non confermi. Le righe con errori non vengono importate. I possibili duplicati sono segnalati e per impostazione predefinita ignorati.",
    });

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="template-${tipo}.xlsx"`,
    );
    res.setHeader("Cache-Control", "no-store");
    res.end(Buffer.from(buffer));
  }),
);

importRouter.post(
  "/:tipo/anteprima",
  requireRateLimit(limiters.import, "user"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const tipo = validate(tipoParam, req.params.tipo) as ImportTipo;
    if (!req.file)
      throw new HttpError(400, "Nessun file ricevuto", {
        code: "file_mancante",
      });
    const preview = await createImportPreview({
      tipo,
      nomeFile: req.file.originalname.slice(0, 180),
      buffer: req.file.buffer,
      hashFile: sha256(req.file.buffer),
      userId: req.auth!.user.id,
    });
    res.status(201).json(preview);
  }),
);

importRouter.post(
  "/:batchId/conferma",
  requireRateLimit(limiters.import, "user"),
  asyncHandler(async (req, res) => {
    const batchId = validate(z.string().uuid(), req.params.batchId);
    const body = validate(
      z.object({ includiDuplicati: z.boolean().optional().default(false) }),
      req.body,
    );
    const result = await commitImport({
      batchId,
      includiDuplicati: body.includiDuplicati,
      userId: req.auth!.user.id,
      userEmail: req.auth!.user.email,
      ipHash: req.ipHash,
    });
    res.json(result);
  }),
);

importRouter.post(
  "/:batchId/annulla",
  asyncHandler(async (req, res) => {
    const batchId = validate(z.string().uuid(), req.params.batchId);
    const result = await rollbackImport({
      batchId,
      userId: req.auth!.user.id,
      userEmail: req.auth!.user.email,
      ipHash: req.ipHash,
    });
    res.json(result);
  }),
);

importRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = validate(
      z.object({
        page: z.coerce.number().int().min(1).optional().default(1),
        perPage: z.coerce.number().int().min(5).max(50).optional().default(20),
      }),
      req.query,
    );
    const db = getDb();
    const totalRows = await db.query<{ count: string }>(
      "select count(*)::int as count from import_batches",
    );
    const rows = await db.query<Record<string, unknown>>(
      `select * from import_batches order by created_at desc limit $1 offset $2`,
      [query.perPage, (query.page - 1) * query.perPage],
    );
    res.json(
      paginated(
        rows.map((r) => ({
          id: String(r.id),
          tipo: String(r.tipo),
          nomeFile: String(r.nome_file),
          dimensione: Number(r.dimensione),
          stato: String(r.stato),
          righeTotali: Number(r.righe_totali),
          righeValide: Number(r.righe_valide),
          righeErrori: Number(r.righe_errori),
          righeDuplicate: Number(r.righe_duplicate),
          createdAt: toIsoString(r.created_at) ?? "",
          completatoAt: toIsoString(r.completato_at),
        })),
        Number(totalRows[0]?.count ?? 0),
        query.page,
        query.perPage,
      ),
    );
  }),
);

importRouter.get(
  "/:batchId",
  asyncHandler(async (req, res) => {
    const batchId = validate(z.string().uuid(), req.params.batchId);
    const db = getDb();
    const rows = await db.query<Record<string, unknown>>(
      "select * from import_batches where id = $1",
      [batchId],
    );
    const batch = rows[0];
    if (!batch) notFound("Importazione non trovata");
    const righe = await db.query<Record<string, unknown>>(
      `select numero_riga, dati, errori, avvisi, esito, duplicato from import_rows
        where batch_id = $1 order by numero_riga limit 200`,
      [batchId],
    );
    res.json({
      batch: {
        id: String(batch.id),
        tipo: String(batch.tipo),
        nomeFile: String(batch.nome_file),
        dimensione: Number(batch.dimensione),
        stato: String(batch.stato),
        righeTotali: Number(batch.righe_totali),
        righeValide: Number(batch.righe_valide),
        righeErrori: Number(batch.righe_errori),
        righeDuplicate: Number(batch.righe_duplicate),
        riepilogo: batch.riepilogo,
        createdAt: toIsoString(batch.created_at),
        completatoAt: toIsoString(batch.completato_at),
      },
      righe: righe.map((r) => ({
        numeroRiga: Number(r.numero_riga),
        dati: r.dati,
        errori: r.errori,
        avvisi: r.avvisi,
        esito: r.esito,
        duplicato: r.duplicato,
      })),
    });
  }),
);
