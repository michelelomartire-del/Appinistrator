/**
 * Demo statica: stato modificabile in memoria, persistito in localStorage.
 *
 * I dati di partenza sono lo snapshot generato dall'API reale
 * (`npm run demo:snapshot`): stesse strutture, nessun dato reale.
 * Le liste e gli indicatori vengono ricalcolati dai record, così una modifica
 * (nuova segnalazione, unità aggiunta) resta coerente in tutta l'applicazione.
 */
import snapshotJson from "./snapshot.json";

export type Entita = Record<string, any>;

export type DemoDocumento = {
  id: string;
  condominioId: string | null;
  entitaTipo: string;
  entitaId: string | null;
  nomeFile: string;
  mime: string;
  dimensione: number;
  categoria: string | null;
  descrizione: string | null;
  archiviato: boolean;
  createdAt: string;
  scaricabile: boolean;
};

export type DemoStato = {
  condomini: Record<string, Entita>;
  persone: Record<string, Entita>;
  segnalazioni: Record<string, Entita>;
  assemblee: Record<string, Entita>;
  periodi: Record<string, Entita>;
  consumi: Record<string, Entita>;
  attivita: Entita[];
  documenti: DemoDocumento[];
  importazioni: Entita[];
  audit: Entita[];
  generatoIl: string;
  revisione: number;
};

const STORAGE_KEY = "effebi-crm-demo-v1";

export const snapshot = snapshotJson as unknown as {
  generatoIl: string;
  note: string;
  dashboard: Entita;
  liste: Record<string, Entita[]>;
  dettagli: Record<string, Record<string, Entita>>;
  extra: Entita;
  documenti: Record<string, { url: string; nomeFile: string; mime: string; dimensione: number }>;
};

export const URL_DOCUMENTI = snapshot.documenti;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function statoIniziale(): DemoStato {
  const mappa = (chiave: string): Record<string, Entita> => {
    const out: Record<string, Entita> = {};
    for (const [id, valore] of Object.entries(snapshot.dettagli[chiave] ?? {})) {
      out[id] = clone(valore);
    }
    return out;
  };
  return {
    condomini: mappa("condomini"),
    persone: mappa("persone"),
    segnalazioni: mappa("segnalazioni"),
    assemblee: mappa("assemblee"),
    periodi: mappa("periodi"),
    consumi: mappa("consumi"),
    attivita: clone(snapshot.liste.attivita ?? []),
    documenti: clone(snapshot.liste.documenti ?? []) as DemoDocumento[],
    importazioni: clone(snapshot.liste.importazioni ?? []),
    audit: clone(snapshot.extra.audit?.items ?? []),
    generatoIl: snapshot.generatoIl,
    revisione: 1,
  };
}

let stato: DemoStato | null = null;

/** localStorage quando disponibile (browser), altrimenti null. */
function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function caricaStato(): DemoStato {
  if (stato) return stato;
  try {
    const salvato = storage()?.getItem(STORAGE_KEY);
    if (salvato) {
      const parsed = JSON.parse(salvato) as DemoStato;
      if (parsed?.condomini && parsed?.segnalazioni) {
        stato = parsed;
        return stato;
      }
    }
  } catch {
    // localStorage non disponibile (navigazione privata): si usa la memoria.
  }
  stato = statoIniziale();
  return stato;
}

function salva(): void {
  if (!stato) return;
  stato.revisione += 1;
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(stato));
  } catch {
    // Quota superata o storage negato: la demo resta comunque funzionante.
  }
}

export function resetDemo(): void {
  stato = statoIniziale();
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    /* niente da fare */
  }
}

/** Applica una modifica allo stato e la salva. */
export function modifica<T>(azione: (s: DemoStato) => T): T {
  const corrente = caricaStato();
  const result = azione(corrente);
  salva();
  return result;
}

/* ------------------------------------------------------------------------- */
/* Utilità                                                                   */
/* ------------------------------------------------------------------------- */

export function oggiIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function nuovoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `demo-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function adesso(): string {
  return new Date().toISOString();
}

export function somma(valori: Array<number | string | null | undefined>): number {
  const totale = valori.reduce<number>((acc, v) => acc + (v === null || v === undefined ? 0 : Number(v) || 0), 0);
  return Math.round(totale * 100) / 100;
}

export function arrotonda(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Paginazione con la stessa forma dell'API. */
export function pagina<T>(items: T[], page = 1, perPage = 25) {
  const inizio = (page - 1) * perPage;
  return {
    items: items.slice(inizio, inizio + perPage),
    total: items.length,
    page,
    perPage,
  };
}

export function normalizza(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/* ------------------------------------------------------------------------- */
/* Viste derivate                                                            */
/* ------------------------------------------------------------------------- */

export function condominioListItem(condominio: Entita): Entita {
  const s = caricaStato();
  const segnalazioniAperte = Object.values(s.segnalazioni).filter(
    (seg) =>
      seg.condominioId === condominio.id &&
      ["nuova", "in_valutazione", "assegnata", "in_corso"].includes(String(seg.stato)),
  ).length;
  const prossime = Object.values(s.assemblee)
    .filter(
      (a) =>
        a.condominioId === condominio.id &&
        String(a.data) >= oggiIso() &&
        ["programmata", "convocata"].includes(String(a.stato)),
    )
    .sort((a, b) => String(a.data).localeCompare(String(b.data)));
  return {
    id: condominio.id,
    codice: condominio.codice,
    denominazione: condominio.denominazione,
    comune: condominio.comune ?? null,
    provincia: condominio.provincia ?? null,
    indirizzo: condominio.indirizzo ?? null,
    stato: condominio.stato,
    archiviato: Boolean(condominio.archiviato),
    dataInizioIncarico: condominio.dataInizioIncarico ?? null,
    dataFineIncarico: condominio.dataFineIncarico ?? null,
    unitaCount: (condominio.unita ?? []).filter((u: Entita) => !u.archiviato).length,
    personeCount: (condominio.relazioni ?? []).length,
    segnalazioniAperte,
    prossimaAssemblea: prossime[0]?.data ?? null,
    updatedAt: condominio.updatedAt,
  };
}

export function personaListItem(persona: Entita): Entita {
  return {
    id: persona.id,
    nome: persona.nome,
    cognome: persona.cognome,
    codiceFiscale: persona.codiceFiscale ?? null,
    email: persona.email ?? null,
    telefono: persona.telefono ?? null,
    note: persona.note ?? null,
    archiviato: Boolean(persona.archiviato),
    createdAt: persona.createdAt,
    updatedAt: persona.updatedAt,
    condominiCount: (persona.condomini ?? []).length,
    unitaCount: (persona.unita ?? []).length,
  };
}

export function attivitaArricchita(attivita: Entita): Entita {
  const s = caricaStato();
  const condominio = attivita.condominioId ? s.condomini[attivita.condominioId] : null;
  const persona = attivita.personaId ? s.persone[attivita.personaId] : null;
  return {
    ...attivita,
    condominio: condominio?.denominazione ?? null,
    persona: persona ? `${persona.nome} ${persona.cognome}` : null,
  };
}

export function documentoArricchito(documento: DemoDocumento): Entita {
  const s = caricaStato();
  const condominio = documento.condominioId ? s.condomini[documento.condominioId] : null;
  return {
    ...documento,
    condominio: condominio?.denominazione ?? null,
    scaricabile: Boolean(URL_DOCUMENTI[documento.id]),
  };
}

/** Condominio, persona e unità a cui è collegato un documento. */
export function etichettaEntita(entitaTipo: string, entitaId: string | null): string | null {
  if (!entitaId) return null;
  const s = caricaStato();
  if (entitaTipo === "condominio") return s.condomini[entitaId]?.denominazione ?? null;
  if (entitaTipo === "persona") {
    const persona = s.persone[entitaId];
    return persona ? `${persona.nome} ${persona.cognome}` : null;
  }
  return null;
}
