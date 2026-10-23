import { Router } from "express";
import { audit } from "../audit.js";
import { getDb, toDateString, toIsoString, uuid } from "../db.js";
import {
  asyncHandler,
  conflict,
  notFound,
  paginated,
  validate,
} from "../http.js";
import { Sql, toNumber, toNumberOrNull } from "../sql.js";
import { confrontaConsumi } from "../services/calcoli.js";
import {
  consumoBaseSchema,
  consumoFilterSchema,
  consumoSchema,
  uuidParam,
} from "../../shared/schemas.js";
import type {
  ConsumoDto,
  ConsumptionComparison,
} from "../../shared/api-types.js";

export const consumiRouter = Router();

function mapConsumo(row: Record<string, unknown>): ConsumoDto {
  return {
    id: String(row.id),
    condominioId: String(row.condominio_id),
    condominio: String(row.condominio ?? ""),
    categoria: String(row.categoria),
    periodoDa: toDateString(row.periodo_da) ?? "",
    periodoA: toDateString(row.periodo_a) ?? "",
    valore: toNumber(row.valore),
    unitaMisura: String(row.unita_misura),
    costo: toNumberOrNull(row.costo),
    fonte: (row.fonte as string) ?? null,
    origine: String(row.origine),
    dataRilevazione: toDateString(row.data_rilevazione),
    note: (row.note as string) ?? null,
    createdAt: toIsoString(row.created_at) ?? "",
  };
}

const selectBase = `select c.*, cond.denominazione as condominio from consumi c join condomini cond on cond.id = c.condominio_id`;

/** Trova il consumo precedente "candidato" per il confronto (stessa categoria e unità). */
async function findPrecedente(consumo: {
  id: string;
  condominioId: string;
  categoria: string;
  unitaMisura: string;
  periodoDa: string;
}): Promise<Record<string, unknown> | null> {
  const rows = await getDb().query<Record<string, unknown>>(
    `${selectBase}
      where c.condominio_id = $1 and c.categoria = $2 and c.unita_misura = $3
        and c.periodo_a < $4 and c.id <> $5
      order by c.periodo_a desc limit 1`,
    [
      consumo.condominioId,
      consumo.categoria,
      consumo.unitaMisura,
      consumo.periodoDa,
      consumo.id,
    ],
  );
  return rows[0] ?? null;
}

consumiRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const filters = validate(consumoFilterSchema, req.query);
    const sql = new Sql();
    sql.andIf(
      filters.condominioId,
      "c.condominio_id = ?",
      filters.condominioId,
    );
    sql.andIf(filters.categoria, "c.categoria = ?", filters.categoria);
    sql.andIf(filters.origine, "c.origine = ?", filters.origine);
    sql.andIf(filters.dal, "c.periodo_a >= ?", filters.dal);
    sql.andIf(filters.al, "c.periodo_da <= ?", filters.al);
    const db = getDb();
    const totalRows = await db.query<{ count: string }>(
      `select count(*)::int as count from consumi c ${sql.whereClause}`,
      sql.params,
    );
    const { limitRef, offsetRef } = sql.paginate(
      filters.perPage,
      (filters.page - 1) * filters.perPage,
    );
    const rows = await db.query<Record<string, unknown>>(
      `${selectBase} ${sql.whereClause} order by c.periodo_da desc, cond.denominazione limit ${limitRef} offset ${offsetRef}`,
      sql.params,
    );
    res.json(
      paginated(
        rows.map(mapConsumo),
        Number(totalRows[0]?.count ?? 0),
        filters.page,
        filters.perPage,
      ),
    );
  }),
);

consumiRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = validate(consumoSchema, req.body);
    const db = getDb();
    const condominio = await db.query(
      "select id from condomini where id = $1",
      [body.condominioId],
    );
    if (condominio.length === 0) notFound("Condominio non trovato");
    const duplicate = await db.query(
      `select id from consumi where condominio_id = $1 and categoria = $2 and periodo_da = $3 and periodo_a = $4`,
      [body.condominioId, body.categoria, body.periodoDa, body.periodoA],
    );
    if (duplicate.length > 0) {
      throw conflict(
        "Esiste già un consumo per lo stesso periodo e categoria: modifica quello esistente.",
      );
    }
    const id = uuid();
    await db.transaction(async (tx) => {
      await tx.query(
        `insert into consumi (id, condominio_id, categoria, periodo_da, periodo_a, valore, unita_misura, costo, fonte, origine, data_rilevazione, note, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          id,
          body.condominioId,
          body.categoria,
          body.periodoDa,
          body.periodoA,
          body.valore,
          body.unitaMisura,
          body.costo ?? null,
          body.fonte ?? null,
          body.origine,
          body.dataRilevazione ?? null,
          body.note ?? null,
          req.auth!.user.id,
        ],
      );
      await audit(tx, {
        userId: req.auth!.user.id,
        attoreEmail: req.auth!.user.email,
        azione: "consumo_creato",
        entitaTipo: "consumo",
        entitaId: id,
        descrizione: `Registrato consumo ${body.categoria} ${body.periodoDa}/${body.periodoA} (${body.origine})`,
        ipHash: req.ipHash,
      });
    });
    const row = (
      await db.query<Record<string, unknown>>(`${selectBase} where c.id = $1`, [
        id,
      ])
    )[0]!;
    res.status(201).json(mapConsumo(row));
  }),
);

consumiRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const rows = await getDb().query<Record<string, unknown>>(
      `${selectBase} where c.id = $1`,
      [id],
    );
    if (!rows[0]) notFound("Consumo non trovato");
    const corrente = mapConsumo(rows[0]);
    const precedenteRow = await findPrecedente(corrente);
    const confronto: ConsumptionComparison = confrontaConsumi(
      corrente,
      precedenteRow ? mapConsumo(precedenteRow) : null,
    );
    res.json({ consumo: corrente, confronto });
  }),
);

consumiRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const body = validate(
      consumoBaseSchema.partial().omit({ condominioId: true }),
      req.body,
    );
    const db = getDb();
    const rows = await db.query<Record<string, unknown>>(
      "select * from consumi where id = $1",
      [id],
    );
    if (!rows[0]) notFound("Consumo non trovato");
    const map: Record<string, string> = {
      categoria: "categoria",
      periodoDa: "periodo_da",
      periodoA: "periodo_a",
      valore: "valore",
      unitaMisura: "unita_misura",
      costo: "costo",
      fonte: "fonte",
      origine: "origine",
      dataRilevazione: "data_rilevazione",
      note: "note",
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
          `update consumi set ${sets.join(", ")} where id = $1`,
          params,
        );
        await audit(tx, {
          userId: req.auth!.user.id,
          attoreEmail: req.auth!.user.email,
          azione: "consumo_modificato",
          entitaTipo: "consumo",
          entitaId: id,
          descrizione: `Modificato consumo ${String(rows[0]!.categoria)} ${toDateString(rows[0]!.periodo_da)}`,
          ipHash: req.ipHash,
        });
      });
    }
    const row = (
      await db.query<Record<string, unknown>>(`${selectBase} where c.id = $1`, [
        id,
      ])
    )[0]!;
    res.json(mapConsumo(row));
  }),
);

consumiRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const db = getDb();
    const rows = await db.query<Record<string, unknown>>(
      "select * from consumi where id = $1",
      [id],
    );
    if (!rows[0]) notFound("Consumo non trovato");
    await db.transaction(async (tx) => {
      await tx.query("delete from consumi where id = $1", [id]);
      await audit(tx, {
        userId: req.auth!.user.id,
        attoreEmail: req.auth!.user.email,
        azione: "consumo_eliminato",
        entitaTipo: "consumo",
        entitaId: id,
        descrizione: `Eliminato consumo ${String(rows[0]!.categoria)} ${toDateString(rows[0]!.periodo_da)}`,
        ipHash: req.ipHash,
      });
    });
    res.json({ ok: true });
  }),
);

/** Confronti per condominio: solo coppie omogenee, altrimenti il motivo. */
consumiRouter.get(
  "/confronti/elenco",
  asyncHandler(async (req, res) => {
    const condominioId =
      typeof req.query.condominioId === "string" && req.query.condominioId
        ? req.query.condominioId
        : null;
    const db = getDb();
    const params: unknown[] = [];
    let where = "";
    if (condominioId) {
      params.push(condominioId);
      where = "where c.condominio_id = $1";
    }
    const rows = await db.query<Record<string, unknown>>(
      `${selectBase} ${where} order by c.periodo_da desc limit 60`,
      params,
    );
    const items: ConsumptionComparison[] = [];
    for (const row of rows) {
      const corrente = mapConsumo(row);
      const precedenteRow = await findPrecedente(corrente);
      items.push(
        confrontaConsumi(
          corrente,
          precedenteRow ? mapConsumo(precedenteRow) : null,
        ),
      );
    }
    res.json({ items });
  }),
);

export { toNumber };
