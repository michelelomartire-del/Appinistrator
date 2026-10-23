import { Router } from "express";
import { getDb, toDateString } from "../db.js";
import { asyncHandler, validate } from "../http.js";
import { searchSchema } from "../../shared/schemas.js";
import type { SearchResults } from "../../shared/api-types.js";
import { requireRateLimit } from "../auth.js";
import { limiters } from "../rate-limit.js";

export const ricercaRouter = Router();

/** Ricerca globale: restituisce solo campi identificativi, nessun dato sensibile. */
ricercaRouter.get(
  "/",
  requireRateLimit(limiters.search, "user"),
  asyncHandler(async (req, res) => {
    const { q } = validate(searchSchema, req.query);
    const db = getDb();
    const like = `%${q.toLowerCase()}%`;
    const likeUpper = `%${q.toUpperCase()}%`;

    const [
      condomini,
      persone,
      segnalazioni,
      assemblee,
      periodi,
      consumi,
      documenti,
    ] = await Promise.all([
      db.query<Record<string, unknown>>(
        `select id, codice, denominazione, comune from condomini
          where lower(denominazione) like $1 or lower(codice) like $1 or lower(coalesce(comune,'')) like $1
          order by lower(denominazione) limit 8`,
        [like],
      ),
      db.query<Record<string, unknown>>(
        `select id, nome, cognome, email from persone
          where lower(nome) like $1 or lower(cognome) like $1 or upper(coalesce(codice_fiscale,'')) like $2
          order by lower(cognome) limit 8`,
        [like, likeUpper],
      ),
      db.query<Record<string, unknown>>(
        `select s.id, s.codice, s.titolo, c.denominazione as condominio from segnalazioni s
           join condomini c on c.id = s.condominio_id
          where lower(s.titolo) like $1 or lower(s.codice) like $1
          order by s.data_apertura desc limit 8`,
        [like],
      ),
      db.query<Record<string, unknown>>(
        `select a.id, a.data, a.tipo, c.denominazione as condominio from assemblee a
           join condomini c on c.id = a.condominio_id
          where lower(coalesce(a.luogo,'')) like $1 or lower(c.denominazione) like $1
          order by a.data desc limit 8`,
        [like],
      ),
      db.query<Record<string, unknown>>(
        `select p.id, p.etichetta, p.data_inizio, c.denominazione as condominio from periodi_contabili p
           join condomini c on c.id = p.condominio_id
          where lower(p.etichetta) like $1 or lower(c.denominazione) like $1
          order by p.data_inizio desc limit 8`,
        [like],
      ),
      db.query<Record<string, unknown>>(
        `select co.id, co.categoria, co.periodo_da, c.denominazione as condominio, c.id as condominio_id from consumi co
           join condomini c on c.id = co.condominio_id
          where lower(c.denominazione) like $1
          order by co.periodo_da desc limit 8`,
        [like],
      ),
      db.query<Record<string, unknown>>(
        `select d.id, d.nome_file, d.entita_tipo, c.denominazione as condominio from documenti d
           left join condomini c on c.id = d.condominio_id
          where d.archiviato = false and lower(d.nome_file) like $1
          order by d.created_at desc limit 8`,
        [like],
      ),
    ]);

    const results: SearchResults = {
      condomini: condomini.map((r) => ({
        id: String(r.id),
        codice: String(r.codice),
        denominazione: String(r.denominazione),
        comune: (r.comune as string) ?? null,
      })),
      persone: persone.map((r) => ({
        id: String(r.id),
        nome: String(r.nome),
        cognome: String(r.cognome),
        email: (r.email as string) ?? null,
      })),
      segnalazioni: segnalazioni.map((r) => ({
        id: String(r.id),
        codice: String(r.codice),
        titolo: String(r.titolo),
        condominio: String(r.condominio),
      })),
      assemblee: assemblee.map((r) => ({
        id: String(r.id),
        condominio: String(r.condominio),
        data: toDateString(r.data) ?? "",
        tipo: String(r.tipo),
      })),
      periodi: periodi.map((r) => ({
        id: String(r.id),
        etichetta: String(r.etichetta),
        condominio: String(r.condominio),
        dataInizio: toDateString(r.data_inizio) ?? "",
      })),
      consumi: consumi.map((r) => ({
        id: String(r.id),
        condominio: String(r.condominio),
        condominioId: String(r.condominio_id),
        categoria: String(r.categoria),
        periodoDa: toDateString(r.periodo_da) ?? "",
      })),
      documenti: documenti.map((r) => ({
        id: String(r.id),
        nomeFile: String(r.nome_file),
        entitaTipo: String(r.entita_tipo),
        condominio: (r.condominio as string) ?? null,
      })),
    };
    res.json(results);
  }),
);
