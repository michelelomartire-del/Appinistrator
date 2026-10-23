/**
 * API finta per la demo statica.
 *
 * Risponde agli stessi percorsi dell'API Express usando lo snapshot dei dati
 * dimostrativi. Le letture sono ricalcolate dai record, le scritture delle
 * anagrafiche (condomìni, unità, persone, segnalazioni, attività) modificano lo
 * stato in memoria e restano salvate in localStorage.
 *
 * Rendiconti, assemblee, consumi, importazione e caricamento documenti sono in
 * sola lettura: la demo non simula calcoli contabili.
 */
import {
  adesso,
  arrotonda,
  attivitaArricchita,
  caricaStato,
  condominioListItem,
  documentoArricchito,
  etichettaEntita,
  modifica,
  normalizza,
  nuovoId,
  oggiIso,
  pagina,
  personaListItem,
  somma,
  snapshot,
  URL_DOCUMENTI,
  type DemoDocumento,
  type Entita,
} from "./store";

const MESSAGGIO_SOLA_LETTURA =
  "Nella demo questa sezione è in sola lettura. Nell'applicazione reale l'operazione è disponibile.";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function errore(status: number, messaggio: string, extra: Entita = {}): Response {
  return json({ error: messaggio, ...extra }, status);
}

function solaLettura(): Response {
  return errore(403, MESSAGGIO_SOLA_LETTURA, { code: "demo_sola_lettura" });
}

function nonTrovato(cosa: string): Response {
  return errore(404, `${cosa} non trovato`);
}

function valore(query: URLSearchParams, chiave: string): string | undefined {
  const v = query.get(chiave);
  return v === null || v === "" ? undefined : v;
}

function numero(query: URLSearchParams, chiave: string, fallback: number): number {
  const v = Number(query.get(chiave));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function confronta(a: unknown, b: unknown): number {
  return String(a ?? "").localeCompare(String(b ?? ""), "it");
}

/* ------------------------------------------------------------------------- */
/* Liste                                                                     */
/* ------------------------------------------------------------------------- */

function listaCondomini(query: URLSearchParams) {
  const s = caricaStato();
  const q = normalizza(valore(query, "q"));
  const stato = valore(query, "stato");
  const comune = normalizza(valore(query, "comune"));
  const archiviato = valore(query, "archiviato") ?? "false";
  const sort = valore(query, "sort") ?? "denominazione";
  const dir = valore(query, "dir") ?? "asc";

  let items = Object.values(s.condomini).map(condominioListItem);
  items = items.filter((c) =>
    archiviato === "tutti" ? true : archiviato === "true" ? c.archiviato : !c.archiviato,
  );
  if (stato) items = items.filter((c) => c.stato === stato);
  if (comune) items = items.filter((c) => normalizza(c.comune).includes(comune));
  if (q) {
    items = items.filter((c) =>
      [c.denominazione, c.codice, c.comune, c.indirizzo].some((campo) =>
        normalizza(campo).includes(q),
      ),
    );
  }
  const chiave: Record<string, string> = {
    denominazione: "denominazione",
    codice: "codice",
    comune: "comune",
    aggiornato: "updatedAt",
  };
  items.sort((a, b) => confronta(a[chiave[sort] ?? "denominazione"], b[chiave[sort] ?? "denominazione"]));
  if (dir === "desc") items.reverse();
  return pagina(items, numero(query, "page", 1), numero(query, "perPage", 25));
}

function listaPersone(query: URLSearchParams) {
  const s = caricaStato();
  const q = normalizza(valore(query, "q"));
  const archiviato = valore(query, "archiviato") ?? "false";
  let items = Object.values(s.persone).map(personaListItem);
  items = items.filter((p) =>
    archiviato === "tutti" ? true : archiviato === "true" ? p.archiviato : !p.archiviato,
  );
  if (q) {
    items = items.filter((p) =>
      [p.nome, p.cognome, p.email, p.codiceFiscale, p.telefono].some((campo) =>
        normalizza(campo).includes(q),
      ),
    );
  }
  items.sort((a, b) => confronta(a.cognome, b.cognome) || confronta(a.nome, b.nome));
  return pagina(items, numero(query, "page", 1), numero(query, "perPage", 25));
}

function listaSegnalazioni(query: URLSearchParams) {
  const s = caricaStato();
  const q = normalizza(valore(query, "q"));
  const stato = valore(query, "stato");
  const condominioId = valore(query, "condominioId");
  const priorita = valore(query, "priorita");
  const categoria = valore(query, "categoria");
  const scadute = valore(query, "scadute") === "true";
  const sort = valore(query, "sort") ?? "apertura";
  const oggi = oggiIso();

  let items = Object.values(s.segnalazioni);
  if (stato === "aperte") {
    items = items.filter((x) => ["nuova", "in_valutazione", "assegnata", "in_corso"].includes(String(x.stato)));
  } else if (stato) {
    items = items.filter((x) => x.stato === stato);
  }
  if (condominioId) items = items.filter((x) => x.condominioId === condominioId);
  if (priorita) items = items.filter((x) => x.priorita === priorita);
  if (categoria) items = items.filter((x) => x.categoria === categoria);
  if (scadute) {
    items = items.filter(
      (x) =>
        x.scadenza &&
        String(x.scadenza) < oggi &&
        !["risolta", "chiusa"].includes(String(x.stato)),
    );
  }
  if (q) {
    items = items.filter((x) =>
      [x.titolo, x.codice, x.descrizione, x.condominio, x.referente].some((campo) =>
        normalizza(campo).includes(q),
      ),
    );
  }

  const ordine: Record<string, number> = { bassa: 0, media: 1, alta: 2, urgente: 3 };
  items = [...items].sort((a, b) => {
    if (sort === "scadenza") {
      const sa = a.scadenza ? String(a.scadenza) : "9999-12-31";
      const sb = b.scadenza ? String(b.scadenza) : "9999-12-31";
      return sa.localeCompare(sb);
    }
    if (sort === "priorita") return (ordine[String(b.priorita)] ?? 0) - (ordine[String(a.priorita)] ?? 0);
    return String(b.dataApertura).localeCompare(String(a.dataApertura));
  });

  // L'elenco non include lo storico: si restituiscono i campi di riepilogo.
  const righe = items.map(({ storico: _storico, documentiCount: _documenti, ...resto }) => resto);
  return pagina(righe, numero(query, "page", 1), numero(query, "perPage", 25));
}

function listaAssemblee(query: URLSearchParams) {
  const s = caricaStato();
  const condominioId = valore(query, "condominioId");
  const stato = valore(query, "stato");
  const prossime = valore(query, "prossime") === "true";
  const da = valore(query, "da");
  const al = valore(query, "al");
  const oggi = oggiIso();

  let items = Object.values(s.assemblee);
  if (condominioId) items = items.filter((a) => a.condominioId === condominioId);
  if (stato) items = items.filter((a) => a.stato === stato);
  if (prossime) {
    items = items.filter(
      (a) => String(a.data) >= oggi && ["programmata", "convocata"].includes(String(a.stato)),
    );
  }
  if (da) items = items.filter((a) => String(a.data) >= da);
  if (al) items = items.filter((a) => String(a.data) <= al);
  items = [...items].sort((a, b) => String(b.data).localeCompare(String(a.data)));
  return pagina(items, numero(query, "page", 1), numero(query, "perPage", 25));
}

function listaPeriodi(query: URLSearchParams) {
  const s = caricaStato();
  const condominioId = valore(query, "condominioId");
  const stato = valore(query, "stato");
  const anno = valore(query, "anno");
  let items = Object.values(s.periodi);
  if (condominioId) items = items.filter((p) => p.condominioId === condominioId);
  if (stato) items = items.filter((p) => p.stato === stato);
  if (anno) items = items.filter((p) => String(p.dataInizio).startsWith(anno));
  items = [...items].sort(
    (a, b) => String(b.dataInizio).localeCompare(String(a.dataInizio)) || confronta(a.condominio, b.condominio),
  );
  return pagina(
    items.map(({ spese: _s, rate: _r, pagamenti: _p, ...resto }) => resto),
    numero(query, "page", 1),
    numero(query, "perPage", 25),
  );
}

function listaConsumi(query: URLSearchParams) {
  const s = caricaStato();
  const condominioId = valore(query, "condominioId");
  const categoria = valore(query, "categoria");
  const origine = valore(query, "origine");
  const dal = valore(query, "dal");
  const al = valore(query, "al");
  let items = Object.values(s.consumi).map((c) => c.consumo as Entita);
  if (condominioId) items = items.filter((c) => c.condominioId === condominioId);
  if (categoria) items = items.filter((c) => c.categoria === categoria);
  if (origine) items = items.filter((c) => c.origine === origine);
  if (dal) items = items.filter((c) => String(c.periodoDa) >= dal);
  if (al) items = items.filter((c) => String(c.periodoA) <= al);
  items = [...items].sort(
    (a, b) => String(b.periodoDa).localeCompare(String(a.periodoDa)) || confronta(a.condominio, b.condominio),
  );
  return pagina(items, numero(query, "page", 1), numero(query, "perPage", 50));
}

function listaAttivita(query: URLSearchParams) {
  const s = caricaStato();
  const condominioId = valore(query, "condominioId");
  const personaId = valore(query, "personaId");
  const completata = valore(query, "completata") ?? "tutte";
  let items = s.attivita.map(attivitaArricchita);
  if (condominioId) items = items.filter((a) => a.condominioId === condominioId);
  if (personaId) items = items.filter((a) => a.personaId === personaId);
  if (completata !== "tutte") items = items.filter((a) => Boolean(a.completata) === (completata === "true"));
  items = [...items].sort((a, b) => String(b.data).localeCompare(String(a.data)));
  return pagina(items, numero(query, "page", 1), numero(query, "perPage", 50));
}

function listaDocumenti(query: URLSearchParams) {
  const s = caricaStato();
  const condominioId = valore(query, "condominioId");
  const entitaTipo = valore(query, "entitaTipo");
  const entitaId = valore(query, "entitaId");
  let items = s.documenti.filter((d) => !d.archiviato).map(documentoArricchito);
  if (condominioId) items = items.filter((d) => d.condominioId === condominioId);
  if (entitaTipo) items = items.filter((d) => d.entitaTipo === entitaTipo);
  if (entitaId) items = items.filter((d) => d.entitaId === entitaId);
  items = [...items].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return pagina(items, numero(query, "page", 1), numero(query, "perPage", 50));
}

/* ------------------------------------------------------------------------- */
/* Dashboard                                                                 */
/* ------------------------------------------------------------------------- */

function calcolaDashboard() {
  const s = caricaStato();
  const oggi = oggiIso();
  const condomini = Object.values(s.condomini).filter((c) => !c.archiviato);
  const segnalazioni = Object.values(s.segnalazioni);

  const perStato = (valori: Entita[], campo: string) => {
    const mappa = new Map<string, number>();
    for (const v of valori) mappa.set(String(v[campo]), (mappa.get(String(v[campo])) ?? 0) + 1);
    return [...mappa.entries()].map(([stato, count]) => ({ stato, count }));
  };

  const rate = Object.values(s.periodi).flatMap((p) => (p.rate ?? []) as Entita[]);
  const totaleRate = somma(rate.map((r) => r.importo));
  const incassato = somma(rate.map((r) => r.incassato));
  const rateScadute = rate.filter(
    (r) => String(r.scadenza) < oggi && arrotonda(Number(r.importo) - Number(r.incassato)) > 0.004,
  );
  const residuoScaduto = somma(
    rateScadute.map((r) => Math.max(Number(r.importo) - Number(r.incassato), 0)),
  );
  const percentualeIncassata = totaleRate > 0 ? arrotonda((incassato / totaleRate) * 1000) / 10 : null;

  const segnalazioniAperte = segnalazioni.filter((x) =>
    ["nuova", "in_valutazione", "assegnata", "in_corso"].includes(String(x.stato)),
  ).length;
  const scadute = segnalazioni
    .filter(
      (x) => x.scadenza && String(x.scadenza) < oggi && !["risolta", "chiusa"].includes(String(x.stato)),
    )
    .sort((a, b) => String(a.scadenza).localeCompare(String(b.scadenza)));
  const prossime = Object.values(s.assemblee)
    .filter((a) => String(a.data) >= oggi && ["programmata", "convocata"].includes(String(a.stato)))
    .sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const consumi = Object.values(s.consumi);
  const confrontabili = consumi.filter((c) => (c.confronto as Entita | undefined)?.stato === "confrontabile").length;

  const scadenzeRate = rate
    .filter((r) => {
      const limite = new Date();
      limite.setDate(limite.getDate() + 30);
      const scadenza = String(r.scadenza);
      return (
        scadenza <= `${limite.getFullYear()}-${String(limite.getMonth() + 1).padStart(2, "0")}-${String(limite.getDate()).padStart(2, "0")}` &&
        arrotonda(Number(r.importo) - Number(r.incassato)) > 0.004
      );
    })
    .sort((a, b) => String(a.scadenza).localeCompare(String(b.scadenza)))
    .slice(0, 10)
    .map((r) => {
      const periodo = Object.values(s.periodi).find((p) => p.id === r.periodoId);
      return {
        id: r.id,
        descrizione: r.descrizione,
        condominio: periodo?.condominio ?? "",
        scadenza: r.scadenza,
        importo: r.importo,
        incassato: r.incassato,
        residuo: r.residuo,
      };
    });

  const datiInsufficienti: string[] = [];
  if (rate.length === 0)
    datiInsufficienti.push("Nessuna rata registrata: incassi e stato dei rendiconti non sono disponibili.");
  if (Object.keys(s.periodi).length === 0)
    datiInsufficienti.push("Nessun periodo contabile registrato nel modulo Rendiconti.");
  if (consumi.length === 0) datiInsufficienti.push("Nessun consumo registrato: confronti non disponibili.");
  else if (confrontabili === 0)
    datiInsufficienti.push("Esistono consumi ma nessuna coppia di periodi omogenei: i confronti non sono mostrati.");
  if (prossime.length === 0) datiInsufficienti.push("Nessuna assemblea programmata o convocata in calendario.");

  const kpis = [
    {
      id: "condomini_attivi",
      label: "Condomini attivi",
      value: condomini.filter((c) => c.stato === "attivo").length,
      unit: "count",
      href: "/condomini?stato=attivo",
      hint: "Rapporti con stato “Attivo” non archiviati",
      explanation: "Conteggio dei condomini con stato “Attivo” e non archiviati.",
      available: true,
    },
    {
      id: "segnalazioni_aperte",
      label: "Segnalazioni aperte",
      value: segnalazioniAperte,
      unit: "count",
      href: "/segnalazioni?stato=aperte",
      hint: "Nuove, in valutazione, assegnate e in corso",
      explanation: "Somma delle segnalazioni negli stati Nuova, In valutazione, Assegnata e In corso.",
      available: true,
    },
    {
      id: "segnalazioni_scadute",
      label: "Segnalazioni scadute",
      value: scadute.length,
      unit: "count",
      href: "/segnalazioni?scadute=true",
      hint: "Scadenza superata e non ancora risolte",
      explanation: "Segnalazioni con scadenza precedente a oggi e stato diverso da Risolta o Chiusa.",
      available: true,
    },
    {
      id: "prossime_assemblee",
      label: "Prossime assemblee",
      value: prossime.length,
      unit: "count",
      href: "/assemblee?prossime=true",
      hint: "Programmate o convocate da oggi",
      explanation: "Assemblee con data odierna o futura e stato Programmata o Convocata.",
      available: true,
    },
    {
      id: "percentuale_incassata",
      label: "Rate incassate",
      value: percentualeIncassata,
      unit: "percent",
      href: "/rendiconti",
      hint: rate.length > 0 ? "Incassato su totale rate registrate" : "Nessuna rata registrata",
      explanation:
        "Percentuale = pagamenti registrati ÷ totale delle rate registrate. Considera solo rate presenti nel CRM, non l’intero bilancio.",
      available: percentualeIncassata !== null,
      unavailableReason:
        rate.length === 0
          ? "Non ci sono rate registrate: la percentuale non è calcolabile."
          : "Il totale delle rate è zero: la percentuale non è calcolabile.",
    },
    {
      id: "residuo_scaduto",
      label: "Residuo scaduto",
      value: rateScadute.length > 0 ? residuoScaduto : null,
      unit: "euro",
      href: "/rendiconti?scadute=true",
      hint: rateScadute.length > 0 ? `${rateScadute.length} rate con residuo` : "Nessuna rata scaduta con residuo",
      explanation: "Somma dei residui (importo rata − pagamenti) delle rate con scadenza superata.",
      available: rateScadute.length > 0,
      unavailableReason: "Nessuna rata scaduta con residuo aperto.",
    },
    {
      id: "confronti_consumi",
      label: "Consumi confrontabili",
      value: confrontabili > 0 ? confrontabili : null,
      unit: "count",
      href: "/consumi",
      hint: confrontabili > 0 ? "Periodi omogenei con confronto valido" : "Dati non omogenei o assenti",
      explanation:
        "Numero di letture che hanno un periodo precedente omogeneo (stessa categoria e unità di misura, durata simile, non stimato).",
      available: confrontabili > 0,
      unavailableReason:
        consumi.length === 0
          ? "Nessun consumo registrato."
          : "Nessuna coppia di periodi omogenei: il confronto non è mostrato.",
    },
  ];

  return {
    kpis,
    condominiPerStato: perStato(condomini, "stato"),
    segnalazioniPerStato: perStato(segnalazioni, "stato"),
    prossimeAssemblee: prossime.slice(0, 10).map((a) => ({
      id: a.id,
      condominioId: a.condominioId,
      condominio: a.condominio,
      data: a.data,
      ora: a.ora ?? null,
      tipo: a.tipo,
      stato: a.stato,
      punti: (a.punti ?? []).length,
    })),
    segnalazioniScadute: scadute.slice(0, 10).map((x) => ({
      id: x.id,
      codice: x.codice,
      titolo: x.titolo,
      condominio: x.condominio,
      scadenza: x.scadenza,
      stato: x.stato,
    })),
    scadenzeRate,
    datiInsufficienti,
    oggi,
  };
}

/* ------------------------------------------------------------------------- */
/* Ricerca                                                                   */
/* ------------------------------------------------------------------------- */

function ricerca(testo: string) {
  const s = caricaStato();
  const q = normalizza(testo);
  const contiene = (valori: unknown[]) => valori.some((v) => normalizza(v).includes(q));
  const limite = <T>(items: T[]) => items.slice(0, 5);
  return {
    condomini: limite(
      Object.values(s.condomini)
        .filter((c) => !c.archiviato && contiene([c.denominazione, c.codice, c.comune, c.indirizzo]))
        .map((c) => ({ id: c.id, codice: c.codice, denominazione: c.denominazione, comune: c.comune ?? null })),
    ),
    persone: limite(
      Object.values(s.persone)
        .filter((p) => !p.archiviato && contiene([p.nome, p.cognome, p.email, p.codiceFiscale]))
        .map((p) => ({ id: p.id, nome: p.nome, cognome: p.cognome, email: p.email ?? null })),
    ),
    segnalazioni: limite(
      Object.values(s.segnalazioni)
        .filter((x) => contiene([x.titolo, x.codice, x.descrizione]))
        .map((x) => ({ id: x.id, codice: x.codice, titolo: x.titolo, condominio: x.condominio })),
    ),
    assemblee: limite(
      Object.values(s.assemblee)
        .filter((a) => contiene([a.condominio, a.luogo, a.data]))
        .map((a) => ({ id: a.id, condominio: a.condominio, data: a.data, tipo: a.tipo })),
    ),
    periodi: limite(
      Object.values(s.periodi)
        .filter((p) => contiene([p.etichetta, p.condominio]))
        .map((p) => ({ id: p.id, etichetta: p.etichetta, condominio: p.condominio, dataInizio: p.dataInizio })),
    ),
    consumi: limite(
      Object.values(s.consumi)
        .map((c) => c.consumo as Entita)
        .filter((c) => contiene([c.condominio, c.categoria, c.fonte]))
        .map((c) => ({
          id: c.id,
          condominio: c.condominio,
          condominioId: c.condominioId,
          categoria: c.categoria,
          periodoDa: c.periodoDa,
        })),
    ),
    documenti: limite(
      s.documenti
        .filter((d) => !d.archiviato && contiene([d.nomeFile, d.descrizione, d.categoria]))
        .map((d) => ({
          id: d.id,
          nomeFile: d.nomeFile,
          entitaTipo: d.entitaTipo,
          condominio: s.condomini[d.condominioId ?? ""]?.denominazione ?? null,
        })),
    ),
  };
}

/* ------------------------------------------------------------------------- */
/* Scritture                                                                 */
/* ------------------------------------------------------------------------- */

function codiceCondominio(): string {
  const s = caricaStato();
  const massimo = Object.values(s.condomini).reduce((acc, c) => {
    const numero = Number(String(c.codice).replace(/\D/g, ""));
    return Number.isFinite(numero) && numero > acc ? numero : acc;
  }, 0);
  return `FB-${String(massimo + 1).padStart(4, "0")}`;
}

function codiceSegnalazione(): string {
  const s = caricaStato();
  const massimo = Object.values(s.segnalazioni).reduce((acc, x) => {
    const numero = Number(String(x.codice).replace(/\D/g, ""));
    return Number.isFinite(numero) && numero > acc ? numero : acc;
  }, 0);
  return `SG-${String(massimo + 1).padStart(4, "0")}`;
}

function registraAudit(azione: string, entitaTipo: string, descrizione: string) {
  const s = caricaStato();
  s.audit.unshift({
    id: nuovoId(),
    azione,
    entitaTipo,
    entitaId: null,
    descrizione,
    attoreEmail: "demo@effebi.invalid",
    createdAt: adesso(),
  });
}

function creaCondominio(body: Entita) {
  if (!body.denominazione || String(body.denominazione).trim().length < 2) {
    return errore(400, "Alcuni campi non sono validi", {
      code: "validazione",
      errors: { denominazione: "La denominazione è obbligatoria" },
    });
  }
  const id = nuovoId();
  modifica((s) => {
    s.condomini[id] = {
      id,
      codice: codiceCondominio(),
      denominazione: String(body.denominazione).trim(),
      indirizzo: body.indirizzo ?? null,
      cap: body.cap ?? null,
      comune: body.comune ?? null,
      provincia: body.provincia ?? null,
      codiceFiscale: body.codiceFiscale ?? null,
      stato: body.stato ?? "attivo",
      dataInizioIncarico: body.dataInizioIncarico ?? null,
      dataFineIncarico: body.dataFineIncarico ?? null,
      note: body.note ?? null,
      archiviato: false,
      createdAt: adesso(),
      updatedAt: adesso(),
      relazioni: [],
      unita: [],
      attivita: [],
    };
    registraAudit("condominio_creato", "condominio", `Creato condominio ${body.denominazione} (demo)`);
  });
  return json(caricaStato().condomini[id], 201);
}

function aggiornaCondominio(id: string, body: Entita) {
  const s = caricaStato();
  const esistente = s.condomini[id];
  if (!esistente) return nonTrovato("Condominio");
  modifica(() => {
    const campi = [
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
    ];
    for (const campo of campi) {
      if (body[campo] !== undefined) esistente[campo] = body[campo] === "" ? null : body[campo];
    }
    esistente.updatedAt = adesso();
    registraAudit("condominio_modificato", "condominio", `Modificato condominio ${esistente.denominazione} (demo)`);
  });
  return json(esistente);
}

function creaUnita(condominioId: string, body: Entita) {
  const s = caricaStato();
  const condominio = s.condomini[condominioId];
  if (!condominio) return nonTrovato("Condominio");
  if (!body.identificativo) {
    return errore(400, "Alcuni campi non sono validi", {
      code: "validazione",
      errors: { identificativo: "L’identificativo è obbligatorio" },
    });
  }
  const millesimi = body.millesimi === undefined || body.millesimi === null ? null : Number(body.millesimi);
  if (millesimi !== null) {
    const totale = somma([...condominio.unita.map((u: Entita) => u.millesimi), millesimi]);
    if (totale > 1000.0001) {
      return errore(
        400,
        `La somma dei millesimi supererebbe 1000 (attuale ${arrotonda(totale - millesimi)} + ${millesimi}). Verifica i valori.`,
        { code: "validazione", errors: { millesimi: "Totale millesimi oltre 1000" } },
      );
    }
  }
  const id = nuovoId();
  modifica(() => {
    condominio.unita.push({
      id,
      condominioId,
      identificativo: body.identificativo,
      piano: body.piano ?? null,
      categoria: body.categoria ?? null,
      millesimi,
      millesimiRiscaldamento: body.millesimiRiscaldamento ?? null,
      note: body.note ?? null,
      archiviato: false,
      persone: [],
    });
    condominio.updatedAt = adesso();
    registraAudit("unita_creata", "condominio", `Aggiunta unità ${body.identificativo} (demo)`);
  });
  return json(condominio.unita[condominio.unita.length - 1], 201);
}

function aggiornaUnita(condominioId: string, unitaId: string, body: Entita) {
  const s = caricaStato();
  const condominio = s.condomini[condominioId];
  const unita = condominio?.unita.find((u: Entita) => u.id === unitaId);
  if (!condominio || !unita) return nonTrovato("Unità");
  if (body.millesimi !== undefined && body.millesimi !== null) {
    const altre = condominio.unita
      .filter((u: Entita) => u.id !== unitaId)
      .map((u: Entita) => u.millesimi);
    const totale = somma([...altre, Number(body.millesimi)]);
    if (totale > 1000.0001) {
      return errore(400, `La somma dei millesimi supererebbe 1000 (totale ${arrotonda(totale)}). Verifica i valori.`, {
        code: "validazione",
        errors: { millesimi: "Totale millesimi oltre 1000" },
      });
    }
  }
  modifica(() => {
    for (const campo of ["identificativo", "piano", "categoria", "millesimi", "millesimiRiscaldamento", "note"]) {
      if (body[campo] !== undefined) unita[campo] = body[campo] === "" ? null : body[campo];
    }
  });
  return json(unita);
}

function eliminaUnita(condominioId: string, unitaId: string) {
  const s = caricaStato();
  const condominio = s.condomini[condominioId];
  if (!condominio) return nonTrovato("Condominio");
  const indice = condominio.unita.findIndex((u: Entita) => u.id === unitaId);
  if (indice === -1) return nonTrovato("Unità");
  modifica(() => {
    condominio.unita.splice(indice, 1);
    for (const persona of Object.values(s.persone)) {
      persona.unita = (persona.unita ?? []).filter((u: Entita) => u.unitaId !== unitaId);
    }
  });
  return json({ ok: true });
}

function creaPersona(body: Entita) {
  if (!body.nome || !body.cognome) {
    return errore(400, "Alcuni campi non sono validi", {
      code: "validazione",
      errors: { nome: "Nome e cognome sono obbligatori" },
    });
  }
  const id = nuovoId();
  modifica((s) => {
    s.persone[id] = {
      id,
      nome: String(body.nome).trim(),
      cognome: String(body.cognome).trim(),
      codiceFiscale: body.codiceFiscale ? String(body.codiceFiscale).toUpperCase() : null,
      email: body.email ?? null,
      telefono: body.telefono ?? null,
      note: body.note ?? null,
      archiviato: false,
      createdAt: adesso(),
      updatedAt: adesso(),
      condomini: [],
      unita: [],
    };
    registraAudit("persona_creata", "persona", `Creata persona ${body.nome} ${body.cognome} (demo)`);
  });
  return json(caricaStato().persone[id], 201);
}

function aggiornaPersona(id: string, body: Entita) {
  const s = caricaStato();
  const persona = s.persone[id];
  if (!persona) return nonTrovato("Persona");
  modifica(() => {
    for (const campo of ["nome", "cognome", "codiceFiscale", "email", "telefono", "note"]) {
      if (body[campo] !== undefined) {
        persona[campo] = body[campo] === "" ? null : campo === "codiceFiscale" ? String(body[campo]).toUpperCase() : body[campo];
      }
    }
    persona.updatedAt = adesso();
  });
  return json(persona);
}

function collegaPersona(condominioId: string, body: Entita) {
  const s = caricaStato();
  const condominio = s.condomini[condominioId];
  const persona = s.persone[String(body.personaId)];
  if (!condominio) return nonTrovato("Condominio");
  if (!persona) return nonTrovato("Persona");
  const ruolo = String(body.ruolo ?? "condomino");
  if (condominio.relazioni.some((r: Entita) => r.persona.id === persona.id && r.ruolo === ruolo)) {
    return errore(409, "La persona è già collegata con questo ruolo.", { code: "duplicato" });
  }
  const relazione = {
    id: nuovoId(),
    persona: { ...persona, condomini: undefined, unita: undefined },
    ruolo,
    qualifica: body.qualifica ?? null,
    dataInizio: body.dataInizio ?? null,
    dataFine: body.dataFine ?? null,
    note: body.note ?? null,
  };
  modifica(() => {
    condominio.relazioni.push(relazione);
    persona.condomini.push({
      id: relazione.id,
      condominioId,
      codice: condominio.codice,
      denominazione: condominio.denominazione,
      comune: condominio.comune,
      stato: condominio.stato,
      ruolo,
      qualifica: relazione.qualifica,
      dataInizio: null,
      dataFine: null,
    });
    condominio.updatedAt = adesso();
  });
  return json({ ok: true, personaId: persona.id, condominio }, 201);
}

function scollegaPersona(condominioId: string, relazioneId: string) {
  const s = caricaStato();
  const condominio = s.condomini[condominioId];
  if (!condominio) return nonTrovato("Condominio");
  const relazione = condominio.relazioni.find((r: Entita) => r.id === relazioneId);
  if (!relazione) return nonTrovato("Relazione");
  modifica(() => {
    condominio.relazioni = condominio.relazioni.filter((r: Entita) => r.id !== relazioneId);
    const persona = s.persone[relazione.persona.id];
    if (persona) persona.condomini = (persona.condomini ?? []).filter((c: Entita) => c.id !== relazioneId);
  });
  return json({ ok: true });
}

function collegaUnitaPersona(condominioId: string, unitaId: string, body: Entita) {
  const s = caricaStato();
  const condominio = s.condomini[condominioId];
  const unita = condominio?.unita.find((u: Entita) => u.id === unitaId);
  const persona = s.persone[String(body.personaId)];
  if (!condominio || !unita) return nonTrovato("Unità");
  if (!persona) return nonTrovato("Persona");
  const titolo = String(body.titolo ?? "proprietario");
  if (unita.persone.some((p: Entita) => p.persona.id === persona.id && p.titolo === titolo)) {
    return errore(409, "Questa persona ha già lo stesso titolo sull’unità.", { code: "duplicato" });
  }
  const legame = {
    id: nuovoId(),
    persona: { ...persona, condomini: undefined, unita: undefined },
    titolo,
    millesimi: body.millesimi ?? null,
  };
  modifica(() => {
    unita.persone.push(legame);
    persona.unita.push({
      id: legame.id,
      unitaId,
      identificativo: unita.identificativo,
      condominioId,
      condominio: condominio.denominazione,
      titolo,
      millesimi: legame.millesimi,
    });
  });
  return json({ ok: true }, 201);
}

function scollegaUnitaPersona(condominioId: string, unitaId: string, legameId: string) {
  const s = caricaStato();
  const condominio = s.condomini[condominioId];
  const unita = condominio?.unita.find((u: Entita) => u.id === unitaId);
  if (!unita) return nonTrovato("Unità");
  const legame = unita.persone.find((p: Entita) => p.id === legameId);
  if (!legame) return nonTrovato("Legame");
  modifica(() => {
    unita.persone = unita.persone.filter((p: Entita) => p.id !== legameId);
    const persona = s.persone[legame.persona.id];
    if (persona) persona.unita = (persona.unita ?? []).filter((u: Entita) => u.id !== legameId);
  });
  return json({ ok: true });
}

function creaSegnalazione(body: Entita) {
  const s = caricaStato();
  const condominio = s.condomini[String(body.condominioId)];
  if (!condominio) return nonTrovato("Condominio");
  if (!body.titolo) {
    return errore(400, "Alcuni campi non sono validi", {
      code: "validazione",
      errors: { titolo: "Il titolo è obbligatorio" },
    });
  }
  const id = nuovoId();
  modifica(() => {
    s.segnalazioni[id] = {
      id,
      codice: codiceSegnalazione(),
      condominioId: condominio.id,
      condominio: condominio.denominazione,
      unitaId: body.unitaId ?? null,
      unita: body.unitaId
        ? (condominio.unita.find((u: Entita) => u.id === body.unitaId)?.identificativo ?? null)
        : null,
      areaComune: body.areaComune ?? null,
      titolo: String(body.titolo).trim(),
      descrizione: body.descrizione ?? null,
      categoria: body.categoria ?? "altro",
      priorita: body.priorita ?? "media",
      stato: "nuova",
      dataApertura: body.dataApertura ?? oggiIso(),
      scadenza: body.scadenza ?? null,
      dataChiusura: null,
      fornitorePersonaId: body.fornitorePersonaId ?? null,
      fornitore: null,
      referente: body.referente ?? null,
      createdAt: adesso(),
      updatedAt: adesso(),
      storico: [
        {
          id: nuovoId(),
          daStato: null,
          aStato: "nuova",
          nota: "Apertura della segnalazione (demo).",
          utente: "Francesca Demo",
          createdAt: adesso(),
        },
      ],
      documentiCount: 0,
    };
    registraAudit("segnalazione_creata", "segnalazione", `Aperta segnalazione “${body.titolo}” (demo)`);
  });
  return json(caricaStato().segnalazioni[id], 201);
}

function aggiornaSegnalazione(id: string, body: Entita) {
  const s = caricaStato();
  const segnalazione = s.segnalazioni[id];
  if (!segnalazione) return nonTrovato("Segnalazione");
  modifica(() => {
    for (const campo of [
      "titolo",
      "descrizione",
      "categoria",
      "priorita",
      "scadenza",
      "areaComune",
      "referente",
      "unitaId",
    ]) {
      if (body[campo] !== undefined) segnalazione[campo] = body[campo] === "" ? null : body[campo];
    }
    if (body.unitaId !== undefined) {
      const condominio = s.condomini[segnalazione.condominioId];
      segnalazione.unita = condominio?.unita.find((u: Entita) => u.id === body.unitaId)?.identificativo ?? null;
    }
    segnalazione.updatedAt = adesso();
  });
  return json(segnalazione);
}

function cambiaStatoSegnalazione(id: string, body: Entita) {
  const s = caricaStato();
  const segnalazione = s.segnalazioni[id];
  if (!segnalazione) return nonTrovato("Segnalazione");
  const stato = String(body.stato ?? "");
  if (!stato) {
    return errore(400, "Alcuni campi non sono validi", {
      code: "validazione",
      errors: { stato: "Indica il nuovo stato" },
    });
  }
  modifica(() => {
    const precedente = segnalazione.stato;
    segnalazione.stato = stato;
    if (["risolta", "chiusa"].includes(stato)) segnalazione.dataChiusura = segnalazione.dataChiusura ?? oggiIso();
    else segnalazione.dataChiusura = null;
    segnalazione.updatedAt = adesso();
    segnalazione.storico.push({
      id: nuovoId(),
      daStato: precedente,
      aStato: stato,
      nota: body.nota ?? null,
      utente: "Francesca Demo",
      createdAt: adesso(),
    });
    registraAudit("segnalazione_stato", "segnalazione", `Segnalazione ${segnalazione.codice}: stato ${stato} (demo)`);
  });
  return json(segnalazione);
}

function creaAttivita(body: Entita) {
  const s = caricaStato();
  if (!body.titolo) {
    return errore(400, "Alcuni campi non sono validi", {
      code: "validazione",
      errors: { titolo: "Il titolo è obbligatorio" },
    });
  }
  const id = nuovoId();
  modifica(() => {
    s.attivita.unshift({
      id,
      condominioId: body.condominioId ?? null,
      personaId: body.personaId ?? null,
      tipo: body.tipo ?? "nota",
      titolo: String(body.titolo).trim(),
      descrizione: body.descrizione ?? null,
      data: body.data ?? oggiIso(),
      scadenza: body.scadenza ?? null,
      completata: Boolean(body.completata),
      priorita: body.priorita ?? "normale",
      createdAt: adesso(),
    });
    registraAudit("attivita_creata", "attivita", `Creata attività “${body.titolo}” (demo)`);
  });
  return json(attivitaArricchita(caricaStato().attivita.find((a) => a.id === id)!), 201);
}

function aggiornaAttivita(id: string, body: Entita) {
  const s = caricaStato();
  const attivita = s.attivita.find((a) => a.id === id);
  if (!attivita) return nonTrovato("Attività");
  modifica(() => {
    for (const campo of ["tipo", "titolo", "descrizione", "data", "scadenza", "completata", "priorita", "condominioId", "personaId"]) {
      if (body[campo] !== undefined) attivita[campo] = body[campo] === "" ? null : body[campo];
    }
  });
  return json(attivitaArricchita(attivita));
}

/* ------------------------------------------------------------------------- */
/* Dispatch                                                                  */
/* ------------------------------------------------------------------------- */

export async function demoRequest(input: string, init?: RequestInit): Promise<Response> {
  const metodo = (init?.method ?? "GET").toUpperCase();
  const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const url = new URL(input, base);
  const percorso = url.pathname.replace(/^\/api/, "");
  const query = url.searchParams;
  const parti = percorso.split("/").filter(Boolean);
  const corpo: Entita = (() => {
    if (typeof init?.body === "string") {
      try {
        return JSON.parse(init.body) as Entita;
      } catch {
        return {};
      }
    }
    return {};
  })();

  const solaScrittura = metodo !== "GET";

  /* --- autenticazione (demo: sempre connesso) ---------------------------- */
  if (percorso === "/auth/session") {
    return json({
      authenticated: true,
      mfaRequired: false,
      demoMode: true,
      user: {
        id: "demo-user",
        email: "demo@effebi.invalid",
        nome: "Francesca",
        cognome: "Demo",
        ruolo: "amministratore",
        mfaEnabled: false,
        mustChangePassword: false,
      },
    });
  }
  if (percorso === "/auth/logout") return json({ ok: true });
  if (percorso.startsWith("/auth/")) {
    return errore(400, "Nella demo l’accesso e la gestione della password sono disattivati.", {
      code: "demo",
    });
  }

  /* --- dashboard --------------------------------------------------------- */
  if (percorso === "/dashboard" && !solaScrittura) {
    caricaStato();
    return json(calcolaDashboard());
  }

  /* --- condomìni --------------------------------------------------------- */
  if (parti[0] === "condomini") {
    if (parti[1] === "options") {
      const s = caricaStato();
      return json({
        items: Object.values(s.condomini)
          .filter((c) => !c.archiviato)
          .sort((a, b) => confronta(a.denominazione, b.denominazione))
          .map((c) => ({
            id: c.id,
            codice: c.codice,
            denominazione: c.denominazione,
            comune: c.comune ?? null,
            stato: c.stato,
          })),
      });
    }
    if (parti.length === 1) {
      if (metodo === "GET") return json(listaCondomini(query));
      if (metodo === "POST") return creaCondominio(corpo);
    }
    const condominioId = parti[1];
    if (condominioId) {
      const s = caricaStato();
      const condominio = s.condomini[condominioId];
      // POST /condomini → il corpo potrebbe non avere id: gestito sopra.
      if (parti.length === 2) {
        if (!condominio) return nonTrovato("Condominio");
        if (metodo === "GET") return json(condominio);
        if (metodo === "PATCH") return aggiornaCondominio(condominioId, corpo);
      }
      if (parti[2] === "archivia" && metodo === "POST") {
        if (!condominio) return nonTrovato("Condominio");
        const archiviato = corpo.archiviato !== false;
        modifica(() => {
          condominio.archiviato = archiviato;
          condominio.updatedAt = adesso();
          registraAudit(
            archiviato ? "condominio_archiviato" : "condominio_ripristinato",
            "condominio",
            `${archiviato ? "Archiviato" : "Ripristinato"} condominio ${condominio.denominazione} (demo)`,
          );
        });
        return json({ ok: true, archiviato });
      }
      if (parti[2] === "unita") {
        if (!condominio) return nonTrovato("Condominio");
        if (parti.length === 3 && metodo === "POST") return creaUnita(condominioId, corpo);
        const unitaId = parti[3];
        if (unitaId) {
          if (parti.length === 4) {
            if (metodo === "PATCH") return aggiornaUnita(condominioId, unitaId, corpo);
            if (metodo === "DELETE") return eliminaUnita(condominioId, unitaId);
          }
          if (parti[4] === "persone") {
            if (parti.length === 5 && metodo === "POST") return collegaUnitaPersona(condominioId, unitaId, corpo);
            if (parti.length === 6 && metodo === "DELETE") return scollegaUnitaPersona(condominioId, unitaId, parti[5]!);
          }
        }
      }
      if (parti[2] === "persone") {
        if (!condominio) return nonTrovato("Condominio");
        if (parti.length === 3 && metodo === "POST") return collegaPersona(condominioId, corpo);
        if (parti.length === 4 && metodo === "DELETE") return scollegaPersona(condominioId, parti[3]!);
      }
      if (parti[2] === "documenti" && metodo === "GET") {
        return json(listaDocumenti(new URLSearchParams({ condominioId })));
      }
    }
  }

  /* --- persone ----------------------------------------------------------- */
  if (parti[0] === "persone") {
    if (parti.length === 1) {
      if (metodo === "GET") return json(listaPersone(query));
      if (metodo === "POST") return creaPersona(corpo);
    }
    const personaId = parti[1];
    const s = caricaStato();
    const persona = personaId ? s.persone[personaId] : undefined;
    if (personaId && parti.length === 2) {
      if (!persona) return nonTrovato("Persona");
      if (metodo === "GET") return json(persona);
      if (metodo === "PATCH") return aggiornaPersona(personaId, corpo);
    }
    if (personaId && parti[2] === "archivia" && metodo === "POST") {
      if (!persona) return nonTrovato("Persona");
      const archiviato = corpo.archiviato !== false;
      modifica(() => {
        persona.archiviato = archiviato;
        persona.updatedAt = adesso();
      });
      return json({ ok: true, archiviato });
    }
  }

  /* --- segnalazioni ------------------------------------------------------ */
  if (parti[0] === "segnalazioni") {
    if (parti.length === 1) {
      if (metodo === "GET") return json(listaSegnalazioni(query));
      if (metodo === "POST") return creaSegnalazione(corpo);
    }
    const id = parti[1];
    const segnalazione = id ? caricaStato().segnalazioni[id] : undefined;
    if (id && !segnalazione) return nonTrovato("Segnalazione");
    if (id && parti.length === 2) {
      if (metodo === "GET") return json(segnalazione);
      if (metodo === "PATCH") return aggiornaSegnalazione(id, corpo);
    }
    if (id && parti[2] === "stato" && metodo === "POST") return cambiaStatoSegnalazione(id, corpo);
  }

  /* --- attività ---------------------------------------------------------- */
  if (parti[0] === "attivita") {
    if (parti[1] === "promemoria" && metodo === "GET") {
      const s = caricaStato();
      return json({
        items: s.attivita
          .filter((a) => !a.completata && a.scadenza)
          .map(attivitaArricchita)
          .sort((a, b) => String(a.scadenza).localeCompare(String(b.scadenza))),
      });
    }
    if (parti.length === 1) {
      if (metodo === "GET") return json(listaAttivita(query));
      if (metodo === "POST") return creaAttivita(corpo);
    }
    const id = parti[1];
    if (id && parti.length === 2) {
      if (metodo === "PATCH") return aggiornaAttivita(id, corpo);
      if (metodo === "DELETE") {
        const s = caricaStato();
        const esiste = s.attivita.some((a) => a.id === id);
        if (!esiste) return nonTrovato("Attività");
        modifica(() => {
          s.attivita = s.attivita.filter((a) => a.id !== id);
        });
        return json({ ok: true });
      }
    }
  }

  /* --- moduli in sola lettura ------------------------------------------- */
  if (parti[0] === "assemblee") {
    if (metodo !== "GET") return solaLettura();
    if (parti.length === 1) return json(listaAssemblee(query));
    const assemblea = caricaStato().assemblee[parti[1] ?? ""];
    return assemblea ? json(assemblea) : nonTrovato("Assemblea");
  }

  if (parti[0] === "rendiconti") {
    if (metodo !== "GET") return solaLettura();
    if (parti[1] === "periodi" && parti.length === 2) return json(listaPeriodi(query));
    if (parti[1] === "periodi" && parti[2]) {
      const periodo = caricaStato().periodi[parti[2]];
      if (!periodo) return nonTrovato("Periodo contabile");
      if (parti[3] === "rate") return json({ items: periodo.rate ?? [] });
      if (parti[3] === "spese") return json({ items: periodo.spese ?? [] });
      return json(periodo);
    }
    return nonTrovato("Risorsa dei rendiconti");
  }

  if (parti[0] === "consumi") {
    if (metodo !== "GET") return solaLettura();
    if (parti.length === 1) return json(listaConsumi(query));
    const consumo = caricaStato().consumi[parti[1] ?? ""];
    return consumo ? json(consumo) : nonTrovato("Consumo");
  }

  /* --- documenti --------------------------------------------------------- */
  if (parti[0] === "documenti") {
    if (parti.length === 1 && metodo === "GET") return json(listaDocumenti(query));
    if (parti.length === 1 && metodo === "POST") {
      return errore(403, "Nella demo il caricamento dei file è disattivato: i documenti presenti sono esempi.", {
        code: "demo",
      });
    }
    const documentoId = parti[1];
    if (documentoId) {
      const s = caricaStato();
      const documento = s.documenti.find((d) => d.id === documentoId);
      if (!documento) return nonTrovato("Documento");
      if (parti[2] === "download") {
        const meta = URL_DOCUMENTI[documentoId];
        if (!meta) return errore(404, "File dimostrativo non disponibile");
        const risposta = await fetch(meta.url);
        if (!risposta.ok) return errore(404, "File dimostrativo non disponibile");
        const blob = await risposta.blob();
        return new Response(blob, {
          status: 200,
          headers: {
            "content-type": documento.mime,
            "content-disposition": `attachment; filename="${documento.nomeFile.replace(/[^\x20-\x7e]/g, "_")}"`,
          },
        });
      }
      if (metodo === "GET") {
        return json({
          ...documentoArricchito(documento),
          entita: etichettaEntita(documento.entitaTipo, documento.entitaId),
        });
      }
      if (metodo === "DELETE") {
        return errore(403, "Nella demo l’archivio documenti è in sola lettura.", { code: "demo" });
      }
    }
  }

  /* --- importazione ------------------------------------------------------ */
  if (parti[0] === "import") {
    if (parti[1] === "templates" && metodo === "GET") return json(snapshot.extra.templates);
    if (parti[1] === "template" && metodo === "GET") {
      const tipo = parti[2] ?? "condomini";
      const risposta = await fetch(`/demo-templates/template-${tipo}.xlsx`);
      if (!risposta.ok) return errore(404, "Template non disponibile");
      return new Response(await risposta.blob(), {
        status: 200,
        headers: {
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": `attachment; filename="template-${tipo}.xlsx"`,
        },
      });
    }
    if (metodo !== "GET") {
      return errore(403, "Nella demo l’importazione è disattivata: non vengono salvati file né dati.", {
        code: "demo",
      });
    }
    if (parti.length === 1) {
      return json(
        pagina(
          [...caricaStato().importazioni].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
          numero(query, "page", 1),
          numero(query, "perPage", 20),
        ),
      );
    }
    const lotto = caricaStato().importazioni.find((b) => b.id === parti[1]);
    return lotto ? json({ ...lotto, righe: [] }) : nonTrovato("Importazione");
  }

  /* --- amministrazione --------------------------------------------------- */
  if (parti[0] === "admin") {
    if (parti[1] === "stato" && metodo === "GET") {
      const s = caricaStato();
      return json({
        ...snapshot.extra.stato,
        database: "demo statica (nessun database)",
        conteggi: {
          condomini: Object.values(s.condomini).filter((c) => !c.archiviato).length,
          persone: Object.values(s.persone).filter((p) => !p.archiviato).length,
          segnalazioni: Object.keys(s.segnalazioni).length,
          assemblee: Object.keys(s.assemblee).length,
          periodi: Object.keys(s.periodi).length,
          consumi: Object.keys(s.consumi).length,
          documenti: s.documenti.filter((d) => !d.archiviato).length,
          importazioni: s.importazioni.length,
          sessioni_attive: 1,
        },
      });
    }
    if (parti[1] === "audit" && metodo === "GET") {
      return json(pagina(caricaStato().audit, numero(query, "page", 1), numero(query, "perPage", 25)));
    }
    if (parti[1] === "sessioni" && metodo === "GET") {
      return json({
        items: [
          {
            id: "demo-sessione",
            email: "demo@effebi.invalid",
            createdAt: adesso(),
            lastSeenAt: adesso(),
            expiresAt: adesso(),
            userAgent: navigator.userAgent,
          },
        ],
      });
    }
    if (metodo !== "GET") {
      return errore(403, "Nella demo questa operazione è disattivata.", { code: "demo" });
    }
  }

  /* --- ricerca ----------------------------------------------------------- */
  if (parti[0] === "ricerca" && metodo === "GET") {
    return json(ricerca(valore(query, "q") ?? ""));
  }

  if (percorso === "/health") return json({ ok: true, versione: "1.0.0-demo", demo: true });

  return errore(404, `Endpoint demo non disponibile: ${metodo} ${percorso}`);
}

/** Sostituisce fetch per le chiamate all'API, lasciando passare il resto. */
export function installaDemoFetch(): void {
  caricaStato();
  const originale = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const percorso = new URL(url, window.location.origin).pathname;
    if (percorso.startsWith("/api/")) {
      try {
        return await demoRequest(url, init);
      } catch (error) {
        return errore(500, `Errore nella demo: ${(error as Error).message}`);
      }
    }
    return originale(input, init);
  };
}
