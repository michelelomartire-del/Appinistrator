import { todayIso } from "../../shared/format.js";
import type {
  ConsumoDto,
  ConsumptionComparison,
} from "../../shared/api-types.js";
import { toNumber, toNumberOrNull } from "../sql.js";

/** Arrotondamento a 4 decimali per i millesimi (evita errori di virgola mobile). */
export function roundMillesimi(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function sumMillesimi(
  values: Array<number | string | null | undefined>,
): number {
  return roundMillesimi(
    values.reduce<number>((acc, v) => acc + (toNumberOrNull(v) ?? 0), 0),
  );
}

/* ------------------------------------------------------------------------- */
/* Rate e rendiconti                                                         */
/* ------------------------------------------------------------------------- */

export type RataCalcolata = {
  importo: number;
  incassato: number;
  residuo: number;
  stato: "pagata" | "parziale" | "aperta" | "scaduta";
  scaduta: boolean;
};

export function calcolaRata(
  importo: number,
  incassato: number,
  scadenza: string,
  oggi = todayIso(),
): RataCalcolata {
  const incassatoRounded = Math.round(incassato * 100) / 100;
  const residuo = Math.max(
    0,
    Math.round((importo - incassatoRounded) * 100) / 100,
  );
  const scaduta = residuo > 0 && scadenza < oggi;
  let stato: RataCalcolata["stato"];
  if (residuo <= 0.004) stato = "pagata";
  else if (incassatoRounded > 0) stato = "parziale";
  else if (scaduta) stato = "scaduta";
  else stato = "aperta";
  return { importo, incassato: incassatoRounded, residuo, stato, scaduta };
}

export type AvvisoCalcolo = { codice: string; messaggio: string };

/**
 * Sintesi di un periodo contabile. Non applica alcuna formula di riparto:
 * calcola solo totali su importi registrati e segnala ciò che non è calcolabile.
 */
export function sintesiPeriodo(input: {
  spese: Array<{ importo: number }>;
  rate: Array<{
    importo: number;
    scadenza: string;
    unitaId: string | null;
    incassato: number;
    unitaSenzaMillesimi?: boolean;
  }>;
  criteriRipartizionePresenti: boolean;
  unitaSenzaMillesimi: number;
  rateSenzaUnita: number;
  /** Numero di spese registrate, quando il chiamante passa solo il totale. */
  numeroSpese?: number;
  /** Stato del periodo: in bozza il confronto rate/spese è solo indicativo. */
  statoPeriodo?: "bozza" | "chiuso";
  oggi?: string;
}): {
  totaleSpese: number;
  numeroSpese: number;
  totaleRate: number;
  incassato: number;
  residuo: number;
  rateScaduteNonPagate: number;
  avvisi: AvvisoCalcolo[];
} {
  const oggi = input.oggi ?? todayIso();
  const totaleSpese = round2(
    input.spese.reduce((acc, s) => acc + s.importo, 0),
  );
  const totaleRate = round2(input.rate.reduce((acc, r) => acc + r.importo, 0));
  const incassato = round2(input.rate.reduce((acc, r) => acc + r.incassato, 0));
  let residuo = 0;
  let rateScaduteNonPagate = 0;
  for (const rata of input.rate) {
    const calc = calcolaRata(rata.importo, rata.incassato, rata.scadenza, oggi);
    residuo += calc.residuo;
    if (calc.scaduta) rateScaduteNonPagate += 1;
  }
  residuo = round2(residuo);

  const avvisi: AvvisoCalcolo[] = [];
  if (input.rate.length === 0) {
    avvisi.push({
      codice: "nessuna_rata",
      messaggio:
        "Nessuna rata registrata: incassi e residui non sono calcolabili.",
    });
  }
  if (input.spese.length === 0) {
    avvisi.push({
      codice: "nessuna_spesa",
      messaggio: "Nessuna spesa registrata per questo periodo.",
    });
  }
  if (input.rateSenzaUnita > 0) {
    avvisi.push({
      codice: "rate_senza_unita",
      messaggio: `${input.rateSenzaUnita} rata/e non sono collegate a un’unità: il dettaglio per unità non è calcolabile.`,
    });
  }
  if (input.unitaSenzaMillesimi > 0) {
    avvisi.push({
      codice: "unita_senza_millesimi",
      messaggio: `${input.unitaSenzaMillesimi} unità non hanno millesimi registrati: eventuali ripartizioni per millesimi non sono calcolabili.`,
    });
  }
  if (!input.criteriRipartizionePresenti && input.rate.length > 0) {
    avvisi.push({
      codice: "nessun_criterio",
      messaggio:
        "Nessun criterio di ripartizione indicato: il CRM non calcola importi per unità.",
    });
  }
  // Il riparto per millesimi produce arrotondamenti di pochi centesimi:
  // la tolleranza cresce con il numero di rate, così non si segnalano falsi errori.
  const tolleranzaArrotondamento = Math.max(0.05, input.rate.length * 0.01);
  if (
    input.rate.length > 0 &&
    totaleRate > 0 &&
    Math.abs(totaleRate - totaleSpese) > tolleranzaArrotondamento &&
    input.spese.length > 0
  ) {
    avvisi.push({
      codice: "rate_non_quadrano",
      messaggio:
        input.statoPeriodo === "bozza"
          ? `Periodo in bozza: le rate si basano sul preventivo (${formatIt(totaleRate)} €) e le spese registrate finora sono ${formatIt(totaleSpese)} €. Il confronto è indicativo fino alla chiusura del periodo.`
          : `Totale rate (${formatIt(totaleRate)} €) diverso dal totale spese (${formatIt(totaleSpese)} €): verifica i dati registrati.`,
    });
  }
  return {
    totaleSpese,
    numeroSpese: input.numeroSpese ?? input.spese.length,
    totaleRate,
    incassato,
    residuo,
    rateScaduteNonPagate,
    avvisi,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatIt(value: number): string {
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(
    value,
  );
}

/* ------------------------------------------------------------------------- */
/* Confronto consumi                                                         */
/* ------------------------------------------------------------------------- */

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) /
      86_400_000,
  );
}

/**
 * Confronta un consumo con quello precedente solo se omogeneo:
 * stessa categoria e unità di misura, periodi non sovrapposti, durata simile
 * (±7 giorni) e distanza fra i periodi non superiore a 62 giorni.
 * In ogni altro caso restituisce `non_confrontabile` con il motivo.
 */
export function confrontaConsumi(
  corrente: ConsumoDto,
  precedente: ConsumoDto | null,
): ConsumptionComparison {
  if (!precedente) {
    return {
      corrente,
      precedente: null,
      stato: "non_confrontabile",
      motivo: "Nessun dato precedente per stessa categoria e unità di misura.",
      differenza: null,
      variazionePercentuale: null,
    };
  }
  const problemi: string[] = [];
  if (precedente.categoria !== corrente.categoria)
    problemi.push("categoria diversa");
  if (precedente.unitaMisura !== corrente.unitaMisura)
    problemi.push("unità di misura diversa");
  if (precedente.periodoA >= corrente.periodoDa)
    problemi.push("periodi sovrapposti o non consecutivi");
  const durataCorrente = daysBetween(corrente.periodoDa, corrente.periodoA);
  const durataPrecedente = daysBetween(
    precedente.periodoDa,
    precedente.periodoA,
  );
  if (Math.abs(durataCorrente - durataPrecedente) > 7)
    problemi.push("durata dei periodi diversa");
  const distanza = daysBetween(precedente.periodoA, corrente.periodoDa);
  if (distanza > 62) problemi.push("periodi non contigui");
  if (corrente.origine === "stimato" || precedente.origine === "stimato")
    problemi.push("almeno un valore è stimato");
  if (problemi.length > 0) {
    return {
      corrente,
      precedente,
      stato: "non_confrontabile",
      motivo: problemi.join("; "),
      differenza: null,
      variazionePercentuale: null,
    };
  }
  const differenza = round2(corrente.valore - precedente.valore);
  const variazionePercentuale =
    precedente.valore === 0
      ? null
      : Math.round((differenza / precedente.valore) * 1000) / 10;
  return {
    corrente,
    precedente,
    stato: "confrontabile",
    motivo: null,
    differenza,
    variazionePercentuale,
  };
}

/** Percentuale con controllo del denominatore. */
export function percentuale(
  numeratore: number,
  denominatore: number,
): number | null {
  if (
    !Number.isFinite(numeratore) ||
    !Number.isFinite(denominatore) ||
    denominatore <= 0
  )
    return null;
  return Math.round((numeratore / denominatore) * 1000) / 10;
}
