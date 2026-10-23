import { useState } from "react";
import { Link } from "react-router-dom";
import { useApiQuery } from "../lib/hooks";
import {
  Badge,
  Banner,
  Card,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  Table,
  stateLabel,
} from "../components/ui";
import type { DashboardData } from "@shared/api-types";
import {
  assembleaStatoLabels,
  condominioStatoLabels,
  segnalazioneStatoLabels,
} from "@shared/constants";
import { formatDate, formatEuro, formatNumber, formatPercent } from "@shared/format";

export function Dashboard() {
  const { data, isLoading, error, refetch } = useApiQuery<DashboardData & { oggi: string }>(["dashboard"], "/dashboard");
  const [openWhy, setOpenWhy] = useState<string | null>(null);

  if (isLoading) return <LoadingBlock label="Calcolo indicatori…" />;
  if (error) return <ErrorBlock message={error.message} onRetry={() => void refetch()} />;
  if (!data) return null;

  const totals = {
    condomini: data.condominiPerStato.reduce((acc, c) => acc + c.count, 0),
    segnalazioni: data.segnalazioniPerStato.reduce((acc, s) => acc + s.count, 0),
  };

  return (
    <>
      <PageHeader
        title="Panoramica"
        subtitle={
          <>
            Indicatori calcolati sui dati presenti nel CRM · aggiornato al {formatDate(data.oggi)}
          </>
        }
      />

      {data.datiInsufficienti.length > 0 ? (
        <Banner tone="info" title="Dati non ancora sufficienti per alcuni indicatori">
          <ul style={{ margin: "0.2rem 0 0", paddingLeft: "1.1rem" }}>
            {data.datiInsufficienti.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Banner>
      ) : null}

      <div className="kpi-grid">
        {data.kpis.map((kpi) => {
          const formatted =
            kpi.value === null
              ? null
              : kpi.unit === "euro"
                ? formatEuro(kpi.value)
                : kpi.unit === "percent"
                  ? formatPercent(kpi.value)
                  : formatNumber(kpi.value, 0);
          const content = (
            <>
              <div className="kpi__label">{kpi.label}</div>
              {formatted !== null ? (
                <div className="kpi__value">{formatted}</div>
              ) : (
                <div className="kpi__unavailable">{kpi.unavailableReason ?? "Dato non disponibile"}</div>
              )}
              <div className="kpi__hint">{kpi.hint}</div>
              <button
                type="button"
                className="kpi__why"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setOpenWhy(openWhy === kpi.id ? null : kpi.id);
                }}
                aria-expanded={openWhy === kpi.id}
              >
                Come è calcolato?
              </button>
              {openWhy === kpi.id ? <div className="muted small">{kpi.explanation}</div> : null}
            </>
          );
          return kpi.available ? (
            <Link key={kpi.id} to={kpi.href} className="kpi">
              {content}
            </Link>
          ) : (
            <div key={kpi.id} className="kpi kpi--muted" aria-disabled="true">
              {content}
            </div>
          );
        })}
      </div>

      <div className="grid-2">
        <Card
          title="Condomini per stato"
          actions={
            <Link to="/condomini" className="small">
              Vedi tutti
            </Link>
          }
        >
          {totals.condomini === 0 ? (
            <EmptyState
              icon="🏢"
              title="Nessun condominio censito"
              description="Inizia censendo i condomìni clienti oppure importane un elenco da file."
              action={<Link to="/condomini">Censisci un condominio</Link>}
            />
          ) : (
            <div className="bar-chart">
              {(["attivo", "potenziale", "cessato"] as const).map((stato) => {
                const count = data.condominiPerStato.find((c) => c.stato === stato)?.count ?? 0;
                return (
                  <div className="bar-chart__row" key={stato}>
                    <span>{condominioStatoLabels[stato]}</span>
                    <div className="bar-chart__track">
                      <div
                        className="bar-chart__fill"
                        style={{ width: `${totals.condomini ? (count / totals.condomini) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="bar-chart__value">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card
          title="Segnalazioni per stato"
          actions={
            <Link to="/segnalazioni" className="small">
              Vedi tutte
            </Link>
          }
        >
          {totals.segnalazioni === 0 ? (
            <EmptyState
              icon="🛠"
              title="Nessuna segnalazione"
              description="Le segnalazioni aperte compariranno qui con stato e scadenze."
            />
          ) : (
            <div className="bar-chart">
              {Object.entries(segnalazioneStatoLabels).map(([stato, label]) => {
                const count = data.segnalazioniPerStato.find((s) => s.stato === stato)?.count ?? 0;
                return (
                  <div className="bar-chart__row" key={stato}>
                    <span>{label}</span>
                    <div className="bar-chart__track">
                      <div
                        className="bar-chart__fill"
                        style={{ width: `${totals.segnalazioni ? (count / totals.segnalazioni) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="bar-chart__value">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Card
        title="Prossime assemblee"
        description="Assemblee programmate o convocate da oggi."
        actions={
          <Link to="/assemblee" className="small">
            Calendario assemblee
          </Link>
        }
      >
        {data.prossimeAssemblee.length === 0 ? (
          <EmptyState icon="🗓" title="Nessuna assemblea in programma" description="Quando ne registri una, la trovi qui." />
        ) : (
          <Table caption="Prossime assemblee">
            <thead>
              <tr>
                <th>Data</th>
                <th>Condominio</th>
                <th>Tipo</th>
                <th>Ordine del giorno</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {data.prossimeAssemblee.map((assemblea) => (
                <tr key={assemblea.id}>
                  <td className="nowrap">
                    <Link to={`/assemblee/${assemblea.id}`}>
                      {formatDate(assemblea.data)}
                      {assemblea.ora ? ` · ${assemblea.ora}` : ""}
                    </Link>
                  </td>
                  <td>
                    <Link to={`/condomini/${assemblea.condominioId}`}>{assemblea.condominio}</Link>
                  </td>
                  <td>{assemblea.tipo}</td>
                  <td>{assemblea.punti} punti</td>
                  <td>
                    <Badge value={assemblea.stato} label={stateLabel(assembleaStatoLabels, assemblea.stato)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="grid-2">
        <Card
          title="Segnalazioni scadute"
          actions={
            <Link to="/segnalazioni?scadute=true" className="small">
              Vedi tutte
            </Link>
          }
        >
          {data.segnalazioniScadute.length === 0 ? (
            <EmptyState icon="✅" title="Nessuna segnalazione scaduta" description="Nessun intervento oltre la scadenza registrata." />
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }} className="stack stack--sm">
              {data.segnalazioniScadute.map((s) => (
                <li key={s.id} className="row row--between" style={{ gap: "0.5rem" }}>
                  <div>
                    <Link to={`/segnalazioni/${s.id}`}>
                      <strong>{s.titolo}</strong>
                    </Link>
                    <div className="muted small">
                      {s.condominio} · {s.codice}
                    </div>
                  </div>
                  <div className="right">
                    <Badge value="scaduta" label={`scaduta il ${formatDate(s.scadenza)}`} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Scadenze rate (30 giorni)"
          actions={
            <Link to="/rendiconti" className="small">
              Vai ai rendiconti
            </Link>
          }
        >
          {data.scadenzeRate.length === 0 ? (
            <EmptyState
              icon="💶"
              title="Nessuna scadenza registrata"
              description="Le rate con residuo aperto compaiono qui quando registrate nel modulo Rendiconti."
            />
          ) : (
            <Table caption="Scadenze rate">
              <thead>
                <tr>
                  <th>Scadenza</th>
                  <th>Condominio</th>
                  <th className="right">Residuo</th>
                </tr>
              </thead>
              <tbody>
                {data.scadenzeRate.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{formatDate(r.scadenza)}</td>
                    <td>{r.condominio}</td>
                    <td className="right nowrap">{formatEuro(r.residuo)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
