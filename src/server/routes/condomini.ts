import { Router } from "express";
import { z } from "zod";
import { audit, diffFields } from "../audit.js";
import { getDb, uuid } from "../db.js";
import {
  asyncHandler,
  badRequest,
  conflict,
  notFound,
  paginated,
  validate,
} from "../http.js";
import { Sql } from "../sql.js";
import { roundMillesimi, sumMillesimi } from "../services/calcoli.js";
import {
  assertCondominioExists,
  assertUniqueCondominioCf,
  getCondominio,
  listCondomini,
  loadUnita,
  nextCodiceCondominio,
} from "../services/condomini.js";
import {
  condominioCreateSchema,
  condominioFilterSchema,
  condominioUpdateSchema,
  optionalUuid,
  personaSchema,
  relazionePersonaCondominioSchema,
  unitaPersonaSchema,
  unitaSchema,
  uuidParam,
} from "../../shared/schemas.js";
import { toDateString, toIsoString } from "../db.js";
import { RUOLI_PERSONA_CONDOMINIO } from "../../shared/constants.js";

export const condominiRouter = Router();

const updateBodySchema = condominioUpdateSchema.extend({}).strict();

/* ------------------------------------------------------------------------- */
/* Elenco e opzioni                                                          */
/* ------------------------------------------------------------------------- */

condominiRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const filters = validate(condominioFilterSchema, req.query);
    const { items, total } = await listCondomini(filters);
    res.json(paginated(items, total, filters.page, filters.perPage));
  }),
);

condominiRouter.get(
  "/options",
  asyncHandler(async (_req, res) => {
    const rows = await getDb().query<{
      id: string;
      codice: string;
      denominazione: string;
      comune: string | null;
      stato: string;
    }>(
      `select id, codice, denominazione, comune, stato from condomini
        where archiviato = false order by lower(denominazione)`,
    );
    res.json({ items: rows });
  }),
);

/* ------------------------------------------------------------------------- */
/* Creazione                                                                 */
/* ------------------------------------------------------------------------- */

async function assertUniqueDenominazione(
  denominazione: string,
  comune: string | null | undefined,
  excludeId?: string,
): Promise<void> {
  const rows = await getDb().query<{ id: string; codice: string }>(
    `select id, codice from condomini
      where lower(denominazione) = lower($1)
        and lower(coalesce(comune,'')) = lower(coalesce($2,''))
        and ($3::uuid is null or id <> $3::uuid)`,
    [denominazione, comune ?? "", excludeId ?? null],
  );
  if (rows.length > 0) {
    conflict(
      `Esiste già un condominio con questa denominazione e comune (codice ${rows[0]!.codice}). Aprilo per evitare duplicati.`,
    );
  }
}

condominiRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = validate(condominioCreateSchema, req.body);
    if (
      body.dataInizioIncarico &&
      body.dataFineIncarico &&
      body.dataFineIncarico < body.dataInizioIncarico
    ) {
      badRequest(
        "La data di fine incarico non può precedere quella di inizio",
        {
          dataFineIncarico: "Data fine precedente alla data inizio",
        },
      );
    }
    await assertUniqueDenominazione(body.denominazione, body.comune);
    await assertUniqueCondominioCf(getDb(), body.codiceFiscale);

    const db = getDb();
    const id = uuid();
    const codice = await nextCodiceCondominio();
    await db.transaction(async (tx) => {
      await tx.query(
        `insert into condomini (id, codice, denominazione, indirizzo, cap, comune, provincia, codice_fiscale, stato,
            data_inizio_incarico, data_fine_incarico, note, created_by)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          id,
          codice,
          body.denominazione,
          body.indirizzo ?? null,
          body.cap ?? null,
          body.comune ?? null,
          body.provincia ?? null,
          body.codiceFiscale ?? null,
          body.stato,
          body.dataInizioIncarico ?? null,
          body.dataFineIncarico ?? null,
          body.note ?? null,
          req.auth!.user.id,
        ],
      );
      await audit(tx, {
        userId: req.auth!.user.id,
        attoreEmail: req.auth!.user.email,
        azione: "condominio_creato",
        entitaTipo: "condominio",
        entitaId: id,
        descrizione: `Creato condominio ${codice}`,
        ipHash: req.ipHash,
      });
    });
    res.status(201).json(await getCondominio(id));
  }),
);

/* ------------------------------------------------------------------------- */
/* Dettaglio e modifica                                                      */
/* ------------------------------------------------------------------------- */

condominiRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    res.json(await getCondominio(id));
  }),
);

const CAMPI_MODIFICABILI = [
  "denominazione",
  "indirizzo",
  "cap",
  "comune",
  "provincia",
  "codiceFiscale",
  "stato",
  "dataInizioIncarico",
  "dataFineIncarico",
  "note",
  "archiviato",
] as const;

condominiRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const body = validate(updateBodySchema, req.body);
    const db = getDb();
    const before = await assertCondominioExists(id);
    if (body.denominazione || body.comune !== undefined) {
      await assertUniqueDenominazione(
        body.denominazione ?? before.denominazione,
        body.comune ?? before.comune,
        id,
      );
    }
    if (body.codiceFiscale !== undefined)
      await assertUniqueCondominioCf(db, body.codiceFiscale, id);

    const inizio =
      body.dataInizioIncarico !== undefined
        ? body.dataInizioIncarico
        : toDateString(before.data_inizio_incarico);
    const fine =
      body.dataFineIncarico !== undefined
        ? body.dataFineIncarico
        : toDateString(before.data_fine_incarico);
    if (inizio && fine && fine < inizio) {
      badRequest(
        "La data di fine incarico non può precedere quella di inizio",
        {
          dataFineIncarico: "Data fine precedente alla data inizio",
        },
      );
    }

    const columnMap: Record<string, string> = {
      denominazione: "denominazione",
      indirizzo: "indirizzo",
      cap: "cap",
      comune: "comune",
      provincia: "provincia",
      codiceFiscale: "codice_fiscale",
      stato: "stato",
      dataInizioIncarico: "data_inizio_incarico",
      dataFineIncarico: "data_fine_incarico",
      note: "note",
      archiviato: "archiviato",
    };

    await db.transaction(async (tx) => {
      const sets: string[] = [];
      const params: unknown[] = [id];
      for (const [key, column] of Object.entries(columnMap)) {
        if (!(key in body)) continue;
        params.push((body as Record<string, unknown>)[key] ?? null);
        sets.push(`${column} = $${params.length}`);
      }
      if (sets.length === 0) return;
      sets.push("updated_at = now()");
      await tx.query(
        `update condomini set ${sets.join(", ")} where id = $1`,
        params,
      );

      const afterRow = (
        await tx.query<Record<string, unknown>>(
          "select * from condomini where id = $1",
          [id],
        )
      )[0]!;
      const changes = diffFields(
        {
          denominazione: before.denominazione,
          indirizzo: before.indirizzo,
          cap: before.cap,
          comune: before.comune,
          provincia: before.provincia,
          codiceFiscale: before.codice_fiscale,
          stato: before.stato,
          dataInizioIncarico: toDateString(before.data_inizio_incarico),
          dataFineIncarico: toDateString(before.data_fine_incarico),
          note: before.note,
          archiviato: before.archiviato,
        },
        {
          denominazione: afterRow.denominazione,
          indirizzo: afterRow.indirizzo,
          cap: afterRow.cap,
          comune: afterRow.comune,
          provincia: afterRow.provincia,
          codiceFiscale: afterRow.codice_fiscale,
          stato: afterRow.stato,
          dataInizioIncarico: toDateString(afterRow.data_inizio_incarico),
          dataFineIncarico: toDateString(afterRow.data_fine_incarico),
          note: afterRow.note,
          archiviato: afterRow.archiviato,
        },
        [...CAMPI_MODIFICABILI],
      );
      await audit(tx, {
        userId: req.auth!.user.id,
        attoreEmail: req.auth!.user.email,
        azione:
          body.archiviato === true
            ? "condominio_archiviato"
            : "condominio_modificato",
        entitaTipo: "condominio",
        entitaId: id,
        descrizione: `Modifica condominio ${before.codice}`,
        modifiche: changes,
        ipHash: req.ipHash,
      });
    });
    res.json(await getCondominio(id));
  }),
);

condominiRouter.post(
  "/:id/archivia",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const archiviato = z.boolean().parse(req.body?.archiviato ?? true);
    const db = getDb();
    const condominio = await assertCondominioExists(id);
    await db.transaction(async (tx) => {
      await tx.query(
        "update condomini set archiviato = $2, updated_at = now() where id = $1",
        [id, archiviato],
      );
      await audit(tx, {
        userId: req.auth!.user.id,
        attoreEmail: req.auth!.user.email,
        azione: archiviato
          ? "condominio_archiviato"
          : "condominio_ripristinato",
        entitaTipo: "condominio",
        entitaId: id,
        descrizione: `${archiviato ? "Archiviato" : "Ripristinato"} condominio ${condominio.codice}`,
        ipHash: req.ipHash,
      });
    });
    res.json({ ok: true, archiviato });
  }),
);

/* ------------------------------------------------------------------------- */
/* Persone collegate al condominio                                            */
/* ------------------------------------------------------------------------- */

const linkPersonaSchema = z
  .object({
    personaId: optionalUuid.optional(),
    nuovaPersona: personaSchema.optional(),
    ruolo: z.enum(RUOLI_PERSONA_CONDOMINIO),
    qualifica: z.string().trim().max(120).optional(),
    dataInizio: z.string().optional(),
    dataFine: z.string().optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((d) => d.personaId || d.nuovaPersona, {
    message: "Indica una persona esistente o i dati della nuova persona",
    path: ["personaId"],
  });

condominiRouter.post(
  "/:id/persone",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const body = validate(linkPersonaSchema, req.body);
    const rel = validate(
      relazionePersonaCondominioSchema.omit({ personaId: true }),
      {
        ruolo: body.ruolo,
        qualifica: body.qualifica,
        dataInizio: body.dataInizio,
        dataFine: body.dataFine,
        note: body.note,
      },
    );
    const db = getDb();
    await assertCondominioExists(id);

    const personaId = await db.transaction(async (tx) => {
      let pid = body.personaId ?? null;
      if (!pid) {
        const p = body.nuovaPersona!;
        const existing = await findPersonaDuplicata(tx as never, p);
        if (existing) {
          throw conflict(
            `Esiste già una persona simile (${existing.cognome} ${existing.nome}, ${existing.email ?? "senza email"}). Collegala invece di crearne una nuova.`,
          );
        }
        pid = uuid();
        await tx.query(
          `insert into persone (id, nome, cognome, codice_fiscale, email, telefono, note, created_by)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            pid,
            p.nome,
            p.cognome,
            p.codiceFiscale ?? null,
            p.email ?? null,
            p.telefono ?? null,
            p.note ?? null,
            req.auth!.user.id,
          ],
        );
      } else {
        const exists = await tx.query<{ id: string }>(
          "select id from persone where id = $1",
          [pid],
        );
        if (exists.length === 0) notFound("Persona non trovata");
      }

      await tx.query(
        `insert into condominio_persone (id, condominio_id, persona_id, ruolo, qualifica, data_inizio, data_fine, note)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (condominio_id, persona_id, ruolo) do update
           set qualifica = excluded.qualifica, data_inizio = excluded.data_inizio,
               data_fine = excluded.data_fine, note = excluded.note, updated_at = now()`,
        [
          uuid(),
          id,
          pid,
          rel.ruolo,
          rel.qualifica ?? null,
          rel.dataInizio ?? null,
          rel.dataFine ?? null,
          rel.note ?? null,
        ],
      );
      await audit(tx, {
        userId: req.auth!.user.id,
        attoreEmail: req.auth!.user.email,
        azione: "persona_collegata",
        entitaTipo: "condominio",
        entitaId: id,
        descrizione: `Collegata persona al condominio con ruolo ${rel.ruolo}`,
        ipHash: req.ipHash,
      });
      return pid;
    });

    const detail = await getCondominio(id);
    res.status(201).json({ ok: true, personaId, condominio: detail });
  }),
);

condominiRouter.delete(
  "/:id/persone/:relazioneId",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const relazioneId = validate(uuidParam, req.params.relazioneId);
    const db = getDb();
    const rows = await db.query(
      "select id from condominio_persone where id = $1 and condominio_id = $2",
      [relazioneId, id],
    );
    if (rows.length === 0) notFound("Relazione non trovata");
    await db.transaction(async (tx) => {
      await tx.query("delete from condominio_persone where id = $1", [
        relazioneId,
      ]);
      await audit(tx, {
        userId: req.auth!.user.id,
        attoreEmail: req.auth!.user.email,
        azione: "persona_scollegata",
        entitaTipo: "condominio",
        entitaId: id,
        descrizione: "Rimossa relazione persona-condominio",
        ipHash: req.ipHash,
      });
    });
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------------------- */
/* Unità immobiliari                                                         */
/* ------------------------------------------------------------------------- */

async function assertMillesimiCoerenti(
  condominioId: string,
  newValue: number | null,
  excludeUnitaId?: string,
) {
  if (newValue === null) return;
  const rows = await getDb().query<{ millesimi: string | null }>(
    "select millesimi from unita where condominio_id = $1 and archiviato = false and ($2::uuid is null or id <> $2::uuid)",
    [condominioId, excludeUnitaId ?? null],
  );
  const total = sumMillesimi(rows.map((r) => r.millesimi)) + newValue;
  if (total > 1000.0001) {
    badRequest(
      `La somma dei millesimi del condominio supererebbe 1000 (attuale ${roundMillesimi(total - newValue)} + ${roundMillesimi(newValue)}). Verifica i valori.`,
      { millesimi: "Totale millesimi oltre 1000" },
    );
  }
}

condominiRouter.post(
  "/:id/unita",
  asyncHandler(async (req, res) => {
    const condominioId = validate(uuidParam, req.params.id);
    const body = validate(unitaSchema, req.body);
    await assertCondominioExists(condominioId);
    const db = getDb();
    const duplicate = await db.query(
      "select id from unita where condominio_id = $1 and lower(identificativo) = lower($2) and archiviato = false",
      [condominioId, body.identificativo],
    );
    if (duplicate.length > 0)
      conflict(
        "Esiste già un’unità con questo identificativo in questo condominio",
      );
    await assertMillesimiCoerenti(condominioId, body.millesimi ?? null);
    const id = uuid();
    await db.transaction(async (tx) => {
      await tx.query(
        `insert into unita (id, condominio_id, identificativo, piano, categoria, millesimi, millesimi_riscaldamento, note)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          id,
          condominioId,
          body.identificativo,
          body.piano ?? null,
          body.categoria ?? null,
          body.millesimi ?? null,
          body.millesimiRiscaldamento ?? null,
          body.note ?? null,
        ],
      );
      await audit(tx, {
        userId: req.auth!.user.id,
        attoreEmail: req.auth!.user.email,
        azione: "unita_creata",
        entitaTipo: "unita",
        entitaId: id,
        descrizione: `Creata unità ${body.identificativo}`,
        ipHash: req.ipHash,
      });
    });
    res
      .status(201)
      .json({
        ok: true,
        unita: (await loadUnita(condominioId)).find((u) => u.id === id),
      });
  }),
);

condominiRouter.patch(
  "/:id/unita/:unitaId",
  asyncHandler(async (req, res) => {
    const condominioId = validate(uuidParam, req.params.id);
    const unitaId = validate(uuidParam, req.params.unitaId);
    const body = validate(unitaSchema.partial(), req.body);
    const db = getDb();
    const rows = await db.query<{ identificativo: string }>(
      "select identificativo from unita where id = $1 and condominio_id = $2",
      [unitaId, condominioId],
    );
    if (rows.length === 0) notFound("Unità non trovata");
    if (body.millesimi !== undefined)
      await assertMillesimiCoerenti(condominioId, body.millesimi, unitaId);
    if (body.identificativo) {
      const dup = await db.query(
        "select id from unita where condominio_id = $1 and lower(identificativo) = lower($2) and id <> $3 and archiviato = false",
        [condominioId, body.identificativo, unitaId],
      );
      if (dup.length > 0)
        conflict("Esiste già un’unità con questo identificativo");
    }
    const map: Record<string, string> = {
      identificativo: "identificativo",
      piano: "piano",
      categoria: "categoria",
      millesimi: "millesimi",
      millesimiRiscaldamento: "millesimi_riscaldamento",
      note: "note",
    };
    const sets: string[] = [];
    const params: unknown[] = [unitaId];
    for (const [key, column] of Object.entries(map)) {
      if (!(key in body)) continue;
      params.push((body as Record<string, unknown>)[key] ?? null);
      sets.push(`${column} = $${params.length}`);
    }
    if (sets.length) {
      await db.transaction(async (tx) => {
        sets.push("updated_at = now()");
        await tx.query(
          `update unita set ${sets.join(", ")} where id = $1`,
          params,
        );
        await audit(tx, {
          userId: req.auth!.user.id,
          attoreEmail: req.auth!.user.email,
          azione: "unita_modificata",
          entitaTipo: "unita",
          entitaId: unitaId,
          descrizione: `Modificata unità ${rows[0]!.identificativo}`,
          ipHash: req.ipHash,
        });
      });
    }
    res.json({
      ok: true,
      unita: (await loadUnita(condominioId)).find((u) => u.id === unitaId),
    });
  }),
);

/** Archiviazione (soft) dell'unità: mantiene storico di rate e relazioni. */
condominiRouter.delete(
  "/:id/unita/:unitaId",
  asyncHandler(async (req, res) => {
    const condominioId = validate(uuidParam, req.params.id);
    const unitaId = validate(uuidParam, req.params.unitaId);
    const db = getDb();
    const rows = await db.query<{ identificativo: string }>(
      "select identificativo from unita where id = $1 and condominio_id = $2",
      [unitaId, condominioId],
    );
    if (rows.length === 0) notFound("Unità non trovata");
    await db.transaction(async (tx) => {
      await tx.query(
        "update unita set archiviato = true, updated_at = now() where id = $1",
        [unitaId],
      );
      await audit(tx, {
        userId: req.auth!.user.id,
        attoreEmail: req.auth!.user.email,
        azione: "unita_archiviata",
        entitaTipo: "unita",
        entitaId: unitaId,
        descrizione: `Archiviata unità ${rows[0]!.identificativo}`,
        ipHash: req.ipHash,
      });
    });
    res.json({ ok: true });
  }),
);

condominiRouter.post(
  "/:id/unita/:unitaId/persone",
  asyncHandler(async (req, res) => {
    const condominioId = validate(uuidParam, req.params.id);
    const unitaId = validate(uuidParam, req.params.unitaId);
    const body = validate(unitaPersonaSchema, req.body);
    const db = getDb();
    const unita = await db.query<{ id: string }>(
      "select id from unita where id = $1 and condominio_id = $2",
      [unitaId, condominioId],
    );
    if (unita.length === 0) notFound("Unità non trovata");
    const persona = await db.query<{ id: string }>(
      "select id from persone where id = $1 and archiviato = false",
      [body.personaId],
    );
    if (persona.length === 0) notFound("Persona non trovata");
    await db.transaction(async (tx) => {
      await tx.query(
        `insert into unita_persone (id, unita_id, persona_id, titolo, millesimi, data_inizio, data_fine, note)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (unita_id, persona_id, titolo) do update
           set millesimi = excluded.millesimi, data_inizio = excluded.data_inizio,
               data_fine = excluded.data_fine, note = excluded.note, updated_at = now()`,
        [
          uuid(),
          unitaId,
          body.personaId,
          body.titolo,
          body.millesimi ?? null,
          body.dataInizio ?? null,
          body.dataFine ?? null,
          body.note ?? null,
        ],
      );
      await audit(tx, {
        userId: req.auth!.user.id,
        attoreEmail: req.auth!.user.email,
        azione: "persona_unita_collegata",
        entitaTipo: "unita",
        entitaId: unitaId,
        descrizione: `Persona collegata all’unità con titolo ${body.titolo}`,
        ipHash: req.ipHash,
      });
    });
    res
      .status(201)
      .json({
        ok: true,
        unita: (await loadUnita(condominioId)).find((u) => u.id === unitaId),
      });
  }),
);

condominiRouter.delete(
  "/:id/unita/:unitaId/persone/:linkId",
  asyncHandler(async (req, res) => {
    const condominioId = validate(uuidParam, req.params.id);
    const unitaId = validate(uuidParam, req.params.unitaId);
    const linkId = validate(uuidParam, req.params.linkId);
    const db = getDb();
    const rows = await db.query(
      `select up.id from unita_persone up join unita u on u.id = up.unita_id
        where up.id = $1 and up.unita_id = $2 and u.condominio_id = $3`,
      [linkId, unitaId, condominioId],
    );
    if (rows.length === 0) notFound("Relazione non trovata");
    await db.query("delete from unita_persone where id = $1", [linkId]);
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------------------- */
/* Cronologia contatti del condominio                                        */
/* ------------------------------------------------------------------------- */

condominiRouter.get(
  "/:id/attivita",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const rows = await getDb().query<Record<string, unknown>>(
      "select * from attivita where condominio_id = $1 order by data desc, created_at desc limit 200",
      [id],
    );
    res.json({
      items: rows.map((r) => ({
        id: String(r.id),
        condominioId: r.condominio_id,
        personaId: r.persona_id,
        tipo: r.tipo,
        titolo: r.titolo,
        descrizione: r.descrizione,
        data: toDateString(r.data),
        scadenza: toDateString(r.scadenza),
        completata: r.completata,
        priorita: r.priorita,
        createdAt: toIsoString(r.created_at),
      })),
    });
  }),
);

/* ------------------------------------------------------------------------- */
/* Duplicati                                                                 */
/* ------------------------------------------------------------------------- */

async function findPersonaDuplicata(
  db: { query: <T>(sql: string, params?: unknown[]) => Promise<T[]> },
  p: {
    nome: string;
    cognome: string;
    codiceFiscale?: string | null;
    email?: string | null;
  },
): Promise<{
  id: string;
  nome: string;
  cognome: string;
  email: string | null;
} | null> {
  const sql = new Sql();
  sql.and(
    `((upper(coalesce(codice_fiscale,'')) <> '' and upper(codice_fiscale) = upper(?))
      or (lower(cognome) = lower(?) and lower(nome) = lower(?) and lower(coalesce(email,'')) = lower(coalesce(?,''))))`,
    p.codiceFiscale ?? "",
    p.cognome,
    p.nome,
    p.email ?? "",
  );
  const rows = await db.query<{
    id: string;
    nome: string;
    cognome: string;
    email: string | null;
  }>(
    `select id, nome, cognome, email from persone ${sql.whereClause} limit 1`,
    sql.params,
  );
  return rows[0] ?? null;
}

export { findPersonaDuplicata };
