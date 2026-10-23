import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiRequestError } from "../lib/api";
import { useApiQuery } from "../lib/hooks";
import {
  Badge,
  Banner,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBlock,
  Field,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  Table,
  TextArea,
  TextInput,
  stateLabel,
  useToast,
} from "../components/ui";
import { DocumentsPanel } from "../components/DocumentsPanel";
import type { PeriodoDto, RataDto } from "@shared/api-types";
import { periodoStatoLabels } from "@shared/constants";
import { formatDate, formatEuro, formatPercent } from "@shared/format";

type Spesa = {
  id: string;
  data: string | null;
  descrizione: string;
  categoria: string | null;
  importo: number;
  fornitore: string | null;
  riferimento: string | null;
  note: string | null;
};

type Pagamento = {
  id: string;
  rataId: string;
  rataDescrizione: string;
  data: string | null;
  importo: number;
  metodo: string | null;
  riferimento: string | null;
  note: string | null;
};

type Detail = PeriodoDto & { spese: Spesa[]; rate: RataDto[]; pagamenti: Pagamento[] };

export function PeriodoDetail() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { data, isLoading, error, refetch } = useApiQuery<Detail>(["rendiconti", id], `/rendiconti/periodi/${id}`);

  const [spesaOpen, setSpesaOpen] = useState(false);
  const [spesa, setSpesa] = useState({ data: "", descrizione: "", categoria: "", importo: "", fornitore: "", riferimento: "", note: "" });
  const [rataOpen, setRataOpen] = useState(false);
  const [rata, setRata] = useState({ unitaId: "", descrizione: "", numero: "", scadenza: "", importo: "", criteriRipartizione: "", note: "" });
  const [payFor, setPayFor] = useState<RataDto | null>(null);
  const [pagamento, setPagamento] = useState({ data: "", importo: "", metodo: "", riferimento: "", note: "" });
  const [unita, setUnita] = useState<Array<{ id: string; identificativo: string }>>([]);
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [spesaToDelete, setSpesaToDelete] = useState<string | null>(null);
  const [rataToDelete, setRataToDelete] = useState<string | null>(null);
  const [pagamentoToDelete, setPagamentoToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    api<{ unita: Array<{ id: string; identificativo: string }> }>(`/condomini/${data.condominioId}`)
      .then((detail) => setUnita(detail.unita))
      .catch(() => setUnita([]));
  }, [data]);

  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error.message} onRetry={() => void refetch()} />;
  if (!data) return null;

  const chiuso = data.stato === "chiuso";
  const percentualeIncassata = data.totaleRate > 0 ? (data.incassato / data.totaleRate) * 100 : null;

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["rendiconti"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    await refetch();
  };

  const addSpesa = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setErrorModal(null);
    try {
      await api(`/rendiconti/periodi/${id}/spese`, {
        body: {
          data: spesa.data,
          descrizione: spesa.descrizione,
          categoria: spesa.categoria || null,
          importo: spesa.importo,
          fornitore: spesa.fornitore || null,
          riferimento: spesa.riferimento || null,
          note: spesa.note || null,
        },
      });
      notify("Spesa registrata.");
      setSpesaOpen(false);
      setSpesa({ data: "", descrizione: "", categoria: "", importo: "", fornitore: "", riferimento: "", note: "" });
      await refresh();
    } catch (err) {
      setErrorModal(err instanceof ApiRequestError ? err.message : "Salvataggio non riuscito.");
    } finally {
      setBusy(false);
    }
  };

  const addRata = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setErrorModal(null);
    try {
      await api(`/rendiconti/periodi/${id}/rate`, {
        body: {
          unitaId: rata.unitaId || null,
          descrizione: rata.descrizione,
          numero: rata.numero || null,
          scadenza: rata.scadenza,
          importo: rata.importo,
          criteriRipartizione: rata.criteriRipartizione || null,
          note: rata.note || null,
        },
      });
      notify("Rata registrata.");
      setRataOpen(false);
      setRata({ unitaId: "", descrizione: "", numero: "", scadenza: "", importo: "", criteriRipartizione: "", note: "" });
      await refresh();
    } catch (err) {
      setErrorModal(err instanceof ApiRequestError ? err.message : "Salvataggio non riuscito.");
    } finally {
      setBusy(false);
    }
  };

  const addPagamento = async (event: FormEvent) => {
    event.preventDefault();
    if (!payFor) return;
    setBusy(true);
    setErrorModal(null);
    try {
      await api(`/rendiconti/rate/${payFor.id}/pagamenti`, {
        body: {
          data: pagamento.data,
          importo: pagamento.importo,
          metodo: pagamento.metodo || null,
          riferimento: pagamento.riferimento || null,
          note: pagamento.note || null,
        },
      });
      notify("Pagamento registrato.");
      setPagamento({ data: "", importo: "", metodo: "", riferimento: "", note: "" });
      await refresh();
    } catch (err) {
      setErrorModal(err instanceof ApiRequestError ? err.message : "Salvataggio non riuscito.");
    } finally {
      setBusy(false);
    }
  };

  const toggleStato = async () => {
    setBusy(true);
    try {
      await api(`/rendiconti/periodi/${id}`, { method: "PATCH", body: { stato: chiuso ? "bozza" : "chiuso" } });
      notify(chiuso ? "Periodo riaperto in bozza." : "Periodo chiuso: modifiche bloccate fino alla riapertura.");
      await refresh();
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : "Operazione non riuscita.", "danger");
    } finally {
      setBusy(false);
    }
  };

  const removeSpesa = async () => {
    if (!spesaToDelete) return;
    setBusy(true);
    try {
      await api(`/rendiconti/spese/${spesaToDelete}`, { method: "DELETE" });
      notify("Spesa eliminata.");
      setSpesaToDelete(null);
      await refresh();
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : "Operazione non riuscita.", "danger");
    } finally {
      setBusy(false);
    }
  };

  const removeRata = async () => {
    if (!rataToDelete) return;
    setBusy(true);
    try {
      await api(`/rendiconti/rate/${rataToDelete}`, { method: "DELETE" });
      notify("Rata eliminata.");
      setRataToDelete(null);
      await refresh();
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : "Operazione non riuscita.", "danger");
    } finally {
      setBusy(false);
    }
  };

  const removePagamento = async () => {
    if (!pagamentoToDelete) return;
    setBusy(true);
    try {
      await api(`/rendiconti/pagamenti/${pagamentoToDelete}`, { method: "DELETE" });
      notify("Pagamento eliminato.");
      setPagamentoToDelete(null);
      await refresh();
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : "Operazione non riuscita.", "danger");
    } finally {
      setBusy(false);
    }
  };

  const eliminaPeriodo = async () => {
    setBusy(true);
    try {
      await api(`/rendiconti/periodi/${id}`, { method: "DELETE" });
      notify("Periodo eliminato.");
      await queryClient.invalidateQueries({ queryKey: ["rendiconti"] });
      window.location.href = "/rendiconti";
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : "Operazione non riuscita.", "danger");
      setDeleteOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        backTo="/rendiconti"
        title={data.etichetta}
        subtitle={
          <>
            <Link to={`/condomini/${data.condominioId}`}>{data.condominio}</Link>
            <span className="muted">
              {formatDate(data.dataInizio)} → {formatDate(data.dataFine)}
            </span>
            <Badge value={data.stato} label={stateLabel(periodoStatoLabels, data.stato)} />
          </>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => void toggleStato()} loading={busy}>
              {chiuso ? "Riapri in bozza" : "Chiudi periodo"}
            </Button>
            {!chiuso ? (
              <Button variant="ghost" onClick={() => setDeleteOpen(true)}>
                Elimina
              </Button>
            ) : null}
          </>
        }
      />

      {chiuso ? (
        <Banner tone="info" title="Periodo chiuso">
          Spese, rate e pagamenti sono bloccati. Riapri il periodo come bozza per correggere i dati: l’operazione è
          tracciata nell’audit log.
        </Banner>
      ) : null}

      {data.avvisiCalcolo.length > 0 ? (
        <Banner tone="warning" title="Verifiche sui dati registrati">
          <ul style={{ margin: "0.2rem 0 0", paddingLeft: "1.1rem" }}>
            {data.avvisiCalcolo.map((avviso) => (
              <li key={avviso}>{avviso}</li>
            ))}
          </ul>
        </Banner>
      ) : null}

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi__label">Spese registrate</div>
          <div className="kpi__value">{data.numeroSpese === 0 ? "—" : formatEuro(data.totaleSpese)}</div>
          <div className="kpi__hint">{data.numeroSpese} voci registrate</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">Rate registrate</div>
          <div className="kpi__value">{data.rateCount === 0 ? "—" : formatEuro(data.totaleRate)}</div>
          <div className="kpi__hint">{data.rateCount} rate</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">Incassato</div>
          <div className={`kpi__value`}>{data.rateCount === 0 ? "n.d." : formatEuro(data.incassato)}</div>
          <div className="kpi__hint">
            {data.rateCount === 0 ? "Nessuna rata: percentuale non calcolabile" : `${formatPercent(percentualeIncassata) ?? "—"} del totale rate`}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi__label">Residuo</div>
          <div className="kpi__value">{data.rateCount === 0 ? "n.d." : formatEuro(data.residuo)}</div>
          <div className="kpi__hint">{data.rateScaduteNonPagate} rate scadute con residuo</div>
        </div>
      </div>

      <Card
        title="Spese"
        description="Voci di spesa con data, importo e riferimento al documento (allegati nella scheda Documenti)."
        actions={
          !chiuso ? (
            <Button size="sm" onClick={() => setSpesaOpen(true)}>
              Aggiungi spesa
            </Button>
          ) : null
        }
      >
        {data.spese.length === 0 ? (
          <EmptyState icon="🧾" title="Nessuna spesa registrata" description="Il totale spese non è calcolabile finché non registri almeno una voce." />
        ) : (
          <Table caption="Spese del periodo">
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrizione</th>
                <th>Categoria</th>
                <th>Fornitore</th>
                <th className="right">Importo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.spese.map((s) => (
                <tr key={s.id}>
                  <td className="nowrap">{formatDate(s.data)}</td>
                  <td>
                    {s.descrizione}
                    {s.riferimento ? <div className="muted small">Rif. {s.riferimento}</div> : null}
                  </td>
                  <td>{s.categoria ?? "—"}</td>
                  <td>{s.fornitore ?? "—"}</td>
                  <td className="right nowrap">{formatEuro(s.importo)}</td>
                  <td className="right">
                    {!chiuso ? (
                      <Button variant="ghost" size="sm" onClick={() => setSpesaToDelete(s.id)}>
                        Elimina
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card
        title="Rate e pagamenti"
        description="Una rata può essere collegata a un’unità; il residuo è calcolato come importo meno pagamenti registrati."
        actions={
          !chiuso ? (
            <Button size="sm" onClick={() => setRataOpen(true)}>
              Aggiungi rata
            </Button>
          ) : null
        }
      >
        {data.rate.length === 0 ? (
          <EmptyState
            icon="💶"
            title="Nessuna rata registrata"
            description="Senza rate il CRM non mostra percentuali di incasso né residui."
          />
        ) : (
          <Table caption="Rate">
            <thead>
              <tr>
                <th>Rata</th>
                <th>Unità</th>
                <th>Scadenza</th>
                <th>Stato</th>
                <th className="right">Importo</th>
                <th className="right">Incassato</th>
                <th className="right">Residuo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.rate.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.descrizione}
                    {r.numero ? <div className="muted small">N. {r.numero}</div> : null}
                    {r.criteriRipartizione ? <div className="muted small">Criterio: {r.criteriRipartizione}</div> : null}
                  </td>
                  <td>{r.unita ?? <span className="muted small">non collegata</span>}</td>
                  <td className="nowrap">{formatDate(r.scadenza)}</td>
                  <td>
                    <Badge value={r.stato} label={r.stato === "aperta" ? "Aperta" : r.stato === "pagata" ? "Pagata" : r.stato === "parziale" ? "Parziale" : "Scaduta"} />
                  </td>
                  <td className="right nowrap">{formatEuro(r.importo)}</td>
                  <td className="right nowrap">{formatEuro(r.incassato)}</td>
                  <td className="right nowrap">{formatEuro(r.residuo)}</td>
                  <td className="right nowrap">
                    <Button variant="ghost" size="sm" onClick={() => setPayFor(r)}>
                      Pagamenti
                    </Button>
                    {!chiuso ? (
                      <Button variant="ghost" size="sm" onClick={() => setRataToDelete(r.id)}>
                        Elimina
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="Documenti del periodo" description="Fatture, verbali e allegati contabili nell’archivio privato.">
        <DocumentsPanel entitaTipo="periodo_contabile" entitaId={data.id} condominioId={data.condominioId} />
      </Card>

      {/* Spesa */}
      <Modal
        open={spesaOpen}
        onClose={() => setSpesaOpen(false)}
        title="Nuova spesa"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSpesaOpen(false)} disabled={busy}>
              Annulla
            </Button>
            <Button onClick={() => void addSpesa(new Event("submit") as unknown as FormEvent)} loading={busy}>
              Registra spesa
            </Button>
          </>
        }
      >
        <form onSubmit={addSpesa} noValidate>
          {errorModal ? (
            <div className="alert alert--danger" role="alert">
              <div>{errorModal}</div>
            </div>
          ) : null}
          <div className="form-grid">
            <Field label="Data" required>
              <TextInput type="date" value={spesa.data} onChange={(e) => setSpesa({ ...spesa, data: e.target.value })} required />
            </Field>
            <Field label="Importo (€)" required>
              <TextInput inputMode="decimal" value={spesa.importo} onChange={(e) => setSpesa({ ...spesa, importo: e.target.value })} required />
            </Field>
            <div className="field--full">
              <Field label="Descrizione" required>
                <TextInput value={spesa.descrizione} onChange={(e) => setSpesa({ ...spesa, descrizione: e.target.value })} required />
              </Field>
            </div>
            <Field label="Categoria">
              <TextInput value={spesa.categoria} onChange={(e) => setSpesa({ ...spesa, categoria: e.target.value })} />
            </Field>
            <Field label="Fornitore">
              <TextInput value={spesa.fornitore} onChange={(e) => setSpesa({ ...spesa, fornitore: e.target.value })} />
            </Field>
            <Field label="Riferimento documento">
              <TextInput value={spesa.riferimento} onChange={(e) => setSpesa({ ...spesa, riferimento: e.target.value })} />
            </Field>
            <div className="field--full">
              <Field label="Note">
                <TextArea value={spesa.note} onChange={(e) => setSpesa({ ...spesa, note: e.target.value })} rows={2} />
              </Field>
            </div>
          </div>
        </form>
      </Modal>

      {/* Rata */}
      <Modal
        open={rataOpen}
        onClose={() => setRataOpen(false)}
        title="Nuova rata"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRataOpen(false)} disabled={busy}>
              Annulla
            </Button>
            <Button onClick={() => void addRata(new Event("submit") as unknown as FormEvent)} loading={busy}>
              Registra rata
            </Button>
          </>
        }
      >
        <form onSubmit={addRata} noValidate>
          {errorModal ? (
            <div className="alert alert--danger" role="alert">
              <div>{errorModal}</div>
            </div>
          ) : null}
          <div className="form-grid">
            <div className="field--full">
              <Field label="Descrizione" required>
                <TextInput value={rata.descrizione} onChange={(e) => setRata({ ...rata, descrizione: e.target.value })} required />
              </Field>
            </div>
            <Field label="Unità">
              <Select value={rata.unitaId} onChange={(e) => setRata({ ...rata, unitaId: e.target.value })}>
                <option value="">Nessuna (rata generale)</option>
                {unita.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.identificativo}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Numero rata">
              <TextInput value={rata.numero} onChange={(e) => setRata({ ...rata, numero: e.target.value })} />
            </Field>
            <Field label="Scadenza" required>
              <TextInput type="date" value={rata.scadenza} onChange={(e) => setRata({ ...rata, scadenza: e.target.value })} required />
            </Field>
            <Field label="Importo (€)" required>
              <TextInput inputMode="decimal" value={rata.importo} onChange={(e) => setRata({ ...rata, importo: e.target.value })} required />
            </Field>
            <div className="field--full">
              <Field label="Criterio di ripartizione" hint="Solo descrittivo: il CRM non applica formule automatiche">
                <TextInput
                  value={rata.criteriRipartizione}
                  onChange={(e) => setRata({ ...rata, criteriRipartizione: e.target.value })}
                  placeholder="Es. millesimi proprietà"
                />
              </Field>
            </div>
            <div className="field--full">
              <Field label="Note">
                <TextArea value={rata.note} onChange={(e) => setRata({ ...rata, note: e.target.value })} rows={2} />
              </Field>
            </div>
          </div>
        </form>
      </Modal>

      {/* Pagamenti */}
      <Modal
        open={Boolean(payFor)}
        onClose={() => {
          setPayFor(null);
          setErrorModal(null);
        }}
        title={`Pagamenti · ${payFor?.descrizione ?? ""}`}
        wide
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setPayFor(null);
                setErrorModal(null);
              }}
            >
              Chiudi
            </Button>
            {!chiuso ? (
              <Button onClick={() => void addPagamento(new Event("submit") as unknown as FormEvent)} loading={busy}>
                Registra pagamento
              </Button>
            ) : null}
          </>
        }
      >
        {payFor ? (
          <>
            <p className="small">
              Importo rata <strong>{formatEuro(payFor.importo)}</strong> · incassato{" "}
              <strong>{formatEuro(payFor.incassato)}</strong> · residuo <strong>{formatEuro(payFor.residuo)}</strong>
            </p>
            <form onSubmit={addPagamento} noValidate>
              {errorModal ? (
                <div className="alert alert--danger" role="alert">
                  <div>{errorModal}</div>
                </div>
              ) : null}
              {!chiuso ? (
                <div className="form-grid">
                  <Field label="Data" required>
                    <TextInput
                      type="date"
                      value={pagamento.data}
                      onChange={(e) => setPagamento({ ...pagamento, data: e.target.value })}
                      required
                    />
                  </Field>
                  <Field label="Importo (€)" required hint={`Residuo: ${formatEuro(payFor.residuo)}`}>
                    <TextInput
                      inputMode="decimal"
                      value={pagamento.importo}
                      onChange={(e) => setPagamento({ ...pagamento, importo: e.target.value })}
                      required
                    />
                  </Field>
                  <Field label="Metodo">
                    <TextInput value={pagamento.metodo} onChange={(e) => setPagamento({ ...pagamento, metodo: e.target.value })} />
                  </Field>
                  <Field label="Riferimento">
                    <TextInput
                      value={pagamento.riferimento}
                      onChange={(e) => setPagamento({ ...pagamento, riferimento: e.target.value })}
                    />
                  </Field>
                </div>
              ) : null}
            </form>
            {data.pagamenti.filter((p) => p.rataId === payFor.id).length === 0 ? (
              <p className="muted small">Nessun pagamento registrato per questa rata.</p>
            ) : (
              <Table caption="Pagamenti della rata">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th className="right">Importo</th>
                    <th>Metodo</th>
                    <th>Riferimento</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.pagamenti
                    .filter((p) => p.rataId === payFor.id)
                    .map((p) => (
                      <tr key={p.id}>
                        <td className="nowrap">{formatDate(p.data)}</td>
                        <td className="right">{formatEuro(p.importo)}</td>
                        <td>{p.metodo ?? "—"}</td>
                        <td>{p.riferimento ?? "—"}</td>
                        <td className="right">
                          {!chiuso ? (
                            <Button variant="ghost" size="sm" onClick={() => setPagamentoToDelete(p.id)}>
                              Elimina
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </Table>
            )}
          </>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        title="Eliminare il periodo?"
        message="Verranno eliminate anche spese e rate collegate. L’operazione è consentita solo sui periodi in bozza e viene registrata nell’audit log."
        confirmLabel="Elimina periodo"
        danger
        loading={busy}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void eliminaPeriodo()}
      />
      <ConfirmDialog
        open={Boolean(spesaToDelete)}
        title="Eliminare la spesa?"
        message="L’operazione è registrata nell’audit log."
        confirmLabel="Elimina"
        danger
        loading={busy}
        onClose={() => setSpesaToDelete(null)}
        onConfirm={() => void removeSpesa()}
      />
      <ConfirmDialog
        open={Boolean(rataToDelete)}
        title="Eliminare la rata?"
        message="Se la rata ha pagamenti registrati, il CRM blocca l’eliminazione."
        confirmLabel="Elimina"
        danger
        loading={busy}
        onClose={() => setRataToDelete(null)}
        onConfirm={() => void removeRata()}
      />
      <ConfirmDialog
        open={Boolean(pagamentoToDelete)}
        title="Eliminare il pagamento?"
        message="Il residuo della rata verrà ricalcolato."
        confirmLabel="Elimina"
        danger
        loading={busy}
        onClose={() => setPagamentoToDelete(null)}
        onConfirm={() => void removePagamento()}
      />
    </>
  );
}
