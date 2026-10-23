import { Router } from "express";
import { z } from "zod";
import { getDb, toIsoString } from "../db.js";
import { asyncHandler, paginated, validate } from "../http.js";
import { requireAdmin } from "../auth.js";
import { auditLogFilterSchema } from "../services/audit-filter.js";
import type { AuditLogItem } from "../../shared/api-types.js";

export const adminRouter = Router();

/** Audit log consultabile solo dall'amministratore. */
adminRouter.get(
  "/audit",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const filters = validate(auditLogFilterSchema, req.query);
    const db = getDb();
    const params: unknown[] = [];
    const where: string[] = [];
    if (filters.entitaTipo) {
      params.push(filters.entitaTipo);
      where.push(`entita_tipo = $${params.length}`);
    }
    if (filters.entitaId) {
      params.push(filters.entitaId);
      where.push(`entita_id = $${params.length}`);
    }
    if (filters.azione) {
      params.push(filters.azione);
      where.push(`azione = $${params.length}`);
    }
    const clause = where.length ? `where ${where.join(" and ")}` : "";
    const totalRows = await db.query<{ count: string }>(
      `select count(*)::int as count from audit_log ${clause}`,
      params,
    );
    params.push(filters.perPage, (filters.page - 1) * filters.perPage);
    const rows = await db.query<Record<string, unknown>>(
      `select * from audit_log ${clause} order by created_at desc
        limit $${params.length - 1} offset $${params.length}`,
      params,
    );
    const items: AuditLogItem[] = rows.map((r) => ({
      id: String(r.id),
      azione: String(r.azione),
      entitaTipo: String(r.entita_tipo),
      entitaId: (r.entita_id as string) ?? null,
      descrizione: String(r.descrizione),
      attoreEmail: (r.attore_email as string) ?? null,
      createdAt: toIsoString(r.created_at) ?? "",
    }));
    res.json(
      paginated(
        items,
        Number(totalRows[0]?.count ?? 0),
        filters.page,
        filters.perPage,
      ),
    );
  }),
);

/** Stato del sistema per la pagina impostazioni (nessun segreto esposto). */
adminRouter.get(
  "/stato",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const db = getDb();
    const counts = await db.query<Record<string, unknown>>(
      `select
        (select count(*)::int from condomini) as condomini,
        (select count(*)::int from persone) as persone,
        (select count(*)::int from segnalazioni) as segnalazioni,
        (select count(*)::int from assemblee) as assemblee,
        (select count(*)::int from periodi_contabili) as periodi,
        (select count(*)::int from consumi) as consumi,
        (select count(*)::int from documenti where archiviato = false) as documenti,
        (select count(*)::int from import_batches) as importazioni,
        (select count(*)::int from sessions where expires_at > now()) as sessioni_attive`,
    );
    const migrations = await db.query<{ version: string }>(
      "select version from schema_migrations order by version",
    );
    res.json({
      database: db.kind,
      migrazioniApplicate: migrations.map((m) => m.version),
      documentiStorage:
        process.env.STORAGE_DRIVER === "supabase" ? "supabase" : "locale",
      conteggi: counts[0],
      versione: "1.0.0",
    });
  }),
);

adminRouter.get(
  "/sessioni",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const rows = await getDb().query<Record<string, unknown>>(
      `select s.id, s.created_at, s.last_seen_at, s.expires_at, s.user_agent, u.email
         from sessions s join users u on u.id = s.user_id
        where s.expires_at > now() order by s.last_seen_at desc limit 50`,
    );
    res.json({
      items: rows.map((r) => ({
        id: r.id,
        email: r.email,
        createdAt: toIsoString(r.created_at),
        lastSeenAt: toIsoString(r.last_seen_at),
        expiresAt: toIsoString(r.expires_at),
        userAgent: r.user_agent,
      })),
    });
  }),
);

adminRouter.post(
  "/sessioni/:id/revoca",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    await getDb().query("delete from sessions where id = $1", [id]);
    res.json({ ok: true });
  }),
);
