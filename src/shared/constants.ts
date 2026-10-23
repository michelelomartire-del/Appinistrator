/** Etichette e vocabolari condivisi fra client e server (unica fonte di verità). */

export const CONDOMINIO_STATI = ["potenziale", "attivo", "cessato"] as const;
export type CondominioStato = (typeof CONDOMINIO_STATI)[number];
export const condominioStatoLabels: Record<CondominioStato, string> = {
  potenziale: "Potenziale",
  attivo: "Attivo",
  cessato: "Cessato",
};

export const RUOLI_PERSONA_CONDOMINIO = [
  "consigliere",
  "condomino",
  "referente",
  "fornitore",
  "amministratore",
  "altro",
] as const;
export type RuoloPersonaCondominio = (typeof RUOLI_PERSONA_CONDOMINIO)[number];
export const ruoloPersonaCondominioLabels: Record<
  RuoloPersonaCondominio,
  string
> = {
  consigliere: "Consigliere",
  condomino: "Condomino",
  referente: "Referente",
  fornitore: "Fornitore",
  amministratore: "Amministratore",
  altro: "Altro",
};

export const TITOLI_UNITA = [
  "proprietario",
  "usufruttuario",
  "affittuario",
  "comodatario",
  "altro",
] as const;
export type TitoloUnita = (typeof TITOLI_UNITA)[number];
export const titoloUnitaLabels: Record<TitoloUnita, string> = {
  proprietario: "Proprietario",
  usufruttuario: "Usufruttuario",
  affittuario: "Affittuario",
  comodatario: "Comodatario",
  altro: "Altro",
};

export const ATTIVITA_TIPI = [
  "telefonata",
  "email",
  "incontro",
  "promemoria",
  "attivita",
  "nota",
] as const;
export type AttivitaTipo = (typeof ATTIVITA_TIPI)[number];
export const attivitaTipoLabels: Record<AttivitaTipo, string> = {
  telefonata: "Telefonata",
  email: "Email",
  incontro: "Incontro",
  promemoria: "Promemoria",
  attivita: "Attività",
  nota: "Nota",
};

export const ATTIVITA_PRIORITA = ["bassa", "normale", "alta"] as const;
export type AttivitaPriorita = (typeof ATTIVITA_PRIORITA)[number];
export const attivitaPrioritaLabels: Record<AttivitaPriorita, string> = {
  bassa: "Bassa",
  normale: "Normale",
  alta: "Alta",
};

export const SEGNALAZIONE_STATI = [
  "nuova",
  "in_valutazione",
  "assegnata",
  "in_corso",
  "risolta",
  "chiusa",
] as const;
export type SegnalazioneStato = (typeof SEGNALAZIONE_STATI)[number];
export const segnalazioneStatoLabels: Record<SegnalazioneStato, string> = {
  nuova: "Nuova",
  in_valutazione: "In valutazione",
  assegnata: "Assegnata",
  in_corso: "In corso",
  risolta: "Risolta",
  chiusa: "Chiusa",
};
/** Ordine consigliato del flusso; l'amministratore può comunque correggere lo stato. */
export const segnalazioneStatoOrdine: Record<SegnalazioneStato, number> = {
  nuova: 0,
  in_valutazione: 1,
  assegnata: 2,
  in_corso: 3,
  risolta: 4,
  chiusa: 5,
};
export const SEGNALAZIONE_STATI_APERTI: SegnalazioneStato[] = [
  "nuova",
  "in_valutazione",
  "assegnata",
  "in_corso",
];

export const SEGNALAZIONE_CATEGORIE = [
  "manutenzione",
  "guasto",
  "pulizia",
  "sicurezza",
  "rumore",
  "documenti",
  "amministrativa",
  "altro",
] as const;
export type SegnalazioneCategoria = (typeof SEGNALAZIONE_CATEGORIE)[number];
export const segnalazioneCategoriaLabels: Record<
  SegnalazioneCategoria,
  string
> = {
  manutenzione: "Manutenzione",
  guasto: "Guasto",
  pulizia: "Pulizia",
  sicurezza: "Sicurezza",
  rumore: "Rumore",
  documenti: "Documenti",
  amministrativa: "Amministrativa",
  altro: "Altro",
};

export const SEGNALAZIONE_PRIORITA = [
  "bassa",
  "media",
  "alta",
  "urgente",
] as const;
export type SegnalazionePriorita = (typeof SEGNALAZIONE_PRIORITA)[number];
export const segnalazionePrioritaLabels: Record<SegnalazionePriorita, string> =
  {
    bassa: "Bassa",
    media: "Media",
    alta: "Alta",
    urgente: "Urgente",
  };

export const ASSEMBLEA_TIPI = ["ordinaria", "straordinaria"] as const;
export const assembleaTipoLabels: Record<
  (typeof ASSEMBLEA_TIPI)[number],
  string
> = {
  ordinaria: "Ordinaria",
  straordinaria: "Straordinaria",
};
export const ASSEMBLEA_MODALITA = [
  "presenza",
  "videoconferenza",
  "mista",
] as const;
export const assembleaModalitaLabels: Record<
  (typeof ASSEMBLEA_MODALITA)[number],
  string
> = {
  presenza: "In presenza",
  videoconferenza: "Videoconferenza",
  mista: "Mista",
};
export const ASSEMBLEA_STATI = [
  "programmata",
  "convocata",
  "svolta",
  "annullata",
] as const;
export const assembleaStatoLabels: Record<
  (typeof ASSEMBLEA_STATI)[number],
  string
> = {
  programmata: "Programmata",
  convocata: "Convocata",
  svolta: "Svolta",
  annullata: "Annullata",
};
export const ASSEMBLEA_ESITI = [
  "approvato",
  "respinto",
  "rinviato",
  "non_trattato",
] as const;
export const assembleaEsitoLabels: Record<
  (typeof ASSEMBLEA_ESITI)[number],
  string
> = {
  approvato: "Approvato",
  respinto: "Respinto",
  rinviato: "Rinviato",
  non_trattato: "Non trattato",
};

export const PERIODO_STATI = ["bozza", "chiuso"] as const;
export const periodoStatoLabels: Record<
  (typeof PERIODO_STATI)[number],
  string
> = {
  bozza: "Bozza",
  chiuso: "Chiuso",
};

export const CONSUMO_CATEGORIE = [
  "acqua",
  "gas",
  "energia_elettrica",
  "teleriscaldamento",
  "rifiuti",
  "altro",
] as const;
export type ConsumoCategoria = (typeof CONSUMO_CATEGORIE)[number];
export const consumoCategoriaLabels: Record<ConsumoCategoria, string> = {
  acqua: "Acqua",
  gas: "Gas",
  energia_elettrica: "Energia elettrica",
  teleriscaldamento: "Teleriscaldamento",
  rifiuti: "Rifiuti",
  altro: "Altro",
};

export const CONSUMO_ORIGINI = ["inserito", "importato", "stimato"] as const;
export type ConsumoOrigine = (typeof CONSUMO_ORIGINI)[number];
export const consumoOrigineLabels: Record<ConsumoOrigine, string> = {
  inserito: "Inserito",
  importato: "Importato",
  stimato: "Stimato",
};
export const consumoOrigineDescrizioni: Record<ConsumoOrigine, string> = {
  inserito: "Valore digitato manualmente dall’amministratore.",
  importato: "Valore proveniente da un’importazione dichiarata.",
  stimato: "Valore stimato: non è una lettura effettiva.",
};

export const UNITA_MISURA = [
  "m3",
  "kWh",
  "MWh",
  "lt",
  "kg",
  "euro",
  "altro",
] as const;

export const DOCUMENTO_ENTITA = [
  "condominio",
  "persona",
  "unita",
  "segnalazione",
  "assemblea",
  "periodo_contabile",
  "spesa",
  "rata",
  "consumo",
  "attivita",
] as const;
export type DocumentoEntitaTipo = (typeof DOCUMENTO_ENTITA)[number];
export const documentoEntitaLabels: Record<DocumentoEntitaTipo, string> = {
  condominio: "Condominio",
  persona: "Persona",
  unita: "Unità",
  segnalazione: "Segnalazione",
  assemblea: "Assemblea",
  periodo_contabile: "Periodo contabile",
  spesa: "Spesa",
  rata: "Rata",
  consumo: "Consumo",
  attivita: "Attività",
};

/** Tipi di importazione supportati. */
export const IMPORT_TIPI = [
  "condomini",
  "persone",
  "unita",
  "segnalazioni",
  "consumi",
] as const;
export type ImportTipo = (typeof IMPORT_TIPI)[number];
export const importTipoLabels: Record<ImportTipo, string> = {
  condomini: "Condomini",
  persone: "Persone",
  unita: "Unità immobiliari",
  segnalazioni: "Segnalazioni",
  consumi: "Consumi",
};

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB per file CSV/XLSX
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024; // 15 MB per documento
export const ACCEPTED_DOCUMENT_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.ms-excel",
];

/** Opzioni pronte per i menu a tendina. */
export function categoriaOptions(): Array<{ value: SegnalazioneCategoria; label: string }> {
  return SEGNALAZIONE_CATEGORIE.map((value) => ({ value, label: segnalazioneCategoriaLabels[value] }));
}

export function prioritaOptions(): Array<{ value: SegnalazionePriorita; label: string }> {
  return SEGNALAZIONE_PRIORITA.map((value) => ({ value, label: segnalazionePrioritaLabels[value] }));
}

export function condominioStatoOptions(): Array<{ value: CondominioStato; label: string }> {
  return CONDOMINIO_STATI.map((value) => ({ value, label: condominioStatoLabels[value] }));
}
