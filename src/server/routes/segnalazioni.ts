import { Router } from "express";
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
import { Sql, toNumber } from "../sql.js";
import {
  cambiaStatoSegnalazioneSchema,
  segnalazioneCreateSchema,
  segnalazioneFilterSchema,
  segnalazioneUpdateSchema,
  uuidParam,
} from "../../shared/schemas.js";
import {
  SEGNALAZIONE_STATI_APERTI,
  segnalazioneStatoLabels,
  type SegnalazioneStato,
} from "../../shared/constants.js";
import type { SegnalazioneDto } from "../../shared/api-types.js";

export const segnalazioniRouter = Router();

function mapSegnalazione(row: Record<string, unknown>): SegnalazioneDto {
  return {
    id: String(row.id),
    codice: String(row.codice),
    condominioId: String(row.condominio_id),
    condominio: String(row.condominio ?? ""),
    unitaId: (row.unita_id as string) ?? null,
    unita: (row.unita as string) ?? null,
    areaComune: (row.area_comune as string) ?? null,
    titolo: String(row.titolo),
    descrizione: (row.descrizione as string) ?? null,
    categoria: String(row.categoria),
    priorita: String(row.priorita),
    stato: String(row.stato),
    dataApertura: toDateString(row.data_apertura) ?? "",
    scadenza: toDateString(row.scadenza),
    dataChiusura: toDateString(row.data_chiusura),
    fornitorePersonaId: (row.fornitore_persona_id as string) ?? null,
    fornitore: (row.fornitore as string) ?? null,
    referente: (row.referente as string) ?? null,
    createdAt: toIsoString(row.created_at) ?? "",
    updatedAt: toIsoString(row.updated_at) ?? "",
  };
}

const baseSelect = `
  select s.*, c.denominazione as condominio, u.identificativo as unita,
         trim(concat(p.nome, ' ', p.cognome)) as fornitore
    from segnalazioni s
    join condomini c on c.id = s.condominio_id
    left join unita u on u.id = s.unita_id
    left join persone p on p.id = s.fornitore_persona_id`;

async function nextCodice(db = getDb()): Promise<string> {
  const rows = await db.query<{ n: string }>(
    "select nextval('segnalazione_codice_seq') as n",
  );
  return `SG-${String(Number(rows[0]?.n ?? 1)).padStart(4, "0")}`;
}

segnalazioniRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const filters = validate(segnalazioneFilterSchema, req.query);
    const sql = new Sql();
    if (filters.q) {
      const like = `%${filters.q.toLowerCase()}%`;
      sql.and(
        "(lower(s.titolo) like ? or lower(s.codice) like ? or lower(coalesce(s.descrizione,'')) like ?)",
        like,
        like,
        like,
      );
    }
    if (filters.stato === "aperte") {
      sql.and("s.stato in ('nuova','in_valutazione','assegnata','in_corso')");
    } else if (filters.stato) {
      sql.and("s.stato = ?", filters.stato);
    }
    sql.andIf(
      filters.condominioId,
      "s.condominio_id = ?",
      filters.condominioId,
    );
    sql.andIf(filters.priorita, "s.priorita = ?", filters.priorita);
    sql.andIf(filters.categoria, "s.categoria = ?", filters.categoria);
    if (filters.scadute === "true") {
      sql.and(
        "s.scadenza is not null and s.scadenza < current_date and s.stato not in ('risolta','chiusa')",
      );
    }
    const db = getDb();
    const totalRows = await db.query<{ count: string }>(
      `select count(*)::int as count from segnalazioni s ${sql.whereClause}`,
      sql.params,
    );
    const orderMap: Record<string, string> = {
      apertura: "s.data_apertura desc",
      scadenza: "s.scadenza asc nulls last",
      priorita: `case s.priorita when 'urgente' then 0 when 'alta' then 1 when 'media' then 2 else 3 end asc`,
    };
    const { limitRef, offsetRef } = sql.paginate(
      filters.perPage,
      (filters.page - 1) * filters.perPage,
    );
    const rows = await db.query<Record<string, unknown>>(
      `${baseSelect} ${sql.whereClause} order by ${orderMap[filters.sort] ?? orderMap.apertura}, s.created_at desc
       limit ${limitRef} offset ${offsetRef}`,
      sql.params,
    );
    res.json(
      paginated(
        rows.map(mapSegnalazione),
        Number(totalRows[0]?.count ?? 0),
        filters.page,
        filters.perPage,
      ),
    );
  }),
);

segnalazioniRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const db = getDb();
    const rows = await db.query<Record<string, unknown>>(
      `${baseSelect} where s.id = $1`,
      [id],
    );
    if (!rows[0]) notFound("Segnalazione non trovata");
    const storico = await db.query<Record<string, unknown>>(
      `select st.*, trim(concat(u.nome, ' ', u.cognome)) as utente
         from segnalazione_storico st left join users u on u.id = st.user_id
        where st.segnalazione_id = $1 order by st.created_at asc`,
      [id],
    );
    const documenti = await db.query<{ count: string }>(
      `select count(*)::int as count from documenti where entita_tipo = 'segnalazione' and entita_id = $1 and archiviato = false`,
      [id],
    );
    res.json({
      ...mapSegnalazione(rows[0]),
      storico: storico.map((r) => ({
        id: String(r.id),
        daStato: (r.da_stato as string) ?? null,
        aStato: (r.a_stato as string) ?? null,
        nota: (r.nota as string) ?? null,
        utente: (r.utente as string) ?? null,
        createdAt: toIsoString(r.created_at),
      })),
      documentiCount: Number(documenti[0]?.count ?? 0),
    });
  }),
);

segnalazioniRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = validate(segnalazioneCreateSchema, req.body);
    const db = getDb();
    const condominio = await db.query<{ id: string }>(
      "select id from condomini where id = $1",
      [body.condominioId],
    );
    if (condominio.length === 0) notFound("Condominio non trovato");
    if (body.unitaId) {
      const unita = await db.query(
        "select id from unita where id = $1 and condominio_id = $2",
        [body.unitaId, body.condominioId],
      );
      if (unita.length === 0)
        badRequest("L’unità indicata non appartiene al condominio", {
          unitaId: "Unità non valida",
        });
    }
    const id = uuid();
    const codice = await nextCodice(db);
    await db.transaction(async (tx) => {
      await tx.query(
        `insert into segnalazioni (id, codice, condominio_id, unita_id, area_comune, titolo, descrizione, categoria, priorita, stato,
            data_apertura, scadenza, fornitore_persona_id, referente, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,coalesce($11, current_date),$12,$13,$14,$15)`,
        [
          id,
          codice,
          body.condominioId,
          body.unitaId ?? null,
          body.areaComune ?? null,
          body.titolo,
          body.descrizione ?? null,
          body.categoria,
          body.priorita,
          body.stato,
          body.dataApertura ?? null,
          body.scadenza ?? null,
          body.fornitorePersonaId ?? null,
          body.referente ?? null,
          req.auth!.user.id,
        ],
      );
      await tx.query(
        `insert into segnalazione_storico (id, segnalazione_id, da_stato, a_stato, nota, user_id)
         values ($1,$2,null,$3,$4,$5)`,
        [uuid(), id, body.stato, "Apertura segnalazione", req.auth!.user.id],
      );
      await audit(tx, {
        userId: req.auth!.user.id,
        attoreEmail: req.auth!.user.email,
        azione: "segnalazione_creata",
        entitaTipo: "segnalazione",
        entitaId: id,
        descrizione: `Aperta segnalazione ${codice}`,
        ipHash: req.ipHash,
      });
    });
    const rows = await db.query<Record<string, unknown>>(
      `${baseSelect} where s.id = $1`,
      [id],
    );
    res.status(201).json(mapSegnalazione(rows[0]!));
  }),
);

segnalazioniRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const body = validate(segnalazioneUpdateSchema, req.body);
    const db = getDb();
    const current = await db.query<Record<string, unknown>>(
      "select * from segnalazioni where id = $1",
      [id],
    );
    const row = current[0];
    if (!row) notFound("Segnalazione non trovata");
    if (body.stato && body.stato !== row.stato) {
      badRequest(
        "Per cambiare stato usa l’azione dedicata, che registra la cronologia",
        {
          stato: "Usa il cambio stato",
        },
      );
    }
    if (body.unitaId) {
      const condominioId = (body.condominioId ?? row.condominio_id) as string;
      const unita = await db.query(
        "select id from unita where id = $1 and condominio_id = $2",
        [body.unitaId, condominioId],
      );
      if (unita.length === 0)
        badRequest("L’unità indicata non appartiene al condominio", {
          unitaId: "Unità non valida",
        });
    }
    const map: Record<string, string> = {
      condominioId: "condominio_id",
      unitaId: "unita_id",
      areaComune: "area_comune",
      titolo: "titolo",
      descrizione: "descrizione",
      categoria: "categoria",
      priorita: "priorita",
      dataApertura: "data_apertura",
      scadenza: "scadenza",
      fornitorePersonaId: "fornitore_persona_id",
      referente: "referente",
    };
    const sets: string[] = [];
    const params: unknown[] = [id];
    for (const [key, column] of Object.entries(map)) {
      if (!(key in body)) continue;
      params.push((body as Record<string, unknown>)[key] ?? null);
      sets.push(`${column} = $${params.length}`);
    }
    const nota = body.nota;
    await db.transaction(async (tx) => {
      if (sets.length) {
        sets.push("updated_at = now()");
        await tx.query(
          `update segnalazioni set ${sets.join(", ")} where id = $1`,
          params,
        );
        await audit(tx, {
          userId: req.auth!.user.id,
          attoreEmail: req.auth!.user.email,
          azione: "segnalazione_modificata",
          entitaTipo: "segnalazione",
          entitaId: id,
          descrizione: `Modificata segnalazione ${String(row.codice)}`,
          ipHash: req.ipHash,
        });
      }
      if (nota) {
        await tx.query(
          `insert into segnalazione_storico (id, segnalazione_id, da_stato, a_stato, nota, user_id)
           values ($1,$2,$3,$3,$4,$5)`,
          [uuid(), id, row.stato, nota, req.auth!.user.id],
        );
      }
    });
    const rows = await db.query<Record<string, unknown>>(
      `${baseSelect} where s.id = $1`,
      [id],
    );
    res.json(mapSegnalazione(rows[0]!));
  }),
);

segnalazioniRouter.post(
  "/:id/stato",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const body = validate(cambiaStatoSegnalazioneSchema, req.body);
    const db = getDb();
    const current = await db.query<Record<string, unknown>>(
      "select * from segnalazioni where id = $1",
      [id],
    );
    const row = current[0];
    if (!row) notFound("Segnalazione non trovata");
    const daStato = String(row.stato);
    if (daStato === body.stato) {
      throw conflict(
        `La segnalazione è già nello stato "${segnalazioneStatoLabels[body.stato as SegnalazioneStato]}".`,
      );
    }
    const chiusura = body.stato === "chiusa" ? new Date() : null;
    await db.transaction(async (tx) => {
      await tx.query(
        `update segnalazioni set stato = $2, data_chiusura = $3, updated_at = now() where id = $1`,
        [id, body.stato, chiusura ? chiusura.toISOString().slice(0, 10) : null],
      );
      await tx.query(
        `insert into segnalazione_storico (id, segnalazione_id, da_stato, a_stato, nota, user_id)
         values ($1,$2,$3,$4,$5,$6)`,
        [uuid(), id, daStato, body.stato, body.nota ?? null, req.auth!.user.id],
      );
      await audit(tx, {
        userId: req.auth!.user.id,
        attoreEmail: req.auth!.user.email,
        azione: "segnalazione_stato_cambiato",
        entitaTipo: "segnalazione",
        entitaId: id,
        descrizione: `Segnalazione ${String(row.codice)}: ${daStato} → ${body.stato}`,
        ipHash: req.ipHash,
      });
    });
    const rows = await db.query<Record<string, unknown>>(
      `${baseSelect} where s.id = $1`,
      [id],
    );
    res.json(mapSegnalazione(rows[0]!));
  }),
);

segnalazioniRouter.get(
  "/:id/storico",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const rows = await getDb().query<Record<string, unknown>>(
      `select st.*, trim(concat(u.nome, ' ', u.cognome)) as utente
         from segnalazione_storico st left join users u on u.id = st.user_id
        where st.segnalazione_id = $1 order by st.created_at asc`,
      [id],
    );
    res.json({
      items: rows.map((r) => ({
        id: r.id,
        daStato: r.da_stato,
        aStato: r.a_stato,
        nota: r.nota,
        utente: r.utente,
        createdAt: toIsoString(r.created_at),
      })),
    });
  }),
);

/** Conteggi per la dashboard dei quattro moduli. */
export function statiAperti(): SegnalazioneStato[] {
  return SEGNALAZIONE_STATI_APERTI;
}

export { toNumber };
