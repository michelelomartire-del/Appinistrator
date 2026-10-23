import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiRequestError, qs } from "../lib/api";
import { useApiQuery } from "../lib/hooks";
import {
  Badge,
  Banner,
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
import { useCondominioOptions } from "./Condomini";
import type { ConsumoDto, ConsumptionComparison, Paginated } from "@shared/api-types";
import {
  CONSUMO_CATEGORIE,
  CONSUMO_ORIGINI,
  UNITA_MISURA,
  consumoCategoriaLabels,
  consumoOrigineDescrizioni,
  consumoOrigineLabels,
} from "@shared/constants";
import { formatDate, formatEuro, formatNumber, formatPercent } from "@shared/format";

export function Consumi() {
  const [searchParams] = useSearchParams();
  const [condominioId, setCondominioId] = useState(searchParams.get("condominioId") ?? "");
  const [categoria, setCategoria] = useState("");
  const [origine, setOrigine] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [comparison, setComparison] = useState<ConsumptionComparison | null>(null);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState({
    condominioId: "",
    categoria: "acqua",
    periodoDa: "",
    periodoA: "",
    valore: "",
    unitaMisura: "m3",
    costo: "",
    fonte: "",
    origine: "inserito",
    dataRilevazione: "",
    note: "",
  });
  const perPage = 50;
  const { data: condomini } = useCondominioOptions();
  const queryClient = useQueryClient();
  const { notify } = useToast();

  useEffect(() => setPage(1), [condominioId, categoria, origine]);

  const { data, isLoading, error, refetch } = useApiQuery<Paginated<ConsumoDto>>(
    ["consumi", condominioId, categoria, origine, page],
    `/consumi${qs({ condominioId: condominioId || undefined, categoria: categoria || undefined, origine: origine || undefined, page, perPage })}`,
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setErrorModal(null);
    try {
      await api("/consumi", {
        body: {
          condominioId: values.condominioId,
          categoria: values.categoria,
          periodoDa: values.periodoDa,
          periodoA: values.periodoA,
          valore: values.valore,
          unitaMisura: values.unitaMisura,
          costo: values.costo || null,
          fonte: values.fonte || null,
          origine: values.origine,
          dataRilevazione: values.dataRilevazione || null,
          note: values.note || null,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["consumi"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      notify("Consumo registrato.");
      setOpen(false);
      setValues({ ...values, periodoDa: "", periodoA: "", valore: "", costo: "", note: "" });
    } catch (err) {
      setErrorModal(err instanceof ApiRequestError ? err.message : "Salvataggio non riuscito.");
    } finally {
      setBusy(false);
    }
  };

  const apriConfronto = async (consumoId: string) => {
    try {
      const result = await api<{ consumo: ConsumoDto; confronto: ConsumptionComparison }>(`/consumi/${consumoId}`);
      setComparison(result.confronto);
      setComparisonOpen(true);
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : "Confronto non disponibile.", "danger");
    }
  };

  const remove = async (consumoId: string) => {
    if (!window.confirm("Eliminare questa lettura? L’operazione è registrata nell’audit log.")) return;
    try {
      await api(`/consumi/${consumoId}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["consumi"] });
      notify("Consumo eliminato.");
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : "Operazione non riuscita.", "danger");
    }
  };

  return (
    <>
      <PageHeader
        title="Consumi"
        subtitle="Letture e valori aggregati per condominio. I confronti sono mostrati solo tra periodi omogenei."
        actions={
          <Button
            onClick={() => {
              setValues((v) => ({ ...v, condominioId: v.condominioId || condomini?.items[0]?.id || "" }));
              setOpen(true);
            }}
          >
            Nuovo consumo
          </Button>
        }
      />

      <Banner tone="info" title="Origine del dato">
        <span>
          <strong>Inserito</strong>: digitato dallo studio. <strong>Importato</strong>: da importazione dichiarata.{" "}
          <strong>Stimato</strong>: non è una lettura e non viene usato nei confronti.
        </span>
      </Banner>

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
        <Field label="Categoria">
          <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Tutte</option>
            {CONSUMO_CATEGORIE.map((c) => (
              <option key={c} value={c}>
                {consumoCategoriaLabels[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Origine">
          <Select value={origine} onChange={(e) => setOrigine(e.target.value)}>
            <option value="">Tutte</option>
            {CONSUMO_ORIGINI.map((o) => (
              <option key={o} value={o}>
                {consumoOrigineLabels[o]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {isLoading ? <LoadingBlock /> : null}
      {error ? <ErrorBlock message={error.message} onRetry={() => void refetch()} /> : null}

      {data && data.items.length === 0 ? (
        <EmptyState
          icon="🔌"
          title="Nessun consumo registrato"
          description="Registra letture per periodo e categoria. Senza periodi omogenei il CRM non mostra confronti."
          action={
            <Button
              onClick={() => {
                setValues((v) => ({ ...v, condominioId: v.condominioId || condomini?.items[0]?.id || "" }));
                setOpen(true);
              }}
            >
              Nuovo consumo
            </Button>
          }
        />
      ) : null}

      {data && data.items.length > 0 ? (
        <>
          <Table caption="Consumi registrati">
            <thead>
              <tr>
                <th>Condominio</th>
                <th>Categoria</th>
                <th>Periodo</th>
                <th className="right">Valore</th>
                <th className="right">Costo</th>
                <th>Origine</th>
                <th>Fonte</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((consumo) => (
                <tr key={consumo.id}>
                  <td>{consumo.condominio}</td>
                  <td>{stateLabel(consumoCategoriaLabels, consumo.categoria)}</td>
                  <td className="nowrap">
                    {formatDate(consumo.periodoDa)} → {formatDate(consumo.periodoA)}
                  </td>
                  <td className="right nowrap">
                    {formatNumber(consumo.valore, 3)} {consumo.unitaMisura}
                  </td>
                  <td className="right nowrap">{consumo.costo === null ? "—" : formatEuro(consumo.costo)}</td>
                  <td>
                    <Badge value={consumo.origine} label={stateLabel(consumoOrigineLabels, consumo.origine)} />
                  </td>
                  <td>
                    {consumo.fonte ?? "—"}
                    {consumo.dataRilevazione ? <div className="muted small">rilevato {formatDate(consumo.dataRilevazione)}</div> : null}
                  </td>
                  <td className="right nowrap">
                    <Button variant="ghost" size="sm" onClick={() => void apriConfronto(consumo.id)}>
                      Confronta
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void remove(consumo.id)}>
                      Elimina
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} perPage={perPage} total={data.total} onPage={setPage} />
        </>
      ) : null}

      <Card title="Quando un confronto è valido">
        <ul className="small" style={{ paddingLeft: "1.1rem", margin: 0 }}>
          <li>Stessa categoria e stessa unità di misura.</li>
          <li>Periodi non sovrapposti, durata simile (±7 giorni) e distanza massima di 62 giorni.</li>
          <li>Nessuno dei due valori è stimato.</li>
          <li>In tutti gli altri casi il CRM mostra il motivo per cui il confronto non è possibile.</li>
        </ul>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        wide
        title="Nuovo consumo"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Annulla
            </Button>
            <Button onClick={() => void submit(new Event("submit") as unknown as FormEvent)} loading={busy}>
              Registra
            </Button>
          </>
        }
      >
        <form onSubmit={submit} noValidate>
          {errorModal ? (
            <div className="alert alert--danger" role="alert">
              <div>{errorModal}</div>
            </div>
          ) : null}
          <div className="form-grid">
            <div className="field--full">
              <Field label="Condominio" required>
                <Select value={values.condominioId} onChange={(e) => setValues({ ...values, condominioId: e.target.value })} required>
                  <option value="">Seleziona…</option>
                  {condomini?.items.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.denominazione}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Categoria" required>
              <Select value={values.categoria} onChange={(e) => setValues({ ...values, categoria: e.target.value })}>
                {CONSUMO_CATEGORIE.map((c) => (
                  <option key={c} value={c}>
                    {consumoCategoriaLabels[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Unità di misura" required>
              <Select value={values.unitaMisura} onChange={(e) => setValues({ ...values, unitaMisura: e.target.value })}>
                {UNITA_MISURA.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Periodo da" required>
              <TextInput type="date" value={values.periodoDa} onChange={(e) => setValues({ ...values, periodoDa: e.target.value })} required />
            </Field>
            <Field label="Periodo a" required>
              <TextInput type="date" value={values.periodoA} onChange={(e) => setValues({ ...values, periodoA: e.target.value })} required />
            </Field>
            <Field label="Valore" required>
              <TextInput inputMode="decimal" value={values.valore} onChange={(e) => setValues({ ...values, valore: e.target.value })} required />
            </Field>
            <Field label="Costo (€)" hint="Solo se disponibile">
              <TextInput inputMode="decimal" value={values.costo} onChange={(e) => setValues({ ...values, costo: e.target.value })} />
            </Field>
            <Field label="Fonte del dato">
              <TextInput value={values.fonte} onChange={(e) => setValues({ ...values, fonte: e.target.value })} placeholder="Es. bolletta, contatore, gestore" />
            </Field>
            <Field label="Data rilevazione">
              <TextInput type="date" value={values.dataRilevazione} onChange={(e) => setValues({ ...values, dataRilevazione: e.target.value })} />
            </Field>
            <Field label="Origine" hint={consumoOrigineDescrizioni[values.origine as keyof typeof consumoOrigineDescrizioni]}>
              <Select value={values.origine} onChange={(e) => setValues({ ...values, origine: e.target.value })}>
                {CONSUMO_ORIGINI.map((o) => (
                  <option key={o} value={o}>
                    {consumoOrigineLabels[o]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="field--full">
              <Field label="Note">
                <TextArea value={values.note} onChange={(e) => setValues({ ...values, note: e.target.value })} rows={2} />
              </Field>
            </div>
          </div>
        </form>
      </Modal>

      <Modal open={comparisonOpen} onClose={() => setComparisonOpen(false)} title="Confronto consumi">
        {comparison ? (
          <>
            <p className="small">
              {stateLabel(consumoCategoriaLabels, comparison.corrente.categoria)} ·{" "}
              {formatDate(comparison.corrente.periodoDa)} → {formatDate(comparison.corrente.periodoA)}
            </p>
            {comparison.stato === "confrontabile" && comparison.precedente ? (
              <div className="stack">
                <div className="description-list">
                  <div className="description-list__item">
                    <dt>Periodo corrente</dt>
                    <dd>
                      {formatNumber(comparison.corrente.valore, 3)} {comparison.corrente.unitaMisura}
                      {comparison.corrente.costo !== null ? ` · ${formatEuro(comparison.corrente.costo)}` : ""}
                    </dd>
                  </div>
                  <div className="description-list__item">
                    <dt>Periodo precedente</dt>
                    <dd>
                      {formatNumber(comparison.precedente.valore, 3)} {comparison.precedente.unitaMisura} (
                      {formatDate(comparison.precedente.periodoDa)} → {formatDate(comparison.precedente.periodoA)})
                    </dd>
                  </div>
                  <div className="description-list__item">
                    <dt>Differenza</dt>
                    <dd>
                      {comparison.differenza !== null ? `${formatNumber(comparison.differenza, 3)} ${comparison.corrente.unitaMisura}` : "—"}{" "}
                      {comparison.variazionePercentuale !== null ? `(${formatPercent(comparison.variazionePercentuale)})` : ""}
                    </dd>
                  </div>
                </div>
                <Badge tone="success" label="Confronto valido: periodi omogenei" />
              </div>
            ) : (
              <Banner tone="warning" title="Confronto non disponibile">
                {comparison.motivo ?? "I dati non sono omogenei."}
              </Banner>
            )}
          </>
        ) : null}
      </Modal>
    </>
  );
}
