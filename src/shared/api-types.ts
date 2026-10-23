/** Tipi di risposta condivisi fra API e client. Le date pure sono stringhe YYYY-MM-DD. */

export type ApiError = {
  error: string;
  campo?: string;
  errors?: Record<string, string>;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  perPage: number;
};

export type SessionUser = {
  id: string;
  email: string;
  nome: string;
  cognome: string;
  ruolo: "amministratore" | "collaboratore";
  mfaEnabled: boolean;
  mustChangePassword: boolean;
};

export type SessionState =
  | { authenticated: false; mfaRequired: false; demoMode?: boolean }
  | { authenticated: false; mfaRequired: true; demoMode?: boolean }
  | {
      authenticated: true;
      mfaRequired: false;
      user: SessionUser;
      demoMode: boolean;
    };

export type CondominioListItem = {
  id: string;
  codice: string;
  denominazione: string;
  comune: string | null;
  provincia: string | null;
  indirizzo: string | null;
  stato: string;
  archiviato: boolean;
  dataInizioIncarico: string | null;
  dataFineIncarico: string | null;
  unitaCount: number;
  personeCount: number;
  segnalazioniAperte: number;
  prossimaAssemblea: string | null;
  updatedAt: string;
};

export type CondominioDetail = CondominioListItem & {
  cap: string | null;
  codiceFiscale: string | null;
  note: string | null;
  createdAt: string;
  millesimiTotali: number | null;
  relazioni: RelazionePersona[];
  unita: UnitaDto[];
  attivita: AttivitaDto[];
};

export type PersonaDto = {
  id: string;
  nome: string;
  cognome: string;
  codiceFiscale: string | null;
  email: string | null;
  telefono: string | null;
  note: string | null;
  archiviato: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RelazionePersona = {
  id: string;
  persona: PersonaDto;
  ruolo: string;
  qualifica: string | null;
  dataInizio: string | null;
  dataFine: string | null;
  note: string | null;
};

export type UnitaDto = {
  id: string;
  condominioId: string;
  identificativo: string;
  piano: string | null;
  categoria: string | null;
  millesimi: number | null;
  millesimiRiscaldamento: number | null;
  note: string | null;
  archiviato: boolean;
  persone: Array<{
    id: string;
    persona: PersonaDto;
    titolo: string;
    millesimi: number | null;
  }>;
};

export type AttivitaDto = {
  id: string;
  condominioId: string | null;
  personaId: string | null;
  tipo: string;
  titolo: string;
  descrizione: string | null;
  data: string;
  scadenza: string | null;
  completata: boolean;
  priorita: string;
  createdAt: string;
};

export type DashboardKpi = {
  id: string;
  label: string;
  value: number | null;
  unit: "count" | "euro" | "percent";
  href: string;
  hint: string;
  /** spiegazione della formula e del perché il valore è disponibile o no */
  explanation: string;
  available: boolean;
  unavailableReason?: string;
};

export type DashboardData = {
  kpis: DashboardKpi[];
  condominiPerStato: Array<{ stato: string; count: number }>;
  segnalazioniPerStato: Array<{ stato: string; count: number }>;
  prossimeAssemblee: Array<{
    id: string;
    condominioId: string;
    condominio: string;
    data: string;
    ora: string | null;
    tipo: string;
    stato: string;
    punti: number;
  }>;
  segnalazioniScadute: Array<{
    id: string;
    codice: string;
    titolo: string;
    condominio: string;
    scadenza: string;
    stato: string;
  }>;
  scadenzeRate: Array<{
    id: string;
    descrizione: string;
    condominio: string;
    scadenza: string;
    importo: number;
    incassato: number;
    residuo: number;
  }>;
  datiInsufficienti: string[];
};

export type SearchResults = {
  condomini: Array<{
    id: string;
    codice: string;
    denominazione: string;
    comune: string | null;
  }>;
  persone: Array<{
    id: string;
    nome: string;
    cognome: string;
    email: string | null;
  }>;
  segnalazioni: Array<{
    id: string;
    codice: string;
    titolo: string;
    condominio: string;
  }>;
  assemblee: Array<{
    id: string;
    condominio: string;
    data: string;
    tipo: string;
  }>;
  periodi: Array<{
    id: string;
    etichetta: string;
    condominio: string;
    dataInizio: string;
  }>;
  consumi: Array<{
    id: string;
    condominio: string;
    condominioId: string;
    categoria: string;
    periodoDa: string;
  }>;
  documenti: Array<{
    id: string;
    nomeFile: string;
    entitaTipo: string;
    condominio: string | null;
  }>;
};

export type ImportPreviewRow = {
  numeroRiga: number;
  dati: Record<string, string>;
  errori: Array<{ campo?: string; messaggio: string }>;
  avvisi: Array<{ campo?: string; messaggio: string }>;
  duplicato: { tipo: string; riferimento: string } | null;
  esito: "valida" | "errore" | "duplicato";
};

export type ImportPreview = {
  batchId: string;
  tipo: string;
  nomeFile: string;
  colonne: string[];
  colonneRiconosciute: string[];
  colonneIgnorate: string[];
  colonneMancanti: string[];
  righe: ImportPreviewRow[];
  riepilogo: {
    totali: number;
    valide: number;
    errori: number;
    duplicate: number;
    troncate: boolean;
  };
};

export type ImportBatchDto = {
  id: string;
  tipo: string;
  nomeFile: string;
  dimensione: number;
  stato: string;
  righeTotali: number;
  righeValide: number;
  righeErrori: number;
  righeDuplicate: number;
  createdAt: string;
  completatoAt: string | null;
};

export type DocumentoDto = {
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

export type SegnalazioneDto = {
  id: string;
  codice: string;
  condominioId: string;
  condominio: string;
  unitaId: string | null;
  unita: string | null;
  areaComune: string | null;
  titolo: string;
  descrizione: string | null;
  categoria: string;
  priorita: string;
  stato: string;
  dataApertura: string;
  scadenza: string | null;
  dataChiusura: string | null;
  fornitorePersonaId: string | null;
  fornitore: string | null;
  referente: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SegnalazioneStoricoItem = {
  id: string;
  daStato: string | null;
  aStato: string | null;
  nota: string | null;
  utente: string | null;
  createdAt: string;
};

export type AssembleaDto = {
  id: string;
  condominioId: string;
  condominio: string;
  data: string;
  ora: string | null;
  tipo: string;
  luogo: string | null;
  modalita: string;
  stato: string;
  quorumRegistrato: number | null;
  note: string | null;
  punti: Array<{
    id: string;
    ordine: number;
    titolo: string;
    descrizione: string | null;
    delibera: string | null;
    esito: string | null;
  }>;
  partecipanti: Array<{
    id: string;
    personaId: string | null;
    unitaId: string | null;
    nome: string | null;
    presente: boolean;
    delegante: string | null;
    millesimi: number | null;
  }>;
  millesimiPresenti: number | null;
  millesimiTotaliCondominio: number | null;
};

export type PeriodoDto = {
  id: string;
  condominioId: string;
  condominio: string;
  etichetta: string;
  dataInizio: string;
  dataFine: string;
  stato: string;
  note: string | null;
  totaleSpese: number;
  numeroSpese: number;
  totaleRate: number;
  incassato: number;
  residuo: number;
  rateCount: number;
  rateScaduteNonPagate: number;
  unitaSenzaMillesimi: number | null;
  avvisiCalcolo: string[];
};

export type RataDto = {
  id: string;
  periodoId: string;
  unitaId: string | null;
  unita: string | null;
  descrizione: string;
  numero: string | null;
  scadenza: string;
  importo: number;
  incassato: number;
  residuo: number;
  stato: "pagata" | "parziale" | "aperta" | "scaduta";
  criteriRipartizione: string | null;
  pagamentiCount?: number;
};

export type ConsumoDto = {
  id: string;
  condominioId: string;
  condominio: string;
  categoria: string;
  periodoDa: string;
  periodoA: string;
  valore: number;
  unitaMisura: string;
  costo: number | null;
  fonte: string | null;
  origine: string;
  dataRilevazione: string | null;
  note: string | null;
  createdAt: string;
};

export type ConsumptionComparison = {
  corrente: ConsumoDto;
  precedente: ConsumoDto | null;
  stato: "confrontabile" | "non_confrontabile";
  motivo: string | null;
  differenza: number | null;
  variazionePercentuale: number | null;
};

export type AuditLogItem = {
  id: string;
  azione: string;
  entitaTipo: string;
  entitaId: string | null;
  descrizione: string;
  attoreEmail: string | null;
  createdAt: string;
};
