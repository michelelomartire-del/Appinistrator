import { Router } from "express";
import { getDb, toDateString } from "../db.js";
import { asyncHandler } from "../http.js";
import { toNumber, toNumberOrNull } from "../sql.js";
import { percentuale } from "../services/calcoli.js";
import { todayIso } from "../../shared/format.js";
import type { DashboardData, DashboardKpi } from "../../shared/api-types.js";

export const dashboardRouter = Router();

/**
 * Indicatori calcolati esclusivamente su record presenti.
 * Se il dato necessario non esiste, il KPI viene restituito con `available: false`
 * e il motivo: il client non mostra un numero inventato.
 */
dashboardRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const db = getDb();
    const oggi = todayIso();

    const condomini = await db.query<{ stato: string; count: string }>(
      `select stato, count(*)::int as count from condomini where archiviato = false group by stato`,
    );
    const condominiAttivi = toNumber(
      condomini.find((c) => c.stato === "attivo")?.count,
    );

    const segnalazioni = await db.query<{ stato: string; count: string }>(
      `select stato, count(*)::int as count from segnalazioni group by stato`,
    );
    const segnalazioniAperte = segnalazioni
      .filter((s) =>
        ["nuova", "in_valutazione", "assegnata", "in_corso"].includes(s.stato),
      )
      .reduce((acc, s) => acc + toNumber(s.count), 0);

    const scaduteRows = await db.query<Record<string, unknown>>(
      `select s.id, s.codice, s.titolo, s.scadenza, s.stato, c.denominazione as condominio
         from segnalazioni s join condomini c on c.id = s.condominio_id
        where s.scadenza is not null and s.scadenza < current_date and s.stato not in ('risolta','chiusa')
        order by s.scadenza asc limit 10`,
    );
    const scaduteCountRows = await db.query<{ count: string }>(
      `select count(*)::int as count from segnalazioni s
        where s.scadenza is not null and s.scadenza < current_date and s.stato not in ('risolta','chiusa')`,
    );
    const segnalazioniScadute = toNumber(scaduteCountRows[0]?.count);

    const prossimeRows = await db.query<Record<string, unknown>>(
      `select a.id, a.condominio_id, c.denominazione as condominio, a.data, a.ora, a.tipo, a.stato,
              (select count(*)::int from assemblea_punti p where p.assemblea_id = a.id) as punti
         from assemblee a join condomini c on c.id = a.condominio_id
        where a.data >= current_date and a.stato in ('programmata','convocata')
        order by a.data asc, a.ora asc nulls last limit 10`,
    );
    const assembleeCount = await db.query<{ count: string }>(
      `select count(*)::int as count from assemblee a
        where a.data >= current_date and a.stato in ('programmata','convocata')`,
    );

    // --- Rendiconti / rate --------------------------------------------------
    const rateAgg = await db.query<Record<string, unknown>>(
      `select count(*)::int as rate_count,
              coalesce(sum(r.importo),0) as totale_rate,
              coalesce(sum((select coalesce(sum(pg.importo),0) from pagamenti pg where pg.rata_id = r.id)),0) as incassato
         from rate r`,
    );
    const rateCount = toNumber(rateAgg[0]?.rate_count);
    const totaleRate = toNumber(rateAgg[0]?.totale_rate);
    const incassato = toNumber(rateAgg[0]?.incassato);
    const percentualeIncassata =
      rateCount > 0 && totaleRate > 0
        ? percentuale(incassato, totaleRate)
        : null;

    const residuoRows = await db.query<Record<string, unknown>>(
      `select coalesce(sum(greatest(r.importo - coalesce(inc.tot,0), 0)),0) as residuo_scaduto,
              count(*)::int as rate_scadute
         from rate r
         left join (select rata_id, sum(importo) as tot from pagamenti group by rata_id) inc on inc.rata_id = r.id
        where r.scadenza < current_date and r.importo - coalesce(inc.tot,0) > 0.004`,
    );
    const residuoScaduto = toNumber(residuoRows[0]?.residuo_scaduto);
    const rateScadute = toNumber(residuoRows[0]?.rate_scadute);

    const scadenzeRows = await db.query<Record<string, unknown>>(
      `select r.id, r.descrizione, r.scadenza, r.importo, c.denominazione as condominio,
              coalesce(inc.tot,0) as incassato
         from rate r
         join periodi_contabili pc on pc.id = r.periodo_id
         join condomini c on c.id = pc.condominio_id
         left join (select rata_id, sum(importo) as tot from pagamenti group by rata_id) inc on inc.rata_id = r.id
        where r.scadenza <= current_date + 30 and r.importo - coalesce(inc.tot,0) > 0.004
        order by r.scadenza asc limit 10`,
    );

    // --- Consumi ------------------------------------------------------------
    const consumiCount = await db.query<{ count: string }>(
      "select count(*)::int as count from consumi",
    );
    const consumiTotali = toNumber(consumiCount[0]?.count);
    const consumiConfrontabili = await db.query<{ count: string }>(
      `select count(*)::int as count from consumi c
        where exists (
          select 1 from consumi p
           where p.condominio_id = c.condominio_id
             and p.categoria = c.categoria
             and p.unita_misura = c.unita_misura
             and p.periodo_a < c.periodo_da
             and p.periodo_a >= c.periodo_da - 62
             and abs((c.periodo_a - c.periodo_da) - (p.periodo_a - p.periodo_da)) <= 7
             and c.origine <> 'stimato' and p.origine <> 'stimato'
        )`,
    );
    const confrontabili = toNumber(consumiConfrontabili[0]?.count);

    // --- Periodi contabili --------------------------------------------------
    const periodiCount = await db.query<{ count: string }>(
      "select count(*)::int as count from periodi_contabili",
    );
    const periodiTotali = toNumber(periodiCount[0]?.count);

    const datiInsufficienti: string[] = [];
    if (rateCount === 0)
      datiInsufficienti.push(
        "Nessuna rata registrata: incassi e stato dei rendiconti non sono disponibili.",
      );
    if (periodiTotali === 0)
      datiInsufficienti.push(
        "Nessun periodo contabile registrato nel modulo Rendiconti.",
      );
    if (consumiTotali === 0)
      datiInsufficienti.push(
        "Nessun consumo registrato: confronti non disponibili.",
      );
    else if (confrontabili === 0) {
      datiInsufficienti.push(
        "Esistono consumi ma nessuna coppia di periodi omogenei: i confronti non sono mostrati.",
      );
    }
    if (assembleeCount[0] && toNumber(assembleeCount[0].count) === 0) {
      datiInsufficienti.push(
        "Nessuna assemblea programmata o convocata in calendario.",
      );
    }

    const kpis: DashboardKpi[] = [
      {
        id: "condomini_attivi",
        label: "Condomini attivi",
        value: condominiAttivi,
        unit: "count",
        href: "/condomini?stato=attivo",
        hint: "Rapporti con stato “Attivo” non archiviati",
        explanation:
          "Conteggio dei condomini con stato “Attivo” e non archiviati.",
        available: true,
      },
      {
        id: "segnalazioni_aperte",
        label: "Segnalazioni aperte",
        value: segnalazioniAperte,
        unit: "count",
        href: "/segnalazioni?stato=aperte",
        hint: "Nuove, in valutazione, assegnate e in corso",
        explanation:
          "Somma delle segnalazioni negli stati Nuova, In valutazione, Assegnata e In corso.",
        available: true,
      },
      {
        id: "segnalazioni_scadute",
        label: "Segnalazioni scadute",
        value: segnalazioniScadute,
        unit: "count",
        href: "/segnalazioni?scadute=true",
        hint: "Scadenza superata e non ancora risolte",
        explanation:
          "Segnalazioni con scadenza precedente a oggi e stato diverso da Risolta o Chiusa.",
        available: true,
      },
      {
        id: "prossime_assemblee",
        label: "Prossime assemblee",
        value: toNumber(assembleeCount[0]?.count),
        unit: "count",
        href: "/assemblee?prossime=true",
        hint: "Programmate o convocate da oggi",
        explanation:
          "Assemblee con data odierna o futura e stato Programmata o Convocata.",
        available: true,
      },
      {
        id: "percentuale_incassata",
        label: "Rate incassate",
        value: percentualeIncassata,
        unit: "percent",
        href: "/rendiconti",
        hint:
          rateCount > 0
            ? "Incassato su totale rate registrate"
            : "Nessuna rata registrata",
        explanation:
          "Percentuale = pagamenti registrati ÷ totale delle rate registrate. Considera solo rate presenti nel CRM, non l’intero bilancio.",
        available: percentualeIncassata !== null,
        unavailableReason:
          rateCount === 0
            ? "Non ci sono rate registrate: la percentuale non è calcolabile."
            : "Il totale delle rate è zero: la percentuale non è calcolabile.",
      },
      {
        id: "residuo_scaduto",
        label: "Residuo scaduto",
        value: rateScadute > 0 ? residuoScaduto : null,
        unit: "euro",
        href: "/rendiconti?scadute=true",
        hint:
          rateScadute > 0
            ? `${rateScadute} rate con residuo`
            : "Nessuna rata scaduta con residuo",
        explanation:
          "Somma dei residui (importo rata − pagamenti) delle rate con scadenza superata.",
        available: rateScadute > 0,
        unavailableReason: "Nessuna rata scaduta con residuo aperto.",
      },
      {
        id: "confronti_consumi",
        label: "Consumi confrontabili",
        value: confrontabili > 0 ? confrontabili : null,
        unit: "count",
        href: "/consumi",
        hint:
          confrontabili > 0
            ? "Periodi omogenei con confronto valido"
            : "Dati non omogenei o assenti",
        explanation:
          "Numero di letture che hanno un periodo precedente omogeneo (stessa categoria e unità di misura, durata simile, non stimato).",
        available: confrontabili > 0,
        unavailableReason:
          consumiTotali === 0
            ? "Nessun consumo registrato."
            : "Nessuna coppia di periodi omogenei: il confronto non è mostrato.",
      },
    ];

    const data: DashboardData = {
      kpis,
      condominiPerStato: condomini.map((c) => ({
        stato: c.stato,
        count: toNumber(c.count),
      })),
      segnalazioniPerStato: segnalazioni.map((s) => ({
        stato: s.stato,
        count: toNumber(s.count),
      })),
      prossimeAssemblee: prossimeRows.map((r) => ({
        id: String(r.id),
        condominioId: String(r.condominio_id),
        condominio: String(r.condominio),
        data: toDateString(r.data) ?? "",
        ora: r.ora ? String(r.ora).slice(0, 5) : null,
        tipo: String(r.tipo),
        stato: String(r.stato),
        punti: Number(r.punti ?? 0),
      })),
      segnalazioniScadute: scaduteRows.map((r) => ({
        id: String(r.id),
        codice: String(r.codice),
        titolo: String(r.titolo),
        condominio: String(r.condominio),
        scadenza: toDateString(r.scadenza) ?? "",
        stato: String(r.stato),
      })),
      scadenzeRate: scadenzeRows.map((r) => {
        const importo = toNumber(r.importo);
        const incassatoRata = toNumber(r.incassato);
        return {
          id: String(r.id),
          descrizione: String(r.descrizione),
          condominio: String(r.condominio),
          scadenza: toDateString(r.scadenza) ?? "",
          importo,
          incassato: incassatoRata,
          residuo: Math.round((importo - incassatoRata) * 100) / 100,
        };
      }),
      datiInsufficienti,
    };

    res.json({ ...data, oggi });
  }),
);

export { toNumberOrNull };
