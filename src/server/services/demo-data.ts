/**
 * Dati dimostrativi del CRM EffeBi.
 *
 * TUTTO il contenuto di questo file è INVENTATO: nomi, indirizzi, importi e
 * documenti sono fittizi e coerenti tra loro (i millesimi tornano a 1000, le
 * rate derivano dalle spese del periodo, gli incassi sono compatibili con le
 * rate emesse). Nessun dato reale di condominio o di persona è qui contenuto.
 *
 * Il dataset è un *builder* puro: prende una data di riferimento e restituisce
 * le strutture da inserire. La scrittura su database è in `demo-seed.ts`.
 */

export const DEMO_MARKER = "[DEMO]";

/* ------------------------------------------------------------------------- */
/* Utilità di data e numeri                                                  */
/* ------------------------------------------------------------------------- */

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function addDays(base: Date, days: number): Date {
  const copy = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** Data relativa a oggi (negativa = passato), in formato YYYY-MM-DD. */
export function giorno(base: Date, offset: number): string {
  return isoDate(addDays(base, offset));
}

export function annoInizio(anno: number): string {
  return `${anno}-01-01`;
}

export function annoFine(anno: number): string {
  return `${anno}-12-31`;
}

/** Ultimi `count` trimestri completi, dal più vecchio al più recente. */
export function ultimiTrimestri(
  base: Date,
  count: number,
): Array<{ da: string; a: string }> {
  const trimestreCorrente = Math.floor(base.getMonth() / 3) + 1; // 1..4
  const result: Array<{ da: string; a: string }> = [];
  let anno = base.getFullYear();
  let trimestre = trimestreCorrente;
  for (let i = 0; i < count; i++) {
    trimestre -= 1;
    if (trimestre === 0) {
      trimestre = 4;
      anno -= 1;
    }
    const meseInizio = (trimestre - 1) * 3;
    const ultimoGiorno = new Date(anno, meseInizio + 3, 0).getDate();
    result.unshift({
      da: `${anno}-${pad2(meseInizio + 1)}-01`,
      a: `${anno}-${pad2(meseInizio + 3)}-${pad2(ultimoGiorno)}`,
    });
  }
  return result;
}

/** Ultimi `count` mesi completi, dal più vecchio al più recente. */
export function ultimiMesi(
  base: Date,
  count: number,
): Array<{ da: string; a: string }> {
  const result: Array<{ da: string; a: string }> = [];
  for (let i = count; i >= 1; i--) {
    const inizio = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const fine = new Date(base.getFullYear(), base.getMonth() - i + 1, 0);
    result.push({ da: isoDate(inizio), a: isoDate(fine) });
  }
  return result;
}

/**
 * Ripartisce un totale in millesimi: arrotonda a 2 decimali e assegna il resto
 * all'unità più grande, così la somma è esattamente `total`.
 */
export function distribuisciMillesimi(
  total: number,
  weights: number[],
): number[] {
  const sommaPesi = weights.reduce((acc, w) => acc + w, 0);
  const grezzi = weights.map((w) => (w / sommaPesi) * total);
  const arrotondati = grezzi.map((v) => Math.round(v * 100) / 100);
  const somma = arrotondati.reduce((acc, v) => acc + v, 0);
  const resto = Math.round((total - somma) * 100) / 100;
  const indiceMax = weights.indexOf(Math.max(...weights));
  arrotondati[indiceMax] = Math.round((arrotondati[indiceMax]! + resto) * 100) / 100;
  return arrotondati;
}

/** Importo in euro: due decimali, senza errori di virgola mobile. */
export function euro(value: number): number {
  return Math.round(value * 100) / 100;
}

/* ------------------------------------------------------------------------- */
/* Tipi del dataset                                                          */
/* ------------------------------------------------------------------------- */

export type DemoCondominio = {
  key: string;
  codice: string;
  denominazione: string;
  indirizzo: string;
  cap: string;
  comune: string;
  provincia: string;
  codiceFiscale: string | null;
  stato: "potenziale" | "attivo" | "cessato";
  dataInizioIncarico: string | null;
  dataFineIncarico: string | null;
  note: string;
};

export type DemoPersona = {
  key: string;
  nome: string;
  cognome: string;
  codiceFiscale: string | null;
  email: string | null;
  telefono: string | null;
};

export type DemoUnita = {
  key: string;
  condominio: string;
  identificativo: string;
  piano: string;
  categoria: string;
  millesimi: number;
  millesimiRiscaldamento: number | null;
};

export type DemoRelazione = {
  condominio: string;
  persona: string;
  ruolo: "consigliere" | "condomino" | "referente" | "fornitore" | "amministratore" | "altro";
  qualifica?: string;
};

export type DemoUnitaPersona = {
  unita: string;
  persona: string;
  titolo: "proprietario" | "usufruttuario" | "affittuario" | "comodatario" | "altro";
  millesimi: number | null;
};

export type DemoSegnalazione = {
  key: string;
  condominio: string;
  unita?: string;
  areaComune?: string;
  titolo: string;
  descrizione: string;
  categoria:
    | "manutenzione"
    | "guasto"
    | "pulizia"
    | "sicurezza"
    | "rumore"
    | "documenti"
    | "amministrativa"
    | "altro";
  priorita: "bassa" | "media" | "alta" | "urgente";
  stato: "nuova" | "in_valutazione" | "assegnata" | "in_corso" | "risolta" | "chiusa";
  aperturaGiorni: number;
  scadenzaGiorni?: number;
  chiusuraGiorni?: number;
  fornitore?: string;
  referente?: string;
  storico?: Array<{ stato: string; nota: string; giorni: number }>;
};

export type DemoAssemblea = {
  key: string;
  condominio: string;
  giorni: number;
  ora: string;
  tipo: "ordinaria" | "straordinaria";
  luogo: string;
  modalita: "presenza" | "videoconferenza" | "mista";
  stato: "programmata" | "convocata" | "svolta" | "annullata";
  quorumRegistrato: number | null;
  punti: Array<{
    titolo: string;
    descrizione?: string;
    esito?: "approvato" | "respinto" | "rinviato" | "non_trattato";
    delibera?: string;
  }>;
  partecipanti: Array<{
    persona: string;
    presente: boolean;
    delegante?: string;
    note?: string;
  }>;
};

export type DemoRataSpec = {
  numero: string;
  descrizione: string;
  scadenza: string;
  /** Quota del budget del periodo da ripartire in questa rata (0..1). */
  quota: number;
  /**
   * Comportamento di pagamento per unità, in base all'indice dell'unità:
   * `completo` (pagata), `parziale` (acconto), `nessuno` (non pagata).
   */
  pagamenti?: (indice: number) => "completo" | "parziale" | "nessuno";
};

export type DemoPeriodo = {
  key: string;
  condominio: string;
  etichetta: string;
  inizio: string;
  fine: string;
  stato: "bozza" | "chiuso";
  spese: Array<{
    data: string;
    descrizione: string;
    categoria: string;
    importo: number;
    fornitore?: string;
  }>;
  /** Totale da ripartire nelle rate (di norma il totale delle spese o il preventivo). */
  budget: number | null;
  rate: DemoRataSpec[];
};

export type DemoConsumo = {
  condominio: string;
  categoria: "acqua" | "gas" | "energia_elettrica" | "teleriscaldamento" | "rifiuti" | "altro";
  da: string;
  a: string;
  valore: number;
  unitaMisura: string;
  costo: number | null;
  fonte: string;
  origine: "inserito" | "importato" | "stimato";
  note?: string;
};

export type DemoAttivita = {
  condominio?: string;
  persona?: string;
  tipo: "telefonata" | "email" | "incontro" | "promemoria" | "attivita" | "nota";
  titolo: string;
  descrizione?: string;
  giorni: number;
  scadenzaGiorni?: number;
  completata: boolean;
  priorita: "bassa" | "normale" | "alta";
};

export type DemoDocumento = {
  key: string;
  condominio: string;
  entitaTipo:
    | "condominio"
    | "persona"
    | "unita"
    | "segnalazione"
    | "assemblea"
    | "periodo_contabile"
    | "spesa"
    | "rata"
    | "consumo"
    | "attivita";
  /** Chiave dell'entità collegata (assemblea, periodo, segnalazione...). */
  entitaRef?: string;
  nomeFile: string;
  categoria: string;
  descrizione: string;
  tipo: "pdf" | "csv" | "xlsx";
  titolo: string;
  righe: string[];
  tabella?: { intestazioni: string[]; righe: Array<Array<string | number>> };
};

export type DemoImportLotto = {
  tipo: "condomini" | "persone" | "unita" | "segnalazioni" | "consumi";
  nomeFile: string;
  giorni: number;
  stato: "completato" | "annullato";
  righe: Array<{
    numero: number;
    sintesi: string;
    esito: "importata" | "errore" | "duplicato" | "ignorata";
    errori?: Array<{ campo?: string; messaggio: string }>;
    duplicato?: string;
  }>;
};

export type DemoAudit = {
  azione: string;
  entitaTipo: string;
  descrizione: string;
  giorni: number;
};

export type DemoDataset = {
  condomini: DemoCondominio[];
  persone: DemoPersona[];
  unita: DemoUnita[];
  relazioni: DemoRelazione[];
  unitaPersone: DemoUnitaPersona[];
  segnalazioni: DemoSegnalazione[];
  assemblee: DemoAssemblea[];
  periodi: DemoPeriodo[];
  consumi: DemoConsumo[];
  attivita: DemoAttivita[];
  documenti: DemoDocumento[];
  importazioni: DemoImportLotto[];
  audit: DemoAudit[];
};

/* ------------------------------------------------------------------------- */
/* Anagrafiche                                                               */
/* ------------------------------------------------------------------------- */

const CONDOMINI: DemoCondominio[] = [
  {
    key: "c1",
    codice: "DEMO-0001",
    denominazione: "Condominio Via delle Rose 12",
    indirizzo: "Via delle Rose 12",
    cap: "40136",
    comune: "Bologna",
    provincia: "BO",
    codiceFiscale: "DEMOCF00001",
    stato: "attivo",
    dataInizioIncarico: "2019-01-01",
    dataFineIncarico: null,
    note: `${DEMO_MARKER} Condominio dimostrativo di 12 appartamenti e 4 garage.`,
  },
  {
    key: "c2",
    codice: "DEMO-0002",
    denominazione: "Condominio Via Giuseppe Verdi 8",
    indirizzo: "Via Giuseppe Verdi 8",
    cap: "40121",
    comune: "Bologna",
    provincia: "BO",
    codiceFiscale: "DEMOCF00002",
    stato: "attivo",
    dataInizioIncarico: "2021-03-01",
    dataFineIncarico: null,
    note: `${DEMO_MARKER} Condominio dimostrativo con ascensore e cortile interno.`,
  },
  {
    key: "c3",
    codice: "DEMO-0003",
    denominazione: "Residenza I Gelsi",
    indirizzo: "Via dei Gelsi 24",
    cap: "40033",
    comune: "Casalecchio di Reno",
    provincia: "BO",
    codiceFiscale: "DEMOCF00003",
    stato: "attivo",
    dataInizioIncarico: "2022-06-01",
    dataFineIncarico: null,
    note: `${DEMO_MARKER} Residenza dimostrativa con riscaldamento centralizzato.`,
  },
  {
    key: "c4",
    codice: "DEMO-0004",
    denominazione: "Condominio Piazza Re Enzo 5",
    indirizzo: "Piazza Re Enzo 5",
    cap: "40124",
    comune: "Bologna",
    provincia: "BO",
    codiceFiscale: "DEMOCF00004",
    stato: "attivo",
    dataInizioIncarico: "2023-09-01",
    dataFineIncarico: null,
    note: `${DEMO_MARKER} Piccolo condominio dimostrativo in centro storico.`,
  },
  {
    key: "c5",
    codice: "DEMO-0005",
    denominazione: "Condominio Via del Porto 30",
    indirizzo: "Via del Porto 30",
    cap: "40135",
    comune: "Bologna",
    provincia: "BO",
    codiceFiscale: "DEMOCF00005",
    stato: "attivo",
    dataInizioIncarico: "2024-02-01",
    dataFineIncarico: null,
    note: `${DEMO_MARKER} Condominio dimostrativo con giardino condominiale.`,
  },
  {
    key: "c6",
    codice: "DEMO-0006",
    denominazione: "Condominio Viale Silvani 41",
    indirizzo: "Viale Silvani 41",
    cap: "40122",
    comune: "Bologna",
    provincia: "BO",
    codiceFiscale: null,
    stato: "potenziale",
    dataInizioIncarico: null,
    dataFineIncarico: null,
    note: `${DEMO_MARKER} Trattativa in corso: incarico non ancora conferito.`,
  },
];

/** Codice fiscale volutamente finto: prefisso DEMO + numero progressivo. */
function codiceFiscaleFinto(progressivo: number): string {
  return `DEMO${String(progressivo).padStart(12, "0")}`;
}

type PersonaSpec = [
  key: string,
  nome: string,
  cognome: string,
  email: string | null,
  telefono: string | null,
];

const PERSONE_SPEC: PersonaSpec[] = [
  ["marta", "Marta", "Bellandi", "marta.bellandi@example.invalid", "051 555 0101"],
  ["giulio", "Giulio", "Ferraresi", "giulio.ferraresi@example.invalid", "051 555 0102"],
  ["chiara", "Chiara", "Nardini", "chiara.nardini@example.invalid", "051 555 0103"],
  ["stefano", "Stefano", "Ruggeri", "stefano.ruggeri@example.invalid", null],
  ["irene", "Irene", "Conti", null, "051 555 0104"],
  ["elena", "Elena", "Capelli", "elena.capelli@example.invalid", "051 555 0201"],
  ["davide", "Davide", "Monari", "davide.monari@example.invalid", "051 555 0202"],
  ["paola", "Paola", "Guidi", "paola.guidi@example.invalid", null],
  ["fabio", "Fabio", "Bertelli", "fabio.bertelli@example.invalid", "051 555 0203"],
  ["andrea", "Andrea", "Zanotti", "andrea.zanotti@example.invalid", "051 555 0301"],
  ["silvia", "Silvia", "Mazzanti", "silvia.mazzanti@example.invalid", "051 555 0302"],
  ["lorenzo", "Lorenzo", "Barbieri", "lorenzo.barbieri@example.invalid", null],
  ["teresa", "Teresa", "Bulgarelli", "teresa.bulgarelli@example.invalid", "051 555 0303"],
  ["federica", "Federica", "Sarti", "federica.sarti@example.invalid", "051 555 0401"],
  ["marco", "Marco", "Tinti", "marco.tinti@example.invalid", "051 555 0402"],
  ["roberta", "Roberta", "Fabbri", "roberta.fabbri@example.invalid", "051 555 0501"],
  ["nicola", "Nicola", "Venturelli", "nicola.venturelli@example.invalid", null],
  ["sonia", "Sonia", "Bertocchi", "sonia.bertocchi@example.invalid", "051 555 0502"],
  ["cavina", "Bruno", "Cavina", "idraulica.cavina@example.invalid", "051 555 0901"],
  ["bandini", "Sergio", "Bandini", "elettro.bandini@example.invalid", "051 555 0902"],
  ["pizzi", "Marco", "Pizzi", "ascensori.pizzi@example.invalid", "051 555 0903"],
  ["zani", "Giulia", "Zani", "pulizie.zani@example.invalid", "051 555 0904"],
  ["mengoli", "Carlo", "Mengoli", "termoidraulica.mengoli@example.invalid", "051 555 0905"],
  ["serra", "Antonio", "Serra", "falegnameria.serra@example.invalid", "051 555 0906"],
];

const PERSONE: DemoPersona[] = PERSONE_SPEC.map(([key, nome, cognome, email, telefono], index) => ({
  key,
  nome,
  cognome,
  email,
  telefono,
  codiceFiscale: codiceFiscaleFinto(index + 1),
}));

const FORNITORI = ["cavina", "bandini", "pizzi", "zani", "mengoli", "serra"] as const;

/** Proprietari per condominio, in ordine di assegnazione agli appartamenti. */
const PROPRIETARI: Record<string, string[]> = {
  c1: ["marta", "giulio", "chiara", "stefano", "irene"],
  c2: ["elena", "davide", "paola", "fabio"],
  c3: ["andrea", "silvia", "lorenzo", "teresa"],
  c4: ["federica", "marco"],
  c5: ["roberta", "nicola", "sonia"],
  c6: [],
};

/** Unità per condominio: appartamenti per piano + garage interrati. */
const STRUTTURA: Record<
  string,
  { appartamentiPerPiano: number[]; garage: number; riscaldamento: boolean }
> = {
  c1: { appartamentiPerPiano: [4, 4, 4], garage: 4, riscaldamento: true },
  c2: { appartamentiPerPiano: [4, 4], garage: 4, riscaldamento: true },
  c3: { appartamentiPerPiano: [4, 3, 3], garage: 5, riscaldamento: true },
  c4: { appartamentiPerPiano: [3, 3], garage: 3, riscaldamento: false },
  c5: { appartamentiPerPiano: [3, 3, 3], garage: 3, riscaldamento: true },
  c6: { appartamentiPerPiano: [2, 2], garage: 2, riscaldamento: false },
};

const PESI_APPARTAMENTI = [92, 78, 101, 86, 97, 83, 108, 74, 95, 88, 103, 80, 90, 99, 76, 94, 105, 82];
const PESI_GARAGE = [18, 22, 15, 20, 16, 24, 19, 21, 17, 23, 14, 25];
const PESI_RISCALDAMENTO = [88, 96, 74, 104, 91, 82, 99, 78, 94, 86, 101, 80, 92, 97, 76, 89];

function costruisciUnita(): DemoUnita[] {
  const unita: DemoUnita[] = [];
  for (const condominio of CONDOMINI) {
    const struttura = STRUTTURA[condominio.key]!;
    const appartamenti: Array<{ identificativo: string; piano: string; peso: number }> = [];
    let progressivo = 0;
    struttura.appartamentiPerPiano.forEach((quantita, indicePiano) => {
      for (let i = 0; i < quantita; i++) {
        progressivo += 1;
        appartamenti.push({
          identificativo: `Int. ${progressivo}`,
          piano: String(indicePiano + 1),
          peso: PESI_APPARTAMENTI[(progressivo - 1) % PESI_APPARTAMENTI.length]!,
        });
      }
    });

    // Millesimi generali: appartamenti + garage, normalizzati a 1000 esatti.
    const pesiTotali = [
      ...appartamenti.map((a) => a.peso),
      ...Array.from({ length: struttura.garage }, (_, i) => PESI_GARAGE[i % PESI_GARAGE.length]!),
    ];
    const millesimi = distribuisciMillesimi(1000, pesiTotali);
    const millesimiRiscaldamento = struttura.riscaldamento
      ? distribuisciMillesimi(
          1000,
          appartamenti.map((a) => PESI_RISCALDAMENTO[(Number(a.piano) + a.peso) % PESI_RISCALDAMENTO.length]!),
        )
      : null;

    appartamenti.forEach((appartamento, indice) => {
      unita.push({
        key: `${condominio.key}-a${indice + 1}`,
        condominio: condominio.key,
        identificativo: appartamento.identificativo,
        piano: appartamento.piano,
        categoria: "Appartamento",
        millesimi: millesimi[indice]!,
        millesimiRiscaldamento: millesimiRiscaldamento
          ? millesimiRiscaldamento[indice]!
          : null,
      });
    });

    for (let i = 0; i < struttura.garage; i++) {
      unita.push({
        key: `${condominio.key}-g${i + 1}`,
        condominio: condominio.key,
        identificativo: `Garage ${i + 1}`,
        piano: "S1",
        categoria: "Garage",
        millesimi: millesimi[appartamenti.length + i]!,
        millesimiRiscaldamento: null,
      });
    }
  }
  return unita;
}

/* ------------------------------------------------------------------------- */
/* Relazioni e titoli                                                        */
/* ------------------------------------------------------------------------- */

function costruisciRelazioni(unita: DemoUnita[]): {
  relazioni: DemoRelazione[];
  unitaPersone: DemoUnitaPersona[];
} {
  const relazioni: DemoRelazione[] = [];
  const unitaPersone: DemoUnitaPersona[] = [];
  const aggiunti = new Set<string>();

  const aggiungi = (
    condominio: string,
    persona: string,
    ruolo: DemoRelazione["ruolo"],
    qualifica?: string,
  ) => {
    const chiave = `${condominio}|${persona}|${ruolo}`;
    if (aggiunti.has(chiave)) return;
    aggiunti.add(chiave);
    relazioni.push({ condominio, persona, ruolo, qualifica });
  };

  for (const condominio of CONDOMINI) {
    const proprietari = PROPRIETARI[condominio.key] ?? [];
    const appartamenti = unita.filter(
      (u) => u.condominio === condominio.key && u.categoria === "Appartamento",
    );
    const garage = unita.filter(
      (u) => u.condominio === condominio.key && u.categoria === "Garage",
    );

    proprietari.forEach((persona) => aggiungi(condominio.key, persona, "condomino"));
    if (proprietari[0]) {
      aggiungi(condominio.key, proprietari[0], "consigliere");
      aggiungi(condominio.key, proprietari[0], "referente", "Riferimento per le comunicazioni");
    }

    appartamenti.forEach((appartamento, indice) => {
      const persona = proprietari[indice % Math.max(proprietari.length, 1)];
      if (!persona) return;
      unitaPersone.push({
        unita: appartamento.key,
        persona,
        titolo: "proprietario",
        millesimi: appartamento.millesimi,
      });
    });

    // Un paio di appartamenti sono locati: l'inquilino è un contatto, senza millesimi.
    if (condominio.key === "c1" && appartamenti[1]) {
      unitaPersone.push({
        unita: appartamenti[1].key,
        persona: "stefano",
        titolo: "affittuario",
        millesimi: null,
      });
    }
    if (condominio.key === "c3" && appartamenti[2]) {
      unitaPersone.push({
        unita: appartamenti[2].key,
        persona: "teresa",
        titolo: "affittuario",
        millesimi: null,
      });
    }

    // I garage seguono il proprietario dell'appartamento corrispondente.
    garage.forEach((box, indice) => {
      const persona = proprietari[indice % Math.max(proprietari.length, 1)];
      if (!persona) return;
      unitaPersone.push({ unita: box.key, persona, titolo: "proprietario", millesimi: box.millesimi });
    });
  }

  // Fornitori ricorrenti dello studio, collegati ai condomìni in cui lavorano.
  aggiungi("c1", "cavina", "fornitore", "Idraulica Cavina");
  aggiungi("c1", "bandini", "fornitore", "Elettro Bandini");
  aggiungi("c1", "zani", "fornitore", "Pulizie Zani");
  aggiungi("c2", "cavina", "fornitore", "Idraulica Cavina");
  aggiungi("c2", "pizzi", "fornitore", "Ascensori Pizzi");
  aggiungi("c2", "zani", "fornitore", "Pulizie Zani");
  aggiungi("c3", "mengoli", "fornitore", "Termoidraulica Mengoli");
  aggiungi("c3", "zani", "fornitore", "Pulizie Zani");
  aggiungi("c4", "serra", "fornitore", "Falegnameria Serra");
  aggiungi("c5", "pizzi", "fornitore", "Ascensori Pizzi");
  aggiungi("c5", "cavina", "fornitore", "Idraulica Cavina");

  return { relazioni, unitaPersone };
}

/* ------------------------------------------------------------------------- */
/* Segnalazioni                                                              */
/* ------------------------------------------------------------------------- */

const SEGNALAZIONI: DemoSegnalazione[] = [
  {
    key: "s1",
    condominio: "c1",
    unita: "c1-a4",
    titolo: "Infiltrazione dal terrazzo nell’appartamento 4",
    descrizione:
      "Macchia di umidità sul soffitto del bagno, in corrispondenza del terrazzo soprastante. Il condomino segnala gocciolamento dopo le piogge.",
    categoria: "guasto",
    priorita: "alta",
    stato: "in_corso",
    aperturaGiorni: -26,
    scadenzaGiorni: -4,
    fornitore: "cavina",
    referente: "Marta Bellandi",
    storico: [
      { stato: "nuova", nota: "Apertura della segnalazione su chiamata della condomina.", giorni: -26 },
      { stato: "in_valutazione", nota: "Richiesto sopralluogo all’idraulico.", giorni: -24 },
      { stato: "assegnata", nota: "Incaricata Idraulica Cavina.", giorni: -20 },
      { stato: "in_corso", nota: "Intervento avviato: demolizione parziale del massetto.", giorni: -6 },
    ],
  },
  {
    key: "s2",
    condominio: "c1",
    areaComune: "Vano scale",
    titolo: "Lampade del vano scale spente",
    descrizione: "Due plafoniere non si accendono tra il primo e il secondo piano.",
    categoria: "manutenzione",
    priorita: "media",
    stato: "assegnata",
    aperturaGiorni: -9,
    scadenzaGiorni: 5,
    fornitore: "bandini",
    referente: "Giulio Ferraresi",
  },
  {
    key: "s3",
    condominio: "c1",
    areaComune: "Ingresso",
    titolo: "Portone pedonale che non si chiude",
    descrizione: "La serratura non trattiene il portone: resta accostato anche di notte.",
    categoria: "sicurezza",
    priorita: "alta",
    stato: "nuova",
    aperturaGiorni: -2,
    scadenzaGiorni: 3,
    referente: "Marta Bellandi",
  },
  {
    key: "s4",
    condominio: "c1",
    areaComune: "Cortile",
    titolo: "Rumore da cantiere oltre l’orario consentito",
    descrizione:
      "Lavori nell’appartamento al piano terra protratti oltre le 19:00 per tre giorni.",
    categoria: "rumore",
    priorita: "bassa",
    stato: "in_valutazione",
    aperturaGiorni: -14,
    scadenzaGiorni: 14,
    referente: "Chiara Nardini",
  },
  {
    key: "s5",
    condominio: "c1",
    titolo: "Bolletta acqua con consumo anomalo",
    descrizione:
      "Consumo del trimestre superiore del 40% rispetto allo stesso periodo dell’anno precedente: richiesta verifica perdite.",
    categoria: "amministrativa",
    priorita: "media",
    stato: "risolta",
    aperturaGiorni: -60,
    scadenzaGiorni: -30,
    chiusuraGiorni: -35,
    fornitore: "cavina",
    referente: "Marta Bellandi",
  },
  {
    key: "s6",
    condominio: "c2",
    unita: "c2-a2",
    titolo: "Perdita dalla colonna di scarico del bagno",
    descrizione: "Macchia sul soffitto dell’appartamento sottostante, perdita attiva.",
    categoria: "guasto",
    priorita: "urgente",
    stato: "in_corso",
    aperturaGiorni: -8,
    scadenzaGiorni: 2,
    fornitore: "cavina",
    referente: "Elena Capelli",
    storico: [
      { stato: "nuova", nota: "Segnalazione telefonica della condomina.", giorni: -8 },
      { stato: "assegnata", nota: "Incaricata Idraulica Cavina per urgenza.", giorni: -7 },
      { stato: "in_corso", nota: "Sostituzione del tratto di colonna in corso.", giorni: -3 },
    ],
  },
  {
    key: "s7",
    condominio: "c2",
    areaComune: "Cortile interno",
    titolo: "Pulizia del cortile non eseguita",
    descrizione: "Il cortile non viene pulito da due settimane secondo il calendario concordato.",
    categoria: "pulizia",
    priorita: "media",
    stato: "assegnata",
    aperturaGiorni: -12,
    scadenzaGiorni: -1,
    fornitore: "zani",
    referente: "Davide Monari",
  },
  {
    key: "s8",
    condominio: "c2",
    areaComune: "Piano secondo",
    titolo: "Citofono del piano 2 non funzionante",
    descrizione: "Il posto esterno del piano 2 non chiama gli appartamenti 3 e 4.",
    categoria: "guasto",
    priorita: "media",
    stato: "nuova",
    aperturaGiorni: -3,
    scadenzaGiorni: 10,
    referente: "Paola Guidi",
  },
  {
    key: "s9",
    condominio: "c3",
    areaComune: "Cancello carraio",
    titolo: "Cancello carraio con apertura irregolare",
    descrizione: "Il cancello si blocca a metà corsa e richiede l’intervento manuale.",
    categoria: "manutenzione",
    priorita: "alta",
    stato: "in_valutazione",
    aperturaGiorni: -5,
    scadenzaGiorni: 7,
    referente: "Andrea Zanotti",
  },
  {
    key: "s10",
    condominio: "c3",
    areaComune: "Centrale termica",
    titolo: "Caldaia centralizzata: pressione bassa",
    descrizione:
      "La centrale va in blocco la mattina: necessaria verifica del vaso di espansione prima dell’accensione stagionale.",
    categoria: "guasto",
    priorita: "urgente",
    stato: "in_corso",
    aperturaGiorni: -1,
    scadenzaGiorni: 1,
    fornitore: "mengoli",
    referente: "Lorenzo Barbieri",
    storico: [
      { stato: "nuova", nota: "Segnalazione del consigliere, centrale in blocco.", giorni: -1 },
      { stato: "assegnata", nota: "Incaricata Termoidraulica Mengoli in urgenza.", giorni: -1 },
      { stato: "in_corso", nota: "Intervento programmato per domani mattina.", giorni: 0 },
    ],
  },
  {
    key: "s11",
    condominio: "c3",
    titolo: "Ritiro dei documenti del bilancio non effettuato",
    descrizione: "Due condòmini non hanno ritirato la documentazione del consuntivo.",
    categoria: "documenti",
    priorita: "bassa",
    stato: "chiusa",
    aperturaGiorni: -45,
    scadenzaGiorni: -20,
    chiusuraGiorni: -22,
    referente: "Silvia Mazzanti",
  },
  {
    key: "s12",
    condominio: "c4",
    areaComune: "Locale biciclette",
    titolo: "Tapparelle del locale biciclette danneggiate",
    descrizione: "Due tapparelle non salgono più e il locale resta aperto.",
    categoria: "manutenzione",
    priorita: "bassa",
    stato: "nuova",
    aperturaGiorni: -6,
    scadenzaGiorni: 20,
    fornitore: "serra",
    referente: "Federica Sarti",
  },
  {
    key: "s13",
    condominio: "c4",
    areaComune: "Scala A",
    titolo: "Umidità nella scala A",
    descrizione: "Comparsa di macchie di risalita alla base della parete della scala.",
    categoria: "guasto",
    priorita: "media",
    stato: "risolta",
    aperturaGiorni: -80,
    scadenzaGiorni: -40,
    chiusuraGiorni: -48,
    fornitore: "cavina",
    referente: "Marco Tinti",
  },
  {
    key: "s14",
    condominio: "c5",
    titolo: "Ascensore fermo al piano terra",
    descrizione: "Cabina bloccata con porta aperta: nessun passeggero all’interno.",
    categoria: "guasto",
    priorita: "urgente",
    stato: "assegnata",
    aperturaGiorni: -1,
    scadenzaGiorni: 1,
    fornitore: "pizzi",
    referente: "Roberta Fabbri",
  },
  {
    key: "s15",
    condominio: "c5",
    areaComune: "Garage",
    titolo: "Luce del garage sempre accesa",
    descrizione: "Il temporizzatore dell’illuminazione non spegne più le luci.",
    categoria: "manutenzione",
    priorita: "bassa",
    stato: "nuova",
    aperturaGiorni: -4,
    scadenzaGiorni: 25,
    referente: "Nicola Venturelli",
  },
  {
    key: "s16",
    condominio: "c6",
    titolo: "Sopralluogo per preventivo manutenzione facciata",
    descrizione:
      "Richiesta del potenziale cliente: sopralluogo per valutare stato della facciata e preventivo.",
    categoria: "amministrativa",
    priorita: "media",
    stato: "in_valutazione",
    aperturaGiorni: -3,
    scadenzaGiorni: 12,
  },
];

/* ------------------------------------------------------------------------- */
/* Assemblee                                                                 */
/* ------------------------------------------------------------------------- */

function assemblee(): DemoAssemblea[] {
  return [
    {
      key: "a1",
      condominio: "c1",
      giorni: -190,
      ora: "18:00",
      tipo: "ordinaria",
      luogo: "Sala condominiale",
      modalita: "presenza",
      stato: "svolta",
      quorumRegistrato: 812.45,
      punti: [
        {
          titolo: "Approvazione del consuntivo dell’esercizio precedente",
          descrizione: "Presentazione del rendiconto e delle rate emesse.",
          esito: "approvato",
          delibera: "Consuntivo approvato con 812,45 millesimi favorevoli.",
        },
        {
          titolo: "Manutenzione straordinaria della facciata",
          descrizione: "Preventivo dell’impresa per il rifacimento dell’intonaco.",
          esito: "rinviato",
          delibera: "Rinvio a una successiva assemblea in attesa di un secondo preventivo.",
        },
        {
          titolo: "Approvazione del preventivo dell’esercizio in corso",
          esito: "approvato",
          delibera: "Preventivo approvato a maggioranza.",
        },
      ],
      partecipanti: [
        { persona: "marta", presente: true },
        { persona: "giulio", presente: true },
        { persona: "chiara", presente: false, delegante: "Marta Bellandi" },
        { persona: "stefano", presente: true },
        { persona: "irene", presente: true },
      ],
    },
    {
      key: "a2",
      condominio: "c1",
      giorni: 13,
      ora: "18:30",
      tipo: "ordinaria",
      luogo: "Sala condominiale",
      modalita: "mista",
      stato: "convocata",
      quorumRegistrato: null,
      punti: [
        {
          titolo: "Approvazione del preventivo dell’esercizio successivo",
          descrizione: "Bozza di preventivo con adeguamento delle tariffe di pulizia.",
        },
        {
          titolo: "Affidamento della manutenzione del giardino",
          descrizione: "Confronto fra due preventivi acquisiti.",
        },
        { titolo: "Varie ed eventuali" },
      ],
      partecipanti: [
        { persona: "marta", presente: true },
        { persona: "giulio", presente: true },
        { persona: "chiara", presente: false, delegante: "Giulio Ferraresi" },
        { persona: "irene", presente: false, delegante: "Marta Bellandi" },
      ],
    },
    {
      key: "a3",
      condominio: "c2",
      giorni: -150,
      ora: "18:00",
      tipo: "ordinaria",
      luogo: "Cortile condominiale",
      modalita: "presenza",
      stato: "svolta",
      quorumRegistrato: 734.2,
      punti: [
        {
          titolo: "Approvazione del consuntivo dell’esercizio precedente",
          esito: "approvato",
          delibera: "Consuntivo approvato con 734,20 millesimi favorevoli.",
        },
        {
          titolo: "Installazione di una colonnina di ricarica nel cortile",
          esito: "rinviato",
          delibera: "Rinvio in attesa del parere dell’elettricista sulla potenza disponibile.",
        },
      ],
      partecipanti: [
        { persona: "elena", presente: true },
        { persona: "davide", presente: true },
        { persona: "paola", presente: false, delegante: "Elena Capelli" },
        { persona: "fabio", presente: true },
      ],
    },
    {
      key: "a4",
      condominio: "c2",
      giorni: 41,
      ora: "17:45",
      tipo: "ordinaria",
      luogo: "Sala condominiale",
      modalita: "presenza",
      stato: "programmata",
      quorumRegistrato: null,
      punti: [
        { titolo: "Approvazione del preventivo dell’esercizio successivo" },
        { titolo: "Colonnina di ricarica: nuova valutazione" },
        { titolo: "Varie ed eventuali" },
      ],
      partecipanti: [{ persona: "elena", presente: true }],
    },
    {
      key: "a5",
      condominio: "c3",
      giorni: 6,
      ora: "18:15",
      tipo: "ordinaria",
      luogo: "Sala condominiale",
      modalita: "mista",
      stato: "convocata",
      quorumRegistrato: null,
      punti: [
        {
          titolo: "Sostituzione della caldaia centralizzata",
          descrizione: "Due preventivi: sostituzione completa o riparazione del vaso di espansione.",
        },
        { titolo: "Approvazione del preventivo dell’esercizio successivo" },
        { titolo: "Varie ed eventuali" },
      ],
      partecipanti: [
        { persona: "andrea", presente: true },
        { persona: "silvia", presente: true },
        { persona: "lorenzo", presente: false, delegante: "Andrea Zanotti" },
      ],
    },
    {
      key: "a6",
      condominio: "c3",
      giorni: -230,
      ora: "18:00",
      tipo: "ordinaria",
      luogo: "Sala condominiale",
      modalita: "presenza",
      stato: "svolta",
      quorumRegistrato: 701.5,
      punti: [
        {
          titolo: "Approvazione del consuntivo dell’esercizio precedente",
          esito: "approvato",
          delibera: "Consuntivo approvato con 701,50 millesimi favorevoli.",
        },
        {
          titolo: "Rinnovo del contratto di pulizia",
          esito: "approvato",
          delibera: "Contratto rinnovato per dodici mesi alle condizioni invariate.",
        },
      ],
      partecipanti: [
        { persona: "andrea", presente: true },
        { persona: "silvia", presente: false, delegante: "Andrea Zanotti" },
        { persona: "teresa", presente: true },
      ],
    },
    {
      key: "a7",
      condominio: "c5",
      giorni: 26,
      ora: "18:00",
      tipo: "straordinaria",
      luogo: "Sala condominiale",
      modalita: "videoconferenza",
      stato: "convocata",
      quorumRegistrato: null,
      punti: [
        {
          titolo: "Manutenzione straordinaria del giardino",
          descrizione: "Sostituzione di due alberi pericolanti e ripristino del vialetto.",
        },
        { titolo: "Varie ed eventuali" },
      ],
      partecipanti: [
        { persona: "roberta", presente: true },
        { persona: "nicola", presente: true },
        { persona: "sonia", presente: false, delegante: "Roberta Fabbri" },
      ],
    },
  ];
}

/* ------------------------------------------------------------------------- */
/* Rendiconti                                                                */
/* ------------------------------------------------------------------------- */

/** Pagamenti tipici: quasi tutti pagano, qualcuno resta indietro. */
function pagamentiStandard(indice: number): "completo" | "parziale" | "nessuno" {
  if (indice % 7 === 3) return "nessuno";
  if (indice % 9 === 5) return "parziale";
  return "completo";
}

function periodi(annoCorrente: number): DemoPeriodo[] {
  const annoPrecedente = annoCorrente - 1;
  return [
    {
      key: "p1",
      condominio: "c1",
      etichetta: `Esercizio ${annoPrecedente}`,
      inizio: annoInizio(annoPrecedente),
      fine: annoFine(annoPrecedente),
      stato: "chiuso",
      spese: [
        { data: `${annoPrecedente}-01-31`, descrizione: "Pulizia parti comuni – 1° semestre", categoria: "Pulizia", importo: 1740, fornitore: "Giulia Zani" },
        { data: `${annoPrecedente}-02-20`, descrizione: "Energia elettrica parti comuni", categoria: "Utenze", importo: 630, fornitore: "Elettro Bandini" },
        { data: `${annoPrecedente}-03-15`, descrizione: "Manutenzione ordinaria ascensore", categoria: "Manutenzione", importo: 1180, fornitore: "Ascensori Pizzi" },
        { data: `${annoPrecedente}-04-10`, descrizione: "Polizza assicurativa stabile", categoria: "Assicurazione", importo: 1450 },
        { data: `${annoPrecedente}-05-05`, descrizione: "Manutenzione giardino condominiale", categoria: "Manutenzione", importo: 940 },
        { data: `${annoPrecedente}-07-31`, descrizione: "Pulizia parti comuni – 2° semestre", categoria: "Pulizia", importo: 1740, fornitore: "Giulia Zani" },
        { data: `${annoPrecedente}-09-18`, descrizione: "Acqua condominiale – conguaglio", categoria: "Utenze", importo: 1620 },
        { data: `${annoPrecedente}-11-12`, descrizione: "Riparazione portone d’ingresso", categoria: "Manutenzione", importo: 380, fornitore: "Falegnameria Serra" },
        { data: `${annoPrecedente}-12-15`, descrizione: "Compenso amministratore", categoria: "Amministrazione", importo: 2100 },
        { data: `${annoPrecedente}-12-20`, descrizione: "Diritti di segreteria e registro", categoria: "Amministrazione", importo: 250 },
      ],
      budget: 12030,
      rate: [
        {
          numero: "1/2",
          descrizione: `Rata 1 – esercizio ${annoPrecedente}`,
          scadenza: `${annoPrecedente}-06-30`,
          quota: 0.5,
          pagamenti: (indice) => (indice === 2 ? "nessuno" : indice === 6 ? "parziale" : "completo"),
        },
        {
          numero: "2/2",
          descrizione: `Rata 2 – esercizio ${annoPrecedente}`,
          scadenza: `${annoPrecedente}-12-31`,
          quota: 0.5,
          pagamenti: (indice) => (indice === 2 || indice === 6 ? "nessuno" : "completo"),
        },
      ],
    },
    {
      key: "p2",
      condominio: "c1",
      etichetta: `Esercizio ${annoCorrente}`,
      inizio: annoInizio(annoCorrente),
      fine: annoFine(annoCorrente),
      stato: "bozza",
      spese: [
        { data: `${annoCorrente}-01-25`, descrizione: "Pulizia parti comuni – 1° semestre", categoria: "Pulizia", importo: 1820, fornitore: "Giulia Zani" },
        { data: `${annoCorrente}-02-18`, descrizione: "Energia elettrica parti comuni", categoria: "Utenze", importo: 690, fornitore: "Elettro Bandini" },
        { data: `${annoCorrente}-03-22`, descrizione: "Manutenzione ordinaria ascensore", categoria: "Manutenzione", importo: 1210, fornitore: "Ascensori Pizzi" },
        { data: `${annoCorrente}-04-08`, descrizione: "Polizza assicurativa stabile", categoria: "Assicurazione", importo: 1490 },
        { data: `${annoCorrente}-06-12`, descrizione: "Manutenzione giardino condominiale", categoria: "Manutenzione", importo: 520 },
        { data: `${annoCorrente}-07-05`, descrizione: "Pulizia parti comuni – 2° semestre", categoria: "Pulizia", importo: 1820, fornitore: "Giulia Zani" },
        { data: `${annoCorrente}-08-22`, descrizione: "Acqua condominiale – acconto", categoria: "Utenze", importo: 900 },
        { data: `${annoCorrente}-09-30`, descrizione: "Compenso amministratore – 1° acconto", categoria: "Amministrazione", importo: 2100 },
      ],
      budget: 12400,
      rate: [
        {
          numero: "1/2",
          descrizione: `Rata 1 – esercizio ${annoCorrente}`,
          scadenza: `${annoCorrente}-05-31`,
          quota: 0.55,
          pagamenti: (indice) => (indice === 1 ? "parziale" : indice === 4 ? "nessuno" : "completo"),
        },
        {
          numero: "2/2",
          descrizione: `Rata 2 – esercizio ${annoCorrente}`,
          scadenza: `${annoCorrente}-11-30`,
          quota: 0.45,
          pagamenti: (indice) => (indice === 0 ? "completo" : "nessuno"),
        },
      ],
    },
    {
      key: "p3",
      condominio: "c2",
      etichetta: `Esercizio ${annoPrecedente}`,
      inizio: annoInizio(annoPrecedente),
      fine: annoFine(annoPrecedente),
      stato: "chiuso",
      spese: [
        { data: `${annoPrecedente}-02-05`, descrizione: "Pulizia cortile e scale", categoria: "Pulizia", importo: 2150, fornitore: "Giulia Zani" },
        { data: `${annoPrecedente}-03-11`, descrizione: "Energia elettrica parti comuni", categoria: "Utenze", importo: 980 },
        { data: `${annoPrecedente}-04-02`, descrizione: "Manutenzione ascensore", categoria: "Manutenzione", importo: 820, fornitore: "Ascensori Pizzi" },
        { data: `${annoPrecedente}-05-14`, descrizione: "Polizza assicurativa stabile", categoria: "Assicurazione", importo: 1130 },
        { data: `${annoPrecedente}-08-26`, descrizione: "Acqua condominiale", categoria: "Utenze", importo: 1400 },
        { data: `${annoPrecedente}-10-09`, descrizione: "Manutenzione giardino", categoria: "Manutenzione", importo: 610 },
        { data: `${annoPrecedente}-12-18`, descrizione: "Compenso amministratore", categoria: "Amministrazione", importo: 1850 },
      ],
      budget: 8940,
      rate: [
        {
          numero: "1/2",
          descrizione: `Rata 1 – esercizio ${annoPrecedente}`,
          scadenza: `${annoPrecedente}-06-30`,
          quota: 0.5,
          pagamenti: (indice) => (indice === 2 ? "parziale" : "completo"),
        },
        {
          numero: "2/2",
          descrizione: `Rata 2 – esercizio ${annoPrecedente}`,
          scadenza: `${annoPrecedente}-12-31`,
          quota: 0.5,
          pagamenti: (indice) => (indice === 2 ? "nessuno" : "completo"),
        },
      ],
    },
    {
      key: "p4",
      condominio: "c2",
      etichetta: `Esercizio ${annoCorrente}`,
      inizio: annoInizio(annoCorrente),
      fine: annoFine(annoCorrente),
      stato: "bozza",
      spese: [
        { data: `${annoCorrente}-01-30`, descrizione: "Pulizia cortile e scale", categoria: "Pulizia", importo: 1100, fornitore: "Giulia Zani" },
        { data: `${annoCorrente}-02-27`, descrizione: "Energia elettrica parti comuni", categoria: "Utenze", importo: 540 },
        { data: `${annoCorrente}-03-19`, descrizione: "Riparazione colonna di scarico", categoria: "Manutenzione", importo: 860, fornitore: "Idraulica Cavina" },
        { data: `${annoCorrente}-05-06`, descrizione: "Polizza assicurativa stabile", categoria: "Assicurazione", importo: 1150 },
        { data: `${annoCorrente}-07-10`, descrizione: "Pulizia cortile e scale – 2° semestre", categoria: "Pulizia", importo: 1100, fornitore: "Giulia Zani" },
        { data: `${annoCorrente}-08-28`, descrizione: "Acqua condominiale – acconto", categoria: "Utenze", importo: 700 },
        { data: `${annoCorrente}-09-25`, descrizione: "Compenso amministratore – 1° acconto", categoria: "Amministrazione", importo: 1850 },
      ],
      budget: 9200,
      rate: [
        {
          numero: "1/2",
          descrizione: `Rata 1 – esercizio ${annoCorrente}`,
          scadenza: `${annoCorrente}-05-31`,
          quota: 0.5,
          pagamenti: (indice) => (indice === 3 ? "nessuno" : "completo"),
        },
        {
          numero: "2/2",
          descrizione: `Rata 2 – esercizio ${annoCorrente}`,
          scadenza: `${annoCorrente}-11-30`,
          quota: 0.5,
          pagamenti: () => "nessuno",
        },
      ],
    },
    {
      key: "p5",
      condominio: "c3",
      etichetta: `Esercizio ${annoCorrente}`,
      inizio: annoInizio(annoCorrente),
      fine: annoFine(annoCorrente),
      stato: "bozza",
      spese: [
        { data: `${annoCorrente}-01-15`, descrizione: "Pulizia parti comuni", categoria: "Pulizia", importo: 1950, fornitore: "Giulia Zani" },
        { data: `${annoCorrente}-02-10`, descrizione: "Riscaldamento – acconto gas", categoria: "Riscaldamento", importo: 3100, fornitore: "Termoidraulica Mengoli" },
        { data: `${annoCorrente}-03-28`, descrizione: "Manutenzione caldaia centralizzata", categoria: "Manutenzione", importo: 620, fornitore: "Termoidraulica Mengoli" },
        { data: `${annoCorrente}-05-20`, descrizione: "Compenso amministratore", categoria: "Amministrazione", importo: 1750 },
        { data: `${annoCorrente}-06-30`, descrizione: "Sostituzione lampade giardino", categoria: "Manutenzione", importo: 340 },
        { data: `${annoCorrente}-07-12`, descrizione: "Pulizia parti comuni – 2° semestre", categoria: "Pulizia", importo: 1950, fornitore: "Giulia Zani" },
        { data: `${annoCorrente}-09-08`, descrizione: "Riscaldamento – saldo stagione precedente", categoria: "Riscaldamento", importo: 2400, fornitore: "Termoidraulica Mengoli" },
        { data: `${annoCorrente}-09-30`, descrizione: "Compenso amministratore – saldo", categoria: "Amministrazione", importo: 1000 },
      ],
      budget: 15800,
      rate: [
        {
          numero: "1/2",
          descrizione: `Rata 1 – esercizio ${annoCorrente}`,
          scadenza: `${annoCorrente}-04-30`,
          quota: 0.5,
          pagamenti: (indice) => (indice === 5 ? "nessuno" : indice === 2 ? "parziale" : "completo"),
        },
        {
          numero: "2/2",
          descrizione: `Rata 2 – esercizio ${annoCorrente}`,
          scadenza: `${annoCorrente}-10-31`,
          quota: 0.5,
          pagamenti: (indice) => (indice <= 2 ? "completo" : "nessuno"),
        },
      ],
    },
    {
      key: "p6",
      condominio: "c4",
      etichetta: `Esercizio ${annoPrecedente}`,
      inizio: annoInizio(annoPrecedente),
      fine: annoFine(annoPrecedente),
      stato: "chiuso",
      spese: [
        { data: `${annoPrecedente}-02-12`, descrizione: "Pulizia scale", categoria: "Pulizia", importo: 1480 },
        { data: `${annoPrecedente}-03-08`, descrizione: "Energia elettrica parti comuni", categoria: "Utenze", importo: 720 },
        { data: `${annoPrecedente}-04-22`, descrizione: "Polizza assicurativa stabile", categoria: "Assicurazione", importo: 980 },
        { data: `${annoPrecedente}-07-16`, descrizione: "Acqua condominiale", categoria: "Utenze", importo: 1000 },
        { data: `${annoPrecedente}-09-30`, descrizione: "Riparazione grondaia", categoria: "Manutenzione", importo: 1100, fornitore: "Idraulica Cavina" },
        { data: `${annoPrecedente}-12-05`, descrizione: "Compenso amministratore", categoria: "Amministrazione", importo: 1500 },
      ],
      budget: 6780,
      rate: [
        {
          numero: "1/2",
          descrizione: `Rata 1 – esercizio ${annoPrecedente}`,
          scadenza: `${annoPrecedente}-06-30`,
          quota: 0.5,
          pagamenti: () => "completo",
        },
        {
          numero: "2/2",
          descrizione: `Rata 2 – esercizio ${annoPrecedente}`,
          scadenza: `${annoPrecedente}-12-31`,
          quota: 0.5,
          pagamenti: (indice) => (indice === 4 ? "nessuno" : "completo"),
        },
      ],
    },
    {
      key: "p7",
      condominio: "c5",
      etichetta: `Esercizio ${annoCorrente}`,
      inizio: annoInizio(annoCorrente),
      fine: annoFine(annoCorrente),
      stato: "bozza",
      spese: [
        { data: `${annoCorrente}-01-28`, descrizione: "Pulizia parti comuni", categoria: "Pulizia", importo: 1120, fornitore: "Giulia Zani" },
        { data: `${annoCorrente}-02-14`, descrizione: "Energia elettrica parti comuni", categoria: "Utenze", importo: 540 },
        { data: `${annoCorrente}-04-18`, descrizione: "Manutenzione giardino", categoria: "Manutenzione", importo: 400 },
        { data: `${annoCorrente}-06-05`, descrizione: "Compenso amministratore", categoria: "Amministrazione", importo: 900 },
        { data: `${annoCorrente}-07-20`, descrizione: "Pulizia parti comuni – 2° semestre", categoria: "Pulizia", importo: 1120, fornitore: "Giulia Zani" },
      ],
      budget: null,
      rate: [],
    },
  ];
}

/* ------------------------------------------------------------------------- */
/* Consumi                                                                   */
/* ------------------------------------------------------------------------- */

function consumi(base: Date): DemoConsumo[] {
  const trimestri = ultimiTrimestri(base, 6);
  const mesi = ultimiMesi(base, 6);
  const result: DemoConsumo[] = [];

  /** Trimestre dell'anno (1..4) a partire da una data ISO. */
  const trimestreDi = (iso: string): number => Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1;

  // Profili stagionali plausibili per un condominio residenziale.
  const acquaPerTrimestre: Record<number, number> = { 1: 196.4, 2: 214.8, 3: 238.1, 4: 188.6 };
  const gasPerTrimestre: Record<number, number> = { 1: 1480.5, 2: 640.2, 3: 318.9, 4: 1205.4 };
  const gasGelsiPerTrimestre: Record<number, number> = { 1: 1720.8, 2: 705.4, 3: 402.6, 4: 1385.2 };
  const acquaPortoPerTrimestre: Record<number, number> = { 1: 88.2, 2: 96.5, 3: 104.1, 4: 82.7 };
  const energiaPerMese: Record<number, number> = {
    1: 362.4, 2: 351.0, 3: 336.7, 4: 312.5, 5: 298.2, 6: 289.8,
    7: 286.4, 8: 291.0, 9: 303.5, 10: 318.9, 11: 338.2, 12: 356.1,
  };

  // Acqua – Condominio 1: sei trimestri completi, con leggera crescita annua.
  trimestri.forEach((trimestre, indice) => {
    const anno = Number(trimestre.da.slice(0, 4));
    const variazione = 1 + (anno - Number(trimestri[0]!.da.slice(0, 4))) * 0.015;
    const valore = Math.round(acquaPerTrimestre[trimestreDi(trimestre.da)]! * variazione * 10) / 10;
    result.push({
      condominio: "c1",
      categoria: "acqua",
      da: trimestre.da,
      a: trimestre.a,
      valore,
      unitaMisura: "m3",
      costo: euro(valore * 2.15),
      fonte: "Hera – fattura condominiale",
      origine: indice === 4 ? "importato" : "inserito",
    });
  });

  // Gas – Condominio 1: quattro trimestri con andamento stagionale.
  trimestri.slice(2).forEach((trimestre, indice) => {
    const valore = gasPerTrimestre[trimestreDi(trimestre.da)]!;
    result.push({
      condominio: "c1",
      categoria: "gas",
      da: trimestre.da,
      a: trimestre.a,
      valore,
      unitaMisura: "m3",
      costo: euro(valore * 1.08),
      fonte: "Hera – fattura condominiale",
      origine: indice === 3 ? "stimato" : "inserito",
      note:
        indice === 3
          ? "Lettura non disponibile: valore stimato sui consumi storici."
          : undefined,
    });
  });

  // Energia elettrica – Condominio 1: ultimi sei mesi, più alta in inverno.
  mesi.forEach((mese, indice) => {
    const valore = energiaPerMese[Number(mese.da.slice(5, 7))]!;
    result.push({
      condominio: "c1",
      categoria: "energia_elettrica",
      da: mese.da,
      a: mese.a,
      valore,
      unitaMisura: "kWh",
      costo: euro(valore * 0.28),
      fonte: "Contatore parti comuni",
      origine: indice === 0 ? "importato" : "inserito",
    });
  });

  // Acqua – Condominio 2: quattro trimestri.
  trimestri.slice(2).forEach((trimestre) => {
    const valore = Math.round(acquaPerTrimestre[trimestreDi(trimestre.da)]! * 0.72 * 10) / 10;
    result.push({
      condominio: "c2",
      categoria: "acqua",
      da: trimestre.da,
      a: trimestre.a,
      valore,
      unitaMisura: "m3",
      costo: euro(valore * 2.15),
      fonte: "Hera – fattura condominiale",
      origine: "importato",
    });
  });

  // Gas – Residenza I Gelsi: quattro trimestri, l'ultimo stimato (escluso dai confronti).
  trimestri.slice(2).forEach((trimestre, indice) => {
    const valore = gasGelsiPerTrimestre[trimestreDi(trimestre.da)]!;
    result.push({
      condominio: "c3",
      categoria: "gas",
      da: trimestre.da,
      a: trimestre.a,
      valore,
      unitaMisura: "m3",
      costo: euro(valore * 1.08),
      fonte: "Termoidraulica Mengoli – lettura",
      origine: indice === 3 ? "stimato" : "inserito",
      note:
        indice === 3
          ? "Lettura stimata in attesa del conteggio del fornitore."
          : undefined,
    });
  });

  // Acqua – Condominio 5: solo due trimestri (confronto limitato).
  trimestri.slice(4).forEach((trimestre) => {
    const valore = acquaPortoPerTrimestre[trimestreDi(trimestre.da)]!;
    result.push({
      condominio: "c5",
      categoria: "acqua",
      da: trimestre.da,
      a: trimestre.a,
      valore,
      unitaMisura: "m3",
      costo: euro(valore * 2.15),
      fonte: "Hera – fattura condominiale",
      origine: "inserito",
    });
  });

  return result;
}

/* ------------------------------------------------------------------------- */
/* Attività                                                                  */
/* ------------------------------------------------------------------------- */

const ATTIVITA: DemoAttivita[] = [
  {
    condominio: "c1",
    persona: "marta",
    tipo: "telefonata",
    titolo: "Richiamare la consigliera sul preventivo",
    descrizione: "Chiarire i due punti sospesi prima dell’assemblea di novembre.",
    giorni: -1,
    scadenzaGiorni: 2,
    completata: false,
    priorita: "alta",
  },
  {
    condominio: "c1",
    tipo: "email",
    titolo: "Inviare il verbale dell’ultima assemblea",
    descrizione: "Trasmissione del verbale approvato ai condòmini.",
    giorni: -8,
    completata: true,
    priorita: "normale",
  },
  {
    condominio: "c1",
    tipo: "promemoria",
    titolo: "Rinnovo della polizza assicurativa",
    descrizione: "Verificare massimali e scadenza prima del rinnovo.",
    giorni: -5,
    scadenzaGiorni: 18,
    completata: false,
    priorita: "normale",
  },
  {
    condominio: "c1",
    tipo: "nota",
    titolo: "Verificare le letture dei contatori dell’acqua",
    descrizione: "Confronto fra lettura del fornitore e contatore condominiale.",
    giorni: -3,
    scadenzaGiorni: -1,
    completata: false,
    priorita: "alta",
  },
  {
    condominio: "c2",
    tipo: "incontro",
    titolo: "Sopralluogo con l’idraulico per la colonna di scarico",
    giorni: 1,
    scadenzaGiorni: 3,
    completata: false,
    priorita: "alta",
  },
  {
    condominio: "c2",
    tipo: "promemoria",
    titolo: "Sollecitare le rate non pagate",
    descrizione: "Inviare il sollecito bonario all’unità con due rate aperte.",
    giorni: -2,
    scadenzaGiorni: 9,
    completata: false,
    priorita: "normale",
  },
  {
    condominio: "c3",
    tipo: "attivita",
    titolo: "Preparare il confronto dei preventivi per la caldaia",
    descrizione: "Riepilogare costi e tempi per l’assemblea del mese.",
    giorni: -4,
    scadenzaGiorni: 4,
    completata: false,
    priorita: "alta",
  },
  {
    condominio: "c3",
    tipo: "telefonata",
    titolo: "Richiamare l’impresa di pulizie",
    descrizione: "Chiarimenti sul calendario del cortile.",
    giorni: -2,
    completata: true,
    priorita: "normale",
  },
  {
    condominio: "c4",
    tipo: "promemoria",
    titolo: "Rinnovo del contratto luce scale",
    giorni: 6,
    scadenzaGiorni: 25,
    completata: false,
    priorita: "bassa",
  },
  {
    condominio: "c5",
    tipo: "email",
    titolo: "Convocazione dell’assemblea straordinaria",
    descrizione: "Inviare la convocazione con l’ordine del giorno del giardino.",
    giorni: -6,
    completata: true,
    priorita: "normale",
  },
  {
    condominio: "c5",
    tipo: "nota",
    titolo: "Raccogliere due offerte per il giardino",
    giorni: -4,
    scadenzaGiorni: 10,
    completata: false,
    priorita: "normale",
  },
  {
    condominio: "c6",
    persona: "marco",
    tipo: "incontro",
    titolo: "Sopralluogo conoscitivo per il nuovo incarico",
    descrizione: "Primo incontro con il referente del condominio potenziale.",
    giorni: 3,
    scadenzaGiorni: 7,
    completata: false,
    priorita: "alta",
  },
];

/* ------------------------------------------------------------------------- */
/* Documenti                                                                 */
/* ------------------------------------------------------------------------- */

function documenti(annoCorrente: number): DemoDocumento[] {
  const annoPrecedente = annoCorrente - 1;
  return [
    {
      key: "d1",
      condominio: "c1",
      entitaTipo: "assemblea",
      entitaRef: "a1",
      nomeFile: `Verbale assemblea ordinaria ${annoPrecedente}.pdf`,
      categoria: "Verbale",
      descrizione: "Verbale dell’assemblea con l’approvazione del consuntivo.",
      tipo: "pdf",
      titolo: `Verbale di assemblea ordinaria – ${annoPrecedente}`,
      righe: [
        "Condominio Via delle Rose 12 – Bologna",
        `Assemblea ordinaria dell'esercizio ${annoPrecedente}`,
        "",
        "Ordine del giorno:",
        "1. Approvazione del consuntivo dell'esercizio precedente",
        "2. Manutenzione straordinaria della facciata",
        "3. Approvazione del preventivo dell'esercizio in corso",
        "",
        "Quorum registrato in verbale: 812,45 millesimi.",
        "Delibera 1: consuntivo approvato con 812,45 millesimi favorevoli.",
        "Delibera 2: manutenzione della facciata rinviata a una successiva assemblea.",
        "",
        "Documento dimostrativo: i contenuti sono inventati e non hanno valore legale.",
      ],
    },
    {
      key: "d2",
      condominio: "c1",
      entitaTipo: "assemblea",
      entitaRef: "a2",
      nomeFile: "Convocazione assemblea novembre.pdf",
      categoria: "Convocazione",
      descrizione: "Convocazione con ordine del giorno per l’assemblea di novembre.",
      tipo: "pdf",
      titolo: "Convocazione di assemblea ordinaria",
      righe: [
        "Condominio Via delle Rose 12 – Bologna",
        "Convocazione di assemblea ordinaria",
        "",
        "Ordine del giorno:",
        "1. Approvazione del preventivo dell'esercizio successivo",
        "2. Affidamento della manutenzione del giardino",
        "3. Varie ed eventuali",
        "",
        "Modalita: in presenza e in videoconferenza.",
        "Documento dimostrativo privo di valore legale.",
      ],
    },
    {
      key: "d3",
      condominio: "c1",
      entitaTipo: "condominio",
      nomeFile: "Polizza assicurativa stabili.pdf",
      categoria: "Assicurazione",
      descrizione: "Polizza globale fabbricati con decorrenza annuale.",
      tipo: "pdf",
      titolo: "Polizza globale fabbricati",
      righe: [
        "Condominio Via delle Rose 12 – Bologna",
        "Polizza globale fabbricati – documento dimostrativo",
        "",
        "Massimale: 1.500.000,00 euro",
        "Franchigia: 250,00 euro per sinistro",
        "Copertura: incendio, scoppio, responsabilita civile verso terzi",
        "",
        "Documento inventato, senza valore contrattuale.",
      ],
    },
    {
      key: "d4",
      condominio: "c1",
      entitaTipo: "periodo_contabile",
      entitaRef: "p1",
      nomeFile: `Riparto spese esercizio ${annoPrecedente}.csv`,
      categoria: "Rendiconto",
      descrizione: "Riparto delle spese per unità immobiliare.",
      tipo: "csv",
      titolo: `Riparto spese ${annoPrecedente}`,
      righe: [
        "unita;millesimi;quota_spese",
        "Int. 1;87,42;1051,66",
        "Int. 2;74,13;891,76",
        "Int. 3;96,05;1155,48",
        "Int. 4;81,67;982,49",
        "Garage 1;17,11;205,82",
      ],
    },
    {
      key: "d5",
      condominio: "c2",
      entitaTipo: "assemblea",
      entitaRef: "a3",
      nomeFile: `Verbale assemblea ${annoPrecedente}.pdf`,
      categoria: "Verbale",
      descrizione: "Verbale con l’approvazione del consuntivo.",
      tipo: "pdf",
      titolo: `Verbale di assemblea ordinaria – ${annoPrecedente}`,
      righe: [
        "Condominio Via Giuseppe Verdi 8 – Bologna",
        `Assemblea ordinaria dell'esercizio ${annoPrecedente}`,
        "",
        "Quorum registrato: 734,20 millesimi.",
        "Consuntivo approvato con 734,20 millesimi favorevoli.",
        "Colonnina di ricarica: valutazione rinviata.",
        "",
        "Documento dimostrativo privo di valore legale.",
      ],
    },
    {
      key: "d6",
      condominio: "c3",
      entitaTipo: "periodo_contabile",
      entitaRef: "p5",
      nomeFile: `Preventivo ${annoCorrente} residenza I Gelsi.xlsx`,
      categoria: "Preventivo",
      descrizione: "Preventivo di gestione con ripartizione per unità.",
      tipo: "xlsx",
      titolo: `Preventivo ${annoCorrente} – Residenza I Gelsi`,
      righe: [],
      tabella: {
        intestazioni: ["Categoria", "Importo previsto (€)", "Note"],
        righe: [
          ["Pulizia parti comuni", 1950, "Contratto annuale"],
          ["Riscaldamento", 8200, "Stima su consumi storici"],
          ["Manutenzione", 2100, "Caldaia e ascensore"],
          ["Assicurazione", 1350, "Polizza fabbricati"],
          ["Amministrazione", 2200, "Compenso annuo"],
        ],
      },
    },
    {
      key: "d7",
      condominio: "c2",
      entitaTipo: "segnalazione",
      entitaRef: "s6",
      nomeFile: "Sopralluogo colonna di scarico.pdf",
      categoria: "Intervento",
      descrizione: "Nota tecnica del sopralluogo con il tratto da sostituire.",
      tipo: "pdf",
      titolo: "Nota tecnica – colonna di scarico",
      righe: [
        "Condominio Via Giuseppe Verdi 8 – Bologna",
        "Sopralluogo del 12 del mese, unita Int. 2",
        "",
        "Riscontro: perdita attiva nel tratto verticale sotto il bagno.",
        "Intervento proposto: sostituzione di 1,5 metri di colonna in PVC.",
        "Tempi stimati: una giornata lavorativa.",
        "",
        "Documento dimostrativo privo di valore legale.",
      ],
    },
    {
      key: "d8",
      condominio: "c5",
      entitaTipo: "condominio",
      nomeFile: "Contratto pulizia parti comuni.pdf",
      categoria: "Contratto",
      descrizione: "Contratto annuale per la pulizia delle parti comuni.",
      tipo: "pdf",
      titolo: "Contratto di pulizia – parti comuni",
      righe: [
        "Condominio Via del Porto 30 – Bologna",
        "Contratto dimostrativo di pulizia delle parti comuni",
        "",
        "Frequenza: settimanale",
        "Durata: dodici mesi",
        "Corrispettivo: 1.120,00 euro annui",
        "",
        "Documento inventato, senza valore contrattuale.",
      ],
    },
    {
      key: "d9",
      condominio: "c1",
      entitaTipo: "condominio",
      nomeFile: "Riepilogo consumi acqua.csv",
      categoria: "Consumi",
      descrizione: "Riepilogo delle letture dell’acqua degli ultimi trimestri.",
      tipo: "csv",
      titolo: "Riepilogo consumi acqua",
      righe: [
        "periodo_da;periodo_a;valore;unita_misura",
        "2025-01-01;2025-03-31;196,4;m3",
        "2025-04-01;2025-06-30;214,8;m3",
        "2025-07-01;2025-09-30;238,1;m3",
        "2025-10-01;2025-12-31;188,6;m3",
      ],
    },
  ];
}

/* ------------------------------------------------------------------------- */
/* Registro importazioni                                                     */
/* ------------------------------------------------------------------------- */

function importazioni(annoCorrente: number): DemoImportLotto[] {
  return [
    {
      tipo: "consumi",
      nomeFile: `demo-consumi-acqua-${annoCorrente - 1}.csv`,
      giorni: -70,
      stato: "completato",
      righe: [
        { numero: 2, sintesi: "Acqua 1° trimestre – m3 188,6", esito: "importata" },
        { numero: 3, sintesi: "Acqua 2° trimestre – m3 201,3", esito: "importata" },
        { numero: 4, sintesi: "Acqua 3° trimestre – m3 226,7", esito: "importata" },
        {
          numero: 5,
          sintesi: "Acqua 4° trimestre – unità di misura mancante",
          esito: "errore",
          errori: [{ campo: "unita_misura", messaggio: "Valore obbligatorio mancante" }],
        },
        {
          numero: 6,
          sintesi: "Acqua 1° trimestre (ripetuta nel file)",
          esito: "duplicato",
          duplicato: "Periodo già presente per lo stesso condominio e categoria",
        },
      ],
    },
    {
      tipo: "condomini",
      nomeFile: `demo-anagrafiche-${annoCorrente}.xlsx`,
      giorni: -40,
      stato: "completato",
      righe: [
        { numero: 2, sintesi: "Condominio Via delle Rose 12", esito: "importata" },
        { numero: 3, sintesi: "Condominio Via Giuseppe Verdi 8", esito: "importata" },
        { numero: 4, sintesi: "Residenza I Gelsi", esito: "importata" },
      ],
    },
  ];
}

const AUDIT: DemoAudit[] = [
  {
    azione: "condominio_creato",
    entitaTipo: "condominio",
    descrizione: `${DEMO_MARKER} Anagrafica importata da file dimostrativo`,
    giorni: -40,
  },
  {
    azione: "import_completato",
    entitaTipo: "import_batch",
    descrizione: `${DEMO_MARKER} Importazione condomini completata: 3 righe`,
    giorni: -40,
  },
  {
    azione: "import_completato",
    entitaTipo: "import_batch",
    descrizione: `${DEMO_MARKER} Importazione consumi completata: 3 righe, 1 errore, 1 duplicato`,
    giorni: -70,
  },
  {
    azione: "assemblea_creata",
    entitaTipo: "assemblea",
    descrizione: `${DEMO_MARKER} Convocata assemblea ordinaria`,
    giorni: -12,
  },
  {
    azione: "segnalazione_creata",
    entitaTipo: "segnalazione",
    descrizione: `${DEMO_MARKER} Aperta segnalazione per guasto urgente`,
    giorni: -1,
  },
  {
    azione: "documento_caricato",
    entitaTipo: "documento",
    descrizione: `${DEMO_MARKER} Caricato verbale di assemblea`,
    giorni: -11,
  },
];

/* ------------------------------------------------------------------------- */
/* Dataset completo                                                          */
/* ------------------------------------------------------------------------- */

export function buildDemoDataset(now: Date = new Date()): DemoDataset {
  const annoCorrente = now.getFullYear();
  const unita = costruisciUnita();
  const { relazioni, unitaPersone } = costruisciRelazioni(unita);
  return {
    condomini: CONDOMINI,
    persone: PERSONE,
    unita,
    relazioni,
    unitaPersone,
    segnalazioni: SEGNALAZIONI,
    assemblee: assemblee(),
    periodi: periodi(annoCorrente),
    consumi: consumi(now),
    attivita: ATTIVITA,
    documenti: documenti(annoCorrente),
    importazioni: importazioni(annoCorrente),
    audit: AUDIT,
  };
}

/** Unità di un condominio, in ordine di inserimento. */
export function unitaDelCondominio(
  dataset: DemoDataset,
  condominio: string,
): DemoUnita[] {
  return dataset.unita.filter((u) => u.condominio === condominio);
}
