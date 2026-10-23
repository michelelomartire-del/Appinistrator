import { getDb, uuid, type Queryable } from "../db.js";
import { Sql, toNumber, toNumberOrNull } from "../sql.js";
import { conflict, notFound } from "../http.js";
import type {
  CondominioDetail,
  CondominioListItem,
  UnitaDto,
  PersonaDto,
  RelazionePersona,
} from "../../shared/api-types.js";
import { toDateString, toIsoString } from "../db.js";

type CondominioRow = {
  id: string;
  codice: string;
  denominazione: string;
  indirizzo: string | null;
  cap: string | null;
  comune: string | null;
  provincia: string | null;
  codice_fiscale: string | null;
  stato: string;
  data_inizio_incarico: string | Date | null;
  data_fine_incarico: string | Date | null;
  note: string | null;
  archiviato: boolean;
  created_at: string | Date;
  updated_at: string | Date;
};

export async function nextCodiceCondominio(
  db: Queryable = getDb(),
): Promise<string> {
  const rows = await db.query<{ n: string }>(
    "select nextval('condominio_codice_seq') as n",
  );
  const n = Number(rows[0]?.n ?? 1);
  return `FB-${String(n).padStart(4, "0")}`;
}

export function mapCondominioSummary(
  row: Record<string, unknown>,
): CondominioListItem {
  return {
    id: String(row.id),
    codice: String(row.codice),
    denominazione: String(row.denominazione),
    comune: (row.comune as string) ?? null,
    provincia: (row.provincia as string) ?? null,
    indirizzo: (row.indirizzo as string) ?? null,
    stato: String(row.stato),
    archiviato: Boolean(row.archiviato),
    dataInizioIncarico: toDateString(row.data_inizio_incarico),
    dataFineIncarico: toDateString(row.data_fine_incarico),
    unitaCount: toNumber(row.unita_count),
    personeCount: toNumber(row.persone_count),
    segnalazioniAperte: toNumber(row.segnalazioni_aperte),
    prossimaAssemblea: toDateString(row.prossima_assemblea),
    updatedAt: toIsoString(row.updated_at) ?? "",
  };
}

export async function listCondomini(filters: {
  q?: string;
  stato?: string;
  comune?: string;
  archiviato?: "true" | "false" | "tutti";
  sort?: string;
  dir?: "asc" | "desc";
  page: number;
  perPage: number;
}): Promise<{ items: CondominioListItem[]; total: number }> {
  const db = getDb();
  const sql = new Sql();
  if (filters.q) {
    const like = `%${filters.q.toLowerCase()}%`;
    sql.and(
      `(lower(c.denominazione) like ? or lower(c.codice) like ? or lower(coalesce(c.comune,'')) like ? or lower(coalesce(c.indirizzo,'')) like ?)`,
      like,
      like,
      like,
      like,
    );
  }
  sql.andIf(filters.stato, "c.stato = ?", filters.stato);
  sql.andIf(filters.comune, "lower(c.comune) = lower(?)", filters.comune);
  if (filters.archiviato !== "tutti") {
    sql.and("c.archiviato = ?", filters.archiviato === "true");
  }

  const sortMap: Record<string, string> = {
    denominazione: "lower(c.denominazione)",
    codice: "c.codice",
    comune: "lower(coalesce(c.comune, ''))",
    aggiornato: "c.updated_at",
  };
  const orderBy =
    sortMap[filters.sort ?? "denominazione"] ?? "lower(c.denominazione)";
  const dir = filters.dir === "desc" ? "desc" : "asc";

  const where = sql.whereClause;
  const totalRows = await db.query<{ count: string }>(
    `select count(*)::int as count from condomini c ${where}`,
    sql.params,
  );
  const total = toNumber(totalRows[0]?.count);

  const { limitRef, offsetRef } = sql.paginate(
    filters.perPage,
    (filters.page - 1) * filters.perPage,
  );
  const rows = await db.query<Record<string, unknown>>(
    `select c.*,
            (select count(*)::int from unita u where u.condominio_id = c.id and u.archiviato = false) as unita_count,
            (select count(distinct cp.persona_id)::int from condominio_persone cp where cp.condominio_id = c.id) as persone_count,
            (select count(*)::int from segnalazioni s where s.condominio_id = c.id and s.stato not in ('risolta','chiusa')) as segnalazioni_aperte,
            (select min(a.data) from assemblee a where a.condominio_id = c.id and a.stato in ('programmata','convocata') and a.data >= current_date) as prossima_assemblea
       from condomini c
       ${where}
      order by ${orderBy} ${dir}, c.id
      limit ${limitRef} offset ${offsetRef}`,
    sql.params,
  );
  return { items: rows.map(mapCondominioSummary), total };
}

export async function getCondominio(id: string): Promise<CondominioDetail> {
  const db = getDb();
  const rows = await db.query<Record<string, unknown>>(
    `select c.*,
            (select count(*)::int from unita u where u.condominio_id = c.id and u.archiviato = false) as unita_count,
            (select count(distinct cp.persona_id)::int from condominio_persone cp where cp.condominio_id = c.id) as persone_count,
            (select count(*)::int from segnalazioni s where s.condominio_id = c.id and s.stato not in ('risolta','chiusa')) as segnalazioni_aperte,
            (select min(a.data) from assemblee a where a.condominio_id = c.id and a.stato in ('programmata','convocata') and a.data >= current_date) as prossima_assemblea,
            (select sum(u.millesimi) from unita u where u.condominio_id = c.id and u.archiviato = false) as millesimi_totali,
            (select count(*)::int from unita u where u.condominio_id = c.id and u.archiviato = false and u.millesimi is null) as unita_senza_millesimi
       from condomini c where c.id = $1`,
    [id],
  );
  const condominio = rows[0];
  if (!condominio) notFound("Condominio non trovato");
  const summary = mapCondominioSummary(condominio);

  const relazioni = await db.query<Record<string, unknown>>(
    `select cp.id as relazione_id, cp.ruolo, cp.qualifica, cp.data_inizio, cp.data_fine, cp.note as relazione_note,
            p.*
       from condominio_persone cp
       join persone p on p.id = cp.persona_id
      where cp.condominio_id = $1
      order by case cp.ruolo when 'consigliere' then 0 when 'referente' then 1 when 'amministratore' then 2 else 3 end,
               lower(p.cognome), lower(p.nome)`,
    [id],
  );

  const unita = await loadUnita(id);

  const attivita = await db.query<Record<string, unknown>>(
    `select * from attivita where condominio_id = $1 order by data desc, created_at desc limit 50`,
    [id],
  );

  const millesimiTotali = toNumberOrNull(condominio.millesimi_totali);
  const senzaMillesimi = toNumber(condominio.unita_senza_millesimi);

  return {
    ...summary,
    cap: (condominio.cap as string) ?? null,
    codiceFiscale: (condominio.codice_fiscale as string) ?? null,
    note: (condominio.note as string) ?? null,
    createdAt: toIsoString(condominio.created_at) ?? "",
    millesimiTotali: senzaMillesimi > 0 ? null : millesimiTotali,
    relazioni: relazioni.map(mapRelazione),
    unita,
    attivita: attivita.map(mapAttivita),
  };
}

export function mapPersona(row: Record<string, unknown>): PersonaDto {
  return {
    id: String(row.id),
    nome: String(row.nome),
    cognome: String(row.cognome),
    codiceFiscale: (row.codice_fiscale as string) ?? null,
    email: (row.email as string) ?? null,
    telefono: (row.telefono as string) ?? null,
    note: (row.note as string) ?? null,
    archiviato: Boolean(row.archiviato),
    createdAt: toIsoString(row.created_at) ?? "",
    updatedAt: toIsoString(row.updated_at) ?? "",
  };
}

function mapRelazione(row: Record<string, unknown>): RelazionePersona {
  return {
    id: String(row.relazione_id),
    persona: mapPersona(row),
    ruolo: String(row.ruolo),
    qualifica: (row.qualifica as string) ?? null,
    dataInizio: toDateString(row.data_inizio),
    dataFine: toDateString(row.data_fine),
    note: (row.relazione_note as string) ?? null,
  };
}

export function mapAttivita(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    condominioId: (row.condominio_id as string) ?? null,
    personaId: (row.persona_id as string) ?? null,
    tipo: String(row.tipo),
    titolo: String(row.titolo),
    descrizione: (row.descrizione as string) ?? null,
    data: toDateString(row.data) ?? "",
    scadenza: toDateString(row.scadenza),
    completata: Boolean(row.completata),
    priorita: String(row.priorita),
    createdAt: toIsoString(row.created_at) ?? "",
  };
}

export async function loadUnita(condominioId: string): Promise<UnitaDto[]> {
  const db = getDb();
  const unitaRows = await db.query<Record<string, unknown>>(
    `select * from unita where condominio_id = $1 and archiviato = false order by identificativo`,
    [condominioId],
  );
  const personeRows = await db.query<Record<string, unknown>>(
    `select up.id as link_id, up.unita_id, up.titolo, up.millesimi as link_millesimi, p.*
       from unita_persone up
       join persone p on p.id = up.persona_id
       join unita u on u.id = up.unita_id
      where u.condominio_id = $1
      order by lower(p.cognome), lower(p.nome)`,
    [condominioId],
  );
  const byUnita = new Map<string, UnitaDto["persone"]>();
  for (const row of personeRows) {
    const list = byUnita.get(String(row.unita_id)) ?? [];
    list.push({
      id: String(row.link_id),
      persona: mapPersona(row),
      titolo: String(row.titolo),
      millesimi: toNumberOrNull(row.link_millesimi),
    });
    byUnita.set(String(row.unita_id), list);
  }
  return unitaRows.map((row) => ({
    id: String(row.id),
    condominioId: String(row.condominio_id),
    identificativo: String(row.identificativo),
    piano: (row.piano as string) ?? null,
    categoria: (row.categoria as string) ?? null,
    millesimi: toNumberOrNull(row.millesimi),
    millesimiRiscaldamento: toNumberOrNull(row.millesimi_riscaldamento),
    note: (row.note as string) ?? null,
    archiviato: Boolean(row.archiviato),
    persone: byUnita.get(String(row.id)) ?? [],
  }));
}

export async function assertCondominioExists(
  id: string,
  db: Queryable = getDb(),
): Promise<CondominioRow> {
  const rows = await db.query<CondominioRow>(
    "select * from condomini where id = $1",
    [id],
  );
  const row = rows[0];
  if (!row) notFound("Condominio non trovato");
  return row;
}

/** Controllo di unicità del codice fiscale del condominio, se presente. */
export async function assertUniqueCondominioCf(
  db: Queryable,
  codiceFiscale: string | null | undefined,
  excludeId?: string,
): Promise<void> {
  if (!codiceFiscale) return;
  const rows = await db.query<{ id: string }>(
    "select id from condomini where upper(codice_fiscale) = upper($1) and ($2::uuid is null or id <> $2::uuid)",
    [codiceFiscale, excludeId ?? null],
  );
  if (rows.length > 0)
    conflict("Esiste già un condominio con questo codice fiscale");
}

export { uuid };
