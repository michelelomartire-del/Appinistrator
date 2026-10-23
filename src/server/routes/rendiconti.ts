import { Router } from "express";
import { z } from "zod";
import { audit } from "../audit.js";
import { getDb, toDateString, toIsoString, uuid } from "../db.js";
import {
  asyncHandler,
  badRequest,
  conflict,
  notFound,
  paginated,
  validate,
} from "../http.js";
import { Sql, toNumber, toNumberOrNull } from "../sql.js";
import { calcolaRata, sintesiPeriodo } from "../services/calcoli.js";
import {
  pagamentoSchema,
  periodoBaseSchema,
  periodoFilterSchema,
  periodoSchema,
  rataSchema,
  spesaSchema,
  uuidParam,
} from "../../shared/schemas.js";
import type { PeriodoDto, RataDto } from "../../shared/api-types.js";

export const rendicontiRouter = Router();

/* ------------------------------------------------------------------------- */
/* Periodi contabili                                                         */
/* ------------------------------------------------------------------------- */

async function periodoSummary(periodoId: string): Promise<PeriodoDto> {
  const db = getDb();
  const rows = await db.query<Record<string, unknown>>(
    `select p.*, c.denominazione as condominio,
            (select coalesce(sum(s.importo),0) from spese s where s.periodo_id = p.id) as totale_spese,
            (select count(*)::int from spese s where s.periodo_id = p.id) as numero_spese,
            (select coalesce(sum(r.importo),0) from rate r where r.periodo_id = p.id) as totale_rate,
            (select count(*)::int from rate r where r.periodo_id = p.id) as rate_count,
            (select count(*)::int from rate r where r.periodo_id = p.id and r.unita_id is null) as rate_senza_unita,
            (select count(*)::int from rate r where r.periodo_id = p.id and r.criteri_ripartizione is not null and trim(r.criteri_ripartizione) <> '') as rate_con_criterio,
            (select count(*)::int from unita u where u.condominio_id = p.condominio_id and u.archiviato = false and u.millesimi is null) as unita_senza_millesimi
       from periodi_contabili p join condomini c on c.id = p.condominio_id where p.id = $1`,
    [periodoId],
  );
  const row = rows[0];
  if (!row) notFound("Periodo contabile non trovato");
  const rateRows = await db.query<{
    importo: string;
    scadenza: string;
    unita_id: string | null;
    incassato: string;
  }>(
    `select r.importo, r.scadenza, r.unita_id, coalesce(sum(pg.importo),0) as incassato
       from rate r left join pagamenti pg on pg.rata_id = r.id
      where r.periodo_id = $1 group by r.id`,
    [periodoId],
  );
  const sintesi = sintesiPeriodo({
    spese: [{ importo: toNumber(row.totale_spese) }],
    rate: rateRows.map((r) => ({
      importo: toNumber(r.importo),
      scadenza: toDateString(r.scadenza) ?? "",
      unitaId: r.unita_id,
      incassato: toNumber(r.incassato),
    })),
    criteriRipartizionePresenti: toNumber(row.rate_con_criterio) > 0,
    unitaSenzaMillesimi: toNumber(row.unita_senza_millesimi),
    rateSenzaUnita: toNumber(row.rate_senza_unita),
  });
  return {
    id: String(row.id),
    condominioId: String(row.condominio_id),
    condominio: String(row.condominio),
    etichetta: String(row.etichetta),
    dataInizio: toDateString(row.data_inizio) ?? "",
    dataFine: toDateString(row.data_fine) ?? "",
    stato: String(row.stato),
    note: (row.note as string) ?? null,
    totaleSpese: sintesi.totaleSpese,
    numeroSpese: sintesi.numeroSpese,
    totaleRate: sintesi.totaleRate,
    incassato: sintesi.incassato,
    residuo: sintesi.residuo,
    rateCount: rateRows.length,
    rateScaduteNonPagate: sintesi.rateScaduteNonPagate,
    unitaSenzaMillesimi: toNumber(row.unita_senza_millesimi),
    avvisiCalcolo: sintesi.avvisi.map((a) => a.messaggio),
  };
}

rendicontiRouter.get(
  "/periodi",
  asyncHandler(async (req, res) => {
    const filters = validate(periodoFilterSchema, req.query);
    const sql = new Sql();
    sql.andIf(
      filters.condominioId,
      "p.condominio_id = ?",
      filters.condominioId,
    );
    sql.andIf(filters.stato, "p.stato = ?", filters.stato);
    if (filters.anno) {
      sql.and("extract(year from p.data_inizio) = ?", filters.anno);
    }
    const db = getDb();
    const totalRows = await db.query<{ count: string }>(
      `select count(*)::int as count from periodi_contabili p ${sql.whereClause}`,
      sql.params,
    );
    const { limitRef, offsetRef } = sql.paginate(
      filters.perPage,
      (filters.page - 1) * filters.perPage,
    );
    const rows = await db.query<{ id: string }>(
      `select p.id from periodi_contabili p join condomini c on c.id = p.condominio_id
        ${sql.whereClause} order by p.data_inizio desc, lower(c.denominazione) limit ${limitRef} offset ${offsetRef}`,
      sql.params,
    );
    const items = await Promise.all(rows.map((r) => periodoSummary(r.id)));
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

rendicontiRouter.post(
  "/periodi",
  asyncHandler(async (req, res) => {
    const body = validate(periodoSchema, req.body);
    const db = getDb();
    const condominio = await db.query(
      "select id from condomini where id = $1",
      [body.condominioId],
    );
    if (condominio.length === 0) notFound("Condominio non trovato");
    const overlap = await db.query(
      `select id from periodi_contabili where condominio_id = $1 and data_inizio <= $3 and data_fine >= $2`,
      [body.condominioId, body.dataInizio, body.dataFine],
    );
    if (overlap.length > 0)
      conflict(
        "Esiste già un periodo contabile sovrapposto per questo condominio",
      );
    const id = uuid();
    await db.transaction(async (tx) => {
      await tx.query(
        `insert into periodi_contabili (id, condominio_id, etichetta, data_inizio, data_fine, stato, note, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          id,
          body.condominioId,
          body.etichetta,
          body.dataInizio,
          body.dataFine,
          body.stato,
          body.note ?? null,
          req.auth!.user.id,
        ],
      );
      await audit(tx, {
        userId: req.auth!.user.id,
        attoreEmail: req.auth!.user.email,
        azione: "periodo_creato",
        entitaTipo: "periodo_contabile",
        entitaId: id,
        descrizione: `Creato periodo contabile ${body.etichetta}`,
        ipHash: req.ipHash,
      });
    });
    res.status(201).json(await periodoSummary(id));
  }),
);

rendicontiRouter.get(
  "/periodi/:id",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const summary = await periodoSummary(id);
    const db = getDb();
    const spese = await db.query<Record<string, unknown>>(
      "select * from spese where periodo_id = $1 order by data desc",
      [id],
    );
    const rate = await db.query<Record<string, unknown>>(
      `select r.*, u.identificativo as unita,
              coalesce(sum(pg.importo),0) as incassato,
              count(pg.id)::int as pagamenti_count
         from rate r
         left join unita u on u.id = r.unita_id
         left join pagamenti pg on pg.rata_id = r.id
        where r.periodo_id = $1
        group by r.id, u.identificativo
        order by r.scadenza, u.identificativo`,
      [id],
    );
    const pagamenti = await db.query<Record<string, unknown>>(
      `select pg.*, r.descrizione as rata_descrizione
         from pagamenti pg join rate r on r.id = pg.rata_id
        where r.periodo_id = $1 order by pg.data desc`,
      [id],
    );
    res.json({
      ...summary,
      spese: spese.map((s) => ({
        id: String(s.id),
        periodoId: String(s.periodo_id),
        data: toDateString(s.data),
        descrizione: String(s.descrizione),
        categoria: (s.categoria as string) ?? null,
        importo: toNumber(s.importo),
        fornitore: (s.fornitore as string) ?? null,
        riferimento: (s.riferimento as string) ?? null,
        note: (s.note as string) ?? null,
      })),
      rate: rate.map((r) => {
        const importo = toNumber(r.importo);
        const incassato = toNumber(r.incassato);
        const calc = calcolaRata(
          importo,
          incassato,
          toDateString(r.scadenza) ?? "",
        );
        return {
          id: String(r.id),
          periodoId: String(r.periodo_id),
          unitaId: (r.unita_id as string) ?? null,
          unita: (r.unita as string) ?? null,
          descrizione: String(r.descrizione),
          numero: (r.numero as string) ?? null,
          scadenza: toDateString(r.scadenza) ?? "",
          importo,
          incassato: calc.incassato,
          residuo: calc.residuo,
          stato: calc.stato,
          criteriRipartizione: (r.criteri_ripartizione as string) ?? null,
          pagamentiCount: Number(r.pagamenti_count ?? 0),
        } satisfies RataDto;
      }),
      pagamenti: pagamenti.map((p) => ({
        id: String(p.id),
        rataId: String(p.rata_id),
        rataDescrizione: String(p.rata_descrizione),
        data: toDateString(p.data),
        importo: toNumber(p.importo),
        metodo: (p.metodo as string) ?? null,
        riferimento: (p.riferimento as string) ?? null,
        note: (p.note as string) ?? null,
        createdAt: toIsoString(p.created_at),
      })),
    });
  }),
);

rendicontiRouter.patch(
  "/periodi/:id",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const body = validate(
      periodoBaseSchema.partial().omit({ condominioId: true }),
      req.body,
    );
    const db = getDb();
    const current = await db.query<Record<string, unknown>>(
      "select * from periodi_contabili where id = $1",
      [id],
    );
    if (!current[0]) notFound("Periodo non trovato");
    const inizio = body.dataInizio ?? toDateString(current[0].data_inizio)!;
    const fine = body.dataFine ?? toDateString(current[0].data_fine)!;
    if (fine < inizio)
      badRequest("La data di fine non può precedere quella di inizio", {
        dataFine: "Intervallo non valido",
      });
    const map: Record<string, string> = {
      etichetta: "etichetta",
      dataInizio: "data_inizio",
      dataFine: "data_fine",
      stato: "stato",
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
          `update periodi_contabili set ${sets.join(", ")} where id = $1`,
          params,
        );
        await audit(tx, {
          userId: req.auth!.user.id,
          attoreEmail: req.auth!.user.email,
          azione:
            body.stato === "chiuso" ? "periodo_chiuso" : "periodo_modificato",
          entitaTipo: "periodo_contabile",
          entitaId: id,
          descrizione: `Modificato periodo ${String(current[0]!.etichetta)}`,
          ipHash: req.ipHash,
        });
      });
    }
    res.json(await periodoSummary(id));
  }),
);

rendicontiRouter.delete(
  "/periodi/:id",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const db = getDb();
    const rows = await db.query<Record<string, unknown>>(
      "select * from periodi_contabili where id = $1",
      [id],
    );
    if (!rows[0]) notFound("Periodo non trovato");
    if (rows[0]!.stato === "chiuso") {
      throw conflict(
        "Un periodo chiuso non può essere eliminato: riaprilo prima come bozza.",
      );
    }
    await db.transaction(async (tx) => {
      await tx.query("delete from periodi_contabili where id = $1", [id]);
      await audit(tx, {
        userId: req.auth!.user.id,
        attoreEmail: req.auth!.user.email,
        azione: "periodo_eliminato",
        entitaTipo: "periodo_contabile",
        entitaId: id,
        descrizione: `Eliminato periodo ${String(rows[0]!.etichetta)} (in bozza)`,
        ipHash: req.ipHash,
      });
    });
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------------------- */
/* Spese                                                                     */
/* ------------------------------------------------------------------------- */

async function assertPeriodoModificabile(periodoId: string): Promise<void> {
  const rows = await getDb().query<{ stato: string }>(
    "select stato from periodi_contabili where id = $1",
    [periodoId],
  );
  if (!rows[0]) notFound("Periodo contabile non trovato");
  if (rows[0].stato === "chiuso") {
    throw conflict(
      "Il periodo è chiuso: riaprilo in bozza per modificare spese e rate.",
    );
  }
}

rendicontiRouter.post(
  "/periodi/:id/spese",
  asyncHandler(async (req, res) => {
    const periodoId = validate(uuidParam, req.params.id);
    const body = validate(spesaSchema.omit({ periodoId: true }), req.body);
    await assertPeriodoModificabile(periodoId);
    const id = uuid();
    const db = getDb();
    await db.transaction(async (tx) => {
      await tx.query(
        `insert into spese (id, periodo_id, data, descrizione, categoria, importo, fornitore, riferimento, note, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          id,
          periodoId,
          body.data,
          body.descrizione,
          body.categoria ?? null,
          body.importo,
          body.fornitore ?? null,
          body.riferimento ?? null,
          body.note ?? null,
          req.auth!.user.id,
        ],
      );
      await audit(tx, {
        userId: req.auth!.user.id,
        attoreEmail: req.auth!.user.email,
        azione: "spesa_creata",
        entitaTipo: "spesa",
        entitaId: id,
        descrizione: `Registrata spesa "${body.descrizione}"`,
        ipHash: req.ipHash,
      });
    });
    res
      .status(201)
      .json({ ok: true, periodo: await periodoSummary(periodoId) });
  }),
);

rendicontiRouter.patch(
  "/spese/:id",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const body = validate(
      spesaSchema.partial().omit({ periodoId: true }),
      req.body,
    );
    const db = getDb();
    const rows = await db.query<Record<string, unknown>>(
      "select * from spese where id = $1",
      [id],
    );
    if (!rows[0]) notFound("Spesa non trovata");
    await assertPeriodoModificabile(String(rows[0].periodo_id));
    const map: Record<string, string> = {
      data: "data",
      descrizione: "descrizione",
      categoria: "categoria",
      importo: "importo",
      fornitore: "fornitore",
      riferimento: "riferimento",
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
          `update spese set ${sets.join(", ")} where id = $1`,
          params,
        );
        await audit(tx, {
          userId: req.auth!.user.id,
          attoreEmail: req.auth!.user.email,
          azione: "spesa_modificata",
          entitaTipo: "spesa",
          entitaId: id,
          descrizione: `Modificata spesa "${String(rows[0]!.descrizione)}"`,
          ipHash: req.ipHash,
        });
      });
    }
    res.json({
      ok: true,
      periodo: await periodoSummary(String(rows[0].periodo_id)),
    });
  }),
);

rendicontiRouter.delete(
  "/spese/:id",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const db = getDb();
    const rows = await db.query<Record<string, unknown>>(
      "select * from spese where id = $1",
      [id],
    );
    if (!rows[0]) notFound("Spesa non trovata");
    await assertPeriodoModificabile(String(rows[0].periodo_id));
    await db.transaction(async (tx) => {
      await tx.query("delete from spese where id = $1", [id]);
      await audit(tx, {
        userId: req.auth!.user.id,
        attoreEmail: req.auth!.user.email,
        azione: "spesa_eliminata",
        entitaTipo: "spesa",
        entitaId: id,
        descrizione: `Eliminata spesa "${String(rows[0]!.descrizione)}"`,
        ipHash: req.ipHash,
      });
    });
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------------------- */
/* Rate e pagamenti                                                          */
/* ------------------------------------------------------------------------- */

rendicontiRouter.post(
  "/periodi/:id/rate",
  asyncHandler(async (req, res) => {
    const periodoId = validate(uuidParam, req.params.id);
    const body = validate(rataSchema.omit({ periodoId: true }), req.body);
    await assertPeriodoModificabile(periodoId);
    const db = getDb();
    const periodo = await db.query<{ condominio_id: string }>(
      "select condominio_id from periodi_contabili where id = $1",
      [periodoId],
    );
    if (body.unitaId) {
      const unita = await db.query(
        "select id from unita where id = $1 and condominio_id = $2",
        [body.unitaId, periodo[0]!.condominio_id],
      );
      if (unita.length === 0)
        badRequest("L’unità non appartiene al condominio del periodo", {
          unitaId: "Unità non valida",
        });
    }
    const id = uuid();
    await db.transaction(async (tx) => {
      await tx.query(
        `insert into rate (id, periodo_id, unita_id, descrizione, numero, scadenza, importo, criteri_ripartizione, note, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          id,
          periodoId,
          body.unitaId ?? null,
          body.descrizione,
          body.numero ?? null,
          body.scadenza,
          body.importo,
          body.criteriRipartizione ?? null,
          body.note ?? null,
          req.auth!.user.id,
        ],
      );
      await audit(tx, {
        userId: req.auth!.user.id,
        attoreEmail: req.auth!.user.email,
        azione: "rata_creata",
        entitaTipo: "rata",
        entitaId: id,
        descrizione: `Registrata rata "${body.descrizione}"`,
        ipHash: req.ipHash,
      });
    });
    res
      .status(201)
      .json({ ok: true, periodo: await periodoSummary(periodoId) });
  }),
);

rendicontiRouter.patch(
  "/rate/:id",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const body = validate(
      rataSchema.partial().omit({ periodoId: true }),
      req.body,
    );
    const db = getDb();
    const rows = await db.query<Record<string, unknown>>(
      "select * from rate where id = $1",
      [id],
    );
    if (!rows[0]) notFound("Rata non trovata");
    await assertPeriodoModificabile(String(rows[0].periodo_id));
    const map: Record<string, string> = {
      unitaId: "unita_id",
      descrizione: "descrizione",
      numero: "numero",
      scadenza: "scadenza",
      importo: "importo",
      criteriRipartizione: "criteri_ripartizione",
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
          `update rate set ${sets.join(", ")} where id = $1`,
          params,
        );
        await audit(tx, {
          userId: req.auth!.user.id,
          attoreEmail: req.auth!.user.email,
          azione: "rata_modificata",
          entitaTipo: "rata",
          entitaId: id,
          descrizione: `Modificata rata "${String(rows[0]!.descrizione)}"`,
          ipHash: req.ipHash,
        });
      });
    }
    res.json({
      ok: true,
      periodo: await periodoSummary(String(rows[0].periodo_id)),
    });
  }),
);

rendicontiRouter.delete(
  "/rate/:id",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const db = getDb();
    const rows = await db.query<Record<string, unknown>>(
      "select * from rate where id = $1",
      [id],
    );
    if (!rows[0]) notFound("Rata non trovata");
    await assertPeriodoModificabile(String(rows[0].periodo_id));
    const pagamenti = await db.query<{ count: string }>(
      "select count(*)::int as count from pagamenti where rata_id = $1",
      [id],
    );
    if (Number(pagamenti[0]?.count ?? 0) > 0) {
      throw conflict(
        "La rata ha pagamenti registrati: elimina prima i pagamenti.",
      );
    }
    await db.transaction(async (tx) => {
      await tx.query("delete from rate where id = $1", [id]);
      await audit(tx, {
        userId: req.auth!.user.id,
        attoreEmail: req.auth!.user.email,
        azione: "rata_eliminata",
        entitaTipo: "rata",
        entitaId: id,
        descrizione: `Eliminata rata "${String(rows[0]!.descrizione)}"`,
        ipHash: req.ipHash,
      });
    });
    res.json({ ok: true });
  }),
);

rendicontiRouter.post(
  "/rate/:id/pagamenti",
  asyncHandler(async (req, res) => {
    const rataId = validate(uuidParam, req.params.id);
    const body = validate(pagamentoSchema, req.body);
    const db = getDb();
    const rata = await db.query<Record<string, unknown>>(
      `select r.*, p.stato as periodo_stato from rate r join periodi_contabili p on p.id = r.periodo_id where r.id = $1`,
      [rataId],
    );
    if (!rata[0]) notFound("Rata non trovata");
    if (rata[0].periodo_stato === "chiuso")
      throw conflict("Il periodo è chiuso: riaprilo per registrare pagamenti.");
    const incassati = await db.query<{ totale: string }>(
      "select coalesce(sum(importo),0) as totale from pagamenti where rata_id = $1",
      [rataId],
    );
    const giaIncassato = toNumber(incassati[0]?.totale);
    const importoRata = toNumber(rata[0].importo);
    if (giaIncassato + body.importo > importoRata + 0.004) {
      badRequest(
        `Il pagamento supera l’importo della rata (${importoRata.toFixed(2)} €, già incassati ${giaIncassato.toFixed(2)} €). Correggi l’importo.`,
        { importo: "Importo superiore al residuo" },
      );
    }
    const id = uuid();
    await db.transaction(async (tx) => {
      await tx.query(
        `insert into pagamenti (id, rata_id, data, importo, metodo, riferimento, note, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          id,
          rataId,
          body.data,
          body.importo,
          body.metodo ?? null,
          body.riferimento ?? null,
          body.note ?? null,
          req.auth!.user.id,
        ],
      );
      await audit(tx, {
        userId: req.auth!.user.id,
        attoreEmail: req.auth!.user.email,
        azione: "pagamento_registrato",
        entitaTipo: "rata",
        entitaId: rataId,
        descrizione: `Registrato pagamento di ${body.importo.toFixed(2)} €`,
        ipHash: req.ipHash,
      });
    });
    res
      .status(201)
      .json({
        ok: true,
        periodo: await periodoSummary(String(rata[0].periodo_id)),
      });
  }),
);

rendicontiRouter.delete(
  "/pagamenti/:id",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const db = getDb();
    const rows = await db.query<Record<string, unknown>>(
      `select pg.*, r.periodo_id, p.stato as periodo_stato from pagamenti pg
         join rate r on r.id = pg.rata_id join periodi_contabili p on p.id = r.periodo_id where pg.id = $1`,
      [id],
    );
    if (!rows[0]) notFound("Pagamento non trovato");
    if (rows[0].periodo_stato === "chiuso")
      throw conflict(
        "Il periodo è chiuso: riaprilo per modificare i pagamenti.",
      );
    await db.transaction(async (tx) => {
      await tx.query("delete from pagamenti where id = $1", [id]);
      await audit(tx, {
        userId: req.auth!.user.id,
        attoreEmail: req.auth!.user.email,
        azione: "pagamento_eliminato",
        entitaTipo: "pagamento",
        entitaId: id,
        descrizione: `Eliminato pagamento di ${toNumber(rows[0]!.importo).toFixed(2)} €`,
        ipHash: req.ipHash,
      });
    });
    res.json({
      ok: true,
      periodo: await periodoSummary(String(rows[0].periodo_id)),
    });
  }),
);

/* ------------------------------------------------------------------------- */
/* Scadenze e riepilogo                                                      */
/* ------------------------------------------------------------------------- */

const scadenzeQuerySchema = z.object({
  giorni: z.coerce.number().int().min(0).max(365).optional().default(30),
  condominioId: z.string().uuid().optional(),
});

rendicontiRouter.get(
  "/scadenze",
  asyncHandler(async (req, res) => {
    const filters = validate(scadenzeQuerySchema, req.query);
    const db = getDb();
    const params: unknown[] = [filters.giorni];
    let extra = "";
    if (filters.condominioId) {
      params.push(filters.condominioId);
      extra = ` and c.id = $${params.length}`;
    }
    const rows = await db.query<Record<string, unknown>>(
      `select r.id, r.descrizione, r.scadenza, r.importo, c.denominazione as condominio, c.id as condominio_id,
              pc.etichetta, coalesce(sum(pg.importo),0) as incassato
         from rate r
         join periodi_contabili pc on pc.id = r.periodo_id
         join condomini c on c.id = pc.condominio_id
         left join pagamenti pg on pg.rata_id = r.id
        where r.scadenza <= current_date + $1::int${extra}
        group by r.id, c.denominazione, c.id, pc.etichetta
       having coalesce(sum(pg.importo),0) < r.importo
        order by r.scadenza asc limit 100`,
      params,
    );
    res.json({
      items: rows.map((r) => {
        const importo = toNumber(r.importo);
        const incassato = toNumber(r.incassato);
        return {
          id: String(r.id),
          descrizione: String(r.descrizione),
          condominio: String(r.condominio),
          condominioId: String(r.condominio_id),
          etichetta: String(r.etichetta),
          scadenza: toDateString(r.scadenza),
          importo,
          incassato,
          residuo: Math.round((importo - incassato) * 100) / 100,
          scaduta:
            (toDateString(r.scadenza) ?? "") <
            new Date().toISOString().slice(0, 10),
        };
      }),
    });
  }),
);

export { toNumberOrNull };
