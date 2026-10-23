import { Router } from "express";
import { audit } from "../audit.js";
import { getDb, toDateString, toIsoString, uuid } from "../db.js";
import {
  asyncHandler,
  badRequest,
  notFound,
  paginated,
  validate,
} from "../http.js";
import { Sql, toNumberOrNull } from "../sql.js";
import { sumMillesimi } from "../services/calcoli.js";
import {
  assembleaFilterSchema,
  assembleaPartecipanteSchema,
  assembleaPuntoSchema,
  assembleaSchema,
  uuidParam,
} from "../../shared/schemas.js";
import type { AssembleaDto } from "../../shared/api-types.js";

export const assembleeRouter = Router();

async function buildAssemblea(
  row: Record<string, unknown>,
): Promise<AssembleaDto> {
  const db = getDb();
  const id = String(row.id);
  const punti = await db.query<Record<string, unknown>>(
    "select * from assemblea_punti where assemblea_id = $1 order by ordine, created_at",
    [id],
  );
  const partecipanti = await db.query<Record<string, unknown>>(
    `select ap.*, coalesce(trim(concat(p.nome, ' ', p.cognome)), ap.nome_esterno) as nome
       from assemblea_partecipanti ap left join persone p on p.id = ap.persona_id
      where ap.assemblea_id = $1 order by nome`,
    [id],
  );
  const millesimiRows = await db.query<{ millesimi: string | null }>(
    "select millesimi from unita where condominio_id = $1 and archiviato = false and millesimi is not null",
    [String(row.condominio_id)],
  );
  return {
    id,
    condominioId: String(row.condominio_id),
    condominio: String(row.condominio ?? ""),
    data: toDateString(row.data) ?? "",
    ora: row.ora ? String(row.ora).slice(0, 5) : null,
    tipo: String(row.tipo),
    luogo: (row.luogo as string) ?? null,
    modalita: String(row.modalita),
    stato: String(row.stato),
    quorumRegistrato: toNumberOrNull(row.quorum_registrato),
    note: (row.note as string) ?? null,
    punti: punti.map((p) => ({
      id: String(p.id),
      ordine: Number(p.ordine),
      titolo: String(p.titolo),
      descrizione: (p.descrizione as string) ?? null,
      delibera: (p.delibera as string) ?? null,
      esito: (p.esito as string) ?? null,
    })),
    partecipanti: partecipanti.map((p) => ({
      id: String(p.id),
      personaId: (p.persona_id as string) ?? null,
      unitaId: (p.unita_id as string) ?? null,
      nome: (p.nome as string) ?? null,
      presente: Boolean(p.presente),
      delegante: (p.delegante as string) ?? null,
      millesimi: toNumberOrNull(p.millesimi),
    })),
    millesimiPresenti:
      partecipanti.length > 0
        ? sumMillesimi(
            partecipanti
              .filter((p) => p.presente)
              .map((p) => p.millesimi as string | null),
          )
        : null,
    millesimiTotaliCondominio:
      millesimiRows.length > 0
        ? sumMillesimi(millesimiRows.map((r) => r.millesimi))
        : null,
  };
}

const selectBase = `select a.*, c.denominazione as condominio from assemblee a join condomini c on c.id = a.condominio_id`;

assembleeRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const filters = validate(assembleaFilterSchema, req.query);
    const sql = new Sql();
    sql.andIf(
      filters.condominioId,
      "a.condominio_id = ?",
      filters.condominioId,
    );
    sql.andIf(filters.stato, "a.stato = ?", filters.stato);
    sql.andIf(filters.da, "a.data >= ?", filters.da);
    sql.andIf(filters.a, "a.data <= ?", filters.a);
    const db = getDb();
    const totalRows = await db.query<{ count: string }>(
      `select count(*)::int as count from assemblee a ${sql.whereClause}`,
      sql.params,
    );
    const { limitRef, offsetRef } = sql.paginate(
      filters.perPage,
      (filters.page - 1) * filters.perPage,
    );
    const rows = await db.query<Record<string, unknown>>(
      `${selectBase} ${sql.whereClause}
        order by a.data desc, a.ora desc nulls last limit ${limitRef} offset ${offsetRef}`,
      sql.params,
    );
    const items = await Promise.all(rows.map(buildAssemblea));
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

assembleeRouter.get(
  "/prossime",
  asyncHandler(async (_req, res) => {
    const db = getDb();
    const rows = await db.query<Record<string, unknown>>(
      `${selectBase}
        where a.data >= current_date and a.stato in ('programmata','convocata')
        order by a.data asc, a.ora asc nulls last limit 10`,
    );
    const items = await Promise.all(
      rows.map(async (row) => {
        const punti = await db.query<{ count: string }>(
          "select count(*)::int as count from assemblea_punti where assemblea_id = $1",
          [row.id],
        );
        return {
          id: String(row.id),
          condominioId: String(row.condominio_id),
          condominio: String(row.condominio),
          data: toDateString(row.data) ?? "",
          ora: row.ora ? String(row.ora).slice(0, 5) : null,
          tipo: String(row.tipo),
          stato: String(row.stato),
          punti: Number(punti[0]?.count ?? 0),
        };
      }),
    );
    res.json({ items });
  }),
);

assembleeRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = validate(assembleaSchema, req.body);
    const db = getDb();
    const condominio = await db.query(
      "select id from condomini where id = $1",
      [body.condominioId],
    );
    if (condominio.length === 0) notFound("Condominio non trovato");
    const id = uuid();
    await db.transaction(async (tx) => {
      await tx.query(
        `insert into assemblee (id, condominio_id, data, ora, tipo, luogo, modalita, stato, quorum_registrato, note, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          id,
          body.condominioId,
          body.data,
          body.ora ?? null,
          body.tipo,
          body.luogo ?? null,
          body.modalita,
          body.stato,
          body.quorumRegistrato ?? null,
          body.note ?? null,
          req.auth!.user.id,
        ],
      );
      await audit(tx, {
        userId: req.auth!.user.id,
        attoreEmail: req.auth!.user.email,
        azione: "assemblea_creata",
        entitaTipo: "assemblea",
        entitaId: id,
        descrizione: `Creata assemblea del ${body.data}`,
        ipHash: req.ipHash,
      });
    });
    const row = (
      await db.query<Record<string, unknown>>(`${selectBase} where a.id = $1`, [
        id,
      ])
    )[0]!;
    res.status(201).json(await buildAssemblea(row));
  }),
);

assembleeRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const rows = await getDb().query<Record<string, unknown>>(
      `${selectBase} where a.id = $1`,
      [id],
    );
    if (!rows[0]) notFound("Assemblea non trovata");
    res.json(await buildAssemblea(rows[0]));
  }),
);

assembleeRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const body = validate(assembleaSchema.partial(), req.body);
    const db = getDb();
    const rows = await db.query<Record<string, unknown>>(
      "select * from assemblee where id = $1",
      [id],
    );
    if (!rows[0]) notFound("Assemblea non trovata");
    const map: Record<string, string> = {
      condominioId: "condominio_id",
      data: "data",
      ora: "ora",
      tipo: "tipo",
      luogo: "luogo",
      modalita: "modalita",
      stato: "stato",
      quorumRegistrato: "quorum_registrato",
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
          `update assemblee set ${sets.join(", ")} where id = $1`,
          params,
        );
        await audit(tx, {
          userId: req.auth!.user.id,
          attoreEmail: req.auth!.user.email,
          azione: "assemblea_modificata",
          entitaTipo: "assemblea",
          entitaId: id,
          descrizione: "Modificata assemblea",
          ipHash: req.ipHash,
        });
      });
    }
    const row = (
      await db.query<Record<string, unknown>>(`${selectBase} where a.id = $1`, [
        id,
      ])
    )[0]!;
    res.json(await buildAssemblea(row));
  }),
);

/* --------------------------- Punti all'ordine del giorno ------------------ */

assembleeRouter.post(
  "/:id/punti",
  asyncHandler(async (req, res) => {
    const assembleaId = validate(uuidParam, req.params.id);
    const body = validate(assembleaPuntoSchema, req.body);
    const db = getDb();
    const check = await db.query("select id from assemblee where id = $1", [
      assembleaId,
    ]);
    if (check.length === 0) notFound("Assemblea non trovata");
    let ordine = body.ordine;
    if (!ordine) {
      const rows = await db.query<{ max: string | null }>(
        "select max(ordine) as max from assemblea_punti where assemblea_id = $1",
        [assembleaId],
      );
      ordine = Number(rows[0]?.max ?? 0) + 1;
    }
    await db.query(
      `insert into assemblea_punti (id, assemblea_id, ordine, titolo, descrizione, delibera, esito)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        uuid(),
        assembleaId,
        ordine,
        body.titolo,
        body.descrizione ?? null,
        body.delibera ?? null,
        body.esito ?? null,
      ],
    );
    const row = (
      await db.query<Record<string, unknown>>(`${selectBase} where a.id = $1`, [
        assembleaId,
      ])
    )[0]!;
    res.status(201).json(await buildAssemblea(row));
  }),
);

async function assertPuntoAssemblea(
  assembleaId: string,
  puntoId: string,
): Promise<void> {
  const rows = await getDb().query(
    "select id from assemblea_punti where id = $1 and assemblea_id = $2",
    [puntoId, assembleaId],
  );
  if (rows.length === 0) notFound("Punto all’ordine del giorno non trovato");
}

assembleeRouter.patch(
  "/:id/punti/:puntoId",
  asyncHandler(async (req, res) => {
    const assembleaId = validate(uuidParam, req.params.id);
    const puntoId = validate(uuidParam, req.params.puntoId);
    const body = validate(assembleaPuntoSchema.partial(), req.body);
    await assertPuntoAssemblea(assembleaId, puntoId);
    const map: Record<string, string> = {
      ordine: "ordine",
      titolo: "titolo",
      descrizione: "descrizione",
      delibera: "delibera",
      esito: "esito",
    };
    const sets: string[] = [];
    const params: unknown[] = [puntoId];
    for (const [key, column] of Object.entries(map)) {
      if (!(key in body)) continue;
      params.push((body as Record<string, unknown>)[key] ?? null);
      sets.push(`${column} = $${params.length}`);
    }
    if (sets.length) {
      sets.push("updated_at = now()");
      await getDb().query(
        `update assemblea_punti set ${sets.join(", ")} where id = $1`,
        params,
      );
    }
    const row = (
      await getDb().query<Record<string, unknown>>(
        `${selectBase} where a.id = $1`,
        [assembleaId],
      )
    )[0]!;
    res.json(await buildAssemblea(row));
  }),
);

assembleeRouter.delete(
  "/:id/punti/:puntoId",
  asyncHandler(async (req, res) => {
    const assembleaId = validate(uuidParam, req.params.id);
    const puntoId = validate(uuidParam, req.params.puntoId);
    await assertPuntoAssemblea(assembleaId, puntoId);
    await getDb().query("delete from assemblea_punti where id = $1", [puntoId]);
    const row = (
      await getDb().query<Record<string, unknown>>(
        `${selectBase} where a.id = $1`,
        [assembleaId],
      )
    )[0]!;
    res.json(await buildAssemblea(row));
  }),
);

/* ----------------------------- Partecipanti ------------------------------- */

assembleeRouter.post(
  "/:id/partecipanti",
  asyncHandler(async (req, res) => {
    const assembleaId = validate(uuidParam, req.params.id);
    const body = validate(assembleaPartecipanteSchema, req.body);
    const db = getDb();
    const check = await db.query<{ condominio_id: string }>(
      "select condominio_id from assemblee where id = $1",
      [assembleaId],
    );
    if (check.length === 0) notFound("Assemblea non trovata");
    if (!body.personaId && !body.nomeEsterno) {
      badRequest("Indica una persona esistente o un nome esterno", {
        personaId: "Persona o nome obbligatorio",
      });
    }
    if (body.unitaId) {
      const unita = await db.query(
        "select id from unita where id = $1 and condominio_id = $2",
        [body.unitaId, check[0]!.condominio_id],
      );
      if (unita.length === 0)
        badRequest("L’unità non appartiene al condominio dell’assemblea", {
          unitaId: "Unità non valida",
        });
    }
    await db.query(
      `insert into assemblea_partecipanti (id, assemblea_id, persona_id, unita_id, nome_esterno, presente, delegante, millesimi, note)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        uuid(),
        assembleaId,
        body.personaId ?? null,
        body.unitaId ?? null,
        body.nomeEsterno ?? null,
        body.presente,
        body.delegante ?? null,
        body.millesimi ?? null,
        body.note ?? null,
      ],
    );
    const row = (
      await db.query<Record<string, unknown>>(`${selectBase} where a.id = $1`, [
        assembleaId,
      ])
    )[0]!;
    res.status(201).json(await buildAssemblea(row));
  }),
);

assembleeRouter.patch(
  "/:id/partecipanti/:partecipanteId",
  asyncHandler(async (req, res) => {
    const assembleaId = validate(uuidParam, req.params.id);
    const partecipanteId = validate(uuidParam, req.params.partecipanteId);
    const body = validate(assembleaPartecipanteSchema.partial(), req.body);
    const check = await getDb().query(
      "select id from assemblea_partecipanti where id = $1 and assemblea_id = $2",
      [partecipanteId, assembleaId],
    );
    if (check.length === 0) notFound("Partecipante non trovato");
    const map: Record<string, string> = {
      personaId: "persona_id",
      unitaId: "unita_id",
      nomeEsterno: "nome_esterno",
      presente: "presente",
      delegante: "delegante",
      millesimi: "millesimi",
      note: "note",
    };
    const sets: string[] = [];
    const params: unknown[] = [partecipanteId];
    for (const [key, column] of Object.entries(map)) {
      if (!(key in body)) continue;
      params.push((body as Record<string, unknown>)[key] ?? null);
      sets.push(`${column} = $${params.length}`);
    }
    if (sets.length)
      await getDb().query(
        `update assemblea_partecipanti set ${sets.join(", ")} where id = $1`,
        params,
      );
    const row = (
      await getDb().query<Record<string, unknown>>(
        `${selectBase} where a.id = $1`,
        [assembleaId],
      )
    )[0]!;
    res.json(await buildAssemblea(row));
  }),
);

assembleeRouter.delete(
  "/:id/partecipanti/:partecipanteId",
  asyncHandler(async (req, res) => {
    const assembleaId = validate(uuidParam, req.params.id);
    const partecipanteId = validate(uuidParam, req.params.partecipanteId);
    await getDb().query(
      "delete from assemblea_partecipanti where id = $1 and assemblea_id = $2",
      [partecipanteId, assembleaId],
    );
    const row = (
      await getDb().query<Record<string, unknown>>(
        `${selectBase} where a.id = $1`,
        [assembleaId],
      )
    )[0]!;
    res.json(await buildAssemblea(row));
  }),
);

export { toIsoString };
