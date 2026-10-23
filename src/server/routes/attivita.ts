import { Router } from "express";
import { z } from "zod";
import { audit } from "../audit.js";
import { getDb, toDateString, uuid } from "../db.js";
import { asyncHandler, notFound, paginated, validate } from "../http.js";
import { Sql } from "../sql.js";
import { mapAttivita } from "../services/condomini.js";
import { attivitaSchema, uuidParam } from "../../shared/schemas.js";

export const attivitaRouter = Router();

const filterSchema = z.object({
  condominioId: z.string().uuid().optional(),
  personaId: z.string().uuid().optional(),
  completata: z.enum(["true", "false", "tutte"]).optional().default("tutte"),
  tipo: z.string().optional(),
  soloScadute: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  perPage: z.coerce.number().int().min(5).max(100).optional().default(25),
});

attivitaRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const filters = validate(filterSchema, req.query);
    const sql = new Sql();
    sql.andIf(
      filters.condominioId,
      "a.condominio_id = ?",
      filters.condominioId,
    );
    sql.andIf(filters.personaId, "a.persona_id = ?", filters.personaId);
    if (filters.completata !== "tutte")
      sql.and("a.completata = ?", filters.completata === "true");
    sql.andIf(filters.tipo, "a.tipo = ?", filters.tipo);
    if (filters.soloScadute === "true") {
      sql.and(
        "a.completata = false and a.scadenza is not null and a.scadenza < current_date",
      );
    }
    const db = getDb();
    const totalRows = await db.query<{ count: string }>(
      `select count(*)::int as count from attivita a ${sql.whereClause}`,
      sql.params,
    );
    const { limitRef, offsetRef } = sql.paginate(
      filters.perPage,
      (filters.page - 1) * filters.perPage,
    );
    const rows = await db.query<Record<string, unknown>>(
      `select a.*, c.denominazione as condominio
         from attivita a left join condomini c on c.id = a.condominio_id
         ${sql.whereClause}
        order by (a.scadenza is null) asc, a.scadenza asc, a.data desc
        limit ${limitRef} offset ${offsetRef}`,
      sql.params,
    );
    res.json(
      paginated(
        rows.map((r) => ({
          ...mapAttivita(r),
          condominio: (r.condominio as string) ?? null,
        })),
        Number(totalRows[0]?.count ?? 0),
        filters.page,
        filters.perPage,
      ),
    );
  }),
);

attivitaRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = validate(attivitaSchema, req.body);
    const db = getDb();
    const id = uuid();
    await db.transaction(async (tx) => {
      await tx.query(
        `insert into attivita (id, condominio_id, persona_id, tipo, titolo, descrizione, data, scadenza, completata, priorita, created_by)
         values ($1,$2,$3,$4,$5,$6,coalesce($7, current_date),$8,$9,$10,$11)`,
        [
          id,
          body.condominioId ?? null,
          body.personaId ?? null,
          body.tipo,
          body.titolo,
          body.descrizione ?? null,
          body.data ?? null,
          body.scadenza ?? null,
          body.completata ?? false,
          body.priorita,
          req.auth!.user.id,
        ],
      );
      await audit(tx, {
        userId: req.auth!.user.id,
        attoreEmail: req.auth!.user.email,
        azione: "attivita_creata",
        entitaTipo: "attivita",
        entitaId: id,
        descrizione: `Registrata attività "${body.titolo}"`,
        ipHash: req.ipHash,
      });
    });
    const row = (
      await db.query<Record<string, unknown>>(
        "select * from attivita where id = $1",
        [id],
      )
    )[0]!;
    res.status(201).json(mapAttivita(row));
  }),
);

attivitaRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const body = validate(attivitaSchema.partial(), req.body);
    const db = getDb();
    const rows = await db.query<Record<string, unknown>>(
      "select * from attivita where id = $1",
      [id],
    );
    if (!rows[0]) notFound("Attività non trovata");
    const map: Record<string, string> = {
      condominioId: "condominio_id",
      personaId: "persona_id",
      tipo: "tipo",
      titolo: "titolo",
      descrizione: "descrizione",
      data: "data",
      scadenza: "scadenza",
      completata: "completata",
      priorita: "priorita",
    };
    const sets: string[] = [];
    const params: unknown[] = [id];
    for (const [key, column] of Object.entries(map)) {
      if (!(key in body)) continue;
      params.push((body as Record<string, unknown>)[key] ?? null);
      sets.push(`${column} = $${params.length}`);
    }
    if (sets.length) {
      await db.transaction(async (tx) => {
        sets.push("updated_at = now()");
        await tx.query(
          `update attivita set ${sets.join(", ")} where id = $1`,
          params,
        );
        await audit(tx, {
          userId: req.auth!.user.id,
          attoreEmail: req.auth!.user.email,
          azione: "attivita_modificata",
          entitaTipo: "attivita",
          entitaId: id,
          descrizione: `Modificata attività "${String(rows[0]!.titolo)}"`,
          ipHash: req.ipHash,
        });
      });
    }
    const after = (
      await db.query<Record<string, unknown>>(
        "select * from attivita where id = $1",
        [id],
      )
    )[0]!;
    res.json(mapAttivita(after));
  }),
);

attivitaRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const db = getDb();
    const rows = await db.query<Record<string, unknown>>(
      "select * from attivita where id = $1",
      [id],
    );
    if (!rows[0]) notFound("Attività non trovata");
    await db.transaction(async (tx) => {
      await tx.query("delete from attivita where id = $1", [id]);
      await audit(tx, {
        userId: req.auth!.user.id,
        attoreEmail: req.auth!.user.email,
        azione: "attivita_eliminata",
        entitaTipo: "attivita",
        entitaId: id,
        descrizione: `Eliminata attività "${String(rows[0]!.titolo)}"`,
        ipHash: req.ipHash,
      });
    });
    res.json({ ok: true });
  }),
);

attivitaRouter.get(
  "/promemoria",
  asyncHandler(async (_req, res) => {
    const rows = await getDb().query<Record<string, unknown>>(
      `select a.*, c.denominazione as condominio
         from attivita a left join condomini c on c.id = a.condominio_id
        where a.completata = false and a.scadenza is not null and a.scadenza <= current_date + 14
        order by a.scadenza asc limit 20`,
    );
    res.json({
      items: rows.map((r) => ({
        ...mapAttivita(r),
        condominio: (r.condominio as string) ?? null,
        data: toDateString(r.scadenza),
      })),
    });
  }),
);
