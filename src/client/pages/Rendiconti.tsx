import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiRequestError, qs } from "../lib/api";
import { useApiQuery } from "../lib/hooks";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBlock,
  Field,
  LoadingBlock,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Table,
  TextArea,
  TextInput,
  stateLabel,
  useToast,
} from "../components/ui";
import { DemoNota } from "../components/DemoNota";
import { useCondominioOptions } from "./Condomini";
import type { Paginated, PeriodoDto } from "@shared/api-types";
import { PERIODO_STATI, periodoStatoLabels } from "@shared/constants";
import { formatDate, formatEuro, formatPercent } from "@shared/format";

export function Rendiconti() {
  const [condominioId, setCondominioId] = useState("");
  const [anno, setAnno] = useState("");
  const [stato, setStato] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ condominioId: "", etichetta: "", dataInizio: "", dataFine: "", note: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const perPage = 25;
  const { data: condomini } = useCondominioOptions();
  const queryClient = useQueryClient();
  const { notify } = useToast();

  useEffect(() => setPage(1), [condominioId, anno, stato]);

  const { data, isLoading, error: loadError, refetch } = useApiQuery<Paginated<PeriodoDto>>(
    ["rendiconti", condominioId, anno, stato, page],
    `/rendiconti/periodi${qs({ condominioId: condominioId || undefined, anno: anno || undefined, stato: stato || undefined, page, perPage })}`,
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/rendiconti/periodi", {
        body: {
          condominioId: values.condominioId,
          etichetta: values.etichetta,
          dataInizio: values.dataInizio,
          dataFine: values.dataFine,
          note: values.note || null,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["rendiconti"] });
      notify("Periodo contabile creato.");
      setOpen(false);
      setValues({ condominioId: "", etichetta: "", dataInizio: "", dataFine: "", note: "" });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Salvataggio non riuscito.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Rendiconti"
        subtitle="Esercizi contabili, spese, rate e pagamenti registrati. Il CRM non sostituisce il software contabile."
        actions={<Button onClick={() => setOpen(true)}>Nuovo periodo</Button>}
      />

      <DemoNota>Periodi, spese, rate e pagamenti sono dati di esempio: nella demo non si possono creare o modificare. Nell’applicazione reale ogni importo deriva da registrazioni dello studio.</DemoNota>

      <div className="filters">
        <Field label="Condominio">
          <Select value={condominioId} onChange={(e) => setCondominioId(e.target.value)}>
            <option value="">Tutti</option>
            {condomini?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.denominazione}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Anno">
          <TextInput inputMode="numeric" placeholder="Es. 2025" value={anno} onChange={(e) => setAnno(e.target.value)} maxLength={4} />
        </Field>
        <Field label="Stato">
          <Select value={stato} onChange={(e) => setStato(e.target.value)}>
            <option value="">Tutti</option>
            {PERIODO_STATI.map((s) => (
              <option key={s} value={s}>
                {periodoStatoLabels[s]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {isLoading ? <LoadingBlock /> : null}
      {loadError ? <ErrorBlock message={loadError.message} onRetry={() => void refetch()} /> : null}

      {data && data.items.length === 0 ? (
        <EmptyState
          icon="📊"
          title="Nessun periodo contabile"
          description="Crea un periodo e registra spese, rate e pagamenti. Se un dato manca, il CRM dichiara il totale come non calcolabile."
          action={<Button onClick={() => setOpen(true)}>Nuovo periodo</Button>}
        />
      ) : null}

      {data && data.items.length > 0 ? (
        <>
          <Table caption="Periodi contabili">
            <thead>
              <tr>
                <th>Periodo</th>
                <th>Condominio</th>
                <th>Stato</th>
                <th className="right">Spese</th>
                <th className="right">Rate</th>
                <th className="right">Incassato</th>
                <th className="right">Residuo</th>
                <th>Avvisi</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((periodo) => (
                <tr key={periodo.id}>
                  <td>
                    <Link to={`/rendiconti/periodi/${periodo.id}`}>
                      <strong>{periodo.etichetta}</strong>
                    </Link>
                    <div className="muted small">
                      {formatDate(periodo.dataInizio)} → {formatDate(periodo.dataFine)}
                    </div>
                  </td>
                  <td>{periodo.condominio}</td>
                  <td>
                    <Badge value={periodo.stato} label={stateLabel(periodoStatoLabels, periodo.stato)} />
                  </td>
                  <td className="right nowrap">{periodo.numeroSpese === 0 ? "—" : formatEuro(periodo.totaleSpese)}</td>
                  <td className="right">{periodo.rateCount === 0 ? "—" : formatEuro(periodo.totaleRate)}</td>
                  <td className="right nowrap">
                    {periodo.rateCount === 0 ? (
                      <span className="muted">n.d.</span>
                    ) : (
                      <>
                        {formatEuro(periodo.incassato)}
                        <div className="muted small">
                          {formatPercent(periodo.totaleRate > 0 ? (periodo.incassato / periodo.totaleRate) * 100 : null)}
                        </div>
                      </>
                    )}
                  </td>
                  <td className="right nowrap">{periodo.rateCount === 0 ? "—" : formatEuro(periodo.residuo)}</td>
                  <td>
                    {periodo.avvisiCalcolo.length === 0 ? (
                      <span className="muted small">—</span>
                    ) : (
                      <Badge tone="warning" label={`${periodo.avvisiCalcolo.length} avvisi`} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} perPage={perPage} total={data.total} onPage={setPage} />
        </>
      ) : null}

      <Card title="Come vengono calcolati i totali">
        <ul className="small" style={{ paddingLeft: "1.1rem", margin: 0 }}>
          <li>Totale spese = somma degli importi delle spese registrate nel periodo.</li>
          <li>Totale rate e incassato = somme dei relativi importi e pagamenti registrati.</li>
          <li>Residuo = importo rata − pagamenti, solo per rate esistenti.</li>
          <li>
            Se mancano rate, millesimi o criteri di ripartizione il CRM segnala che il dato non è calcolabile: non
            inventa formule.
          </li>
        </ul>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nuovo periodo contabile"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Annulla
            </Button>
            <Button onClick={() => void submit(new Event("submit") as unknown as FormEvent)} loading={busy}>
              Crea periodo
            </Button>
          </>
        }
      >
        {condomini && condomini.items.length === 0 ? (
          <p className="muted">Serve almeno un condominio censito.</p>
        ) : (
          <form onSubmit={submit} noValidate>
            {error ? (
              <div className="alert alert--danger" role="alert">
                <div>{error}</div>
              </div>
            ) : null}
            <Field label="Condominio" required>
              <Select
                value={values.condominioId}
                onChange={(e) => setValues({ ...values, condominioId: e.target.value })}
                required
              >
                <option value="">Seleziona…</option>
                {condomini?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.denominazione}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Etichetta" required hint="Es. Esercizio 2025, Preventivo 2026">
              <TextInput value={values.etichetta} onChange={(e) => setValues({ ...values, etichetta: e.target.value })} required />
            </Field>
            <div className="form-grid">
              <Field label="Data inizio" required>
                <TextInput type="date" value={values.dataInizio} onChange={(e) => setValues({ ...values, dataInizio: e.target.value })} required />
              </Field>
              <Field label="Data fine" required>
                <TextInput type="date" value={values.dataFine} onChange={(e) => setValues({ ...values, dataFine: e.target.value })} required />
              </Field>
            </div>
            <Field label="Note">
              <TextArea value={values.note} onChange={(e) => setValues({ ...values, note: e.target.value })} rows={2} />
            </Field>
          </form>
        )}
      </Modal>
    </>
  );
}
