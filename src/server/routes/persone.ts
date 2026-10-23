import { Router } from "express";
import { z } from "zod";
import { audit, diffFields } from "../audit.js";
import { getDb, toDateString, uuid } from "../db.js";
import {
  asyncHandler,
  conflict,
  notFound,
  paginated,
  validate,
} from "../http.js";
import { Sql, toNumberOrNull } from "../sql.js";
import { mapPersona } from "../services/condomini.js";
import { personaSchema, uuidParam } from "../../shared/schemas.js";

export const personeRouter = Router();

const listFilterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  archiviato: z.enum(["true", "false", "tutti"]).optional().default("false"),
  condominioId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  perPage: z.coerce.number().int().min(5).max(100).optional().default(25),
});

async function assertNoDuplicato(
  persona: {
    nome: string;
    cognome: string;
    codiceFiscale?: string | null;
    email?: string | null;
  },
  excludeId?: string,
): Promise<void> {
  const sql = new Sql();
  const excludeRef = sql.p(excludeId ?? null);
  sql.and(`(${excludeRef}::uuid is null or id <> ${excludeRef}::uuid)`);
  sql.and(
    `((upper(coalesce(codice_fiscale,'')) <> '' and upper(codice_fiscale) = upper(?))
      or (lower(cognome) = lower(?) and lower(nome) = lower(?) and lower(coalesce(email,'')) = lower(coalesce(?,''))))`,
    persona.codiceFiscale ?? "",
    persona.cognome,
    persona.nome,
    persona.email ?? "",
  );
  const rows = await getDb().query<{
    id: string;
    nome: string;
    cognome: string;
  }>(
    `select id, nome, cognome from persone ${sql.whereClause} limit 1`,
    sql.params,
  );
  if (rows.length > 0) {
    conflict(
      `Esiste già una persona con dati simili (${rows[0]!.cognome} ${rows[0]!.nome}). Cerca nell’anagrafica invece di duplicarla.`,
    );
  }
}

personeRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const filters = validate(listFilterSchema, req.query);
    const db = getDb();
    const sql = new Sql();
    if (filters.q) {
      const like = `%${filters.q.toLowerCase()}%`;
      sql.and(
        `(lower(p.nome) like ? or lower(p.cognome) like ? or lower(coalesce(p.email,'')) like ? or upper(coalesce(p.codice_fiscale,'')) like ?)`,
        like,
        like,
        like,
        `%${filters.q.toUpperCase()}%`,
      );
    }
    if (filters.archiviato !== "tutti")
      sql.and("p.archiviato = ?", filters.archiviato === "true");
    if (filters.condominioId) {
      sql.and(
        "exists (select 1 from condominio_persone cp where cp.persona_id = p.id and cp.condominio_id = ?)",
        filters.condominioId,
      );
    }
    const totalRows = await db.query<{ count: string }>(
      `select count(*)::int as count from persone p ${sql.whereClause}`,
      sql.params,
    );
    const total = Number(totalRows[0]?.count ?? 0);
    const { limitRef, offsetRef } = sql.paginate(
      filters.perPage,
      (filters.page - 1) * filters.perPage,
    );
    const rows = await db.query<Record<string, unknown>>(
      `select p.*,
              (select count(distinct cp.condominio_id)::int from condominio_persone cp where cp.persona_id = p.id) as condomini_count,
              (select count(distinct up.unita_id)::int from unita_persone up where up.persona_id = p.id) as unita_count
         from persone p
         ${sql.whereClause}
        order by lower(p.cognome), lower(p.nome)
        limit ${limitRef} offset ${offsetRef}`,
      sql.params,
    );
    res.json(
      paginated(
        rows.map((row) => ({
          ...mapPersona(row),
          condominiCount: Number(row.condomini_count ?? 0),
          unitaCount: Number(row.unita_count ?? 0),
        })),
        total,
        filters.page,
        filters.perPage,
      ),
    );
  }),
);

personeRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = validate(personaSchema, req.body);
    await assertNoDuplicato(body);
    const db = getDb();
    const id = uuid();
    await db.transaction(async (tx) => {
      await tx.query(
        `insert into persone (id, nome, cognome, codice_fiscale, email, telefono, note, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          id,
          body.nome,
          body.cognome,
          body.codiceFiscale ?? null,
          body.email ?? null,
          body.telefono ?? null,
          body.note ?? null,
          req.auth!.user.id,
        ],
      );
      await audit(tx, {
        userId: req.auth!.user.id,
        attoreEmail: req.auth!.user.email,
        azione: "persona_creata",
        entitaTipo: "persona",
        entitaId: id,
        descrizione: `Creata persona ${body.cognome} ${body.nome}`,
        ipHash: req.ipHash,
      });
    });
    const row = (
      await db.query<Record<string, unknown>>(
        "select * from persone where id = $1",
        [id],
      )
    )[0]!;
    res.status(201).json(mapPersona(row));
  }),
);

personeRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const db = getDb();
    const rows = await db.query<Record<string, unknown>>(
      "select * from persone where id = $1",
      [id],
    );
    if (!rows[0]) notFound("Persona non trovata");
    const condomini = await db.query<Record<string, unknown>>(
      `select cp.id as relazione_id, cp.ruolo, cp.qualifica, cp.data_inizio, cp.data_fine,
              c.id as condominio_id, c.codice, c.denominazione, c.comune, c.stato
         from condominio_persone cp join condomini c on c.id = cp.condominio_id
        where cp.persona_id = $1 order by lower(c.denominazione)`,
      [id],
    );
    const unita = await db.query<Record<string, unknown>>(
      `select up.id as link_id, up.titolo, up.millesimi as link_millesimi,
              u.id as unita_id, u.identificativo, u.millesimi as unita_millesimi,
              c.id as condominio_id, c.denominazione, c.codice
         from unita_persone up
         join unita u on u.id = up.unita_id
         join condomini c on c.id = u.condominio_id
        where up.persona_id = $1 order by lower(c.denominazione), u.identificativo`,
      [id],
    );
    res.json({
      ...mapPersona(rows[0]),
      condomini: condomini.map((r) => ({
        id: String(r.relazione_id),
        condominioId: String(r.condominio_id),
        codice: String(r.codice),
        denominazione: String(r.denominazione),
        comune: (r.comune as string) ?? null,
        stato: String(r.stato),
        ruolo: String(r.ruolo),
        qualifica: (r.qualifica as string) ?? null,
        dataInizio: toDateString(r.data_inizio),
        dataFine: toDateString(r.data_fine),
      })),
      unita: unita.map((r) => ({
        id: String(r.link_id),
        unitaId: String(r.unita_id),
        condominioId: String(r.condominio_id),
        condominio: String(r.denominazione),
        identificativo: String(r.identificativo),
        titolo: String(r.titolo),
        millesimi: toNumberOrNull(r.link_millesimi),
        unitaMillesimi: toNumberOrNull(r.unita_millesimi),
      })),
    });
  }),
);

personeRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const body = validate(personaSchema.partial(), req.body);
    const db = getDb();
    const rows = await db.query<Record<string, unknown>>(
      "select * from persone where id = $1",
      [id],
    );
    const before = rows[0];
    if (!before) notFound("Persona non trovata");
    await assertNoDuplicato(
      {
        nome: body.nome ?? String(before.nome),
        cognome: body.cognome ?? String(before.cognome),
        codiceFiscale:
          body.codiceFiscale !== undefined
            ? body.codiceFiscale
            : (before.codice_fiscale as string | null),
        email:
          body.email !== undefined
            ? body.email
            : (before.email as string | null),
      },
      id,
    );
    const map: Record<string, string> = {
      nome: "nome",
      cognome: "cognome",
      codiceFiscale: "codice_fiscale",
      email: "email",
      telefono: "telefono",
      note: "note",
    };
    const sets: string[] = [];
    const params: unknown[] = [id];
    for (const [key, column] of Object.entries(map)) {
      if (!(key in body)) continue;
      params.push((body as Record<string, unknown>)[key] ?? null);
      sets.push(`${column} = $${params.length}`);
    }
    if (sets.length === 0) {
      res.json(mapPersona(before));
      return;
    }
    await db.transaction(async (tx) => {
      sets.push("updated_at = now()");
      await tx.query(
        `update persone set ${sets.join(", ")} where id = $1`,
        params,
      );
      const after = (
        await tx.query<Record<string, unknown>>(
          "select * from persone where id = $1",
          [id],
        )
      )[0]!;
      const changes = diffFields(
        {
          nome: before.nome,
          cognome: before.cognome,
          codiceFiscale: before.codice_fiscale,
          email: before.email,
          telefono: before.telefono,
          note: before.note,
        },
        {
          nome: after.nome,
          cognome: after.cognome,
          codiceFiscale: after.codice_fiscale,
          email: after.email,
          telefono: after.telefono,
          note: after.note,
        },
        ["nome", "cognome", "codiceFiscale", "email", "telefono", "note"],
      );
      await audit(tx, {
        userId: req.auth!.user.id,
        attoreEmail: req.auth!.user.email,
        azione: "persona_modificata",
        entitaTipo: "persona",
        entitaId: id,
        descrizione: `Modificata persona ${String(before.cognome)} ${String(before.nome)}`,
        modifiche: changes,
        ipHash: req.ipHash,
      });
    });
    const after = (
      await db.query<Record<string, unknown>>(
        "select * from persone where id = $1",
        [id],
      )
    )[0]!;
    res.json(mapPersona(after));
  }),
);

personeRouter.post(
  "/:id/archivia",
  asyncHandler(async (req, res) => {
    const id = validate(uuidParam, req.params.id);
    const archiviato = z.boolean().parse(req.body?.archiviato ?? true);
    const db = getDb();
    const rows = await db.query<Record<string, unknown>>(
      "select * from persone where id = $1",
      [id],
    );
    if (!rows[0]) notFound("Persona non trovata");
    await db.transaction(async (tx) => {
      await tx.query(
        "update persone set archiviato = $2, updated_at = now() where id = $1",
        [id, archiviato],
      );
      await audit(tx, {
        userId: req.auth!.user.id,
        attoreEmail: req.auth!.user.email,
        azione: archiviato ? "persona_archiviata" : "persona_ripristinata",
        entitaTipo: "persona",
        entitaId: id,
        descrizione: `${archiviato ? "Archiviata" : "Ripristinata"} persona ${String(rows[0]!.cognome)} ${String(rows[0]!.nome)}`,
        ipHash: req.ipHash,
      });
    });
    res.json({ ok: true, archiviato });
  }),
);
